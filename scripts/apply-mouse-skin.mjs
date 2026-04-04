import fs from 'node:fs/promises';
import path from 'node:path';

const DEFAULT_RIGGED = 'public/mouse.glb';
const DEFAULT_SKIN = 'public/mouse-skin.glb';
const DEFAULT_OUTPUT = 'public/mouse-skinned.glb';

function parseArgs(argv) {
  const options = {
    rigged: DEFAULT_RIGGED,
    skin: DEFAULT_SKIN,
    output: DEFAULT_OUTPUT,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];

    if (arg === '--rigged' && next) {
      options.rigged = next;
      i += 1;
      continue;
    }

    if (arg === '--skin' && next) {
      options.skin = next;
      i += 1;
      continue;
    }

    if ((arg === '--out' || arg === '--output') && next) {
      options.output = next;
      i += 1;
      continue;
    }

    if (arg === '--help' || arg === '-h') {
      options.help = true;
    }
  }

  return options;
}

function printHelp() {
  console.log(`Usage:
  node scripts/apply-mouse-skin.mjs [--rigged public/mouse.glb] [--skin public/mouse-skin.glb] [--out public/mouse-skinned.glb]

The script keeps the rigged mouse skeleton and animations, then copies the
material and embedded texture payloads from mouse-skin.glb into a new GLB.`);
}

function parseGlb(buffer) {
  if (buffer.toString('utf8', 0, 4) !== 'glTF') {
    throw new Error('Input is not a GLB file.');
  }

  const version = buffer.readUInt32LE(4);
  if (version !== 2) {
    throw new Error(`Unsupported GLB version: ${version}`);
  }

  let offset = 12;
  let json = null;
  let bin = null;

  while (offset < buffer.length) {
    const chunkLength = buffer.readUInt32LE(offset);
    const chunkType = buffer.toString('utf8', offset + 4, offset + 8);
    const chunkData = buffer.subarray(offset + 8, offset + 8 + chunkLength);

    if (chunkType === 'JSON') {
      const jsonText = chunkData.toString('utf8').replace(/\0+$/u, '');
      json = JSON.parse(jsonText);
    } else if (chunkType === 'BIN\u0000') {
      bin = Buffer.from(chunkData);
    }

    offset += 8 + chunkLength;
  }

  if (!json || !bin) {
    throw new Error('GLB is missing a JSON or BIN chunk.');
  }

  return { json, bin };
}

function alignBuffer(buffer, multiple = 4, fill = 0x00) {
  const remainder = buffer.length % multiple;
  if (remainder === 0) return buffer;
  return Buffer.concat([buffer, Buffer.alloc(multiple - remainder, fill)]);
}

function clone(value) {
  return structuredClone(value);
}

function buildCombinedGlb(rigged, skin) {
  const resultJson = clone(rigged.json);
  const skinJson = skin.json;

  if (!Array.isArray(resultJson.buffers) || resultJson.buffers.length === 0) {
    throw new Error('Rigged GLB does not define a buffer.');
  }

  if (!Array.isArray(skinJson.images) || skinJson.images.length === 0) {
    throw new Error('Skin GLB does not define any images.');
  }

  const newBinParts = [Buffer.from(rigged.bin)];
  const appendedBufferViews = [];
  let currentLength = rigged.bin.length;

  for (const image of skinJson.images) {
    const sourceView = skinJson.bufferViews?.[image.bufferView];
    if (!sourceView) {
      throw new Error(`Skin image references missing bufferView ${image.bufferView}.`);
    }

    const sourceOffset = sourceView.byteOffset ?? 0;
    const sourceLength = sourceView.byteLength ?? 0;
    const imageBytes = skin.bin.subarray(sourceOffset, sourceOffset + sourceLength);

    const padding = (4 - (currentLength % 4)) % 4;
    if (padding > 0) {
      newBinParts.push(Buffer.alloc(padding, 0x00));
      currentLength += padding;
    }

    const byteOffset = currentLength;
    appendedBufferViews.push({
      buffer: 0,
      byteOffset,
      byteLength: imageBytes.length,
    });
    newBinParts.push(Buffer.from(imageBytes));
    currentLength += imageBytes.length;
  }

  const bin = alignBuffer(Buffer.concat(newBinParts));
  const firstAppendedBufferView = resultJson.bufferViews?.length ?? 0;

  resultJson.bufferViews = [...(resultJson.bufferViews ?? []), ...appendedBufferViews];
  resultJson.images = skinJson.images.map((image, index) => ({
    ...clone(image),
    bufferView: firstAppendedBufferView + index,
  }));
  resultJson.textures = clone(skinJson.textures ?? []);
  resultJson.samplers = clone(skinJson.samplers ?? resultJson.samplers ?? []);
  resultJson.materials = clone(skinJson.materials ?? []);
  resultJson.buffers[0].byteLength = bin.length;

  if (Array.isArray(resultJson.meshes)) {
    for (const mesh of resultJson.meshes) {
      for (const primitive of mesh.primitives ?? []) {
        primitive.material = 0;
      }
    }
  }

  return { json: resultJson, bin };
}

function encodeGlb({ json, bin }) {
  const jsonBytes = Buffer.from(JSON.stringify(json), 'utf8');
  const paddedJson = alignBuffer(jsonBytes, 4, 0x20);
  const paddedBin = alignBuffer(bin, 4, 0x00);

  const headerLength = 12;
  const jsonChunkLength = 8 + paddedJson.length;
  const binChunkLength = 8 + paddedBin.length;
  const totalLength = headerLength + jsonChunkLength + binChunkLength;

  const out = Buffer.alloc(totalLength);
  let offset = 0;

  out.write('glTF', offset, 4, 'utf8');
  offset += 4;
  out.writeUInt32LE(2, offset);
  offset += 4;
  out.writeUInt32LE(totalLength, offset);
  offset += 4;

  out.writeUInt32LE(paddedJson.length, offset);
  offset += 4;
  out.write('JSON', offset, 4, 'utf8');
  offset += 4;
  paddedJson.copy(out, offset);
  offset += paddedJson.length;

  out.writeUInt32LE(paddedBin.length, offset);
  offset += 4;
  out.write('BIN\u0000', offset, 4, 'utf8');
  offset += 4;
  paddedBin.copy(out, offset);

  return out;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  const [riggedBuffer, skinBuffer] = await Promise.all([
    fs.readFile(options.rigged),
    fs.readFile(options.skin),
  ]);

  const combined = buildCombinedGlb(parseGlb(riggedBuffer), parseGlb(skinBuffer));
  const outputBuffer = encodeGlb(combined);

  const outputPath = path.resolve(options.output);
  await fs.mkdir(path.dirname(outputPath), { recursive: true });

  const tempPath = `${outputPath}.tmp`;
  await fs.writeFile(tempPath, outputBuffer);
  await fs.rename(tempPath, outputPath);

  console.log(`Wrote ${outputPath}`);
  console.log(`  rigged: ${options.rigged}`);
  console.log(`  skin:   ${options.skin}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
