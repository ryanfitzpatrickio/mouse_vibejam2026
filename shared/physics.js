/**
 * Shared physics constants and simulation logic.
 * Used by both client (prediction) and server (authority).
 * Keep this file free of Three.js / DOM / Node dependencies.
 */

export const PHYSICS = Object.freeze({
  walkSpeed: 4.0,
  sprintSpeed: 7.5,
  crouchSpeed: 2.0,
  slideSpeed: 9.0,
  slideDuration: 0.6,
  slideCooldown: 1.0,
  jumpForce: 6.0,
  doubleJumpForce: 5.1,
  gravity: -20.0,
  groundOffset: 0.35,
  playerHeightOffset: -0.035,
  playerRadius: 0.22,
  playerHeight: 0.78,
  groundSnapDistance: 0.18,
  turnSmooth: 12,

  maxStamina: 100,
  staminaDrainRate: 30,
  staminaRegenRate: 15,
  staminaRegenDelay: 1.0,

  maxHealth: 2,

  bumpForce: 3.0,
  carrySpeedMult: 0.6,
  heavyCarrySpeedMult: 0.35,
});

/**
 * Create a fresh player physics state.
 */
export function createPlayerState(id) {
  return {
    id,
    position: { x: 0, y: 0, z: 0 },
    velocity: { x: 0, y: 0, z: 0 },
    rotation: 0,
    grounded: true,
    stamina: PHYSICS.maxStamina,
    staminaRegenTimer: 0,
    health: PHYSICS.maxHealth,
    alive: true,
    sprinting: false,
    crouching: false,
    sliding: false,
    slideTimer: 0,
    slideCooldownTimer: 0,
    slideDirX: 0,
    slideDirZ: 0,
    canDoubleJump: false,
    hasDoubleJumped: false,
    animState: 'idle',
  };
}

function getColliderBox(collider) {
  return collider?.aabb ?? collider?.box ?? null;
}

function shouldSkipSurfaceCollider(collider, groundY = 0) {
  const box = getColliderBox(collider);
  if (!box) return false;
  return (collider.type === 'surface' || collider.metadata?.runnable)
    && Math.abs(box.max.y - groundY) <= 0.05;
}

function getSupportHeight(state, colliders, radius, groundSnapDistance, baseGroundY = 0) {
  let supportY = baseGroundY;

  for (const collider of colliders ?? []) {
    const box = getColliderBox(collider);
    if (!box) continue;

    const isSurface = collider.type === 'surface' || collider.metadata?.runnable;
    if (!isSurface) continue;

    const withinX = state.position.x >= box.min.x - radius && state.position.x <= box.max.x + radius;
    const withinZ = state.position.z >= box.min.z - radius && state.position.z <= box.max.z + radius;
    if (!withinX || !withinZ) continue;

    const surfaceY = box.max.y;
    if (state.position.y >= surfaceY - groundSnapDistance) {
      supportY = Math.max(supportY, surfaceY);
    }
  }

  return supportY;
}

function resolveAgainstBox(state, box, radius, height) {
  const { position: pos, velocity: vel } = state;
  const capsuleMinY = pos.y;
  const capsuleMaxY = pos.y + height;

  if (capsuleMaxY < box.min.y || capsuleMinY > box.max.y) {
    return false;
  }

  const expandedMinX = box.min.x - radius;
  const expandedMaxX = box.max.x + radius;
  const expandedMinZ = box.min.z - radius;
  const expandedMaxZ = box.max.z + radius;

  const insideX = pos.x >= expandedMinX && pos.x <= expandedMaxX;
  const insideZ = pos.z >= expandedMinZ && pos.z <= expandedMaxZ;
  if (!insideX || !insideZ) {
    return false;
  }

  const distLeft = pos.x - expandedMinX;
  const distRight = expandedMaxX - pos.x;
  const distBack = pos.z - expandedMinZ;
  const distFront = expandedMaxZ - pos.z;
  const minDist = Math.min(distLeft, distRight, distBack, distFront);

  if (minDist === distLeft) {
    pos.x = expandedMinX;
    if (vel) vel.x = Math.min(vel.x, 0);
  } else if (minDist === distRight) {
    pos.x = expandedMaxX;
    if (vel) vel.x = Math.max(vel.x, 0);
  } else if (minDist === distBack) {
    pos.z = expandedMinZ;
    if (vel) vel.z = Math.min(vel.z, 0);
  } else {
    pos.z = expandedMaxZ;
    if (vel) vel.z = Math.max(vel.z, 0);
  }

  return true;
}

function resolvePlayerCollisions(state, colliders, options) {
  const { radius, height, groundSnapDistance, baseGroundY = 0 } = options;

  for (const collider of colliders ?? []) {
    const box = getColliderBox(collider);
    if (!box) continue;
    if (shouldSkipSurfaceCollider(collider, baseGroundY)) continue;
    resolveAgainstBox(state, box, radius, height);
  }

  const supportY = getSupportHeight(state, colliders, radius, groundSnapDistance, baseGroundY);
  if (state.position.y <= supportY) {
    state.position.y = supportY;
    state.velocity.y = 0;
    state.grounded = true;
    state.canDoubleJump = false;
    state.hasDoubleJumped = false;
  } else {
    state.grounded = false;
  }
}

/**
 * Simulate one tick of player physics given an input.
 *
 * @param {ReturnType<typeof createPlayerState>} state - mutable player state
 * @param {{
 *   moveX: number, moveZ: number,
 *   sprint: boolean, jump: boolean, crouch: boolean,
 *   rotation: number,
 * }} input - client input for this tick
 * @param {number} dt - delta time in seconds
 * @param {{ minX: number, maxX: number, minZ: number, maxZ: number }} bounds - world bounds
 * @param {Array<{ aabb?: { min: { x: number, y: number, z: number }, max: { x: number, y: number, z: number } }, box?: any, type?: string, metadata?: object }>} colliders
 */
export function simulateTick(state, input, dt, bounds, colliders = []) {
  if (!state.alive) return;

  const { position: pos, velocity: vel } = state;

  // --- Movement speed ---
  let speed = PHYSICS.walkSpeed;
  if (state.crouching && !state.sliding) speed = PHYSICS.crouchSpeed;

  state.sprinting = false;
  const hasInput = Math.abs(input.moveX) > 0.01 || Math.abs(input.moveZ) > 0.01;
  if (input.sprint && state.stamina > 0 && !state.crouching && hasInput) {
    state.sprinting = true;
    speed = PHYSICS.sprintSpeed;
  }

  // --- Horizontal velocity (unless sliding) ---
  if (!state.sliding) {
    vel.x = input.moveX * speed;
    vel.z = input.moveZ * speed;
  }

  // --- Jump ---
  if (input.jump) {
    if (state.grounded) {
      vel.y = PHYSICS.jumpForce;
      state.grounded = false;
      state.canDoubleJump = true;
      state.hasDoubleJumped = false;
    } else if (state.canDoubleJump && !state.hasDoubleJumped) {
      vel.y = PHYSICS.doubleJumpForce;
      state.hasDoubleJumped = true;
      state.canDoubleJump = false;
    }
  }

  // --- Crouch / Slide ---
  if (input.crouch) {
    if (!state.crouching && state.grounded) {
      state.crouching = true;
      const hSpeed = Math.sqrt(vel.x * vel.x + vel.z * vel.z);
      if (hSpeed > PHYSICS.walkSpeed * 0.8 && state.slideCooldownTimer <= 0) {
        const len = hasInput ? Math.sqrt(input.moveX * input.moveX + input.moveZ * input.moveZ) : 1;
        state.slideDirX = hasInput ? input.moveX / len : 0;
        state.slideDirZ = hasInput ? input.moveZ / len : 1;
        state.sliding = true;
        state.slideTimer = PHYSICS.slideDuration;
        state.slideCooldownTimer = PHYSICS.slideCooldown;
        const slideSpd = Math.max(hSpeed, PHYSICS.slideSpeed);
        vel.x = state.slideDirX * slideSpd;
        vel.z = state.slideDirZ * slideSpd;
      }
    }
  } else if (state.crouching && !state.sliding) {
    state.crouching = false;
  }

  // --- Slide decay ---
  if (state.slideCooldownTimer > 0) state.slideCooldownTimer -= dt;
  if (state.sliding) {
    state.slideTimer -= dt;
    if (state.slideTimer <= 0) {
      state.sliding = false;
      state.crouching = false;
    } else {
      const t = state.slideTimer / PHYSICS.slideDuration;
      const spd = PHYSICS.slideSpeed * t;
      vel.x = state.slideDirX * spd;
      vel.z = state.slideDirZ * spd;
    }
  }

  // --- Gravity ---
  if (!state.grounded) {
    vel.y += PHYSICS.gravity * dt;
  }

  // --- Integrate ---
  pos.x += vel.x * dt;
  pos.y += vel.y * dt;
  pos.z += vel.z * dt;

  // --- Room collisions / ground support ---
  if (colliders?.length) {
    resolvePlayerCollisions(state, colliders, {
      radius: PHYSICS.playerRadius,
      height: PHYSICS.playerHeight,
      groundSnapDistance: PHYSICS.groundSnapDistance,
      baseGroundY: 0,
    });
  } else if (pos.y <= 0) {
    // --- Ground check fallback ---
    // Ground is y=0 in world space; visual ground offset is applied client-side per mouse model.
    pos.y = 0;
    vel.y = 0;
    state.grounded = true;
    state.canDoubleJump = false;
    state.hasDoubleJumped = false;
  } else {
    state.grounded = false;
  }

  // --- World bounds ---
  if (bounds) {
    const r = PHYSICS.playerRadius;
    if (pos.x < bounds.minX + r) { pos.x = bounds.minX + r; vel.x = Math.max(vel.x, 0); }
    if (pos.x > bounds.maxX - r) { pos.x = bounds.maxX - r; vel.x = Math.min(vel.x, 0); }
    if (pos.z < bounds.minZ + r) { pos.z = bounds.minZ + r; vel.z = Math.max(vel.z, 0); }
    if (pos.z > bounds.maxZ - r) { pos.z = bounds.maxZ - r; vel.z = Math.min(vel.z, 0); }
  }

  // --- Rotation ---
  if (input.rotation !== undefined) {
    state.rotation = input.rotation;
  }

  // --- Stamina ---
  if (state.sprinting) {
    state.stamina -= PHYSICS.staminaDrainRate * dt;
    state.staminaRegenTimer = PHYSICS.staminaRegenDelay;
    if (state.stamina <= 0) {
      state.stamina = 0;
      state.sprinting = false;
    }
  } else {
    state.staminaRegenTimer -= dt;
    if (state.staminaRegenTimer <= 0) {
      state.stamina = Math.min(state.stamina + PHYSICS.staminaRegenRate * dt, PHYSICS.maxStamina);
    }
  }

  // --- Animation state ---
  if (!state.alive) {
    state.animState = 'death';
  } else if (!state.grounded) {
    state.animState = 'jump';
  } else if (state.sprinting || state.sliding) {
    state.animState = 'run';
  } else {
    const hSpeed = Math.sqrt(vel.x * vel.x + vel.z * vel.z);
    state.animState = hSpeed > 0.5 ? 'walk' : 'idle';
  }
}
