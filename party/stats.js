const STATS_KV_BINDING = 'GAME_STATS';
const GLOBAL_STATS_KEY = 'stats:v1:global';
const PLAYER_KEY_PREFIX = 'stats:v1:player:';
const FLUSH_DELAY_MS = 60000;
const COLLECTOR_TIMEOUT_MS = 3000;
const LEADERBOARD_LIMIT = 10;

const GLOBAL_DELTA_FIELDS = Object.freeze([
  'totalConnections',
  'totalDeaths',
  'totalRespawns',
  'totalCatHits',
  'totalPlaySeconds',
]);

const PLAYER_DELTA_FIELDS = Object.freeze([
  'sessions',
  'deaths',
  'respawns',
  'catHitsTaken',
  'playSeconds',
]);

function createGlobalStats() {
  const now = Date.now();
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
    leaderboards: createLeaderboards(),
  };
}

function createPlayerStats(playerHash, displayName = 'Mouse') {
  const now = Date.now();
  return {
    version: 1,
    playerHash,
    displayName: normalizeDisplayName(displayName),
    firstSeen: now,
    lastSeen: now,
    sessions: 0,
    deaths: 0,
    respawns: 0,
    catHitsTaken: 0,
    playSeconds: 0,
    bestChaseSeconds: 0,
    bestCheeseHeld: 0,
  };
}

function createGlobalDelta() {
  return {
    totalConnections: 0,
    peakConcurrent: 0,
    totalDeaths: 0,
    totalRespawns: 0,
    totalCatHits: 0,
    totalPlaySeconds: 0,
  };
}

function createPlayerDelta(playerHash) {
  return {
    playerHash,
    displayName: null,
    bestChaseSeconds: null,
    bestCheeseHeld: null,
    delta: {
      sessions: 0,
      deaths: 0,
      respawns: 0,
      catHitsTaken: 0,
      playSeconds: 0,
    },
    firstSeen: null,
    lastSeen: null,
  };
}

function hasGlobalDelta(delta) {
  return delta.peakConcurrent > 0 || GLOBAL_DELTA_FIELDS.some((field) => delta[field] > 0);
}

function hasPlayerDelta(playerDelta) {
  return PLAYER_DELTA_FIELDS.some((field) => playerDelta.delta[field] > 0);
}

function hasPlayerUpdate(playerDelta) {
  return hasPlayerDelta(playerDelta)
    || playerDelta.bestChaseSeconds != null
    || playerDelta.bestCheeseHeld != null;
}

function normalizeDisplayName(value) {
  const name = String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 24);
  return name || 'Mouse';
}

function createLeaderboards() {
  return {
    bestChase: [],
    bestCheeseHeld: [],
  };
}

function ensureLeaderboards(global) {
  if (!global.leaderboards || typeof global.leaderboards !== 'object') {
    global.leaderboards = createLeaderboards();
  }
  if (!Array.isArray(global.leaderboards.bestChase)) global.leaderboards.bestChase = [];
  if (!Array.isArray(global.leaderboards.bestCheeseHeld)) global.leaderboards.bestCheeseHeld = [];
  return global.leaderboards;
}

function publicLeaderboardEntry(entry) {
  return {
    displayName: normalizeDisplayName(entry?.displayName),
    value: Number(entry?.value) || 0,
    updatedAt: Number(entry?.updatedAt) || 0,
  };
}

function publicLeaderboards(global) {
  const leaderboards = ensureLeaderboards(global);
  const cap = (arr) => (Array.isArray(arr) ? arr.slice(0, LEADERBOARD_LIMIT) : []);
  return {
    bestChase: cap(leaderboards.bestChase).map(publicLeaderboardEntry),
    bestCheeseHeld: cap(leaderboards.bestCheeseHeld).map(publicLeaderboardEntry),
  };
}

function upsertLeaderboardEntry(global, boardName, { playerHash, displayName, value, updatedAt = Date.now() }) {
  if (!isValidPlayerKey(playerHash) && !/^[a-f0-9]{64}$/.test(String(playerHash ?? ''))) return false;
  const numericValue = Number(value) || 0;
  if (numericValue <= 0) return false;

  const leaderboards = ensureLeaderboards(global);
  const board = leaderboards[boardName];
  if (!Array.isArray(board)) return false;

  const roundedValue = boardName === 'bestChase'
    ? Math.round(numericValue * 10) / 10
    : Math.floor(numericValue);
  const name = normalizeDisplayName(displayName);
  const existing = board.find((entry) => entry?.playerHash === playerHash);
  if (existing) {
    if ((Number(existing.value) || 0) > roundedValue) return false;
    if ((Number(existing.value) || 0) === roundedValue && existing.displayName === name) return false;
    existing.value = roundedValue;
    existing.displayName = name;
    existing.updatedAt = updatedAt;
  } else {
    board.push({
      playerHash,
      displayName: name,
      value: roundedValue,
      updatedAt,
    });
  }

  board.sort((a, b) => (Number(b.value) || 0) - (Number(a.value) || 0)
    || (Number(a.updatedAt) || 0) - (Number(b.updatedAt) || 0)
    || normalizeDisplayName(a.displayName).localeCompare(normalizeDisplayName(b.displayName)));
  if (board.length > LEADERBOARD_LIMIT) board.length = LEADERBOARD_LIMIT;
  return true;
}

function isValidPlayerKey(value) {
  return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
}

async function hashPlayerKey(playerKey) {
  const data = new TextEncoder().encode(playerKey);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function getEnv(room, key) {
  return room.env?.[key] ?? room.context?.env?.[key] ?? undefined;
}

function normalizeCollectorUrl(value) {
  if (typeof value !== 'string' || value.trim() === '') return '';
  try {
    return new URL(value).toString();
  } catch {
    console.warn('[stats] STATS_COLLECTOR_URL is not a valid URL');
    return '';
  }
}

export class StatsTracker {
  constructor(room) {
    this.room = room;
    this.kv = room.context?.bindings?.kv?.[STATS_KV_BINDING] ?? null;
    this.collectorUrl = normalizeCollectorUrl(getEnv(room, 'STATS_COLLECTOR_URL'));
    this.collectorToken = getEnv(room, 'STATS_COLLECTOR_TOKEN') ?? '';
    this.collectorEnabled = Boolean(this.collectorUrl && this.collectorToken);
    this.persistLocalStats = !this.collectorEnabled;
    if (this.collectorUrl && !this.collectorToken) {
      console.warn('[stats] STATS_COLLECTOR_URL is configured without STATS_COLLECTOR_TOKEN');
    }
    this.global = createGlobalStats();
    this.sessions = new Map();
    this.players = new Map();
    this.dirtyPlayers = new Set();
    this.dirtyGlobal = false;
    this.pendingGlobalDelta = createGlobalDelta();
    this.pendingPlayerDeltas = new Map();
    this.flushTimer = null;
    this.ready = this.persistLocalStats ? this._loadGlobal() : Promise.resolve();
  }

  async _readJson(key) {
    if (this.kv) {
      const text = await this.kv.get(key);
      return text ? JSON.parse(text) : null;
    }
    return await this.room.storage.get(key) ?? null;
  }

  async _writeJson(key, value) {
    if (this.kv) {
      await this.kv.put(key, JSON.stringify(value));
      return;
    }
    await this.room.storage.put(key, value);
  }

  async _loadGlobal() {
    try {
      this.global = await this._readJson(GLOBAL_STATS_KEY) ?? createGlobalStats();
      ensureLeaderboards(this.global);
    } catch (error) {
      console.warn('[stats] failed to load global stats:', error);
      this.global = createGlobalStats();
    }
  }

  _markGlobalDirty() {
    this.global.updatedAt = Date.now();
    this.dirtyGlobal = true;
    this._scheduleFlush();
  }

  _markPlayerDirty(playerHash) {
    if (!playerHash) return;
    this.dirtyPlayers.add(playerHash);
    this._scheduleFlush();
  }

  _addGlobalDelta(field, amount) {
    if (!this.collectorEnabled) return;
    if (!GLOBAL_DELTA_FIELDS.includes(field) || amount <= 0) return;
    this.pendingGlobalDelta[field] += amount;
  }

  _recordPeakConcurrent(concurrentCount) {
    if (!this.collectorEnabled) return;
    this.pendingGlobalDelta.peakConcurrent = Math.max(
      this.pendingGlobalDelta.peakConcurrent,
      concurrentCount,
    );
  }

  _getPendingPlayerDelta(playerHash) {
    let playerDelta = this.pendingPlayerDeltas.get(playerHash);
    if (!playerDelta) {
      playerDelta = createPlayerDelta(playerHash);
      this.pendingPlayerDeltas.set(playerHash, playerDelta);
    }
    return playerDelta;
  }

  _addPlayerDelta(playerHash, field, amount, now = Date.now()) {
    if (!this.collectorEnabled) return;
    if (!playerHash || !PLAYER_DELTA_FIELDS.includes(field) || amount <= 0) return;
    const playerDelta = this._getPendingPlayerDelta(playerHash);
    playerDelta.delta[field] += amount;
    playerDelta.firstSeen = playerDelta.firstSeen ?? now;
    playerDelta.lastSeen = Math.max(playerDelta.lastSeen ?? 0, now);
  }

  _touchPendingPlayer(playerHash, now = Date.now(), displayName = null) {
    if (!this.collectorEnabled) return;
    if (!playerHash) return;
    const playerDelta = this._getPendingPlayerDelta(playerHash);
    if (displayName) playerDelta.displayName = normalizeDisplayName(displayName);
    playerDelta.firstSeen = playerDelta.firstSeen ?? now;
    playerDelta.lastSeen = Math.max(playerDelta.lastSeen ?? 0, now);
  }

  _recordPendingBest(playerHash, field, value, displayName, now = Date.now()) {
    if (!this.collectorEnabled || !playerHash) return;
    const playerDelta = this._getPendingPlayerDelta(playerHash);
    playerDelta.displayName = normalizeDisplayName(displayName);
    playerDelta[field] = Math.max(Number(playerDelta[field]) || 0, Number(value) || 0);
    playerDelta.firstSeen = playerDelta.firstSeen ?? now;
    playerDelta.lastSeen = Math.max(playerDelta.lastSeen ?? 0, now);
  }

  _scheduleFlush() {
    if (this.flushTimer) return;
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      this.flush().catch((error) => {
        console.warn('[stats] flush failed:', error);
      });
    }, FLUSH_DELAY_MS);
  }

  recordConnect(connectionId, concurrentCount) {
    this.sessions.set(connectionId, {
      connectedAt: Date.now(),
      playerHash: null,
      displayName: 'Mouse',
    });
    this.global.totalConnections += 1;
    this.global.peakConcurrent = Math.max(this.global.peakConcurrent, concurrentCount);
    this._addGlobalDelta('totalConnections', 1);
    this._recordPeakConcurrent(concurrentCount);
    this._markGlobalDirty();
  }

  async identifyConnection(connectionId, playerKey, displayName = 'Mouse') {
    if (!isValidPlayerKey(playerKey)) return;
    await this.ready;

    const session = this.sessions.get(connectionId);
    if (!session) return;

    const playerHash = await hashPlayerKey(playerKey);
    session.displayName = normalizeDisplayName(displayName);
    if (session.playerHash === playerHash) return;

    session.playerHash = playerHash;
    const playerKeyName = `${PLAYER_KEY_PREFIX}${playerHash}`;
    let player = this.players.get(playerHash);
    if (!player && this.persistLocalStats) {
      player = await this._readJson(playerKeyName);
    }

    const now = Date.now();
    if (!player) {
      player = createPlayerStats(playerHash, session.displayName);
      this.global.uniquePlayers += 1;
      this._markGlobalDirty();
    }

    player.displayName = session.displayName;
    player.sessions += 1;
    player.lastSeen = now;
    this.players.set(playerHash, player);
    this._touchPendingPlayer(playerHash, now, session.displayName);
    this._addPlayerDelta(playerHash, 'sessions', 1, now);
    this._markPlayerDirty(playerHash);
  }

  recordDisplayName(connectionId, displayName) {
    const session = this.sessions.get(connectionId);
    if (!session) return;
    const name = normalizeDisplayName(displayName);
    session.displayName = name;
    if (!session.playerHash) return;
    this._mutatePlayerByHash(session.playerHash, (player) => {
      player.displayName = name;
    });
  }

  recordPlayerBests(connectionId, { displayName = null, chaseSeconds = 0, cheeseHeld = 0 } = {}) {
    const session = this.sessions.get(connectionId);
    if (!session?.playerHash) return;
    const name = normalizeDisplayName(displayName ?? session.displayName);
    session.displayName = name;
    const roundedChase = Math.round(Math.max(0, Number(chaseSeconds) || 0) * 10) / 10;
    const heldCheese = Math.max(0, Math.floor(Number(cheeseHeld) || 0));
    const player = this.players.get(session.playerHash);
    if (!player) return;

    const now = Date.now();
    let changed = false;
    player.displayName = name;
    if (roundedChase > (Number(player.bestChaseSeconds) || 0)) {
      player.bestChaseSeconds = roundedChase;
      this._recordPendingBest(session.playerHash, 'bestChaseSeconds', roundedChase, name, now);
      if (upsertLeaderboardEntry(this.global, 'bestChase', {
        playerHash: session.playerHash,
        displayName: name,
        value: roundedChase,
        updatedAt: now,
      })) {
        this._markGlobalDirty();
      }
      changed = true;
    }
    if (heldCheese > (Number(player.bestCheeseHeld) || 0)) {
      player.bestCheeseHeld = heldCheese;
      this._recordPendingBest(session.playerHash, 'bestCheeseHeld', heldCheese, name, now);
      if (upsertLeaderboardEntry(this.global, 'bestCheeseHeld', {
        playerHash: session.playerHash,
        displayName: name,
        value: heldCheese,
        updatedAt: now,
      })) {
        this._markGlobalDirty();
      }
      changed = true;
    }
    if (changed) {
      player.lastSeen = now;
      this._markPlayerDirty(session.playerHash);
    }
  }

  recordCatHit(connectionId) {
    this.global.totalCatHits += 1;
    this._addGlobalDelta('totalCatHits', 1);
    this._markGlobalDirty();
    this._mutatePlayer(connectionId, (player) => {
      player.catHitsTaken += 1;
    }, 'catHitsTaken');
  }

  recordDeath(connectionId) {
    this.global.totalDeaths += 1;
    this._addGlobalDelta('totalDeaths', 1);
    this._markGlobalDirty();
    this._mutatePlayer(connectionId, (player) => {
      player.deaths += 1;
    }, 'deaths');
  }

  recordRespawn(connectionId) {
    this.global.totalRespawns += 1;
    this._addGlobalDelta('totalRespawns', 1);
    this._markGlobalDirty();
    this._mutatePlayer(connectionId, (player) => {
      player.respawns += 1;
    }, 'respawns');
  }

  recordDisconnect(connectionId) {
    const session = this.sessions.get(connectionId);
    if (!session) return;
    this.sessions.delete(connectionId);

    const playSeconds = Math.max(0, Math.round((Date.now() - session.connectedAt) / 1000));
    this.global.totalPlaySeconds += playSeconds;
    this._addGlobalDelta('totalPlaySeconds', playSeconds);
    this._markGlobalDirty();

    if (session.playerHash) {
      this._mutatePlayerByHash(session.playerHash, (player) => {
        player.playSeconds += playSeconds;
        player.lastSeen = Date.now();
      }, 'playSeconds', playSeconds);
    }

    if (!this.collectorEnabled) {
      this.flush().catch((error) => {
        console.warn('[stats] disconnect flush failed:', error);
      });
    }
  }

  _mutatePlayer(connectionId, mutate, deltaField = null, deltaAmount = 1) {
    const playerHash = this.sessions.get(connectionId)?.playerHash;
    if (!playerHash) return;
    this._mutatePlayerByHash(playerHash, mutate, deltaField, deltaAmount);
  }

  _mutatePlayerByHash(playerHash, mutate, deltaField = null, deltaAmount = 1) {
    const player = this.players.get(playerHash);
    if (!player) return;
    const now = Date.now();
    mutate(player);
    player.lastSeen = now;
    if (deltaField) {
      this._addPlayerDelta(playerHash, deltaField, deltaAmount, now);
    } else {
      this._touchPendingPlayer(playerHash, now);
    }
    this._markPlayerDirty(playerHash);
  }

  _snapshotPendingCollectorBatch() {
    const global = { ...this.pendingGlobalDelta };
    const players = [...this.pendingPlayerDeltas.values()]
      .filter(hasPlayerUpdate)
      .map((playerDelta) => ({
        playerHash: playerDelta.playerHash,
        displayName: playerDelta.displayName,
        firstSeen: playerDelta.firstSeen,
        lastSeen: playerDelta.lastSeen,
        bestChaseSeconds: playerDelta.bestChaseSeconds,
        bestCheeseHeld: playerDelta.bestCheeseHeld,
        delta: { ...playerDelta.delta },
      }));

    if (!hasGlobalDelta(global) && players.length === 0) return null;

    this.pendingGlobalDelta = createGlobalDelta();
    this.pendingPlayerDeltas.clear();
    return {
      type: 'stats-delta',
      version: 1,
      roomId: this.room.id ?? this.room.name ?? null,
      sentAt: Date.now(),
      global,
      players,
    };
  }

  _restorePendingCollectorBatch(batch) {
    if (!batch) return;
    for (const field of GLOBAL_DELTA_FIELDS) {
      this.pendingGlobalDelta[field] += batch.global?.[field] ?? 0;
    }
    this.pendingGlobalDelta.peakConcurrent = Math.max(
      this.pendingGlobalDelta.peakConcurrent,
      batch.global?.peakConcurrent ?? 0,
    );

    for (const incoming of batch.players ?? []) {
      if (!incoming?.playerHash) continue;
      const playerDelta = this._getPendingPlayerDelta(incoming.playerHash);
      if (incoming.displayName) playerDelta.displayName = normalizeDisplayName(incoming.displayName);
      if (incoming.bestChaseSeconds != null) {
        playerDelta.bestChaseSeconds = Math.max(
          Number(playerDelta.bestChaseSeconds) || 0,
          Number(incoming.bestChaseSeconds) || 0,
        );
      }
      if (incoming.bestCheeseHeld != null) {
        playerDelta.bestCheeseHeld = Math.max(
          Number(playerDelta.bestCheeseHeld) || 0,
          Number(incoming.bestCheeseHeld) || 0,
        );
      }
      for (const field of PLAYER_DELTA_FIELDS) {
        playerDelta.delta[field] += incoming.delta?.[field] ?? 0;
      }
      playerDelta.firstSeen = Math.min(
        playerDelta.firstSeen ?? incoming.firstSeen ?? Date.now(),
        incoming.firstSeen ?? Date.now(),
      );
      playerDelta.lastSeen = Math.max(
        playerDelta.lastSeen ?? 0,
        incoming.lastSeen ?? 0,
      );
    }
  }

  async _flushCollector() {
    if (!this.collectorEnabled) return;

    const batch = this._snapshotPendingCollectorBatch();
    if (!batch) return;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), COLLECTOR_TIMEOUT_MS);
    try {
      const response = await fetch(this.collectorUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.collectorToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(batch),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`collector returned ${response.status}`);
      }
    } catch (error) {
      this._restorePendingCollectorBatch(batch);
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  async flush() {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }

    await this.ready;

    if (this.persistLocalStats) {
      if (this.dirtyGlobal) {
        this.dirtyGlobal = false;
        await this._writeJson(GLOBAL_STATS_KEY, this.global);
      }

      const dirtyPlayers = [...this.dirtyPlayers];
      this.dirtyPlayers.clear();
      await Promise.all(dirtyPlayers.map((playerHash) => {
        const player = this.players.get(playerHash);
        return player ? this._writeJson(`${PLAYER_KEY_PREFIX}${playerHash}`, player) : null;
      }));
    } else {
      this.dirtyGlobal = false;
      this.dirtyPlayers.clear();
    }

    await this._flushCollector();
  }

  async getSummary() {
    await this.flush();
    return {
      ...this.global,
      leaderboards: publicLeaderboards(this.global),
      currentConcurrent: this.sessions.size,
      storage: this.kv ? 'cloudflare-kv' : 'party-room-storage',
      collector: this.collectorEnabled ? 'cloudflare-worker' : 'disabled',
    };
  }

  async getLeaderboards() {
    await this.flush();
    return {
      version: 1,
      updatedAt: this.global.updatedAt ?? Date.now(),
      currentConcurrent: this.sessions.size,
      storage: this.kv ? 'cloudflare-kv' : 'party-room-storage',
      collector: this.collectorEnabled ? 'cloudflare-worker' : 'disabled',
      leaderboards: publicLeaderboards(this.global),
    };
  }
}
