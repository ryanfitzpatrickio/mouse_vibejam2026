import { assetUrl } from '../utils/assetUrl.js';

const STORAGE_KEY = 'dressingRoom:avatarPortraits:v1';

const DEFAULT_AVATAR_PORTRAITS = Object.freeze({
  brain: Object.freeze({
    src: 'brain-portrait (2).png',
    positionX: 50,
    positionY: 100,
    scale: 1.02,
  }),
  jerry: Object.freeze({
    src: 'jerry-portrait (2).png',
    positionX: 50,
    positionY: 100,
    scale: 1.04,
  }),
  gus: Object.freeze({
    src: 'gus-portrait (2).png',
    positionX: 50,
    positionY: 100,
    scale: 1.04,
  }),
  speedy: Object.freeze({
    src: 'speedy-portrait (2).png',
    positionX: 50,
    positionY: 100,
    scale: 1.04,
  }),
});

export const AVATAR_PORTRAIT_KEYS = Object.freeze(Object.keys(DEFAULT_AVATAR_PORTRAITS));
const POSITION_MIN = -50;
const POSITION_MAX = 150;
const DEFAULT_POSITION_X = 50;
const DEFAULT_POSITION_Y = 100;
const SCALE_MIN = 0.25;
const SCALE_MAX = 3;
const DEFAULT_SCALE = 1;

function clamp(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

function clonePortrait(portrait) {
  return {
    src: portrait.src,
    positionX: portrait.positionX,
    positionY: portrait.positionY,
    scale: portrait.scale,
  };
}

function normalizeSource(src) {
  if (src == null) return null;
  const trimmed = String(src).trim();
  return trimmed || null;
}

function resolvePortraitSrc(src) {
  if (!src) return null;
  if (/^(data:|blob:|https?:)/i.test(src)) return src;
  if (src.startsWith('/')) return src;
  return assetUrl(encodeURI(src));
}

function readOverrides() {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeOverrides(map) {
  if (typeof window === 'undefined') return true;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
    return true;
  } catch {
    return false;
  }
}

/** @type {Map<string, Set<(portrait: ReturnType<typeof getAvatarPortrait>) => void>>} */
const subscribers = new Map();

function notify(modelKey) {
  const set = subscribers.get(modelKey);
  if (!set) return;
  const portrait = getAvatarPortrait(modelKey);
  for (const fn of set) {
    try { fn(portrait); } catch { /* keep notifying */ }
  }
}

export function hasAvatarPortrait(modelKey) {
  return !!DEFAULT_AVATAR_PORTRAITS[modelKey];
}

export function getAvatarPortrait(modelKey) {
  const def = DEFAULT_AVATAR_PORTRAITS[modelKey];
  if (!def) return null;
  const overrides = readOverrides();
  const override = overrides[modelKey] ?? {};
  const src = normalizeSource(override.src) ?? def.src;
  const merged = clonePortrait(def);
  merged.src = src;
  merged.positionX = clamp(override.positionX, POSITION_MIN, POSITION_MAX, def.positionX);
  merged.positionY = clamp(override.positionY, POSITION_MIN, POSITION_MAX, def.positionY);
  merged.scale = clamp(override.scale, SCALE_MIN, SCALE_MAX, def.scale);
  merged.resolvedSrc = resolvePortraitSrc(src);
  merged.basePositionX = DEFAULT_POSITION_X;
  merged.basePositionY = DEFAULT_POSITION_Y;
  merged.translateX = merged.positionX - DEFAULT_POSITION_X;
  merged.translateY = merged.positionY - DEFAULT_POSITION_Y;
  return merged;
}

export function setAvatarPortrait(modelKey, patch) {
  if (!DEFAULT_AVATAR_PORTRAITS[modelKey]) return false;
  const overrides = readOverrides();
  const next = { ...(overrides[modelKey] ?? {}) };
  if (patch.src !== undefined) {
    if (patch.src == null || String(patch.src).trim() === '') delete next.src;
    else next.src = String(patch.src);
  }
  if (patch.positionX !== undefined) next.positionX = clamp(patch.positionX, POSITION_MIN, POSITION_MAX, DEFAULT_POSITION_X);
  if (patch.positionY !== undefined) next.positionY = clamp(patch.positionY, POSITION_MIN, POSITION_MAX, DEFAULT_POSITION_Y);
  if (patch.scale !== undefined) next.scale = clamp(patch.scale, SCALE_MIN, SCALE_MAX, DEFAULT_SCALE);
  overrides[modelKey] = next;
  if (!writeOverrides(overrides)) return false;
  notify(modelKey);
  return true;
}

export function resetAvatarPortrait(modelKey) {
  const overrides = readOverrides();
  if (overrides[modelKey]) {
    delete overrides[modelKey];
    if (!writeOverrides(overrides)) return false;
  }
  notify(modelKey);
  return true;
}

export function subscribeAvatarPortrait(modelKey, fn) {
  let set = subscribers.get(modelKey);
  if (!set) {
    set = new Set();
    subscribers.set(modelKey, set);
  }
  set.add(fn);
  return () => set.delete(fn);
}

export function exportAvatarPortraits() {
  const out = {};
  const overrides = readOverrides();
  for (const key of AVATAR_PORTRAIT_KEYS) {
    out[key] = getAvatarPortrait(key);
    out[key].__overridden = !!overrides[key];
  }
  return out;
}
