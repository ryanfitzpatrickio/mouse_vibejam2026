import { createPlayerState, simulateTick, respawnPlayer } from '../shared/physics.js';
import { createPredatorState, simulatePredatorTick, serializePredatorState } from '../shared/predator.js';
import { buildRoomCollidersFromLayout } from '../shared/roomCollision.js';
import kitchenLayout from '../shared/kitchen-layout.generated.js';
import kitchenNavMesh from '../shared/kitchen-navmesh.generated.js';
import { collectSpawnPointsFromLayout } from '../shared/spawnPoints.js';

const TICK_RATE = 30;
const TICK_MS = 1000 / TICK_RATE;
const MAX_PLAYERS = 8;
const RESPAWN_SECONDS = 10;
const DEFAULT_ENEMY_SPAWNS = Object.freeze([{ x: -5, y: 0, z: -5 }]);

const BOUNDS = Object.freeze({
  minX: -24,
  maxX: 24,
  minZ: -24,
  maxZ: 24,
});

export default class GameServer {
  players = new Map();
  inputQueues = new Map();
  tickInterval = null;
  levelColliders = buildRoomCollidersFromLayout(kitchenLayout, { scaleFactor: 1 });
  levelNavMesh = kitchenNavMesh;
  spawnPoints = collectSpawnPointsFromLayout(kitchenLayout);

  constructor(room) {
    this.room = room;
    this.predators = [];
    this._applyLayout(kitchenLayout, { resetPredators: true });
  }

  _applyLayout(layout, { resetPredators = false } = {}) {
    this.levelColliders = buildRoomCollidersFromLayout(layout, { scaleFactor: 1 });
    this.spawnPoints = collectSpawnPointsFromLayout(layout);
    if (resetPredators) {
      this.predators = [];
      this._initPredators();
    }
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

  onStart() {
    this.tickInterval = setInterval(() => this.tick(), TICK_MS);
  }

  onConnect(conn) {
    if (this.players.size >= MAX_PLAYERS) {
      conn.send(JSON.stringify({ type: 'error', message: 'Room full' }));
      conn.close();
      return;
    }

    const state = createPlayerState(conn.id);
    const spawn = this._pickPlayerSpawn(this.players.size);
    state.position.x = spawn.x;
    state.position.y = spawn.y;
    state.position.z = spawn.z;
    state.grounded = spawn.y <= 0.001;

    this.players.set(conn.id, state);
    this.inputQueues.set(conn.id, []);

    conn.send(JSON.stringify({
      type: 'init',
      id: conn.id,
      players: Object.fromEntries(this.players),
      predators: this.predators.map(serializePredatorState),
    }));

    this.broadcast(JSON.stringify({
      type: 'player-joined',
      player: state,
    }), [conn.id]);
  }

  onMessage(message, sender) {
    let data;
    try {
      data = JSON.parse(/** @type {string} */ (message));
    } catch {
      return;
    }

    if (data.type === 'input') {
      const queue = this.inputQueues.get(sender.id);
      if (queue) {
        if (queue.length < 8) {
          queue.push({
            moveX: data.moveX ?? 0,
            moveZ: data.moveZ ?? 0,
            sprint: !!data.sprint,
            jump: !!(data.jumpPressed ?? data.jump),
            jumpPressed: !!(data.jumpPressed ?? data.jump),
            jumpHeld: !!(data.jumpHeld ?? data.jumpPressed ?? data.jump),
            crouch: !!data.crouch,
            rotation: data.rotation ?? 0,
            seq: data.seq ?? 0,
          });
        }
      }
      return;
    }

    if (data.type === 'dev-sync-layout' && data.layout) {
      this._applyLayout(data.layout, { resetPredators: true });
    }
  }

  onClose(conn) {
    this.players.delete(conn.id);
    this.inputQueues.delete(conn.id);
    this.broadcast(JSON.stringify({
      type: 'player-left',
      id: conn.id,
    }));
  }

  tick() {
    if (this.players.size === 0 && this.predators.length === 0) return;

    const dt = TICK_MS / 1000;

    const seqs = {};
    const now = Date.now() / 1000;
    for (const [id, state] of this.players) {
      if (!state.alive) {
        if (state.deathTime <= 0) {
          state.deathTime = now;
        } else if (now - state.deathTime >= RESPAWN_SECONDS) {
          const spawn = this._pickRespawnPoint();
          respawnPlayer(state, spawn.x, spawn.z, spawn.y);
          seqs[id] = this._lastSeq?.get(id) ?? 0;
          continue;
        }
        seqs[id] = this._lastSeq?.get(id) ?? 0;
        continue;
      }

      const queue = this.inputQueues.get(id);
      if (!queue || queue.length === 0) {
        simulateTick(state, {
          moveX: 0,
          moveZ: 0,
          sprint: false,
          jump: false,
          jumpPressed: false,
          jumpHeld: false,
          crouch: false,
          rotation: state.rotation,
        }, dt, BOUNDS, this.levelColliders);
        seqs[id] = this._lastSeq?.get(id) ?? 0;
      } else {
        for (const input of queue) {
          simulateTick(state, input, dt, BOUNDS, this.levelColliders);
          seqs[id] = input.seq;
        }
        if (!this._lastSeq) this._lastSeq = new Map();
        this._lastSeq.set(id, seqs[id]);
        queue.length = 0;
      }
    }

    const playersObj = Object.fromEntries(this.players);
    for (const pred of this.predators) {
      const hit = simulatePredatorTick(pred, playersObj, dt, this.levelColliders, this.levelNavMesh);
      if (hit) {
        const target = this.players.get(hit.playerId);
        if (target && target.alive) {
          target.health -= hit.damage;
          if (target.health <= 0) {
            target.health = 0;
            target.alive = false;
            target.animState = 'death';
          }
          target.velocity.x += hit.knockbackX;
          target.velocity.z += hit.knockbackZ;
        }
      }
    }

    const snapshot = {
      type: 'snapshot',
      tick: Date.now(),
      seqs,
      players: playersObj,
      predators: this.predators.map(serializePredatorState),
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
}
