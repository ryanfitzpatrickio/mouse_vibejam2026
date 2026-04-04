#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const INPUT = path.join(ROOT, 'public', 'levels', 'kitchen-layout.json');
const OUTPUT = path.join(ROOT, 'shared', 'kitchen-layout.generated.js');

const layout = JSON.parse(fs.readFileSync(INPUT, 'utf8'));
const source = `// Auto-generated from public/levels/kitchen-layout.json. Do not edit directly.\nexport default ${JSON.stringify(layout, null, 2)};\n`;

fs.writeFileSync(OUTPUT, source);
console.log(`Wrote ${path.relative(ROOT, OUTPUT)}`);
