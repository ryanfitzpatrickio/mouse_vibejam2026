import * as THREE from 'three';
import { createKeyCelMaterial } from '../materials/index.js';

const ATLAS_GRID = 10;
const ROOM_TEXTURE_REPEAT_MULTIPLIER = 2;
const ROOM_TEXTURE_CELLS = Object.freeze({
  floor: 46,
  wall: 3,
  cabinet: 21,
  counter: 89,
  backsplash: 72,
  appliance: 44,
  fabric: 94,
  woodAlt: 55,
  woodDark: 21,
  tile: 72,
});

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Failed to load image: ${src}`));
    image.src = src;
  });
}

function getCellBounds(index, size) {
  const start = Math.round((index / ATLAS_GRID) * size);
  const end = Math.round(((index + 1) / ATLAS_GRID) * size);
  return {
    start,
    end,
    size: Math.max(1, end - start),
  };
}

function createWebGPUToonGradientTexture() {
  const gradientTexture = new THREE.DataTexture(
    new Uint8Array([0, 100, 255]),
    3,
    1,
    THREE.RedFormat,
  );

  gradientTexture.needsUpdate = true;
  gradientTexture.magFilter = THREE.NearestFilter;
  gradientTexture.minFilter = THREE.NearestFilter;
  gradientTexture.generateMipmaps = false;
  return gradientTexture;
}

/**
 * AABB (Axis-Aligned Bounding Box) for collision detection
 */
class AABB {
  constructor(min = new THREE.Vector3(), max = new THREE.Vector3()) {
    this.min = min;
    this.max = max;
  }

  static fromMesh(mesh) {
    const box = new THREE.Box3();
    box.setFromObject(mesh);
    return new AABB(box.min.clone(), box.max.clone());
  }

  intersects(other) {
    return (
      this.min.x <= other.max.x &&
      this.max.x >= other.min.x &&
      this.min.y <= other.max.y &&
      this.max.y >= other.min.y &&
      this.min.z <= other.max.z &&
      this.max.z >= other.min.z
    );
  }
}

/**
 * Room class: constructs a kitchen room with furniture, collision, and loot
 */
export class Room {
  constructor(options = {}) {
    this.group = new THREE.Group();
    this.group.name = 'Kitchen';

    this.colliders = []; // Array of { mesh, aabb, type }
    this.lootItems = []; // Array of loot meshes
    this.climbables = []; // Surfaces player can climb
    this.runnables = []; // Surfaces player can run on

    // Room dimensions
    this.width = options.width ?? 8;
    this.depth = options.depth ?? 8;
    this.height = options.height ?? 4;
    this.scaleFactor = options.scale ?? 1;
    this.group.scale.setScalar(this.scaleFactor);
    this.rendererMode = options.rendererMode ?? 'webgl';
    this.rendererToolkit = options.rendererToolkit ?? null;
    this.textureAtlasUrl = options.textureAtlasUrl ?? '/textures.jpg';
    this.textureAtlasImage = null;
    this.textureCache = new Map();
    this.surfaceMaterials = new Set();
    this.ready = this._loadTextureAtlas().then(() => this._applyTextureAtlas()).catch(() => this);

    // Materials
    this.floorColor = options.floorColor ?? '#d4a574'; // Wood
    this.wallColor = options.wallColor ?? '#e8dcc8'; // Plaster
    this.furnitureColor = options.furnitureColor ?? '#8b6f47'; // Wood furniture

    this.buildRoom();
  }

  _createSurfaceMaterial(baseColor, {
    textureCell = null,
    textureRepeat = 1,
  } = {}) {
    if (this.rendererMode === 'webgpu' && this.rendererToolkit?.MeshToonNodeMaterial) {
      const material = new this.rendererToolkit.MeshToonNodeMaterial({
        color: new THREE.Color(baseColor),
        gradientMap: createWebGPUToonGradientTexture(),
        flatShading: true,
      });

      material.userData.textureCell = textureCell;
      material.userData.textureRepeat = textureRepeat;
      this.surfaceMaterials.add(material);
      return material;
    }

    const material = createKeyCelMaterial({ baseColor });
    material.userData.textureCell = textureCell;
    material.userData.textureRepeat = textureRepeat;
    this.surfaceMaterials.add(material);
    return material;
  }

  async _loadTextureAtlas() {
    this.textureAtlasImage = await loadImage(this.textureAtlasUrl);
    return this.textureAtlasImage;
  }

  _createAtlasTexture(cellIndex, repeat = 1) {
    if (!this.textureAtlasImage) return null;
    const cacheKey = `${cellIndex}:${repeat}`;
    if (this.textureCache.has(cacheKey)) return this.textureCache.get(cacheKey);

    const image = this.textureAtlasImage;
    const col = cellIndex % ATLAS_GRID;
    const row = Math.floor(cellIndex / ATLAS_GRID);
    const xBounds = getCellBounds(col, image.width);
    const yBounds = getCellBounds(row, image.height);
    const canvas = document.createElement('canvas');
    canvas.width = xBounds.size;
    canvas.height = yBounds.size;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(
      image,
      xBounds.start,
      yBounds.start,
      xBounds.size,
      yBounds.size,
      0,
      0,
      xBounds.size,
      yBounds.size,
    );

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.generateMipmaps = false;
    texture.needsUpdate = true;
    texture.repeat.set(repeat, repeat);
    this.textureCache.set(cacheKey, texture);
    return texture;
  }

  _applyTextureAtlas() {
    if (!this.textureAtlasImage) return;

    this.surfaceMaterials.forEach((material) => {
      const cellIndex = material.userData?.textureCell;
      if (cellIndex == null) return;

      const texture = this._createAtlasTexture(cellIndex, material.userData.textureRepeat ?? 1);
      if (!texture) return;
      material.map = texture;
      material.needsUpdate = true;
    });
  }

  refreshColliders() {
    this.group.updateMatrixWorld(true);
    this.colliders.forEach((collider) => {
      collider.aabb = AABB.fromMesh(collider.mesh);
    });
    return this.colliders;
  }

  buildRoom() {
    this.buildFloorAndWalls();
    this.buildFurniture();
    this.buildLoot();
  }

  buildFloorAndWalls() {
    const floorMat = this._createSurfaceMaterial(this.floorColor, {
      textureCell: ROOM_TEXTURE_CELLS.floor,
      textureRepeat: 4 * ROOM_TEXTURE_REPEAT_MULTIPLIER,
    });
    const wallMat = this._createSurfaceMaterial(this.wallColor, {
      textureCell: ROOM_TEXTURE_CELLS.wall,
      textureRepeat: 2 * ROOM_TEXTURE_REPEAT_MULTIPLIER,
    });

    // Floor
    const floorGeo = new THREE.PlaneGeometry(this.width, this.depth);
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI * 0.5;
    floor.position.y = 0;
    floor.name = 'Floor';
    this.group.add(floor);
    this.colliders.push({
      mesh: floor,
      aabb: AABB.fromMesh(floor),
      type: 'surface',
      metadata: { runnable: true }, // Can run on floor
    });
    this.runnables.push(floor);

    // Walls: back, front, left, right
    const wallThickness = 0.2;

    // Back wall
    const backWallGeo = new THREE.BoxGeometry(this.width, this.height, wallThickness);
    const backWall = new THREE.Mesh(backWallGeo, wallMat);
    backWall.position.set(0, this.height * 0.5, -this.depth * 0.5);
    backWall.name = 'BackWall';
    this.group.add(backWall);
    this.colliders.push({
      mesh: backWall,
      aabb: AABB.fromMesh(backWall),
      type: 'wall',
    });

    // Front wall
    const frontWall = new THREE.Mesh(backWallGeo, wallMat);
    frontWall.position.set(0, this.height * 0.5, this.depth * 0.5);
    frontWall.name = 'FrontWall';
    this.group.add(frontWall);
    this.colliders.push({
      mesh: frontWall,
      aabb: AABB.fromMesh(frontWall),
      type: 'wall',
    });

    // Left wall
    const sideWallGeo = new THREE.BoxGeometry(wallThickness, this.height, this.depth);
    const leftWall = new THREE.Mesh(sideWallGeo, wallMat);
    leftWall.position.set(-this.width * 0.5, this.height * 0.5, 0);
    leftWall.name = 'LeftWall';
    this.group.add(leftWall);
    this.colliders.push({
      mesh: leftWall,
      aabb: AABB.fromMesh(leftWall),
      type: 'wall',
    });

    // Right wall
    const rightWall = new THREE.Mesh(sideWallGeo, wallMat);
    rightWall.position.set(this.width * 0.5, this.height * 0.5, 0);
    rightWall.name = 'RightWall';
    this.group.add(rightWall);
    this.colliders.push({
      mesh: rightWall,
      aabb: AABB.fromMesh(rightWall),
      type: 'wall',
    });

    // Ceiling
    const ceilingGeo = new THREE.PlaneGeometry(this.width, this.depth);
    const ceiling = new THREE.Mesh(ceilingGeo, wallMat);
    ceiling.rotation.x = Math.PI * 0.5;
    ceiling.position.y = this.height;
    ceiling.name = 'Ceiling';
    this.group.add(ceiling);
    this.colliders.push({
      mesh: ceiling,
      aabb: AABB.fromMesh(ceiling),
      type: 'surface',
    });
  }

  buildFurniture() {
    const addBox = ({
      name,
      width,
      height,
      depth,
      material,
      position,
      rotation = [0, 0, 0],
      type = 'furniture',
      collider = true,
      runnable = false,
      climbable = false,
      parent = this.group,
      userData = {},
    }) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material);
      mesh.position.set(position[0], position[1], position[2]);
      mesh.rotation.set(rotation[0], rotation[1], rotation[2]);
      mesh.name = name;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      Object.assign(mesh.userData, userData);
      parent.add(mesh);

      if (collider) {
        this.colliders.push({
          mesh,
          aabb: AABB.fromMesh(mesh),
          type,
          metadata: { runnable, climbable, ...userData },
        });
      }

      if (runnable) this.runnables.push(mesh);
      if (climbable) this.climbables.push(mesh);
      return mesh;
    };

    const woodMat = this._createSurfaceMaterial(this.furnitureColor, {
      textureCell: ROOM_TEXTURE_CELLS.cabinet,
      textureRepeat: 2 * ROOM_TEXTURE_REPEAT_MULTIPLIER,
    });
    const woodAltMat = this._createSurfaceMaterial(this.furnitureColor, {
      textureCell: ROOM_TEXTURE_CELLS.woodAlt,
      textureRepeat: 2 * ROOM_TEXTURE_REPEAT_MULTIPLIER,
    });
    const counterMat = this._createSurfaceMaterial('#d7c6af', {
      textureCell: ROOM_TEXTURE_CELLS.counter,
      textureRepeat: 2 * ROOM_TEXTURE_REPEAT_MULTIPLIER,
    });
    const backsplashMat = this._createSurfaceMaterial('#dfeaf4', {
      textureCell: ROOM_TEXTURE_CELLS.tile,
      textureRepeat: 2 * ROOM_TEXTURE_REPEAT_MULTIPLIER,
    });
    const applianceMat = this._createSurfaceMaterial('#d8d8d8', {
      textureCell: ROOM_TEXTURE_CELLS.appliance,
      textureRepeat: 1 * ROOM_TEXTURE_REPEAT_MULTIPLIER,
    });
    const fabricMat = this._createSurfaceMaterial('#eadfbc', {
      textureCell: ROOM_TEXTURE_CELLS.fabric,
      textureRepeat: 2 * ROOM_TEXTURE_REPEAT_MULTIPLIER,
    });

    // Back-wall counter run with stove, sink, and cabinets.
    const counterY = 0.9;
    const counterZ = -this.depth * 0.5 + 0.55;
    const baseDepth = 0.72;

    addBox({
      name: 'BackCounterLeft',
      width: 1.4,
      height: 0.9,
      depth: baseDepth,
      material: woodMat,
      position: [-2.05, counterY * 0.5, counterZ],
    });

    addBox({
      name: 'BackCounterSink',
      width: 1.7,
      height: 0.9,
      depth: baseDepth,
      material: woodMat,
      position: [-0.25, counterY * 0.5, counterZ],
    });

    addBox({
      name: 'BackCounterRight',
      width: 1.45,
      height: 0.9,
      depth: baseDepth,
      material: woodMat,
      position: [1.7, counterY * 0.5, counterZ],
    });

    const counterTop = addBox({
      name: 'BackCounterTop',
      width: 4.8,
      height: 0.12,
      depth: 0.78,
      material: counterMat,
      position: [0, counterY + 0.06, counterZ],
      type: 'surface',
      runnable: true,
    });

    addBox({
      name: 'CounterBacksplash',
      width: 4.8,
      height: 0.56,
      depth: 0.08,
      material: backsplashMat,
      position: [0, 1.34, this.depth * -0.5 + 0.47],
      type: 'wall',
    });

    addBox({
      name: 'UpperCabinetLeft',
      width: 1.35,
      height: 0.65,
      depth: 0.42,
      material: woodAltMat,
      position: [-2.05, 1.83, this.depth * -0.5 + 0.45],
    });
    addBox({
      name: 'UpperCabinetCenter',
      width: 1.8,
      height: 0.65,
      depth: 0.42,
      material: woodAltMat,
      position: [-0.2, 1.83, this.depth * -0.5 + 0.45],
    });
    addBox({
      name: 'UpperCabinetRight',
      width: 1.55,
      height: 0.65,
      depth: 0.42,
      material: woodAltMat,
      position: [1.7, 1.83, this.depth * -0.5 + 0.45],
    });

    addBox({
      name: 'StoveOven',
      width: 1.05,
      height: 0.95,
      depth: 0.62,
      material: applianceMat,
      position: [-2.02, 0.48, counterZ + 0.02],
      type: 'wall',
    });

    addBox({
      name: 'StoveTop',
      width: 1.08,
      height: 0.08,
      depth: 0.64,
      material: new THREE.MeshBasicMaterial({ color: '#111111' }),
      position: [-2.02, 0.91, counterZ + 0.02],
      type: 'wall',
      collider: false,
    });

    const knobPositions = [-2.23, -2.02, -1.81];
    knobPositions.forEach((x, i) => {
      addBox({
        name: `StoveKnob${i}`,
        width: 0.08,
        height: 0.04,
        depth: 0.05,
        material: new THREE.MeshBasicMaterial({ color: '#2b2b2b' }),
        position: [x, 0.79, counterZ + 0.33],
        type: 'furniture',
        collider: false,
      });
    });

    const sink = addBox({
      name: 'SinkBasin',
      width: 0.72,
      height: 0.2,
      depth: 0.5,
      material: applianceMat,
      position: [-0.35, 0.78, counterZ + 0.02],
      type: 'wall',
    });

    addBox({
      name: 'SinkFaucet',
      width: 0.08,
      height: 0.45,
      depth: 0.08,
      material: applianceMat,
      position: [-0.18, 1.0, counterZ + 0.18],
      type: 'wall',
      collider: false,
    });

    addBox({
      name: 'Microwave',
      width: 0.8,
      height: 0.42,
      depth: 0.5,
      material: applianceMat,
      position: [1.45, 1.15, counterZ + 0.04],
      type: 'furniture',
    });

    addBox({
      name: 'Fridge',
      width: 1.0,
      height: 2.05,
      depth: 0.8,
      material: applianceMat,
      position: [2.95, 1.025, -2.55],
      type: 'wall',
    });
    addBox({
      name: 'FridgeHandle',
      width: 0.06,
      height: 1.2,
      depth: 0.05,
      material: new THREE.MeshBasicMaterial({ color: '#e0e0e0' }),
      position: [3.43, 1.1, -2.15],
      type: 'furniture',
      collider: false,
    });

    addBox({
      name: 'TrashCan',
      width: 0.38,
      height: 0.62,
      depth: 0.38,
      material: new THREE.MeshBasicMaterial({ color: '#7f7f7f' }),
      position: [2.6, 0.31, 1.8],
      type: 'furniture',
      collider: true,
    });

    // Dining table with chairs.
    const tableHeight = 0.78;
    const tableTop = addBox({
      name: 'DiningTableTop',
      width: 2.25,
      height: 0.1,
      depth: 1.35,
      material: woodMat,
      position: [-1.9, tableHeight, 1.2],
      type: 'surface',
      runnable: true,
    });

    const tableLegPositions = [
      [-2.8, tableHeight * 0.5, 0.55],
      [-1.0, tableHeight * 0.5, 0.55],
      [-2.8, tableHeight * 0.5, 1.85],
      [-1.0, tableHeight * 0.5, 1.85],
    ];

    tableLegPositions.forEach((position, i) => {
      addBox({
        name: `DiningTableLeg${i}`,
        width: 0.12,
        height: tableHeight,
        depth: 0.12,
        material: woodMat,
        position,
        type: 'climbable',
        climbable: true,
      });
    });

    const chairPositions = [
      [-2.9, 0, 0.6, 0],
      [-0.9, 0, 0.6, 0],
      [-2.9, 0, 1.85, Math.PI],
      [-0.9, 0, 1.85, Math.PI],
    ];

    chairPositions.forEach((entry, i) => {
      const [x, , z, rotationY] = entry;
      addBox({
        name: `DiningChairSeat${i}`,
        width: 0.5,
        height: 0.1,
        depth: 0.5,
        material: fabricMat,
        position: [x, 0.45, z],
        rotation: [0, rotationY, 0],
        type: 'surface',
        runnable: true,
      });
      addBox({
        name: `DiningChairBack${i}`,
        width: 0.5,
        height: 0.75,
        depth: 0.1,
        material: woodAltMat,
        position: [x, 0.82, z - 0.22],
        rotation: [0, rotationY, 0],
        type: 'wall',
      });
    });

    // Closed doors for later interaction.
    this.closedDoors = [];
    const frontDoor = addBox({
      name: 'FrontDoor',
      width: 0.95,
      height: 2.1,
      depth: 0.12,
      material: woodMat,
      position: [3.0, 1.05, this.depth * 0.5 - 0.09],
      type: 'wall',
      userData: { openable: true, closed: true, hinge: 'left' },
    });
    this.closedDoors.push(frontDoor);

    const pantryDoor = addBox({
      name: 'PantryDoor',
      width: 0.82,
      height: 2.0,
      depth: 0.12,
      material: woodMat,
      position: [-this.width * 0.5 + 0.09, 1.0, 1.1],
      rotation: [0, Math.PI * 0.5, 0],
      type: 'wall',
      userData: { openable: true, closed: true, hinge: 'right' },
    });
    this.closedDoors.push(pantryDoor);

    // Decorative kitchen window above the sink.
    addBox({
      name: 'KitchenWindowFrame',
      width: 1.8,
      height: 1.0,
      depth: 0.08,
      material: new THREE.MeshBasicMaterial({ color: '#e6d2b0' }),
      position: [-0.35, 1.85, this.depth * -0.5 + 0.5],
      type: 'furniture',
      collider: false,
    });
    addBox({
      name: 'KitchenWindowGlass',
      width: 1.45,
      height: 0.72,
      depth: 0.03,
      material: new THREE.MeshBasicMaterial({ color: '#a7d8ff', transparent: true, opacity: 0.55 }),
      position: [-0.35, 1.83, this.depth * -0.5 + 0.46],
      type: 'furniture',
      collider: false,
    });

    // Back-counter accessories.
    addBox({
      name: 'DishRack',
      width: 0.6,
      height: 0.15,
      depth: 0.42,
      material: new THREE.MeshBasicMaterial({ color: '#d9d9d9' }),
      position: [0.95, 1.0, counterZ + 0.12],
      type: 'furniture',
      collider: false,
    });
    addBox({
      name: 'DishTowel',
      width: 0.28,
      height: 0.55,
      depth: 0.05,
      material: fabricMat,
      position: [1.55, 0.88, counterZ + 0.36],
      type: 'furniture',
      collider: false,
    });

    // Keep references for future interaction.
    this.kitchenFixtures = {
      counterTop,
      sink,
      tableTop,
      fridge: this.group.getObjectByName('Fridge'),
    };
  }

  buildLoot() {
    // Cheese wedge: glowing loot item on countertop
    const cheeseGeo = new THREE.TetrahedronGeometry(0.25, 0);
    const cheeseMat = this._createSurfaceMaterial('#ffdd66');
    cheeseMat.emissive = new THREE.Color('#ffcc00');
    cheeseMat.emissiveIntensity = 0.8;

    const counterTop = this.kitchenFixtures?.counterTop;
    const lootY = counterTop ? counterTop.position.y + 0.32 : 1.25;
    const lootZ = counterTop ? counterTop.position.z : -this.depth * 0.35;

    const cheese = new THREE.Mesh(cheeseGeo, cheeseMat);
    cheese.position.set(0.5, lootY, lootZ); // On top of counter
    cheese.name = 'CheeseLoot';
    cheese.castShadow = true;
    cheese.receiveShadow = true;
    cheese.userData.baseY = cheese.position.y;
    this.group.add(cheese);

    this.lootItems.push(cheese);
    this.colliders.push({
      mesh: cheese,
      aabb: AABB.fromMesh(cheese),
      type: 'loot',
      metadata: { itemId: 'cheese', carried: false },
    });

    // Particle sparkle effect (simple glow around cheese)
    const sparkleGeo = new THREE.SphereGeometry(0.35, 8, 8);
    const sparkleMat = new THREE.MeshBasicMaterial({
      color: '#ffdd88',
      transparent: true,
      opacity: 0.3,
      wireframe: true,
    });
    const sparkle = new THREE.Mesh(sparkleGeo, sparkleMat);
    sparkle.position.copy(cheese.position);
    sparkle.name = 'CheeseSparkle';
    this.group.add(sparkle);

    // Store sparkle for animation
    cheese.userData.sparkle = sparkle;
  }

  /**
   * Check collision between a player AABB and room colliders
   */
  checkCollision(playerAABB) {
    this.refreshColliders();
    return this.colliders.filter((col) => playerAABB.intersects(col.aabb));
  }

  getCollisionColliders() {
    return this.refreshColliders();
  }

  /**
   * Get all climbable surfaces
   */
  getClimbables() {
    return this.climbables;
  }

  /**
   * Get all runnable surfaces
   */
  getRunnables() {
    return this.runnables;
  }

  /**
   * Animate loot items (bobbing, rotation)
   */
  updateLoot(timeMs) {
    const t = timeMs * 0.001;

    this.lootItems.forEach((item) => {
      const baseY = item.userData.baseY ?? item.position.y;

      // Gentle bobbing (absolute position, no drift)
      item.position.y = baseY + Math.sin(t * 2) * 0.1;

      // Slow rotation
      item.rotation.x += 0.005;
      item.rotation.y += 0.008;

      // Sparkle animation
      if (item.userData.sparkle) {
        const scale = 1 + Math.sin(t * 3) * 0.15;
        item.userData.sparkle.scale.set(scale, scale, scale);
        item.userData.sparkle.position.y = item.position.y;
      }
    });
  }

  /**
   * Dispose resources
   */
  dispose() {
    this.group.traverse((child) => {
      if (child.geometry) child.geometry.dispose();
      if (child.material) {
        if (Array.isArray(child.material)) {
          child.material.forEach((m) => m.dispose());
        } else {
          child.material.dispose();
        }
      }
    });

    this.textureCache.forEach((texture) => texture.dispose?.());
    this.textureCache.clear();
    this.surfaceMaterials.clear();
  }

  /**
   * Get the THREE.Group for adding to scene
   */
  getGroup() {
    return this.group;
  }
}
