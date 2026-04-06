/**
 * Mouse Trouble — authoritative game server (Phase 2)
 *
 * Server owns all player physics. Clients send inputs,
 * server simulates and broadcasts authoritative state.
 */
import { createPlayerState, simulateTick } from '../shared/physics.js';
import { buildRoomCollidersFromLayout } from '../shared/roomCollision.js';
import kitchenLayout from '../shared/kitchen-layout.generated.js';

const TICK_RATE = 30;
const TICK_MS = 1000 / TICK_RATE;
const MAX_PLAYERS = 8;

// Room bounds (matches Room default: width=48, depth=48, scale=1 → half = 24)
const BOUNDS = Object.freeze({
  minX: -24,
  maxX: 24,
  minZ: -24,
  maxZ: 24,
});

export default class GameServer {
  /** @type {Map<string, ReturnType<typeof createPlayerState>>} */
  players = new Map();
  /** @type {Map<string, object[]>} queued inputs per player */
  inputQueues = new Map();
  tickInterval = null;
  levelColliders = buildRoomCollidersFromLayout(kitchenLayout, { scaleFactor: 1 });

  constructor(room) {
    this.room = room;
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
    // Spread spawn positions so players don't stack
    const angle = this.players.size * (Math.PI * 2 / MAX_PLAYERS);
    state.position.x = Math.cos(angle) * 2;
    state.position.z = Math.sin(angle) * 2;

    this.players.set(conn.id, state);
    this.inputQueues.set(conn.id, []);

    conn.send(JSON.stringify({
      type: 'init',
      id: conn.id,
      players: Object.fromEntries(this.players),
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
        // Cap queue length to prevent flooding (max ~4 ticks worth)
        if (queue.length < 8) {
          queue.push({
            moveX: data.moveX ?? 0,
            moveZ: data.moveZ ?? 0,
            sprint: !!data.sprint,
            jump: !!data.jump,
            crouch: !!data.crouch,
            rotation: data.rotation ?? 0,
            seq: data.seq ?? 0,
          });
        }
      }
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
    if (this.players.size === 0) return;

    const dt = TICK_MS / 1000;

    // Simulate each player — process ALL queued inputs, not just the latest
    const seqs = {};
    for (const [id, state] of this.players) {
      const queue = this.inputQueues.get(id);
      if (!queue || queue.length === 0) {
        // No new input — simulate with idle input to keep physics consistent
        simulateTick(state, { moveX: 0, moveZ: 0, sprint: false, jump: false, crouch: false, rotation: state.rotation }, dt, BOUNDS, this.levelColliders);
        seqs[id] = this._lastSeq?.get(id) ?? 0;
      } else {
        // Process every queued input with one tick each
        for (const input of queue) {
          simulateTick(state, input, dt, BOUNDS, this.levelColliders);
          seqs[id] = input.seq;
        }
        // Track last seq for idle ticks
        if (!this._lastSeq) this._lastSeq = new Map();
        this._lastSeq.set(id, seqs[id]);
        // Drain the queue
        queue.length = 0;
      }
    }

    const snapshot = {
      type: 'snapshot',
      tick: Date.now(),
      seqs,
      players: Object.fromEntries(this.players),
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
