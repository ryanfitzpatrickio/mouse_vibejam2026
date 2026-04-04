import * as THREE from 'three';

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

export class MouseEyeAtlasAnimator {
  constructor({
    atlasUrl = '/eyeset1.jpg',
    columns = 5,
    rows = 5,
    fps = 10,
    frameCrop = { x: 0.06, y: 0.08 },
    placement = {
      position: { x: 0, y: 0.014, z: -0.193 },
      rotation: { x: -2.3096, y: 0, z: 0 },
      scale: { x: 2.071, y: 2.059, z: 2.06 },
    },
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
      placement.position?.x ?? 0,
      placement.position?.y ?? 0.014,
      placement.position?.z ?? -0.193,
    );
    this.baseRotation = new THREE.Euler(
      placement.rotation?.x ?? -2.3096,
      placement.rotation?.y ?? 0,
      placement.rotation?.z ?? 0,
    );
    this.baseScale = new THREE.Vector3(
      placement.scale?.x ?? 2.071,
      placement.scale?.y ?? 2.059,
      placement.scale?.z ?? 2.06,
    );
    this.frameCrop = new THREE.Vector2(frameCrop.x ?? 0.06, frameCrop.y ?? 0.08);
    this.viewCamera = null;
    this.currentState = 'idle';
    this.currentExpression = 'idle';
    this.currentRow = 0;
    this.currentFrame = 0;
    this.frameTimer = 0;
    this.frameDuration = 1 / this.fps;
    this.loaded = false;
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
    return this;
  }

  setViewCamera(camera) {
    this.viewCamera = camera ?? null;
  }

  attach(parent, {
    anchor = null,
    localOffset = new THREE.Vector3(0, 0.02, 0.08),
    localRotation = new THREE.Euler(0, 0, 0),
    localScale = new THREE.Vector3(1, 1, 1),
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
    this.texture.needsUpdate = true;
  }

  _updateVisibility() {
    if (!this.group || !this.eye || !this.viewCamera) return;

    const eyePosition = new THREE.Vector3();
    const eyeQuaternion = new THREE.Quaternion();
    const cameraPosition = new THREE.Vector3();
    const eyeForward = new THREE.Vector3(0, 0, 1);

    this.eye.getWorldPosition(eyePosition);
    this.eye.getWorldQuaternion(eyeQuaternion);
    this.viewCamera.getWorldPosition(cameraPosition);

    eyeForward.applyQuaternion(eyeQuaternion).normalize();
    const toCamera = cameraPosition.sub(eyePosition).normalize();

    this.group.visible = eyeForward.dot(toCamera) > 0.08;
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
