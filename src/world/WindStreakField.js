import * as THREE from 'three';

/**
 * Camera-attached "wind rushing past" particle effect. A pool of line-segment
 * streaks lives in camera-local space, spawned ahead of the camera in a
 * hollow ring (so the center stays clear) and continuously sliding toward +Z
 * (out of the frame past the viewer). Each streak fades in on spawn, peaks
 * mid-flight, and fades out as it approaches the near plane.
 *
 * Intensity (0..1) drives:
 *   - Streak travel speed (how fast they rush past)
 *   - Streak length (motion-blur feel at high intensity)
 *   - Overall alpha (invisible at 0, full at 1)
 *   - Streak spawn rate via faster recycling
 *
 * Rendered additively on top of the scene (depthTest off, high renderOrder),
 * so it reads as a light-based effect rather than in-world geometry.
 */
export class WindStreakField {
  constructor({
    camera,
    count = 180,
    minRadius = 0.55,
    maxRadius = 3.8,
    minDepth = -1.2,
    maxDepth = -7.0,
  }) {
    this.camera = camera;
    this.count = count;
    this.minRadius = minRadius;
    this.maxRadius = maxRadius;
    this.minDepth = minDepth;
    this.maxDepth = maxDepth;

    this.intensity = 0;
    this._targetIntensity = 0;

    this._positions = new Float32Array(count * 6);
    this._colors = new Float32Array(count * 8);
    this._particles = new Array(count);
    for (let i = 0; i < count; i += 1) {
      this._particles[i] = { x: 0, y: 0, z: this.maxDepth, speedJitter: 1 };
      this._spawn(this._particles[i], true);
    }

    this._geometry = new THREE.BufferGeometry();
    this._geometry.setAttribute('position', new THREE.BufferAttribute(this._positions, 3));
    this._geometry.setAttribute('color', new THREE.BufferAttribute(this._colors, 4, false));

    this._material = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this._material.vertexAlphas = true;

    this._mesh = new THREE.LineSegments(this._geometry, this._material);
    this._mesh.frustumCulled = false;
    this._mesh.renderOrder = 9999;
    this._mesh.visible = false;

    camera.add(this._mesh);
  }

  _spawn(p, initial = false) {
    // Uniform in ring (avoids the center so streaks don't obscure the character).
    const angle = Math.random() * Math.PI * 2;
    const rNorm = Math.sqrt(Math.random());
    const r = this.minRadius + rNorm * (this.maxRadius - this.minRadius);
    p.x = Math.cos(angle) * r;
    p.y = Math.sin(angle) * r;
    // On initial fill, spread across the whole depth range so there's no
    // obvious spawn wave. On recycle, spawn at the far end.
    if (initial) {
      p.z = this.maxDepth + Math.random() * (this.minDepth - this.maxDepth);
    } else {
      p.z = this.maxDepth + (Math.random() - 0.5) * 0.6;
    }
    p.speedJitter = 0.8 + Math.random() * 0.5;
  }

  /** @param {number} v 0..1 */
  setIntensity(v) {
    this._targetIntensity = Math.max(0, Math.min(1, Number(v) || 0));
  }

  update(dt) {
    const step = Math.min(0.1, Math.max(0, dt || 0));
    // Smooth target intensity so the effect eases in/out rather than popping.
    const smooth = 1 - Math.exp(-6 * step);
    this.intensity += (this._targetIntensity - this.intensity) * smooth;

    if (this.intensity < 0.01) {
      this._mesh.visible = false;
      return;
    }
    this._mesh.visible = true;

    const speed = 14 + this.intensity * 36;
    const streakLen = 0.35 + this.intensity * 2.1;
    const baseAlpha = this.intensity;
    const pos = this._positions;
    const col = this._colors;

    const recycleZ = this.minDepth + 0.1;

    for (let i = 0; i < this.count; i += 1) {
      const p = this._particles[i];
      p.z += speed * p.speedJitter * step;
      if (p.z > recycleZ) {
        this._spawn(p, false);
      }

      const headIdx = i * 6;
      const tailIdx = headIdx + 3;
      pos[headIdx] = p.x;
      pos[headIdx + 1] = p.y;
      pos[headIdx + 2] = p.z;
      pos[tailIdx] = p.x;
      pos[tailIdx + 1] = p.y;
      pos[tailIdx + 2] = p.z - streakLen;

      // Fade away from the center line (keep the view clear) and toward the far
      // and near extremes so streaks ease in and out rather than popping.
      const distSq = p.x * p.x + p.y * p.y;
      const innerFade = Math.max(0, Math.min(1, (distSq - this.minRadius * this.minRadius) / 0.6));
      const zRange = this.maxDepth - this.minDepth; // negative
      const zNorm = (p.z - this.minDepth) / zRange; // 0 at near, 1 at far
      // Tent fade: 0 at both ends, 1 in the middle.
      const lifeFade = Math.max(0, 1 - Math.abs(zNorm * 2 - 1));

      const a = baseAlpha * innerFade * lifeFade;

      const ci = i * 8;
      // Head: bright white.
      col[ci] = 1;
      col[ci + 1] = 1;
      col[ci + 2] = 1;
      col[ci + 3] = a;
      // Tail: cooler tint, fully transparent for a motion-blur streak.
      col[ci + 4] = 0.75;
      col[ci + 5] = 0.88;
      col[ci + 6] = 1;
      col[ci + 7] = 0;
    }

    this._geometry.attributes.position.needsUpdate = true;
    this._geometry.attributes.color.needsUpdate = true;
  }

  dispose() {
    this.camera.remove(this._mesh);
    this._geometry.dispose();
    this._material.dispose();
  }
}
