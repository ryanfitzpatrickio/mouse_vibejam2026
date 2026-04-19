import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { MouseEyeAtlasAnimator } from '../animation/MouseEyeAtlasAnimator.js';
import { attachEyesToModel } from '../data/attachEyes.js';
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

/**
 * Registry of selectable hero avatars. Add a new entry + ship a matching
 * `assets/source/<key>.fbx` (with a converter script that emits
 * `public/models/<key>.glb`) and the server will pick it on activation.
 */
export const HERO_AVATARS = Object.freeze({
  brain: { modelPath: 'models/brain.glb', targetWorldHeight: 0.6 },
  jerry: { modelPath: 'models/jerry.glb', targetWorldHeight: 0.6 },
  gus: { modelPath: 'models/gus.glb', targetWorldHeight: 0.6 },
  speedy: { modelPath: 'models/speedy.glb', targetWorldHeight: 0.6 },
});

/** Score-based random hero pool — gus/speedy are earned via collection, not the random roll. */
export const SCORE_HERO_AVATAR_KEYS = Object.freeze(['brain', 'jerry']);
/** Collection-unlock heroes; claim is global first-come per session. */
export const UNLOCK_HERO_AVATAR_KEYS = Object.freeze(['gus', 'speedy']);

export const HERO_AVATAR_KEYS = Object.freeze(Object.keys(HERO_AVATARS));

/** GLTF loads are cached per modelPath so multiple players share the parsed asset. */
const _gltfCache = new Map();
function loadHeroGltf(modelPath) {
  if (!_gltfCache.has(modelPath)) {
    const loader = new GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder);
    _gltfCache.set(modelPath, loader.loadAsync(assetUrl(modelPath)));
  }
  return _gltfCache.get(modelPath);
}

/**
 * Visual-only hero avatar overlay. Tracks a player position and renders the
 * chosen hero mesh with its own mixer; does not own physics/state.
 */
export class HeroAvatar extends THREE.Group {
  /**
   * @param {keyof typeof HERO_AVATARS} modelKey
   */
  constructor(modelKey = 'brain') {
    super();
    this.modelKey = HERO_AVATARS[modelKey] ? modelKey : 'brain';
    this.name = `HeroAvatar:${this.modelKey}`;
    this._ready = false;
    this._mixer = null;
    this._actions = new Map();
    this._current = null;
    this._state = 'idle';
    this.eyeAnimator = null;
    this._eyeUnsub = null;
    this.ready = this._load();
  }

  async _load() {
    const def = HERO_AVATARS[this.modelKey];
    const gltf = await loadHeroGltf(def.modelPath);
    const avatar = cloneSkinned(gltf.scene);
    avatar.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true;
        child.frustumCulled = false;
      }
    });
    // Measure only Mesh geometry — skinned models often include bones/empties
    // at extreme positions which poison Box3.setFromObject and skew auto-fit.
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
    /** Mouse Group's uniform scale; avatar is its child so we cancel it out. */
    const PARENT_SCALE = 0.6;
    const s = def.targetWorldHeight / (measuredH * PARENT_SCALE);
    avatar.scale.setScalar(s);
    avatar.position.y = -box.min.y * s;
    this.add(avatar);
    this._avatar = avatar;

    this._mixer = new THREE.AnimationMixer(avatar);
    for (const clip of gltf.animations) {
      this._actions.set(clip.name, this._mixer.clipAction(clip));
    }
    this._play('idle', true);

    try {
      this.eyeAnimator = new MouseEyeAtlasAnimator();
      await this.eyeAnimator.load();
      this._eyeUnsub = attachEyesToModel(this.modelKey, this.eyeAnimator, avatar);
      this.eyeAnimator.setState('idle', { immediate: true });
    } catch {
      this.eyeAnimator = null;
    }

    this._ready = true;
    return this;
  }

  setState(state) {
    if (state === this._state) return;
    this._state = state;
    const clipName = STATE_TO_CLIP[state] ?? 'idle';
    this._play(clipName);
    this.eyeAnimator?.setState(state);
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
    this.eyeAnimator?.update(dt);
  }

  setViewCamera(camera) {
    this.eyeAnimator?.setViewCamera(camera ?? null);
  }

  dispose() {
    this.parent?.remove(this);
    this._actions.clear();
    this._mixer = null;
    this._eyeUnsub?.();
    this._eyeUnsub = null;
    this.eyeAnimator?.dispose?.();
    this.eyeAnimator = null;
  }
}
