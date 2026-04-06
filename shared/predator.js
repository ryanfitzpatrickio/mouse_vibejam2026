/**
 * Shared predator AI state and simulation.
 * Used by both server (authority) and client (interpolation).
 * Keep this file free of Three.js / DOM / Node dependencies.
 */

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
  gravity: -20,
});

export function createPredatorState(config) {
  return {
    id: config.id ?? 'cat-0',
    type: config.type ?? 'cat',
    position: { x: config.spawnX ?? 0, y: 0, z: config.spawnZ ?? 0 },
    velocity: { x: 0, y: 0, z: 0 },
    rotation: 0,
    grounded: true,
    health: config.maxHealth ?? CAT_CONFIG.maxHealth,
    maxHealth: config.maxHealth ?? CAT_CONFIG.maxHealth,
    alive: true,
    aiState: PREDATOR_AI.IDLE,
    aiTimer: 1 + Math.random() * 2,

    spawnPoint: { x: config.spawnX ?? 0, y: 0, z: config.spawnZ ?? 0 },
    patrolTarget: { x: config.spawnX ?? 0, y: 0, z: config.spawnZ ?? 0 },
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
    gravity: config.gravity ?? CAT_CONFIG.gravity,
  };
}

function distXZ(a, b) {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dz * dz);
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

function resolvePredatorCollisions(state, colliders) {
  if (!colliders) return;
  const px = state.position.x;
  const pz = state.position.z;
  const r = state.radius;

  for (const collider of colliders) {
    if (collider.type === 'surface' || collider.type === 'loot') continue;
    const { min, max } = collider.aabb;
    if (state.position.y > max.y || state.position.y + 2 < min.y) continue;

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

export function simulatePredatorTick(state, players, dt, colliders) {
  if (!state.alive) return null;

  state.aiTimer -= dt;

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
      if (nearestPlayer) facePosition(state, nearestPlayer.position, dt);
      if (state.aiTimer <= 0) {
        state.aiState = PREDATOR_AI.ROAR;
        state.aiTimer = state.roarDuration;
      }
      break;

    case PREDATOR_AI.ROAR:
      if (nearestPlayer) facePosition(state, nearestPlayer.position, dt);
      if (state.aiTimer <= 0) {
        state.aiState = PREDATOR_AI.CHASE;
      }
      break;

    case PREDATOR_AI.CHASE: {
      if (!nearestPlayer || (distToSpawn > state.leashRange && nearestDist > state.aggroRange)) {
        state.aiState = PREDATOR_AI.PATROL;
        state.patrolTarget.x = state.spawnPoint.x;
        state.patrolTarget.z = state.spawnPoint.z;
        break;
      }
      if (nearestDist < state.attackRange && nearestPlayer) {
        state.aiState = PREDATOR_AI.ATTACK;
        state.aiTimer = state.attackWindup;
        state.attackHitPending = true;
        break;
      }
      if (nearestDist > state.leashRange * 1.5) {
        state.aiState = PREDATOR_AI.PATROL;
        state.patrolTarget.x = state.spawnPoint.x;
        state.patrolTarget.z = state.spawnPoint.z;
        break;
      }
      const dir = normalizeXZ({
        x: nearestPlayer.position.x - state.position.x,
        z: nearestPlayer.position.z - state.position.z,
      });
      moveToward(state, dir, state.chaseSpeed, dt);
      faceDirection(state, dir, dt);
      break;
    }

    case PREDATOR_AI.ATTACK: {
      let hitResult = null;
      if (state.attackHitPending && state.aiTimer <= state.attackHitTime && nearestPlayer && nearestDist < state.attackRange * 1.5) {
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
      if (state.aiTimer <= 0) {
        if (nearestDist < state.attackRange && nearestPlayer) {
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
      if (state.aiTimer <= 0) {
        state.aiState = PREDATOR_AI.CHASE;
      }
      break;

    case PREDATOR_AI.DEATH:
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

  resolvePredatorCollisions(state, colliders);

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
