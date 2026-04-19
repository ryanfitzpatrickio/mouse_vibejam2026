import * as THREE from 'three';

const SMOKE_SPAWN_INTERVAL = 0.18;
const SMOKE_LIFETIME = 2.6;
const SPARK_SPAWN_INTERVAL = 0.35;
const SPARK_LIFETIME = 0.6;

let _sharedSmokeTexture = null;
function getSmokeTexture() {
  if (_sharedSmokeTexture) return _sharedSmokeTexture;
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, 'rgba(220, 220, 220, 0.85)');
  grad.addColorStop(0.45, 'rgba(160, 160, 160, 0.45)');
  grad.addColorStop(1, 'rgba(100, 100, 100, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  _sharedSmokeTexture = tex;
  return tex;
}

/**
 * Smoke + sparks effect anchored at a world position. Auto-loops until
 * dispose(). Dispose removes the group from scene and frees GPU resources.
 */
export class SmokeSparksEffect {
  constructor(scene, worldPos) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.name = 'SmokeSparksEffect';
    this.group.position.copy(worldPos);
    scene.add(this.group);

    this._smokeMaterial = new THREE.SpriteMaterial({
      map: getSmokeTexture(),
      color: 0xdcdcdc,
      transparent: true,
      opacity: 0.75,
      depthWrite: false,
    });
    this._sparkGeometry = new THREE.SphereGeometry(0.035, 6, 4);
    this._sparkBaseMaterial = new THREE.MeshBasicMaterial({
      color: 0xffcc55,
      transparent: true,
      opacity: 1,
      toneMapped: false,
    });

    /** @type {{sprite: THREE.Sprite, vel: THREE.Vector3, age: number, material: THREE.SpriteMaterial}[]} */
    this._puffs = [];
    /** @type {{mesh: THREE.Mesh, vel: THREE.Vector3, age: number, material: THREE.Material}[]} */
    this._sparks = [];
    this._smokeSpawnTimer = 0;
    this._sparkSpawnTimer = 0;
  }

  _spawnPuff() {
    const material = this._smokeMaterial.clone();
    const sprite = new THREE.Sprite(material);
    sprite.position.set(
      (Math.random() - 0.5) * 0.08,
      0.05 + Math.random() * 0.1,
      (Math.random() - 0.5) * 0.08,
    );
    sprite.scale.setScalar(0.22 + Math.random() * 0.1);
    this.group.add(sprite);
    this._puffs.push({
      sprite,
      vel: new THREE.Vector3(
        (Math.random() - 0.5) * 0.18,
        0.35 + Math.random() * 0.18,
        (Math.random() - 0.5) * 0.18,
      ),
      age: 0,
      material,
    });
  }

  _spawnSpark() {
    const material = this._sparkBaseMaterial.clone();
    material.color.setHSL(0.08 + Math.random() * 0.08, 1, 0.6 + Math.random() * 0.15);
    const mesh = new THREE.Mesh(this._sparkGeometry, material);
    mesh.position.set(0, 0.06, 0);
    this.group.add(mesh);
    const theta = Math.random() * Math.PI * 2;
    const speed = 1.6 + Math.random() * 1.0;
    this._sparks.push({
      mesh,
      vel: new THREE.Vector3(
        Math.cos(theta) * speed,
        1.2 + Math.random() * 1.4,
        Math.sin(theta) * speed,
      ),
      age: 0,
      material,
    });
  }

  update(dt) {
    this._smokeSpawnTimer -= dt;
    if (this._smokeSpawnTimer <= 0) {
      this._smokeSpawnTimer = SMOKE_SPAWN_INTERVAL * (0.7 + Math.random() * 0.6);
      this._spawnPuff();
    }
    this._sparkSpawnTimer -= dt;
    if (this._sparkSpawnTimer <= 0) {
      this._sparkSpawnTimer = SPARK_SPAWN_INTERVAL * (0.5 + Math.random() * 1.2);
      for (let i = 0; i < 2 + Math.floor(Math.random() * 3); i += 1) this._spawnSpark();
    }

    for (let i = this._puffs.length - 1; i >= 0; i -= 1) {
      const p = this._puffs[i];
      p.age += dt;
      p.vel.x *= Math.exp(-0.9 * dt);
      p.vel.z *= Math.exp(-0.9 * dt);
      p.sprite.position.addScaledVector(p.vel, dt);
      const t = p.age / SMOKE_LIFETIME;
      p.sprite.scale.setScalar(0.22 + 0.55 * t);
      p.material.opacity = Math.max(0, 0.75 * (1 - t));
      if (p.age >= SMOKE_LIFETIME) {
        this.group.remove(p.sprite);
        p.material.dispose();
        this._puffs.splice(i, 1);
      }
    }

    for (let i = this._sparks.length - 1; i >= 0; i -= 1) {
      const s = this._sparks[i];
      s.age += dt;
      s.vel.y -= 9.0 * dt;
      s.vel.x *= Math.exp(-1.4 * dt);
      s.vel.z *= Math.exp(-1.4 * dt);
      s.mesh.position.addScaledVector(s.vel, dt);
      const t = s.age / SPARK_LIFETIME;
      s.material.opacity = Math.max(0, 1 - t);
      if (s.age >= SPARK_LIFETIME || s.mesh.position.y < 0) {
        this.group.remove(s.mesh);
        s.material.dispose();
        this._sparks.splice(i, 1);
      }
    }
  }

  dispose() {
    for (const p of this._puffs) {
      this.group.remove(p.sprite);
      p.material.dispose();
    }
    for (const s of this._sparks) {
      this.group.remove(s.mesh);
      s.material.dispose();
    }
    this._puffs.length = 0;
    this._sparks.length = 0;
    this._smokeMaterial.dispose();
    this._sparkGeometry.dispose();
    this._sparkBaseMaterial.dispose();
    this.scene.remove(this.group);
  }
}
