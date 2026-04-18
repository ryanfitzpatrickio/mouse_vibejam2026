import * as THREE from 'three';
import { ROOMBA_BODY_HEIGHT, ROOMBA_MESH_SCALE, ROOMBA_RADIUS_XZ } from '../../shared/roombaDimensions.js';

const LERP_SPEED = 14;
const HARD_SNAP_DIST = 2.0;
const STALE_SNAPSHOT_SEC = 0.6;
const MIN_LERP_DT = 1 / 30;

/**
 * Inward wind wisps (local XZ). Roomba group is scaled ×ROOMBA_MESH_SCALE — keep radii small
 * (~0.2–0.5 local ≈ 0.9–2.25m world) or the ring fills the whole room.
 */
const WIND_PARTICLE_COUNT = 48;
const WIND_R_MIN = 0.2;
const WIND_R_MAX = 0.52;
const WIND_INWARD_SPEED = 0.36;
const WIND_SPIN_SPEED = 0.48;

function createRoombaWindSpriteTexture() {
  const s = 64;
  const canvas = document.createElement('canvas');
  canvas.width = s;
  canvas.height = s;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const cx = s * 0.5;
  const g = ctx.createRadialGradient(cx, cx, 0, cx, cx, s * 0.5);
  g.addColorStop(0, 'rgba(220, 238, 255, 0.55)');
  g.addColorStop(0.4, 'rgba(190, 224, 255, 0.22)');
  g.addColorStop(0.75, 'rgba(170, 210, 255, 0.06)');
  g.addColorStop(1, 'rgba(160, 200, 255, 0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, s, s);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

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

    this._windR = new Float32Array(WIND_PARTICLE_COUNT);
    this._windA = new Float32Array(WIND_PARTICLE_COUNT);
    this._windY = new Float32Array(WIND_PARTICLE_COUNT);
    const windPos = new Float32Array(WIND_PARTICLE_COUNT * 3);
    for (let i = 0; i < WIND_PARTICLE_COUNT; i += 1) {
      this._windA[i] = Math.random() * Math.PI * 2;
      this._windR[i] = WIND_R_MIN + Math.random() * (WIND_R_MAX - WIND_R_MIN);
      this._windY[i] = 0.035 + Math.random() * 0.09;
      const i3 = i * 3;
      windPos[i3] = Math.cos(this._windA[i]) * this._windR[i];
      windPos[i3 + 1] = this._windY[i];
      windPos[i3 + 2] = Math.sin(this._windA[i]) * this._windR[i];
    }
    const windGeo = new THREE.BufferGeometry();
    windGeo.setAttribute('position', new THREE.BufferAttribute(windPos, 3));
    const windSprite = createRoombaWindSpriteTexture();
    const windMat = new THREE.PointsMaterial({
      map: windSprite ?? undefined,
      color: 0xa8cce8,
      size: 20,
      transparent: true,
      opacity: 0.38,
      depthWrite: false,
      blending: THREE.NormalBlending,
      toneMapped: false,
      sizeAttenuation: true,
      alphaTest: 0.02,
    });
    this._windParticles = new THREE.Points(windGeo, windMat);
    this._windParticles.name = 'RoombaWind';
    this._windParticles.frustumCulled = false;
    this._windParticles.visible = false;
    this._windParticles.userData.skipFade = true;
    this._windParticles.position.y = 0.02;
    this.add(this._windParticles);

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
    this._lastServerAt = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    if (!this._initialized) {
      this._initialized = true;
      this.position.copy(this._targetPos);
      this.rotation.y = this._targetRot;
      return;
    }
    const dx = this._targetPos.x - this.position.x;
    const dy = this._targetPos.y - this.position.y;
    const dz = this._targetPos.z - this.position.z;
    if (dx * dx + dy * dy + dz * dz > HARD_SNAP_DIST * HARD_SNAP_DIST) {
      this.position.copy(this._targetPos);
      this.rotation.y = this._targetRot;
    }
  }

  update(dt) {
    this._phasePulse += dt;
    if (this._initialized) {
      const now = (typeof performance !== 'undefined' ? performance.now() : Date.now());
      const stale = (now - (this._lastServerAt ?? 0)) > STALE_SNAPSHOT_SEC * 1000;
      if (!stale) {
        const lerpDt = Math.max(dt, MIN_LERP_DT);
        const t = 1 - Math.exp(-LERP_SPEED * lerpDt);
        this.position.x += (this._targetPos.x - this.position.x) * t;
        this.position.y += (this._targetPos.y - this.position.y) * t;
        this.position.z += (this._targetPos.z - this.position.z) * t;

        let diff = this._targetRot - this.rotation.y;
        if (diff > Math.PI) diff -= Math.PI * 2;
        if (diff < -Math.PI) diff += Math.PI * 2;
        this.rotation.y += diff * t;
      }
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

    const showWind = this.visible && phase === 'vacuuming';
    if (this._windParticles) {
      this._windParticles.visible = showWind;
      if (showWind) {
        const pos = this._windParticles.geometry.attributes.position.array;
        const inward = WIND_INWARD_SPEED * dt;
        const spin = WIND_SPIN_SPEED * dt;
        for (let i = 0; i < WIND_PARTICLE_COUNT; i += 1) {
          const wobble = Math.sin(this._phasePulse * 2.4 + i * 0.31) * 0.008;
          this._windA[i] += spin * (0.75 + (i % 6) * 0.045);
          this._windR[i] -= inward * (0.82 + (i % 4) * 0.07);
          if (this._windR[i] < WIND_R_MIN) {
            this._windR[i] = WIND_R_MAX * (0.82 + Math.random() * 0.18);
            this._windA[i] = Math.random() * Math.PI * 2;
            this._windY[i] = 0.03 + Math.random() * 0.095;
          }
          const i3 = i * 3;
          const c = Math.cos(this._windA[i]);
          const s = Math.sin(this._windA[i]);
          pos[i3] = c * this._windR[i];
          pos[i3 + 1] = this._windY[i] + wobble;
          pos[i3 + 2] = s * this._windR[i];
        }
        this._windParticles.geometry.attributes.position.needsUpdate = true;
      }
    }
  }
}
