/**
 * Server-side validation for dev layout sync payloads (DoS / malformed input).
 */

const MAX_PRIMITIVES = 2500;
const MAX_ROPES = 32;
const MAX_ROPE_SEGMENTS = 32;
const MAX_EXTRACTION_PORTALS = 8;
const MAX_RAID_TASKS = 64;

/**
 * @param {unknown} layout
 * @returns {boolean}
 */
export function isValidDevSyncLayout(layout) {
  if (!layout || typeof layout !== 'object' || Array.isArray(layout)) return false;
  const primitives = /** @type {any} */ (layout).primitives;
  if (!Array.isArray(primitives) || primitives.length > MAX_PRIMITIVES) return false;

  for (const p of primitives) {
    if (!p || typeof p !== 'object' || Array.isArray(p)) return false;
    if (p.deleted === true || p.collider === false) continue;
    if (p.type != null && (typeof p.type !== 'string' || p.type.length > 32)) return false;
  }

  const ropes = /** @type {any} */ (layout).ropes;
  if (ropes != null) {
    if (!Array.isArray(ropes) || ropes.length > MAX_ROPES) return false;
    for (const r of ropes) {
      if (!r || typeof r !== 'object' || Array.isArray(r)) return false;
      if (r.deleted === true) continue;
      if (typeof r.id !== 'string' || r.id.length > 64) return false;
      if (!r.anchor || typeof r.anchor !== 'object') return false;
      for (const axis of ['x', 'y', 'z']) {
        const v = r.anchor[axis];
        if (typeof v !== 'number' || !Number.isFinite(v)) return false;
      }
      if (typeof r.length !== 'number' || !Number.isFinite(r.length) || r.length <= 0 || r.length > 32) return false;
      if (!Number.isInteger(r.segmentCount) || r.segmentCount < 2 || r.segmentCount > MAX_ROPE_SEGMENTS) return false;
      if (r.segmentRadius != null) {
        if (typeof r.segmentRadius !== 'number' || !Number.isFinite(r.segmentRadius) || r.segmentRadius < 0.02 || r.segmentRadius > 0.12) {
          return false;
        }
      }
      if (r.color != null && (typeof r.color !== 'string' || r.color.length > 16)) return false;
      if (r.texture != null) {
        if (typeof r.texture !== 'object' || Array.isArray(r.texture)) return false;
        if (typeof r.texture.atlas !== 'string' || r.texture.atlas.length > 16) return false;
        if (typeof r.texture.cell !== 'number' || !Number.isFinite(r.texture.cell)) return false;
      }
    }
  }

  const extractionPortals = /** @type {any} */ (layout).extractionPortals;
  if (extractionPortals != null) {
    if (!Array.isArray(extractionPortals) || extractionPortals.length > MAX_EXTRACTION_PORTALS) return false;
    for (const e of extractionPortals) {
      if (!e || typeof e !== 'object' || Array.isArray(e)) return false;
      if (e.deleted === true) continue;
      if (typeof e.id !== 'string' || e.id.length > 64) return false;
      if (!e.position || typeof e.position !== 'object') return false;
      for (const axis of ['x', 'y', 'z']) {
        const v = e.position[axis];
        if (typeof v !== 'number' || !Number.isFinite(v)) return false;
      }
      if (e.radius != null && (typeof e.radius !== 'number' || !Number.isFinite(e.radius) || e.radius <= 0 || e.radius > 8)) {
        return false;
      }
    }
  }

  const raidTasks = /** @type {any} */ (layout).raidTasks;
  if (raidTasks != null) {
    if (!Array.isArray(raidTasks) || raidTasks.length > MAX_RAID_TASKS) return false;
    for (const t of raidTasks) {
      if (!t || typeof t !== 'object' || Array.isArray(t)) return false;
      if (t.deleted === true) continue;
      if (typeof t.id !== 'string' || t.id.length > 64) return false;
      if (typeof t.taskType !== 'string' || t.taskType.length > 32) return false;
      if (!t.position || typeof t.position !== 'object') return false;
      for (const axis of ['x', 'y', 'z']) {
        const v = t.position[axis];
        if (typeof v !== 'number' || !Number.isFinite(v)) return false;
      }
    }
  }

  return true;
}
