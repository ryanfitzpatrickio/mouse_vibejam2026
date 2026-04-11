/**
 * Server-side validation for dev layout sync payloads (DoS / malformed input).
 */

const MAX_PRIMITIVES = 2500;

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
  return true;
}
