/**
 * Shared predator AI state and simulation.
 * Used by both server (authority) and client (interpolation).
 * Keep this file free of Three.js / DOM / Node dependencies.
 */

import {
  createDefaultQueryFilter,
  createFindNearestPolyResult,
  findNearestPoly,
  findPath,
} from 'navcat';
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
  ELEVATION_SEARCH: 'elevation_search',
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

const _navGroundScratch = createFindNearestPolyResult();
const _preyNavScratch = createFindNearestPolyResult();

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

    /** null | 'prep_jump' | 'air' — vertical pursuit during chase */
    chaseVerticalPhase: null,
    chasePrepTimer: 0,
    chaseAirTimer: 0,
    chaseJumpDir: { x: 0, z: 0 },
    chaseDesperateJumpTimer: 0,
    /** Navmesh / waypoint Y used to scale jump impulse (any height). */
    chaseJumpTargetY: 0,
    chaseJumpForwardSpeed: CAT_BT.chaseJumpForwardSpeed,

    /** null | 'look_hop' | 'look_hold' | 'drop_prep' | 'drop_air' */
    elevationSearchPhase: null,
    elevationSearchTimer: 0,
    elevationSearchDir: { x: 0, z: 0 },
    elevationDropIgnoreNavTimer: 0,
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

function predatorOnSameNavWalkableLayer(state, prey, navMesh) {
  if (!navMesh || !prey?.position) return false;
  const catY = sampleNavMeshSupportY(state, navMesh);
  const preyNav = sampleNavSurfaceNearPrey(navMesh, prey.position);
  if (catY == null || preyNav == null) return false;
  return Math.abs(catY - preyNav.y) < CAT_BT.sameNavSurfaceYTolerance;
}

function predatorCanStrikeFromSharedSurface(state, prey, navMesh) {
  if (!prey?.position || !canPredatorHitPlayer(state, prey)) return false;
  if (!state.grounded) return false;
  if (state.chaseVerticalPhase === 'prep_jump' || state.chaseVerticalPhase === 'air') return false;
  return predatorOnSameNavWalkableLayer(state, prey, navMesh);
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
      offGroundPriority: isPriorityOffGroundPrey(state, player),
    });
  }
  out.sort((a, b) => a.d - b.d);
  return out;
}

function isPriorityOffGroundPrey(state, player) {
  if (!player?.position) return false;
  if (player.wallHolding) return true;
  if (player.grounded === false) return true;
  return player.position.y > state.spawnPoint.y + CAT_BT.offGroundTargetPriorityMinY;
}

/**
 * Mice in aggro range on XZ that pass vertical band + relaxed hunt LOS (path/jump can close height gaps).
 */
function huntEligibleMiceSorted(state, sortedMice, colliders) {
  const out = [];
  for (const m of sortedMice) {
    if (m.d >= state.aggroRange) break;
    if (!huntVerticalBandOk(state, m.player)) continue;
    const losOk = !CAT_BT.requireLineOfSightForHunt
      || hasRelaxedHuntLineOfSight(state, m.player, colliders);
    if (!losOk) continue;
    out.push(m);
  }
  out.sort((a, b) => {
    if (a.offGroundPriority !== b.offGroundPriority) {
      return a.offGroundPriority ? -1 : 1;
    }
    return a.d - b.d;
  });
  return out;
}

/** Nearest hunt-eligible mouse in horizontal aggro (may be above/below until cat climbs/jumps). */
function firstHuntEligibleMouseInAggro(state, sortedMice, colliders) {
  const list = huntEligibleMiceSorted(state, sortedMice, colliders);
  return list.length ? list[0] : null;
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

  if (nearest.offGroundPriority && !cur.offGroundPriority) {
    state.chaseTargetId = nearest.id;
    clearPredatorNavPath(state);
    state.chaseFrustration *= 0.35;
    return;
  }

  if (cur.offGroundPriority && !nearest.offGroundPriority) {
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
function ensureChaseTarget(state, players, huntEligibleSorted) {
  if (!huntEligibleSorted.length) {
    state.chaseTargetId = null;
    clearPredatorNavPath(state);
    return null;
  }
  const cur = getChaseTargetPlayer(state, players);
  const curOk = cur && huntVerticalBandOk(state, cur)
    && distXZ(state.position, cur.position) < state.aggroRange * 1.02;
  if (!curOk) {
    state.chaseTargetId = huntEligibleSorted[0].id;
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

function segmentIntersectsAABB3D(ax, ay, az, bx, by, bz, box) {
  const { min, max } = box;
  let t0 = 0;
  let t1 = 1;
  const dx = bx - ax;
  const dy = by - ay;
  const dz = bz - az;

  const axes = [
    { o: ax, d: dx, mn: min.x, mx: max.x },
    { o: ay, d: dy, mn: min.y, mx: max.y },
    { o: az, d: dz, mn: min.z, mx: max.z },
  ];
  for (const { o, d, mn, mx } of axes) {
    if (Math.abs(d) < 1e-9) {
      if (o < mn || o > mx) return false;
      continue;
    }
    const invD = 1 / d;
    let tNear = (mn - o) * invD;
    let tFar = (mx - o) * invD;
    if (tNear > tFar) {
      const tmp = tNear;
      tNear = tFar;
      tFar = tmp;
    }
    t0 = Math.max(t0, tNear);
    t1 = Math.min(t1, tFar);
    if (t0 > t1) return false;
  }
  return true;
}

/**
 * 3D LOS for hunt/chase (cat chest → mouse chest). Unlike {@link hasPredatorLineOfSight},
 * allows looking up/down at prey on counters or lower floors.
 */
function hasRelaxedHuntLineOfSight(state, target, colliders) {
  if (!target?.position) return false;
  const ax = state.position.x;
  const ay = state.position.y + state.height * 0.32;
  const az = state.position.z;
  const bx = target.position.x;
  const by = target.position.y + (target.height ?? PHYSICS.playerHeight) * 0.32;
  const bz = target.position.z;

  for (const collider of colliders ?? []) {
    if (collider.type === 'surface' || collider.type === 'loot') continue;
    const box = collider.aabb;
    if (!box) continue;
    if (segmentIntersectsAABB3D(ax, ay, az, bx, by, bz, box)) {
      return false;
    }
  }
  return true;
}

function huntVerticalBandOk(state, player) {
  if (!player?.position) return false;
  const dy = player.position.y - state.position.y;
  if (dy < -CAT_BT.maxPreyBelowForHunt) return false;
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
  state.chaseVerticalPhase = null;
  state.chasePrepTimer = 0;
  state.chaseAirTimer = 0;
  state.chaseJumpDir.x = 0;
  state.chaseJumpDir.z = 0;
  state.chaseDesperateJumpTimer = 0;
  state.chaseJumpTargetY = 0;
  state.chaseJumpForwardSpeed = CAT_BT.chaseJumpForwardSpeed;
}

function resetElevationSearch(state) {
  state.elevationSearchPhase = null;
  state.elevationSearchTimer = 0;
  state.elevationSearchDir.x = 0;
  state.elevationSearchDir.z = 0;
  state.elevationDropIgnoreNavTimer = 0;
}

function pickChaseJumpTargetY(state, prey, preyNav, steer) {
  let y = prey.position.y;
  if (preyNav && preyNav.y > state.position.y - 0.04) y = Math.max(y, preyNav.y);
  if (steer && steer.y > state.position.y + 0.02) y = Math.max(y, steer.y);
  return y;
}

function computeChaseJumpVerticalSpeed(state, targetY) {
  const dy = Math.max(0, targetY - state.position.y);
  const gMag = Math.abs(state.gravity);
  const fromPhysics = Math.sqrt(2 * gMag * (dy + CAT_BT.chaseJumpHeightMargin));
  const vyFloor = CAT_BT.chaseJumpUpSpeed * 0.3;
  return Math.min(CAT_BT.chaseJumpMaxVy, Math.max(vyFloor, fromPhysics));
}

function computeChaseJumpAirTime(dy) {
  return CAT_BT.chaseJumpMaxAirTime
    + Math.min(CAT_BT.chaseJumpMaxAirTimeExtra, Math.max(0, dy) * CAT_BT.chaseJumpAirTimePerMeter);
}

function computeChaseJumpForwardSpeed(state, prey, preyNav, airTime) {
  const target = preyNav ?? prey?.position;
  if (!target) return CAT_BT.chaseJumpForwardSpeed;
  const distance = distXZ(state.position, target);
  const neededSpeed = distance / Math.max(0.2, airTime * 0.86);
  return Math.min(
    CAT_BT.chaseJumpMaxForwardSpeed,
    Math.max(CAT_BT.chaseJumpForwardSpeed, neededSpeed),
  );
}

function enterBoredWander(state) {
  clearPredatorNavPath(state);
  state.chaseTargetId = null;
  state.chaseFrustration = 0;
  resetChaseProgress(state);
  resetElevationSearch(state);
  state.aiState = PREDATOR_AI.BORED_WANDER;
  state.aiTimer = CAT_BT.boredWanderMin + Math.random() * (CAT_BT.boredWanderMax - CAT_BT.boredWanderMin);
  pickPatrolTarget(state, 1.15);
}

function enterElevationSearch(state) {
  clearPredatorNavPath(state);
  state.chaseTargetId = null;
  state.chaseFrustration = 0;
  resetChaseProgress(state);
  state.aiState = PREDATOR_AI.ELEVATION_SEARCH;
  state.aiTimer = CAT_BT.elevationSearchDuration;
  state.elevationSearchPhase = 'look_hop';
  state.elevationSearchTimer = 0;
  state.elevationSearchDir.x = 0;
  state.elevationSearchDir.z = 0;
}

function enterPatrolHome(state) {
  clearPredatorNavPath(state);
  resetChaseProgress(state);
  resetElevationSearch(state);
  state.chaseTargetId = null;
  state.chaseFrustration = 0;
  state.aiState = PREDATOR_AI.PATROL;
  state.patrolTarget.x = state.spawnPoint.x;
  state.patrolTarget.y = state.spawnPoint.y;
  state.patrolTarget.z = state.spawnPoint.z;
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

function sampleNavMeshSupportY(state, navMesh) {
  if (!navMesh) return null;
  const qy = Math.max(state.position.y, -0.5);
  findNearestPoly(
    _navGroundScratch,
    navMesh,
    [state.position.x, qy, state.position.z],
    NAV_QUERY_HALF_EXTENTS,
    CAT_NAV_QUERY_FILTER,
  );
  if (!_navGroundScratch.success) return null;
  const px = _navGroundScratch.position[0];
  const py = _navGroundScratch.position[1];
  const pz = _navGroundScratch.position[2];
  const dx = px - state.position.x;
  const dz = pz - state.position.z;
  if (dx * dx + dz * dz > 2.75 * 2.75) return null;
  return py;
}

/**
 * Nearest walkable point on the cat navmesh around the mouse (used to spot counter / ledge height).
 * @returns {{ x: number, y: number, z: number } | null}
 */
function sampleNavSurfaceNearPrey(navMesh, preyPos) {
  if (!navMesh || !preyPos) return null;
  const qy = Math.max(preyPos.y, -0.2);
  findNearestPoly(
    _preyNavScratch,
    navMesh,
    [preyPos.x, qy, preyPos.z],
    NAV_QUERY_HALF_EXTENTS,
    CAT_NAV_QUERY_FILTER,
  );
  if (!_preyNavScratch.success) return null;
  return {
    x: _preyNavScratch.position[0],
    y: _preyNavScratch.position[1],
    z: _preyNavScratch.position[2],
  };
}

function shouldChaseElevateToPreyLayer(state, prey, preyNav, effectiveElevGap, navMesh) {
  if (!prey?.position) return false;
  if (effectiveElevGap <= CAT_BT.chaseElevateMinGap) return false;
  if (!canPredatorHitPlayer(state, prey)) return true;

  const preyGroundedAboveCat = prey.grounded !== false
    && prey.position.y > state.position.y + CAT_BT.chaseElevateMinGap;
  const preyNavIsAboveCat = preyNav && preyNav.y > state.position.y + CAT_BT.chaseElevateMinGap * 0.5;
  if (!preyNavIsAboveCat) return preyGroundedAboveCat;

  return !predatorOnSameNavWalkableLayer(state, prey, navMesh);
}

export function simulatePredatorTick(state, players, dt, colliders, navMesh = null) {
  if (!state.alive) return null;

  state.aiTimer -= dt;
  state.navRepathTimer -= dt;
  state.elevationDropIgnoreNavTimer = Math.max(0, state.elevationDropIgnoreNavTimer - dt);
  const previousPosition = {
    x: state.position.x,
    y: state.position.y,
    z: state.position.z,
  };

  const now = Date.now() / 1000;
  const sortedMice = gatherMiceSortedByDistance(state, players);
  const huntEligibleMice = huntEligibleMiceSorted(state, sortedMice, colliders);
  const aggroPrey = firstHuntEligibleMouseInAggro(state, sortedMice, colliders);
  const preyInAggro = aggroPrey != null;

  const ambientGroundStates = new Set([
    PREDATOR_AI.IDLE,
    PREDATOR_AI.PATROL,
    PREDATOR_AI.SLEEP,
    PREDATOR_AI.GROOM,
    PREDATOR_AI.PLAY,
    PREDATOR_AI.BORED_WANDER,
  ]);
  if (
    !preyInAggro
    && ambientGroundStates.has(state.aiState)
    && state.position.y > state.spawnPoint.y + CAT_BT.catDescendAmbientAboveSpawn
  ) {
    enterElevationSearch(state);
  }

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

    case PREDATOR_AI.ELEVATION_SEARCH: {
      if (preyInAggro) {
        resetElevationSearch(state);
        state.chaseTargetId = aggroPrey.player.id;
        clearPredatorNavPath(state);
        state.chaseFrustration = 0;
        state.aiState = PREDATOR_AI.ALERT;
        state.aiTimer = state.alertDuration;
        break;
      }

      state.rotation += dt * 1.35;

      if (!state.elevationSearchPhase) {
        state.elevationSearchPhase = 'look_hop';
      }

      if (state.elevationSearchPhase === 'look_hop') {
        if (state.grounded) {
          state.velocity.y = Math.max(state.velocity.y, CAT_BT.elevationSearchHopUpSpeed);
          state.grounded = false;
        }
        state.elevationSearchPhase = 'look_hold';
        state.elevationSearchTimer = CAT_BT.elevationSearchHopLookTime;
        break;
      }

      if (state.elevationSearchPhase === 'look_hold') {
        if (state.grounded) {
          state.elevationSearchTimer -= dt;
          if (state.elevationSearchTimer <= 0 || state.aiTimer <= CAT_BT.elevationDropPrepTime) {
            state.elevationSearchPhase = 'drop_prep';
            state.elevationSearchTimer = CAT_BT.elevationDropPrepTime;
          }
        }
        break;
      }

      if (state.elevationSearchPhase === 'drop_prep') {
        const dir = normalizeXZ({
          x: state.spawnPoint.x - state.position.x,
          z: state.spawnPoint.z - state.position.z,
        });
        if (dir.x === 0 && dir.z === 0) {
          dir.x = Math.sin(state.rotation);
          dir.z = Math.cos(state.rotation);
        }
        state.elevationSearchDir.x = dir.x;
        state.elevationSearchDir.z = dir.z;
        faceDirection(state, dir, dt);

        state.elevationSearchTimer -= dt;
        if (state.elevationSearchTimer <= 0) {
          state.velocity.y = Math.max(state.velocity.y, CAT_BT.elevationDropUpSpeed);
          state.grounded = false;
          state.elevationDropIgnoreNavTimer = CAT_BT.elevationDropIgnoreNavTime;
          state.elevationSearchPhase = 'drop_air';
        }
        break;
      }

      if (state.elevationSearchPhase === 'drop_air') {
        const dir = state.elevationSearchDir;
        moveToward(state, dir, CAT_BT.elevationDropForwardSpeed, dt);
        faceDirection(state, dir, dt);
        if (state.grounded && state.position.y <= state.spawnPoint.y + 0.18) {
          enterPatrolHome(state);
        } else if (state.aiTimer <= -0.8 && state.position.y > state.spawnPoint.y + CAT_BT.catDescendAmbientAboveSpawn) {
          state.elevationDropIgnoreNavTimer = Math.max(
            state.elevationDropIgnoreNavTimer,
            CAT_BT.elevationDropIgnoreNavTime * 0.5,
          );
          state.aiTimer = CAT_BT.elevationSearchDuration * 0.35;
        }
      }
      break;
    }

    case PREDATOR_AI.ALERT: {
      const preyA = ensureChaseTarget(state, players, huntEligibleMice);
      if (!preyA || distXZ(state.position, preyA.position) > state.aggroRange * 1.08) {
        clearPredatorNavPath(state);
        state.chaseTargetId = null;
        resetChaseProgress(state);
        state.aiState = PREDATOR_AI.IDLE;
        state.aiTimer = initialIdleDelay();
        break;
      }
      if (CAT_BT.requireLineOfSightForHunt) {
        if (hasRelaxedHuntLineOfSight(state, preyA, colliders)) {
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
      const preyR = ensureChaseTarget(state, players, huntEligibleMice);
      if (!preyR || distXZ(state.position, preyR.position) > state.aggroRange * 1.15) {
        clearPredatorNavPath(state);
        state.chaseTargetId = null;
        resetChaseProgress(state);
        state.aiState = PREDATOR_AI.IDLE;
        state.aiTimer = initialIdleDelay();
        break;
      }
      if (CAT_BT.requireLineOfSightForHunt) {
        if (hasRelaxedHuntLineOfSight(state, preyR, colliders)) {
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
      const visibleHunt = CAT_BT.requireLineOfSightForHunt
        ? huntEligibleMice.filter((m) => hasRelaxedHuntLineOfSight(state, m.player, colliders))
        : huntEligibleMice;
      const huntPool = visibleHunt.length > 0 ? visibleHunt : huntEligibleMice;
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
        && predatorCanStrikeFromSharedSurface(state, prey, navMesh)
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

      state.chaseDesperateJumpTimer = Math.max(0, state.chaseDesperateJumpTimer - dt);

      if (state.chaseVerticalPhase === 'prep_jump') {
        state.chasePrepTimer -= dt;
        if (prey) {
          facePosition(state, prey.position, dt);
        }
        if (state.chasePrepTimer <= 0) {
          state.chaseVerticalPhase = 'air';
          state.grounded = false;
          const targetY = (state.chaseJumpTargetY > state.position.y + 0.03)
            ? state.chaseJumpTargetY
            : (prey ? pickChaseJumpTargetY(state, prey, null, null) : state.position.y + 0.6);
          const dy = Math.max(0, targetY - state.position.y);
          state.chaseAirTimer = computeChaseJumpAirTime(dy);
          state.chaseJumpForwardSpeed = computeChaseJumpForwardSpeed(state, prey, null, state.chaseAirTimer);
          const dir = prey
            ? normalizeXZ({
              x: prey.position.x - state.position.x,
              z: prey.position.z - state.position.z,
            })
            : normalizeXZ({ x: Math.sin(state.rotation), z: Math.cos(state.rotation) });
          state.chaseJumpDir.x = dir.x;
          state.chaseJumpDir.z = dir.z;
          state.velocity.y = computeChaseJumpVerticalSpeed(state, targetY);
        }
        if (prey && CAT_BT.requireLineOfSightForHunt) {
          if (hasRelaxedHuntLineOfSight(state, prey, colliders)) {
            state.chaseLosBlockedTimer = 0;
          } else {
            state.chaseLosBlockedTimer += dt;
            if (state.chaseLosBlockedTimer >= CAT_BT.losBlockedGiveUpSeconds) {
              enterBoredWander(state);
            }
          }
        }
        break;
      }

      if (state.chaseVerticalPhase === 'air') {
        state.chaseAirTimer -= dt;
        moveToward(state, state.chaseJumpDir, state.chaseJumpForwardSpeed ?? CAT_BT.chaseJumpForwardSpeed, dt);
        if (state.chaseAirTimer <= 0) {
          state.chaseVerticalPhase = null;
        }
        if (prey && CAT_BT.requireLineOfSightForHunt) {
          if (hasRelaxedHuntLineOfSight(state, prey, colliders)) {
            state.chaseLosBlockedTimer = 0;
          } else {
            state.chaseLosBlockedTimer += dt;
            if (state.chaseLosBlockedTimer >= CAT_BT.losBlockedGiveUpSeconds) {
              enterBoredWander(state);
            }
          }
        }
        break;
      }

      if (prey && CAT_BT.requireLineOfSightForHunt) {
        if (hasRelaxedHuntLineOfSight(state, prey, colliders)) {
          state.chaseLosBlockedTimer = 0;
        } else {
          state.chaseLosBlockedTimer += dt;
          if (state.chaseLosBlockedTimer >= CAT_BT.losBlockedGiveUpSeconds) {
            enterBoredWander(state);
            break;
          }
        }
      }

      const preyNav = prey && navMesh ? sampleNavSurfaceNearPrey(navMesh, prey.position) : null;
      const vertGap = prey ? prey.position.y - state.position.y : 0;
      const navElevGap = preyNav ? preyNav.y - state.position.y : -1000;
      const effectiveElevGap = Math.max(vertGap, navElevGap > 0.02 ? navElevGap : 0);
      const needElevate = shouldChaseElevateToPreyLayer(state, prey, preyNav, effectiveElevGap, navMesh);

      let steer = null;
      if (prey && navMesh && needElevate) {
        steer = getPredatorSteerTarget(state, prey.position, navMesh);
      }
      const steerHigh = steer && steer.y > state.position.y + CAT_BT.chaseJumpMinWaypointRise;
      const horizClose = steer
        && distSqXZ(state.position, steer) <= CAT_BT.chaseJumpLaunchDistXZ * CAT_BT.chaseJumpLaunchDistXZ;
      const preyNavHigher = preyNav && preyNav.y > state.position.y + 0.14;
      const preyNavNearMouse = preyNav
        && distSqXZ(prey.position, preyNav) <= 2.8 * 2.8;
      const preyGroundedElevated = prey
        && prey.grounded !== false
        && vertGap > CAT_BT.chaseElevateMinGap;

      const jumpFromWaypoint = needElevate && steerHigh && horizClose && state.chaseDesperateJumpTimer <= 0;
      const jumpFromPreyNav = needElevate
        && state.chaseDesperateJumpTimer <= 0
        && preyNavHigher
        && preyNavNearMouse
        && effectiveElevGap > 0.2;
      const jumpFromPreyElevation = needElevate
        && state.chaseDesperateJumpTimer <= 0
        && preyGroundedElevated
        && effectiveElevGap > 0.2;
      if (jumpFromWaypoint || jumpFromPreyNav || jumpFromPreyElevation) {
        state.chaseJumpTargetY = pickChaseJumpTargetY(state, prey, preyNav, steer);
        state.chaseVerticalPhase = 'prep_jump';
        state.chasePrepTimer = CAT_BT.chaseJumpPrepTime;
        clearPredatorNavPath(state);
        break;
      }

      let moved = false;
      if (prey) {
        moved = navSteerMove(state, prey.position, navMesh, state.chaseSpeed, dt);
      }

      if (
        needElevate
        && !moved
        && state.chaseDesperateJumpTimer <= 0
        && distPrey < 2.05
        && effectiveElevGap > 0.35
      ) {
        state.chaseJumpTargetY = pickChaseJumpTargetY(state, prey, preyNav, steer);
        state.chaseVerticalPhase = 'prep_jump';
        state.chasePrepTimer = CAT_BT.chaseJumpPrepTime * 0.88;
        state.chaseDesperateJumpTimer = CAT_BT.chaseDesperateJumpCooldown;
        clearPredatorNavPath(state);
        break;
      }

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

      if (
        needElevate
        && state.chaseDesperateJumpTimer <= 0
        && state.chasePlateauTimer > CAT_BT.chaseJumpPlateauStallSeconds
        && distPrey < 3.05
        && effectiveElevGap > CAT_BT.chaseElevateMinGap * 0.82
      ) {
        state.chaseJumpTargetY = pickChaseJumpTargetY(state, prey, preyNav, steer);
        state.chaseVerticalPhase = 'prep_jump';
        state.chasePrepTimer = CAT_BT.chaseJumpPrepTime;
        clearPredatorNavPath(state);
        break;
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
        && predatorCanStrikeFromSharedSurface(state, preyAtk, navMesh)
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
        ensureChaseTarget(state, players, huntEligibleMice);
        refreshChaseTarget(state, huntEligibleMice, now);
        const preyC = getChaseTargetPlayer(state, players);
        const distC = preyC ? distXZ(state.position, preyC.position) : Infinity;
        if (
          distC < state.attackRange
          && preyC
          && predatorCanStrikeFromSharedSurface(state, preyC, navMesh)
          && hasPredatorLineOfSight(state, preyC, colliders)
        ) {
          clearPredatorNavPath(state);
          state.aiState = PREDATOR_AI.ATTACK;
          state.aiTimer = state.attackWindup;
          state.attackHitPending = true;
        } else if (
          distC < state.aggroRange
          && preyC
          && huntVerticalBandOk(state, preyC)
          && (!CAT_BT.requireLineOfSightForHunt || hasRelaxedHuntLineOfSight(state, preyC, colliders))
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

  resolvePredatorCollisions(state, colliders, previousPosition);

  // Navmesh landing when already near walkable height (counters, etc.).
  const supportY = sampleNavMeshSupportY(state, navMesh);
  let landedOnNav = false;
  if (supportY != null && state.velocity.y <= 0 && state.elevationDropIgnoreNavTimer <= 0) {
    const dy = supportY - state.position.y;
    if (dy >= -0.28 && dy <= 0.2) {
      state.position.y = supportY;
      state.velocity.y = 0;
      state.grounded = true;
      landedOnNav = true;
    }
  }

  // Room floor at y=0 (kitchen). `resolvePredatorCollisions` skips `surface` colliders, so there is no
  // triangle mesh floor — only this clamp prevents falling through when navmesh snap does not apply.
  const ROOM_FLOOR_Y = 0;
  if (!landedOnNav && state.velocity.y <= 0 && state.position.y <= ROOM_FLOOR_Y + 0.08) {
    state.position.y = ROOM_FLOOR_Y;
    state.velocity.y = 0;
    state.grounded = true;
  } else if (!landedOnNav && state.position.y > ROOM_FLOOR_Y + 0.12) {
    state.grounded = false;
  }

  if (state.position.y < ROOM_FLOOR_Y) {
    state.position.y = ROOM_FLOOR_Y;
    state.velocity.y = 0;
    state.grounded = true;
  }

  if (state.aiState === PREDATOR_AI.CHASE && state.chaseVerticalPhase === 'air' && state.grounded) {
    state.chaseVerticalPhase = null;
    state.chaseAirTimer = 0;
  }

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
  const cv = state.chaseVerticalPhase === 'prep_jump' ? 2
    : state.chaseVerticalPhase === 'air' ? 3
      : 0;
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
    cv,
  };
}
