import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import {
  createDefaultQueryFilter,
  createFindNearestPolyResult,
  findNearestPoly,
  findPath,
} from 'navcat';
import { Predator, AI_STATE } from './Predator.js';
import { MouseEyeAtlasAnimator } from '../animation/MouseEyeAtlasAnimator.js';
import { attachEyesToModel } from '../data/attachEyes.js';
import { assetUrl } from '../utils/assetUrl.js';
import { getAudioManager } from '../audio/AudioManager.js';
import kitchenRoombaNavMesh from '../../shared/kitchen-roomba-navmesh.generated.js';
import { NAV_AGENT_CONFIGS } from '../../shared/navConfig.js';

const ROOMBA_HALF_EXTENTS = NAV_AGENT_CONFIGS.roomba.queryHalfExtents;
const ROOMBA_FILTER = createDefaultQueryFilter();
const _navSampleScratch = createFindNearestPolyResult();
const _tmpDir = new THREE.Vector3();

const HUMAN_AI_TO_EXPRESSION = Object.freeze({
  idle: 'idle',
  patrol: 'idle',
  alert: 'surprised',
  roar: 'shocked',
  cooldown: 'shifty',
});

/**
 * Human predator (cop). Wanders the kitchen and, upon spotting a rat,
 * plays a reaction animation (meme.fbx) in place rather than giving chase.
 *
 * Animation clip names come from the FBX stems via convert-cop-fbx.mjs.
 */
export class Human extends Predator {
  constructor(options = {}) {
    super({
      name: 'Human',
      aggroRange: 8,
      attackRange: 0, // never attacks
      leashRange: 24,
      moveSpeed: 1.6,
      chaseSpeed: 0,
      turnSpeed: 5,
      alertDuration: 0.3,
      roarDuration: 30.0, // full length of the meme reaction
      attackCooldown: 2.5,
      maxHealth: 9999, // non-combatant
      patrolRadius: 7,
      radius: 2.0,
      height: 9.0,
      ...options,
    });

    this._turnAnimName = null;
    this._navPath = [];
    this._navPathIndex = 0;
    this._navRepathTimer = 0;
    this._navStuckTimer = 0;
    this._navLastPos = new THREE.Vector3();
    this.eyeAnimator = new MouseEyeAtlasAnimator({
      stateToExpression: HUMAN_AI_TO_EXPRESSION,
    });
    this.ready = this._load();
  }

  async _load() {
    const loader = new GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder);
    const gltf = await loader.loadAsync(assetUrl('models/cop.glb'));
    this._attachModel(gltf, { height: 9.0, groundOffset: -1.2 });
    this._groundedYOffset = this.model.position.y;
    this._memeYOffset = this.model.position.y + 1.2; // cancel the -1.2 ground offset
    this._hipBone = null;
    this.model.traverse((o) => {
      if (!this._hipBone && o.isBone && /hips?$/i.test(o.name)) this._hipBone = o;
    });
    this.playAnimation('idle', { fadeIn: 0, loop: true });

    try {
      await this.eyeAnimator.load();
      this._eyeUnsub = attachEyesToModel('human', this.eyeAnimator, this.model);
      this.eyeAnimator.setState('idle', { immediate: true });
    } catch {
      /* eyes unavailable, keep going */
    }

    return this;
  }

  update(dt, ...rest) {
    super.update?.(dt, ...rest);
    this.eyeAnimator?.update(dt);
    this.eyeAnimator?.setState(this.aiState);
  }

  dispose() {
    this._eyeUnsub?.();
    this._eyeUnsub = null;
    this.eyeAnimator?.dispose?.();
    super.dispose?.();
  }

  /** Rat spotted → play the meme reaction + spatial audio, unless already playing. */
  _enterAlert() {
    if (this.aiState === AI_STATE.ROAR) return; // already memeing
    this.aiState = AI_STATE.ROAR;
    this.aiTimer = this.roarDuration;
    this._animateForState('roar');
    this._faceTarget(100);
    this._captureMemeStartHip();
    getAudioManager().playSoundAtPosition('meme', this.position.clone());
  }

  _captureMemeStartHip() {
    if (!this._hipBone) return;
    this._memeStartHipWorld = new THREE.Vector3();
    this._hipBone.updateWorldMatrix(true, false);
    this._memeStartHipWorld.setFromMatrixPosition(this._hipBone.matrixWorld);
  }

  /**
   * Commit the mocap root-motion drift to the predator's group position so
   * the character stays wherever the animation ended.
   */
  _commitMemeDrift() {
    if (!this._hipBone || !this._memeStartHipWorld) return;
    const end = new THREE.Vector3();
    this._hipBone.updateWorldMatrix(true, false);
    end.setFromMatrixPosition(this._hipBone.matrixWorld);
    const dx = end.x - this._memeStartHipWorld.x;
    const dz = end.z - this._memeStartHipWorld.z;
    this._memeStartHipWorld = null;

    // Sweep the drift vector and bail out at the first step that would land
    // inside a wall, so the human never commits into an unrecoverable spot.
    const startX = this.position.x;
    const startZ = this.position.z;
    const STEPS = 8;
    let safeT = 0;
    for (let i = 1; i <= STEPS; i++) {
      const t = i / STEPS;
      if (this._positionBlocked(startX + dx * t, startZ + dz * t)) break;
      safeT = t;
    }
    this.position.x = startX + dx * safeT;
    this.position.z = startZ + dz * safeT;
  }

  _sampleNavPoint(x, y, z) {
    findNearestPoly(
      _navSampleScratch,
      kitchenRoombaNavMesh,
      [x, y, z],
      ROOMBA_HALF_EXTENTS,
      ROOMBA_FILTER,
    );
    if (!_navSampleScratch.success) return null;
    return {
      x: _navSampleScratch.position[0],
      y: _navSampleScratch.position[1],
      z: _navSampleScratch.position[2],
    };
  }

  _pickPatrolTarget() {
    const r = this.patrolRadius;
    for (let i = 0; i < 8; i++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = 1.5 + Math.random() * (r - 1.5);
      const tx = this.spawnPoint.x + Math.cos(angle) * dist;
      const tz = this.spawnPoint.z + Math.sin(angle) * dist;
      const p = this._sampleNavPoint(tx, this.spawnPoint.y, tz);
      if (p) {
        this.patrolTarget.set(p.x, p.y, p.z);
        this._buildNavPath();
        return;
      }
    }
    this.patrolTarget.copy(this.spawnPoint);
    this._navPath = [];
    this._navPathIndex = 0;
  }

  _buildNavPath() {
    const start = this._sampleNavPoint(this.position.x, this.position.y, this.position.z);
    const end = this._sampleNavPoint(this.patrolTarget.x, this.patrolTarget.y, this.patrolTarget.z);
    if (!start || !end) {
      this._navPath = [];
      this._navPathIndex = 0;
      return;
    }
    const result = findPath(
      kitchenRoombaNavMesh,
      [start.x, start.y, start.z],
      [end.x, end.y, end.z],
      ROOMBA_HALF_EXTENTS,
      ROOMBA_FILTER,
    );
    if (!result.success || !Array.isArray(result.path) || result.path.length === 0) {
      this._navPath = [];
      this._navPathIndex = 0;
      return;
    }
    this._navPath = result.path.map((pt) => ({
      x: pt.position[0],
      y: pt.position[1],
      z: pt.position[2],
    }));
    this._navPathIndex = this._navPath.length > 1 ? 1 : 0;
    this._navRepathTimer = 2.5;
    this._navStuckTimer = 0;
    this._navLastPos.copy(this.position);
  }

  _updatePatrol(dt, distToPlayer) {
    this._animateForState('patrol');

    if (distToPlayer < this.aggroRange) {
      this._enterAlert();
      return;
    }

    this._navRepathTimer -= dt;

    const haveWaypoint = this._navPath.length > 0
      && this._navPathIndex < this._navPath.length;

    if (!haveWaypoint) {
      if (this._navRepathTimer <= 0) {
        this._buildNavPath();
      }
      if (this._navPath.length === 0 || this._navPathIndex >= this._navPath.length) {
        this.aiState = AI_STATE.IDLE;
        this.aiTimer = this.patrolWaitMin + Math.random() * (this.patrolWaitMax - this.patrolWaitMin);
        return;
      }
    }

    const wp = this._navPath[this._navPathIndex];
    const dir = _tmpDir.set(wp.x - this.position.x, 0, wp.z - this.position.z);
    const dist = dir.length();

    if (dist < 0.6) {
      this._navPathIndex += 1;
      if (this._navPathIndex >= this._navPath.length) {
        const finalDx = this.patrolTarget.x - this.position.x;
        const finalDz = this.patrolTarget.z - this.position.z;
        if (finalDx * finalDx + finalDz * finalDz < 0.25) {
          this.aiState = AI_STATE.IDLE;
          this.aiTimer = this.patrolWaitMin + Math.random() * (this.patrolWaitMax - this.patrolWaitMin);
          return;
        }
        this._buildNavPath();
      }
      return;
    }

    dir.normalize();
    this._moveToward(dir, this.moveSpeed, dt);
    this._faceDirection(dir, dt);

    // Repath if stuck (not progressing toward next waypoint).
    const moved = this._navLastPos.distanceToSquared(this.position);
    this._navLastPos.copy(this.position);
    if (moved < (this.moveSpeed * dt * 0.3) ** 2) {
      this._navStuckTimer += dt;
      if (this._navStuckTimer > 0.8) {
        this._navStuckTimer = 0;
        this._buildNavPath();
      }
    } else {
      this._navStuckTimer = 0;
    }
  }

  _positionBlocked(x, z) {
    if (!this.collisionQuery) return false;
    const colliders = this.collisionQuery();
    const r = this.radius;
    for (const c of colliders) {
      if (c.type === 'surface' || c.type === 'loot') continue;
      const { min, max } = c.aabb;
      if (this.position.y > max.y || this.position.y + this.height < min.y) continue;
      const cx = Math.max(min.x, Math.min(x, max.x));
      const cz = Math.max(min.z, Math.min(z, max.z));
      const dx = x - cx;
      const dz = z - cz;
      if (dx * dx + dz * dz < r * r) return true;
    }
    return false;
  }

  /** While the meme plays, freeze the predator in place (no turn, no translation). */
  _updateRoar(dt) {
    if (this.aiTimer <= 0) {
      this._commitMemeDrift();
      this.aiState = AI_STATE.COOLDOWN;
      this.aiTimer = this.attackCooldown;
    }
  }

  _updateCooldown(dt, distToPlayer) {
    this._animateForState('cooldown');
    if (this.aiTimer <= 0) {
      this._enterPatrol();
    }
  }

  _animateForState(state) {
    if (this.model) {
      this.model.position.y = state === 'roar'
        ? (this._memeYOffset ?? this.model.position.y)
        : (this._groundedYOffset ?? this.model.position.y);
    }
    switch (state) {
      case 'idle':
        this.playAnimation('idle');
        break;
      case 'patrol':
        this.playAnimation('walk');
        break;
      case 'roar':
        this.playAnimation('meme', { loop: false, clampWhenFinished: true });
        break;
      case 'cooldown':
        this.playAnimation('idle');
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
    if (this.aiState === AI_STATE.PATROL && turnAmount > 0.2) {
      const turnClip = diff > 0
        ? (turnAmount > 1.4 ? 'turn-right-90' : 'turn-right-45')
        : 'turn-left-45';
      if (this._turnAnimName !== turnClip && this.actions[turnClip]) {
        this._turnAnimName = turnClip;
        this.playAnimation(turnClip, { fadeIn: 0.1, loop: false, clampWhenFinished: true });
      }
    } else {
      this._turnAnimName = null;
    }

    this.rotation.y += diff * Math.min(1, dt * this.turnSpeed);
  }
}
