import * as THREE from 'three';
import { assetUrl } from '../utils/assetUrl.js';

const EYES_RANDOM1_SOURCE_URL = new URL('../../assets/source/eyesrandom1.jpg', import.meta.url).href;
const EYES_RANDOM2_SOURCE_URL = new URL('../../assets/source/eyesrandom2.jpg', import.meta.url).href;

const DEFAULT_ATLAS_ID = 'base';

const DEFAULT_ATLASES = Object.freeze({
  [DEFAULT_ATLAS_ID]: { urls: [assetUrl('eyeset1.optimized.webp')] },
  random1: { urls: [assetUrl('eyesrandom1.optimized.webp'), EYES_RANDOM1_SOURCE_URL] },
  random2: { urls: [assetUrl('eyesrandom2.optimized.webp'), EYES_RANDOM2_SOURCE_URL] },
});

const STATE_TO_ROW = Object.freeze({
  idle: 0,
  shifty: 1,
  shocked: 2,
  angry: 3,
  surprised: 4,
});

const DEFAULT_STATE_TO_EXPRESSION = Object.freeze({
  idle: 'idle',
  walk: 'shifty',
  run: 'shifty',
  carry: 'surprised',
  jump: 'shocked',
  death: 'shocked',
  chew: 'angry',
});

export const MOUSE_EYE_ONE_SHOTS = Object.freeze({
  bright: { atlas: 'random1', row: 0, frame: 0, label: 'bright attentive' },
  happyClosed: { atlas: 'random1', row: 0, frame: 1, label: 'closed smile' },
  sideEye: { atlas: 'random1', row: 0, frame: 2, label: 'side eye' },
  worried: { atlas: 'random1', row: 0, frame: 3, label: 'worried wide' },
  furious: { atlas: 'random1', row: 0, frame: 4, label: 'furious glare' },
  bored: { atlas: 'random1', row: 1, frame: 0, label: 'bored' },
  watery: { atlas: 'random1', row: 1, frame: 1, label: 'watery eyes' },
  sadWide: { atlas: 'random1', row: 1, frame: 2, label: 'sad wide' },
  exhaustedSquint: { atlas: 'random1', row: 1, frame: 3, label: 'exhausted squint' },
  surprisedRound: { atlas: 'random1', row: 1, frame: 4, label: 'surprised round' },
  sleepy: { atlas: 'random1', row: 2, frame: 0, label: 'sleepy' },
  skepticalSide: { atlas: 'random1', row: 2, frame: 1, label: 'skeptical side-eye' },
  scheming: { atlas: 'random1', row: 2, frame: 2, label: 'scheming' },
  anxious: { atlas: 'random1', row: 2, frame: 3, label: 'anxious' },
  alertWide: { atlas: 'random1', row: 2, frame: 4, label: 'alert wide' },
  contentClosed: { atlas: 'random1', row: 3, frame: 0, label: 'content closed' },
  angryLeft: { atlas: 'random1', row: 3, frame: 1, label: 'angry left' },
  panicUp: { atlas: 'random1', row: 3, frame: 2, label: 'panic up' },
  brightWide: { atlas: 'random1', row: 3, frame: 3, label: 'bright wide' },
  annoyedSlit: { atlas: 'random1', row: 3, frame: 4, label: 'annoyed slit' },
  victorySquint: { atlas: 'random1', row: 4, frame: 0, label: 'victory grin' },
  determinedLeft: { atlas: 'random1', row: 4, frame: 1, label: 'determined left' },
  worriedLow: { atlas: 'random1', row: 4, frame: 2, label: 'worried low' },
  unimpressed: { atlas: 'random1', row: 4, frame: 3, label: 'unimpressed' },
  suspiciousDown: { atlas: 'random1', row: 4, frame: 4, label: 'suspicious down' },
  simpleWide: { atlas: 'random2', row: 0, frame: 0, label: 'simple wide' },
  coyClosed: { atlas: 'random2', row: 0, frame: 1, label: 'coy closed' },
  blankWide: { atlas: 'random2', row: 0, frame: 2, label: 'blank wide' },
  contentClosed2: { atlas: 'random2', row: 0, frame: 3, label: 'content closed alternate' },
  wink: { atlas: 'random2', row: 0, frame: 4, label: 'wink' },
  tinyPanic: { atlas: 'random2', row: 1, frame: 0, label: 'pin-prick panic' },
  oneEyeSuspicious: { atlas: 'random2', row: 1, frame: 1, label: 'one-eye suspicious' },
  angryFocus: { atlas: 'random2', row: 1, frame: 2, label: 'angry focus' },
  flatAnnoyed: { atlas: 'random2', row: 1, frame: 3, label: 'flat annoyed' },
  stunnedWide: { atlas: 'random2', row: 1, frame: 4, label: 'stunned wide' },
  sideGlare: { atlas: 'random2', row: 2, frame: 0, label: 'side glare' },
  crying: { atlas: 'random2', row: 2, frame: 1, label: 'crying' },
  scaredPinprick: { atlas: 'random2', row: 2, frame: 2, label: 'scared pin-prick' },
  sleepyHalf: { atlas: 'random2', row: 2, frame: 3, label: 'sleepy half-lid' },
  boredFlat: { atlas: 'random2', row: 2, frame: 4, label: 'bored flat' },
  lowDetermined: { atlas: 'random2', row: 3, frame: 0, label: 'low determined' },
  warySide: { atlas: 'random2', row: 3, frame: 1, label: 'wary side-eye' },
  shiftyGlance: { atlas: 'random2', row: 3, frame: 2, label: 'shifty glance' },
  bashfulUp: { atlas: 'random2', row: 3, frame: 3, label: 'bashful up' },
  sinisterSide: { atlas: 'random2', row: 3, frame: 4, label: 'sinister side-eye' },
  closedSmile2: { atlas: 'random2', row: 4, frame: 0, label: 'closed smile alternate' },
  sparklingHappy: { atlas: 'random2', row: 4, frame: 1, label: 'sparkling happy' },
  furiousNarrow: { atlas: 'random2', row: 4, frame: 2, label: 'furious narrow' },
  dizzy: { atlas: 'random2', row: 4, frame: 3, label: 'dizzy spiral' },
  knockedOut: { atlas: 'random2', row: 4, frame: 4, label: 'knocked out' },
});

const STATE_ONE_SHOTS = Object.freeze({
  jump: { id: 'scaredPinprick', duration: 0.45 },
  death: { id: 'knockedOut', duration: 30.0 },
});

const DEFAULT_VALUES = Object.freeze({
  position: { x: 0, y: 0.014, z: -0.193 },
  rotation: { x: -2.3096, y: 0, z: 0 },
  scale: { x: 2.071, y: 2.059, z: 2.06 },
  frameCrop: { x: 0.06, y: 0.08 },
});

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Failed to load image: ${src}`));
    image.src = src;
  });
}

async function loadFirstAvailableImage(urls) {
  let lastError = null;
  for (const url of urls) {
    try {
      return await loadImage(url);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError ?? new Error('Failed to load image');
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

const CAMERA_WORLD_POSITION = new THREE.Vector3();
const EYE_WORLD_POSITION = new THREE.Vector3();
const EYE_WORLD_NORMAL = new THREE.Vector3();
const EYE_TO_CAMERA = new THREE.Vector3();
const EYE_WORLD_QUATERNION = new THREE.Quaternion();

export class MouseEyeAtlasAnimator {
  constructor({
    atlasUrl = assetUrl('eyeset1.optimized.webp'),
    columns = 5,
    rows = 5,
    fps = 4,
    frameCrop = DEFAULT_VALUES.frameCrop,
    placement = DEFAULT_VALUES,
    stateToExpression = DEFAULT_STATE_TO_EXPRESSION,
    atlases = DEFAULT_ATLASES,
  } = {}) {
    this.atlasUrl = atlasUrl;
    this.columns = columns;
    this.rows = rows;
    this.fps = fps;
    this.stateToExpression = { ...DEFAULT_STATE_TO_EXPRESSION, ...stateToExpression };
    this.atlases = {
      ...DEFAULT_ATLASES,
      ...atlases,
      [DEFAULT_ATLAS_ID]: { urls: [atlasUrl] },
    };

    this.texture = null;
    this.textures = new Map();
    this.material = null;
    this.group = null;
    this.eye = null;
    this.parent = null;
    this.anchor = null;
    this.hideTargets = [];

    this.baseOffset = new THREE.Vector3(
      placement.position?.x ?? DEFAULT_VALUES.position.x,
      placement.position?.y ?? DEFAULT_VALUES.position.y,
      placement.position?.z ?? DEFAULT_VALUES.position.z,
    );
    this.baseRotation = new THREE.Euler(
      placement.rotation?.x ?? DEFAULT_VALUES.rotation.x,
      placement.rotation?.y ?? DEFAULT_VALUES.rotation.y,
      placement.rotation?.z ?? DEFAULT_VALUES.rotation.z,
    );
    this.baseScale = new THREE.Vector3(
      placement.scale?.x ?? DEFAULT_VALUES.scale.x,
      placement.scale?.y ?? DEFAULT_VALUES.scale.y,
      placement.scale?.z ?? DEFAULT_VALUES.scale.z,
    );
    this.frameCrop = new THREE.Vector2(
      frameCrop.x ?? DEFAULT_VALUES.frameCrop.x,
      frameCrop.y ?? DEFAULT_VALUES.frameCrop.y,
    );
    this.viewCamera = null;
    this.currentState = 'idle';
    this.currentExpression = 'idle';
    this.currentRow = 0;
    this.currentFrame = 0;
    this.frameTimer = 0;
    this.frameDuration = 1 / this.fps;
    this._frameDurationMultiplier = 1.5;
    this.loaded = false;
    this.opacity = 1;
    this._expressionOverride = null;
    this._activeAtlasId = DEFAULT_ATLAS_ID;
    this._fixedFrame = null;
    this._oneShot = null;
  }

  async load() {
    if (this.loaded) return this;

    const image = await loadFirstAvailableImage([this.atlasUrl]);
    this.texture = this._createTextureFromImage(image);
    this.textures.set(DEFAULT_ATLAS_ID, this.texture);

    await Promise.all(Object.entries(this.atlases).map(async ([id, def]) => {
      if (id === DEFAULT_ATLAS_ID) return;
      const urls = Array.isArray(def?.urls) ? def.urls : [def?.url].filter(Boolean);
      try {
        const atlasImage = await loadFirstAvailableImage(urls);
        this.textures.set(id, this._createTextureFromImage(atlasImage));
      } catch {
        // Optional expression atlases are decorative; keep the base eyes alive.
      }
    }));

    this.material = new THREE.MeshBasicMaterial({
      map: this.texture,
      transparent: false,
      alphaTest: 0.35,
      depthTest: true,
      depthWrite: true,
      side: THREE.FrontSide,
    });

    this.loaded = true;
    this._applyFrame();
    this.setOpacity(this.opacity);
    return this;
  }

  _createTextureFromImage(image) {
    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });

    ctx.drawImage(image, 0, 0);

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const { data } = imageData;
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      if (g > 160 && r < 120 && b < 120 && g - Math.max(r, b) > 50) {
        data[i + 3] = 0;
      }
    }
    ctx.putImageData(imageData, 0, 0);

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.generateMipmaps = false;
    texture.repeat.set(1 / this.columns, 1 / this.rows);
    texture.needsUpdate = true;
    return texture;
  }

  setViewCamera(camera) {
    this.viewCamera = camera ?? null;
  }

  setOpacity(opacity = 1) {
    this.opacity = clamp(opacity, 0, 1);
    if (!this.material) return;

    const nextTransparent = this.opacity < 0.999;
    const nextDepthWrite = this.opacity >= 0.999;
    const renderStateChanged = this.material.transparent !== nextTransparent
      || this.material.depthWrite !== nextDepthWrite;

    this.material.opacity = this.opacity;
    this.material.transparent = nextTransparent;
    this.material.depthWrite = nextDepthWrite;
    if (renderStateChanged) {
      this.material.needsUpdate = true;
    }
  }

  attach(parent, {
    anchor = null,
    localOffset = new THREE.Vector3(
      DEFAULT_VALUES.position.x,
      DEFAULT_VALUES.position.y,
      DEFAULT_VALUES.position.z,
    ),
    localRotation = new THREE.Euler(
      DEFAULT_VALUES.rotation.x,
      DEFAULT_VALUES.rotation.y,
      DEFAULT_VALUES.rotation.z,
    ),
    localScale = new THREE.Vector3(
      DEFAULT_VALUES.scale.x,
      DEFAULT_VALUES.scale.y,
      DEFAULT_VALUES.scale.z,
    ),
    eyeSize = 0.13,
    hideTargets = [],
  } = {}) {
    this.parent = parent;
    this.anchor = anchor ?? parent;
    this.hideTargets = hideTargets.filter(Boolean);
    this.baseOffset.copy(localOffset);
    this.baseRotation.copy(localRotation);
    this.baseScale.copy(localScale);
    this.eyeSize = eyeSize;

    if (this.group) {
      this.group.removeFromParent();
    }

    this.group = new THREE.Group();
    this.group.name = 'MouseEyes';
    this.group.userData.skipOutline = true;
    this.group.position.copy(this.baseOffset);
    this.group.rotation.copy(this.baseRotation);
    this.group.scale.copy(this.baseScale);
    this.group.renderOrder = 1000;
    this.group.frustumCulled = false;

    const geometry = new THREE.PlaneGeometry(eyeSize * 1.65, eyeSize);
    this.eye = new THREE.Mesh(geometry, this.material);
    this.eye.name = 'MouseEyeAtlas';
    this.eye.userData.skipOutline = true;
    this.eye.renderOrder = 1001;
    this.eye.frustumCulled = false;
    this.eye.castShadow = false;
    this.eye.receiveShadow = false;
    this.group.add(this.eye);

    this.anchor.add(this.group);
    for (const target of this.hideTargets) {
      target.visible = false;
    }

    this.setState(this.currentState, { immediate: true });
    return this.group;
  }

  setState(state, { immediate = false } = {}) {
    const stateChanged = state !== this.currentState;
    const expression = this._expressionOverride ?? this.stateToExpression[state] ?? 'idle';
    this.currentState = state;

    if ((stateChanged || immediate) && !this._expressionOverride) {
      const oneShot = STATE_ONE_SHOTS[state];
      if (oneShot) {
        this.playOneShot(oneShot.id, { duration: oneShot.duration, restart: immediate || stateChanged });
        return;
      }
    }

    if (this._oneShot && !this._expressionOverride) return;

    if (this._setExpression(expression, { resetFrame: expression !== this.currentExpression || immediate })) {
      return;
    }
  }

  setExpressionOverride(expression, { duration = 0 } = {}) {
    this._expressionOverride = expression;
    this._oneShot = null;
    this._setExpression(expression, { resetFrame: true });
    if (duration > 0) {
      this._oneShot = { duration, restoreState: this.currentState, override: true };
    }
  }

  playOneShot(expression, { duration = 0.8, restart = true } = {}) {
    const fixed = MOUSE_EYE_ONE_SHOTS[expression];
    if (!fixed || !this.textures.has(fixed.atlas)) return false;
    if (!restart && this._oneShot) return false;

    this._oneShot = { duration: Math.max(0.05, duration), restoreState: this.currentState, override: false };
    this._expressionOverride = null;
    this._setExpression(expression, { resetFrame: true });
    return true;
  }

  clearExpressionOverride() {
    this._expressionOverride = null;
    this._oneShot = null;
    const expression = this.stateToExpression[this.currentState] ?? 'idle';
    this._setExpression(expression, { resetFrame: true });
  }

  update(delta) {
    if (!this.loaded || !this.texture) return;

    this._updateVisibility();

    if (this._oneShot) {
      this._oneShot.duration -= delta;
      if (this._oneShot.duration <= 0) {
        const wasOverride = this._oneShot.override;
        this._oneShot = null;
        if (wasOverride) {
          this.clearExpressionOverride();
        } else {
          const expression = this.stateToExpression[this.currentState] ?? 'idle';
          this._setExpression(expression, { resetFrame: true });
        }
      }
      return;
    }

    if (this._fixedFrame) return;

    this.frameTimer += delta;
    const step = this.frameDuration * this._frameDurationMultiplier;
    while (this.frameTimer >= step) {
      this.frameTimer -= step;
      this.currentFrame = (this.currentFrame + 1) % this.columns;
      this._applyFrame();
    }
  }

  _applyFrame() {
    if (!this.texture) return;

    const uScale = 1 / this.columns;
    const vScale = 1 / this.rows;
    const uInset = clamp(this.frameCrop.x / this.columns, 0, uScale * 0.45);
    const vInset = clamp(this.frameCrop.y / this.rows, 0, vScale * 0.45);
    const frame = this._fixedFrame?.frame ?? this.currentFrame;
    const row = this._fixedFrame?.row ?? this.currentRow;
    const u = frame * uScale + uInset;
    const v = 1 - ((row + 1) * vScale) + vInset;
    this.texture.repeat.set(uScale - uInset * 2, vScale - vInset * 2);
    this.texture.offset.set(u, v);
  }

  _setExpression(expression, { resetFrame = false } = {}) {
    const fixed = MOUSE_EYE_ONE_SHOTS[expression];
    if (fixed && this.textures.has(fixed.atlas)) {
      this.currentExpression = expression;
      this._fixedFrame = { row: fixed.row, frame: fixed.frame };
      this._setActiveAtlas(fixed.atlas);
      this.frameTimer = 0;
      this._applyFrame();
      return true;
    }

    const row = STATE_TO_ROW[expression];
    const resolved = row != null ? expression : 'idle';
    this.currentExpression = resolved;
    this.currentRow = STATE_TO_ROW[resolved] ?? 0;
    this._fixedFrame = null;
    this._setActiveAtlas(DEFAULT_ATLAS_ID);
    if (resetFrame) {
      this.currentFrame = 0;
      this.frameTimer = 0;
    }
    this._applyFrame();
    return true;
  }

  _setActiveAtlas(atlasId) {
    if (this._activeAtlasId === atlasId) return;
    const texture = this.textures.get(atlasId);
    if (!texture) return;
    this._activeAtlasId = atlasId;
    this.texture = texture;
    if (this.material) {
      this.material.map = texture;
      this.material.needsUpdate = true;
    }
  }

  _updateVisibility() {
    if (!this.group || !this.eye || !this.viewCamera) return;

    this.viewCamera.getWorldPosition(CAMERA_WORLD_POSITION);
    this.eye.getWorldPosition(EYE_WORLD_POSITION);
    this.eye.getWorldQuaternion(EYE_WORLD_QUATERNION);

    EYE_WORLD_NORMAL.set(0, 0, 1).applyQuaternion(EYE_WORLD_QUATERNION).normalize();
    EYE_TO_CAMERA.subVectors(CAMERA_WORLD_POSITION, EYE_WORLD_POSITION);

    if (EYE_TO_CAMERA.lengthSq() === 0) {
      this.group.visible = true;
      return;
    }

    EYE_TO_CAMERA.normalize();
    this.group.visible = EYE_WORLD_NORMAL.dot(EYE_TO_CAMERA) > 0.02;
  }

  setPlacement({ position, rotation, scale, frameCrop, eyeSize } = {}) {
    if (typeof eyeSize === 'number' && eyeSize > 0 && this.eye && Math.abs(eyeSize - (this.eyeSize ?? 0)) > 1e-4) {
      this.eyeSize = eyeSize;
      this.eye.geometry?.dispose();
      this.eye.geometry = new THREE.PlaneGeometry(eyeSize * 1.65, eyeSize);
    }
    if (position) {
      if (typeof position.copy === 'function') this.baseOffset.copy(position);
      else this.baseOffset.set(position.x ?? 0, position.y ?? 0, position.z ?? 0);
      if (this.group) this.group.position.copy(this.baseOffset);
    }

    if (rotation) {
      if (typeof rotation.copy === 'function') this.baseRotation.copy(rotation);
      else this.baseRotation.set(rotation.x ?? 0, rotation.y ?? 0, rotation.z ?? 0);
      if (this.group) this.group.rotation.copy(this.baseRotation);
    }

    if (scale) {
      if (typeof scale.copy === 'function') this.baseScale.copy(scale);
      else this.baseScale.set(scale.x ?? 1, scale.y ?? 1, scale.z ?? 1);
      if (this.group) this.group.scale.copy(this.baseScale);
    }

    if (frameCrop) {
      this.frameCrop.set(frameCrop.x ?? this.frameCrop.x, frameCrop.y ?? this.frameCrop.y);
      this._applyFrame();
    }
  }

  getPlacement() {
    return {
      position: this.baseOffset.clone(),
      rotation: this.baseRotation.clone(),
      scale: this.baseScale.clone(),
      frameCrop: this.frameCrop.clone(),
    };
  }

  dispose() {
    if (this.group) {
      this.group.removeFromParent();
      this.group = null;
    }

    this.eye?.geometry?.dispose();
    this.material?.dispose();
    for (const texture of this.textures.values()) {
      texture?.dispose?.();
    }
    this.textures.clear();

    this.eye = null;
    this.material = null;
    this.texture = null;
    this.parent = null;
    this.anchor = null;
    this.hideTargets = [];
  }
}
