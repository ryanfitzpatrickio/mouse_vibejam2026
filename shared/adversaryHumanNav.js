import {
  createDefaultQueryFilter,
  createFindNearestPolyResult,
  findNearestPoly,
} from 'navcat';
import { NAV_AGENT_CONFIGS } from './navConfig.js';

const FILTER = createDefaultQueryFilter();
const RESULT = createFindNearestPolyResult();

/**
 * Keep the player-controlled human on its extra-clearance navmesh.
 * The navmesh bake owns wall/prefab clearance; this function only projects
 * the simulated position back to the nearest valid human point.
 */
export function constrainAdversaryHumanToNavMesh(state, navMesh, previousPosition = null) {
  if (!state?.isAdversary || state.adversaryRole !== 'human' || !navMesh) return false;
  const pos = state.position;
  if (!pos) return false;

  findNearestPoly(
    RESULT,
    navMesh,
    [pos.x ?? 0, pos.y ?? 0, pos.z ?? 0],
    NAV_AGENT_CONFIGS.adversaryHuman.queryHalfExtents,
    FILTER,
  );

  if (!RESULT.success) {
    if (previousPosition) {
      pos.x = previousPosition.x;
      pos.z = previousPosition.z;
    }
    return false;
  }

  const nx = RESULT.position[0];
  const ny = RESULT.position[1];
  const nz = RESULT.position[2];
  const dx = nx - (pos.x ?? 0);
  const dz = nz - (pos.z ?? 0);
  const maxSnap = NAV_AGENT_CONFIGS.adversaryHuman.maxSnapDistance;
  if ((dx * dx + dz * dz) > maxSnap * maxSnap) {
    if (previousPosition) {
      pos.x = previousPosition.x;
      pos.z = previousPosition.z;
    }
    return false;
  }

  if ((dx * dx + dz * dz) < 0.0064) return true;

  pos.x = nx;
  pos.z = nz;
  return true;
}
