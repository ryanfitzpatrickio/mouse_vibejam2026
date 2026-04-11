/**
 * Server-side mouse bot steering on the mouse navmesh (includes mouse-only areas).
 * Cats use the cat navmesh in predator.js; bots must use the mouse nav mesh only.
 */

import {
  findPath,
  createDefaultQueryFilter,
  findRandomPoint,
  findRandomPointAroundCircle,
  findNearestPoly,
  createFindNearestPolyResult,
} from 'navcat';
import { NAV_AGENT_CONFIGS } from './navConfig.js';

const MOUSE_NAV_FILTER = createDefaultQueryFilter();
const MOUSE_HALF_EXTENTS = NAV_AGENT_CONFIGS.mouse.queryHalfExtents;

const REPATH_INTERVAL = 0.35;
const WAYPOINT_REACH_DIST_SQ = 0.38 * 0.38;
const TARGET_REPATH_DIST_SQ = 0.7 * 0.7;
const WANDER_TIMER_MIN = 1.35;
const WANDER_TIMER_MAX = 3.8;
const FLEE_DURATION = 2.8;
const FLEE_TRIGGER_DIST = 8.2;
const FLEE_RUN_DISTANCE = 6;

/** Prefer goals at least this far from other alive players (reduces clumping). */
const PEER_GOAL_SEPARATION = 3.8;
const PEER_GOAL_SEPARATION_SQ = PEER_GOAL_SEPARATION * PEER_GOAL_SEPARATION;

const _nearestPolyScratch = createFindNearestPolyResult();
const _nearestCenterScratch = [0, 0, 0];

function distSqXZ(a, b) {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  return dx * dx + dz * dz;
}

function normalizeXZ(x, z) {
  const len = Math.sqrt(x * x + z * z);
  if (len < 1e-4) return { x: 0, z: 0 };
  return { x: x / len, z: z / len };
}

function clampXZ(x, z, bounds, pad) {
  const r = pad ?? 0.35;
  return {
    x: Math.min(bounds.maxX - r, Math.max(bounds.minX + r, x)),
    y: 0,
    z: Math.min(bounds.maxZ - r, Math.max(bounds.minZ + r, z)),
  };
}

function rebuildBotPath(brain, from, to, navMesh) {
  const result = findPath(
    navMesh,
    [from.x, from.y, from.z],
    [to.x, to.y, to.z],
    MOUSE_HALF_EXTENTS,
    MOUSE_NAV_FILTER,
  );
  brain.navTarget = { x: to.x, y: to.y, z: to.z };
  brain.navRepathTimer = REPATH_INTERVAL;

  if (!result.success || !Array.isArray(result.path) || result.path.length === 0) {
    brain.navPath = [];
    brain.navPathIndex = 0;
    return false;
  }

  brain.navPath = result.path.map((p) => ({
    x: p.position[0],
    y: p.position[1],
    z: p.position[2],
  }));
  brain.navPathIndex = brain.navPath.length > 1 ? 1 : 0;
  return true;
}

function shouldRepath(brain, target) {
  if (brain.navRepathTimer <= 0) return true;
  if (!brain.navPath?.length) return true;
  if (brain.navPathIndex >= brain.navPath.length) return true;
  if (!brain.navTarget || !target) return true;
  return distSqXZ(brain.navTarget, target) >= TARGET_REPATH_DIST_SQ;
}

function isGoalTooCloseToPeers(goal, peerPositions) {
  if (!peerPositions?.length) return false;
  for (const p of peerPositions) {
    const dx = goal.x - p.x;
    const dz = goal.z - p.z;
    if (dx * dx + dz * dz < PEER_GOAL_SEPARATION_SQ) return true;
  }
  return false;
}

/**
 * Pick a walkable exploration point spread across the navmesh, with mild separation from peers.
 */
function pickExploreGoal(state, navMesh, bounds, spawnPoints, peerPositions, rand) {
  for (let attempt = 0; attempt < 18; attempt += 1) {
    let pos = null;

    if (navMesh) {
      const tryRegional = rand() < 0.4;
      if (tryRegional) {
        _nearestCenterScratch[0] = state.position.x;
        _nearestCenterScratch[1] = state.position.y;
        _nearestCenterScratch[2] = state.position.z;
        findNearestPoly(
          _nearestPolyScratch,
          navMesh,
          _nearestCenterScratch,
          MOUSE_HALF_EXTENTS,
          MOUSE_NAV_FILTER,
        );
        if (_nearestPolyScratch.success) {
          const maxRadius = 11 + rand() * 13;
          const local = findRandomPointAroundCircle(
            navMesh,
            _nearestPolyScratch.nodeRef,
            _nearestPolyScratch.position,
            maxRadius,
            MOUSE_NAV_FILTER,
            rand,
          );
          if (local.success) {
            pos = {
              x: local.position[0],
              y: local.position[1],
              z: local.position[2],
            };
          }
        }
      }
      if (!pos) {
        const g = findRandomPoint(navMesh, MOUSE_NAV_FILTER, rand);
        if (g.success) {
          pos = {
            x: g.position[0],
            y: g.position[1],
            z: g.position[2],
          };
        }
      }
    }

    if (!pos && spawnPoints?.player?.length) {
      const s = spawnPoints.player[Math.floor(rand() * spawnPoints.player.length)];
      pos = clampXZ(
        s.x + (rand() - 0.5) * 16,
        s.z + (rand() - 0.5) * 16,
        bounds,
        0.5,
      );
      pos.y = s.y;
    }

    if (!pos) {
      const angle = rand() * Math.PI * 2;
      const t = 7 + rand() * 17;
      pos = clampXZ(Math.cos(angle) * t, Math.sin(angle) * t, bounds, 1);
      pos.y = state.position.y;
    }

    if (!isGoalTooCloseToPeers(pos, peerPositions)) return pos;
  }

  const g = navMesh && findRandomPoint(navMesh, MOUSE_NAV_FILTER, rand);
  if (g?.success) {
    return {
      x: g.position[0],
      y: g.position[1],
      z: g.position[2],
    };
  }

  const sp = spawnPoints?.player?.[0];
  if (sp) {
    return {
      x: sp.x,
      y: sp.y,
      z: sp.z,
    };
  }

  return clampXZ(0, 0, bounds, 1);
}

export function createMouseBotBrain() {
  return {
    navPath: [],
    navPathIndex: 0,
    navTarget: null,
    navRepathTimer: 0,
    wanderTimer: 0,
    fleeUntil: 0,
    goal: null,
  };
}

export function resetMouseBotBrain(brain) {
  if (!brain) return;
  brain.navPath = [];
  brain.navPathIndex = 0;
  brain.navTarget = null;
  brain.navRepathTimer = 0;
  brain.wanderTimer = 0;
  brain.fleeUntil = 0;
  brain.goal = null;
}

/**
 * @param {object} state Player physics state
 * @param {object} brain Bot brain from createMouseBotBrain
 * @param {object} navMesh Mouse nav mesh JSON
 * @param {object[]} predators Server predator states
 * @param {number} dt Tick delta seconds
 * @param {{ player?: { x: number, y: number, z: number }[] }} spawnPoints
 * @param {object} bounds { minX, maxX, minZ, maxZ }
 * @param {number} now Wall-clock seconds
 * @param {{ peerPositions?: { x: number, z: number }[] }} [options] Other alive players (for spread-out goals)
 */
export function buildMouseBotInput(state, brain, navMesh, predators, dt, spawnPoints, bounds, now, options = {}) {
  const peerPositions = options.peerPositions;
  if (!navMesh) {
    return {
      moveX: 0,
      moveZ: 0,
      sprint: false,
      jump: false,
      jumpPressed: false,
      jumpHeld: false,
      crouch: false,
      rotation: state.rotation,
    };
  }

  brain.navRepathTimer -= dt;
  brain.wanderTimer -= dt;

  let nearestCat = null;
  let nearestCatDistSq = Infinity;
  for (const p of predators) {
    if (!p?.alive) continue;
    const d = distSqXZ(state.position, p.position);
    if (d < nearestCatDistSq) {
      nearestCatDistSq = d;
      nearestCat = p;
    }
  }

  const fleeDistSq = FLEE_TRIGGER_DIST * FLEE_TRIGGER_DIST;
  let goal = brain.goal;

  if (nearestCat && nearestCatDistSq < fleeDistSq) {
    brain.fleeUntil = now + FLEE_DURATION;
    const away = normalizeXZ(
      state.position.x - nearestCat.position.x,
      state.position.z - nearestCat.position.z,
    );
    goal = clampXZ(
      state.position.x + away.x * FLEE_RUN_DISTANCE,
      state.position.z + away.z * FLEE_RUN_DISTANCE,
      bounds,
      0.35,
    );
    goal.y = state.position.y;
    brain.goal = goal;
    brain.navRepathTimer = 0;
    brain.navPath = [];
    brain.navPathIndex = 0;
    brain.wanderTimer = WANDER_TIMER_MIN + Math.random() * (WANDER_TIMER_MAX - WANDER_TIMER_MIN);
  } else if (now < brain.fleeUntil && brain.goal) {
    goal = brain.goal;
  } else {
    brain.fleeUntil = 0;
    if (brain.wanderTimer <= 0 || !brain.goal) {
      brain.wanderTimer = WANDER_TIMER_MIN + Math.random() * (WANDER_TIMER_MAX - WANDER_TIMER_MIN);
      const rand = Math.random;
      brain.goal = pickExploreGoal(state, navMesh, bounds, spawnPoints, peerPositions, rand);
      goal = brain.goal;
      brain.navRepathTimer = 0;
      brain.navPath = [];
      brain.navPathIndex = 0;
    } else {
      goal = brain.goal;
    }
  }

  if (!goal) {
    return {
      moveX: 0,
      moveZ: 0,
      sprint: false,
      jump: false,
      jumpPressed: false,
      jumpHeld: false,
      crouch: false,
      rotation: state.rotation,
    };
  }

  if (shouldRepath(brain, goal)) {
    rebuildBotPath(brain, state.position, goal, navMesh);
  }

  let steer = goal;
  while (brain.navPathIndex < brain.navPath.length) {
    const w = brain.navPath[brain.navPathIndex];
    if (distSqXZ(state.position, w) <= WAYPOINT_REACH_DIST_SQ) {
      brain.navPathIndex += 1;
      continue;
    }
    steer = w;
    break;
  }

  const dx = steer.x - state.position.x;
  const dz = steer.z - state.position.z;
  const len = Math.sqrt(dx * dx + dz * dz);

  const fleeing = now < brain.fleeUntil && nearestCat && nearestCatDistSq < (FLEE_TRIGGER_DIST + 3) ** 2;
  const sprint = fleeing || len > 5.5;

  if (len < 0.06) {
    const jumpPressed = Math.random() < 0.004 && state.grounded;
    return {
      moveX: 0,
      moveZ: 0,
      sprint: false,
      jump: jumpPressed,
      jumpPressed,
      jumpHeld: false,
      crouch: false,
      rotation: state.rotation,
    };
  }

  const mx = dx / len;
  const mz = dz / len;
  const rotation = Math.atan2(mx, mz);
  const jumpPressed = Math.random() < 0.0025 && state.grounded;

  return {
    moveX: mx,
    moveZ: mz,
    sprint,
    jump: jumpPressed,
    jumpPressed,
    jumpHeld: false,
    crouch: false,
    rotation,
  };
}
