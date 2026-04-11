/**
 * Server-authoritative cheese pickups on the mouse navmesh (walkable surfaces).
 * Death drops merge into nearby piles; living players collect by proximity.
 */

import { findRandomPoint, createDefaultQueryFilter } from 'navcat';

const MOUSE_FILTER = createDefaultQueryFilter();

const MIN_SPAWN_SPACING_SQ = 1.12 * 1.12;
const MERGE_DIST_SQ = 0.55 * 0.55;
const PICKUP_R_SQ = 0.85 * 0.85;
const MAX_PICKUP_Y_DELTA = 0.72;

export const CHEESE_MAX_CARRIED = 9999;
export const CHEESE_WORLD_SPAWN_COUNT = 80;

/**
 * @param {unknown} n
 * @returns {number}
 */
export function clampCheeseCarried(n) {
  return Math.max(0, Math.min(CHEESE_MAX_CARRIED, Math.floor(Number(n) || 0)));
}

export class CheeseWorld {
  /** @type {{ id: string, x: number, y: number, z: number, amount: number }[]} */
  pickups = [];
  _seq = 1;
  /** @type {object | null} */
  _navMesh = null;

  /** @param {object | null} mouseNavMesh */
  setNavMesh(mouseNavMesh) {
    this._navMesh = mouseNavMesh;
  }

  /**
   * Scatter single wedges on random walkable points with spacing.
   * @param {() => number} rand
   */
  seedScatter(rand = Math.random) {
    this.pickups = [];
    if (!this._navMesh) return;

    const attemptsMax = CHEESE_WORLD_SPAWN_COUNT * 40;
    let tries = 0;
    while (this.pickups.length < CHEESE_WORLD_SPAWN_COUNT && tries < attemptsMax) {
      tries += 1;
      const g = findRandomPoint(this._navMesh, MOUSE_FILTER, rand);
      if (!g.success) continue;
      const x = g.position[0];
      const y = g.position[1];
      const z = g.position[2];
      let ok = true;
      for (const p of this.pickups) {
        const dx = p.x - x;
        const dz = p.z - z;
        if (dx * dx + dz * dz < MIN_SPAWN_SPACING_SQ) {
          ok = false;
          break;
        }
      }
      if (!ok) continue;
      this.pickups.push({
        id: `cz-${this._seq++}`,
        x: +x.toFixed(3),
        y: +y.toFixed(3),
        z: +z.toFixed(3),
        amount: 1,
      });
    }
  }

  /**
   * @param {{ x: number, y: number, z: number }} pos
   * @param {number} amount
   */
  mergeOrAddDrop(pos, amount) {
    const a = clampCheeseCarried(amount);
    if (a <= 0) return;
    for (const p of this.pickups) {
      const dx = p.x - pos.x;
      const dz = p.z - pos.z;
      if (dx * dx + dz * dz <= MERGE_DIST_SQ && Math.abs(p.y - pos.y) < 0.45) {
        p.amount = clampCheeseCarried(p.amount + a);
        return;
      }
    }
    this.pickups.push({
      id: `cz-${this._seq++}`,
      x: +pos.x.toFixed(3),
      y: +pos.y.toFixed(3),
      z: +pos.z.toFixed(3),
      amount: a,
    });
  }

  /**
   * @param {Map<string, { alive?: boolean, position: { x: number, y: number, z: number }, cheeseCarried?: number }>} players
   */
  collectFromPlayers(players) {
    for (const p of players.values()) {
      if (!p.alive) continue;
      const px = p.position.x;
      const py = p.position.y;
      const pz = p.position.z;
      for (let i = this.pickups.length - 1; i >= 0; i -= 1) {
        const c = this.pickups[i];
        const dx = c.x - px;
        const dz = c.z - pz;
        if (dx * dx + dz * dz > PICKUP_R_SQ) continue;
        if (Math.abs(c.y - py) > MAX_PICKUP_Y_DELTA) continue;
        p.cheeseCarried = clampCheeseCarried((p.cheeseCarried ?? 0) + c.amount);
        this.pickups.splice(i, 1);
      }
    }
  }

  /**
   * @param {{ position: { x: number, y: number, z: number }, cheeseCarried?: number }} playerState
   */
  onDeathDropCarried(playerState) {
    const a = clampCheeseCarried(playerState.cheeseCarried ?? 0);
    playerState.cheeseCarried = 0;
    if (a <= 0) return;
    this.mergeOrAddDrop(playerState.position, a);
  }

  serializePickups() {
    return this.pickups.map((p) => ({
      id: p.id,
      x: p.x,
      y: p.y,
      z: p.z,
      amount: p.amount,
    }));
  }
}
