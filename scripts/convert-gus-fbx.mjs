#!/usr/bin/env node
/**
 * Convert gus.fbx + Mixamo locomotion FBX files into a single GLB. Mirrors
 * convert-jerry-fbx.mjs — Gus is assumed to share the Mixamo skeleton used by
 * the other collection-unlock hero models.
 *
 * Reads:
 *   public/models/gus.fbx        — base mesh + skeleton + embedded texture
 *   assets/source/<anim>.fbx     — animation-only FBX files (explicit allowlist)
 *
 * Writes:
 *   assets/source/custom/gus.glb (picked up by optimize-custom-glbs.mjs)
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
const BASE_FBX = path.resolve('public/models/gus.fbx');
const OUTPUT = path.resolve('assets/source/custom/gus.glb');

const ANIM_FILES = [
  ['idle.fbx', 'idle'],
  ['jump.fbx', 'jump'],
  ['walking.fbx', 'walk'],
  ['running.fbx', 'run'],
  ['left strafe walking.fbx', 'strafe-walk-left'],
  ['right strafe walking.fbx', 'strafe-walk-right'],
  ['left strafe.fbx', 'strafe-left'],
  ['right strafe.fbx', 'strafe-right'],
  ['left turn.fbx', 'turn-left'],
  ['right turn.fbx', 'turn-right'],
  ['left turn 90.fbx', 'turn-left-90'],
  ['right turn 90.fbx', 'turn-right-90'],
];

async function main() {
  if (!fs.existsSync(BASE_FBX)) {
    console.log(`No base mesh at ${BASE_FBX}, skipping gus conversion.`);
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

  const seenNames = new Set(scene.animations.map((a) => a.name));

  const stripRootMotion = (clip) => {
    clip.tracks = clip.tracks.filter((t) => {
      if (!t.name.endsWith('.position')) return true;
      const bone = t.name.slice(0, -('.position'.length));
      return !/hips?$|root$/i.test(bone);
    });
  };

  for (const [file, clipName] of ANIM_FILES) {
    const filePath = path.join(SOURCE_DIR, file);
    if (!fs.existsSync(filePath)) {
      console.warn(`  missing: ${file}`);
      continue;
    }
    let finalName = clipName;
    if (seenNames.has(finalName)) {
      let i = 2;
      while (seenNames.has(`${clipName}-${i}`)) i++;
      finalName = `${clipName}-${i}`;
    }
    try {
      const buf = fs.readFileSync(filePath);
      const group = loader.parse(buf.buffer, '');
      if (!group.animations?.length) {
        console.log(`  skip (no animation): ${file}`);
        continue;
      }
      const clip = group.animations[0];
      clip.name = finalName;
      stripRootMotion(clip);
      scene.animations.push(clip);
      seenNames.add(finalName);
      console.log(`  + ${finalName}  (${clip.tracks.length} tracks, ${clip.duration.toFixed(2)}s)  ← ${file}`);
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
    const texture = doc.createTexture('gus-diffuse')
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
