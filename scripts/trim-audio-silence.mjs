#!/usr/bin/env node
/**
 * Dev-only: trim leading/trailing silence from runtime audio using ffmpeg.
 *
 * Scans:
 *   - public/assets/
 *   - assets/source/audio/
 *
 * Re-encodes (filters require decode) with format-appropriate codecs; originals are
 * replaced only after a successful pass. Use --dry-run to list files only.
 *
 * Env:
 *   TRIM_SILENCE_DB     Threshold below which audio counts as silence (default -45)
 *   TRIM_SILENCE_MIN_SEC Minimum contiguous silence to trim, seconds (default 0.08)
 *   TRIM_LEADING_ONLY   If "1", only trim the start (keeps trailing pad for loop tails)
 *
 * Refuses when NODE_ENV=production unless you pass --force.
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs/promises';
import path from 'node:path';

const execFileAsync = promisify(execFile);

const ROOT = process.cwd();
const SCAN_DIRS = [
  path.join(ROOT, 'public', 'assets'),
  path.join(ROOT, 'assets', 'source', 'audio'),
];

const AUDIO_EXT = new Set(['.mp3', '.m4a', '.wav', '.ogg', '.flac']);

async function ffmpegAvailable() {
  try {
    await execFileAsync('ffmpeg', ['-hide_banner', '-version'], { windowsHide: true });
    return true;
  } catch {
    return false;
  }
}

async function ffprobeDuration(filePath) {
  try {
    const { stdout } = await execFileAsync(
      'ffprobe',
      [
        '-v',
        'error',
        '-show_entries',
        'format=duration',
        '-of',
        'default=noprint_wrappers=1:nokey=1',
        filePath,
      ],
      { windowsHide: true },
    );
    const n = Number.parseFloat(String(stdout).trim());
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

function buildSilenceFilter(thresholdDb, minSec, leadingOnly) {
  const t = `${thresholdDb}dB`;
  const d = String(minSec);
  const one = `silenceremove=start_periods=1:start_duration=${d}:start_threshold=${t}:detection=peak:start_mode=any`;
  if (leadingOnly) return one;
  return `${one},areverse,${one},areverse`;
}

function encodeArgsForExt(ext) {
  switch (ext) {
    case '.mp3':
      return ['-c:a', 'libmp3lame', '-q:a', '2'];
    case '.m4a':
      return ['-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart'];
    case '.wav':
      return ['-c:a', 'pcm_s16le'];
    case '.ogg':
      return ['-c:a', 'libvorbis', '-q:a', '6'];
    case '.flac':
      return ['-c:a', 'flac'];
    default:
      return ['-c:a', 'libmp3lame', '-q:a', '2'];
  }
}

async function collectAudioFiles(dir) {
  const out = [];
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const ent of entries) {
    if (ent.name.startsWith('.') || ent.name === 'Thumbs.db') continue;
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      out.push(...(await collectAudioFiles(full)));
      continue;
    }
    const ext = path.extname(ent.name).toLowerCase();
    if (AUDIO_EXT.has(ext)) out.push(full);
  }
  return out;
}

async function trimFile(filePath, { dryRun, filter }) {
  const ext = path.extname(filePath).toLowerCase();
  const base = path.basename(filePath);
  const before = await ffprobeDuration(filePath);
  if (before === null) {
    console.warn(`  skip (could not read duration): ${base}`);
    return { ok: false, base };
  }

  if (dryRun) {
    console.log(`  would trim: ${base} (${before.toFixed(3)}s)`);
    return { ok: true, base, dryRun: true };
  }

  const tmp = `${filePath}.trim-tmp${ext}`;
  const enc = encodeArgsForExt(ext);

  try {
    await fs.unlink(tmp);
  } catch {
    /* none */
  }

  try {
    await execFileAsync(
      'ffmpeg',
      [
        '-hide_banner',
        '-loglevel',
        'error',
        '-y',
        '-i',
        filePath,
        '-vn',
        '-af',
        filter,
        ...enc,
        tmp,
      ],
      { windowsHide: true },
    );
  } catch (e) {
    console.warn(`  ffmpeg failed: ${base}`, e?.message || e);
    try {
      await fs.unlink(tmp);
    } catch {
      /* */
    }
    return { ok: false, base };
  }

  const after = await ffprobeDuration(tmp);
  if (after === null || after < 0.015) {
    console.warn(`  skip (bad output duration): ${base}`);
    try {
      await fs.unlink(tmp);
    } catch {
      /* */
    }
    return { ok: false, base };
  }

  await fs.rename(tmp, filePath);
  const saved = before - after;
  const pct = before > 0 ? ((100 * saved) / before).toFixed(1) : '0';
  console.log(`  ${base}: ${before.toFixed(3)}s → ${after.toFixed(3)}s (−${pct}%)`);
  return { ok: true, base };
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const dryRun = args.has('--dry-run');
  const force = args.has('--force');

  if (process.env.NODE_ENV === 'production' && !force) {
    console.error(
      '[trim-audio] Refusing to run with NODE_ENV=production (dev-only). Use --force to override.',
    );
    process.exit(1);
  }

  if (!(await ffmpegAvailable())) {
    console.error('[trim-audio] ffmpeg not found on PATH.');
    process.exit(1);
  }

  const thresholdDb = Number.parseFloat(process.env.TRIM_SILENCE_DB ?? '-45');
  const minSec = Number.parseFloat(process.env.TRIM_SILENCE_MIN_SEC ?? '0.08');
  const leadingOnly = process.env.TRIM_LEADING_ONLY === '1';

  const filter = buildSilenceFilter(thresholdDb, minSec, leadingOnly);

  const files = [];
  for (const dir of SCAN_DIRS) {
    files.push(...(await collectAudioFiles(dir)));
  }
  const unique = [...new Set(files)].sort();

  if (!unique.length) {
    console.log('[trim-audio] No audio files under public/assets/ or assets/source/audio/.');
    return;
  }

  console.log(
    `[trim-audio] ${dryRun ? 'DRY RUN — ' : ''}${unique.length} file(s); threshold ${thresholdDb} dB, min silence ${minSec}s${
      leadingOnly ? ', leading edge only' : ''
    }`,
  );

  let ok = 0;
  for (const fp of unique) {
    const r = await trimFile(fp, { dryRun, filter });
    if (r.ok) ok += 1;
  }

  console.log(`[trim-audio] Done (${ok}/${unique.length}).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
