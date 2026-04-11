const GLOBAL_STATS_KEY = 'stats:v1:global';
const UNIQUE_PLAYER_BUCKET_COUNT = 8192;
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval' https://vibejam.cc https://vibej.am https://static.cloudflareinsights.com",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://vibejam.cc https://vibej.am https://static.cloudflareinsights.com https://cloudflareinsights.com",
  "media-src 'self' blob:",
  "connect-src 'self' blob: https://vibejam.cc https://vibej.am https://static.cloudflareinsights.com https://cloudflareinsights.com wss://*.partykit.dev wss://*.partykit.io wss://localhost:* ws://localhost:* http://localhost:*",
  "worker-src 'self' blob:",
  "font-src 'self' data:",
  "frame-src https://vibejam.cc https://vibej.am",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'none'",
  "manifest-src 'self'",
  'upgrade-insecure-requests',
].join('; ');

const SECURITY_HEADERS = Object.freeze({
  'Content-Security-Policy': CONTENT_SECURITY_POLICY,
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), serial=(), bluetooth=(), fullscreen=(self), gamepad=(self)',
});

const HSTS_HEADER = 'max-age=31536000; includeSubDomains; preload';

const GLOBAL_INCREMENT_FIELDS = Object.freeze([
  'totalConnections',
  'totalDeaths',
  'totalRespawns',
  'totalCatHits',
  'totalPlaySeconds',
]);

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  });
}

function isLocalHostname(hostname) {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
}

function withSecurityHeaders(response, request) {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    headers.set(key, value);
  }

  const url = new URL(request.url);
  if (url.protocol === 'https:' && !isLocalHostname(url.hostname)) {
    headers.set('Strict-Transport-Security', HSTS_HEADER);
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function createGlobalStats(now = Date.now()) {
  return {
    version: 1,
    createdAt: now,
    updatedAt: now,
    totalConnections: 0,
    uniquePlayers: 0,
    peakConcurrent: 0,
    totalDeaths: 0,
    totalRespawns: 0,
    totalCatHits: 0,
    totalPlaySeconds: 0,
    uniquePlayerBase: 0,
    uniquePlayerBucketCount: UNIQUE_PLAYER_BUCKET_COUNT,
    uniquePlayerBuckets: '',
  };
}

async function readJson(kv, key) {
  const value = await kv.get(key);
  return value ? JSON.parse(value) : null;
}

async function writeJson(kv, key, value) {
  await kv.put(key, JSON.stringify(value));
}

function getBearerToken(request) {
  const authHeader = request.headers.get('Authorization') ?? '';
  return authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
}

function authorize(request, expectedToken) {
  return Boolean(expectedToken) && getBearerToken(request) === expectedToken;
}

function safePositiveInteger(value) {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.round(value);
}

function isPlayerHash(value) {
  return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
}

function decodeBitset(value, bitCount) {
  const byteLength = Math.ceil(bitCount / 8);
  const bytes = new Uint8Array(byteLength);
  if (typeof value !== 'string' || value === '') return bytes;

  try {
    const binary = atob(value);
    for (let i = 0; i < Math.min(binary.length, byteLength); i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
  } catch {}
  return bytes;
}

function encodeBitset(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function playerHashBucket(playerHash, bitCount) {
  return Number.parseInt(playerHash.slice(0, 12), 16) % bitCount;
}

function markBit(bytes, bitIndex) {
  const byteIndex = Math.floor(bitIndex / 8);
  const mask = 1 << (bitIndex % 8);
  const wasSet = (bytes[byteIndex] & mask) !== 0;
  bytes[byteIndex] |= mask;
  return !wasSet;
}

function estimateBitsetCardinality(bytes, bitCount) {
  let zeroes = 0;
  for (let bitIndex = 0; bitIndex < bitCount; bitIndex += 1) {
    const byteIndex = Math.floor(bitIndex / 8);
    const mask = 1 << (bitIndex % 8);
    if ((bytes[byteIndex] & mask) === 0) zeroes += 1;
  }
  if (zeroes === 0) return bitCount;
  return Math.round(-bitCount * Math.log(zeroes / bitCount));
}

function applyUniquePlayerEstimate(global, playerHashes) {
  const hadBuckets = typeof global.uniquePlayerBuckets === 'string' && global.uniquePlayerBuckets !== '';
  const bitCount = safePositiveInteger(global.uniquePlayerBucketCount ?? UNIQUE_PLAYER_BUCKET_COUNT) || UNIQUE_PLAYER_BUCKET_COUNT;
  const base = safePositiveInteger(global.uniquePlayerBase ?? (hadBuckets ? 0 : global.uniquePlayers));
  const buckets = decodeBitset(global.uniquePlayerBuckets, bitCount);
  let changed = false;

  for (const playerHash of playerHashes) {
    changed = markBit(buckets, playerHashBucket(playerHash, bitCount)) || changed;
  }

  if (!changed && hadBuckets) return;

  global.uniquePlayerBase = base;
  global.uniquePlayerBucketCount = bitCount;
  global.uniquePlayerBuckets = encodeBitset(buckets);
  global.uniquePlayers = base + estimateBitsetCardinality(buckets, bitCount);
}

function applyIncrements(target, source, fields) {
  for (const field of fields) {
    target[field] += safePositiveInteger(source?.[field] ?? 0);
  }
}

async function handleStatsEvent(request, env) {
  if (!env.GAME_STATS) {
    return json({ error: 'GAME_STATS KV binding is not configured' }, 503);
  }

  if (!authorize(request, env.STATS_COLLECTOR_TOKEN)) {
    return json({ error: 'Unauthorized' }, 401);
  }

  let payload;
  try {
    payload = await request.json();
  } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }

  if (payload?.type !== 'stats-delta' || payload.version !== 1) {
    return json({ error: 'Invalid stats event' }, 400);
  }

  const kv = env.GAME_STATS;
  const now = Date.now();
  const global = await readJson(kv, GLOBAL_STATS_KEY) ?? createGlobalStats(now);

  applyIncrements(global, payload.global, GLOBAL_INCREMENT_FIELDS);
  global.peakConcurrent = Math.max(
    global.peakConcurrent,
    safePositiveInteger(payload.global?.peakConcurrent ?? 0),
  );

  const acceptedPlayerHashes = [];
  const players = Array.isArray(payload.players) ? payload.players : [];
  for (const incoming of players) {
    if (isPlayerHash(incoming?.playerHash)) {
      acceptedPlayerHashes.push(incoming.playerHash);
    }
  }
  applyUniquePlayerEstimate(global, acceptedPlayerHashes);

  global.updatedAt = now;
  await writeJson(kv, GLOBAL_STATS_KEY, global);

  return json({
    ok: true,
    acceptedPlayers: acceptedPlayerHashes.length,
    updatedAt: global.updatedAt,
  });
}

async function handleStatsSummary(request, env) {
  if (!env.GAME_STATS) {
    return json({ error: 'GAME_STATS KV binding is not configured' }, 503);
  }

  const admin = env.STATS_ADMIN_TOKEN;
  const collector = env.STATS_COLLECTOR_TOKEN;
  const expectedToken = (typeof admin === 'string' && admin.trim() !== '')
    ? admin
    : (typeof collector === 'string' && collector.trim() !== '' ? collector : '');

  if (!expectedToken) {
    return json({ error: 'STATS_ADMIN_TOKEN or STATS_COLLECTOR_TOKEN must be configured' }, 503);
  }

  if (!authorize(request, expectedToken)) {
    return json({ error: 'Unauthorized' }, 401);
  }

  const summary = await readJson(env.GAME_STATS, GLOBAL_STATS_KEY) ?? createGlobalStats();
  const {
    uniquePlayerBase,
    uniquePlayerBucketCount,
    uniquePlayerBuckets,
    ...publicSummary
  } = summary;
  return json({
    ...publicSummary,
    storage: 'cloudflare-kv',
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    let response;

    if (url.pathname === '/api/stats/event' && request.method === 'POST') {
      response = await handleStatsEvent(request, env);
    } else if (url.pathname === '/api/stats' && request.method === 'GET') {
      response = await handleStatsSummary(request, env);
    } else if (url.pathname.startsWith('/api/')) {
      response = json({ error: 'Not found' }, 404);
    } else if (env.ASSETS) {
      response = await env.ASSETS.fetch(request);
    } else {
      response = new Response('Not found', { status: 404 });
    }

    return withSecurityHeaders(response, request);
  },
};
