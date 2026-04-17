/**
 * Shared rope definitions. Client and server agree on placement, length,
 * and segment count. Server is authoritative for segment positions.
 */

export const ROPE_SEGMENT_RADIUS = 0.06;
export const ROPE_GRAB_RANGE = 0.9;

export const DEFAULT_ROPE_LENGTH = 2.4;
export const DEFAULT_ROPE_SEGMENTS = 8;
export const MIN_ROPE_LENGTH = 0.5;
export const MAX_ROPE_LENGTH = 12;
export const MIN_ROPE_SEGMENTS = 3;
export const MAX_ROPE_SEGMENTS = 32;

function clampNumber(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function cloneAnchor(anchor) {
  return {
    x: Number(anchor?.x ?? 0),
    y: Number(anchor?.y ?? 3.2),
    z: Number(anchor?.z ?? 0),
  };
}

export function normalizeRope(entry = {}) {
  const id = typeof entry.id === 'string' && entry.id
    ? entry.id
    : `rope-${Math.random().toString(36).slice(2, 8)}`;
  const name = typeof entry.name === 'string' && entry.name.length
    ? entry.name
    : `rope-${id.slice(-5)}`;
  return {
    id,
    name,
    anchor: cloneAnchor(entry.anchor ?? entry.position),
    length: clampNumber(entry.length, MIN_ROPE_LENGTH, MAX_ROPE_LENGTH, DEFAULT_ROPE_LENGTH),
    segmentCount: Math.round(
      clampNumber(entry.segmentCount, MIN_ROPE_SEGMENTS, MAX_ROPE_SEGMENTS, DEFAULT_ROPE_SEGMENTS),
    ),
    deleted: entry.deleted === true,
  };
}

export const ROPES = Object.freeze([
  normalizeRope({
    id: 'rope-test-0',
    anchor: { x: 0, y: 3.2, z: 0 },
    length: 2.4,
    segmentCount: 8,
  }),
]);
