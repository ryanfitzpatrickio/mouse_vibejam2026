#!/usr/bin/env node
/**
 * Optimize mouse-skinned.glb for production.
 *
 * Steps:
 *  1. Resize embedded textures to a sensible ceiling.
 *  2. Convert embedded textures to WebP.
 *  3. Resample and deduplicate animation data.
 *  4. Quantize mesh geometry (position, normal, UV).
 *  5. Apply meshopt compression (geometry + animation).
 *  6. Write an optimized GLB used by production builds.
 */
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import {
  dedup,
  prune,
  quantize,
  resample,
  meshopt,
  textureCompress,
} from '@gltf-transform/functions';
import sharp from 'sharp';
import { MeshoptEncoder } from 'meshoptimizer';
import path from 'node:path';
import fs from 'node:fs';
import { isAssetBuildUpToDate, markAssetBuildCurrent } from './build-cache.mjs';

const INPUT = path.resolve('assets/source/mouse-skinned.glb');
const OUTPUT = path.resolve('public/mouse-skinned.optimized.glb');

async function main() {
  const scriptPath = path.join(process.cwd(), 'scripts', 'optimize-glb.mjs');
  if (await isAssetBuildUpToDate({
    cacheName: 'optimize-glb',
    inputs: [INPUT, scriptPath, path.join(process.cwd(), 'scripts', 'build-cache.mjs')],
    outputs: [OUTPUT],
  })) {
    console.log(`Skipped ${OUTPUT} (up to date)`);
    return;
  }

  await MeshoptEncoder.ready;

  const io = new NodeIO()
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
  const document = await io.read(INPUT);

  const inputSize = fs.statSync(INPUT).size;
  console.log(`Input: ${(inputSize / 1024).toFixed(0)} KB`);

  // Log what we're working with
  const root = document.getRoot();
  const textures = root.listTextures();
  console.log(`Textures: ${textures.length}`);
  for (const tex of textures) {
    const img = tex.getImage();
    console.log(`  ${tex.getName() || '(unnamed)'}: ${tex.getMimeType()} ${img ? (img.byteLength / 1024).toFixed(0) + ' KB' : 'no data'}`);
  }
  const meshes = root.listMeshes();
  console.log(`Meshes: ${meshes.length}`);
  const animations = root.listAnimations();
  console.log(`Animations: ${animations.length}`);

  // 1. Compress textures to WebP and downsize them.
  console.log('\n> Compressing textures to WebP...');
  await document.transform(
    textureCompress({
      encoder: sharp,
      targetFormat: 'webp',
      resize: [512, 512],
      quality: 72,
      effort: 6,
      nearLossless: true,
    }),
  );

  // 2. Deduplicate
  console.log('> Deduplicating...');
  await document.transform(dedup());

  // 3. Prune unused data.
  console.log('> Pruning...');
  await document.transform(prune());

  // 4. Resample animations (remove redundant keyframes).
  console.log('> Resampling animations...');
  await document.transform(resample());

  // 5. Quantize geometry and animation.
  console.log('> Quantizing...');
  await document.transform(
    quantize({
      quantizePosition: 14,
      quantizeNormal: 10,
      quantizeTexcoord: 12,
    }),
  );

  // 6. Apply meshopt compression.
  console.log('> Applying meshopt compression...');
  await document.transform(
    meshopt({
      encoder: MeshoptEncoder,
      level: 'high',
    }),
  );

  // 7. Write output.
  console.log('> Writing optimized GLB...');
  await io.write(OUTPUT, document);

  await markAssetBuildCurrent({
    cacheName: 'optimize-glb',
    inputs: [INPUT, scriptPath, path.join(process.cwd(), 'scripts', 'build-cache.mjs')],
  });

  const outputSize = fs.statSync(OUTPUT).size;
  console.log(`\nOutput: ${(outputSize / 1024).toFixed(0)} KB`);
  console.log(`Saved: ${((1 - outputSize / inputSize) * 100).toFixed(1)}%`);
  console.log(`Wrote: ${OUTPUT}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
