#!/usr/bin/env node
/**
 * Convert cop.fbx + animation FBX files into a single GLB with all
 * animations embedded and the original texture preserved.
 *
 * Reads:
 *   assets/source/cop.fbx   — base mesh + skeleton + embedded texture
 *   assets/source/*.fbx     — animation-only FBX files (excluding base meshes)
 *
 * Writes:
 *   assets/source/custom/cop.glb  (picked up by optimize-custom-glbs.mjs)
 */
import fs from 'node:fs';
import path from 'node:path';
import { Blob } from 'node:buffer';

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

import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import sharp from 'sharp';

THREE.TextureLoader.prototype.load = function (_url, onLoad) {
  const tex = new THREE.Texture();
  if (onLoad) onLoad(tex);
  return tex;
};

const SOURCE_DIR = path.resolve('assets/source');
const BASE_FBX = path.join(SOURCE_DIR, 'cop.fbx');
const OUTPUT = path.resolve('assets/source/custom/cop.glb');

// Base meshes to exclude from the animation FBX glob. The brain hero has its
// own converter (convert-brain-fbx.mjs) — skip its base + locomotion clips so
// they don't get silently appended to the cop's animation list.
const EXCLUDE_FBX = new Set([
  'cop.fbx',
  'bunny.fbx',
  'brain.fbx',
  'idle.fbx',
  'jump.fbx',
  'walking.fbx',
  'running.fbx',
  'left strafe.fbx',
  'right strafe.fbx',
  'left strafe walking.fbx',
  'right strafe walking.fbx',
  'left turn.fbx',
  'right turn.fbx',
  'left turn 90.fbx',
  'right turn 90.fbx',
]);

const ANIMATION_NAME_MAP = {
  'mutant idle': 'idle',
  'mutant idle (2)': 'idle-long',
  'mutant walking': 'walk',
  'mutant breathing idle': 'breathing-idle',
  'mutant left turn 45': 'turn-left-45',
  'mutant right turn 45': 'turn-right-45',
  'mutant right turn 45 (2)': 'turn-right-45-alt',
  'mutant right turn 90': 'turn-right-90',
  'left turn 45': 'turn-left-45-alt',
  'meme': 'meme',
  'injured idle': 'injured-idle',
  'injured hurting idle': 'injured-hurting-idle',
  'injured stumble idle': 'injured-stumble-idle',
  'injured wave idle': 'injured-wave-idle',
  'injured walk': 'injured-walk',
  'injured walk backwards': 'injured-walk-backwards',
  'injured walk left turn': 'injured-walk-left-turn',
  'injured walk right turn': 'injured-walk-right-turn',
  'injured run': 'injured-run',
  'injured run backwards': 'injured-run-backwards',
  'injured run left turn': 'injured-run-left-turn',
  'injured run right turn': 'injured-run-right-turn',
  'injured run backwards left turn': 'injured-run-backwards-left-turn',
  'injured run backwards right turn': 'injured-run-backwards-right-turn',
  'injured run jump': 'injured-run-jump',
  'injured standing jump': 'injured-standing-jump',
  'injured turn left': 'injured-turn-left',
  'injured turn right': 'injured-turn-right',
  'injured backwards turn left': 'injured-backwards-turn-left',
  'injured backwards turn right': 'injured-backwards-turn-right',
};

async function main() {
  if (!fs.existsSync(BASE_FBX)) {
    console.log(`No base mesh at ${BASE_FBX}, skipping cop conversion.`);
    return;
  }

  const loader = new FBXLoader();

  console.log('Loading base mesh:', BASE_FBX);
  capturedImageBlobs.length = 0;
  const baseBuf = fs.readFileSync(BASE_FBX);
  const scene = loader.parse(baseBuf.buffer, '');

  let textureBuffer = null;
  let textureMime = 'image/png';
  if (capturedImageBlobs.length > 0) {
    const blob = capturedImageBlobs[0];
    textureBuffer = Buffer.from(await blob.arrayBuffer());
    textureMime = blob.type || 'image/png';
    console.log(`  Embedded texture: ${(textureBuffer.length / 1024).toFixed(0)} KB (${textureMime})`);
  }

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

  const animFiles = fs.readdirSync(SOURCE_DIR)
    .filter((f) => f.endsWith('.fbx') && !EXCLUDE_FBX.has(f))
    .sort();

  const seenNames = new Set(scene.animations.map((a) => a.name));

  // Strip hip/root position tracks: Mixamo bakes root motion + vertical hip
  // drift into translation tracks, which causes the mesh to clip through the
  // ground and move out of sync with our code-driven locomotion. Removing
  // them locks the pelvis to its bind-pose position (in-place animation).
  const stripRootMotion = (clip) => {
    clip.tracks = clip.tracks.filter((t) => {
      if (!t.name.endsWith('.position')) return true;
      const bone = t.name.slice(0, -('.position'.length));
      return !/hips?$|root$/i.test(bone);
    });
  };

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
      // Keep hip motion for the meme clip — it's a mocap that reads
      // naturally with its original root trajectory.
      if (clipName !== 'meme') stripRootMotion(clip);
      scene.animations.push(clip);
      seenNames.add(clipName);
      console.log(`  + ${clipName}  (${clip.tracks.length} tracks, ${clip.duration.toFixed(2)}s)  ← ${file}`);
    } catch (err) {
      console.warn(`  SKIP (parse error): ${file} — ${err.message.slice(0, 80)}`);
    }
  }

  console.log(`\nTotal animations: ${scene.animations.length}`);

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

  fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });

  if (textureBuffer) {
    console.log('Injecting texture into GLB...');
    const flippedPng = await sharp(textureBuffer).flip().png().toBuffer();

    const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
    const doc = await io.readBinary(new Uint8Array(tempGlb));
    const root = doc.getRoot();
    const texture = doc.createTexture('cop-diffuse')
      .setImage(new Uint8Array(flippedPng))
      .setMimeType('image/png');

    for (const mat of root.listMaterials()) {
      mat.setBaseColorTexture(texture);
    }

    const finalGlb = await io.writeBinary(doc);
    fs.writeFileSync(OUTPUT, Buffer.from(finalGlb));
    console.log(`Written: ${OUTPUT}  (${(finalGlb.byteLength / 1024).toFixed(1)} KB)`);
  } else {
    fs.writeFileSync(OUTPUT, tempGlb);
    console.log(`Written: ${OUTPUT}  (${(tempGlb.length / 1024).toFixed(1)} KB)`);
  }
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
