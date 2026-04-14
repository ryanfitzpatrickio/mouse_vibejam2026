/**
 * Single source for Roomba visual scale vs server physics (must stay in sync with `src/entities/Roomba.js` mesh).
 */

export const ROOMBA_MESH_SCALE = 4.5;
/** Torus outer reach (major 0.37 + tube 0.026) × scale — XZ footprint for colliders + cannon cylinder. */
export const ROOMBA_RADIUS_XZ = (0.37 + 0.026) * ROOMBA_MESH_SCALE;
/** Cylinder body height (disc 0.1) × scale. */
export const ROOMBA_BODY_HEIGHT = 0.1 * ROOMBA_MESH_SCALE;
