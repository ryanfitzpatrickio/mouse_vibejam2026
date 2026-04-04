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

// Room bounds (matches Room default: width=8, depth=8, scale=4 → half = 16)
const BOUNDS = Object.freeze({
  minX: -16,
  maxX: 16,
  minZ: -16,
  maxZ: 16,
});

export default class GameServer {
  /** @type {Map<string, ReturnType<typeof createPlayerState>>} */
  players = new Map();
  /** @type {Map<string, object>} */
  pendingInputs = new Map();
  tickInterval = null;
  levelColliders = buildRoomCollidersFromLayout(kitchenLayout, { scaleFactor: 4 });

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
    this.pendingInputs.set(conn.id, { moveX: 0, moveZ: 0, sprint: false, jump: false, crouch: false, rotation: 0, seq: 0 });

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
      this.pendingInputs.set(sender.id, {
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

  onClose(conn) {
    this.players.delete(conn.id);
    this.pendingInputs.delete(conn.id);
    this.broadcast(JSON.stringify({
      type: 'player-left',
      id: conn.id,
    }));
  }

  tick() {
    if (this.players.size === 0) return;

    const dt = TICK_MS / 1000;

    // Simulate each player with their latest input
    const seqs = {};
    for (const [id, state] of this.players) {
      const input = this.pendingInputs.get(id);
      if (input) {
        // Clear one-shot inputs after applying
        const tickInput = { ...input };
        simulateTick(state, tickInput, dt, BOUNDS, this.levelColliders);
        seqs[id] = input.seq;
        // Reset one-shot flags so they don't repeat next tick
        input.jump = false;
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
