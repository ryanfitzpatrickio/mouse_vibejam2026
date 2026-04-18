#!/usr/bin/env node
/**
 * Convert bunny.fbx + animation FBX files into a single GLB with all
 * animations embedded and the original texture preserved.
 *
 * Usage:
 *   node scripts/convert-bunny-fbx.mjs
 *
 * Reads:
 *   assets/source/bunny.fbx          — base mesh + skeleton + embedded texture
 *   assets/source/*.fbx              — animation-only FBX files
 *
 * Writes:
 *   public/bunny.glb
 */
import fs from 'node:fs';
import path from 'node:path';

// ── Node polyfills required by Three.js browser-only code ──────────────
import { Blob } from 'node:buffer';

// Capture embedded image blobs extracted by FBXLoader.
const capturedImageBlobs = [];

globalThis.window = {
  URL: {
    createObjectURL: (blob) => {
      capturedImageBlobs.push(blob);
      return `blob:captured-${capturedImageBlobs.length - 1}`;
    },
  },
};
globalThis.Blob = Blob;
globalThis.self = globalThis;

const noop = () => {};
const stubElement = () => ({
  style: {},
  addEventListener: noop,
  removeEventListener: noop,
  setAttribute: noop,
  getAttribute: () => null,
  getContext: () => null,
});
globalThis.document = { createElementNS: stubElement, createElement: stubElement };
globalThis.Image = class Image {
  addEventListener(e, cb) { if (e === 'load') setTimeout(cb, 0); }
  set src(_v) {}
};
globalThis.ImageBitmap = class {};
globalThis.FileReader = class FileReader {
  readAsArrayBuffer(blob) {
    blob.arrayBuffer().then((buf) => {
      this.result = buf;
      if (this.onloadend) this.onloadend({ target: this });
      if (this.onload) this.onload({ target: this });
    }).catch((err) => {
      if (this.onerror) this.onerror(err);
    });
  }
};

// ── Three.js imports ───────────────────────────────────────────────────
import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';

// ── gltf-transform (for injecting the texture into the GLB) ───────────
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import sharp from 'sharp';

// Skip texture image decode in Node — we capture raw bytes separately.
THREE.TextureLoader.prototype.load = function (_url, onLoad) {
  const tex = new THREE.Texture();
  if (onLoad) onLoad(tex);
  return tex;
};

// ── Config ─────────────────────────────────────────────────────────────
const SOURCE_DIR = path.resolve('assets/source');
const BASE_FBX = path.join(SOURCE_DIR, 'bunny.fbx');
const OUTPUT = path.resolve('public/bunny.glb');

const ANIMATION_NAME_MAP = {
  'mutant idle': 'idle',
  'mutant idle (2)': 'idle-long',
  'mutant run': 'run',
  'mutant walking': 'walk',
  'mutant jumping': 'jump',
  'mutant jumping (2)': 'jump-long',
  'mutant dying': 'death',
  'mutant punch': 'punch',
  'mutant swiping': 'swipe',
  'mutant roaring': 'roar',
  'mutant breathing idle': 'breathing-idle',
  'mutant flexing muscles': 'flex',
  'mutant left turn 45': 'turn-left-45',
  'mutant right turn 45': 'turn-right-45',
  'mutant right turn 45 (2)': 'turn-right-45-alt',
  'mutant right turn 90': 'turn-right-90',
  'jump attack': 'jump-attack',
  'left turn 45': 'turn-left-45-alt',
};

// ── Main ───────────────────────────────────────────────────────────────
async function main() {
  const loader = new FBXLoader();

  // 1. Load base mesh (populates capturedImageBlobs via createObjectURL hook)
  console.log('Loading base mesh:', BASE_FBX);
  capturedImageBlobs.length = 0;
  const baseBuf = fs.readFileSync(BASE_FBX);
  const scene = loader.parse(baseBuf.buffer, '');

  // Extract the embedded texture
  let textureBuffer = null;
  let textureMime = 'image/png';
  if (capturedImageBlobs.length > 0) {
    const blob = capturedImageBlobs[0];
    textureBuffer = Buffer.from(await blob.arrayBuffer());
    textureMime = blob.type || 'image/png';
    console.log(`  Embedded texture: ${(textureBuffer.length / 1024).toFixed(0)} KB (${textureMime})`);
  }

  // Replace materials — strip textures so GLTFExporter doesn't try to canvas-render them.
  scene.traverse((child) => {
    if (!child.isMesh || !child.material) return;
    const mats = Array.isArray(child.material) ? child.material : [child.material];
    const replaced = mats.map((m) => {
      const mat = new THREE.MeshStandardMaterial({ color: m.color || 0xffffff });
      mat.name = m.name;
      return mat;
    });
    child.material = replaced.length === 1 ? replaced[0] : replaced;
  });

  if (scene.animations.length > 0) {
    scene.animations[0].name = 'base-pose';
  }

  // 2. Load animation FBX files
  const animFiles = fs.readdirSync(SOURCE_DIR)
    .filter((f) => f.endsWith('.fbx') && f !== 'bunny.fbx' && f !== 'cop.fbx')
    .sort();

  const seenNames = new Set(scene.animations.map((a) => a.name));

  for (const file of animFiles) {
    const stem = file.replace('.fbx', '');
    let clipName = ANIMATION_NAME_MAP[stem] ?? stem;

    if (seenNames.has(clipName)) {
      let i = 2;
      while (seenNames.has(`${clipName}-${i}`)) i++;
      clipName = `${clipName}-${i}`;
    }

    try {
      const buf = fs.readFileSync(path.join(SOURCE_DIR, file));
      const group = loader.parse(buf.buffer, '');
      if (!group.animations?.length) {
        console.log(`  skip (no animation): ${file}`);
        continue;
      }
      const clip = group.animations[0];
      clip.name = clipName;
      scene.animations.push(clip);
      seenNames.add(clipName);
      console.log(`  + ${clipName}  (${clip.tracks.length} tracks, ${clip.duration.toFixed(2)}s)  ← ${file}`);
    } catch (err) {
      console.warn(`  SKIP (parse error): ${file} — ${err.message.slice(0, 80)}`);
    }
  }

  console.log(`\nTotal animations: ${scene.animations.length}`);

  // 3. Export GLB (without texture — will be injected next)
  console.log('Exporting GLB (skeleton + animations)...');
  const glb = await new Promise((resolve, reject) => {
    const exporter = new GLTFExporter();
    exporter.parse(scene, resolve, reject, {
      binary: true,
      animations: scene.animations,
    });
  });

  const tempGlb = Buffer.from(glb);
  console.log(`  Intermediate GLB: ${(tempGlb.length / 1024).toFixed(0)} KB`);

  // 4. Inject the embedded texture via gltf-transform
  if (textureBuffer) {
    console.log('Injecting texture into GLB...');

    // FBX textures use flipY (top-down rows) but glTF expects bottom-up.
    // The GLTFExporter wrote UVs as-is (FBX orientation) since we stripped
    // the map, so we flip the image to match.
    console.log('  Flipping texture vertically & converting to PNG...');
    const flippedPng = await sharp(textureBuffer).flip().png().toBuffer();
    console.log(`  Flipped texture: ${(flippedPng.length / 1024).toFixed(0)} KB`);

    const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
    const doc = await io.readBinary(new Uint8Array(tempGlb));

    const root = doc.getRoot();
    const texture = doc.createTexture('bunny-diffuse')
      .setImage(new Uint8Array(flippedPng))
      .setMimeType('image/png');

    for (const mat of root.listMaterials()) {
      mat.setBaseColorTexture(texture);
    }

    const finalGlb = await io.writeBinary(doc);
    fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
    fs.writeFileSync(OUTPUT, Buffer.from(finalGlb));
    console.log(`Written: ${OUTPUT}  (${(finalGlb.byteLength / 1024).toFixed(1)} KB)`);
  } else {
    console.log('No texture found — writing GLB without texture.');
    fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
    fs.writeFileSync(OUTPUT, tempGlb);
    console.log(`Written: ${OUTPUT}  (${(tempGlb.length / 1024).toFixed(1)} KB)`);
  }
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
