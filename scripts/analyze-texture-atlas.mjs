import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const ROOT = process.cwd();
const INPUT_CANDIDATES = [
  path.join(ROOT, 'public', 'textures.webp'),
  path.join(ROOT, 'public', 'textures.jpg'),
];
const OUTPUT_MANIFEST = path.join(ROOT, 'public', 'textures.manifest.json');
const OUTPUT_SHEET = path.join(ROOT, 'public', 'textures-contact-sheet.png');

const GRID = 10;

function getCellBounds(index, size) {
  const start = Math.round((index / GRID) * size);
  const end = Math.round(((index + 1) / GRID) * size);
  return {
    start,
    end,
    size: Math.max(1, end - start),
  };
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function rgbToHsl(r, g, b) {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;
  const d = max - min;
  if (d !== 0) {
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      default:
        h = (r - g) / d + 4;
        break;
    }
    h /= 6;
  }
  return { h: h * 360, s, l };
}

function hueName(h) {
  if (h < 20 || h >= 340) return 'red';
  if (h < 45) return 'orange';
  if (h < 70) return 'yellow';
  if (h < 160) return 'green';
  if (h < 210) return 'cyan';
  if (h < 255) return 'blue';
  if (h < 300) return 'purple';
  return 'magenta';
}

function classifyCell(stats) {
  const { brightness, saturation, hue, contrast, edgeDensity } = stats;
  const tone = hueName(hue);

  if (brightness < 0.18 && contrast > 0.20) return { category: 'shadow', tags: ['dark', 'shadowed', 'high-contrast'] };
  if (tone === 'orange' || tone === 'red') {
    if (brightness < 0.35) return { category: 'wood', tags: ['wood', 'warm', 'furniture'] };
    return { category: 'tile', tags: ['warm-surface', 'ceramic', 'paint'] };
  }
  if (tone === 'yellow' && saturation > 0.2) return { category: 'wood', tags: ['wood', 'warm', 'floor'] };
  if (tone === 'green') return { category: 'fabric', tags: ['fabric', 'cloth', 'soft-surface'] };
  if (tone === 'blue' || tone === 'cyan') return { category: 'tile', tags: ['tile', 'cool-surface', 'ceramic'] };
  if (saturation < 0.12) {
    if (brightness > 0.72) return { category: 'plaster', tags: ['wall', 'paint', 'light-surface'] };
    if (brightness > 0.48) return { category: 'concrete', tags: ['concrete', 'stone', 'neutral-surface'] };
    return { category: 'metal', tags: ['metal', 'steel', 'neutral-surface'] };
  }
  if (edgeDensity > 0.12) return { category: 'patterned', tags: ['patterned', 'decorative', 'busy'] };
  return { category: 'generic', tags: ['generic-surface', 'unclassified'] };
}

function scoreKitchenFit(stats, classification) {
  const { category } = classification;
  const { brightness, saturation, contrast, edgeDensity } = stats;
  let score = 0.5;

  if (category === 'wood') score += 0.3;
  if (category === 'plaster') score += 0.2;
  if (category === 'tile') score += 0.15;
  if (category === 'metal') score += 0.08;
  if (category === 'patterned' || category === 'shadow') score -= 0.2;

  if (brightness > 0.2 && brightness < 0.8) score += 0.1;
  if (saturation < 0.12) score += 0.08;
  if (contrast > 0.18) score += 0.05;
  if (edgeDensity > 0.16) score -= 0.1;

  return clamp(score, 0, 1);
}

function buildDescription(index, stats, classification, score) {
  const { category, tags } = classification;
  const tone = hueName(stats.hue);
  return `Cell ${index}: ${category} with ${tone} bias, ${Math.round(stats.brightness * 100)}% brightness, kitchen fit ${Math.round(score * 100)}%.`;
}

async function main() {
  const INPUT = await resolveInput();
  const image = sharp(INPUT, { failOn: 'none' });
  const metadata = await image.metadata();
  if (!metadata.width || !metadata.height) {
    throw new Error(`Invalid atlas dimensions for ${INPUT}`);
  }

  const manifest = {
    source: path.basename(INPUT),
    grid: {
      columns: GRID,
      rows: GRID,
      width: metadata.width,
      height: metadata.height,
      nominalCellWidth: metadata.width / GRID,
      nominalCellHeight: metadata.height / GRID,
    },
    cells: [],
  };

  const sheets = [];
  const canvasWidth = GRID * 220;
  const canvasHeight = GRID * 220;
  const labelSheet = sharp({
    create: {
      width: canvasWidth,
      height: canvasHeight,
      channels: 4,
      background: { r: 20, g: 20, b: 20, alpha: 1 },
    },
  });

  for (let row = 0; row < GRID; row += 1) {
    for (let col = 0; col < GRID; col += 1) {
      const index = row * GRID + col;
      const xBounds = getCellBounds(col, metadata.width);
      const yBounds = getCellBounds(row, metadata.height);
      const cell = await image.clone().extract({
        left: xBounds.start,
        top: yBounds.start,
        width: xBounds.size,
        height: yBounds.size,
      }).raw().toBuffer({ resolveWithObject: true });

      const data = cell.data;
      let sumR = 0;
      let sumG = 0;
      let sumB = 0;
      let sumLuma = 0;
      let sumLuma2 = 0;
      let edgeCount = 0;
      let sampleCount = xBounds.size * yBounds.size;
      let validSamples = 0;

      for (let y = 0; y < yBounds.size; y += 1) {
        for (let x = 0; x < xBounds.size; x += 1) {
          const i = (y * xBounds.size + x) * 3;
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];
          const luma = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;

          sumR += r;
          sumG += g;
          sumB += b;
          sumLuma += luma;
          sumLuma2 += luma * luma;
          validSamples += 1;

          if (x > 0) {
            const leftI = (y * xBounds.size + (x - 1)) * 3;
            const lr = data[leftI];
            const lg = data[leftI + 1];
            const lb = data[leftI + 2];
            const leftLuma = (0.2126 * lr + 0.7152 * lg + 0.0722 * lb) / 255;
            if (Math.abs(luma - leftLuma) > 0.18) edgeCount += 1;
          }
          if (y > 0) {
            const upI = ((y - 1) * xBounds.size + x) * 3;
            const ur = data[upI];
            const ug = data[upI + 1];
            const ub = data[upI + 2];
            const upLuma = (0.2126 * ur + 0.7152 * ug + 0.0722 * ub) / 255;
            if (Math.abs(luma - upLuma) > 0.18) edgeCount += 1;
          }
        }
      }

      const avgR = sumR / validSamples;
      const avgG = sumG / validSamples;
      const avgB = sumB / validSamples;
      const avg = rgbToHsl(avgR, avgG, avgB);
      const brightness = sumLuma / validSamples;
      const variance = Math.max(0, (sumLuma2 / validSamples) - (brightness * brightness));
      const contrast = Math.sqrt(variance);
      const edgeDensity = edgeCount / sampleCount;
      const stats = {
        averageColor: {
          r: Math.round(avgR),
          g: Math.round(avgG),
          b: Math.round(avgB),
        },
        hue: Number(avg.h.toFixed(1)),
        saturation: Number(avg.s.toFixed(3)),
        lightness: Number(avg.l.toFixed(3)),
        brightness: Number(brightness.toFixed(3)),
        contrast: Number(contrast.toFixed(3)),
        edgeDensity: Number(edgeDensity.toFixed(3)),
      };
      const classification = classifyCell(stats);
      const kitchenFit = Number(scoreKitchenFit(stats, classification).toFixed(3));
      const description = buildDescription(index, stats, classification, kitchenFit);

      const cellEntry = {
        index,
        row,
        col,
        bounds: {
          x0: xBounds.start,
          y0: yBounds.start,
          x1: xBounds.end,
          y1: yBounds.end,
          width: xBounds.size,
          height: yBounds.size,
        },
        uv: {
          u0: Number((xBounds.start / metadata.width).toFixed(4)),
          v0: Number((yBounds.start / metadata.height).toFixed(4)),
          u1: Number((xBounds.end / metadata.width).toFixed(4)),
          v1: Number((yBounds.end / metadata.height).toFixed(4)),
        },
        stats,
        classification,
        kitchenFit,
        description,
        tags: [...classification.tags],
      };

      manifest.cells.push(cellEntry);

      const preview = sharp(cell.data, {
        raw: {
          width: xBounds.size,
          height: yBounds.size,
          channels: 3,
        },
      }).resize(180, 180, { fit: 'contain' });

      const tile = await preview.png().toBuffer();
      const x = col * 220 + 20;
      const y = row * 220 + 20;
      sheets.push({
        input: tile,
        left: x,
        top: y,
      });

      const overlay = Buffer.from(`
        <svg width="220" height="220" xmlns="http://www.w3.org/2000/svg">
          <rect x="0" y="0" width="220" height="220" fill="rgba(0,0,0,0)" />
          <rect x="18" y="18" width="184" height="184" rx="8" fill="rgba(255,255,255,0.05)" stroke="rgba(255,255,255,0.22)" />
          <text x="26" y="20" fill="#ffd97a" font-size="14" font-family="monospace">#${index.toString().padStart(2, '0')} ${classification.category}</text>
          <text x="26" y="200" fill="#c9d7e2" font-size="11" font-family="monospace">fit ${Math.round(kitchenFit * 100)}%</text>
        </svg>
      `);
      sheets.push({
        input: overlay,
        left: col * 220,
        top: row * 220,
      });
    }
  }

  await fs.writeFile(OUTPUT_MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`);
  await labelSheet.composite(sheets).png().toFile(OUTPUT_SHEET);

  console.log(`Wrote ${OUTPUT_MANIFEST}`);
  console.log(`Wrote ${OUTPUT_SHEET}`);
}

async function resolveInput() {
  for (const candidate of INPUT_CANDIDATES) {
    try {
      await fs.access(candidate);
      return candidate;
    } catch {
      // Try the next atlas candidate.
    }
  }

  throw new Error(`No texture atlas found. Checked: ${INPUT_CANDIDATES.map((file) => path.basename(file)).join(', ')}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
