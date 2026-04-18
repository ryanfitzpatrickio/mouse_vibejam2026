/**
 * Server-side Roomba: dock → clean (navmesh random wander when available, else lawn-mower) → return → charge.
 * Uses the roomba-baked navmesh for paths (wide agent); tracks visited polygons as a pretend room map.
 */

import {
  createDefaultQueryFilter,
  createFindNearestPolyResult,
  findNearestPoly,
  findPath,
  findRandomPoint,
  findRandomPointAroundCircle,
  queryPolygons,
} from 'navcat';
import { box3 } from 'mathcat';
import { LEVEL_WORLD_BOUNDS_XZ } from './levelWorldBounds.js';
import { PHYSICS } from './physics.js';
import { NAV_AGENT_CONFIGS, NAV_POLY_FLAGS } from './navConfig.js';
import { ROOMBA_BODY_HEIGHT, ROOMBA_RADIUS_XZ } from './roombaDimensions.js';

export const ROOMBA_PHASE = Object.freeze({
  CHARGING: 'charging',
  DEPLOYING: 'deploying',
  VACUUMING: 'vacuuming',
  RETURNING: 'returning',
});

const GRAVITY = -22;
const CHARGE_SECONDS = 9;
const VACUUM_SECONDS = 48;
const DEPLOY_SECONDS = 1.35;
const MOVE_SPEED = 2.65;
const TURN_SPEED = 5.5;
const DOCK_SNAP_DIST = 0.42;
const CAT_BUMP_DIST = 0.82;
const CAT_BUMP_IMPULSE = 6;

/** 360° horizontal capture within radius → pull under → cannon launch (see `party/mouseLaunchWorld.js`). */
/** 360° suck-up proximity: roomba edge + ~1 foot (0.3048m) of reach. */
const MOUSE_CAPTURE_MAX_DIST = ROOMBA_RADIUS_XZ + 0.3048;
/** Outer edge of vacuum influence (world XZ); pull scales up as the mouse moves inward. */
const VACUUM_PULL_MAX_DIST = 3.95;
const VACUUM_PULL_MIN_DIST = 0.07;
/** Peak horizontal acceleration (m/s²) at the center of the pull zone (before capture). */
const VACUUM_PULL_ACCEL_MAX = 26;
const VACUUM_PULL_UP_ACCEL = 6.2;
const MOUSE_SUCK_DURATION = 0.36;
const MOUSE_SUCK_LERP = 20;

const DEFAULT_STRIPE_SPACING = 0.68;
const STUCK_MOVE_THRESH = 0.018;
const STUCK_TIME_TRIGGER = 0.28;
const ESCAPE_DURATION = 1.05;
const ESCAPE_MIN_TARGET_DIST = 0.75;
const ESCAPE_STALL_TRIGGER = 0.42;
const ROW_PROGRESS_EPS = 0.025;
const ROW_PROGRESS_STALL_TRIGGER = 0.58;
const ROW_BYPASS_MARGIN = 0.42;
const LANE_REACH_DIST = 0.16;
const RETURN_STALL_TRIGGER = 0.55;
const RETURN_ESCAPE_DURATION = 0.9;
const RETURN_PROGRESS_EPS = 0.025;
const ROW_END_EPS = 0.52;
const NAV_STALL_FRAMES = 9;
const WAYPOINT_SKIP_DIST_SQ = 0.11 * 0.11;
const STRIPE_LOOKAHEAD = 2.05;

/** Bumper: AI tried to move at least this fraction of nominal step, but physics cut actual progress */
const BUMP_INTENDED_MIN_FRAC = 0.34;
const BUMP_ACTUAL_MAX_FRAC = 0.26;
/** Seconds before another bumper-driven turn (avoids thrashing while sliding along walls) */
const BUMP_COOLDOWN = 0.48;
const BUMP_TURN_HALF_PI = Math.PI * 0.5;
const BUMP_TURN_JITTER = 0.38;

const NAV_REPATH_INTERVAL = 0.28;
const NAV_WAYPOINT_REACH = 0.52;
const NAV_REPATH_DIST_SQ = 0.65 * 0.65;

const ROOMBA_QUERY_HALF_EXTENTS = NAV_AGENT_CONFIGS.roomba.queryHalfExtents;
const ROOMBA_NAV_MAX_Y_DELTA = Math.max(0.55, ROOMBA_BODY_HEIGHT + 0.35);
const LOCAL_AVOID_TIME = 0.62;
const LOCAL_AVOID_MIN_LOOKAHEAD = 0.95;
const LOCAL_AVOID_CLEARANCE = 0.12;

function navRepathDistSq(roomba) {
  const r = roomba?.radius ?? ROOMBA_RADIUS_XZ;
  const t = Math.max(0.65, r * 0.4);
  return Math.max(NAV_REPATH_DIST_SQ, t * t);
}

function navWaypointReachSq(roomba) {
  const r = roomba?.radius ?? ROOMBA_RADIUS_XZ;
  const reach = Math.max(NAV_WAYPOINT_REACH, r * 0.4);
  return reach * reach;
}

function waypointSkipDistSq(roomba) {
  const r = roomba?.radius ?? ROOMBA_RADIUS_XZ;
  const d = Math.max(0.11, r * 0.13);
  return d * d;
}

function stuckMoveThreshold(roomba) {
  const r = roomba?.radius ?? ROOMBA_RADIUS_XZ;
  return Math.max(STUCK_MOVE_THRESH, 0.005 + r * 0.008);
}

function skipBehindMaxDistSq(roomba) {
  const r = roomba?.radius ?? ROOMBA_RADIUS_XZ;
  const lim = r + 1.05;
  return lim * lim;
}

function stripeLookahead(roomba) {
  const r = roomba?.radius ?? ROOMBA_RADIUS_XZ;
  return Math.max(STRIPE_LOOKAHEAD, r * 0.95);
}

const ROOMBA_NAV_QUERY_FILTER = (() => {
  const filter = createDefaultQueryFilter();
  filter.excludeFlags = NAV_POLY_FLAGS.MOUSE_ONLY;
  return filter;
})();

const _nearestScratch = createFindNearestPolyResult();
const _nearestProjScratch = createFindNearestPolyResult();
const _navBounds = box3.create();
const _pathDestTmp = { x: 0, y: 0, z: 0 };
const _wanderPosScratch = [0, 0, 0];

function distXZ(ax, az, bx, bz) {
  const dx = ax - bx;
  const dz = az - bz;
  return Math.sqrt(dx * dx + dz * dz);
}

function distSqXZ(ax, az, bx, bz) {
  const dx = ax - bx;
  const dz = az - bz;
  return dx * dx + dz * dz;
}

function clampToBounds(pos, radius) {
  const { minX, maxX, minZ, maxZ } = LEVEL_WORLD_BOUNDS_XZ;
  pos.x = Math.min(maxX - radius, Math.max(minX + radius, pos.x));
  pos.z = Math.min(maxZ - radius, Math.max(minZ + radius, pos.z));
}

function forwardXZ(rotation) {
  return { x: Math.sin(rotation), z: Math.cos(rotation) };
}

/**
 * Classic bumper: one wall touch → turn ~90° left or right and pick a new heading / stripe.
 * @param {object} roomba
 * @param {string} phase
 */
function applyBumperWallReaction(roomba, phase) {
  const left = Math.random() < 0.5;
  const sign = left ? -1 : 1;
  const jitter = (Math.random() - 0.5) * BUMP_TURN_JITTER;
  roomba.rotation += sign * (BUMP_TURN_HALF_PI + jitter);
  clearRoombaNavPath(roomba);
  roomba.localAvoidTime = 0;

  if (phase === ROOMBA_PHASE.VACUUMING && roomba.coverage) {
    const c = roomba.coverage;
    c.bypass = null;
    c.stuckTime = 0;
    c.rowStallTime = 0;
    c.escapeTime = 0;
    c.escapeStallTime = 0;
    c.navStallFrames = 0;
    c.lastWpDistSq = 1e9;

    if (c.mode === 'nav') {
      c.wanderDest = null;
      c.wanderTtl = 0;
    } else {
      const sp = c.stripeSpacing;
      const stripeDelta = left ? -1 : 1;
      c.stripeIndex = Math.max(0, Math.min(c.stripeMax, c.stripeIndex + stripeDelta));
      const { minZ, maxZ } = LEVEL_WORLD_BOUNDS_XZ;
      c.anchorZ = minZ + c.pad + c.stripeIndex * sp;
      c.anchorZ = Math.min(maxZ - c.pad, Math.max(minZ + c.pad, c.anchorZ));
      if (Math.random() < 0.5) c.alongPositiveX = !c.alongPositiveX;
      c.rowProgress = roomba.position.x * (c.alongPositiveX ? 1 : -1);
    }
  }
}

function normalizeXZ(v) {
  const len = Math.sqrt(v.x * v.x + v.z * v.z);
  if (len < 0.0001) return { x: 0, z: 0 };
  return { x: v.x / len, z: v.z / len };
}

function angleDiff(target, current) {
  let d = target - current;
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

function iterPlayerStates(players) {
  if (!players) return [];
  return players instanceof Map ? players.values() : Object.values(players);
}

function isCircleBlockedXZ(x, z, floorY, bodyHeight, radius, colliders) {
  if (!colliders?.length) return false;
  for (const collider of colliders) {
    if (collider.type === 'surface' || collider.type === 'loot') continue;
    const { min, max } = collider.aabb;
    if (floorY > max.y + 0.02 || floorY + bodyHeight < min.y - 0.02) continue;
    const closestX = Math.max(min.x, Math.min(x, max.x));
    const closestZ = Math.max(min.z, Math.min(z, max.z));
    const dx = x - closestX;
    const dz = z - closestZ;
    if (dx * dx + dz * dz < radius * radius * 0.98) return true;
  }
  return false;
}

function colliderBlocksRoombaFloor(roomba, collider) {
  if (!collider?.aabb || collider.type === 'surface' || collider.type === 'loot') return false;
  const { min, max } = collider.aabb;
  const floorY = roomba.position.y;
  const bodyHeight = roomba.height ?? ROOMBA_BODY_HEIGHT;
  return floorY <= max.y + 0.02 && floorY + bodyHeight >= min.y - 0.02;
}

function circleOverlapsColliderXZ(x, z, radius, collider) {
  const { min, max } = collider.aabb;
  const closestX = Math.max(min.x, Math.min(x, max.x));
  const closestZ = Math.max(min.z, Math.min(z, max.z));
  const dx = x - closestX;
  const dz = z - closestZ;
  return dx * dx + dz * dz < radius * radius;
}

function findLocalBlocker(roomba, dir, distance, colliders) {
  if (!colliders?.length) return null;
  const radius = (roomba.radius ?? ROOMBA_RADIUS_XZ) + LOCAL_AVOID_CLEARANCE;
  const samples = 5;
  let best = null;
  let bestT = Infinity;

  for (const collider of colliders) {
    if (!colliderBlocksRoombaFloor(roomba, collider)) continue;
    for (let i = 1; i <= samples; i += 1) {
      const t = (i / samples) * distance;
      const x = roomba.position.x + dir.x * t;
      const z = roomba.position.z + dir.z * t;
      if (!circleOverlapsColliderXZ(x, z, radius, collider)) continue;
      if (t < bestT) {
        best = collider;
        bestT = t;
      }
      break;
    }
  }

  return best;
}

function blockerAwayVector(roomba, collider) {
  const { min, max } = collider.aabb;
  const px = roomba.position.x;
  const pz = roomba.position.z;
  const closestX = Math.max(min.x, Math.min(px, max.x));
  const closestZ = Math.max(min.z, Math.min(pz, max.z));
  let away = normalizeXZ({ x: px - closestX, z: pz - closestZ });
  if (away.x || away.z) return away;

  const distances = [
    { x: -1, z: 0, d: Math.abs(px - min.x) },
    { x: 1, z: 0, d: Math.abs(max.x - px) },
    { x: 0, z: -1, d: Math.abs(pz - min.z) },
    { x: 0, z: 1, d: Math.abs(max.z - pz) },
  ];
  distances.sort((a, b) => a.d - b.d);
  away = distances[0] ?? { x: 1, z: 0 };
  return { x: away.x, z: away.z };
}

function localAvoidanceDir(roomba, dir, target, colliders, dt) {
  const baseDir = normalizeXZ(dir);
  if (!baseDir.x && !baseDir.z) return baseDir;

  roomba.localAvoidTime = Math.max(0, (roomba.localAvoidTime ?? 0) - dt);
  const lookahead = Math.max(LOCAL_AVOID_MIN_LOOKAHEAD, MOVE_SPEED * dt + roomba.radius * 0.82);
  const blocker = findLocalBlocker(roomba, baseDir, lookahead, colliders);
  if (!blocker) {
    roomba.localAvoidTime = 0;
    return baseDir;
  }

  const sideSign = chooseLocalAvoidSide(roomba, baseDir, target, blocker, colliders);
  roomba.localAvoidSide = sideSign;
  roomba.localAvoidTime = LOCAL_AVOID_TIME;

  const away = blockerAwayVector(roomba, blocker);
  const avoid = localAvoidCandidateDir(baseDir, away, sideSign);
  return avoid.x || avoid.z ? avoid : baseDir;
}

function localAvoidCandidateDir(dir, away, sideSign) {
  const tangentBase = away.x || away.z
    ? { x: -away.z, z: away.x }
    : { x: -dir.z, z: dir.x };
  const tangent = { x: tangentBase.x * sideSign, z: tangentBase.z * sideSign };
  return normalizeXZ({
    x: tangent.x * 1.25 + away.x * 0.42 + dir.x * 0.28,
    z: tangent.z * 1.25 + away.z * 0.42 + dir.z * 0.28,
  });
}

function chooseLocalAvoidSide(roomba, dir, target, blocker, colliders) {
  const remembered = roomba.localAvoidTime > 0 ? roomba.localAvoidSide : 0;
  const toTarget = normalizeXZ({
    x: (target?.x ?? roomba.position.x + dir.x) - roomba.position.x,
    z: (target?.z ?? roomba.position.z + dir.z) - roomba.position.z,
  });
  const away = blockerAwayVector(roomba, blocker);
  const testDist = Math.max(LOCAL_AVOID_MIN_LOOKAHEAD, roomba.radius * 0.9);
  const radius = (roomba.radius ?? ROOMBA_RADIUS_XZ) + LOCAL_AVOID_CLEARANCE;

  let bestSide = remembered || 1;
  let bestScore = -Infinity;
  for (const sideSign of [-1, 1]) {
    const candidate = localAvoidCandidateDir(dir, away, sideSign);
    const tx = roomba.position.x + candidate.x * testDist;
    const tz = roomba.position.z + candidate.z * testDist;
    let score = candidate.x * toTarget.x + candidate.z * toTarget.z;
    if (remembered === sideSign) score += 0.28;
    if (colliderBlocksRoombaFloor(roomba, blocker) && circleOverlapsColliderXZ(tx, tz, radius, blocker)) {
      score -= 2.5;
    }
    if (isCircleBlockedXZ(tx, tz, roomba.position.y, roomba.height, radius, colliders)) {
      score -= 1.2;
    }
    if (score > bestScore) {
      bestScore = score;
      bestSide = sideSign;
    }
  }
  return bestSide;
}

function resolveRoombaHardOverlaps(roomba, colliders) {
  if (!colliders?.length) return;
  const radius = roomba.radius ?? ROOMBA_RADIUS_XZ;
  const eps = 0.012;

  for (const collider of colliders) {
    if (!colliderBlocksRoombaFloor(roomba, collider)) continue;
    const { min, max } = collider.aabb;
    const expandedMinX = min.x - radius;
    const expandedMaxX = max.x + radius;
    const expandedMinZ = min.z - radius;
    const expandedMaxZ = max.z + radius;
    const px = roomba.position.x;
    const pz = roomba.position.z;
    if (px < expandedMinX || px > expandedMaxX || pz < expandedMinZ || pz > expandedMaxZ) {
      continue;
    }

    const closestX = Math.max(min.x, Math.min(px, max.x));
    const closestZ = Math.max(min.z, Math.min(pz, max.z));
    const dx = px - closestX;
    const dz = pz - closestZ;
    const distSq = dx * dx + dz * dz;
    if (distSq > 0.000001 && distSq < radius * radius) {
      const dist = Math.sqrt(distSq);
      const push = radius - dist + eps;
      roomba.position.x += (dx / dist) * push;
      roomba.position.z += (dz / dist) * push;
      continue;
    }

    const exits = [
      { axis: 'x', value: expandedMinX - eps, d: Math.abs(px - expandedMinX) },
      { axis: 'x', value: expandedMaxX + eps, d: Math.abs(expandedMaxX - px) },
      { axis: 'z', value: expandedMinZ - eps, d: Math.abs(pz - expandedMinZ) },
      { axis: 'z', value: expandedMaxZ + eps, d: Math.abs(expandedMaxZ - pz) },
    ];
    exits.sort((a, b) => a.d - b.d);
    const exit = exits[0];
    if (exit?.axis === 'x') roomba.position.x = exit.value;
    else if (exit?.axis === 'z') roomba.position.z = exit.value;
  }
}

function resolveRoombaCollisions(roomba, colliders, previousPosition = null) {
  if (!colliders?.length) return;
  const r = roomba.radius ?? ROOMBA_RADIUS_XZ;
  const h = roomba.height ?? ROOMBA_BODY_HEIGHT;
  const previousX = previousPosition?.x ?? roomba.position.x;
  const previousY = previousPosition?.y ?? roomba.position.y;
  const previousZ = previousPosition?.z ?? roomba.position.z;

  for (const collider of colliders) {
    if (!colliderBlocksRoombaFloor(roomba, collider)) continue;
    const { min, max } = collider.aabb;
    const px = roomba.position.x;
    const pz = roomba.position.z;
    const expandedMinX = min.x - r;
    const expandedMaxX = max.x + r;
    const expandedMinZ = min.z - r;
    const expandedMaxZ = max.z + r;
    const ySweepOverlaps = Math.max(previousY, roomba.position.y) <= max.y + 0.001
      && Math.min(previousY + h, roomba.position.y + h) >= min.y - 0.001;
    const sweptAcrossZ = Math.max(previousZ, pz) >= expandedMinZ - 0.001
      && Math.min(previousZ, pz) <= expandedMaxZ + 0.001;
    const sweptAcrossX = Math.max(previousX, px) >= expandedMinX - 0.001
      && Math.min(previousX, px) <= expandedMaxX + 0.001;

    if (ySweepOverlaps) {
      if (previousX < min.x - 0.001 && px >= min.x - 0.001 && sweptAcrossZ) {
        roomba.position.x = expandedMinX;
        continue;
      }
      if (previousX > max.x + 0.001 && px <= max.x + 0.001 && sweptAcrossZ) {
        roomba.position.x = expandedMaxX;
        continue;
      }
      if (previousZ < min.z - 0.001 && pz >= min.z - 0.001 && sweptAcrossX) {
        roomba.position.z = expandedMinZ;
        continue;
      }
      if (previousZ > max.z + 0.001 && pz <= max.z + 0.001 && sweptAcrossX) {
        roomba.position.z = expandedMaxZ;
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
      roomba.position.x += (dx / dist) * overlap;
      roomba.position.z += (dz / dist) * overlap;
    }
  }
}

function updateRoombaSafePosition(roomba, colliders) {
  if (isCircleBlockedXZ(roomba.position.x, roomba.position.z, roomba.position.y, roomba.height, roomba.radius, colliders)) {
    return;
  }
  roomba.lastSafeX = roomba.position.x;
  roomba.lastSafeY = roomba.position.y;
  roomba.lastSafeZ = roomba.position.z;
}

function restoreRoombaSafePosition(roomba) {
  if (!Number.isFinite(roomba.lastSafeX) || !Number.isFinite(roomba.lastSafeZ)) return false;
  roomba.position.x = roomba.lastSafeX;
  roomba.position.y = Number.isFinite(roomba.lastSafeY) ? roomba.lastSafeY : roomba.position.y;
  roomba.position.z = roomba.lastSafeZ;
  roomba.velocity.x = 0;
  roomba.velocity.z = 0;
  return true;
}

function pickOverlapEscapeTarget(roomba, colliders, navMesh) {
  if (!colliders?.length) return null;
  const radius = roomba.radius ?? ROOMBA_RADIUS_XZ;
  const push = Math.max(0.48, radius * 0.36);
  const candidates = [];

  const add = (x, z, bias = 0) => {
    const p = { x, y: roomba.position.y, z };
    clampToBounds(p, radius);
    candidates.push({ x: p.x, z: p.z, bias });
  };

  for (const collider of colliders) {
    if (!colliderBlocksRoombaFloor(roomba, collider)) continue;
    const { min, max } = collider.aabb;
    const expandedMinX = min.x - radius - LOCAL_AVOID_CLEARANCE;
    const expandedMaxX = max.x + radius + LOCAL_AVOID_CLEARANCE;
    const expandedMinZ = min.z - radius - LOCAL_AVOID_CLEARANCE;
    const expandedMaxZ = max.z + radius + LOCAL_AVOID_CLEARANCE;
    const px = roomba.position.x;
    const pz = roomba.position.z;
    if (px < expandedMinX || px > expandedMaxX || pz < expandedMinZ || pz > expandedMaxZ) {
      continue;
    }

    const cz = Math.max(expandedMinZ, Math.min(pz, expandedMaxZ));
    const cx = Math.max(expandedMinX, Math.min(px, expandedMaxX));
    const rowDx = roomba.coverage?.alongPositiveX ? 1 : -1;
    add(expandedMinX - push, cz, rowDx > 0 ? 0.35 : 0.05);
    add(expandedMaxX + push, cz, rowDx < 0 ? 0.35 : 0.05);
    add(cx, expandedMinZ - push, 0.2);
    add(cx, expandedMaxZ + push, 0.2);
    add(expandedMinX - push, expandedMinZ - push, 0.3);
    add(expandedMinX - push, expandedMaxZ + push, 0.3);
    add(expandedMaxX + push, expandedMinZ - push, 0.3);
    add(expandedMaxX + push, expandedMaxZ + push, 0.3);
  }

  const out = { x: 0, y: 0, z: 0 };
  const scored = [];
  for (const c of candidates) {
    let x = c.x;
    let z = c.z;
    if (navMesh && projectXZToNavMesh(c.x, c.z, roomba.position.y, navMesh, out)) {
      x = out.x;
      z = out.z;
    }
    if (isCircleBlockedXZ(x, z, roomba.position.y, roomba.height, radius, colliders)) continue;
    const d = distSqXZ(roomba.position.x, roomba.position.z, x, z);
    scored.push({ x, z, score: d - c.bias });
  }

  scored.sort((a, b) => a.score - b.score);
  if (scored[0]) return { x: scored[0].x, z: scored[0].z };
  return null;
}

function snapToNavMeshY(roomba, navMesh) {
  if (!navMesh) return;
  const qy = Math.max(roomba.position.y, roomba.dock.y - 0.5);
  findNearestPoly(
    _nearestScratch,
    navMesh,
    [roomba.position.x, qy, roomba.position.z],
    ROOMBA_QUERY_HALF_EXTENTS,
    ROOMBA_NAV_QUERY_FILTER,
  );
  if (!_nearestScratch.success) return;
  const py = _nearestScratch.position[1];
  if (Math.abs(py - roomba.position.y) > ROOMBA_NAV_MAX_Y_DELTA) return;
  const dx = _nearestScratch.position[0] - roomba.position.x;
  const dz = _nearestScratch.position[2] - roomba.position.z;
  const maxSnap = Math.max(3.5, roomba.radius * 1.85);
  if (dx * dx + dz * dz > maxSnap * maxSnap) return;
  roomba.position.y = py;
}

function projectXZToNavMesh(x, z, queryY, navMesh, out) {
  if (!navMesh) return null;
  findNearestPoly(
    _nearestProjScratch,
    navMesh,
    [x, queryY, z],
    ROOMBA_QUERY_HALF_EXTENTS,
    ROOMBA_NAV_QUERY_FILTER,
  );
  if (!_nearestProjScratch.success) return null;
  if (Math.abs(_nearestProjScratch.position[1] - queryY) > ROOMBA_NAV_MAX_Y_DELTA) return null;
  out.x = _nearestProjScratch.position[0];
  out.y = _nearestProjScratch.position[1];
  out.z = _nearestProjScratch.position[2];
  return out;
}

function recordMappedPoly(roomba, navMesh) {
  const map = roomba.map;
  if (!map || !navMesh) return;
  findNearestPoly(
    _nearestScratch,
    navMesh,
    [roomba.position.x, Math.max(roomba.position.y, roomba.dock.y), roomba.position.z],
    ROOMBA_QUERY_HALF_EXTENTS,
    ROOMBA_NAV_QUERY_FILTER,
  );
  if (!_nearestScratch.success) return;
  map.explored.add(_nearestScratch.nodeRef);
}

function ensureMapPolyTotal(roomba, navMesh) {
  const map = roomba.map;
  if (!map || map.polyTotal > 0 || !navMesh) return;
  const { minX, maxX, minZ, maxZ } = LEVEL_WORLD_BOUNDS_XZ;
  box3.set(_navBounds, minX, -4, minZ, maxX, 8, maxZ);
  const refs = queryPolygons(navMesh, _navBounds, ROOMBA_NAV_QUERY_FILTER);
  map.polyTotal = Math.max(refs.length, 1);
}

function shouldRebuildRoombaPath(roomba, dest) {
  if (roomba.navRepathTimer <= 0) return true;
  if (!roomba.navPath?.length) return true;
  if (roomba.navPathIndex >= roomba.navPath.length) return true;
  if (!roomba.navTarget) return true;
  const dx = dest.x - roomba.navTarget.x;
  const dz = dest.z - roomba.navTarget.z;
  return dx * dx + dz * dz >= navRepathDistSq(roomba);
}

function clearRoombaNavPath(roomba) {
  roomba.navRepathTimer = 0;
  roomba.navPath = [];
  roomba.navPathIndex = 0;
  roomba.navTarget = null;
}

function pruneRedundantWaypoints(roomba) {
  const path = roomba.navPath;
  if (!path?.length) return;
  const px = roomba.position.x;
  const pz = roomba.position.z;
  while (roomba.navPathIndex < path.length) {
    const w = path[roomba.navPathIndex];
    if (distSqXZ(px, pz, w.x, w.z) < waypointSkipDistSq(roomba)) {
      roomba.navPathIndex += 1;
      continue;
    }
    break;
  }
}

function rebuildRoombaPath(roomba, dest, navMesh) {
  if (!navMesh) {
    roomba.navPath = [];
    roomba.navPathIndex = 0;
    roomba.navTarget = null;
    return;
  }

  const result = findPath(
    navMesh,
    [roomba.position.x, roomba.position.y, roomba.position.z],
    [dest.x, dest.y, dest.z],
    ROOMBA_QUERY_HALF_EXTENTS,
    ROOMBA_NAV_QUERY_FILTER,
  );

  roomba.navTarget = { x: dest.x, y: dest.y, z: dest.z };
  roomba.navRepathTimer = NAV_REPATH_INTERVAL;

  if (!result.success || !Array.isArray(result.path) || result.path.length === 0) {
    roomba.navPath = [];
    roomba.navPathIndex = 0;
    return;
  }

  roomba.navPath = result.path.map((point) => ({
    x: point.position[0],
    y: point.position[1],
    z: point.position[2],
  }));
  roomba.navPathIndex = roomba.navPath.length > 1 ? 1 : 0;
  pruneRedundantWaypoints(roomba);
  if (roomba.coverage?.mode !== 'nav') {
    skipWaypointsBehind(roomba);
  }
}

/** Drop waypoints we have already passed (behind velocity / row intent). */
function skipWaypointsBehind(roomba) {
  const path = roomba.navPath;
  if (!path?.length || roomba.navPathIndex >= path.length) return;
  const f = forwardXZ(roomba.rotation);
  while (roomba.navPathIndex < path.length - 1) {
    const w = path[roomba.navPathIndex];
    const dx = w.x - roomba.position.x;
    const dz = w.z - roomba.position.z;
    const dot = dx * f.x + dz * f.z;
    const d2 = distSqXZ(roomba.position.x, roomba.position.z, w.x, w.z);
    if (dot < -0.18 && d2 < skipBehindMaxDistSq(roomba)) roomba.navPathIndex += 1;
    else break;
  }
}

function getRoombaNavSteerTarget(roomba, dest, navMesh) {
  if (!navMesh || !dest) return null;
  if (shouldRebuildRoombaPath(roomba, dest)) {
    rebuildRoombaPath(roomba, dest, navMesh);
  }

  while (roomba.navPathIndex < roomba.navPath.length) {
    const waypoint = roomba.navPath[roomba.navPathIndex];
    const d2 = distSqXZ(roomba.position.x, roomba.position.z, waypoint.x, waypoint.z);
    if (d2 <= navWaypointReachSq(roomba)) {
      roomba.navPathIndex += 1;
      continue;
    }
    const next = roomba.navPath[roomba.navPathIndex + 1];
    if (next) {
      const dNext = distSqXZ(roomba.position.x, roomba.position.z, next.x, next.z);
      if (dNext + 0.04 < d2) {
        roomba.navPathIndex += 1;
        continue;
      }
    }
    return waypoint;
  }

  if (!roomba.navPath?.length) return null;
  return dest;
}

function navSteerRoomba(roomba, dest, navMesh, dt, colliders = null) {
  if (!navMesh) return false;
  const steer = getRoombaNavSteerTarget(roomba, dest, navMesh);
  if (!steer) return false;
  const desiredDir = normalizeXZ({
    x: steer.x - roomba.position.x,
    z: steer.z - roomba.position.z,
  });
  if (!desiredDir.x && !desiredDir.z) return false;
  const dir = desiredDir;
  roomba.position.x += dir.x * MOVE_SPEED * dt;
  roomba.position.z += dir.z * MOVE_SPEED * dt;
  const targetAngle = Math.atan2(dir.x, dir.z);
  roomba.rotation += angleDiff(targetAngle, roomba.rotation) * Math.min(1, dt * TURN_SPEED);
  return true;
}

function steerTowardDirect(roomba, tx, tz, dt, colliders = null) {
  const dx = tx - roomba.position.x;
  const dz = tz - roomba.position.z;
  const len = Math.sqrt(dx * dx + dz * dz);
  if (len < 0.06) return;
  const dir = { x: dx / len, z: dz / len };
  const targetAngle = Math.atan2(dir.x, dir.z);
  roomba.rotation += angleDiff(targetAngle, roomba.rotation) * Math.min(1, dt * TURN_SPEED);
  const sp = MOVE_SPEED * dt;
  const step = Math.min(sp, len);
  const f = forwardXZ(roomba.rotation);
  roomba.position.x += f.x * step;
  roomba.position.z += f.z * step;
}

function moveRoombaAxis(roomba, dirX, dirZ, dt) {
  const len = Math.hypot(dirX, dirZ);
  if (len < 0.001) return false;
  const nx = dirX / len;
  const nz = dirZ / len;
  roomba.position.x += nx * MOVE_SPEED * dt;
  roomba.position.z += nz * MOVE_SPEED * dt;
  const targetAngle = Math.atan2(nx, nz);
  roomba.rotation += angleDiff(targetAngle, roomba.rotation) * Math.min(1, dt * TURN_SPEED);
  return true;
}

function steerTowardCardinalTarget(roomba, tx, tz, dt) {
  const dx = tx - roomba.position.x;
  const dz = tz - roomba.position.z;
  if (Math.abs(dx) < LANE_REACH_DIST && Math.abs(dz) < LANE_REACH_DIST) return false;
  if (Math.abs(dz) > Math.abs(dx)) {
    return moveRoombaAxis(roomba, 0, Math.sign(dz), dt);
  }
  return moveRoombaAxis(roomba, Math.sign(dx), 0, dt);
}

function canDirectSteerRoomba(roomba, tx, tz, colliders) {
  const dir = normalizeXZ({ x: tx - roomba.position.x, z: tz - roomba.position.z });
  if (!dir.x && !dir.z) return true;
  const lookahead = Math.max(LOCAL_AVOID_MIN_LOOKAHEAD, roomba.radius * 0.92);
  return !findLocalBlocker(roomba, dir, lookahead, colliders);
}

function expandedColliderXZ(collider, radius) {
  const { min, max } = collider.aabb;
  const pad = radius + ROW_BYPASS_MARGIN;
  return {
    minX: min.x - pad,
    maxX: max.x + pad,
    minZ: min.z - pad,
    maxZ: max.z + pad,
  };
}

function findRowBlocker(roomba, coverage, colliders) {
  if (!colliders?.length || !coverage) return null;
  const rowDx = coverage.alongPositiveX ? 1 : -1;
  const rowZ = coverage.bypass?.targetZ ?? coverage.anchorZ;
  const px = roomba.position.x;
  const look = Math.max(stripeLookahead(roomba) + roomba.radius, roomba.radius * 2.4);
  let best = null;
  let bestAhead = Infinity;

  for (const collider of colliders) {
    if (!colliderBlocksRoombaFloor(roomba, collider)) continue;
    const e = expandedColliderXZ(collider, roomba.radius ?? ROOMBA_RADIUS_XZ);
    if (rowZ < e.minZ || rowZ > e.maxZ) continue;

    const nearX = rowDx > 0 ? e.minX : e.maxX;
    const farX = rowDx > 0 ? e.maxX : e.minX;
    const ahead = (nearX - px) * rowDx;
    const alreadyPast = (px - farX) * rowDx > 0.12;
    if (alreadyPast || ahead < -roomba.radius * 0.55 || ahead > look) continue;
    if (ahead < bestAhead) {
      bestAhead = ahead;
      best = { collider, expanded: e, ahead };
    }
  }

  return best;
}

function corridorIntersectsExpanded(aMin, aMax, bMin, bMax) {
  return Math.max(aMin, bMin) <= Math.min(aMax, bMax);
}

function chooseRowBypassZ(roomba, coverage, expanded, clearX, colliders) {
  const { minZ, maxZ } = LEVEL_WORLD_BOUNDS_XZ;
  const radius = roomba.radius ?? ROOMBA_RADIUS_XZ;
  const rowDx = coverage.alongPositiveX ? 1 : -1;
  const corridorMinX = Math.min(roomba.position.x, clearX) - radius * 0.2;
  const corridorMaxX = Math.max(roomba.position.x, clearX) + radius * 0.2;
  const options = [
    expanded.minZ - radius * 0.22,
    expanded.maxZ + radius * 0.22,
  ].map((z) => Math.max(minZ + coverage.pad, Math.min(maxZ - coverage.pad, z)));

  let bestZ = options[0];
  let bestScore = Infinity;
  for (const z of options) {
    const blockedHere = isCircleBlockedXZ(
      roomba.position.x,
      z,
      roomba.position.y,
      roomba.height,
      radius,
      colliders,
    );
    let corridorPenalty = 0;
    for (const collider of colliders ?? []) {
      if (!colliderBlocksRoombaFloor(roomba, collider)) continue;
      const e = expandedColliderXZ(collider, radius);
      if (z < e.minZ || z > e.maxZ) continue;
      if (!corridorIntersectsExpanded(corridorMinX, corridorMaxX, e.minX, e.maxX)) continue;
      const nearX = rowDx > 0 ? e.minX : e.maxX;
      const ahead = (nearX - roomba.position.x) * rowDx;
      if (ahead > -radius * 0.6) corridorPenalty += 100;
    }
    const score = Math.abs(z - roomba.position.z) + (blockedHere ? 100 : 0) + corridorPenalty;
    if (score < bestScore) {
      bestScore = score;
      bestZ = z;
    }
  }

  if (bestScore >= 80) return null;
  return bestZ;
}

function beginRowBypass(roomba, coverage, blocker, colliders) {
  const rowDx = coverage.alongPositiveX ? 1 : -1;
  const clearX = rowDx > 0
    ? blocker.expanded.maxX + roomba.radius * 0.2
    : blocker.expanded.minX - roomba.radius * 0.2;
  const targetZ = chooseRowBypassZ(roomba, coverage, blocker.expanded, clearX, colliders);
  if (!Number.isFinite(targetZ)) return false;
  coverage.bypass = { targetZ, clearX, rowDx };
  coverage.anchorZ = targetZ;
  coverage.rowStallTime = 0;
  coverage.rowProgress = roomba.position.x * rowDx;
  clearRoombaNavPath(roomba);
  return true;
}

function reverseBlockedRow(roomba, coverage) {
  coverage.alongPositiveX = !coverage.alongPositiveX;
  coverage.bypass = null;
  coverage.rowStallTime = 0;
  coverage.stuckTime = 0;
  coverage.navStallFrames = 0;
  coverage.lastWpDistSq = 1e9;
  coverage.rowProgress = roomba.position.x * (coverage.alongPositiveX ? 1 : -1);
  clearRoombaNavPath(roomba);
}

function applyRowBypassSteer(roomba, coverage, dt, navMesh, colliders, dest) {
  const b = coverage.bypass;
  if (!b) return false;
  const rowDx = coverage.alongPositiveX ? 1 : -1;
  if (b.rowDx !== rowDx) {
    coverage.bypass = null;
    return false;
  }

  const cleared = rowDx > 0
    ? roomba.position.x > b.clearX
    : roomba.position.x < b.clearX;
  if (cleared) {
    coverage.bypass = null;
    coverage.rowStallTime = 0;
    coverage.rowProgress = roomba.position.x * rowDx;
    clearRoombaNavPath(roomba);
    return false;
  }

  const zErr = b.targetZ - roomba.position.z;
  if (Math.abs(zErr) > Math.max(LANE_REACH_DIST, roomba.radius * 0.08)) {
    moveRoombaAxis(roomba, 0, Math.sign(zErr), dt);
    return true;
  }
  roomba.position.z = b.targetZ;
  moveRoombaAxis(roomba, rowDx, 0, dt);
  return true;
}

function pickEscapeTarget(roomba, colliders, navMesh) {
  const c = roomba.coverage;
  const forward = forwardXZ(roomba.rotation);
  const row = c
    ? { x: c.alongPositiveX ? 1 : -1, z: 0 }
    : normalizeXZ(forward);
  if (Math.abs(row.x) + Math.abs(row.z) < 0.001) {
    row.x = forward.x || 1;
    row.z = forward.z || 0;
  }
  const side = { x: -row.z, z: row.x };
  const sp = c?.stripeSpacing ?? DEFAULT_STRIPE_SPACING;
  const { x, z } = roomba.position;
  const y = roomba.position.y;
  const r = roomba.radius;
  const h = roomba.height;
  const out = _pathDestTmp;
  const start = { x: roomba.position.x, y: roomba.position.y, z: roomba.position.z };
  const navStart = { x: 0, y: 0, z: 0 };
  const pathStart = navMesh && projectXZToNavMesh(roomba.position.x, roomba.position.z, roomba.position.y, navMesh, navStart)
    ? navStart
    : start;
  const minDist = Math.max(ESCAPE_MIN_TARGET_DIST, r * 0.42);
  const back = Math.max(0.9, r * 0.58);
  const sideDist = Math.max(sp * 1.15, r * 0.58);
  const nudge = Math.max(0.65, r * 0.36);
  const lane = Math.max(sp * 1.8, r * 1.05);

  const add = (list, along, lateral, bias) => {
    list.push({
      x: x + row.x * along + side.x * lateral,
      z: z + row.z * along + side.z * lateral,
      bias,
    });
  };

  const base = [];
  add(base, 0, sideDist, 1.35);
  add(base, 0, -sideDist, 1.35);
  add(base, -back, 0, 1.15);
  add(base, -back, sideDist, 1.85);
  add(base, -back, -sideDist, 1.85);
  add(base, nudge, 0, 0.35);
  add(base, 0, lane, 1.75);
  add(base, 0, -lane, 1.75);

  const radial = [];
  const rad = Math.max(2.1, r + 0.95);
  for (let i = 0; i < 12; i += 1) {
    const ang = (i / 12) * Math.PI * 2 + (roomba._escapePhase ?? 0) * 0.7;
    radial.push({
      x: x + Math.sin(ang) * rad,
      z: z + Math.cos(ang) * rad,
      bias: 0.9,
    });
  }
  roomba._escapePhase = ((roomba._escapePhase ?? 0) + 1) % 8;

  const candidates = [...base, ...radial];

  const scored = [];
  for (const p of candidates) {
    if (isCircleBlockedXZ(p.x, p.z, y, h, r, colliders)) continue;
    let px = p.x;
    let pz = p.z;
    if (navMesh && projectXZToNavMesh(p.x, p.z, roomba.position.y, navMesh, out)) {
      px = out.x;
      pz = out.z;
      if (isCircleBlockedXZ(px, pz, y, h, r, colliders)) continue;
    }
    const d = distSqXZ(roomba.position.x, roomba.position.z, px, pz);
    if (d < minDist * minDist) continue;
    let plen = 999;
    if (navMesh) {
      const res = findPath(
        navMesh,
        [pathStart.x, pathStart.y, pathStart.z],
        [px, pathStart.y, pz],
        ROOMBA_QUERY_HALF_EXTENTS,
        ROOMBA_NAV_QUERY_FILTER,
      );
      if (!res.success || !res.path?.length) continue;
      plen = res.path.length;
    }
    const score = (p.bias ?? 1)
      + Math.min(3.5, Math.sqrt(d)) * 0.42
      - Math.min(8, plen) * 0.035;
    scored.push({ x: px, z: pz, d, plen, score });
  }

  scored.sort((a, b) => b.score - a.score || b.d - a.d || a.plen - b.plen);
  const best = scored[0];
  return best ? { x: best.x, z: best.z } : null;
}

const WANDER_TTL_MIN = 4.2;
const WANDER_TTL_RANGE = 11;
const WANDER_LOCAL_RADIUS_MIN = 2.1;
const WANDER_LOCAL_RADIUS_EXTRA = 5.2;
const WANDER_MIN_DIST_SQ = 0.42 * 0.42;
const WANDER_PICK_ATTEMPTS = 14;

/**
 * Pick a random reachable point on the navmesh (local bias + occasional long hop).
 * @returns {boolean}
 */
function pickRoombaWanderDest(roomba, navMesh) {
  const c = roomba.coverage;
  if (!navMesh || !c || c.mode !== 'nav') return false;

  const px = roomba.position.x;
  const py = roomba.position.y;
  const pz = roomba.position.z;
  const qy = Math.max(py, roomba.dock.y - 0.2);

  findNearestPoly(
    _nearestScratch,
    navMesh,
    [px, qy, pz],
    ROOMBA_QUERY_HALF_EXTENTS,
    ROOMBA_NAV_QUERY_FILTER,
  );
  if (!_nearestScratch.success) return false;
  const startRef = _nearestScratch.nodeRef;
  _wanderPosScratch[0] = px;
  _wanderPosScratch[1] = qy;
  _wanderPosScratch[2] = pz;

  for (let attempt = 0; attempt < WANDER_PICK_ATTEMPTS; attempt += 1) {
    let r;
    if (Math.random() < 0.74) {
      const rad = WANDER_LOCAL_RADIUS_MIN + Math.random() * WANDER_LOCAL_RADIUS_EXTRA;
      r = findRandomPointAroundCircle(
        navMesh,
        startRef,
        _wanderPosScratch,
        rad,
        ROOMBA_NAV_QUERY_FILTER,
        Math.random,
      );
    } else {
      r = findRandomPoint(navMesh, ROOMBA_NAV_QUERY_FILTER, Math.random);
    }
    if (!r.success) continue;

    const dx = r.position[0] - px;
    const dz = r.position[2] - pz;
    if (dx * dx + dz * dz < WANDER_MIN_DIST_SQ) continue;

    const dest = { x: r.position[0], y: r.position[1], z: r.position[2] };
    const res = findPath(
      navMesh,
      [px, py, pz],
      [dest.x, dest.y, dest.z],
      ROOMBA_QUERY_HALF_EXTENTS,
      ROOMBA_NAV_QUERY_FILTER,
    );
    if (!res.success || !Array.isArray(res.path) || res.path.length === 0) continue;

    c.wanderDest = dest;
    clearRoombaNavPath(roomba);
    roomba.navRepathTimer = 0;
    return true;
  }
  return false;
}

function applyRoombaNavWanderSteer(roomba, dt, navMesh, colliders) {
  const c = roomba.coverage;
  if (!c) return;

  if (c.escapeTime > 0) {
    c.escapeTime -= dt;
    steerTowardCardinalTarget(roomba, c.escapeTx, c.escapeTz, dt);
    return;
  }

  c.wanderTtl -= dt;
  const dest = c.wanderDest;
  const reachSq = navWaypointReachSq(roomba);
  const needPick = !dest
    || c.wanderTtl <= 0
    || distSqXZ(roomba.position.x, roomba.position.z, dest.x, dest.z) <= reachSq;

  if (needPick) {
    if (!pickRoombaWanderDest(roomba, navMesh)) {
      const j = 2.8;
      steerTowardDirect(
        roomba,
        roomba.position.x + (Math.random() - 0.5) * j,
        roomba.position.z + (Math.random() - 0.5) * j,
        dt,
        colliders,
      );
      c.wanderTtl = 1.2 + Math.random() * 1.8;
      return;
    }
    c.wanderTtl = WANDER_TTL_MIN + Math.random() * WANDER_TTL_RANGE;
  }

  const ok = navSteerRoomba(roomba, c.wanderDest, navMesh, dt, colliders);
  if (!ok) {
    c.wanderDest = null;
    clearRoombaNavPath(roomba);
  }
}

/**
 * @param {object} roomba
 * @param {object | null} navMesh
 */
function initRoombaCoverage(roomba, navMesh) {
  const { minX, maxX, minZ, maxZ } = LEVEL_WORLD_BOUNDS_XZ;
  const pad = roomba.radius + 0.3;
  const sp = DEFAULT_STRIPE_SPACING;
  const zSpan = maxZ - minZ - 2 * pad;
  const stripeMax = Math.max(0, Math.floor(zSpan / sp));

  let stripeIndex = Math.round((roomba.position.z - minZ - pad) / sp);
  stripeIndex = Math.max(0, Math.min(stripeMax, stripeIndex));

  let anchorZ = minZ + pad + stripeIndex * sp;
  anchorZ = Math.min(maxZ - pad, Math.max(minZ + pad, anchorZ));

  const midX = (minX + maxX) * 0.5;
  const alongPositiveX = roomba.position.x < midX;
  const mode = navMesh ? 'nav' : 'stripe';

  roomba.coverage = {
    mode,
    wanderDest: null,
    wanderTtl: 0,
    stripeSpacing: sp,
    stripeMax,
    pad,
    stripeIndex,
    anchorZ,
    alongPositiveX,
    stuckTime: 0,
    escapeTime: 0,
    escapeTx: 0,
    escapeTz: 0,
    navStallFrames: 0,
    lastWpDistSq: 1e9,
    rowProgress: roomba.position.x * (alongPositiveX ? 1 : -1),
    rowStallTime: 0,
    escapeStallTime: 0,
    bypass: null,
  };

  roomba.map = {
    explored: new Set(),
    polyTotal: 0,
  };
  roomba.navPath = [];
  roomba.navPathIndex = 0;
  roomba.navTarget = null;
  roomba.navRepathTimer = 0;
}

function applyRoombaCoverageSteer(roomba, dt, navMesh, colliders) {
  const c = roomba.coverage;
  if (!c) return;

  if (c.mode === 'nav' && navMesh) {
    applyRoombaNavWanderSteer(roomba, dt, navMesh, colliders);
    return;
  }

  const { minX, maxX, minZ, maxZ } = LEVEL_WORLD_BOUNDS_XZ;
  const pad = c.pad;

  const dest = { x: 0, y: roomba.dock.y, z: 0 };

  if (c.escapeTime > 0) {
    c.escapeTime -= dt;
    steerTowardCardinalTarget(roomba, c.escapeTx, c.escapeTz, dt);
    return;
  }

  const rowBlocker = findRowBlocker(roomba, c, colliders);
  if (rowBlocker && !c.bypass) {
    if (!beginRowBypass(roomba, c, rowBlocker, colliders)) {
      reverseBlockedRow(roomba, c);
    }
  }
  if (applyRowBypassSteer(roomba, c, dt, navMesh, colliders, dest)) return;

  const rowDx = c.alongPositiveX ? 1 : -1;
  const dzErr = c.anchorZ - roomba.position.z;
  if (Math.abs(dzErr) > Math.max(LANE_REACH_DIST, roomba.radius * 0.08)) {
    moveRoombaAxis(roomba, 0, Math.sign(dzErr), dt);
    return;
  }
  roomba.position.z = c.anchorZ;
  moveRoombaAxis(roomba, rowDx, 0, dt);
}

function applyRoombaCoveragePost(roomba, dt, colliders, navMesh, tickStartX, tickStartZ) {
  const c = roomba.coverage;
  if (!c) return;

  const moved = distXZ(roomba.position.x, roomba.position.z, tickStartX, tickStartZ);
  if (c.escapeTime > 0) {
    const blocked = isCircleBlockedXZ(
      roomba.position.x,
      roomba.position.z,
      roomba.position.y,
      roomba.height,
      roomba.radius,
      colliders,
    );
    if (blocked || moved < stuckMoveThreshold(roomba)) {
      c.escapeStallTime = (c.escapeStallTime ?? 0) + dt;
    } else {
      c.escapeStallTime = Math.max(0, (c.escapeStallTime ?? 0) - dt * 2);
    }

    if ((c.escapeStallTime ?? 0) > ESCAPE_STALL_TRIGGER && restoreRoombaSafePosition(roomba)) {
      clearRoombaNavPath(roomba);
      c.escapeTime = 0;
      c.escapeStallTime = 0;
      c.stuckTime = 0;
      c.rowStallTime = 0;
      roomba.localAvoidTime = 0;
      if (c.mode === 'nav') {
        c.wanderDest = null;
        c.wanderTtl = 0;
      } else {
        c.alongPositiveX = !c.alongPositiveX;
        c.bypass = null;
        c.rowProgress = roomba.position.x * (c.alongPositiveX ? 1 : -1);
      }
      return;
    }
  } else {
    c.escapeStallTime = 0;
  }

  if (c.mode === 'nav') {
    if (c.escapeTime > 0) return;

    if (moved < stuckMoveThreshold(roomba)) c.stuckTime += dt;
    else c.stuckTime *= 0.85;

    if (roomba.navPath?.length && roomba.navPathIndex < roomba.navPath.length) {
      const w = roomba.navPath[roomba.navPathIndex];
      const d2 = distSqXZ(roomba.position.x, roomba.position.z, w.x, w.z);
      if (d2 >= c.lastWpDistSq - 0.0004) c.navStallFrames += 1;
      else c.navStallFrames = 0;
      c.lastWpDistSq = d2;
      if (c.navStallFrames >= NAV_STALL_FRAMES) {
        c.navStallFrames = 0;
        c.lastWpDistSq = 1e9;
        c.wanderDest = null;
        c.wanderTtl = 0;
        if (roomba.navPathIndex < roomba.navPath.length - 1) {
          roomba.navPathIndex += 1;
        } else {
          clearRoombaNavPath(roomba);
        }
        roomba.navRepathTimer = 0;
        c.stuckTime = Math.max(c.stuckTime, STUCK_TIME_TRIGGER * 0.5);
      }
    } else {
      c.navStallFrames = 0;
      c.lastWpDistSq = 1e9;
    }

    if (c.stuckTime > STUCK_TIME_TRIGGER) {
      c.stuckTime = 0;
      clearRoombaNavPath(roomba);
      c.navStallFrames = 0;
      c.lastWpDistSq = 1e9;
      c.wanderDest = null;
      c.wanderTtl = 0;
      const esc = pickEscapeTarget(roomba, colliders, navMesh)
        ?? pickOverlapEscapeTarget(roomba, colliders, navMesh);
      if (esc) {
        c.escapeTx = esc.x;
        c.escapeTz = esc.z;
        c.escapeTime = ESCAPE_DURATION;
        c.escapeStallTime = 0;
      } else {
        pickRoombaWanderDest(roomba, navMesh);
      }
    }
    return;
  }

  if (c.escapeTime <= 0 && c.bypass) {
    if (moved < stuckMoveThreshold(roomba)) c.stuckTime += dt;
    else c.stuckTime = Math.max(0, c.stuckTime - dt * 2.2);
    c.rowStallTime = 0;
    c.navStallFrames = 0;
    c.lastWpDistSq = 1e9;
    c.rowProgress = roomba.position.x * (c.alongPositiveX ? 1 : -1);
    if (c.stuckTime <= STUCK_TIME_TRIGGER) return;
  }

  if (c.escapeTime <= 0) {
    if (moved < stuckMoveThreshold(roomba)) c.stuckTime += dt;
    else c.stuckTime *= 0.88;

    const rowDx = c.alongPositiveX ? 1 : -1;
    const rowProgress = roomba.position.x * rowDx;
    if (!Number.isFinite(c.rowProgress)) c.rowProgress = rowProgress;
    if (rowProgress > c.rowProgress + ROW_PROGRESS_EPS) {
      c.rowProgress = rowProgress;
      c.rowStallTime = Math.max(0, (c.rowStallTime ?? 0) - dt * 2.4);
    } else {
      c.rowStallTime = (c.rowStallTime ?? 0) + dt;
    }
  } else {
    c.stuckTime = 0;
    c.rowStallTime = 0;
    c.rowProgress = roomba.position.x * (c.alongPositiveX ? 1 : -1);
  }

  if (c.escapeTime <= 0 && roomba.navPath?.length && roomba.navPathIndex < roomba.navPath.length) {
    const w = roomba.navPath[roomba.navPathIndex];
    const d2 = distSqXZ(roomba.position.x, roomba.position.z, w.x, w.z);
    if (d2 >= c.lastWpDistSq - 0.0004) c.navStallFrames += 1;
    else {
      c.navStallFrames = 0;
      c.rowStallTime = Math.max(0, (c.rowStallTime ?? 0) - dt * 2.4);
    }
    c.lastWpDistSq = d2;
    if (c.navStallFrames >= NAV_STALL_FRAMES) {
      c.navStallFrames = 0;
      c.lastWpDistSq = 1e9;
      if (roomba.navPathIndex < roomba.navPath.length - 1) {
        roomba.navPathIndex += 1;
      } else {
        clearRoombaNavPath(roomba);
      }
      roomba.navRepathTimer = 0;
      c.stuckTime = Math.max(c.stuckTime, STUCK_TIME_TRIGGER * 0.7);
      skipWaypointsBehind(roomba);
    }
  } else {
    c.navStallFrames = 0;
    c.lastWpDistSq = 1e9;
  }

  const navLooksStalled = !roomba.navPath?.length || c.navStallFrames > 0;
  if (
    c.escapeTime <= 0
    && (c.rowStallTime ?? 0) > ROW_PROGRESS_STALL_TRIGGER
    && navLooksStalled
  ) {
    c.stuckTime = STUCK_TIME_TRIGGER + dt;
  }

  if (c.escapeTime <= 0 && c.stuckTime > STUCK_TIME_TRIGGER) {
    c.stuckTime = 0;
    clearRoombaNavPath(roomba);
    c.navStallFrames = 0;
    c.lastWpDistSq = 1e9;
    const esc = pickEscapeTarget(roomba, colliders, navMesh)
      ?? pickOverlapEscapeTarget(roomba, colliders, navMesh);
    if (esc) {
      c.escapeTx = esc.x;
      c.escapeTz = esc.z;
      c.escapeTime = ESCAPE_DURATION;
      c.escapeStallTime = 0;
      c.rowStallTime = 0;
      c.rowProgress = roomba.position.x * (c.alongPositiveX ? 1 : -1);
    } else {
      c.alongPositiveX = !c.alongPositiveX;
      c.bypass = null;
      c.rowStallTime = 0;
      c.rowProgress = roomba.position.x * (c.alongPositiveX ? 1 : -1);
      clearRoombaNavPath(roomba);
    }
  }

  const { minX, maxX, minZ, maxZ } = LEVEL_WORLD_BOUNDS_XZ;
  const pad = c.pad;
  const sp = c.stripeSpacing;

  if (c.escapeTime > 0) return;

  const atEast = roomba.position.x >= maxX - pad - ROW_END_EPS;
  const atWest = roomba.position.x <= minX + pad + ROW_END_EPS;
  const onRow = Math.abs(c.anchorZ - roomba.position.z)
    < Math.max(c.stripeSpacing * 0.6, roomba.radius * 0.52);

  if (c.alongPositiveX && atEast && onRow) {
    c.stripeIndex += 1;
    if (c.stripeIndex > c.stripeMax) c.stripeIndex = 0;
    c.anchorZ = minZ + pad + c.stripeIndex * sp;
    c.anchorZ = Math.min(maxZ - pad, c.anchorZ);
    c.alongPositiveX = false;
    c.bypass = null;
    c.rowStallTime = 0;
    c.rowProgress = roomba.position.x * -1;
    roomba.navRepathTimer = 0;
  } else if (!c.alongPositiveX && atWest && onRow) {
    c.stripeIndex += 1;
    if (c.stripeIndex > c.stripeMax) c.stripeIndex = 0;
    c.anchorZ = minZ + pad + c.stripeIndex * sp;
    c.anchorZ = Math.min(maxZ - pad, c.anchorZ);
    c.alongPositiveX = true;
    c.bypass = null;
    c.rowStallTime = 0;
    c.rowProgress = roomba.position.x;
    roomba.navRepathTimer = 0;
  }
}

/**
 * @param {object} opts
 * @param {string} [opts.id]
 * @param {number} opts.dockX
 * @param {number} opts.dockY
 * @param {number} opts.dockZ
 */
export function createRoombaState(opts) {
  const dockX = opts.dockX ?? 20;
  const dockY = opts.dockY ?? 0;
  const dockZ = opts.dockZ ?? 20;
  return {
    id: opts.id ?? 'roomba-0',
    type: 'roomba',
    alive: true,
    position: { x: dockX, y: dockY, z: dockZ },
    velocity: { x: 0, y: 0, z: 0 },
    rotation: Math.PI * 0.25,
    grounded: true,
    radius: ROOMBA_RADIUS_XZ,
    height: ROOMBA_BODY_HEIGHT,
    dock: { x: dockX, y: dockY, z: dockZ },
    phase: ROOMBA_PHASE.CHARGING,
    phaseTimer: CHARGE_SECONDS * (0.85 + Math.random() * 0.25),
    vacuumTimer: 0,
    gravity: GRAVITY,
    coverage: null,
    map: null,
    navPath: [],
    navPathIndex: 0,
    navTarget: null,
    navRepathTimer: 0,
    localAvoidSide: 1,
    localAvoidTime: 0,
    bumperCooldown: 0,
    returnStall: 0,
    returnEscapeTime: 0,
    returnEscapeTx: dockX,
    returnEscapeTz: dockZ,
    returnLastHomeDist: Infinity,
    lastSafeX: dockX,
    lastSafeY: dockY,
    lastSafeZ: dockZ,
  };
}

/**
 * Acceleration toward the roomba while it is vacuuming (for `simulateTick`); stronger when closer.
 * @param {{ position: {x:number,y:number,z:number}, phase?: string, ai?: string, alive?: boolean }} roomba
 * @param {{ position: {x:number,y:number,z:number}, alive?: boolean, roombaLaunch?: object, roombaLaunchCooldown?: number }} player
 * @returns {{ ax: number, az: number, ay: number } | null}
 */
export function getRoombaVacuumPullAcceleration(roomba, player) {
  if (!roomba || !player?.alive) return null;
  const phase = roomba.phase ?? roomba.ai;
  if (phase !== ROOMBA_PHASE.VACUUMING && phase !== 'vacuuming') return null;
  if (roomba.alive === false) return null;
  if (player.roombaLaunch?.phase === 'suck' || player.roombaLaunch?.phase === 'flight') return null;
  if ((player.roombaLaunchCooldown ?? 0) > 0) return null;

  const rbx = roomba.position?.x;
  const rby = roomba.position?.y;
  const rbz = roomba.position?.z;
  if (!Number.isFinite(rbx) || !Number.isFinite(rby) || !Number.isFinite(rbz)) return null;

  const px = player.position.x;
  const py = player.position.y;
  const pz = player.position.z;
  const dx = rbx - px;
  const dz = rbz - pz;
  const flat = Math.hypot(dx, dz);
  if (flat < VACUUM_PULL_MIN_DIST || flat > VACUUM_PULL_MAX_DIST) return null;

  const playerH = PHYSICS.playerHeight ?? 0.55;
  if (Math.abs(py - rby) > playerH + 0.52) return null;

  const nx = dx / flat;
  const nz = dz / flat;
  const u = 1 - flat / VACUUM_PULL_MAX_DIST;
  const strength = u * u * u;

  return {
    ax: nx * VACUUM_PULL_ACCEL_MAX * strength,
    az: nz * VACUUM_PULL_ACCEL_MAX * strength,
    ay: VACUUM_PULL_UP_ACCEL * strength,
  };
}

/**
 * Within radius on any side → suck toward center under the puck → launch opposite entry (cannon-es on server).
 * @param {{ startFlight: (id: string, s: object, ox: number, oz: number) => void }} mouseLaunchWorld
 */
function applyRoombaMouseVacuum(roomba, players, dt, mouseLaunchWorld) {
  if (!mouseLaunchWorld || roomba.phase !== ROOMBA_PHASE.VACUUMING) return;
  const rbx = roomba.position.x;
  const rbz = roomba.position.z;
  const playerH = PHYSICS.playerHeight ?? 0.55;
  const t = Math.min(0.05, Math.max(0, dt));

  for (const p of iterPlayerStates(players)) {
    if (!p?.alive || !p.position || !p.id) continue;

    if (p.roombaLaunch?.phase === 'flight') continue;
    if ((p.roombaLaunchCooldown ?? 0) > 0) continue;

    const px = p.position.x;
    const pz = p.position.z;
    const py = p.position.y;
    const flat = Math.sqrt((px - rbx) * (px - rbx) + (pz - rbz) * (pz - rbz));
    if (flat < 0.04 || flat > MOUSE_CAPTURE_MAX_DIST) continue;
    if (Math.abs(py - roomba.position.y) > playerH + 0.32) continue;

    // Eject straight out the rear of the roomba via the cannon-es launch
    // world — no teleport, no lerp. The impulse magnitude + gravity handle
    // the full arc, and wall collisions bounce naturally.
    const f = forwardXZ(roomba.rotation);
    mouseLaunchWorld.startFlight(p.id, p, -f.x, -f.z);
    p.roombaLaunch = { phase: 'flight' };
    p.grounded = false;
  }
}

function bumpCatsAway(roomba, cats, dt) {
  const rbx = roomba.position.x;
  const rbz = roomba.position.z;
  const t = Math.min(0.05, Math.max(0, dt));
  for (const cat of cats) {
    if (!cat?.alive || !cat.position || !cat.velocity) continue;
    const d = distXZ(cat.position.x, cat.position.z, rbx, rbz);
    if (d >= CAT_BUMP_DIST || d < 0.001) continue;
    const nx = (cat.position.x - rbx) / d;
    const nz = (cat.position.z - rbz) / d;
    const falloff = 1 - d / CAT_BUMP_DIST;
    cat.velocity.x += nx * CAT_BUMP_IMPULSE * falloff * t;
    cat.velocity.z += nz * CAT_BUMP_IMPULSE * falloff * t;
  }
}

/**
 * @param {object} roomba
 * @param {Map<string, object> | Record<string, object>} players
 * @param {object[]} catPredators
 * @param {number} dt
 * @param {object[]|null} colliders
 * @param {object | null} [navMesh] roomba-wide kitchen navmesh (navcat); not the cat mesh
 * @param {{ solve: (r: object, dt: number) => void } | null} [roombaCannon] server cannon-es XZ solver (walls)
 * @param {{ startFlight: (id: string, s: object, ox: number, oz: number) => void } | null} [mouseLaunchWorld] mouse flight physics
 */
export function simulateRoombaTick(roomba, players, catPredators, dt, colliders, navMesh = null, roombaCannon = null, mouseLaunchWorld = null) {
  if (!roomba?.alive || roomba.type !== 'roomba') return;

  const tickStartX = roomba.position.x;
  const tickStartZ = roomba.position.z;

  const prev = {
    x: roomba.position.x,
    y: roomba.position.y,
    z: roomba.position.z,
  };

  let postAiX = prev.x;
  let postAiZ = prev.z;

  roomba.phaseTimer -= dt;
  if (roomba.navRepathTimer > 0) roomba.navRepathTimer = Math.max(0, roomba.navRepathTimer - dt);
  if (roomba.phase !== ROOMBA_PHASE.CHARGING && (roomba.bumperCooldown ?? 0) > 0) {
    roomba.bumperCooldown = Math.max(0, roomba.bumperCooldown - dt);
  }
  if (roomba.phase !== ROOMBA_PHASE.CHARGING) {
    updateRoombaSafePosition(roomba, colliders);
  }

  switch (roomba.phase) {
    case ROOMBA_PHASE.CHARGING: {
      roomba.velocity.x = 0;
      roomba.velocity.z = 0;
      roomba.position.x = roomba.dock.x;
      roomba.position.z = roomba.dock.z;
      roomba.position.y = roomba.dock.y;
      roomba.grounded = true;
      roomba.velocity.y = 0;
      roomba.coverage = null;
      roomba.map = null;
      roomba.navPath = [];
      roomba.navPathIndex = 0;
      roomba.navTarget = null;
      roomba.navRepathTimer = 0;
      roomba.localAvoidTime = 0;
      roomba.returnStall = 0;
      roomba.returnEscapeTime = 0;
      roomba.returnLastHomeDist = Infinity;
      roomba.lastSafeX = roomba.dock.x;
      roomba.lastSafeY = roomba.dock.y;
      roomba.lastSafeZ = roomba.dock.z;
      roomba.bumperCooldown = 0;
      if (roomba.phaseTimer <= 0) {
        roomba.phase = ROOMBA_PHASE.DEPLOYING;
        roomba.phaseTimer = DEPLOY_SECONDS;
        const f = forwardXZ(roomba.rotation);
        roomba.position.x = roomba.dock.x + f.x * 0.15;
        roomba.position.z = roomba.dock.z + f.z * 0.15;
      }
      break;
    }
    case ROOMBA_PHASE.DEPLOYING: {
      const f = forwardXZ(roomba.rotation);
      const step = MOVE_SPEED * 1.1 * dt;
      roomba.position.x += f.x * step;
      roomba.position.z += f.z * step;
      if (roomba.phaseTimer <= 0) {
        roomba.phase = ROOMBA_PHASE.VACUUMING;
        roomba.vacuumTimer = VACUUM_SECONDS;
        initRoombaCoverage(roomba, navMesh);
        ensureMapPolyTotal(roomba, navMesh);
      }
      break;
    }
    case ROOMBA_PHASE.VACUUMING: {
      roomba.vacuumTimer -= dt;
      ensureMapPolyTotal(roomba, navMesh);
      recordMappedPoly(roomba, navMesh);
      applyRoombaCoverageSteer(roomba, dt, navMesh, colliders);
      if (roomba.vacuumTimer <= 0) {
        roomba.phase = ROOMBA_PHASE.RETURNING;
        roomba.phaseTimer = 999;
        roomba.coverage = null;
        roomba.map = null;
        roomba.navRepathTimer = 0;
        roomba.navPath = [];
        roomba.navPathIndex = 0;
        roomba.navTarget = null;
        roomba.localAvoidTime = 0;
        roomba.returnStall = 0;
        roomba.returnEscapeTime = 0;
        roomba.returnLastHomeDist = Infinity;
      }
      break;
    }
    case ROOMBA_PHASE.RETURNING: {
      const navGoal = { x: 0, y: 0, z: 0 };
      const steerTo = (tx, tz, fallbackY) => {
        const onNav = projectXZToNavMesh(tx, tz, roomba.position.y, navMesh, navGoal);
        const goal = onNav ? navGoal : { x: tx, y: fallbackY, z: tz };
        if (navMesh && onNav) {
          if (!navSteerRoomba(roomba, goal, navMesh, dt, colliders)) {
            steerTowardDirect(roomba, tx, tz, dt, colliders);
          }
        } else {
          steerTowardDirect(roomba, tx, tz, dt, colliders);
        }
      };

      if (roomba.returnEscapeTime > 0) {
        roomba.returnEscapeTime = Math.max(0, roomba.returnEscapeTime - dt);
        const tx = roomba.returnEscapeTx ?? roomba.position.x;
        const tz = roomba.returnEscapeTz ?? roomba.position.z;
        steerTo(tx, tz, roomba.position.y);
        const doneDist = Math.max(0.32, roomba.radius * 0.25);
        if (
          roomba.returnEscapeTime <= 0
          || distSqXZ(roomba.position.x, roomba.position.z, tx, tz) <= doneDist * doneDist
        ) {
          roomba.returnEscapeTime = 0;
          clearRoombaNavPath(roomba);
        }
      } else {
        steerTo(roomba.dock.x, roomba.dock.z, roomba.dock.y);
      }

      const home = distXZ(roomba.position.x, roomba.position.z, roomba.dock.x, roomba.dock.z);
      const dockSnap = Math.max(DOCK_SNAP_DIST, roomba.radius * 0.55);
      if (home < dockSnap) {
        roomba.phase = ROOMBA_PHASE.CHARGING;
        roomba.phaseTimer = CHARGE_SECONDS * (0.85 + Math.random() * 0.25);
        roomba.position.x = roomba.dock.x;
        roomba.position.y = roomba.dock.y;
        roomba.position.z = roomba.dock.z;
        roomba.velocity.x = 0;
        roomba.velocity.y = 0;
        roomba.velocity.z = 0;
        roomba.grounded = true;
        roomba.navPath = [];
        roomba.navPathIndex = 0;
        roomba.navTarget = null;
        roomba.localAvoidTime = 0;
        roomba.returnStall = 0;
        roomba.returnEscapeTime = 0;
        roomba.returnLastHomeDist = Infinity;
      }
      break;
    }
    default:
      roomba.phase = ROOMBA_PHASE.CHARGING;
      roomba.phaseTimer = 2;
  }

  postAiX = roomba.position.x;
  postAiZ = roomba.position.z;

  if (roomba.phase !== ROOMBA_PHASE.CHARGING) {
    if (!roomba.grounded) {
      roomba.velocity.y += roomba.gravity * dt;
    }
    roomba.position.y += roomba.velocity.y * dt;
    const floorY = roomba.dock.y;
    if (roomba.position.y <= floorY + 0.06 && roomba.velocity.y <= 0) {
      roomba.position.y = floorY;
      roomba.velocity.y = 0;
      roomba.grounded = true;
    }
  }

  if (navMesh && roomba.phase !== ROOMBA_PHASE.CHARGING) {
    snapToNavMeshY(roomba, navMesh);
  }

  if (roombaCannon) {
    roombaCannon.solve(roomba, dt);
    resolveRoombaHardOverlaps(roomba, colliders);
    if (navMesh && roomba.phase !== ROOMBA_PHASE.CHARGING) {
      snapToNavMeshY(roomba, navMesh);
    }
  } else {
    clampToBounds(roomba.position, roomba.radius);
    resolveRoombaCollisions(roomba, colliders, prev);
    resolveRoombaHardOverlaps(roomba, colliders);
  }

  if (
    roomba.phase === ROOMBA_PHASE.VACUUMING
    || roomba.phase === ROOMBA_PHASE.RETURNING
    || roomba.phase === ROOMBA_PHASE.DEPLOYING
  ) {
    const deployBoost = roomba.phase === ROOMBA_PHASE.DEPLOYING ? 1.14 : 1;
    const nominalStep = MOVE_SPEED * dt * deployBoost;
    const intendedXZ = distXZ(postAiX, postAiZ, prev.x, prev.z);
    const actualXZ = distXZ(roomba.position.x, roomba.position.z, prev.x, prev.z);
    const hitWallWhileDriving =
      intendedXZ > nominalStep * BUMP_INTENDED_MIN_FRAC
      && actualXZ < intendedXZ * BUMP_ACTUAL_MAX_FRAC;
    if (hitWallWhileDriving) {
      const cd = roomba.bumperCooldown ?? 0;
      if (cd <= 0) {
        applyBumperWallReaction(roomba, roomba.phase);
        roomba.bumperCooldown = BUMP_COOLDOWN;
      } else if (!roombaCannon) {
        const mid = { x: roomba.position.x, y: roomba.position.y, z: roomba.position.z };
        const f = forwardXZ(roomba.rotation);
        const sign = ((roomba._wedgeNudge ?? 0) & 1) === 0 ? 1 : -1;
        roomba._wedgeNudge = (roomba._wedgeNudge ?? 0) + 1;
        roomba.position.x += -f.z * 0.07 * sign;
        roomba.position.z += f.x * 0.07 * sign;
        clampToBounds(roomba.position, roomba.radius);
        resolveRoombaCollisions(roomba, colliders, mid);
        resolveRoombaHardOverlaps(roomba, colliders);
      }
    }
  }

  clampToBounds(roomba.position, roomba.radius);
  if (roomba.phase !== ROOMBA_PHASE.CHARGING) {
    updateRoombaSafePosition(roomba, colliders);
  }
  if (roomba.phase === ROOMBA_PHASE.VACUUMING) {
    applyRoombaMouseVacuum(roomba, players, dt, mouseLaunchWorld);
  }
  bumpCatsAway(roomba, catPredators, dt);

  if (roomba.phase === ROOMBA_PHASE.VACUUMING) {
    applyRoombaCoveragePost(roomba, dt, colliders, navMesh, tickStartX, tickStartZ);
  }

  if (roomba.phase === ROOMBA_PHASE.RETURNING) {
    const movedHome = distXZ(roomba.position.x, roomba.position.z, tickStartX, tickStartZ);
    const homeDist = distXZ(roomba.position.x, roomba.position.z, roomba.dock.x, roomba.dock.z);
    const wasHomeDist = roomba.returnLastHomeDist;
    const escaping = roomba.returnEscapeTime > 0;
    const noProgress = !escaping
      && Number.isFinite(wasHomeDist)
      && homeDist >= wasHomeDist - RETURN_PROGRESS_EPS;
    roomba.returnLastHomeDist = homeDist;

    if (movedHome < stuckMoveThreshold(roomba) || noProgress) {
      roomba.returnStall = (roomba.returnStall ?? 0) + dt;
      if (roomba.returnStall > RETURN_STALL_TRIGGER) {
        roomba.returnStall = 0;
        clearRoombaNavPath(roomba);
        const esc = pickEscapeTarget(roomba, colliders, navMesh)
          ?? pickOverlapEscapeTarget(roomba, colliders, navMesh);
        if (esc) {
          roomba.returnEscapeTx = esc.x;
          roomba.returnEscapeTz = esc.z;
          roomba.returnEscapeTime = RETURN_ESCAPE_DURATION;
        } else {
          roomba.returnEscapeTime = 0;
          roomba.rotation += Math.PI * 0.55;
        }
      }
    } else {
      roomba.returnStall = 0;
    }
  } else {
    roomba.returnStall = 0;
    roomba.returnEscapeTime = 0;
    roomba.returnLastHomeDist = Infinity;
  }
}

export function serializeRoombaState(r) {
  const explored = r.map?.explored?.size ?? 0;
  const total = r.map?.polyTotal ?? 0;
  const mp = total > 0 ? Math.min(100, Math.round((explored / total) * 100)) : 0;
  return {
    id: r.id,
    type: 'roomba',
    px: +r.position.x.toFixed(2),
    py: +r.position.y.toFixed(2),
    pz: +r.position.z.toFixed(2),
    ry: +r.rotation.toFixed(3),
    ai: r.phase,
    alive: r.alive !== false,
    hp: 1,
    maxHp: 1,
    dx: +r.dock.x.toFixed(2),
    dy: +r.dock.y.toFixed(2),
    dz: +r.dock.z.toFixed(2),
    mp,
    mc: explored,
    mt: total,
  };
}
