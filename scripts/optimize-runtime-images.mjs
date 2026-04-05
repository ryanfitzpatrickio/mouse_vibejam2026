#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const ROOT = process.cwd();
const SOURCES = [
  {
    input: path.join(ROOT, 'assets', 'source', 'textures.webp'),
    output: path.join(ROOT, 'public', 'textures.optimized.webp'),
    width: 1536,
    quality: 62,
    nearLossless: false,
    label: 'textures atlas',
  },
  {
    input: path.join(ROOT, 'assets', 'source', 'eyeset1.jpg'),
    output: path.join(ROOT, 'public', 'eyeset1.optimized.webp'),
    width: 1920,
    quality: 60,
    nearLossless: false,
    label: 'eye atlas',
  },
];

async function optimizeImage({ input, output, width, quality, nearLossless, label }) {
  const exists = await fs
    .access(input)
    .then(() => true)
    .catch(() => false);

  if (!exists) {
    throw new Error(`Missing source image: ${input}`);
  }

  const sourceSize = (await fs.stat(input)).size;
  const image = sharp(input, { failOn: 'none' }).rotate();
  const metadata = await image.metadata();

  let pipeline = image;
  if (metadata.width && metadata.width > width) {
    pipeline = pipeline.resize({ width, withoutEnlargement: true, fit: 'inside' });
  }

  await pipeline
    .webp({
      quality,
      effort: 6,
      nearLossless,
    })
    .toFile(output);

  const outputSize = (await fs.stat(output)).size;
  console.log(`${label}: ${(sourceSize / 1024).toFixed(0)} KB -> ${(outputSize / 1024).toFixed(0)} KB`);
}

async function main() {
  await fs.mkdir(path.join(ROOT, 'public'), { recursive: true });
  for (const entry of SOURCES) {
    await optimizeImage(entry);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
