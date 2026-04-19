import * as THREE from 'three';

const GRAVITY = -14;
const GROUND_BOUNCE = 0.32;
const AIR_DRAG = 0.4;
const LIFETIME = 4.2;
const FADE_BEGIN = 3.0;

/**
 * Client-local cheese burst effect. Not network-synced — purely visual
 * reward when a task is completed.
 */
export class CheeseBurst {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.name = 'CheeseBurstEffects';
    scene.add(this.group);
    this._geometry = new THREE.ConeGeometry(0.18, 0.3, 6);
    this._geometry.rotateX(Math.PI);
    this._baseMaterial = new THREE.MeshStandardMaterial({
      color: '#f2d046',
      emissive: '#806018',
      emissiveIntensity: 0.32,
      roughness: 0.42,
      metalness: 0.06,
      transparent: true,
      opacity: 1,
    });
    /** @type {{mesh:THREE.Mesh, velocity:THREE.Vector3, spinAxis:THREE.Vector3, spin:number, age:number, groundY:number, material:THREE.Material}[]} */
    this._particles = [];
  }

  /**
   * @param {THREE.Vector3} fromPos - world-space origin of the burst
   * @param {THREE.Vector3} towardPos - world-space aim (cheese arcs toward this)
   * @param {number} [count=8]
   */
  spawn(fromPos, towardPos, count = 8) {
    const groundY = Math.min(fromPos.y, towardPos.y, 0);
    const aimDir = new THREE.Vector3().subVectors(towardPos, fromPos);
    aimDir.y = 0;
    const aimLen = aimDir.length();
    if (aimLen < 0.001) {
      aimDir.set(0, 0, 1);
    } else {
      aimDir.multiplyScalar(1 / aimLen);
    }
    for (let i = 0; i < count; i += 1) {
      const material = this._baseMaterial.clone();
      const mesh = new THREE.Mesh(this._geometry, material);
      const spread = 0.8;
      mesh.position.set(
        fromPos.x + (Math.random() - 0.5) * 0.2,
        fromPos.y + 0.4 + Math.random() * 0.3,
        fromPos.z + (Math.random() - 0.5) * 0.2,
      );
      mesh.castShadow = true;
      this.group.add(mesh);

      const lateral = Math.min(aimLen, 3.0) + (Math.random() - 0.5) * 0.8;
      const side = (Math.random() - 0.5) * spread;
      const velocity = new THREE.Vector3(
        aimDir.x * lateral + -aimDir.z * side,
        5.0 + Math.random() * 2.5,
        aimDir.z * lateral + aimDir.x * side,
      );

      const spinAxis = new THREE.Vector3(
        Math.random() * 2 - 1,
        Math.random() * 2 - 1,
        Math.random() * 2 - 1,
      ).normalize();

      this._particles.push({
        mesh,
        velocity,
        spinAxis,
        spin: 4 + Math.random() * 6,
        age: 0,
        groundY: groundY + 0.14,
        material,
        bouncesLeft: 2,
      });
    }
  }

  update(dt) {
    if (this._particles.length === 0) return;
    for (let i = this._particles.length - 1; i >= 0; i -= 1) {
      const p = this._particles[i];
      p.age += dt;

      // Integrate with simple ground bounce.
      p.velocity.y += GRAVITY * dt;
      p.velocity.x *= Math.exp(-AIR_DRAG * dt);
      p.velocity.z *= Math.exp(-AIR_DRAG * dt);
      p.mesh.position.addScaledVector(p.velocity, dt);

      if (p.mesh.position.y <= p.groundY) {
        p.mesh.position.y = p.groundY;
        if (p.bouncesLeft > 0 && p.velocity.y < -0.5) {
          p.velocity.y = -p.velocity.y * GROUND_BOUNCE;
          p.velocity.x *= 0.55;
          p.velocity.z *= 0.55;
          p.bouncesLeft -= 1;
        } else {
          p.velocity.set(0, 0, 0);
        }
      }

      p.mesh.rotateOnAxis(p.spinAxis, p.spin * dt);

      if (p.age >= FADE_BEGIN) {
        const fade = Math.max(0, 1 - (p.age - FADE_BEGIN) / (LIFETIME - FADE_BEGIN));
        p.material.opacity = fade;
      }
      if (p.age >= LIFETIME) {
        this.group.remove(p.mesh);
        p.material.dispose();
        this._particles.splice(i, 1);
      }
    }
  }

  dispose() {
    for (const p of this._particles) {
      this.group.remove(p.mesh);
      p.material.dispose();
    }
    this._particles.length = 0;
    this._geometry.dispose();
    this._baseMaterial.dispose();
    this.scene.remove(this.group);
  }
}
