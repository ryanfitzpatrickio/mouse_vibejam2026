import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { Predator } from './Predator.js';
import { assetUrl } from '../utils/assetUrl.js';

/**
 * Easter Bunny predator — a large mutant rabbit that patrols the kitchen,
 * charges at the player, and delivers punishing melee attacks.
 *
 * Available animations from bunny.glb:
 *   idle, idle-long, breathing-idle, walk, run,
 *   jump, jump-long, jump-attack,
 *   punch, swipe, roar, flex, death,
 *   turn-left-45, turn-left-45-alt,
 *   turn-right-45, turn-right-45-alt, turn-right-90
 */
export class Bunny extends Predator {
  constructor(options = {}) {
    super({
      name: 'EasterBunny',
      aggroRange: 10,
      attackRange: 2.2,
      leashRange: 22,
      moveSpeed: 2.8,
      chaseSpeed: 5.0,
      turnSpeed: 6,
      attackCooldown: 1.8,
      stunDuration: 1.2,
      alertDuration: 0.6,
      roarDuration: 1.8,
      damage: 1,
      knockbackForce: 7,
      maxHealth: 6,
      patrolRadius: 8,
      radius: 0.6,
      ...options,
    });

    // Track attack variety
    this._attackIndex = 0;
    this._idleVariantTimer = 0;
    this._turnAnimName = null;

    this.ready = this._load();
  }

  async _load() {
    const loader = new GLTFLoader();
    const gltf = await loader.loadAsync(assetUrl('bunny.glb'));
    this._attachModel(gltf, { height: 2.2, groundOffset: -0.7 });
    this.playAnimation('base-pose', { fadeIn: 0, loop: true });
    this.playAnimation('breathing-idle', { fadeIn: 0 });
    return this;
  }

  /** Map AI states to the bunny's specific animation clips. */
  _animateForState(state) {
    switch (state) {
      case 'idle':
        // Cycle through the idle family so every clip gets used.
        this._idleVariantTimer += 1;
        if (this._idleVariantTimer % 11 === 0) {
          this.playAnimation('base-pose');
        } else if (this._idleVariantTimer % 7 === 0) {
          this.playAnimation('idle-long');
        } else if (this._idleVariantTimer % 3 === 0) {
          this.playAnimation('breathing-idle');
        } else {
          this.playAnimation('idle');
        }
        break;

      case 'patrol':
        this.playAnimation('walk');
        break;

      case 'alert':
        this.playAnimation('flex');
        break;

      case 'roar':
        this.playAnimation('roar', { loop: false, clampWhenFinished: true });
        break;

      case 'chase':
        this.playAnimation('run');
        break;

      case 'attack': {
        // Cycle through attack animations for variety
        const attacks = ['punch', 'swipe', 'jump-attack'];
        const clip = attacks[this._attackIndex % attacks.length];
        this._attackIndex++;
        this.playAnimation(clip, { loop: false, clampWhenFinished: true });
        break;
      }

      case 'cooldown':
        this.playAnimation('idle-long');
        break;

      case 'stunned':
        this.playAnimation(this._attackIndex % 2 === 0 ? 'jump' : 'jump-long', {
          loop: false,
          clampWhenFinished: true,
        });
        break;

      case 'death':
        this.playAnimation('death', { loop: false, clampWhenFinished: true });
        break;

      default:
        this.playAnimation('idle');
    }
  }

  _faceDirection(dir, dt) {
    if (dir.lengthSq() < 0.0001) return;

    const targetAngle = Math.atan2(dir.x, dir.z);
    let diff = targetAngle - this.rotation.y;
    if (diff > Math.PI) diff -= Math.PI * 2;
    if (diff < -Math.PI) diff += Math.PI * 2;

    const turnAmount = Math.abs(diff);
    if (this.aiState === 'patrol' || this.aiState === 'chase' || this.aiState === 'alert') {
      if (turnAmount > 0.15) {
        const turnClip = diff > 0
          ? (turnAmount > 1.4 ? 'turn-right-90' : turnAmount > 0.8 ? 'turn-right-45-alt' : 'turn-right-45')
          : (turnAmount > 1.4 ? 'turn-right-90' : turnAmount > 0.8 ? 'turn-left-45-alt' : 'turn-left-45');
        if (this._turnAnimName !== turnClip) {
          this._turnAnimName = turnClip;
          this.playAnimation(turnClip, { fadeIn: 0.1, loop: false, clampWhenFinished: true });
        }
      } else {
        this._turnAnimName = null;
      }
    }

    this.rotation.y += diff * Math.min(1, dt * this.turnSpeed);
  }
}
