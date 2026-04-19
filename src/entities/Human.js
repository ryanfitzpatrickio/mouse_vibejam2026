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
const _humanSpatialSoundPos = new THREE.Vector3();

// Foot IK scratch vectors/quats (reused each frame to avoid allocations).
const _ikRootPos = new THREE.Vector3();
const _ikMidPos = new THREE.Vector3();
const _ikEndPos = new THREE.Vector3();
const _ikTarget = new THREE.Vector3();
const _ikPole = new THREE.Vector3();
const _ikA = new THREE.Vector3();
const _ikB = new THREE.Vector3();
const _ikC = new THREE.Vector3();
const _ikQuat = new THREE.Quaternion();
const _ikQuat2 = new THREE.Quaternion();
const _ikParentQuat = new THREE.Quaternion();
const _ikNodeWorldQuat = new THREE.Quaternion();
const _ikScaleScratch = new THREE.Vector3();
const _ikForward = new THREE.Vector3();

// Snap begins when the anim-driven ankle is below (rest + this), and ramps in
// over a short distance so grounding feels like contact rather than a pop.
const FOOT_IK_SNAP_ENTER = 0.08;
const FOOT_IK_SNAP_BLEND = 0.12;

function _applyWorldRotation(node, worldRotQuat) {
  // Replace node's world rotation with (worldRotQuat * currentWorldRotation).
  node.updateWorldMatrix(true, false);
  node.matrixWorld.decompose(_ikA, _ikNodeWorldQuat, _ikScaleScratch);
  _ikQuat2.copy(worldRotQuat).multiply(_ikNodeWorldQuat);
  if (node.parent) {
    node.parent.updateWorldMatrix(true, false);
    node.parent.matrixWorld.decompose(_ikB, _ikParentQuat, _ikScaleScratch);
    _ikParentQuat.invert();
    node.quaternion.copy(_ikParentQuat).multiply(_ikQuat2);
  } else {
    node.quaternion.copy(_ikQuat2);
  }
  node.updateWorldMatrix(false, true);
}

function _twoBoneIK(root, mid, end, targetWorld, poleWorld) {
  root.updateWorldMatrix(true, true);
  _ikRootPos.setFromMatrixPosition(root.matrixWorld);
  _ikMidPos.setFromMatrixPosition(mid.matrixWorld);
  _ikEndPos.setFromMatrixPosition(end.matrixWorld);

  const L1 = _ikRootPos.distanceTo(_ikMidPos);
  const L2 = _ikMidPos.distanceTo(_ikEndPos);
  if (L1 < 1e-4 || L2 < 1e-4) return;
  const maxLen = L1 + L2 - 1e-3;
  const minLen = Math.max(1e-3, Math.abs(L1 - L2) + 1e-3);
  const rawDist = _ikA.subVectors(targetWorld, _ikRootPos).length();
  const targetDist = Math.max(minLen, Math.min(maxLen, rawDist));

  // Desired interior knee angle (law of cosines).
  const cosK = (L1 * L1 + L2 * L2 - targetDist * targetDist) / (2 * L1 * L2);
  const desiredKnee = Math.acos(Math.max(-1, Math.min(1, cosK)));

  // Current interior knee angle.
  _ikA.subVectors(_ikRootPos, _ikMidPos).normalize(); // mid→root
  _ikB.subVectors(_ikEndPos, _ikMidPos).normalize();  // mid→end
  const curKnee = Math.acos(Math.max(-1, Math.min(1, _ikA.dot(_ikB))));

  // Bend axis perpendicular to leg plane, biased toward pole so bend direction
  // matches the animator's intent (knee forward).
  _ikA.subVectors(_ikMidPos, _ikRootPos);
  _ikB.subVectors(_ikEndPos, _ikMidPos);
  _ikC.crossVectors(_ikA, _ikB);
  if (_ikC.lengthSq() < 1e-6) {
    // Leg is nearly straight — fall back to a perpendicular biased by pole.
    _ikA.subVectors(_ikEndPos, _ikRootPos).normalize();
    _ikB.subVectors(poleWorld, _ikRootPos);
    _ikB.addScaledVector(_ikA, -_ikB.dot(_ikA));
    if (_ikB.lengthSq() < 1e-6) _ikB.set(0, 0, 1);
    _ikB.normalize();
    _ikC.crossVectors(_ikA, _ikB);
  }
  _ikC.normalize();
  _ikA.subVectors(poleWorld, _ikMidPos);
  if (_ikC.dot(_ikA) < 0) _ikC.negate();

  const deltaKnee = desiredKnee - curKnee;
  _ikQuat.setFromAxisAngle(_ikC, deltaKnee);
  _applyWorldRotation(mid, _ikQuat);

  // Re-align root so the end bone points at the target.
  root.updateWorldMatrix(true, true);
  _ikEndPos.setFromMatrixPosition(end.matrixWorld);
  _ikA.subVectors(_ikEndPos, _ikRootPos).normalize();
  _ikB.subVectors(targetWorld, _ikRootPos).normalize();
  _ikQuat.setFromUnitVectors(_ikA, _ikB);
  _applyWorldRotation(root, _ikQuat);
}

const HUMAN_AI_TO_EXPRESSION = Object.freeze({
  idle: 'idle',
  patrol: 'idle',
  alert: 'surprised',
  roar: 'shocked',
  cooldown: 'shifty',
});

const PLAYABLE_TURN_ENTER = 0.42;
const PLAYABLE_TURN_EXIT = 0.18;
const PLAYABLE_DIRECTION_ENTER = 0.36;
const PLAYABLE_DIRECTION_EXIT = 0.16;
const PLAYABLE_MIN_CLIP_HOLD = 0.18;
const PLAYABLE_ACTION_TIME_SCALE = 0.5;

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
    this._memeStartHipWorld = new THREE.Vector3();
    this._memeEndHipWorld = new THREE.Vector3();
    this._memeHipCaptureActive = false;
    this._navPath = [];
    this._navPathIndex = 0;
    this._navRepathTimer = 0;
    this._navStuckTimer = 0;
    this._navLastPos = new THREE.Vector3();
    this.playerControlled = false;
    this._playableAnimState = 'idle';
    this._playableTurnAnim = null;
    this._playableMoveDirection = 'straight';
    this._playableTurnDirection = null;
    this._playableClipAge = 0;
    this._playableMemeEmoteActive = false;
    this._playableMemeEmoteTimer = 0;
    this.eyeAnimator = new MouseEyeAtlasAnimator({
      stateToExpression: HUMAN_AI_TO_EXPRESSION,
    });
    this.ready = this._load();
  }

  async _load() {
    const loader = new GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder);
    const gltf = await loader.loadAsync(assetUrl('models/cop.glb'));
    this._attachModel(gltf, { height: 9.0, groundOffset: -0.8 });
    this._groundedYOffset = this.model.position.y;
    this._memeYOffset = this.model.position.y;
    this._hipBone = null;
    this._legBones = { left: null, right: null };
    this._footRestY = null;
    this.footIKEnabled = true;
    this.model.traverse((o) => {
      if (!o.isBone) return;
      const n = o.name.toLowerCase();
      if (!this._hipBone && /hips?$/.test(n)) this._hipBone = o;
      else if (/leftupleg$/.test(n)) (this._legBones.left ??= {}).root = o;
      else if (/leftleg$/.test(n)) (this._legBones.left ??= {}).mid = o;
      else if (/leftfoot$/.test(n)) (this._legBones.left ??= {}).end = o;
      else if (/rightupleg$/.test(n)) (this._legBones.right ??= {}).root = o;
      else if (/rightleg$/.test(n)) (this._legBones.right ??= {}).mid = o;
      else if (/rightfoot$/.test(n)) (this._legBones.right ??= {}).end = o;
    });
    const lOK = this._legBones.left?.root && this._legBones.left?.mid && this._legBones.left?.end;
    const rOK = this._legBones.right?.root && this._legBones.right?.mid && this._legBones.right?.end;
    if (!lOK) this._legBones.left = null;
    if (!rOK) this._legBones.right = null;
    this.playAnimation('idle', { fadeIn: 0, loop: true });
    // Sample the bind-pose ankle Y (world) so we know where feet should rest
    // when the character is planted on flat ground.
    this.model.updateMatrixWorld(true);
    const _restSample = new THREE.Vector3();
    let restSum = 0;
    let restCount = 0;
    if (this._legBones.left) {
      _restSample.setFromMatrixPosition(this._legBones.left.end.matrixWorld);
      restSum += _restSample.y;
      restCount += 1;
    }
    if (this._legBones.right) {
      _restSample.setFromMatrixPosition(this._legBones.right.end.matrixWorld);
      restSum += _restSample.y;
      restCount += 1;
    }
    if (restCount > 0) this._footRestY = (restSum / restCount) - this.position.y;

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
    if (this.playerControlled) {
      this._playableClipAge += dt;
      if (this._playableMemeEmoteActive) {
        this._playableMemeEmoteTimer -= dt;
        if (this._playableMemeEmoteTimer <= 0) {
          this.cancelPlayableMemeEmote();
        }
      }
      this.mixer?.update(dt);
      this._applyFootIK();
      this.eyeAnimator?.update(dt);
      this.eyeAnimator?.setState('alert');
      return;
    }
    super.update?.(dt, ...rest);
    this._applyFootIK();
    this.eyeAnimator?.update(dt);
    this.eyeAnimator?.setState(this.aiState);
  }

  _applyFootIK() {
    if (!this.footIKEnabled || this._footRestY == null) return;
    // Skip while lying on the floor for the meme reaction — the mocap is the
    // pose we want, no need to fight it with IK.
    if (this.aiState === AI_STATE.ROAR || this._playableMemeEmoteActive) return;
    if (!this._legBones.left && !this._legBones.right) return;

    this.updateMatrixWorld(true);

    const groundAnkleY = this.position.y + this._footRestY;
    _ikForward.set(Math.sin(this.rotation.y), 0, Math.cos(this.rotation.y));

    for (const leg of [this._legBones.left, this._legBones.right]) {
      if (!leg) continue;
      leg.end.updateWorldMatrix(true, false);
      _ikEndPos.setFromMatrixPosition(leg.end.matrixWorld);

      // Only correct when the ankle is at or below rest height. Above that we
      // assume the foot is mid-swing and leave the animation alone.
      const dropBelow = groundAnkleY - _ikEndPos.y;
      if (dropBelow <= -FOOT_IK_SNAP_ENTER) continue;

      // Blend in over a small band so the snap ramps in instead of popping.
      const blend = Math.max(0, Math.min(1, (dropBelow + FOOT_IK_SNAP_ENTER) / FOOT_IK_SNAP_BLEND));
      if (blend <= 0) continue;

      _ikTarget.set(_ikEndPos.x, _ikEndPos.y + (groundAnkleY - _ikEndPos.y) * blend, _ikEndPos.z);

      // Pole in front of the knee so the leg bends forward.
      leg.mid.updateWorldMatrix(true, false);
      _ikPole.setFromMatrixPosition(leg.mid.matrixWorld);
      _ikPole.addScaledVector(_ikForward, 2.0);

      _twoBoneIK(leg.root, leg.mid, leg.end, _ikTarget, _ikPole);
    }
  }

  setPlayerControlled(active) {
    const next = !!active;
    if (this.playerControlled === next) return;
    this.playerControlled = next;
    this.velocity.set(0, 0, 0);
    if (next) {
      this.aiState = AI_STATE.IDLE;
      this.aiTimer = 0;
      this._memeHipCaptureActive = false;
      this._playableAnimState = '';
      this._playableTurnAnim = null;
      this._playableMoveDirection = 'straight';
      this._playableTurnDirection = null;
      this._playableClipAge = PLAYABLE_MIN_CLIP_HOLD;
      this._playableMemeEmoteActive = false;
      this._playableMemeEmoteTimer = 0;
      if (this.model) {
        this.model.position.y = this._groundedYOffset ?? this.model.position.y;
      }
      this.setPlayableAnimation('idle', { immediate: true });
    } else {
      this._playableAnimState = '';
      this._playableTurnAnim = null;
      this._playableMoveDirection = 'straight';
      this._playableTurnDirection = null;
      this._playableClipAge = PLAYABLE_MIN_CLIP_HOLD;
      this.cancelPlayableMemeEmote();
      this._resetPlayableActionSpeeds();
      this.aiState = AI_STATE.IDLE;
      this.aiTimer = 0.5;
      this._animateForState('idle');
      this._pickPatrolTarget();
    }
  }

  setPlayableAnimation(
    state,
    {
      immediate = false,
      turn = 0,
      backward = false,
      moveDirection = 'straight',
      turnDirection = null,
    } = {},
  ) {
    if (this._playableMemeEmoteActive) return;

    const baseState = state === 'jump'
      ? 'jump'
      : state === 'run'
        ? 'run'
        : state === 'walk'
          ? 'walk'
          : 'idle';

    if (baseState === 'idle') {
      const nextTurnDirection = turnDirection
        ?? (turn > PLAYABLE_TURN_ENTER
          ? 'right'
          : turn < -PLAYABLE_TURN_ENTER
            ? 'left'
            : Math.abs(turn) < PLAYABLE_TURN_EXIT
              ? null
              : this._playableTurnDirection);
      this._playableTurnDirection = nextTurnDirection;
    } else {
      this._playableTurnDirection = null;
    }

    let nextMoveDirection = moveDirection === 'left' || moveDirection === 'right'
      ? moveDirection
      : 'straight';
    if (Math.abs(turn) > PLAYABLE_DIRECTION_ENTER) {
      nextMoveDirection = turn > 0 ? 'right' : 'left';
    } else if (Math.abs(turn) < PLAYABLE_DIRECTION_EXIT && moveDirection === 'straight') {
      nextMoveDirection = 'straight';
    }
    if (baseState === 'idle' || baseState === 'jump' || backward) {
      nextMoveDirection = 'straight';
    }
    this._playableMoveDirection = nextMoveDirection;

    const turnClip = baseState === 'idle' && this._playableTurnDirection
      ? (this._playableTurnDirection === 'right' ? 'injured-turn-right' : 'injured-turn-left')
      : baseState === 'run' && nextMoveDirection === 'right'
        ? 'injured-run-right-turn'
        : baseState === 'run' && nextMoveDirection === 'left'
          ? 'injured-run-left-turn'
          : baseState === 'walk' && nextMoveDirection === 'right'
            ? 'injured-walk-right-turn'
            : baseState === 'walk' && nextMoveDirection === 'left'
              ? 'injured-walk-left-turn'
              : null;
    const clip = turnClip
      ?? ({
        idle: 'injured-hurting-idle',
        walk: backward ? 'injured-walk-backwards' : 'injured-walk',
        run: backward ? 'injured-run-backwards' : 'injured-run',
        jump: 'injured-run-jump',
      }[baseState] ?? 'injured-hurting-idle');
    const fallback = {
      'injured-hurting-idle': 'injured-stumble-idle',
      'injured-stumble-idle': 'injured-wave-idle',
      'injured-wave-idle': 'idle',
      'injured-walk': 'walk',
      'injured-run': 'walk',
      'injured-run-jump': 'jump attack',
      'injured-walk-left-turn': 'turn-left-45',
      'injured-walk-right-turn': 'turn-right-45',
      'injured-run-left-turn': 'turn-left-45',
      'injured-run-right-turn': 'turn-right-45',
      'injured-walk-backwards': 'walk',
      'injured-run-backwards': 'walk',
      'injured-backwards-turn-left': 'turn-left-45',
      'injured-backwards-turn-right': 'turn-right-45',
      'injured-run-backwards-left-turn': 'turn-left-45',
      'injured-run-backwards-right-turn': 'turn-right-45',
      'injured-turn-left': 'turn-left-45',
      'injured-turn-right': 'turn-right-45',
    }[clip] ?? 'idle';
    const name = this.actions[clip] ? clip : fallback;
    if (name === this._playableAnimState && turnClip === this._playableTurnAnim) return;
    if (!immediate && this._playableClipAge < PLAYABLE_MIN_CLIP_HOLD && baseState !== 'jump') return;
    this._playableAnimState = name;
    this._playableTurnAnim = turnClip;
    this._playableClipAge = 0;
    this._playPlayableClip(name, {
      fadeIn: immediate ? 0 : 0.24,
      loop: baseState !== 'jump',
      clampWhenFinished: baseState === 'jump',
    });
  }

  _playPlayableClip(name, { fadeIn = 0.24, loop = true, clampWhenFinished = false } = {}) {
    if (name === this.currentAnimName) return;
    const next = this.actions[name];
    if (!next) return;

    const previous = this.currentAction;
    next.enabled = true;
    next.reset();
    next.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce);
    next.clampWhenFinished = clampWhenFinished;
    next.setEffectiveTimeScale(PLAYABLE_ACTION_TIME_SCALE);
    next.setEffectiveWeight(1);
    next.play();

    if (previous && previous !== next) {
      if (fadeIn <= 0) {
        previous.stop();
      } else {
        previous.fadeOut(fadeIn);
        next.crossFadeFrom(previous, fadeIn, false);
      }
    }

    this.currentAction = next;
    this.currentAnimName = name;
  }

  _resetPlayableActionSpeeds() {
    for (const action of Object.values(this.actions ?? {})) {
      action?.setEffectiveTimeScale?.(1);
    }
  }

  playPlayableMemeEmote() {
    if (!this.playerControlled || this._playableMemeEmoteActive) return false;
    const action = this.actions?.meme;
    if (!action) return false;
    this._playableMemeEmoteActive = true;
    this._playableMemeEmoteTimer = this.roarDuration;
    if (this.model) {
      this.model.position.y = this._memeYOffset ?? this.model.position.y;
    }
    this._resetPlayableActionSpeeds();
    this.playAnimation('meme', { fadeIn: 0.1, loop: false, clampWhenFinished: true });
    this.actions?.meme?.setEffectiveTimeScale?.(1);
    getAudioManager().playSoundAtPosition('meme', _humanSpatialSoundPos.copy(this.position));
    return true;
  }

  cancelPlayableMemeEmote() {
    if (!this._playableMemeEmoteActive) return;
    this._playableMemeEmoteActive = false;
    this._playableMemeEmoteTimer = 0;
    if (this.model) {
      this.model.position.y = this._groundedYOffset ?? this.model.position.y;
    }
    if (this.playerControlled) {
      this._playableAnimState = '';
      this._playableTurnAnim = null;
      this._playableClipAge = PLAYABLE_MIN_CLIP_HOLD;
      this.setPlayableAnimation('idle', { immediate: true });
    }
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
    getAudioManager().playSoundAtPosition('meme', _humanSpatialSoundPos.copy(this.position));
  }

  _captureMemeStartHip() {
    if (!this._hipBone) return;
    this._hipBone.updateWorldMatrix(true, false);
    this._memeStartHipWorld.setFromMatrixPosition(this._hipBone.matrixWorld);
    this._memeHipCaptureActive = true;
  }

  /**
   * Commit the mocap root-motion drift to the predator's group position so
   * the character stays wherever the animation ended.
   */
  _commitMemeDrift() {
    if (!this._hipBone || !this._memeHipCaptureActive) return;
    this._hipBone.updateWorldMatrix(true, false);
    this._memeEndHipWorld.setFromMatrixPosition(this._hipBone.matrixWorld);
    const dx = this._memeEndHipWorld.x - this._memeStartHipWorld.x;
    const dz = this._memeEndHipWorld.z - this._memeStartHipWorld.z;
    this._memeHipCaptureActive = false;

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
