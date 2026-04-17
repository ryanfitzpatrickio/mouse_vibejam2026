/**
 * Clamp client movement input before server simulation (anti-grief / NaN guard).
 */

const MAX_SEQ = Number.MAX_SAFE_INTEGER;
const ALLOWED_EMOTES = new Set([
  'wave',
  'dance',
  'laugh',
  'cry',
  'angry',
  'love',
  'thumbsup',
  'scream',
]);

function clampUnit(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.max(-1, Math.min(1, n));
}

function clampRotation(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.max(-1e5, Math.min(1e5, n));
}

function clampSeq(v) {
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(Math.floor(n), MAX_SEQ);
}

function sanitizeEmote(value) {
  if (typeof value !== 'string') return null;
  return ALLOWED_EMOTES.has(value) ? value : null;
}

/**
 * @param {object} data Raw parsed JSON from client
 * @returns {object} Safe fields for simulateTick queue
 */
export function sanitizePlayerInputMessage(data) {
  return {
    moveX: clampUnit(data.moveX),
    moveZ: clampUnit(data.moveZ),
    sprint: !!data.sprint,
    jump: !!(data.jumpPressed ?? data.jump),
    jumpPressed: !!(data.jumpPressed ?? data.jump),
    jumpHeld: !!(data.jumpHeld ?? data.jumpPressed ?? data.jump),
    crouch: !!data.crouch,
    rotation: clampRotation(data.rotation),
    emote: sanitizeEmote(data.emote),
    grab: !!data.grab,
    smack: !!data.smack,
    ropeGrab: !!data.ropeGrab,
    /** Hold E — extraction progress during extract phase. */
    interactHeld: !!data.interactHeld,
    seq: clampSeq(data.seq),
  };
}
