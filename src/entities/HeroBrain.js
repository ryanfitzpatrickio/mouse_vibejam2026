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
    // Measure only Mesh geometry — skinned models often include bones/empties
    // at extreme positions (e.g. y=11782) which poison Box3.setFromObject and
    // make the auto-fit divide by something thousands of times too large.
    const box = new THREE.Box3();
    const meshBox = new THREE.Box3();
    avatar.updateMatrixWorld(true);
    avatar.traverse((child) => {
      if (!child.isMesh || !child.geometry) return;
      const geo = child.geometry;
      if (!geo.boundingBox) geo.computeBoundingBox();
      meshBox.copy(geo.boundingBox).applyMatrix4(child.matrixWorld);
      box.union(meshBox);
    });
    if (box.isEmpty()) box.setFromObject(avatar);
    const measuredH = Math.max(0.001, box.max.y - box.min.y);
    /** Desired world-space height of the brain mesh, in meters. */
    const TARGET_WORLD_HEIGHT = 0.6;
    /** Mouse Group's uniform scale; brain is its child so we cancel it out. */
    const PARENT_SCALE = 0.6;
    const s = TARGET_WORLD_HEIGHT / (measuredH * PARENT_SCALE);
    avatar.scale.setScalar(s);
    avatar.position.y = -box.min.y * s;
    console.log(
      `[HeroBrain] measured bbox height: ${measuredH.toFixed(2)}, `
      + `target world height: ${TARGET_WORLD_HEIGHT}m, applied scale: ${s.toExponential(3)}`,
    );
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
