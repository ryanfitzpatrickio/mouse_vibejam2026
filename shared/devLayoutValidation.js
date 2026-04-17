/**
 * Server-side validation for dev layout sync payloads (DoS / malformed input).
 */

const MAX_PRIMITIVES = 2500;
const MAX_ROPES = 32;
const MAX_ROPE_SEGMENTS = 32;

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
    }
  }

  return true;
}
