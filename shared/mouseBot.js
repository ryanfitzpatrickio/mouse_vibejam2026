/**
 * Server-side mouse bot steering on the mouse navmesh (includes mouse-only areas).
 * Cats use the cat navmesh in predator.js; bots must use the mouse nav mesh only.
 */

import { findPath, createDefaultQueryFilter } from 'navcat';
import { NAV_AGENT_CONFIGS } from './navConfig.js';

const MOUSE_NAV_FILTER = createDefaultQueryFilter();
const MOUSE_HALF_EXTENTS = NAV_AGENT_CONFIGS.mouse.queryHalfExtents;

const REPATH_INTERVAL = 0.35;
const WAYPOINT_REACH_DIST_SQ = 0.38 * 0.38;
const TARGET_REPATH_DIST_SQ = 0.7 * 0.7;
const WANDER_TIMER_MIN = 2.2;
const WANDER_TIMER_MAX = 5.5;
const FLEE_DURATION = 2.8;
const FLEE_TRIGGER_DIST = 8.2;
const FLEE_RUN_DISTANCE = 6;

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
 */
export function buildMouseBotInput(state, brain, navMesh, predators, dt, spawnPoints, bounds, now) {
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
      const sp = spawnPoints?.player ?? [];
      if (sp.length) {
        const s = sp[Math.floor(Math.random() * sp.length)];
        brain.goal = {
          x: s.x + (Math.random() - 0.5) * 4,
          y: s.y,
          z: s.z + (Math.random() - 0.5) * 4,
        };
      } else {
        const angle = Math.random() * Math.PI * 2;
        const t = 3 + Math.random() * 10;
        brain.goal = clampXZ(Math.cos(angle) * t, Math.sin(angle) * t, bounds, 1);
        brain.goal.y = 0;
      }
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
  const sprint = fleeing;

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
