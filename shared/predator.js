/**
 * Shared predator AI state and simulation.
 * Used by both server (authority) and client (interpolation).
 * Keep this file free of Three.js / DOM / Node dependencies.
 */

import { createDefaultQueryFilter, findPath } from 'navcat';
import { CAT_BT, selectRoutineAfterIdle, initialIdleDelay } from './catBehaviorTree.js';
import { PHYSICS } from './physics.js';
import { NAV_AGENT_CONFIGS, NAV_POLY_FLAGS } from './navConfig.js';

export const PREDATOR_AI = Object.freeze({
  IDLE: 'idle',
  PATROL: 'patrol',
  ALERT: 'alert',
  CHASE: 'chase',
  ATTACK: 'attack',
  COOLDOWN: 'cooldown',
  STUNNED: 'stunned',
  ROAR: 'roar',
  DEATH: 'death',
  SLEEP: 'sleep',
  GROOM: 'groom',
  PLAY: 'play',
  BORED_WANDER: 'bored_wander',
});

export const CAT_CONFIG = Object.freeze({
  name: 'Cat',
  aggroRange: 12,
  attackRange: 1.8,
  leashRange: 24,
  moveSpeed: 3.5,
  chaseSpeed: 6.5,
  turnSpeed: 10,
  attackCooldown: 1.2,
  attackWindup: 0.5,
  attackHitTime: 0.15,
  stunDuration: 1.0,
  alertDuration: 0.5,
  roarDuration: 1.2,
  damage: 1,
  knockbackForce: 8,
  maxHealth: 4,
  patrolRadius: 10,
  patrolWaitMin: 1.5,
  patrolWaitMax: 4.0,
  radius: 0.5,
  height: 1.6,
  gravity: -20,
});

const NAV_REPATH_INTERVAL = 0.35;
const NAV_TARGET_REPATH_DISTANCE = 0.75;
const NAV_WAYPOINT_REACH_DISTANCE = 0.45;
const NAV_QUERY_HALF_EXTENTS = NAV_AGENT_CONFIGS.cat.queryHalfExtents;
const LOS_EPSILON = 0.001;
const CAT_NAV_QUERY_FILTER = (() => {
  const filter = createDefaultQueryFilter();
  filter.excludeFlags = NAV_POLY_FLAGS.MOUSE_ONLY;
  return filter;
})();

export function createPredatorState(config) {
  const spawnY = config.spawnY ?? 0;
  return {
    id: config.id ?? 'cat-0',
    type: config.type ?? 'cat',
    position: { x: config.spawnX ?? 0, y: spawnY, z: config.spawnZ ?? 0 },
    velocity: { x: 0, y: 0, z: 0 },
    rotation: 0,
    grounded: spawnY <= 0.001,
    health: config.maxHealth ?? CAT_CONFIG.maxHealth,
    maxHealth: config.maxHealth ?? CAT_CONFIG.maxHealth,
    alive: true,
    aiState: PREDATOR_AI.IDLE,
    aiTimer: initialIdleDelay(),

    spawnPoint: { x: config.spawnX ?? 0, y: spawnY, z: config.spawnZ ?? 0 },
    patrolTarget: { x: config.spawnX ?? 0, y: spawnY, z: config.spawnZ ?? 0 },
    attackHitPending: false,

    aggroRange: config.aggroRange ?? CAT_CONFIG.aggroRange,
    attackRange: config.attackRange ?? CAT_CONFIG.attackRange,
    leashRange: config.leashRange ?? CAT_CONFIG.leashRange,
    moveSpeed: config.moveSpeed ?? CAT_CONFIG.moveSpeed,
    chaseSpeed: config.chaseSpeed ?? CAT_CONFIG.chaseSpeed,
    turnSpeed: config.turnSpeed ?? CAT_CONFIG.turnSpeed,
    attackCooldown: config.attackCooldown ?? CAT_CONFIG.attackCooldown,
    attackWindup: config.attackWindup ?? CAT_CONFIG.attackWindup,
    attackHitTime: config.attackHitTime ?? CAT_CONFIG.attackHitTime,
    stunDuration: config.stunDuration ?? CAT_CONFIG.stunDuration,
    alertDuration: config.alertDuration ?? CAT_CONFIG.alertDuration,
    roarDuration: config.roarDuration ?? CAT_CONFIG.roarDuration,
    damage: config.damage ?? CAT_CONFIG.damage,
    knockbackForce: config.knockbackForce ?? CAT_CONFIG.knockbackForce,
    patrolRadius: config.patrolRadius ?? CAT_CONFIG.patrolRadius,
    patrolWaitMin: config.patrolWaitMin ?? CAT_CONFIG.patrolWaitMin,
    patrolWaitMax: config.patrolWaitMax ?? CAT_CONFIG.patrolWaitMax,
    radius: config.radius ?? CAT_CONFIG.radius,
    height: config.height ?? CAT_CONFIG.height,
    gravity: config.gravity ?? CAT_CONFIG.gravity,
    navPath: [],
    navPathIndex: 0,
    navTarget: null,
    navRepathTimer: 0,

    chaseTargetId: null,
    chaseFrustration: 0,
    nextChaseTargetPick: 0,
    /** Best horizontal distance achieved this chase; null until first tick */
    chaseClosestDistXZ: null,
    /** Time spent on a chase “plateau” without real progress */
    chasePlateauTimer: 0,
    /** Sustained loss of line of sight while hunting */
    chaseLosBlockedTimer: 0,
  };
}

function distXZ(a, b) {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dz * dz);
}

function distSqXZ(a, b) {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  return dx * dx + dz * dz;
}

function normalizeXZ(v) {
  const len = Math.sqrt(v.x * v.x + v.z * v.z);
  if (len < 0.0001) return { x: 0, z: 0 };
  return { x: v.x / len, z: v.z / len };
}

function getVerticalSpan(positionY, height) {
  return {
    min: positionY,
    max: positionY + Math.max(0, height ?? 0),
  };
}

function spansOverlap(a, b) {
  return a.min <= b.max && a.max >= b.min;
}

function canPredatorHitPlayer(predator, player) {
  if (!player?.position) return false;

  const predatorSpan = getVerticalSpan(predator.position.y, predator.height);
  const playerSpan = getVerticalSpan(player.position.y, player.height ?? PHYSICS.playerHeight);
  return spansOverlap(predatorSpan, playerSpan);
}

function clearPredatorNavPath(state) {
  state.navPath = [];
  state.navPathIndex = 0;
  state.navTarget = null;
  state.navRepathTimer = 0;
}

function shouldRebuildPredatorPath(state, targetPosition) {
  if (!targetPosition) return false;
  if (state.navRepathTimer <= 0) return true;
  if (!state.navPath?.length) return true;
  if (state.navPathIndex >= state.navPath.length) return true;
  if (!state.navTarget) return true;
  return distSqXZ(state.navTarget, targetPosition) >= NAV_TARGET_REPATH_DISTANCE * NAV_TARGET_REPATH_DISTANCE;
}

function rebuildPredatorPath(state, targetPosition, navMesh) {
  const result = findPath(
    navMesh,
    [state.position.x, state.position.y, state.position.z],
    [targetPosition.x, targetPosition.y, targetPosition.z],
    NAV_QUERY_HALF_EXTENTS,
    CAT_NAV_QUERY_FILTER,
  );

  state.navTarget = {
    x: targetPosition.x,
    y: targetPosition.y,
    z: targetPosition.z,
  };
  state.navRepathTimer = NAV_REPATH_INTERVAL;

  if (!result.success || !Array.isArray(result.path) || result.path.length === 0) {
    state.navPath = [];
    state.navPathIndex = 0;
    return;
  }

  state.navPath = result.path.map((point) => ({
    x: point.position[0],
    y: point.position[1],
    z: point.position[2],
  }));
  state.navPathIndex = state.navPath.length > 1 ? 1 : 0;
}

/**
 * Next steering point on the cat navmesh, or null when no route exists (prey unreachable).
 * Callers should treat null as "do not run straight at the mouse" and build frustration / boredom.
 */
function getPredatorSteerTarget(state, targetPosition, navMesh) {
  if (!targetPosition || !navMesh) {
    return targetPosition ?? null;
  }

  if (shouldRebuildPredatorPath(state, targetPosition)) {
    rebuildPredatorPath(state, targetPosition, navMesh);
  }

  while (state.navPathIndex < state.navPath.length) {
    const waypoint = state.navPath[state.navPathIndex];
    if (distSqXZ(state.position, waypoint) <= NAV_WAYPOINT_REACH_DISTANCE * NAV_WAYPOINT_REACH_DISTANCE) {
      state.navPathIndex += 1;
      continue;
    }
    return waypoint;
  }

  if (!state.navPath?.length) {
    return null;
  }

  return targetPosition;
}

function navSteerMove(state, dest, navMesh, speed, dt) {
  const steer = getPredatorSteerTarget(state, dest, navMesh);
  if (!steer) return false;
  const dir = normalizeXZ({
    x: steer.x - state.position.x,
    z: steer.z - state.position.z,
  });
  moveToward(state, dir, speed, dt);
  faceDirection(state, dir, dt);
  return true;
}

function gatherMiceSortedByDistance(state, players) {
  const out = [];
  for (const player of Object.values(players)) {
    if (!player?.alive || !player.position) continue;
    out.push({
      player,
      id: player.id,
      d: distXZ(state.position, player.position),
    });
  }
  out.sort((a, b) => a.d - b.d);
  return out;
}

/** Mice the cat could actually melee from its current height (vertical capsule overlap). */
function reachableMiceSorted(state, sortedMice) {
  if (!CAT_BT.requireVerticalStrikeOverlapForHunt) return sortedMice;
  return sortedMice.filter((m) => canPredatorHitPlayer(state, m.player));
}

/**
 * Nearest mouse in horizontal aggro that is vertically hittable (if required) and in line of sight.
 */
function firstReachableMouseInAggro(state, sortedMice, colliders) {
  for (const m of sortedMice) {
    if (m.d >= state.aggroRange) break;
    const vertOk = !CAT_BT.requireVerticalStrikeOverlapForHunt || canPredatorHitPlayer(state, m.player);
    if (!vertOk) continue;
    const losOk = !CAT_BT.requireLineOfSightForHunt || hasPredatorLineOfSight(state, m.player, colliders);
    if (!losOk) continue;
    return m;
  }
  return null;
}

function getChaseTargetPlayer(state, players) {
  if (!state.chaseTargetId) return null;
  const p = players[state.chaseTargetId];
  return p?.alive ? p : null;
}

function refreshChaseTarget(state, reachableSorted, now) {
  if (now < state.nextChaseTargetPick) return;
  state.nextChaseTargetPick = now + CAT_BT.chaseTargetRefresh;

  if (!reachableSorted.length) {
    state.chaseTargetId = null;
    return;
  }

  const nearest = reachableSorted[0];
  const cur = reachableSorted.find((m) => m.id === state.chaseTargetId);

  if (!state.chaseTargetId || !cur) {
    state.chaseTargetId = nearest.id;
    clearPredatorNavPath(state);
    return;
  }

  if (nearest.id !== state.chaseTargetId && nearest.d < cur.d - CAT_BT.switchTargetAdvantage) {
    state.chaseTargetId = nearest.id;
    clearPredatorNavPath(state);
    state.chaseFrustration *= 0.45;
  }
}

/**
 * Drops invalid targets and picks nearest vertically reachable mouse, or clears target.
 */
function ensureChaseTarget(state, players, reachableSorted) {
  if (!reachableSorted.length) {
    state.chaseTargetId = null;
    clearPredatorNavPath(state);
    return null;
  }
  const cur = getChaseTargetPlayer(state, players);
  if (!cur || !canPredatorHitPlayer(state, cur)) {
    state.chaseTargetId = reachableSorted[0].id;
    clearPredatorNavPath(state);
  }
  return getChaseTargetPlayer(state, players);
}

function segmentIntersectsExpandedBoxXZ(start, end, box, padding = 0) {
  const minX = box.min.x - padding;
  const maxX = box.max.x + padding;
  const minZ = box.min.z - padding;
  const maxZ = box.max.z + padding;

  let tMin = 0;
  let tMax = 1;
  const dx = end.x - start.x;
  const dz = end.z - start.z;

  if (Math.abs(dx) < LOS_EPSILON) {
    if (start.x < minX || start.x > maxX) {
      return false;
    }
  } else {
    const invDx = 1 / dx;
    let tx1 = (minX - start.x) * invDx;
    let tx2 = (maxX - start.x) * invDx;
    if (tx1 > tx2) [tx1, tx2] = [tx2, tx1];
    tMin = Math.max(tMin, tx1);
    tMax = Math.min(tMax, tx2);
    if (tMin > tMax) return false;
  }

  if (Math.abs(dz) < LOS_EPSILON) {
    if (start.z < minZ || start.z > maxZ) {
      return false;
    }
  } else {
    const invDz = 1 / dz;
    let tz1 = (minZ - start.z) * invDz;
    let tz2 = (maxZ - start.z) * invDz;
    if (tz1 > tz2) [tz1, tz2] = [tz2, tz1];
    tMin = Math.max(tMin, tz1);
    tMax = Math.min(tMax, tz2);
    if (tMin > tMax) return false;
  }

  return tMax >= 0 && tMin <= 1;
}

function hasPredatorLineOfSight(state, target, colliders) {
  if (!target?.position) return false;

  const predatorSpan = getVerticalSpan(state.position.y, state.height);
  const playerSpan = getVerticalSpan(target.position.y, target.height ?? PHYSICS.playerHeight);
  const overlapMinY = Math.max(predatorSpan.min, playerSpan.min);
  const overlapMaxY = Math.min(predatorSpan.max, playerSpan.max);
  if (overlapMinY > overlapMaxY) return false;

  const start = state.position;
  const end = target.position;

  for (const collider of colliders ?? []) {
    if (collider.type === 'surface' || collider.type === 'loot') continue;
    const box = collider.aabb;
    if (!box) continue;
    if (overlapMaxY < box.min.y || overlapMinY > box.max.y) continue;
    if (segmentIntersectsExpandedBoxXZ(start, end, box, 0.02)) {
      return false;
    }
  }

  return true;
}

function angleDiff(target, current) {
  let d = target - current;
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

function pickPatrolTarget(state, radiusScale = 1) {
  const angle = Math.random() * Math.PI * 2;
  const span = Math.max(0.5, (state.patrolRadius - 1) * radiusScale);
  const dist = 1 + Math.random() * span;
  state.patrolTarget.x = state.spawnPoint.x + Math.cos(angle) * dist;
  state.patrolTarget.z = state.spawnPoint.z + Math.sin(angle) * dist;
  state.patrolTarget.y = state.spawnPoint.y;
}

function resetChaseProgress(state) {
  state.chaseClosestDistXZ = null;
  state.chasePlateauTimer = 0;
  state.chaseLosBlockedTimer = 0;
}

function enterBoredWander(state) {
  clearPredatorNavPath(state);
  state.chaseTargetId = null;
  state.chaseFrustration = 0;
  resetChaseProgress(state);
  state.aiState = PREDATOR_AI.BORED_WANDER;
  state.aiTimer = CAT_BT.boredWanderMin + Math.random() * (CAT_BT.boredWanderMax - CAT_BT.boredWanderMin);
  pickPatrolTarget(state, 1.15);
}

function transitionLifeFromIdle(state) {
  const choice = selectRoutineAfterIdle();
  clearPredatorNavPath(state);
  if (choice.state === PREDATOR_AI.PATROL) {
    state.aiState = PREDATOR_AI.PATROL;
    pickPatrolTarget(state, 1);
    return;
  }
  state.aiState = choice.state;
  state.aiTimer = choice.timer;
  if (choice.state === PREDATOR_AI.PLAY) {
    pickPatrolTarget(state, CAT_BT.playPatrolRadiusScale);
  }
}

function moveToward(state, dir, speed, dt) {
  state.position.x += dir.x * speed * dt;
  state.position.z += dir.z * speed * dt;
}

function faceDirection(state, dir, dt) {
  const lenSq = dir.x * dir.x + dir.z * dir.z;
  if (lenSq < 0.0001) return;
  const targetAngle = Math.atan2(dir.x, dir.z);
  const diff = angleDiff(targetAngle, state.rotation);
  state.rotation += diff * Math.min(1, dt * state.turnSpeed);
}

function facePosition(state, target, dt) {
  const dir = normalizeXZ({ x: target.x - state.position.x, z: target.z - state.position.z });
  faceDirection(state, dir, dt);
}

function resolvePredatorCollisions(state, colliders, previousPosition = null) {
  if (!colliders) return;
  const r = state.radius;
  const previousX = previousPosition?.x ?? state.position.x;
  const previousZ = previousPosition?.z ?? state.position.z;
  const previousY = previousPosition?.y ?? state.position.y;

  for (const collider of colliders) {
    const px = state.position.x;
    const pz = state.position.z;
    if (collider.type === 'surface' || collider.type === 'loot') continue;
    const { min, max } = collider.aabb;
    if (state.position.y > max.y || state.position.y + 2 < min.y) continue;

    const expandedMinX = min.x - r;
    const expandedMaxX = max.x + r;
    const expandedMinZ = min.z - r;
    const expandedMaxZ = max.z + r;
    const ySweepOverlaps = Math.max(previousY, state.position.y) <= max.y + 0.001
      && Math.min(previousY + state.height, state.position.y + state.height) >= min.y - 0.001;
    const sweptAcrossZ = Math.max(previousZ, pz) >= expandedMinZ - 0.001
      && Math.min(previousZ, pz) <= expandedMaxZ + 0.001;
    const sweptAcrossX = Math.max(previousX, px) >= expandedMinX - 0.001
      && Math.min(previousX, px) <= expandedMaxX + 0.001;

    if (ySweepOverlaps) {
      if (previousX < min.x - 0.001 && px >= min.x - 0.001 && sweptAcrossZ) {
        state.position.x = expandedMinX;
        continue;
      }

      if (previousX > max.x + 0.001 && px <= max.x + 0.001 && sweptAcrossZ) {
        state.position.x = expandedMaxX;
        continue;
      }

      if (previousZ < min.z - 0.001 && pz >= min.z - 0.001 && sweptAcrossX) {
        state.position.z = expandedMinZ;
        continue;
      }

      if (previousZ > max.z + 0.001 && pz <= max.z + 0.001 && sweptAcrossX) {
        state.position.z = expandedMaxZ;
        continue;
      }
    }

    const closestX = Math.max(min.x, Math.min(px, max.x));
    const closestZ = Math.max(min.z, Math.min(pz, max.z));
    const dx = px - closestX;
    const dz = pz - closestZ;
    const distSq = dx * dx + dz * dz;

    if (distSq < r * r && distSq > 0.0001) {
      const dist = Math.sqrt(distSq);
      const overlap = r - dist;
      state.position.x += (dx / dist) * overlap;
      state.position.z += (dz / dist) * overlap;
    }
  }
}

export function simulatePredatorTick(state, players, dt, colliders, navMesh = null) {
  if (!state.alive) return null;

  state.aiTimer -= dt;
  state.navRepathTimer -= dt;
  const previousPosition = {
    x: state.position.x,
    y: state.position.y,
    z: state.position.z,
  };

  const now = Date.now() / 1000;
  const sortedMice = gatherMiceSortedByDistance(state, players);
  const reachableMice = reachableMiceSorted(state, sortedMice);
  /** Nearest mouse in aggro that is vertically hittable and not behind world collision. */
  const aggroPrey = firstReachableMouseInAggro(state, sortedMice, colliders);
  const preyInAggro = aggroPrey != null;

  const distToSpawn = distXZ(state.position, state.spawnPoint);

  switch (state.aiState) {
    case PREDATOR_AI.IDLE:
      if (preyInAggro) {
        state.chaseTargetId = aggroPrey.player.id;
        clearPredatorNavPath(state);
        state.chaseFrustration = 0;
        state.aiState = PREDATOR_AI.ALERT;
        state.aiTimer = state.alertDuration;
        break;
      }
      if (state.aiTimer <= 0) {
        transitionLifeFromIdle(state);
      }
      break;

    case PREDATOR_AI.PATROL: {
      if (preyInAggro) {
        state.chaseTargetId = aggroPrey.player.id;
        clearPredatorNavPath(state);
        state.chaseFrustration = 0;
        state.aiState = PREDATOR_AI.ALERT;
        state.aiTimer = state.alertDuration;
        break;
      }
      const dx = state.patrolTarget.x - state.position.x;
      const dz = state.patrolTarget.z - state.position.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist < 0.55) {
        clearPredatorNavPath(state);
        state.aiState = PREDATOR_AI.IDLE;
        state.aiTimer = state.patrolWaitMin + Math.random() * (state.patrolWaitMax - state.patrolWaitMin);
      } else if (!navSteerMove(state, state.patrolTarget, navMesh, state.moveSpeed, dt)) {
        pickPatrolTarget(state, 1);
        clearPredatorNavPath(state);
      }
      break;
    }

    case PREDATOR_AI.SLEEP:
      if (preyInAggro) {
        state.chaseTargetId = aggroPrey.player.id;
        clearPredatorNavPath(state);
        state.chaseFrustration = 0;
        state.aiState = PREDATOR_AI.ALERT;
        state.aiTimer = state.alertDuration;
        break;
      }
      if (state.aiTimer <= 0) {
        clearPredatorNavPath(state);
        state.aiState = PREDATOR_AI.IDLE;
        state.aiTimer = initialIdleDelay();
      }
      break;

    case PREDATOR_AI.GROOM:
      if (preyInAggro) {
        state.chaseTargetId = aggroPrey.player.id;
        clearPredatorNavPath(state);
        state.chaseFrustration = 0;
        state.aiState = PREDATOR_AI.ALERT;
        state.aiTimer = state.alertDuration;
        break;
      }
      state.rotation += Math.sin(now * 2.4) * dt * 0.55;
      if (state.aiTimer <= 0) {
        clearPredatorNavPath(state);
        state.aiState = PREDATOR_AI.IDLE;
        state.aiTimer = initialIdleDelay();
      }
      break;

    case PREDATOR_AI.PLAY:
      if (preyInAggro) {
        state.chaseTargetId = aggroPrey.player.id;
        clearPredatorNavPath(state);
        state.chaseFrustration = 0;
        state.aiState = PREDATOR_AI.ALERT;
        state.aiTimer = state.alertDuration;
        break;
      }
      if (
        !navSteerMove(state, state.patrolTarget, navMesh, state.chaseSpeed * 0.62, dt)
        || distXZ(state.position, state.patrolTarget) < 0.65
      ) {
        pickPatrolTarget(state, CAT_BT.playPatrolRadiusScale);
        clearPredatorNavPath(state);
      }
      if (state.aiTimer <= 0) {
        clearPredatorNavPath(state);
        state.aiState = PREDATOR_AI.IDLE;
        state.aiTimer = initialIdleDelay();
      }
      break;

    case PREDATOR_AI.BORED_WANDER:
      if (preyInAggro) {
        state.chaseTargetId = aggroPrey.player.id;
        clearPredatorNavPath(state);
        state.chaseFrustration = 0;
        state.aiState = PREDATOR_AI.ALERT;
        state.aiTimer = state.alertDuration;
        break;
      }
      if (
        !navSteerMove(state, state.patrolTarget, navMesh, state.moveSpeed * 0.85, dt)
        || distXZ(state.position, state.patrolTarget) < 0.6
      ) {
        pickPatrolTarget(state, 1.2);
        clearPredatorNavPath(state);
      }
      if (state.aiTimer <= 0) {
        clearPredatorNavPath(state);
        state.aiState = PREDATOR_AI.IDLE;
        state.aiTimer = initialIdleDelay();
      }
      break;

    case PREDATOR_AI.ALERT: {
      const preyA = ensureChaseTarget(state, players, reachableMice);
      if (!preyA || distXZ(state.position, preyA.position) > state.aggroRange * 1.08) {
        clearPredatorNavPath(state);
        state.chaseTargetId = null;
        resetChaseProgress(state);
        state.aiState = PREDATOR_AI.IDLE;
        state.aiTimer = initialIdleDelay();
        break;
      }
      if (CAT_BT.requireLineOfSightForHunt) {
        if (hasPredatorLineOfSight(state, preyA, colliders)) {
          state.chaseLosBlockedTimer = 0;
        } else {
          state.chaseLosBlockedTimer += dt;
          if (state.chaseLosBlockedTimer >= CAT_BT.losBlockedGiveUpSeconds) {
            clearPredatorNavPath(state);
            state.chaseTargetId = null;
            resetChaseProgress(state);
            state.aiState = PREDATOR_AI.IDLE;
            state.aiTimer = initialIdleDelay();
            break;
          }
        }
      }
      facePosition(state, preyA.position, dt);
      if (state.aiTimer <= 0) {
        state.aiState = PREDATOR_AI.ROAR;
        state.aiTimer = state.roarDuration;
      }
      break;
    }

    case PREDATOR_AI.ROAR: {
      const preyR = ensureChaseTarget(state, players, reachableMice);
      if (!preyR || distXZ(state.position, preyR.position) > state.aggroRange * 1.15) {
        clearPredatorNavPath(state);
        state.chaseTargetId = null;
        resetChaseProgress(state);
        state.aiState = PREDATOR_AI.IDLE;
        state.aiTimer = initialIdleDelay();
        break;
      }
      if (CAT_BT.requireLineOfSightForHunt) {
        if (hasPredatorLineOfSight(state, preyR, colliders)) {
          state.chaseLosBlockedTimer = 0;
        } else {
          state.chaseLosBlockedTimer += dt;
          if (state.chaseLosBlockedTimer >= CAT_BT.losBlockedGiveUpSeconds) {
            clearPredatorNavPath(state);
            state.chaseTargetId = null;
            resetChaseProgress(state);
            state.aiState = PREDATOR_AI.IDLE;
            state.aiTimer = initialIdleDelay();
            break;
          }
        }
      }
      facePosition(state, preyR.position, dt);
      if (state.aiTimer <= 0) {
        state.aiState = PREDATOR_AI.CHASE;
        state.nextChaseTargetPick = 0;
        state.chaseFrustration = 0;
        resetChaseProgress(state);
      }
      break;
    }

    case PREDATOR_AI.CHASE: {
      const visibleReachable = CAT_BT.requireLineOfSightForHunt
        ? reachableMice.filter((m) => hasPredatorLineOfSight(state, m.player, colliders))
        : reachableMice;
      const huntPool = visibleReachable.length > 0 ? visibleReachable : reachableMice;
      ensureChaseTarget(state, players, huntPool);
      refreshChaseTarget(state, huntPool, now);
      const prey = getChaseTargetPlayer(state, players);
      const distPrey = prey ? distXZ(state.position, prey.position) : Infinity;

      if (!prey || (distToSpawn > state.leashRange && distPrey > state.aggroRange)) {
        clearPredatorNavPath(state);
        state.chaseTargetId = null;
        state.chaseFrustration = 0;
        resetChaseProgress(state);
        state.aiState = PREDATOR_AI.PATROL;
        state.patrolTarget.x = state.spawnPoint.x;
        state.patrolTarget.z = state.spawnPoint.z;
        state.patrolTarget.y = state.spawnPoint.y;
        break;
      }

      if (
        prey
        && distPrey < state.attackRange
        && canPredatorHitPlayer(state, prey)
        && hasPredatorLineOfSight(state, prey, colliders)
      ) {
        clearPredatorNavPath(state);
        state.aiState = PREDATOR_AI.ATTACK;
        state.aiTimer = state.attackWindup;
        state.attackHitPending = true;
        state.chaseFrustration = 0;
        resetChaseProgress(state);
        break;
      }

      if (distPrey > state.leashRange * 1.5) {
        clearPredatorNavPath(state);
        state.chaseTargetId = null;
        state.chaseFrustration = 0;
        resetChaseProgress(state);
        state.aiState = PREDATOR_AI.PATROL;
        state.patrolTarget.x = state.spawnPoint.x;
        state.patrolTarget.z = state.spawnPoint.z;
        state.patrolTarget.y = state.spawnPoint.y;
        break;
      }

      if (prey && CAT_BT.requireLineOfSightForHunt) {
        if (hasPredatorLineOfSight(state, prey, colliders)) {
          state.chaseLosBlockedTimer = 0;
        } else {
          state.chaseLosBlockedTimer += dt;
          if (state.chaseLosBlockedTimer >= CAT_BT.losBlockedGiveUpSeconds) {
            enterBoredWander(state);
            break;
          }
        }
      }

      const moved = prey
        ? navSteerMove(state, prey.position, navMesh, state.chaseSpeed, dt)
        : false;
      const stepMoved = distXZ(state.position, previousPosition);
      const speed = dt > 1e-6 ? stepMoved / dt : 0;
      const expectedStep = state.chaseSpeed * dt;
      const barelyMoved = moved && stepMoved < Math.max(0.024, expectedStep * 0.14);

      const prevClosest = state.chaseClosestDistXZ;
      if (prevClosest == null || distPrey < prevClosest - 0.07) {
        state.chaseClosestDistXZ = distPrey;
        state.chasePlateauTimer = 0;
      } else {
        state.chaseClosestDistXZ = Math.min(prevClosest, distPrey);
      }

      const gapToBest = distPrey - state.chaseClosestDistXZ;
      const onApproachPlateau = gapToBest <= CAT_BT.chasePlateauSpan;
      const outOfMelee = distPrey > state.attackRange + CAT_BT.chasePlateauMinDist;
      const motionPoor = !moved || speed < CAT_BT.stuckSpeedThreshold || barelyMoved;

      if (onApproachPlateau && outOfMelee && motionPoor) {
        state.chasePlateauTimer += dt;
      } else {
        state.chasePlateauTimer = Math.max(0, state.chasePlateauTimer - dt * 1.2);
      }

      if (state.chasePlateauTimer > CAT_BT.chasePlateauGrace) {
        state.chaseFrustration += dt * CAT_BT.plateauStallFrustrationRate;
      }

      if (!moved) {
        state.chaseFrustration += dt * CAT_BT.pathFailFrustrationRate;
      } else if (motionPoor && outOfMelee) {
        state.chaseFrustration += dt * CAT_BT.stuckMoveFrustrationRate;
      } else if (
        moved
        && !barelyMoved
        && speed >= CAT_BT.stuckSpeedThreshold
        && prevClosest != null
        && distPrey < prevClosest - 0.05
      ) {
        state.chaseFrustration = Math.max(0, state.chaseFrustration - dt * 0.55);
      } else {
        state.chaseFrustration = Math.max(0, state.chaseFrustration - dt * 0.1);
      }

      if (state.chaseFrustration >= CAT_BT.frustrationMax) {
        enterBoredWander(state);
      }
      break;
    }

    case PREDATOR_AI.ATTACK: {
      clearPredatorNavPath(state);
      const preyAtk = getChaseTargetPlayer(state, players);
      const distAtk = preyAtk ? distXZ(state.position, preyAtk.position) : Infinity;
      let hitResult = null;
      if (
        state.attackHitPending
        && state.aiTimer <= state.attackHitTime
        && preyAtk
        && distAtk < state.attackRange * 1.5
        && canPredatorHitPlayer(state, preyAtk)
      ) {
        state.attackHitPending = false;
        const dx = preyAtk.position.x - state.position.x;
        const dz = preyAtk.position.z - state.position.z;
        const dir = normalizeXZ({ x: dx, z: dz });
        hitResult = {
          playerId: preyAtk.id,
          damage: state.damage,
          knockbackX: dir.x * state.knockbackForce,
          knockbackZ: dir.z * state.knockbackForce,
        };
      }
      if (state.aiTimer <= 0) {
        state.aiState = PREDATOR_AI.COOLDOWN;
        state.aiTimer = state.attackCooldown;
      }
      if (hitResult) return hitResult;
      break;
    }

    case PREDATOR_AI.COOLDOWN:
      if (state.aiTimer <= 0) {
        ensureChaseTarget(state, players, reachableMice);
        refreshChaseTarget(state, reachableMice, now);
        const preyC = getChaseTargetPlayer(state, players);
        const distC = preyC ? distXZ(state.position, preyC.position) : Infinity;
        if (
          distC < state.attackRange
          && preyC
          && canPredatorHitPlayer(state, preyC)
          && hasPredatorLineOfSight(state, preyC, colliders)
        ) {
          clearPredatorNavPath(state);
          state.aiState = PREDATOR_AI.ATTACK;
          state.aiTimer = state.attackWindup;
          state.attackHitPending = true;
        } else if (
          distC < state.aggroRange
          && preyC
          && canPredatorHitPlayer(state, preyC)
          && (!CAT_BT.requireLineOfSightForHunt || hasPredatorLineOfSight(state, preyC, colliders))
        ) {
          clearPredatorNavPath(state);
          state.aiState = PREDATOR_AI.CHASE;
          state.nextChaseTargetPick = 0;
          state.chaseFrustration = 0;
          resetChaseProgress(state);
        } else {
          clearPredatorNavPath(state);
          state.chaseTargetId = null;
          state.chaseFrustration = 0;
          resetChaseProgress(state);
          state.aiState = PREDATOR_AI.PATROL;
          state.patrolTarget.x = state.spawnPoint.x;
          state.patrolTarget.z = state.spawnPoint.z;
          state.patrolTarget.y = state.spawnPoint.y;
        }
      }
      break;

    case PREDATOR_AI.STUNNED:
      clearPredatorNavPath(state);
      if (state.aiTimer <= 0) {
        if (preyInAggro) {
          state.chaseTargetId = aggroPrey.player.id;
          state.aiState = PREDATOR_AI.CHASE;
          state.nextChaseTargetPick = 0;
        } else {
          state.chaseTargetId = null;
          state.aiState = PREDATOR_AI.PATROL;
          state.patrolTarget.x = state.spawnPoint.x;
          state.patrolTarget.z = state.spawnPoint.z;
          state.patrolTarget.y = state.spawnPoint.y;
        }
      }
      break;

    case PREDATOR_AI.DEATH:
      clearPredatorNavPath(state);
      break;
  }

  // Gravity
  if (!state.grounded) {
    state.velocity.y += state.gravity * dt;
  }
  state.position.y += state.velocity.y * dt;
  if (state.position.y <= 0) {
    state.position.y = 0;
    state.velocity.y = 0;
    state.grounded = true;
  } else {
    state.grounded = false;
  }

  resolvePredatorCollisions(state, colliders, previousPosition);

  // Clamp to world bounds
  const r = state.radius;
  if (state.position.x < -24 + r) state.position.x = -24 + r;
  if (state.position.x > 24 - r) state.position.x = 24 - r;
  if (state.position.z < -24 + r) state.position.z = -24 + r;
  if (state.position.z > 24 - r) state.position.z = 24 - r;

  return null;
}

export function predatorTakeDamage(state, amount) {
  if (!state.alive) return;
  state.health -= amount;
  if (state.health <= 0) {
    state.health = 0;
    state.alive = false;
    state.aiState = PREDATOR_AI.DEATH;
  } else {
    state.aiState = PREDATOR_AI.STUNNED;
    state.aiTimer = state.stunDuration;
  }
}

export function serializePredatorState(state) {
  return {
    id: state.id,
    type: state.type,
    px: +state.position.x.toFixed(2),
    py: +state.position.y.toFixed(2),
    pz: +state.position.z.toFixed(2),
    ry: +state.rotation.toFixed(3),
    hp: state.health,
    maxHp: state.maxHealth,
    alive: state.alive,
    ai: state.aiState,
    chaseTargetId: state.chaseTargetId ?? null,
  };
}
