#!/usr/bin/env node
/**
 * Transcode ambient bed sources to compact AAC (.m4a) for the web build.
 *
 * Source masters live in assets/source/audio/ (any of .wav, .flac, .mp3, .m4a, .ogg).
 * Outputs go to public/assets/*.m4a (loaded by AudioManager).
 *
 * Requires ffmpeg on PATH. OGG/Opus can be smaller, but AAC-in-M4A has the fewest
 * playback gaps across browsers (especially Safari / iOS).
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs/promises';
import path from 'node:path';
import { isAssetBuildUpToDate, markAssetBuildCurrent } from './build-cache.mjs';

const execFileAsync = promisify(execFile);

const ROOT = process.cwd();
const SOURCE_DIR = path.join(ROOT, 'assets', 'source', 'audio');
const OUT_DIR = path.join(ROOT, 'public', 'assets');
const SCRIPT_PATH = path.join(ROOT, 'scripts', 'optimize-ambient-audio.mjs');
const CACHE_HELPER = path.join(ROOT, 'scripts', 'build-cache.mjs');

/** Logical name (file stem) → output filename under public/assets/ */
const JOBS = [
  { stem: 'cartoon saturn', outFile: 'cartoon saturn.m4a' },
  { stem: 'corn dog alarm', outFile: 'corn dog alarm.m4a' },
];

const SOURCE_EXTS = ['.wav', '.flac', '.mp3', '.m4a', '.ogg'];

/** Mono + moderate bitrate: small download; bump via env AMBIENT_AAC_BITRATE if needed. */
const BITRATE = process.env.AMBIENT_AAC_BITRATE || '72k';
const SAMPLE_RATE = process.env.AMBIENT_AAC_HZ || '44100';

async function ffmpegAvailable() {
  try {
    await execFileAsync('ffmpeg', ['-hide_banner', '-version'], { windowsHide: true });
    return true;
  } catch {
    return false;
  }
}

async function resolveSource(stem) {
  for (const ext of SOURCE_EXTS) {
    const p = path.join(SOURCE_DIR, `${stem}${ext}`);
    try {
      await fs.access(p);
      return p;
    } catch {
      /* try next */
    }
  }
  return null;
}

async function transcode(inputPath, outputPath) {
  const args = [
    '-hide_banner',
    '-loglevel', 'error',
    '-y',
    '-i', inputPath,
    '-vn',
    '-map_metadata', '-1',
    '-c:a', 'aac',
    '-profile:a', 'aac_low',
    '-b:a', BITRATE,
    '-ac', '1',
    '-ar', SAMPLE_RATE,
    '-movflags', '+faststart',
    outputPath,
  ];
  await execFileAsync('ffmpeg', args, { windowsHide: true });
}

async function main() {
  const resolved = [];
  for (const job of JOBS) {
    const inputPath = await resolveSource(job.stem);
    if (!inputPath) continue;
    resolved.push({ ...job, inputPath });
  }

  if (!resolved.length) {
    console.log('No ambient sources in assets/source/audio/; skipping ambient transcode.');
    return;
  }

  if (!(await ffmpegAvailable())) {
    console.error(
      'ffmpeg is required to transcode ambient audio (install ffmpeg and ensure it is on PATH).',
    );
    process.exit(1);
  }

  await fs.mkdir(OUT_DIR, { recursive: true });

  for (const job of resolved) {
    const outputPath = path.join(OUT_DIR, job.outFile);
    const inputs = [job.inputPath, SCRIPT_PATH, CACHE_HELPER];
    if (await isAssetBuildUpToDate({
      cacheName: `optimize-ambient-${job.stem.replace(/\s+/g, '-')}`,
      inputs,
      outputs: [outputPath],
    })) {
      console.log(`Skipped ${path.relative(ROOT, outputPath)} (up to date)`);
      continue;
    }

    const inStat = await fs.stat(job.inputPath);
    console.log(`Transcoding ${path.relative(ROOT, job.inputPath)} → ${path.relative(ROOT, outputPath)}`);
    await transcode(job.inputPath, outputPath);
    const outStat = await fs.stat(outputPath);
    console.log(
      `  ${(inStat.size / 1024).toFixed(0)} KB → ${(outStat.size / 1024).toFixed(0)} KB (AAC ${BITRATE}, mono, ${SAMPLE_RATE} Hz)`,
    );

    await markAssetBuildCurrent({
      cacheName: `optimize-ambient-${job.stem.replace(/\s+/g, '-')}`,
      inputs,
      outputs: [outputPath],
    });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
