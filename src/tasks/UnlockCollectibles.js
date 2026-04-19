import * as THREE from 'three';
import { COLLECTIBLE_PICKUP_RADIUS } from '../../shared/heroUnlocks.js';

const KIND_STYLE = {
  sewing: { color: 0xd486a8, emissive: 0x5a2e45 },
  speed: { color: 0x6fb4ff, emissive: 0x234a78 },
};

/**
 * Renders server-scattered hero-unlock collectibles as small floating orbs.
 * Polls each frame for local-player proximity and fires the pickup message
 * (server validates and broadcasts removal).
 */
export class UnlockCollectibles {
  constructor({ scene, net, getPlayer }) {
    this.scene = scene;
    this.net = net;
    this.getPlayer = getPlayer;
    this.root = new THREE.Group();
    this.root.name = 'UnlockCollectibles';
    scene.add(this.root);
    /** itemId -> { mesh, item } */
    this.items = new Map();
    /** itemIds we've already sent a pickup for (avoid spamming). */
    this._pending = new Set();
    this._tmp = new THREE.Vector3();
    this._time = 0;
  }

  _buildMesh(kind) {
    const style = KIND_STYLE[kind] ?? KIND_STYLE.sewing;
    const geo = kind === 'speed'
      ? new THREE.OctahedronGeometry(0.16, 0)
      : new THREE.SphereGeometry(0.13, 10, 8);
    const mat = new THREE.MeshStandardMaterial({
      color: style.color,
      emissive: style.emissive,
      emissiveIntensity: 0.55,
      roughness: 0.5,
    });
    return new THREE.Mesh(geo, mat);
  }

  _sync() {
    const serverItems = this.net?.unlockItems;
    if (!Array.isArray(serverItems)) return;
    const seen = new Set();
    for (const item of serverItems) {
      if (!item || item.consumed) continue;
      seen.add(item.id);
      if (this.items.has(item.id)) continue;
      const mesh = this._buildMesh(item.kind);
      mesh.position.set(item.x, (item.y ?? 0) + 0.25, item.z);
      mesh.userData.itemId = item.id;
      mesh.userData.baseY = mesh.position.y;
      this.root.add(mesh);
      this.items.set(item.id, { mesh, item });
    }
    // Remove any we have that the server no longer reports.
    for (const [id, entry] of this.items) {
      if (!seen.has(id)) {
        this.root.remove(entry.mesh);
        entry.mesh.geometry?.dispose?.();
        entry.mesh.material?.dispose?.();
        this.items.delete(id);
        this._pending.delete(id);
      }
    }
  }

  update(dt) {
    this._sync();
    this._time += dt;
    const player = this.getPlayer?.();
    const px = player?.position?.x ?? 0;
    const pz = player?.position?.z ?? 0;
    const py = player?.position?.y ?? 0;
    const rSq = COLLECTIBLE_PICKUP_RADIUS * COLLECTIBLE_PICKUP_RADIUS;
    for (const [id, entry] of this.items) {
      // Gentle bob + spin so items read as interactive.
      entry.mesh.position.y = entry.mesh.userData.baseY + Math.sin(this._time * 2.4 + entry.item.x) * 0.05;
      entry.mesh.rotation.y += dt * 1.6;
      if (!player || this._pending.has(id)) continue;
      const dx = entry.item.x - px;
      const dz = entry.item.z - pz;
      const dy = (entry.item.y ?? 0) - py;
      if (dx * dx + dz * dz + dy * dy * 0.25 < rSq) {
        this._pending.add(id);
        this.net?.sendUnlockPickup?.(id);
      }
    }
  }

  dispose() {
    for (const entry of this.items.values()) {
      this.root.remove(entry.mesh);
      entry.mesh.geometry?.dispose?.();
      entry.mesh.material?.dispose?.();
    }
    this.items.clear();
    this.scene.remove(this.root);
  }
}
