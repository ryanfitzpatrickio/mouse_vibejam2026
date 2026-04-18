import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { assetUrl } from '../utils/assetUrl.js';

const STATE_TO_CLIP = Object.freeze({
  idle: 'idle',
  walk: 'walk',
  run: 'run',
  jump: 'jump',
  death: 'idle',
  grab: 'idle',
  carry: 'idle',
  chew: 'idle',
});

let _sharedGltfPromise = null;
function loadSharedGltf() {
  if (!_sharedGltfPromise) {
    const loader = new GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder);
    _sharedGltfPromise = loader.loadAsync(assetUrl('models/brain.glb'));
  }
  return _sharedGltfPromise;
}

/**
 * Visual-only hero avatar overlay. Tracks a player position and renders the
 * brain mesh with its own mixer; does not own physics/state.
 */
export class HeroBrain extends THREE.Group {
  constructor() {
    super();
    this.name = 'HeroBrain';
    this._ready = false;
    this._mixer = null;
    this._actions = new Map();
    this._current = null;
    this._state = 'idle';
    this.ready = this._load();
  }

  async _load() {
    const gltf = await loadSharedGltf();
    const avatar = cloneSkinned(gltf.scene);
    avatar.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true;
        child.frustumCulled = false;
      }
    });
    // Box3.setFromObject on a skinned mesh often returns its bind-pose AABB
    // which can be wildly off (e.g. 0.05 units when the source is in cm).
    // We measure it but clamp to a sane source range, then size to a target
    // WORLD height. The brain is parented under the mouse Group (scale 0.6),
    // so we compensate so the brain reads as a full-sized character.
    const box = new THREE.Box3().setFromObject(avatar);
    const measured = Math.max(0.001, box.max.y - box.min.y);
    /** Desired world-space height of the brain mesh, in meters. */
    const TARGET_WORLD_HEIGHT = 1.6;
    /** Mouse Group's uniform scale; brain is its child so we cancel it out. */
    const PARENT_SCALE_COMPENSATION = 1 / 0.6;
    const s = (TARGET_WORLD_HEIGHT / measured) * PARENT_SCALE_COMPENSATION;
    avatar.scale.setScalar(s);
    avatar.position.y = -box.min.y * s;
    this.add(avatar);
    this._avatar = avatar;

    this._mixer = new THREE.AnimationMixer(avatar);
    for (const clip of gltf.animations) {
      this._actions.set(clip.name, this._mixer.clipAction(clip));
    }
    this._play('idle', true);
    this._ready = true;
    return this;
  }

  setState(state) {
    if (state === this._state) return;
    this._state = state;
    const clipName = STATE_TO_CLIP[state] ?? 'idle';
    this._play(clipName);
  }

  _play(clipName, immediate = false) {
    const action = this._actions.get(clipName) ?? this._actions.get('idle');
    if (!action || action === this._current) return;
    const prev = this._current;
    this._current = action;
    action.reset();
    action.enabled = true;
    action.setEffectiveTimeScale(1);
    action.setEffectiveWeight(1);
    action.play();
    if (prev && !immediate) {
      prev.crossFadeTo(action, 0.18, true);
    } else if (prev) {
      prev.stop();
    }
  }

  update(dt) {
    this._mixer?.update(dt);
  }

  dispose() {
    this.parent?.remove(this);
    this._actions.clear();
    this._mixer = null;
  }
}
