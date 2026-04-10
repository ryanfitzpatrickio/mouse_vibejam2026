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
  wallJumpForce: 6.4,
  wallJumpAwayForce: 4.6,
  gravity: -20.0,
  groundOffset: 0.35,
  playerHeightOffset: -0.035,
  playerRadius: 0.22,
  playerHeight: 0.78,
  groundSnapDistance: 0.18,
  wallProbeDistance: 0.14,
  wallJumpWindow: 0.22,
  wallAttachCooldown: 0.16,
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
    wallHolding: false,
    wallNormalX: 0,
    wallNormalZ: 0,
    wallJumpWindowTimer: 0,
    wallAttachCooldownTimer: 0,
    animState: 'idle',
    deathTime: 0,
  };
}

/**
 * Maximum height difference that can be automatically stepped up.
 * When walking into a short ledge, the player steps up instead of being blocked.
 */
const MAX_STEP_HEIGHT = 0.35;
const FACE_CONTACT_EPSILON = 0.001;

function getColliderBox(collider) {
  return collider?.aabb ?? collider?.box ?? null;
}

function shouldSkipSurfaceCollider(collider, groundY = 0) {
  const box = getColliderBox(collider);
  if (!box) return false;
  return (collider.type === 'surface' || collider.metadata?.runnable)
    && Math.abs(box.max.y - groundY) <= 0.05;
}

function isWallCollider(collider) {
  return !!getColliderBox(collider)
    && collider.type !== 'surface'
    && collider.type !== 'loot'
    && !collider.metadata?.runnable;
}

function getSupportHeight(state, colliders, radius, groundSnapDistance, baseGroundY = 0) {
  let supportY = baseGroundY;

  for (const collider of colliders ?? []) {
    const box = getColliderBox(collider);
    if (!box) continue;

    const withinX = state.position.x >= box.min.x - radius && state.position.x <= box.max.x + radius;
    const withinZ = state.position.z >= box.min.z - radius && state.position.z <= box.max.z + radius;
    if (!withinX || !withinZ) continue;

    const isSurface = collider.type === 'surface' || collider.metadata?.runnable;
    const surfaceY = box.max.y;

    if (isSurface) {
      // Explicit surfaces (planes, runnable floors) — snap when near
      if (state.position.y >= surfaceY - groundSnapDistance) {
        supportY = Math.max(supportY, surfaceY);
      }
    } else {
      // Furniture / solid boxes — land on top when player is at or above the top face
      // Use a slightly larger snap window so small gaps don't prevent landing
      const snapWindow = groundSnapDistance * 1.5;
      if (state.position.y >= surfaceY - snapWindow && state.velocity.y <= 0.01) {
        supportY = Math.max(supportY, surfaceY);
      }
    }
  }

  return supportY;
}

function resolveAgainstBox(state, box, radius, height, previousPosition = null) {
  const { position: pos, velocity: vel } = state;
  const capsuleMinY = pos.y;
  const capsuleMaxY = pos.y + height;
  const previousX = previousPosition?.x ?? pos.x;
  const previousZ = previousPosition?.z ?? pos.z;
  const previousCapsuleMinY = previousPosition?.y ?? capsuleMinY;
  const previousCapsuleMaxY = previousCapsuleMinY + height;

  // Early-out when capsule is entirely above or below the box
  if (capsuleMaxY < box.min.y || capsuleMinY > box.max.y) {
    return false;
  }

  const expandedMinX = box.min.x - radius;
  const expandedMaxX = box.max.x + radius;
  const expandedMinZ = box.min.z - radius;
  const expandedMaxZ = box.max.z + radius;

  const ySweepOverlaps = Math.max(previousCapsuleMinY, capsuleMinY) <= box.max.y + FACE_CONTACT_EPSILON
    && Math.min(previousCapsuleMaxY, capsuleMaxY) >= box.min.y - FACE_CONTACT_EPSILON;
  const sweptAcrossZ = Math.max(previousZ, pos.z) >= expandedMinZ - FACE_CONTACT_EPSILON
    && Math.min(previousZ, pos.z) <= expandedMaxZ + FACE_CONTACT_EPSILON;
  const sweptAcrossX = Math.max(previousX, pos.x) >= expandedMinX - FACE_CONTACT_EPSILON
    && Math.min(previousX, pos.x) <= expandedMaxX + FACE_CONTACT_EPSILON;

  if (ySweepOverlaps) {
    if (previousX < box.min.x - FACE_CONTACT_EPSILON && pos.x >= box.min.x - FACE_CONTACT_EPSILON && sweptAcrossZ) {
      pos.x = expandedMinX;
      if (vel) vel.x = Math.min(vel.x, 0);
      return true;
    }

    if (previousX > box.max.x + FACE_CONTACT_EPSILON && pos.x <= box.max.x + FACE_CONTACT_EPSILON && sweptAcrossZ) {
      pos.x = expandedMaxX;
      if (vel) vel.x = Math.max(vel.x, 0);
      return true;
    }

    if (previousZ < box.min.z - FACE_CONTACT_EPSILON && pos.z >= box.min.z - FACE_CONTACT_EPSILON && sweptAcrossX) {
      pos.z = expandedMinZ;
      if (vel) vel.z = Math.min(vel.z, 0);
      return true;
    }

    if (previousZ > box.max.z + FACE_CONTACT_EPSILON && pos.z <= box.max.z + FACE_CONTACT_EPSILON && sweptAcrossX) {
      pos.z = expandedMaxZ;
      if (vel) vel.z = Math.max(vel.z, 0);
      return true;
    }
  }

  const insideX = pos.x >= expandedMinX && pos.x <= expandedMaxX;
  const insideZ = pos.z >= expandedMinZ && pos.z <= expandedMaxZ;
  if (!insideX || !insideZ) {
    return false;
  }

  const landedFromAbove = previousCapsuleMinY >= box.max.y - FACE_CONTACT_EPSILON
    && capsuleMinY <= box.max.y + FACE_CONTACT_EPSILON
    && vel.y <= 0;
  if (landedFromAbove) {
    pos.y = box.max.y;
    if (vel) vel.y = Math.max(vel.y, 0);
    return true;
  }

  const hitFromBelow = previousCapsuleMaxY <= box.min.y + FACE_CONTACT_EPSILON
    && capsuleMaxY >= box.min.y - FACE_CONTACT_EPSILON
    && vel.y >= 0;
  if (hitFromBelow) {
    pos.y = box.min.y - height;
    if (vel) vel.y = Math.min(vel.y, 0);
    return true;
  }

  // --- Penetration depths for all 6 faces ---
  const distLeft = pos.x - expandedMinX;
  const distRight = expandedMaxX - pos.x;
  const distBack = pos.z - expandedMinZ;
  const distFront = expandedMaxZ - pos.z;

  // Y-axis penetration depths (using raw capsule bottom/top vs box faces)
  const distUp = box.max.y - capsuleMinY;   // push player up (landed from above)
  const distDown = capsuleMaxY - box.min.y; // push player down (hit ceiling)

  const minDist = Math.min(distLeft, distRight, distBack, distFront, distUp, distDown);

  if (minDist === distUp && distUp >= 0) {
    // Player entered from above — push up to stand on top of the box
    pos.y = box.max.y;
    if (vel) vel.y = Math.max(vel.y, 0);
  } else if (minDist === distDown && distDown >= 0) {
    // Player hit the bottom of the box (ceiling) — push down
    pos.y = box.min.y - height;
    if (vel) vel.y = Math.min(vel.y, 0);
  } else if (minDist === distLeft) {
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

function findNearbyWallContact(state, colliders, radius, height, probeDistance) {
  const footY = state.position.y + 0.02;
  const headY = state.position.y + height - 0.02;
  let bestContact = null;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const collider of colliders ?? []) {
    if (!isWallCollider(collider)) continue;

    const box = getColliderBox(collider);
    if (!box) continue;
    if (headY < box.min.y || footY > box.max.y) continue;

    const expandedMinX = box.min.x - radius;
    const expandedMaxX = box.max.x + radius;
    const expandedMinZ = box.min.z - radius;
    const expandedMaxZ = box.max.z + radius;
    const withinX = state.position.x >= expandedMinX - probeDistance
      && state.position.x <= expandedMaxX + probeDistance;
    const withinZ = state.position.z >= expandedMinZ - probeDistance
      && state.position.z <= expandedMaxZ + probeDistance;

    if (withinZ) {
      const distMinX = Math.abs(state.position.x - expandedMinX);
      if (distMinX <= probeDistance && distMinX < bestDistance) {
        bestDistance = distMinX;
        bestContact = {
          axis: 'x',
          clampValue: expandedMinX,
          normalX: -1,
          normalZ: 0,
        };
      }

      const distMaxX = Math.abs(state.position.x - expandedMaxX);
      if (distMaxX <= probeDistance && distMaxX < bestDistance) {
        bestDistance = distMaxX;
        bestContact = {
          axis: 'x',
          clampValue: expandedMaxX,
          normalX: 1,
          normalZ: 0,
        };
      }
    }

    if (withinX) {
      const distMinZ = Math.abs(state.position.z - expandedMinZ);
      if (distMinZ <= probeDistance && distMinZ < bestDistance) {
        bestDistance = distMinZ;
        bestContact = {
          axis: 'z',
          clampValue: expandedMinZ,
          normalX: 0,
          normalZ: -1,
        };
      }

      const distMaxZ = Math.abs(state.position.z - expandedMaxZ);
      if (distMaxZ <= probeDistance && distMaxZ < bestDistance) {
        bestDistance = distMaxZ;
        bestContact = {
          axis: 'z',
          clampValue: expandedMaxZ,
          normalX: 0,
          normalZ: 1,
        };
      }
    }
  }

  return bestContact;
}

function applyWallHold(state, wallContact) {
  if (!wallContact) return false;

  if (wallContact.axis === 'x') {
    state.position.x = wallContact.clampValue;
    state.velocity.x = 0;
  } else {
    state.position.z = wallContact.clampValue;
    state.velocity.z = 0;
  }

  state.velocity.y = 0;
  state.grounded = false;
  state.wallHolding = true;
  state.wallNormalX = wallContact.normalX;
  state.wallNormalZ = wallContact.normalZ;
  state.wallJumpWindowTimer = PHYSICS.wallJumpWindow;
  return true;
}

function resolvePlayerCollisions(state, colliders, options) {
  const { radius, height, groundSnapDistance, baseGroundY = 0, previousPosition = null } = options;

  // Auto step-up: if the player is walking into a short ledge, step up onto it
  // instead of being blocked horizontally. Only applies when grounded and
  // the obstacle is short enough relative to current foot position.
  for (const collider of colliders ?? []) {
    const box = getColliderBox(collider);
    if (!box) continue;
    if (shouldSkipSurfaceCollider(collider, baseGroundY)) continue;

    // Check for step-up opportunity before resolving collision
    const capsuleMinY = state.position.y;
    const ledgeHeight = box.max.y - capsuleMinY;
    const isShortLedge = ledgeHeight > 0 && ledgeHeight <= MAX_STEP_HEIGHT;

    const expandedMinX = box.min.x - radius;
    const expandedMaxX = box.max.x + radius;
    const expandedMinZ = box.min.z - radius;
    const expandedMaxZ = box.max.z + radius;
    const insideX = state.position.x >= expandedMinX && state.position.x <= expandedMaxX;
    const insideZ = state.position.z >= expandedMinZ && state.position.z <= expandedMaxZ;
    const capsuleMaxY = state.position.y + height;
    const inYRange = capsuleMaxY >= box.min.y && capsuleMinY <= box.max.y;

    if (isShortLedge && insideX && insideZ && inYRange && state.grounded) {
      // Step up onto the ledge instead of being pushed sideways
      state.position.y = box.max.y;
      state.velocity.y = 0;
      continue;
    }

    resolveAgainstBox(state, box, radius, height, previousPosition);
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

export function respawnPlayer(state, spawnX, spawnZ, spawnY = 0) {
  state.position.x = spawnX;
  state.position.y = spawnY;
  state.position.z = spawnZ;
  state.velocity.x = 0;
  state.velocity.y = 0;
  state.velocity.z = 0;
  state.rotation = 0;
  state.grounded = spawnY <= 0.001;
  state.stamina = PHYSICS.maxStamina;
  state.staminaRegenTimer = 0;
  state.health = PHYSICS.maxHealth;
  state.alive = true;
  state.sprinting = false;
  state.crouching = false;
  state.sliding = false;
  state.slideTimer = 0;
  state.slideCooldownTimer = 0;
  state.slideDirX = 0;
  state.slideDirZ = 0;
  state.canDoubleJump = false;
  state.hasDoubleJumped = false;
  state.wallHolding = false;
  state.wallNormalX = 0;
  state.wallNormalZ = 0;
  state.wallJumpWindowTimer = 0;
  state.wallAttachCooldownTimer = 0;
  state.animState = 'idle';
  state.deathTime = 0;
}

/**
 * Simulate one tick of player physics given an input.
 *
 * @param {ReturnType<typeof createPlayerState>} state - mutable player state
 * @param {{
 *   moveX: number, moveZ: number,
 *   sprint: boolean,
 *   jump?: boolean, jumpPressed?: boolean, jumpHeld?: boolean,
 *   crouch: boolean,
 *   rotation: number,
 * }} input - client input for this tick
 * @param {number} dt - delta time in seconds
 * @param {{ minX: number, maxX: number, minZ: number, maxZ: number }} bounds - world bounds
 * @param {Array<{ aabb?: { min: { x: number, y: number, z: number }, max: { x: number, y: number, z: number } }, box?: any, type?: string, metadata?: object }>} colliders
 */
export function simulateTick(state, input, dt, bounds, colliders = []) {
  if (!state.alive) return;

  const { position: pos, velocity: vel } = state;
  const jumpHeld = !!(input.jumpHeld ?? input.jump);
  const jumpPressed = !!(input.jumpPressed ?? input.jump);
  const previousPosition = {
    x: pos.x,
    y: pos.y,
    z: pos.z,
  };

  state.wallJumpWindowTimer = Math.max(0, state.wallJumpWindowTimer - dt);
  state.wallAttachCooldownTimer = Math.max(0, state.wallAttachCooldownTimer - dt);
  if (state.grounded) {
    state.wallHolding = false;
  } else if (state.wallHolding && !jumpHeld) {
    state.wallHolding = false;
  }

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
  if (jumpPressed) {
    if (state.grounded) {
      vel.y = PHYSICS.jumpForce;
      state.grounded = false;
      state.canDoubleJump = true;
      state.hasDoubleJumped = false;
      state.wallHolding = false;
      state.wallJumpWindowTimer = 0;
    } else if (state.wallJumpWindowTimer > 0 && (state.wallNormalX !== 0 || state.wallNormalZ !== 0)) {
      vel.x = state.wallNormalX * PHYSICS.wallJumpAwayForce;
      vel.z = state.wallNormalZ * PHYSICS.wallJumpAwayForce;
      vel.y = PHYSICS.wallJumpForce;
      state.grounded = false;
      state.wallHolding = false;
      state.wallJumpWindowTimer = 0;
      state.wallAttachCooldownTimer = PHYSICS.wallAttachCooldown;
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
  if (!state.grounded && !state.wallHolding) {
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
      previousPosition,
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

  if (state.grounded) {
    state.wallHolding = false;
    state.wallNormalX = 0;
    state.wallNormalZ = 0;
    state.wallJumpWindowTimer = 0;
  } else if (jumpHeld && state.wallAttachCooldownTimer <= 0 && colliders?.length) {
    const wallContact = findNearbyWallContact(
      state,
      colliders,
      PHYSICS.playerRadius,
      PHYSICS.playerHeight,
      PHYSICS.wallProbeDistance,
    );
    if (wallContact) {
      applyWallHold(state, wallContact);
    } else {
      state.wallHolding = false;
    }
  } else {
    state.wallHolding = false;
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
