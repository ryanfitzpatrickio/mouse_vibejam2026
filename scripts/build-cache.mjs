#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.cwd();
const CACHE_DIR = path.join(ROOT, '.cache', 'asset-build');

function normalizePaths(paths = []) {
  return [...new Set(paths.flat().filter(Boolean).map((value) => path.resolve(value)))].sort();
}

async function snapshotFile(filePath) {
  const stat = await fs.stat(filePath);
  return {
    path: path.resolve(filePath),
    mtimeMs: Math.round(stat.mtimeMs),
    size: stat.size,
  };
}

async function loadCache(cacheName) {
  const cachePath = path.join(CACHE_DIR, `${cacheName}.json`);
  try {
    const data = await fs.readFile(cachePath, 'utf8');
    return JSON.parse(data);
  } catch {
    return null;
  }
}

async function saveCache(cacheName, payload) {
  await fs.mkdir(CACHE_DIR, { recursive: true });
  const cachePath = path.join(CACHE_DIR, `${cacheName}.json`);
  await fs.writeFile(cachePath, `${JSON.stringify(payload, null, 2)}\n`);
}

export async function isAssetBuildUpToDate({
  cacheName,
  inputs = [],
  outputs = [],
}) {
  const normalizedInputs = normalizePaths(inputs);
  const normalizedOutputs = normalizePaths(outputs);

  if (!normalizedOutputs.length) {
    return false;
  }

  for (const output of normalizedOutputs) {
    try {
      await fs.access(output);
    } catch {
      return false;
    }
  }

  const cache = await loadCache(cacheName);
  if (!cache) {
    return false;
  }

  let currentInputs;
  try {
    currentInputs = await Promise.all(normalizedInputs.map((filePath) => snapshotFile(filePath)));
  } catch {
    return false;
  }

  const cachedInputs = cache.inputs ?? [];
  if (cachedInputs.length !== currentInputs.length) {
    return false;
  }

  for (let index = 0; index < currentInputs.length; index += 1) {
    const current = currentInputs[index];
    const cached = cachedInputs[index];
    if (!cached || cached.path !== current.path || cached.mtimeMs !== current.mtimeMs || cached.size !== current.size) {
      return false;
    }
  }

  return true;
}

export async function markAssetBuildCurrent({
  cacheName,
  inputs = [],
}) {
  const normalizedInputs = normalizePaths(inputs);
  const snapshots = [];

  for (const filePath of normalizedInputs) {
    snapshots.push(await snapshotFile(filePath));
  }

  await saveCache(cacheName, {
    inputs: snapshots,
  });
}
