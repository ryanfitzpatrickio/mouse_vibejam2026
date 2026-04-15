import { createPlayerState, simulateTick, respawnPlayer } from '../shared/physics.js';
import { createMouseBotBrain, buildMouseBotInput, resetMouseBotBrain } from '../shared/mouseBot.js';
import { createPredatorState, simulatePredatorTick, serializePredatorState } from '../shared/predator.js';
import {
  createRoombaState,
  getRoombaVacuumPullAcceleration,
  simulateRoombaTick,
  serializeRoombaState,
} from '../shared/roomba.js';
import { buildRoomCollidersFromLayout } from '../shared/roomCollision.js';
import kitchenLayout from '../shared/kitchen-layout.generated.js';
import kitchenNavMesh from '../shared/kitchen-navmesh.generated.js';
import kitchenMouseNavMesh from '../shared/kitchen-mouse-navmesh.generated.js';
import kitchenRoombaNavMesh from '../shared/kitchen-roomba-navmesh.generated.js';
import { collectSpawnPointsFromLayout } from '../shared/spawnPoints.js';
import { applyPortalArrivalToPlayerState, collectVibePortalPlacementsFromLayout, sanitizePortalArrivalPayload } from '../shared/vibePortal.js';
import { isValidDevSyncLayout } from '../shared/devLayoutValidation.js';
import { sanitizePlayerInputMessage } from '../shared/playerInputSanitize.js';
import { sanitizeDisplayName } from '../shared/displayName.js';
import { playerChaseRecordSeconds, tickPlayerChaseScores } from '../shared/chaseScore.js';
import { StatsTracker } from './stats.js';
import { createPushBallWorld } from './pushBallWorld.js';
import { createRoombaCannonWorld } from './roombaCannonWorld.js';
import { createMouseLaunchWorld } from './mouseLaunchWorld.js';
import { CheeseWorld } from './cheeseWorld.js';
import { LEVEL_WORLD_BOUNDS_XZ } from '../shared/levelWorldBounds.js';

/**
 * PartyKit env (dashboard / project .env for `partykit dev`):
 * - STATS_ADMIN_TOKEN or STATS_COLLECTOR_TOKEN — required; GET …/stats returns 503 if both missing
 * - GET …/leaderboard returns public aggregate leaderboards
 * - ALLOWED_ORIGINS — comma-separated browser origins allowed to open WebSockets
 * - DEV_LAYOUT_SYNC_ENABLED — set "true" only in dev to accept dev-sync-layout
 * - DEV_LAYOUT_SYNC_TOKEN — must match Vite VITE_DEV_LAYOUT_SYNC_TOKEN when syncing layout from build mode
 */

const TICK_RATE = 30;
const TICK_MS = 1000 / TICK_RATE;
const MAX_PLAYERS = 8;
/** Max extra push-balls a human may spawn per connection (lifetime). */
const MAX_EXTRA_BALL_SPAWNS_PER_PLAYER = 10;
const RESPAWN_SECONDS = 10;
const GRAB_RANGE = 2.5;
const GRAB_COOLDOWN = 1.0;
const GRAB_PULL_STRENGTH = 6.0;
const GRAB_INITIATOR_ADVANTAGE = 0.65; // initiator controls 65% of direction
const SMACK_RANGE = 2.0;
const SMACK_COOLDOWN = 1.5;
const SMACK_STUN_DURATION = 1.0;
const SMACK_KNOCKBACK = 8.0;
const DEFAULT_ENEMY_SPAWNS = Object.freeze([{ x: -5, y: 0, z: -5 }]);
const DEFAULT_ALLOWED_ORIGINS = Object.freeze(['https://mouse.ryanfitzpatrick.io']);
const LOCAL_ORIGIN_RE = /^https?:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/;
const CONNECT_RATE_WINDOW_MS = 60_000;
const MAX_CONNECT_ATTEMPTS_PER_WINDOW = 30;
const WS_MESSAGE_RATE_PER_SECOND = 90;
const WS_MESSAGE_BURST = 180;
const MAX_DROPPED_MESSAGES_BEFORE_CLOSE = 180;

const BOUNDS = LEVEL_WORLD_BOUNDS_XZ;

/** Reject oversized WebSocket frames before JSON.parse (DoS). */
const MAX_WS_MESSAGE_CHARS = 256 * 1024;
const connectAttempts = new Map();

function getPartyEnv(room, key) {
  return room.env?.[key] ?? room.context?.env?.[key] ?? undefined;
}

function splitCsv(value) {
  return String(value ?? '')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
}

function normalizeOrigin(value) {
  if (typeof value !== 'string' || value.trim() === '') return '';
  try {
    const url = new URL(value);
    return `${url.protocol}//${url.host}`;
  } catch {
    return '';
  }
}

function getAllowedOrigins(env) {
  const origins = new Set(DEFAULT_ALLOWED_ORIGINS);
  for (const key of ['ALLOWED_ORIGINS', 'GAME_ORIGIN', 'PUBLIC_GAME_ORIGIN']) {
    for (const origin of splitCsv(env?.[key])) {
      const normalized = normalizeOrigin(origin);
      if (normalized) origins.add(normalized);
    }
  }
  return origins;
}

function isAllowedOrigin(origin, env) {
  if (!origin) return true;
  const normalized = normalizeOrigin(origin);
  if (!normalized) return false;
  if (LOCAL_ORIGIN_RE.test(normalized)) return true;
  return getAllowedOrigins(env).has(normalized);
}

function corsHeadersForRequest(request, env) {
  const origin = request.headers.get('Origin') ?? '';
  if (!origin || !isAllowedOrigin(origin, env)) return {};
  return {
    'Access-Control-Allow-Origin': normalizeOrigin(origin),
    'Access-Control-Allow-Methods': 'GET,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    'Vary': 'Origin',
  };
}

function jsonResponse(request, env, body, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      ...corsHeadersForRequest(request, env),
    },
  });
}

function getClientRateKey(request) {
  const forwarded = request.headers.get('X-Forwarded-For') ?? '';
  const ip = request.headers.get('CF-Connecting-IP') ?? forwarded.split(',')[0]?.trim() ?? '';
  const origin = normalizeOrigin(request.headers.get('Origin') ?? '') || 'no-origin';
  return ip ? `${ip}:${origin}` : `unknown:${origin}`;
}

function consumeConnectAttempt(request, now = Date.now()) {
  const key = getClientRateKey(request);
  let bucket = connectAttempts.get(key);
  if (!bucket || now - bucket.windowStart >= CONNECT_RATE_WINDOW_MS) {
    bucket = { windowStart: now, count: 0 };
    connectAttempts.set(key, bucket);
  }

  bucket.count += 1;
  if (connectAttempts.size > 1000) {
    for (const [entryKey, entry] of connectAttempts) {
      if (now - entry.windowStart >= CONNECT_RATE_WINDOW_MS) {
        connectAttempts.delete(entryKey);
      }
    }
  }
  return bucket.count <= MAX_CONNECT_ATTEMPTS_PER_WINDOW;
}

function isDevLayoutSyncEnabled(room) {
  const v = getPartyEnv(room, 'DEV_LAYOUT_SYNC_ENABLED');
  return v === true || v === 1 || String(v).toLowerCase() === 'true' || String(v) === '1';
}

function getDevLayoutSyncToken(room) {
  const t = getPartyEnv(room, 'DEV_LAYOUT_SYNC_TOKEN');
  return typeof t === 'string' ? t : '';
}

export default class GameServer {
  static onBeforeConnect(request, lobby) {
    if (!isAllowedOrigin(request.headers.get('Origin') ?? '', lobby.env)) {
      return new Response('Forbidden origin', { status: 403 });
    }

    if (!consumeConnectAttempt(request)) {
      return new Response('Too many connection attempts', {
        status: 429,
        headers: { 'Retry-After': '60' },
      });
    }

    return request;
  }

  players = new Map();
  inputQueues = new Map();
  tickInterval = null;
  levelColliders = buildRoomCollidersFromLayout(kitchenLayout, { scaleFactor: 1 });
  levelNavMesh = kitchenNavMesh;
  /** Walk mesh for mice (mouse-only nav polys); cats use levelNavMesh. */
  levelMouseNavMesh = kitchenMouseNavMesh;
  /** Wide agent mesh for roomba pathing (matches disk radius in nav bake). */
  levelRoombaNavMesh = kitchenRoombaNavMesh;
  spawnPoints = collectSpawnPointsFromLayout(kitchenLayout);
  portalPlacements = collectVibePortalPlacementsFromLayout(kitchenLayout);
  stats = null;
  portalArrivals = new Set();
  botBrains = new Map();
  _nextBotId = 0;
  /** @type {Map<string, number>} last spawn-extra-ball ms by connection id */
  _spawnBallCooldown = new Map();
  /** @type {Map<string, number>} successful extra-ball spawns this connection */
  _playerExtraBallSpawnCount = new Map();
  /** @type {Map<string, {tokens: number, lastRefill: number, dropped: number}>} */
  _messageBuckets = new Map();

  constructor(room) {
    this.room = room;
    this.stats = new StatsTracker(room);
    this.predators = [];
    this.pushBallWorld = createPushBallWorld();
    this.roombaCannonWorld = createRoombaCannonWorld();
    this.mouseLaunchWorld = createMouseLaunchWorld();
    this.cheeseWorld = new CheeseWorld();
    this._applyLayout(kitchenLayout, { resetPredators: true });
  }

  _applyLayout(layout, { resetPredators = false } = {}) {
    this.levelColliders = buildRoomCollidersFromLayout(layout, { scaleFactor: 1 });
    this.spawnPoints = collectSpawnPointsFromLayout(layout);
    this.portalPlacements = collectVibePortalPlacementsFromLayout(layout);
    this.pushBallWorld?.setLevelColliders?.(this.levelColliders);
    this.roombaCannonWorld?.setLevelColliders?.(this.levelColliders);
    this.mouseLaunchWorld?.setLevelColliders?.(this.levelColliders);
    this.cheeseWorld.setNavMesh(this.levelMouseNavMesh);
    if (resetPredators) {
      this.predators = [];
      this._initPredators();
      this.cheeseWorld.seedScatter();
    }
  }

  _pickRoombaDock() {
    const enemySpawns = this.spawnPoints.enemy.length ? this.spawnPoints.enemy : DEFAULT_ENEMY_SPAWNS;
    const e = enemySpawns[0];
    const ex = e?.x ?? -12;
    const ez = e?.z ?? 0;
    const floorY = e?.y ?? 0;
    // Opposite the cat in XZ, but only ~20m from center so the dock is easy to spot (not a far map corner).
    const dist = 20;
    const len = Math.hypot(ex, ez);
    const ux = len > 0.75 ? ex / len : 1;
    const uz = len > 0.75 ? ez / len : 0;
    return {
      x: -ux * dist,
      y: floorY,
      z: -uz * dist,
    };
  }

  _initPredators() {
    const enemySpawns = this.spawnPoints.enemy.length ? this.spawnPoints.enemy : DEFAULT_ENEMY_SPAWNS;
    enemySpawns.forEach((spawn, index) => {
      this.predators.push(createPredatorState({
        id: `cat-${index}`,
        type: 'cat',
        spawnX: spawn.x,
        spawnY: spawn.y,
        spawnZ: spawn.z,
      }));
    });
    const dock = this._pickRoombaDock();
    this.predators.push(createRoombaState({
      id: 'roomba-0',
      dockX: dock.x,
      dockY: dock.y,
      dockZ: dock.z,
    }));
    this.roombaCannonWorld?.resetBody?.();
  }

  _pickPlayerSpawn(joinIndex = 0) {
    const spawns = this.spawnPoints.player;
    if (spawns.length) {
      return spawns[joinIndex % spawns.length];
    }

    const angle = joinIndex * (Math.PI * 2 / MAX_PLAYERS);
    return {
      x: Math.cos(angle) * 2,
      y: 0,
      z: Math.sin(angle) * 2,
    };
  }

  _pickRespawnPoint() {
    const spawns = this.spawnPoints.player;
    if (spawns.length) {
      return spawns[Math.floor(Math.random() * spawns.length)];
    }

    const angle = Math.random() * Math.PI * 2;
    const dist = 2 + Math.random() * 8;
    return {
      x: Math.cos(angle) * dist,
      y: 0,
      z: Math.sin(angle) * dist,
    };
  }

  _listBotIdsSorted() {
    return [...this.players.keys()]
      .filter((id) => !this.inputQueues.has(id))
      .sort((a, b) => {
        const na = Number(String(a).replace(/^bot-/, '')) || 0;
        const nb = Number(String(b).replace(/^bot-/, '')) || 0;
        return na - nb;
      });
  }

  /**
   * Keeps (humans + bots) at MAX_PLAYERS when humans < MAX_PLAYERS; no bots at 8 humans.
   */
  _syncBots() {
    const humanCount = this.inputQueues.size;
    const desiredBots = Math.max(0, MAX_PLAYERS - humanCount);
    const botIds = this._listBotIdsSorted();

    while (botIds.length > desiredBots) {
      const id = botIds.pop();
      if (!id) break;
      this.mouseLaunchWorld?.removePlayer?.(id);
      this.players.delete(id);
      this.botBrains.delete(id);
      this._lastSeq?.delete(id);
      this.broadcast(JSON.stringify({ type: 'player-left', id }));
    }

    while (botIds.length < desiredBots) {
      const id = `bot-${this._nextBotId++}`;
      const spawn = this._pickPlayerSpawn(this.inputQueues.size + botIds.length);
      const state = createPlayerState(id);
      state.isBot = true;
      state.displayName = `Bot ${id.replace(/^bot-/, '')}`;
      state.position.x = spawn.x;
      state.position.y = spawn.y;
      state.position.z = spawn.z;
      state.grounded = spawn.y <= 0.001;
      this.players.set(id, state);
      this.botBrains.set(id, createMouseBotBrain());
      botIds.push(id);
      this.broadcast(JSON.stringify({ type: 'player-joined', player: state }));
    }
  }

  async onStart() {
    await this.stats?.ready;
    this.tickInterval = setInterval(() => this.tick(), TICK_MS);
  }

  onConnect(conn) {
    if (this.inputQueues.size >= MAX_PLAYERS) {
      conn.send(JSON.stringify({ type: 'error', message: 'Room full' }));
      conn.close();
      return;
    }

    const state = createPlayerState(conn.id);
    const spawn = this._pickPlayerSpawn(this.inputQueues.size);
    state.position.x = spawn.x;
    state.position.y = spawn.y;
    state.position.z = spawn.z;
    state.grounded = spawn.y <= 0.001;

    this.players.set(conn.id, state);
    this.inputQueues.set(conn.id, []);
    this._messageBuckets.set(conn.id, {
      tokens: WS_MESSAGE_BURST,
      lastRefill: Date.now(),
      dropped: 0,
    });
    this._syncBots();
    this.stats?.recordConnect(conn.id, this.inputQueues.size);

    conn.send(JSON.stringify({
      type: 'init',
      id: conn.id,
      players: Object.fromEntries(this.players),
      predators: this.predators.map((p) => (p.type === 'roomba' ? serializeRoombaState(p) : serializePredatorState(p))),
      pushBalls: this.pushBallWorld.getBallsState(),
      cheesePickups: this.cheeseWorld.serializePickups(),
    }));

    this.broadcast(JSON.stringify({
      type: 'player-joined',
      player: state,
    }), [conn.id]);
  }

  _consumeMessageToken(connectionId, now = Date.now()) {
    let bucket = this._messageBuckets.get(connectionId);
    if (!bucket) {
      bucket = {
        tokens: WS_MESSAGE_BURST,
        lastRefill: now,
        dropped: 0,
      };
      this._messageBuckets.set(connectionId, bucket);
    }

    const elapsedSeconds = Math.max(0, (now - bucket.lastRefill) / 1000);
    bucket.tokens = Math.min(
      WS_MESSAGE_BURST,
      bucket.tokens + elapsedSeconds * WS_MESSAGE_RATE_PER_SECOND,
    );
    bucket.lastRefill = now;

    if (bucket.tokens < 1) {
      bucket.dropped += 1;
      return false;
    }

    bucket.tokens -= 1;
    bucket.dropped = 0;
    return true;
  }

  async onMessage(message, sender) {
    if (!this._consumeMessageToken(sender.id)) {
      const bucket = this._messageBuckets.get(sender.id);
      if (bucket?.dropped >= MAX_DROPPED_MESSAGES_BEFORE_CLOSE) {
        sender.close();
      }
      return;
    }

    if (typeof message === 'string' && message.length > MAX_WS_MESSAGE_CHARS) {
      return;
    }

    let data;
    try {
      data = JSON.parse(/** @type {string} */ (message));
    } catch {
      return;
    }

    if (data.type === 'hello') {
      const playerHello = this.players.get(sender.id);
      if (playerHello && typeof data.displayName === 'string') {
        playerHello.displayName = sanitizeDisplayName(data.displayName);
        this.stats?.recordDisplayName(sender.id, playerHello.displayName);
      }

      const portalArrival = sanitizePortalArrivalPayload(data.portal);
      if (portalArrival.active && !this.portalArrivals.has(sender.id)) {
        const player = this.players.get(sender.id);
        if (applyPortalArrivalToPlayerState(player, portalArrival, this.portalPlacements)) {
          this.portalArrivals.add(sender.id);
          sender.send(JSON.stringify({
            type: 'portal-spawn',
            player,
          }));
          this.broadcast(JSON.stringify({
            type: 'player-joined',
            player,
          }), [sender.id]);
        }
      }

      try {
        await this.stats?.identifyConnection(sender.id, data.playerKey, playerHello?.displayName);
      } catch (error) {
        console.warn('[stats] failed to identify player:', error);
      }
      return;
    }

    if (data.type === 'input') {
      const queue = this.inputQueues.get(sender.id);
      if (queue) {
        if (queue.length < 8) {
          queue.push(sanitizePlayerInputMessage(data));
        }
      }
      return;
    }

    if (data.type === 'spawn-extra-ball') {
      const player = this.players.get(sender.id);
      if (!player?.alive) return;
      const used = this._playerExtraBallSpawnCount.get(sender.id) ?? 0;
      if (used >= MAX_EXTRA_BALL_SPAWNS_PER_PLAYER) return;
      const now = Date.now();
      const last = this._spawnBallCooldown.get(sender.id) ?? 0;
      if (now - last < 240) return;
      this._spawnBallCooldown.set(sender.id, now);
      const ok = this.pushBallWorld.spawnExtraBallNear(player.position, player.rotation);
      if (ok) {
        this._playerExtraBallSpawnCount.set(sender.id, used + 1);
      }
      return;
    }

    if (data.type === 'dev-sync-layout') {
      if (!isDevLayoutSyncEnabled(this.room)) {
        return;
      }
      const expected = getDevLayoutSyncToken(this.room);
      if (!expected || typeof data.syncToken !== 'string' || data.syncToken !== expected) {
        return;
      }
      if (!isValidDevSyncLayout(data.layout)) {
        return;
      }
      this._applyLayout(data.layout, { resetPredators: true });
    }
  }

  onClose(conn) {
    this.stats?.recordDisconnect(conn.id);
    this._spawnBallCooldown.delete(conn.id);
    this._playerExtraBallSpawnCount.delete(conn.id);
    this._messageBuckets.delete(conn.id);
    this.portalArrivals.delete(conn.id);
    this.mouseLaunchWorld?.removePlayer?.(conn.id);
    this.players.delete(conn.id);
    this.inputQueues.delete(conn.id);
    this.broadcast(JSON.stringify({
      type: 'player-left',
      id: conn.id,
    }));
    this._syncBots();
  }

  tick() {
    this._syncBots();

    if (this.players.size === 0 && this.predators.length === 0) return;

    const dt = TICK_MS / 1000;

    const seqs = {};
    const now = Date.now() / 1000;
    const roombaForVacuum = this.predators.find((p) => p.type === 'roomba') ?? null;
    /** Collect interaction requests from this tick's inputs. */
    const grabHeld = new Set();
    const smackRequests = [];
    for (const [id, state] of this.players) {
      const isHuman = this.inputQueues.has(id);

      // --- Tick cooldowns ---
      if (state.grabCooldown > 0) state.grabCooldown = Math.max(0, state.grabCooldown - dt);
      if (state.smackCooldown > 0) state.smackCooldown = Math.max(0, state.smackCooldown - dt);

      // --- Smack stun recovery ---
      if (state.smackStunTimer > 0) {
        state.smackStunTimer = Math.max(0, state.smackStunTimer - dt);
        if (state.smackStunTimer <= 0) {
          // Recover from smack stun
          state.alive = true;
          state.animState = 'idle';
          state.deathTime = 0;
          state.health = Math.max(state.health, 1);
        } else {
          // Still stunned — skip physics for this player
          seqs[id] = this._lastSeq?.get(id) ?? 0;
          if (isHuman) {
            const queue = this.inputQueues.get(id);
            if (queue?.length) {
              seqs[id] = queue[queue.length - 1].seq;
              if (!this._lastSeq) this._lastSeq = new Map();
              this._lastSeq.set(id, seqs[id]);
              queue.length = 0;
            }
          }
          continue;
        }
      }

      if (!state.alive) {
        if (state.deathTime <= 0) {
          state.deathTime = now;
        } else if (now - state.deathTime >= RESPAWN_SECONDS) {
          this.mouseLaunchWorld.removePlayer(id);
          const spawn = this._pickRespawnPoint();
          respawnPlayer(state, spawn.x, spawn.z, spawn.y);
          this.stats?.recordRespawn(id);
          if (!isHuman) {
            resetMouseBotBrain(this.botBrains.get(id));
          }
          seqs[id] = this._lastSeq?.get(id) ?? 0;
          continue;
        }
        seqs[id] = this._lastSeq?.get(id) ?? 0;
        continue;
      }

      if (this.mouseLaunchWorld.isFlying(id)) {
        seqs[id] = isHuman ? (this._lastSeq?.get(id) ?? 0) : 0;
        continue;
      }
      if (state.roombaLaunch?.phase === 'suck') {
        seqs[id] = isHuman ? (this._lastSeq?.get(id) ?? 0) : 0;
        continue;
      }

      if (isHuman) {
        const queue = this.inputQueues.get(id);
        if (!queue || queue.length === 0) {
          const vacuumPull = roombaForVacuum?.phase === 'vacuuming'
            ? getRoombaVacuumPullAcceleration(roombaForVacuum, state)
            : null;
          simulateTick(state, {
            moveX: 0,
            moveZ: 0,
            sprint: false,
            jump: false,
            jumpPressed: false,
            jumpHeld: false,
            crouch: false,
            rotation: state.rotation,
          }, dt, BOUNDS, this.levelColliders, vacuumPull);
          state.emote = null;
          seqs[id] = this._lastSeq?.get(id) ?? 0;
        } else {
          let didSmack = false;
          let lastGrab = false;
          for (const input of queue) {
            const vacuumPull = roombaForVacuum?.phase === 'vacuuming'
              ? getRoombaVacuumPullAcceleration(roombaForVacuum, state)
              : null;
            simulateTick(state, input, dt, BOUNDS, this.levelColliders, vacuumPull);
            state.emote = input.emote ?? null;
            seqs[id] = input.seq;
            lastGrab = !!input.grab;
            if (input.smack) didSmack = true;
          }
          if (lastGrab) grabHeld.add(id);
          if (didSmack) smackRequests.push(id);
          if (!this._lastSeq) this._lastSeq = new Map();
          this._lastSeq.set(id, seqs[id]);
          queue.length = 0;
        }
      } else {
        const brain = this.botBrains.get(id);
        if (!brain) {
          seqs[id] = 0;
          continue;
        }
        const peerPositions = [];
        const reservedCheeseIds = new Set();
        const reservedGoalPositions = [];
        for (const [otherId, otherState] of this.players) {
          if (otherId === id || !otherState?.alive) continue;
          peerPositions.push({
            x: otherState.position.x,
            z: otherState.position.z,
          });
        }
        for (const [otherId, otherBrain] of this.botBrains) {
          if (otherId === id || !otherBrain) continue;
          const otherBotState = this.players.get(otherId);
          if (!otherBotState?.alive) continue;
          if (otherBrain.cheeseTargetId) reservedCheeseIds.add(otherBrain.cheeseTargetId);
          if (otherBrain.goal) {
            reservedGoalPositions.push({
              x: otherBrain.goal.x,
              z: otherBrain.goal.z,
            });
          }
        }
        const input = buildMouseBotInput(
          state,
          brain,
          this.levelMouseNavMesh,
          this.predators,
          dt,
          this.spawnPoints,
          BOUNDS,
          now,
          {
            peerPositions,
            colliders: this.levelColliders,
            cheesePickups: this.cheeseWorld.pickups,
            reservedCheeseIds,
            reservedGoalPositions,
          },
        );
        const vacuumPull = roombaForVacuum?.phase === 'vacuuming'
          ? getRoombaVacuumPullAcceleration(roombaForVacuum, state)
          : null;
        simulateTick(state, input, dt, BOUNDS, this.levelColliders, vacuumPull);
        state.emote = input.emote ?? null;
        seqs[id] = 0;
      }
    }

    // --- Process smack interactions ---
    for (const attackerId of smackRequests) {
      const attacker = this.players.get(attackerId);
      if (!attacker?.alive || attacker.smackCooldown > 0) continue;
      // Find nearest alive player in range
      let bestId = null;
      let bestDist = SMACK_RANGE;
      for (const [otherId, other] of this.players) {
        if (otherId === attackerId || !other.alive || other.smackStunTimer > 0) continue;
        const dx = other.position.x - attacker.position.x;
        const dz = other.position.z - attacker.position.z;
        const dist = Math.sqrt(dx * dx + dz * dz);
        if (dist < bestDist) {
          bestDist = dist;
          bestId = otherId;
        }
      }
      if (bestId) {
        const target = this.players.get(bestId);
        attacker.smackCooldown = SMACK_COOLDOWN;
        target.smackStunTimer = SMACK_STUN_DURATION;
        target.alive = false;
        target.animState = 'death';
        target.deathTime = 0; // prevent respawn timer — smackStunTimer handles recovery
        // Knockback away from attacker
        const dx = target.position.x - attacker.position.x;
        const dz = target.position.z - attacker.position.z;
        const len = Math.sqrt(dx * dx + dz * dz) || 1;
        target.velocity.x += (dx / len) * SMACK_KNOCKBACK;
        target.velocity.y += 3; // pop them up
        target.velocity.z += (dz / len) * SMACK_KNOCKBACK;
        // Break any grab involving this target
        if (target.grabbedBy) {
          const grabber = this.players.get(target.grabbedBy);
          if (grabber) grabber.grabbedTarget = null;
          target.grabbedBy = null;
        }
        if (target.grabbedTarget) {
          const grabbed = this.players.get(target.grabbedTarget);
          if (grabbed) grabbed.grabbedBy = null;
          target.grabbedTarget = null;
        }
      }
    }

    // --- Process grab interactions (hold-based) ---
    // Release grabs for anyone who stopped holding Q
    for (const [id, state] of this.players) {
      if (state.grabbedTarget && !grabHeld.has(id)) {
        const target = this.players.get(state.grabbedTarget);
        if (target) target.grabbedBy = null;
        state.grabbedTarget = null;
      }
    }
    // Initiate new grabs for players holding Q without an active grab
    for (const grabberId of grabHeld) {
      const grabber = this.players.get(grabberId);
      if (!grabber?.alive || grabber.grabCooldown > 0 || grabber.grabbedTarget) continue;
      // Find nearest alive player in range
      let bestId = null;
      let bestDist = GRAB_RANGE;
      for (const [otherId, other] of this.players) {
        if (otherId === grabberId || !other.alive || other.smackStunTimer > 0) continue;
        const dx = other.position.x - grabber.position.x;
        const dz = other.position.z - grabber.position.z;
        const dist = Math.sqrt(dx * dx + dz * dz);
        if (dist < bestDist) {
          bestDist = dist;
          bestId = otherId;
        }
      }
      if (bestId) {
        const target = this.players.get(bestId);
        // Break any existing grabs on the target
        if (target.grabbedBy) {
          const oldGrabber = this.players.get(target.grabbedBy);
          if (oldGrabber) oldGrabber.grabbedTarget = null;
        }
        grabber.grabbedTarget = bestId;
        target.grabbedBy = grabberId;
      }
    }

    // --- Apply grab movement coupling ---
    const processedGrabs = new Set();
    for (const [id, state] of this.players) {
      if (!state.grabbedTarget || processedGrabs.has(id)) continue;
      const target = this.players.get(state.grabbedTarget);
      if (!target || !target.alive || !state.alive) {
        // Grab broken — target dead or gone
        if (target) target.grabbedBy = null;
        state.grabbedTarget = null;
        continue;
      }
      processedGrabs.add(id);
      processedGrabs.add(state.grabbedTarget);

      const dx = target.position.x - state.position.x;
      const dz = target.position.z - state.position.z;
      const dist = Math.sqrt(dx * dx + dz * dz);

      // Blend velocities: initiator has advantage
      const gVx = state.velocity.x;
      const gVz = state.velocity.z;
      const tVx = target.velocity.x;
      const tVz = target.velocity.z;
      const adv = GRAB_INITIATOR_ADVANTAGE;
      const blendVx = gVx * adv + tVx * (1 - adv);
      const blendVz = gVz * adv + tVz * (1 - adv);
      state.velocity.x = blendVx;
      state.velocity.z = blendVz;
      target.velocity.x = blendVx;
      target.velocity.z = blendVz;

      // Keep grabbed player locked beside the grabber
      const maxGrabDist = 1.5;
      if (dist > maxGrabDist) {
        const nx = dx / dist;
        const nz = dz / dist;
        target.position.x = state.position.x + nx * maxGrabDist;
        target.position.z = state.position.z + nz * maxGrabDist;
      }
    }

    this.pushBallWorld.syncPlayers(this.players);
    this.pushBallWorld.step(dt);

    const playersObj = Object.fromEntries(this.players);
    const catPredators = this.predators.filter((p) => p.type !== 'roomba');
    for (const pred of this.predators) {
      if (pred.type === 'roomba') {
        simulateRoombaTick(
          pred,
          playersObj,
          catPredators,
          dt,
          this.levelColliders,
          this.levelRoombaNavMesh,
          this.roombaCannonWorld,
          this.mouseLaunchWorld,
        );
        continue;
      }
      const hit = simulatePredatorTick(pred, playersObj, dt, this.levelColliders, this.levelNavMesh);
      if (hit) {
        const target = this.players.get(hit.playerId);
        if (target && target.alive) {
          this.stats?.recordCatHit(hit.playerId);
          target.health -= hit.damage;
          if (target.health <= 0) {
            target.health = 0;
            target.deaths = (target.deaths ?? 0) + 1;
            target.alive = false;
            target.animState = 'death';
            this.cheeseWorld.onDeathDropCarried(target);
            this.stats?.recordDeath(hit.playerId);
          }
          target.velocity.x += hit.knockbackX;
          target.velocity.z += hit.knockbackZ;
          if (!target.alive) {
            target.roombaLaunch = null;
            this.mouseLaunchWorld.removePlayer(hit.playerId);
          }
        }
      }
    }

    this.mouseLaunchWorld.step(dt, (pid) => this.players.get(pid));

    tickPlayerChaseScores(this.players, this.predators, dt);

    this.cheeseWorld.collectFromPlayers(this.players);
    for (const [id, state] of this.players) {
      if (!this.inputQueues.has(id)) continue;
      this.stats?.recordPlayerBests(id, {
        displayName: state.displayName,
        chaseSeconds: playerChaseRecordSeconds(state),
        cheeseHeld: state.cheeseCarried ?? 0,
      });
    }

    const snapshot = {
      type: 'snapshot',
      tick: Date.now(),
      seqs,
      players: playersObj,
      predators: this.predators.map((p) => (p.type === 'roomba' ? serializeRoombaState(p) : serializePredatorState(p))),
      pushBalls: this.pushBallWorld.getBallsState(),
      cheesePickups: this.cheeseWorld.serializePickups(),
    };
    this.broadcast(JSON.stringify(snapshot));
  }

  broadcast(message, exclude = []) {
    for (const conn of this.room.getConnections()) {
      if (!exclude.includes(conn.id)) {
        conn.send(message);
      }
    }
  }

  async onRequest(request) {
    const url = new URL(request.url);
    const env = this.room.env ?? this.room.context?.env ?? {};
    const isLeaderboardRequest = url.pathname.endsWith('/leaderboard');
    const isStatsRequest = url.pathname.endsWith('/stats');

    if (request.method === 'OPTIONS' && (isLeaderboardRequest || isStatsRequest)) {
      return new Response(null, {
        status: 204,
        headers: corsHeadersForRequest(request, env),
      });
    }

    if (isLeaderboardRequest) {
      return jsonResponse(request, env, await this.stats.getLeaderboards());
    }

    if (!isStatsRequest) {
      return new Response('Not found', { status: 404 });
    }

    const adminTok = getPartyEnv(this.room, 'STATS_ADMIN_TOKEN');
    const collectorTok = getPartyEnv(this.room, 'STATS_COLLECTOR_TOKEN');
    const expectedToken = (typeof adminTok === 'string' && adminTok.trim() !== '')
      ? adminTok
      : (typeof collectorTok === 'string' && collectorTok.trim() !== '' ? collectorTok : '');

    if (!expectedToken) {
      return jsonResponse(request, env, {
        error: 'Set STATS_ADMIN_TOKEN or STATS_COLLECTOR_TOKEN for /stats',
      }, 503);
    }

    const authHeader = request.headers.get('Authorization') ?? '';
    const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    if (bearerToken !== expectedToken) {
      return new Response('Unauthorized', { status: 401 });
    }

    const summary = await this.stats.getSummary();
    return jsonResponse(request, env, summary);
  }
}
