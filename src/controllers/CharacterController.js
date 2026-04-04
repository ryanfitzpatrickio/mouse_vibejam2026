import * as THREE from 'three';
import { UprightCapsuleCollider } from '../physics/UprightCapsuleCollider.js';

const DEFAULT_KEY_BINDINGS = Object.freeze({
  forward: 'KeyW',
  backward: 'KeyS',
  left: 'KeyA',
  right: 'KeyD',
  sprint: 'ShiftLeft',
  jump: 'Space',
  crouch: 'ControlLeft',
  interact: 'KeyE',
  drop: 'KeyG',
});

const CONFIG = Object.freeze({
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

export class CharacterController {
  constructor({
    mouse,
    thirdPersonCamera = null,
    collisionQuery = null,
    keyBindings = {},
    groundOffset = CONFIG.groundOffset,
    playerRadius = CONFIG.playerRadius,
    playerHeight = CONFIG.playerHeight,
    groundSnapDistance = CONFIG.groundSnapDistance,
  } = {}) {
    this.mouse = mouse;
    this.thirdPersonCamera = thirdPersonCamera;
    this.collisionQuery = collisionQuery;
    this.keyBindings = { ...DEFAULT_KEY_BINDINGS, ...keyBindings };
    this.groundOffset = groundOffset;
    this.collider = new UprightCapsuleCollider({
      radius: playerRadius,
      height: playerHeight,
      groundSnapDistance,
    });

    this.velocity = new THREE.Vector3();
    this.grounded = false;

    this.stamina = CONFIG.maxStamina;
    this.staminaRegenTimer = 0;

    this.health = CONFIG.maxHealth;
    this.alive = true;

    this.sprinting = false;
    this.crouching = false;
    this.sliding = false;
    this.slideTimer = 0;
    this.slideCooldownTimer = 0;
    this.slideDirection = new THREE.Vector3();

    this.canDoubleJump = false;
    this.hasDoubleJumped = false;

    this.carriedItem = null;

    this.keys = {};
    this.mouseButtons = { left: false, right: false };
    this.inputEnabled = true;

    this._prevAnimState = 'idle';

    this.onInteract = null;
    this.onSqueak = null;
    this.onDeath = null;

    this._bindInput();
  }

  _bindInput() {
    this._onKeyDown = (e) => {
      if (!this.inputEnabled || this._isFormTarget(e.target)) return;
      this.keys[e.code] = true;
    };
    this._onKeyUp = (e) => {
      if (this._isFormTarget(e.target)) return;
      this.keys[e.code] = false;
    };
    this._onMouseDown = (e) => {
      if (!this.inputEnabled || this._isFormTarget(e.target)) return;
      if (e.button === 0) this.mouseButtons.left = true;
      if (e.button === 2) this.mouseButtons.right = true;
    };
    this._onMouseUp = (e) => {
      if (e.button === 0) this.mouseButtons.left = false;
      if (e.button === 2) this.mouseButtons.right = false;
    };
    this._onContextMenu = (e) => e.preventDefault();

    document.addEventListener('keydown', this._onKeyDown);
    document.addEventListener('keyup', this._onKeyUp);
    document.addEventListener('mousedown', this._onMouseDown);
    document.addEventListener('mouseup', this._onMouseUp);
    document.addEventListener('contextmenu', this._onContextMenu);
  }

  _isFormTarget(target) {
    return target instanceof HTMLElement
      && ['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON'].includes(target.tagName);
  }

  setInputEnabled(enabled) {
    this.inputEnabled = Boolean(enabled);
    if (!this.inputEnabled) {
      this.keys = {};
      this.mouseButtons = { left: false, right: false };
    }
  }

  _getInputDirection() {
    if (this.thirdPersonCamera) {
      return this.thirdPersonCamera.getCameraRelativeMovement({
        forward: !!this.keys[this.keyBindings.forward],
        backward: !!this.keys[this.keyBindings.backward],
        back: !!this.keys[this.keyBindings.backward],
        left: !!this.keys[this.keyBindings.left],
        right: !!this.keys[this.keyBindings.right],
      });
    }

    const forward = new THREE.Vector3(0, 0, -1);
    const right = new THREE.Vector3(1, 0, 0);
    const dir = new THREE.Vector3();
    if (this.keys[this.keyBindings.forward]) dir.add(forward);
    if (this.keys[this.keyBindings.backward]) dir.sub(forward);
    if (this.keys[this.keyBindings.right]) dir.add(right);
    if (this.keys[this.keyBindings.left]) dir.sub(right);
    if (dir.lengthSq() > 0) dir.normalize();
    return dir;
  }

  update(delta, groundY = 0) {
    if (!this.alive) return;
    const dt = Math.min(delta, 0.05);

    this._updateMovement(dt, groundY);
    this._updateStamina(dt);
    this._updateSlide(dt);
    this._handleAbilities();
    this._updateAnimation(dt);
    this._updateCamera(dt);
  }

  _updateMovement(dt, groundY) {
    const inputDir = this._getInputDirection();

    let speed = CONFIG.walkSpeed;
    if (this.crouching && !this.sliding) speed = CONFIG.crouchSpeed;
    if (this.carriedItem) {
      speed *= this.carriedItem.heavy ? CONFIG.heavyCarrySpeedMult : CONFIG.carrySpeedMult;
    }

    this.sprinting = false;
    if (
      this.keys[this.keyBindings.sprint]
      && this.stamina > 0
      && !this.crouching
      && inputDir.lengthSq() > 0
    ) {
      this.sprinting = true;
      speed = CONFIG.sprintSpeed;
      if (this.carriedItem) this.dropItem();
    }

    if (!this.sliding) {
      this.velocity.x = inputDir.x * speed;
      this.velocity.z = inputDir.z * speed;
    }

    if (this.keys[this.keyBindings.jump]) {
      if (this.grounded) {
        this.velocity.y = CONFIG.jumpForce;
        this.grounded = false;
        this.canDoubleJump = true;
        this.hasDoubleJumped = false;
      } else if (this.canDoubleJump && !this.hasDoubleJumped) {
        this.velocity.y = CONFIG.doubleJumpForce;
        this.hasDoubleJumped = true;
        this.canDoubleJump = false;
      }
      this.keys[this.keyBindings.jump] = false;
    }

    if (this.keys[this.keyBindings.crouch]) {
      if (!this.crouching && this.grounded) {
        this.crouching = true;
        const hSpeed = Math.sqrt(this.velocity.x ** 2 + this.velocity.z ** 2);
        if (hSpeed > CONFIG.walkSpeed * 0.8 && this.slideCooldownTimer <= 0) {
          this._startSlide(inputDir.lengthSq() > 0 ? inputDir : new THREE.Vector3(0, 0, 1));
        }
      }
    } else if (this.crouching && !this.sliding) {
      this.crouching = false;
    }

    if (!this.grounded) {
      this.velocity.y += CONFIG.gravity * dt;
    }

    this.mouse.position.x += this.velocity.x * dt;
    this.mouse.position.y += this.velocity.y * dt;
    this.mouse.position.z += this.velocity.z * dt;

    this._resolveCollisions(groundY);

    const colliders = this._getCollisionCandidates();
    const supportY = this.collider.getSupportHeight(colliders, groundY);
    const groundLevel = supportY + (this.mouse?.groundOffset ?? this.groundOffset);
    if (this.mouse.position.y <= groundLevel) {
      this.mouse.position.y = groundLevel;
      this.velocity.y = 0;
      this.grounded = true;
      this.canDoubleJump = false;
      this.hasDoubleJumped = false;
    } else {
      this.grounded = false;
    }

    if (inputDir.lengthSq() > 0.01) {
      const targetAngle = Math.atan2(inputDir.x, inputDir.z);
      let diff = targetAngle - this.mouse.rotation.y;
      if (diff > Math.PI) diff -= Math.PI * 2;
      if (diff < -Math.PI) diff += Math.PI * 2;
      this.mouse.rotation.y += diff * Math.min(1, dt * CONFIG.turnSmooth);
    }
  }

  _getCollisionCandidates() {
    if (typeof this.collisionQuery === 'function') {
      return this.collisionQuery() ?? [];
    }

    return [];
  }

  _resolveCollisions(groundY) {
    const colliders = this._getCollisionCandidates();
    if (!colliders.length) {
      return;
    }

    this.collider.setPosition(this.mouse.position);

    for (const collider of colliders) {
      const box = collider?.aabb;
      if (!box) continue;

      const isGroundSurface = (collider.type === 'surface' || collider.metadata?.runnable)
        && Math.abs(box.max.y - groundY) <= 0.05;
      if (isGroundSurface) {
        continue;
      }

      this.collider.resolveAgainstBox(box, this.velocity);
      this.mouse.position.copy(this.collider.position);
    }
  }

  _startSlide(direction) {
    this.sliding = true;
    this.slideTimer = CONFIG.slideDuration;
    this.slideCooldownTimer = CONFIG.slideCooldown;
    this.slideDirection.copy(direction).normalize();
    const hSpeed = Math.sqrt(this.velocity.x ** 2 + this.velocity.z ** 2);
    const slideSpd = Math.max(hSpeed, CONFIG.slideSpeed);
    this.velocity.x = this.slideDirection.x * slideSpd;
    this.velocity.z = this.slideDirection.z * slideSpd;
  }

  _updateSlide(dt) {
    if (this.slideCooldownTimer > 0) this.slideCooldownTimer -= dt;
    if (!this.sliding) return;

    this.slideTimer -= dt;
    if (this.slideTimer <= 0) {
      this.sliding = false;
      this.crouching = false;
      return;
    }

    const t = this.slideTimer / CONFIG.slideDuration;
    const spd = CONFIG.slideSpeed * t;
    this.velocity.x = this.slideDirection.x * spd;
    this.velocity.z = this.slideDirection.z * spd;
  }

  _updateStamina(dt) {
    if (this.sprinting) {
      this.stamina -= CONFIG.staminaDrainRate * dt;
      this.staminaRegenTimer = CONFIG.staminaRegenDelay;
      if (this.stamina <= 0) {
        this.stamina = 0;
        this.sprinting = false;
      }
    } else {
      this.staminaRegenTimer -= dt;
      if (this.staminaRegenTimer <= 0) {
        this.stamina = Math.min(this.stamina + CONFIG.staminaRegenRate * dt, CONFIG.maxStamina);
      }
    }
  }

  _updateAnimation(dt) {
    if (!this.mouse?.update) return;

    let state = 'idle';
    if (!this.alive) {
      state = 'death';
    } else if (!this.grounded) {
      state = 'jump';
    } else if (this.sprinting || this.sliding) {
      state = 'run';
    } else {
      const hSpeed = Math.sqrt(this.velocity.x ** 2 + this.velocity.z ** 2);
      if (hSpeed > 0.5) state = 'walk';
      else if (this.carriedItem) state = 'carry';
    }

    if (state !== this._prevAnimState) {
      this.mouse.setAnimationState(state);
      this._prevAnimState = state;
    }

    this.mouse.update(dt);
  }

  _updateCamera(dt) {
    if (!this.thirdPersonCamera) {
      this.mouse?.setOcclusionOpacity?.(1);
      return;
    }
    this.thirdPersonCamera.update(dt, this.mouse.position);
    this.mouse?.setOcclusionOpacity?.(this.thirdPersonCamera.getCharacterOpacity(0.2));
  }

  _handleAbilities() {
    if (this.keys[this.keyBindings.interact]) {
      this.keys[this.keyBindings.interact] = false;
      this.interact();
    }
    if (this.mouseButtons.right) {
      this.mouseButtons.right = false;
      this.squeak();
    }
    if (this.keys[this.keyBindings.drop]) {
      this.keys[this.keyBindings.drop] = false;
      this.dropItem();
    }
  }

  interact() {
    if (this.onInteract) this.onInteract(this);
  }

  squeak() {
    if (this.onSqueak) this.onSqueak(this);
  }

  carryItem(item) {
    if (this.carriedItem) return false;
    this.carriedItem = item;
    if (this.mouse?.pickupItem) this.mouse.pickupItem(item);
    return true;
  }

  dropItem() {
    if (!this.carriedItem) return null;
    const item = this.carriedItem;
    this.carriedItem = null;
    if (this.mouse?.dropItem) this.mouse.dropItem();
    return item;
  }

  takeDamage(amount = 1) {
    if (!this.alive) return;
    this.health -= amount;
    if (this.health <= 0) this.die();
  }

  die() {
    this.alive = false;
    this.health = 0;
    this.dropItem();
    if (this.onDeath) this.onDeath(this);
  }

  bump(target, direction) {
    if (!target?.velocity) return;
    const force = direction.clone().normalize().multiplyScalar(CONFIG.bumpForce);
    target.velocity.add(force);
  }

  get staminaPercent() {
    return this.stamina / CONFIG.maxStamina;
  }

  get healthPercent() {
    return this.health / CONFIG.maxHealth;
  }

  get position() {
    return this.mouse?.position ?? new THREE.Vector3();
  }

  dispose() {
    document.removeEventListener('keydown', this._onKeyDown);
    document.removeEventListener('keyup', this._onKeyUp);
    document.removeEventListener('mousedown', this._onMouseDown);
    document.removeEventListener('mouseup', this._onMouseUp);
    document.removeEventListener('contextmenu', this._onContextMenu);
    if (this.thirdPersonCamera) this.thirdPersonCamera.dispose();
  }
}
