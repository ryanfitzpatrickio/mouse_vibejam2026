export const NAV_AREA_TYPES = Object.freeze({
  DEFAULT: 'default',
  MOUSE_ONLY: 'mouse-only',
});

export const NAV_POLY_FLAGS = Object.freeze({
  DEFAULT: 1,
  MOUSE_ONLY: 1 << 1,
});

export const NAV_POLY_AREA_IDS = Object.freeze({
  DEFAULT: 0,
  MOUSE_ONLY: 1,
});

export const NAV_AGENT_CONFIGS = Object.freeze({
  cat: Object.freeze({
    walkableRadiusWorld: 0.55,
    walkableClimbWorld: 0.25,
    walkableHeightWorld: 1.35,
    queryHalfExtents: Object.freeze([1.5, 2.0, 1.5]),
  }),
  mouse: Object.freeze({
    walkableRadiusWorld: 0.24,
    walkableClimbWorld: 0.2,
    walkableHeightWorld: 0.72,
    queryHalfExtents: Object.freeze([0.8, 1.0, 0.8]),
  }),
});

export function normalizeNavArea(value) {
  return value === NAV_AREA_TYPES.MOUSE_ONLY ? NAV_AREA_TYPES.MOUSE_ONLY : NAV_AREA_TYPES.DEFAULT;
}
