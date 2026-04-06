import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { Predator } from './Predator.js';
import { MouseEyeAtlasAnimator } from '../animation/MouseEyeAtlasAnimator.js';
import { assetUrl } from '../utils/assetUrl.js';

const EYE_PLACEMENT = Object.freeze({
  position: { x: 0, y: 0.1263, z: -0.0178 },
  rotation: { x: -2.3096, y: 0, z: 0 },
  scale: { x: 1.121, y: 1.121, z: 1.121 },
});

const AI_STATE_TO_EXPRESSION = Object.freeze({
  idle: 'idle',
  patrol: 'shifty',
  alert: 'surprised',
  chase: 'angry',
  attack: 'angry',
  cooldown: 'shifty',
  stunned: 'shocked',
  roar: 'angry',
  death: 'shocked',
});

export class Cat extends Predator {
  constructor(options = {}) {
    super({
      name: 'Cat',
      aggroRange: 12,
      attackRange: 1.8,
      leashRange: 24,
      moveSpeed: 3.5,
      chaseSpeed: 6.5,
      turnSpeed: 10,
      attackCooldown: 1.2,
      stunDuration: 1.0,
      alertDuration: 0.5,
      roarDuration: 1.2,
      damage: 1,
      knockbackForce: 8,
      maxHealth: 4,
      patrolRadius: 10,
      radius: 0.5,
      ...options,
    });

    this.eyeAnimator = new MouseEyeAtlasAnimator({
      stateToExpression: AI_STATE_TO_EXPRESSION,
    });

    this.ready = this._load();
  }

  async _load() {
    const loader = new GLTFLoader();
    const gltf = await loader.loadAsync(assetUrl('cat.glb'));
    this._attachModel(gltf, { height: 1.6, groundOffset: -0.1 });
    this.playAnimation('Idle', { fadeIn: 0, loop: true });

    try {
      await this.eyeAnimator.load();
      this._attachEyes();
    } catch {
      // eyes unavailable, continue without
    }

    return this;
  }

  _attachEyes() {
    if (!this.eyeAnimator?.loaded || !this.model) return;

    const head = this.model.getObjectByName('Head') ?? this.model;
    this.eyeAnimator.attach(head, {
      localOffset: new THREE.Vector3(EYE_PLACEMENT.position.x, EYE_PLACEMENT.position.y, EYE_PLACEMENT.position.z),
      localRotation: new THREE.Euler(EYE_PLACEMENT.rotation.x, EYE_PLACEMENT.rotation.y, EYE_PLACEMENT.rotation.z),
      localScale: new THREE.Vector3(EYE_PLACEMENT.scale.x, EYE_PLACEMENT.scale.y, EYE_PLACEMENT.scale.z),
      hideTargets: [],
    });
    this.eyeAnimator.setState(this.aiState, { immediate: true });
  }

  _animateForState(state) {
    this.eyeAnimator?.setState(state);

    switch (state) {
      case 'idle':
        this.playAnimation('Idle');
        break;

      case 'patrol':
        this.playAnimation('Walk');
        break;

      case 'alert':
        this.playAnimation('Idle Alert');
        break;

      case 'roar':
        this.playAnimation('Bite', { loop: false, clampWhenFinished: true });
        break;

      case 'chase':
        this.playAnimation('Run');
        break;

      case 'attack':
        this.playAnimation('Bite', { loop: false, clampWhenFinished: true });
        break;

      case 'cooldown':
        this.playAnimation('Idle');
        break;

      case 'stunned':
        this.playAnimation('Jump', { loop: false, clampWhenFinished: true });
        break;

      case 'death':
        this.playAnimation('Death', { loop: false, clampWhenFinished: true });
        break;

      default:
        this.playAnimation('Idle');
    }
  }

  update(dt) {
    super.update(dt);
    this.eyeAnimator?.update(dt);
  }
}
