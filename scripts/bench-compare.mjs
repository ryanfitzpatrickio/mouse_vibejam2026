#!/usr/bin/env node
/**
 * Compare bench-results.json to a baseline JSON (fail on regression).
 *
 *   npm run bench:compare
 *   node scripts/bench-compare.mjs bench/baseline.json bench-results.json
 *
 * Env overrides:
 *   BENCH_TICK_P95_MAX_MULT (default 1.15) — fail if results / baseline > this
 *   BENCH_TICK_MEAN_MAX_MULT (default 1.2)
 */

import fs from 'node:fs';
import process from 'node:process';

const P95_MULT = Number(process.env.BENCH_TICK_P95_MAX_MULT ?? 1.15);
const MEAN_MULT = Number(process.env.BENCH_TICK_MEAN_MAX_MULT ?? 1.2);

function readJson(path) {
  return JSON.parse(fs.readFileSync(path, 'utf8'));
}

function main() {
  const baselinePath = process.argv[2] ?? 'bench/baseline.json';
  const resultsPath = process.argv[3] ?? 'bench-results.json';

  const baseline = readJson(baselinePath);
  const results = readJson(resultsPath);

  const bs = baseline.server;
  const rs = results.server;
  const failures = [];

  if (!rs) {
    console.error('[bench-compare] results.server missing — run with BENCH_METRICS_TOKEN and a running PartyKit server.');
    process.exit(1);
  }

  if (bs?.tickMsP95 > 0 && rs.tickMsP95 > bs.tickMsP95 * P95_MULT) {
    failures.push(`tickMsP95 ${rs.tickMsP95} > baseline ${bs.tickMsP95} × ${P95_MULT}`);
  }
  if (bs?.tickMsMean > 0 && rs.tickMsMean > bs.tickMsMean * MEAN_MULT) {
    failures.push(`tickMsMean ${rs.tickMsMean} > baseline ${bs.tickMsMean} × ${MEAN_MULT}`);
  }

  if (failures.length) {
    console.error('[bench-compare] FAILED');
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }

  // eslint-disable-next-line no-console
  console.log('[bench-compare] OK (server tick within baseline multipliers)');
}

main();
