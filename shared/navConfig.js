import { ROOMBA_BODY_HEIGHT, ROOMBA_RADIUS_XZ } from './roombaDimensions.js';

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
  /** Bake + runtime queries for the vacuum disk (`kitchen-roomba-navmesh.generated.js`). */
  roomba: Object.freeze({
    /** Recast agent radius — must match `ROOMBA_RADIUS_XZ` so paths clear real furniture gaps. */
    walkableRadiusWorld: Math.min(ROOMBA_RADIUS_XZ, 1.72),
    walkableClimbWorld: 0.22,
    walkableHeightWorld: Math.max(0.9, ROOMBA_BODY_HEIGHT + 0.42),
    queryHalfExtents: Object.freeze([
      Math.max(2.2, ROOMBA_RADIUS_XZ + 0.45),
      2.8,
      Math.max(2.2, ROOMBA_RADIUS_XZ + 0.45),
    ]),
  }),
  /** Coarse, extra-clearance map for player-controlled human adversary locomotion. */
  adversaryHuman: Object.freeze({
    walkableRadiusWorld: 0.95,
    walkableClimbWorld: 0.28,
    walkableHeightWorld: 2.4,
    cellSize: 0.45,
    cellHeight: 0.15,
    minRegionArea: 5,
    mergeRegionArea: 14,
    maxSimplificationError: 1.8,
    maxEdgeLength: 8,
    queryHalfExtents: Object.freeze([2.0, 3.0, 2.0]),
    maxSnapDistance: 1.15,
  }),
});

export function normalizeNavArea(value) {
  return value === NAV_AREA_TYPES.MOUSE_ONLY ? NAV_AREA_TYPES.MOUSE_ONLY : NAV_AREA_TYPES.DEFAULT;
}
