import * as THREE from 'three';

/**
 * AI states for predator behavior.
 */
export const AI_STATE = Object.freeze({
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

const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();

/**
 * Base class for enemy entities that pursue and disrupt the player.
 *
 * Subclasses provide their own model + config via overrides.
 */
export class Predator extends THREE.Group {
  constructor(config = {}) {
    super();
    this.name = config.name ?? 'Predator';

    // Model & animation
    this.model = null;
    this.mixer = null;
    this.actions = {};
    this.currentAction = null;
    this.currentAnimName = null;

    // AI
    this.aiState = AI_STATE.IDLE;
    this.aiTimer = 0;
    this.target = null; // player mouse reference
    this.aggroRange = config.aggroRange ?? 12;
    this.attackRange = config.attackRange ?? 1.8;
    this.leashRange = config.leashRange ?? 20;
    this.moveSpeed = config.moveSpeed ?? 3.5;
    this.chaseSpeed = config.chaseSpeed ?? 5.5;
    this.turnSpeed = config.turnSpeed ?? 8;
    this.attackCooldown = config.attackCooldown ?? 2.0;
    this.stunDuration = config.stunDuration ?? 1.5;
    this.alertDuration = config.alertDuration ?? 0.8;
    this.roarDuration = config.roarDuration ?? 2.0;
    this.damage = config.damage ?? 1;
    this.knockbackForce = config.knockbackForce ?? 6;

    // Health
    this.maxHealth = config.maxHealth ?? 5;
    this.health = this.maxHealth;
    this.alive = true;

    // Physics
    this.velocity = new THREE.Vector3();
    this.grounded = true;
    this.gravity = config.gravity ?? -20;
    this.groundY = 0;
    this.radius = config.radius ?? 0.5;

    // Patrol
    this.spawnPoint = new THREE.Vector3();
    this.patrolRadius = config.patrolRadius ?? 6;
    this.patrolTarget = new THREE.Vector3();
    this.patrolWaitMin = config.patrolWaitMin ?? 1.5;
    this.patrolWaitMax = config.patrolWaitMax ?? 4.0;

    // Collision
    this.collisionQuery = config.collisionQuery ?? null;

    // Callbacks
    this.onAttackHit = null; // (predator, playerController) => void
  }

  // ── Model setup (called by subclass after loading GLB) ───────────

  _attachModel(gltf, { height = 2, groundOffset = 0 } = {}) {
    this.model = gltf.scene;
    this.model.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
        child.frustumCulled = false;
      }
    });

    const box = new THREE.Box3().setFromObject(this.model);
    const modelHeight = box.max.y - box.min.y;
    const s = height / modelHeight;
    this.model.scale.set(s, s, s);
    this.model.position.y = -box.min.y * s + groundOffset;
    this.add(this.model);

    if (gltf.animations.length) {
      this.mixer = new THREE.AnimationMixer(this.model);
      for (const clip of gltf.animations) {
        const action = this.mixer.clipAction(clip);
        this.actions[clip.name] = action;
      }
    }
  }

  // ── Animation ────────────────────────────────────────────────────

  playAnimation(name, { fadeIn = 0.25, loop = true, clampWhenFinished = false } = {}) {
    if (name === this.currentAnimName) return;
    const next = this.actions[name];
    if (!next) return;

    if (this.currentAction) {
      this.currentAction.fadeOut(fadeIn);
    }

    next.reset().fadeIn(fadeIn);
    next.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce);
    next.clampWhenFinished = clampWhenFinished;
    next.play();

    this.currentAction = next;
    this.currentAnimName = name;
  }

  // ── Spawn / Reset ───────────────────────────────────────────────

  spawn(position, target) {
    this.position.copy(position);
    this.spawnPoint.copy(position);
    this.target = target;
    this.health = this.maxHealth;
    this.alive = true;
    this.aiState = AI_STATE.IDLE;
    this.aiTimer = 1 + Math.random() * 2;
    this._pickPatrolTarget();
  }

  // ── AI Update ───────────────────────────────────────────────────

  update(dt) {
    if (!this.alive) {
      this.mixer?.update(dt);
      return;
    }

    this.aiTimer -= dt;
    const distToPlayer = this._distToTarget();
    const distToSpawn = _v1.copy(this.spawnPoint).sub(this.position).setY(0).length();

    switch (this.aiState) {
      case AI_STATE.IDLE:
        this._updateIdle(dt, distToPlayer);
        break;
      case AI_STATE.PATROL:
        this._updatePatrol(dt, distToPlayer);
        break;
      case AI_STATE.ALERT:
        this._updateAlert(dt, distToPlayer);
        break;
      case AI_STATE.CHASE:
        this._updateChase(dt, distToPlayer, distToSpawn);
        break;
      case AI_STATE.ATTACK:
        this._updateAttack(dt);
        break;
      case AI_STATE.COOLDOWN:
        this._updateCooldown(dt, distToPlayer);
        break;
      case AI_STATE.STUNNED:
        this._updateStunned(dt);
        break;
      case AI_STATE.ROAR:
        this._updateRoar(dt);
        break;
      case AI_STATE.DEATH:
        break;
    }

    this._applyGravity(dt);
    this._resolveCollisions();
    this.mixer?.update(dt);
  }

  // ── State handlers ──────────────────────────────────────────────

  _updateIdle(dt, distToPlayer) {
    this._animateForState('idle');

    if (distToPlayer < this.aggroRange) {
      this._enterAlert();
      return;
    }

    if (this.aiTimer <= 0) {
      this._enterPatrol();
    }
  }

  _updatePatrol(dt, distToPlayer) {
    this._animateForState('patrol');

    if (distToPlayer < this.aggroRange) {
      this._enterAlert();
      return;
    }

    const dir = _v1.copy(this.patrolTarget).sub(this.position).setY(0);
    const dist = dir.length();

    if (dist < 0.5) {
      this.aiState = AI_STATE.IDLE;
      this.aiTimer = this.patrolWaitMin + Math.random() * (this.patrolWaitMax - this.patrolWaitMin);
      return;
    }

    dir.normalize();
    this._moveToward(dir, this.moveSpeed, dt);
    this._faceDirection(dir, dt);
  }

  _enterAlert() {
    this.aiState = AI_STATE.ALERT;
    this.aiTimer = this.alertDuration;
    this._animateForState('alert');
    this._faceTarget(100);
  }

  _updateAlert(dt, distToPlayer) {
    this._faceTarget(dt);

    if (this.aiTimer <= 0) {
      this._enterRoar();
    }
  }

  _enterRoar() {
    this.aiState = AI_STATE.ROAR;
    this.aiTimer = this.roarDuration;
    this._animateForState('roar');
  }

  _updateRoar(dt) {
    this._faceTarget(dt);
    if (this.aiTimer <= 0) {
      this.aiState = AI_STATE.CHASE;
    }
  }

  _updateChase(dt, distToPlayer, distToSpawn) {
    this._animateForState('chase');

    if (distToSpawn > this.leashRange && distToPlayer > this.aggroRange) {
      this._enterPatrol();
      this.patrolTarget.copy(this.spawnPoint);
      return;
    }

    if (distToPlayer < this.attackRange) {
      this._enterAttack();
      return;
    }

    if (distToPlayer > this.leashRange * 1.5) {
      this._enterPatrol();
      this.patrolTarget.copy(this.spawnPoint);
      return;
    }

    const dir = this._dirToTarget();
    this._moveToward(dir, this.chaseSpeed, dt);
    this._faceDirection(dir, dt);
  }

  _enterAttack() {
    this.aiState = AI_STATE.ATTACK;
    this.aiTimer = 0.5; // attack windup + hit timing
    this._animateForState('attack');
    this._faceTarget(100);
    this._attackHitPending = true;
  }

  _updateAttack(dt) {
    if (this._attackHitPending && this.aiTimer <= 0.15) {
      this._attackHitPending = false;
      this._tryHitTarget();
    }

    if (this.aiTimer <= 0) {
      this.aiState = AI_STATE.COOLDOWN;
      this.aiTimer = this.attackCooldown;
    }
  }

  _updateCooldown(dt, distToPlayer) {
    this._animateForState('cooldown');

    if (this.aiTimer <= 0) {
      if (distToPlayer < this.attackRange) {
        this._enterAttack();
      } else if (distToPlayer < this.aggroRange) {
        this.aiState = AI_STATE.CHASE;
      } else {
        this._enterPatrol();
        this.patrolTarget.copy(this.spawnPoint);
      }
    }
  }

  _updateStunned(dt) {
    if (this.aiTimer <= 0) {
      this.aiState = AI_STATE.CHASE;
    }
  }

  // ── Combat ──────────────────────────────────────────────────────

  _tryHitTarget() {
    if (!this.target) return;
    const dist = this._distToTarget();
    if (dist > this.attackRange * 1.5) return;

    if (this.onAttackHit) {
      this.onAttackHit(this, this.target);
    }
  }

  takeDamage(amount = 1) {
    if (!this.alive) return;
    this.health -= amount;
    if (this.health <= 0) {
      this.die();
    } else {
      this.aiState = AI_STATE.STUNNED;
      this.aiTimer = this.stunDuration;
      this._animateForState('stunned');
    }
  }

  die() {
    this.alive = false;
    this.health = 0;
    this.aiState = AI_STATE.DEATH;
    this._animateForState('death');
  }

  // ── Movement helpers ────────────────────────────────────────────

  _moveToward(dir, speed, dt) {
    this.position.x += dir.x * speed * dt;
    this.position.z += dir.z * speed * dt;
  }

  _faceDirection(dir, dt) {
    if (dir.lengthSq() < 0.0001) return;
    const targetAngle = Math.atan2(dir.x, dir.z);
    let diff = targetAngle - this.rotation.y;
    if (diff > Math.PI) diff -= Math.PI * 2;
    if (diff < -Math.PI) diff += Math.PI * 2;
    this.rotation.y += diff * Math.min(1, dt * this.turnSpeed);
  }

  _faceTarget(dt) {
    if (!this.target) return;
    const dir = this._dirToTarget();
    this._faceDirection(dir, dt);
  }

  _dirToTarget() {
    if (!this.target) return _v1.set(0, 0, 1);
    return _v1.copy(this.target.position).sub(this.position).setY(0).normalize();
  }

  _distToTarget() {
    if (!this.target) return Infinity;
    return _v2.copy(this.target.position).sub(this.position).setY(0).length();
  }

  _applyGravity(dt) {
    if (!this.grounded) {
      this.velocity.y += this.gravity * dt;
    }
    this.position.y += this.velocity.y * dt;

    if (this.position.y <= this.groundY) {
      this.position.y = this.groundY;
      this.velocity.y = 0;
      this.grounded = true;
    }
  }

  _resolveCollisions() {
    if (!this.collisionQuery) return;
    const colliders = this.collisionQuery();
    const px = this.position.x;
    const pz = this.position.z;
    const r = this.radius;

    for (const collider of colliders) {
      if (collider.type === 'surface' || collider.type === 'loot') continue;
      const { min, max } = collider.aabb;
      if (this.position.y > max.y || this.position.y + 2 < min.y) continue;

      const closestX = Math.max(min.x, Math.min(px, max.x));
      const closestZ = Math.max(min.z, Math.min(pz, max.z));
      const dx = px - closestX;
      const dz = pz - closestZ;
      const distSq = dx * dx + dz * dz;

      if (distSq < r * r && distSq > 0.0001) {
        const dist = Math.sqrt(distSq);
        const overlap = r - dist;
        this.position.x += (dx / dist) * overlap;
        this.position.z += (dz / dist) * overlap;
      }
    }
  }

  _pickPatrolTarget() {
    const angle = Math.random() * Math.PI * 2;
    const dist = 1 + Math.random() * (this.patrolRadius - 1);
    this.patrolTarget.set(
      this.spawnPoint.x + Math.cos(angle) * dist,
      this.spawnPoint.y,
      this.spawnPoint.z + Math.sin(angle) * dist,
    );
  }

  _enterPatrol() {
    this.aiState = AI_STATE.PATROL;
    this._pickPatrolTarget();
  }

  // ── Animation mapping (override in subclass) ────────────────────

  /** Map AI state → animation clip name. Override per creature. */
  _animateForState(state) {
    // default: just play the state name
    this.playAnimation(state);
  }
}
