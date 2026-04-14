import * as THREE from 'three';
import { ROOMBA_BODY_HEIGHT, ROOMBA_MESH_SCALE, ROOMBA_RADIUS_XZ } from '../../shared/roombaDimensions.js';

const LERP_SPEED = 14;

export const ROOMBA_WORLD_RADIUS_XZ = ROOMBA_RADIUS_XZ;
export const ROOMBA_WORLD_HEIGHT = ROOMBA_BODY_HEIGHT;

/**
 * Networked vacuum bot + charging dock visuals (state from server).
 */
export class Roomba extends THREE.Group {
  constructor() {
    super();
    this.name = 'Roomba';

    const bodyMat = new THREE.MeshStandardMaterial({
      color: '#c6cad2',
      metalness: 0.38,
      roughness: 0.38,
    });
    // Default cylinder axis is Y = flat puck on the floor (not rolled on its side).
    const discH = 0.1;
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.36, discH, 32), bodyMat);
    body.position.y = discH * 0.5;
    body.castShadow = true;
    body.receiveShadow = true;

    const bumperMat = new THREE.MeshStandardMaterial({
      color: '#2c3038',
      metalness: 0.22,
      roughness: 0.52,
    });
    const bumper = new THREE.Mesh(new THREE.TorusGeometry(0.37, 0.024, 8, 40), bumperMat);
    bumper.rotation.x = Math.PI / 2;
    bumper.position.y = discH * 0.5 + 0.01;

    const exhaustMat = new THREE.MeshStandardMaterial({
      color: '#1a1d24',
      metalness: 0.15,
      roughness: 0.65,
    });
    const exhaust = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.05, 0.07), exhaustMat);
    exhaust.position.set(0, discH * 0.55, -0.3);

    this.add(body, bumper, exhaust);
    /** Large floor read; scale lives in `shared/roombaDimensions.js` for server parity. */
    this.scale.setScalar(ROOMBA_MESH_SCALE);
    for (const child of this.children) {
      if (child.isMesh) {
        child.userData.skipFade = true;
      }
    }

    this.dockGroup = new THREE.Group();
    this.dockGroup.name = 'RoombaDock';
    const pad = new THREE.Mesh(
      new THREE.BoxGeometry(0.92, 0.045, 0.92),
      new THREE.MeshStandardMaterial({
        color: '#3d424c',
        roughness: 0.72,
        metalness: 0.12,
      }),
    );
    pad.position.y = 0.022;
    pad.receiveShadow = true;
    pad.castShadow = true;

    this._ledMat = new THREE.MeshStandardMaterial({
      color: '#2a332a',
      emissive: 0x000000,
      emissiveIntensity: 0,
      roughness: 0.45,
      metalness: 0.1,
    });
    const led = new THREE.Mesh(new THREE.CircleGeometry(0.055, 20), this._ledMat);
    led.rotation.x = -Math.PI / 2;
    led.position.set(0, 0.047, 0.32);
    this.dockGroup.add(pad, led);
    pad.userData.skipFade = true;
    led.userData.skipFade = true;
    this.dockGroup.scale.setScalar(ROOMBA_MESH_SCALE);

    this._targetPos = new THREE.Vector3();
    this._targetRot = 0;
    /** @type {string} synced for audio */
    this.motorPhase = 'charging';
    this._serverPhase = 'charging';
    this._dockPos = new THREE.Vector3(42, 0, 42);
    this._initialized = false;
    this._phasePulse = 0;

    /** @type {{ type: string, metadata: object, aabb: { min: {x:number,y:number,z:number}, max: {x:number,y:number,z:number} } }} */
    this._physicsCollider = {
      type: 'furniture',
      metadata: { roomba: true, dynamic: true },
      aabb: {
        min: { x: 0, y: 0, z: 0 },
        max: { x: 0, y: 0, z: 0 },
      },
    };

    this.ready = Promise.resolve(this);
  }

  /**
   * Axis-aligned footprint for shared player physics (capsule vs AABB).
   * @returns {typeof this._physicsCollider | null}
   */
  getPhysicsCollider() {
    if (!this.visible) return null;
    const px = this.position.x;
    const py = this.position.y;
    const pz = this.position.z;
    const r = ROOMBA_WORLD_RADIUS_XZ;
    const h = ROOMBA_WORLD_HEIGHT;
    const min = this._physicsCollider.aabb.min;
    const max = this._physicsCollider.aabb.max;
    min.x = px - r;
    max.x = px + r;
    min.y = py;
    max.y = py + h;
    min.z = pz - r;
    max.z = pz + r;
    return this._physicsCollider;
  }

  applyServerState(snapshot) {
    if (!snapshot) return;
    this._targetPos.set(snapshot.px ?? 0, snapshot.py ?? 0, snapshot.pz ?? 0);
    this._targetRot = snapshot.ry ?? 0;
    this._serverPhase = typeof snapshot.ai === 'string' ? snapshot.ai : 'charging';
    this.motorPhase = this._serverPhase;
    if (typeof snapshot.dx === 'number' && typeof snapshot.dz === 'number') {
      this._dockPos.set(snapshot.dx, snapshot.dy ?? 0, snapshot.dz);
    }
    if (!this._initialized) {
      this._initialized = true;
      this.position.copy(this._targetPos);
      this.rotation.y = this._targetRot;
    }
  }

  update(dt) {
    this._phasePulse += dt;
    if (this._initialized) {
      const t = 1 - Math.exp(-LERP_SPEED * dt);
      this.position.x += (this._targetPos.x - this.position.x) * t;
      this.position.y += (this._targetPos.y - this.position.y) * t;
      this.position.z += (this._targetPos.z - this.position.z) * t;

      let diff = this._targetRot - this.rotation.y;
      if (diff > Math.PI) diff -= Math.PI * 2;
      if (diff < -Math.PI) diff += Math.PI * 2;
      this.rotation.y += diff * t;
    }

    this.dockGroup.position.copy(this._dockPos);

    const phase = this._serverPhase;
    if (phase === 'charging') {
      this._ledMat.emissive.setHex(0x1faa44);
      this._ledMat.emissiveIntensity = 0.75 + 0.12 * Math.sin(this._phasePulse * 3.2);
    } else if (phase === 'vacuuming') {
      this._ledMat.emissive.setHex(0x3388dd);
      this._ledMat.emissiveIntensity = 0.55 + 0.1 * Math.sin(this._phasePulse * 8);
    } else {
      this._ledMat.emissive.setHex(0x223344);
      this._ledMat.emissiveIntensity = 0.15;
    }
  }
}
