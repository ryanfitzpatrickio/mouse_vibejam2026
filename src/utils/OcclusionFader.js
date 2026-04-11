import * as THREE from 'three';

const _raycaster = new THREE.Raycaster();
const _direction = new THREE.Vector3();
const _savedOpacity = new WeakMap();

export class OcclusionFader {
  constructor({ scene, camera, getPlayer, fadeOpacity = 0.15, fadeSpeed = 8 }) {
    this.scene = scene;
    this.camera = camera;
    this.getPlayer = getPlayer;
    this.fadeOpacity = fadeOpacity;
    this.fadeSpeed = fadeSpeed;
    this._fading = new Map();
    this._playerSet = new Set();
  }

  update(dt) {
    const player = this.getPlayer();
    if (!player) return;

    const playerPos = player.position;
    const camPos = this.camera.position;

    this._playerSet.clear();
    player.traverse((child) => {
      if (child.isMesh) this._playerSet.add(child);
    });
    _direction.copy(playerPos).sub(camPos);
    const distance = _direction.length();
    if (distance < 0.001) return;
    _direction.divideScalar(distance);

    _raycaster.set(camPos, _direction);
    _raycaster.far = distance;
    _raycaster.camera = this.camera;

    const hits = _raycaster.intersectObjects(this.scene.children, true);
    const hitMeshes = new Set();

    for (const hit of hits) {
      const obj = hit.object;
      if (!obj.isMesh) continue;
      if (obj.visible === false) continue;
      if (this._playerSet.has(obj)) continue;
      if (obj.userData?.skipFade) continue;
      if (obj.userData?.isFloor) continue;
      if (obj.userData?.surfaceType === 'floor') continue;
      // Match ThirdPersonCamera: props that must not pull the camera arm also should not be x-ray faded.
      if (obj.userData?.cameraOccluder === false) continue;
      if (obj.userData?.runnable === true) continue;

      if (!_savedOpacity.has(obj)) {
        const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
        const saved = materials.map((m) => ({
          opacity: m.opacity,
          transparent: m.transparent,
          depthWrite: m.depthWrite,
        }));
        _savedOpacity.set(obj, saved);
      }

      hitMeshes.add(obj);
      if (!this._fading.has(obj)) {
        this._fading.set(obj, { current: 1.0 });
      }
    }

    for (const [obj, state] of this._fading) {
      const targetOpacity = hitMeshes.has(obj) ? this.fadeOpacity : 1.0;
      state.current += (targetOpacity - state.current) * Math.min(1, this.fadeSpeed * dt);

      const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
      for (const mat of materials) {
        mat.transparent = true;
        mat.opacity = state.current;
        mat.depthWrite = state.current > 0.95;
        mat.needsUpdate = true;
      }

      if (state.current >= 0.99 && !hitMeshes.has(obj)) {
        const saved = _savedOpacity.get(obj);
        if (saved) {
          const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
          for (let i = 0; i < mats.length; i++) {
            if (saved[i]) {
              mats[i].opacity = saved[i].opacity;
              mats[i].transparent = saved[i].transparent;
              mats[i].depthWrite = saved[i].depthWrite;
              mats[i].needsUpdate = true;
            }
          }
        }
        _savedOpacity.delete(obj);
        this._fading.delete(obj);
      }
    }
  }
}
