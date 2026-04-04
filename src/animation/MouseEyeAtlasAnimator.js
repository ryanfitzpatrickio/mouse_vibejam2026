import * as THREE from 'three';
import { assetUrl } from '../utils/assetUrl.js';

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
    atlasUrl = assetUrl('eyeset1.jpg'),
    columns = 5,
    rows = 5,
    fps = 10,
    frameCrop = DEFAULT_VALUES.frameCrop,
    placement = DEFAULT_VALUES,
    stateToExpression = DEFAULT_STATE_TO_EXPRESSION,
  } = {}) {
    this.atlasUrl = atlasUrl;
    this.columns = columns;
    this.rows = rows;
    this.fps = fps;
    this.stateToExpression = { ...DEFAULT_STATE_TO_EXPRESSION, ...stateToExpression };

    this.texture = null;
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
    this.loaded = false;
    this.opacity = 1;
  }

  async load() {
    if (this.loaded) return this;

    const image = await loadImage(this.atlasUrl);
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

    this.texture = new THREE.CanvasTexture(canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.wrapS = THREE.RepeatWrapping;
    this.texture.wrapT = THREE.RepeatWrapping;
    this.texture.minFilter = THREE.LinearFilter;
    this.texture.magFilter = THREE.LinearFilter;
    this.texture.generateMipmaps = false;
    this.texture.repeat.set(1 / this.columns, 1 / this.rows);
    this.texture.needsUpdate = true;

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
    const expression = this.stateToExpression[state] ?? 'idle';
    this.currentState = state;

    if (expression !== this.currentExpression) {
      this.currentExpression = expression;
      this.currentRow = STATE_TO_ROW[expression] ?? 0;
      this.currentFrame = 0;
      this.frameTimer = 0;
      this._applyFrame();
      return;
    }

    if (immediate) {
      this.currentRow = STATE_TO_ROW[expression] ?? 0;
      this.currentFrame = 0;
      this.frameTimer = 0;
      this._applyFrame();
    }
  }

  update(delta) {
    if (!this.loaded || !this.texture) return;

    this._updateVisibility();

    this.frameTimer += delta;
    while (this.frameTimer >= this.frameDuration) {
      this.frameTimer -= this.frameDuration;
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
    const u = this.currentFrame * uScale + uInset;
    const v = 1 - ((this.currentRow + 1) * vScale) + vInset;
    this.texture.repeat.set(uScale - uInset * 2, vScale - vInset * 2);
    this.texture.offset.set(u, v);
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

  setPlacement({ position, rotation, scale, frameCrop } = {}) {
    if (position) {
      this.baseOffset.copy(position);
      if (this.group) this.group.position.copy(this.baseOffset);
    }

    if (rotation) {
      this.baseRotation.copy(rotation);
      if (this.group) this.group.rotation.copy(this.baseRotation);
    }

    if (scale) {
      this.baseScale.copy(scale);
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
    this.texture?.dispose();

    this.eye = null;
    this.material = null;
    this.texture = null;
    this.parent = null;
    this.anchor = null;
    this.hideTargets = [];
  }
}
