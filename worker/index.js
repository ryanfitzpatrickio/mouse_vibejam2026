const GLOBAL_STATS_KEY = 'stats:v1:global';
const PLAYER_KEY_PREFIX = 'stats:v1:player:';

const GLOBAL_INCREMENT_FIELDS = Object.freeze([
  'totalConnections',
  'totalDeaths',
  'totalRespawns',
  'totalCatHits',
  'totalPlaySeconds',
]);

const PLAYER_INCREMENT_FIELDS = Object.freeze([
  'sessions',
  'deaths',
  'respawns',
  'catHitsTaken',
  'playSeconds',
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
  };
}

function createPlayerStats(playerHash, now = Date.now()) {
  return {
    version: 1,
    playerHash,
    firstSeen: now,
    lastSeen: now,
    sessions: 0,
    deaths: 0,
    respawns: 0,
    catHitsTaken: 0,
    playSeconds: 0,
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

  const players = Array.isArray(payload.players) ? payload.players : [];
  let acceptedPlayers = 0;
  for (const incoming of players) {
    if (!isPlayerHash(incoming?.playerHash)) continue;

    const playerKey = `${PLAYER_KEY_PREFIX}${incoming.playerHash}`;
    let player = await readJson(kv, playerKey);
    if (!player) {
      player = createPlayerStats(incoming.playerHash, incoming.firstSeen || now);
      global.uniquePlayers += 1;
    }

    applyIncrements(player, incoming.delta, PLAYER_INCREMENT_FIELDS);
    if (Number.isFinite(incoming.firstSeen) && incoming.firstSeen > 0) {
      player.firstSeen = Math.min(player.firstSeen, incoming.firstSeen);
    }
    if (Number.isFinite(incoming.lastSeen) && incoming.lastSeen > 0) {
      player.lastSeen = Math.max(player.lastSeen, incoming.lastSeen);
    } else {
      player.lastSeen = Math.max(player.lastSeen, now);
    }

    await writeJson(kv, playerKey, player);
    acceptedPlayers += 1;
  }

  global.updatedAt = now;
  await writeJson(kv, GLOBAL_STATS_KEY, global);

  return json({
    ok: true,
    acceptedPlayers,
    updatedAt: global.updatedAt,
  });
}

async function handleStatsSummary(request, env) {
  if (!env.GAME_STATS) {
    return json({ error: 'GAME_STATS KV binding is not configured' }, 503);
  }

  const url = new URL(request.url);
  const admin = env.STATS_ADMIN_TOKEN;
  const collector = env.STATS_COLLECTOR_TOKEN;
  const expectedToken = (typeof admin === 'string' && admin.trim() !== '')
    ? admin
    : (typeof collector === 'string' && collector.trim() !== '' ? collector : '');

  if (!expectedToken) {
    return json({ error: 'STATS_ADMIN_TOKEN or STATS_COLLECTOR_TOKEN must be configured' }, 503);
  }

  const queryToken = url.searchParams.get('token') ?? '';
  if (!authorize(request, expectedToken) && queryToken !== expectedToken) {
    return json({ error: 'Unauthorized' }, 401);
  }

  const summary = await readJson(env.GAME_STATS, GLOBAL_STATS_KEY) ?? createGlobalStats();
  return json({
    ...summary,
    storage: 'cloudflare-kv',
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/api/stats/event' && request.method === 'POST') {
      return handleStatsEvent(request, env);
    }

    if (url.pathname === '/api/stats' && request.method === 'GET') {
      return handleStatsSummary(request, env);
    }

    if (url.pathname.startsWith('/api/')) {
      return json({ error: 'Not found' }, 404);
    }

    if (env.ASSETS) {
      return env.ASSETS.fetch(request);
    }

    return new Response('Not found', { status: 404 });
  },
};
