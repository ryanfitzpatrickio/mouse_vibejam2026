/**
 * Shared predator AI state and simulation.
 * Used by both server (authority) and client (interpolation).
 * Keep this file free of Three.js / DOM / Node dependencies.
 */

import { createDefaultQueryFilter, findPath } from 'navcat';
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
    aiTimer: 1 + Math.random() * 2,

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

function getPredatorSteerTarget(state, targetPosition, navMesh) {
  if (!targetPosition || !navMesh) {
    return targetPosition;
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

  return targetPosition;
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

function pickPatrolTarget(state) {
  const angle = Math.random() * Math.PI * 2;
  const dist = 1 + Math.random() * (state.patrolRadius - 1);
  state.patrolTarget.x = state.spawnPoint.x + Math.cos(angle) * dist;
  state.patrolTarget.z = state.spawnPoint.z + Math.sin(angle) * dist;
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

  let nearestPlayer = null;
  let nearestDist = Infinity;
  for (const player of Object.values(players)) {
    if (!player.alive) continue;
    const d = distXZ(state.position, player.position);
    if (d < nearestDist) {
      nearestDist = d;
      nearestPlayer = player;
    }
  }

  const distToSpawn = distXZ(state.position, state.spawnPoint);

  switch (state.aiState) {
    case PREDATOR_AI.IDLE:
      clearPredatorNavPath(state);
      if (nearestDist < state.aggroRange && nearestPlayer) {
        state.aiState = PREDATOR_AI.ALERT;
        state.aiTimer = state.alertDuration;
        break;
      }
      if (state.aiTimer <= 0) {
        state.aiState = PREDATOR_AI.PATROL;
        pickPatrolTarget(state);
      }
      break;

    case PREDATOR_AI.PATROL: {
      clearPredatorNavPath(state);
      if (nearestDist < state.aggroRange && nearestPlayer) {
        state.aiState = PREDATOR_AI.ALERT;
        state.aiTimer = state.alertDuration;
        break;
      }
      const dx = state.patrolTarget.x - state.position.x;
      const dz = state.patrolTarget.z - state.position.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist < 0.5) {
        state.aiState = PREDATOR_AI.IDLE;
        state.aiTimer = state.patrolWaitMin + Math.random() * (state.patrolWaitMax - state.patrolWaitMin);
      } else {
        const dir = normalizeXZ({ x: dx, z: dz });
        moveToward(state, dir, state.moveSpeed, dt);
        faceDirection(state, dir, dt);
      }
      break;
    }

    case PREDATOR_AI.ALERT:
      clearPredatorNavPath(state);
      if (nearestPlayer) facePosition(state, nearestPlayer.position, dt);
      if (state.aiTimer <= 0) {
        state.aiState = PREDATOR_AI.ROAR;
        state.aiTimer = state.roarDuration;
      }
      break;

    case PREDATOR_AI.ROAR:
      clearPredatorNavPath(state);
      if (nearestPlayer) facePosition(state, nearestPlayer.position, dt);
      if (state.aiTimer <= 0) {
        state.aiState = PREDATOR_AI.CHASE;
      }
      break;

    case PREDATOR_AI.CHASE: {
      if (!nearestPlayer || (distToSpawn > state.leashRange && nearestDist > state.aggroRange)) {
        clearPredatorNavPath(state);
        state.aiState = PREDATOR_AI.PATROL;
        state.patrolTarget.x = state.spawnPoint.x;
        state.patrolTarget.z = state.spawnPoint.z;
        break;
      }
      if (
        nearestDist < state.attackRange
        && nearestPlayer
        && canPredatorHitPlayer(state, nearestPlayer)
        && hasPredatorLineOfSight(state, nearestPlayer, colliders)
      ) {
        clearPredatorNavPath(state);
        state.aiState = PREDATOR_AI.ATTACK;
        state.aiTimer = state.attackWindup;
        state.attackHitPending = true;
        break;
      }
      if (nearestDist > state.leashRange * 1.5) {
        clearPredatorNavPath(state);
        state.aiState = PREDATOR_AI.PATROL;
        state.patrolTarget.x = state.spawnPoint.x;
        state.patrolTarget.z = state.spawnPoint.z;
        break;
      }
      const steerTarget = getPredatorSteerTarget(state, nearestPlayer.position, navMesh);
      const dir = normalizeXZ({
        x: steerTarget.x - state.position.x,
        z: steerTarget.z - state.position.z,
      });
      moveToward(state, dir, state.chaseSpeed, dt);
      faceDirection(state, dir, dt);
      break;
    }

    case PREDATOR_AI.ATTACK: {
      clearPredatorNavPath(state);
      let hitResult = null;
      if (
        state.attackHitPending
        && state.aiTimer <= state.attackHitTime
        && nearestPlayer
        && nearestDist < state.attackRange * 1.5
        && canPredatorHitPlayer(state, nearestPlayer)
      ) {
        state.attackHitPending = false;
        const dx = nearestPlayer.position.x - state.position.x;
        const dz = nearestPlayer.position.z - state.position.z;
        const dir = normalizeXZ({ x: dx, z: dz });
        hitResult = {
          playerId: nearestPlayer.id,
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
      clearPredatorNavPath(state);
      if (state.aiTimer <= 0) {
        if (
          nearestDist < state.attackRange
          && nearestPlayer
          && canPredatorHitPlayer(state, nearestPlayer)
          && hasPredatorLineOfSight(state, nearestPlayer, colliders)
        ) {
          state.aiState = PREDATOR_AI.ATTACK;
          state.aiTimer = state.attackWindup;
          state.attackHitPending = true;
        } else if (nearestDist < state.aggroRange && nearestPlayer) {
          state.aiState = PREDATOR_AI.CHASE;
        } else {
          state.aiState = PREDATOR_AI.PATROL;
          state.patrolTarget.x = state.spawnPoint.x;
          state.patrolTarget.z = state.spawnPoint.z;
        }
      }
      break;

    case PREDATOR_AI.STUNNED:
      clearPredatorNavPath(state);
      if (state.aiTimer <= 0) {
        state.aiState = PREDATOR_AI.CHASE;
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
  };
}
