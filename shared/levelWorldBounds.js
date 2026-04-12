/**
 * Authoritative XZ bounds for the kitchen level (room centered at origin).
 * Physics, predators, multiplayer, and the build grid should stay aligned with these.
 */
export const LEVEL_ROOM_WIDTH = 96;
export const LEVEL_ROOM_DEPTH = 96;

export const LEVEL_WORLD_BOUNDS_XZ = Object.freeze({
  minX: -LEVEL_ROOM_WIDTH * 0.5,
  maxX: LEVEL_ROOM_WIDTH * 0.5,
  minZ: -LEVEL_ROOM_DEPTH * 0.5,
  maxZ: LEVEL_ROOM_DEPTH * 0.5,
});

/** Default build grid counts so cell size stays 2×2 at 96×96 (was 24×24 at 48×48). */
export const LEVEL_BUILD_GRID_COLUMNS = 48;
export const LEVEL_BUILD_GRID_ROWS = 48;
