/**
 * Extraction portal positions for the raid extract phase.
 * Uses layout JSON `extractionPortals` when present; otherwise falls back to
 * spread points inside level bounds (never depends on navmesh bake).
 */

import { LEVEL_WORLD_BOUNDS_XZ } from './levelWorldBounds.js';

const DEFAULT_COUNT = 3;

function clampPortal(entry, index) {
  const b = LEVEL_WORLD_BOUNDS_XZ;
  const pad = 2;
  const x = Number.isFinite(entry?.position?.x)
    ? entry.position.x
    : (index % 2 === 0 ? b.minX * 0.55 : b.maxX * 0.55);
  const y = Number.isFinite(entry?.position?.y) ? entry.position.y : 0;
  const z = Number.isFinite(entry?.position?.z)
    ? entry.position.z
    : (index === 0 ? b.minZ * 0.45 : index === 1 ? b.maxZ * 0.45 : 0);
  const r = Number(entry?.radius);
  return {
    id: typeof entry?.id === 'string' ? entry.id : `extract-${index}`,
    x: Math.min(b.maxX - pad, Math.max(b.minX + pad, x)),
    y,
    z: Math.min(b.maxZ - pad, Math.max(b.minZ + pad, z)),
    radius: Number.isFinite(r) && r > 0 ? r : 1.15,
  };
}

/**
 * @param {object | null} layout
 * @param {{ player: { x: number, y: number, z: number }[] }} spawnPoints
 * @returns {{ id: string, x: number, y: number, z: number, radius: number }[]}
 */
export function collectExtractionPortalsFromLayout(layout, spawnPoints) {
  const raw = layout?.extractionPortals;
  if (Array.isArray(raw) && raw.length > 0) {
    return raw
      .filter((e) => e?.deleted !== true)
      .slice(0, 8)
      .map((e, i) => clampPortal(e, i));
  }

  const playerSpawns = spawnPoints?.player?.length ? spawnPoints.player : [];
  const out = [];
  if (playerSpawns.length >= DEFAULT_COUNT) {
    const step = Math.max(1, Math.floor(playerSpawns.length / DEFAULT_COUNT));
    for (let i = 0; i < DEFAULT_COUNT; i += 1) {
      const p = playerSpawns[(i * step) % playerSpawns.length];
      out.push(clampPortal({ position: { x: p.x, y: p.y, z: p.z }, id: `extract-fallback-${i}` }, i));
    }
    return out;
  }

  const b = LEVEL_WORLD_BOUNDS_XZ;
  return [
    clampPortal({ position: { x: b.minX * 0.65, y: 0, z: b.minZ * 0.5 } }, 0),
    clampPortal({ position: { x: b.maxX * 0.65, y: 0, z: b.maxZ * 0.5 } }, 1),
    clampPortal({ position: { x: b.minX * 0.35, y: 0, z: b.maxZ * 0.55 } }, 2),
  ];
}
