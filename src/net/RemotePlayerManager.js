/**
 * Manages spawning, interpolating, and removing remote player Mouse entities.
 */
import * as THREE from 'three';
import { Mouse } from '../entities/Mouse.js';
import { EmoteManager } from '../emote/EmoteManager.js';
import { attachEdgeOutlines } from '../materials/index.js';
import { getAudioManager } from '../audio/AudioManager.js';

const LERP_SPEED = 12;

// Distinct fur colors for remote players
const REMOTE_COLORS = [
  '#8ec8e8', '#e88e8e', '#8ee8a8', '#d8a8e8',
  '#e8d88e', '#8ed8d8', '#e8a88e', '#b8b8e8',
];

export class RemotePlayerManager {
  /** @type {Map<string, { mouse: Mouse, targetPos: THREE.Vector3, prevPos: THREE.Vector3, targetRot: number, animState: string, serverAlive: boolean, serverAnimState: string }>} */
  players = new Map();
  /** IDs currently being spawned (async) — prevents duplicate spawns */
  _spawning = new Set();

  constructor({ scene, rendererMode = 'webgl' }) {
    this.scene = scene;
    this.rendererMode = rendererMode;
    this._colorIndex = 0;
  }

  /** Sync with latest snapshot from NetworkClient.remotePlayers */
  sync(remotePlayers) {
    // Spawn new players
    for (const [id, data] of remotePlayers) {
      if (!this.players.has(id) && !this._spawning.has(id)) {
        this._spawn(id, data);
      } else if (this.players.has(id)) {
        const entry = this.players.get(id);
        entry.targetPos.set(
          data.position?.x ?? 0,
          (data.position?.y ?? 0) + entry.mouse.groundOffset,
          data.position?.z ?? 0,
        );
        entry.targetRot = data.rotation ?? 0;
        entry.serverAlive = data.alive !== false;
        entry.serverAnimState = data.animState ?? 'idle';
        if (data.emote && !entry.emoteManager.isPlaying) {
          entry.emoteManager.play(data.emote);
        } else if (!data.emote && entry.emoteManager.isPlaying) {
          entry.emoteManager.cancel();
        }
      }
    }

    // Remove disconnected players
    for (const [id, entry] of this.players) {
      if (!remotePlayers.has(id)) {
        this.scene.remove(entry.mouse);
        entry.mouse.dispose();
        this.players.delete(id);
      }
    }
    // Cancel pending spawns for disconnected players
    for (const id of this._spawning) {
      if (!remotePlayers.has(id)) {
        this._spawning.delete(id);
      }
    }
  }

  /** Interpolate remote players toward their target positions */
  update(dt) {
    const t = Math.min(1, dt * LERP_SPEED);
    for (const entry of this.players.values()) {
      entry.prevPos.copy(entry.mouse.position);
      entry.mouse.position.lerp(entry.targetPos, t);

      // Smooth rotation
      let diff = entry.targetRot - entry.mouse.rotation.y;
      if (diff > Math.PI) diff -= Math.PI * 2;
      if (diff < -Math.PI) diff += Math.PI * 2;
      entry.mouse.rotation.y += diff * t;

      // Derive animation from actual interpolated movement speed
      const dx = entry.mouse.position.x - entry.prevPos.x;
      const dz = entry.mouse.position.z - entry.prevPos.z;
      const speed = dt > 0 ? Math.sqrt(dx * dx + dz * dz) / dt : 0;

      let animState;
      if (!entry.serverAlive || entry.serverAnimState === 'death') {
        animState = 'death';
      } else if (entry.emoteManager.isPlaying) {
        animState = entry.animState;
      } else if (speed > 5) {
        animState = 'run';
      } else if (speed > 0.5) {
        animState = 'walk';
      } else {
        animState = 'idle';
      }

      if (animState !== entry.animState) {
        entry.animState = animState;
        entry.mouse.setAnimationState(animState);
      }

      entry.emoteManager.update(dt);
      entry.mouse.update(dt);
    }
  }

  async _spawn(id, data) {
    this._spawning.add(id);

    const color = REMOTE_COLORS[this._colorIndex % REMOTE_COLORS.length];
    this._colorIndex++;

    const mouse = new Mouse({
      furColor: color,
      rendererMode: this.rendererMode,
    });
    mouse.name = `RemoteMouse_${id}`;

    await mouse.ready;

    // Player may have disconnected while we were loading
    if (!this._spawning.has(id)) {
      mouse.dispose();
      return;
    }
    this._spawning.delete(id);

    const groundY = (data.position?.y ?? 0) + mouse.groundOffset;
    mouse.position.set(
      data.position?.x ?? 0,
      groundY,
      data.position?.z ?? 0,
    );
    attachEdgeOutlines(mouse, { color: '#090909', thresholdAngle: 24, opacity: 0.95, batch: false });
    this.scene.add(mouse);

    const audioManager = getAudioManager();
    const emoteManager = new EmoteManager({ mouse, audioManager });

    this.players.set(id, {
      mouse,
      emoteManager,
      targetPos: new THREE.Vector3(
        data.position?.x ?? 0,
        groundY,
        data.position?.z ?? 0,
      ),
      prevPos: new THREE.Vector3(
        data.position?.x ?? 0,
        groundY,
        data.position?.z ?? 0,
      ),
      targetRot: data.rotation ?? 0,
      animState: 'idle',
      serverAlive: data.alive !== false,
      serverAnimState: data.animState ?? 'idle',
    });
  }

  dispose() {
    for (const entry of this.players.values()) {
      this.scene.remove(entry.mouse);
      entry.mouse.dispose();
    }
    this.players.clear();
    this._spawning.clear();
  }
}
