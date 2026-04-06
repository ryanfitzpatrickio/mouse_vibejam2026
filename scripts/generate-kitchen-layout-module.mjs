#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { isAssetBuildUpToDate, markAssetBuildCurrent } from './build-cache.mjs';

const ROOT = process.cwd();
const INPUT = path.join(ROOT, 'public', 'levels', 'kitchen-layout.json');
const OUTPUT = path.join(ROOT, 'shared', 'kitchen-layout.generated.js');

const CACHE_NAME = 'generate-kitchen-layout-module';

if (await isAssetBuildUpToDate({
  cacheName: CACHE_NAME,
  inputs: [INPUT, path.join(ROOT, 'scripts', 'generate-kitchen-layout-module.mjs'), path.join(ROOT, 'scripts', 'build-cache.mjs')],
  outputs: [OUTPUT],
})) {
  console.log(`Skipped ${path.relative(ROOT, OUTPUT)} (up to date)`);
  process.exit(0);
}

const layout = JSON.parse(fs.readFileSync(INPUT, 'utf8'));
const source = `// Auto-generated from public/levels/kitchen-layout.json. Do not edit directly.\nexport default ${JSON.stringify(layout, null, 2)};\n`;

fs.writeFileSync(OUTPUT, source);
await markAssetBuildCurrent({
  cacheName: CACHE_NAME,
  inputs: [INPUT, path.join(ROOT, 'scripts', 'generate-kitchen-layout-module.mjs'), path.join(ROOT, 'scripts', 'build-cache.mjs')],
});
console.log(`Wrote ${path.relative(ROOT, OUTPUT)}`);
