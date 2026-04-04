import * as THREE from 'three';
import { FACE_TEXTURE_SLOTS } from '../dev/prefabRegistry.js';
import { assetUrl } from '../utils/assetUrl.js';

const ATLAS_GRID = 10;
const ATLAS_CELL_MARGIN_PX = 3;
const BUILD_GRID_COLUMNS = 6;
const BUILD_GRID_ROWS = 6;
const BUILD_GRID_VERTICAL_STEP = 0.25;
const ROOM_TEXTURE_CELLS = Object.freeze({
  floor: 0,
  wall: 3,
  cabinet: 55,
  cabinetDark: 21,
  counter: 89,
  backsplash: 27,
  appliance: 44,
  fridge: 45,
  fabric: 94,
  woodAlt: 19,
  woodDark: 21,
  tile: 45,
});

const DEFAULT_EDITABLE_LAYOUT = Object.freeze({
  version: 1,
  primitives: [],
});

const EDITABLE_TYPE_DEFAULTS = Object.freeze({
  box: Object.freeze({
    scale: { x: 1, y: 1, z: 1 },
  }),
  plane: Object.freeze({
    scale: { x: 1, y: 1, z: 1 },
  }),
  cylinder: Object.freeze({
    scale: { x: 1, y: 1, z: 1 },
  }),
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

function createPrimitiveGeometry(type) {
  switch (type) {
    case 'plane':
      return new THREE.PlaneGeometry(1, 1);
    case 'cylinder':
      return new THREE.CylinderGeometry(0.5, 0.5, 1, 24, 1);
    case 'box':
    default:
      return new THREE.BoxGeometry(1, 1, 1);
  }
}

function normalizeTextureSettings(texture = {}) {
  if (typeof texture === 'number') {
    return { x: texture, y: texture, rotation: 0 };
  }

  return {
    x: texture?.x ?? 1,
    y: texture?.y ?? texture?.x ?? 1,
    rotation: texture?.rotation ?? 0,
  };
}

function cloneVectorLike(source, fallback) {
  return {
    x: source?.x ?? fallback.x,
    y: source?.y ?? fallback.y,
    z: source?.z ?? fallback.z,
  };
}

function cloneLayout(layout) {
  return JSON.parse(JSON.stringify(layout ?? DEFAULT_EDITABLE_LAYOUT));
}

function normalizeFaceTextures(type, value = {}) {
  const slots = FACE_TEXTURE_SLOTS[type] ?? [];
  const result = {};

  slots.forEach((slot) => {
    const cell = value?.[slot];
    if (Number.isFinite(cell) || cell === null) {
      result[slot] = cell;
    }
  });

  return result;
}

function getFaceTextureCell(definition, slot) {
  if (Object.prototype.hasOwnProperty.call(definition.faceTextures ?? {}, slot)) {
    return definition.faceTextures[slot];
  }

  return definition.texture.cell;
}

function snapToStep(value, step) {
  if (!Number.isFinite(step) || step <= 0) return value;
  return Math.round(value / step) * step;
}

function colorToHex(color, fallback = '#ffffff') {
  if (typeof color === 'string') return color;
  if (color?.isColor) return `#${color.getHexString()}`;
  return fallback;
}

function materialToEditableSurface(material, fallbackColor = '#ffffff') {
  return {
    color: colorToHex(material?.color, fallbackColor),
    roughness: material?.roughness ?? 0.88,
    metalness: material?.metalness ?? 0.04,
  };
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
    this.textureAtlasUrl = options.textureAtlasUrl ?? assetUrl('textures.webp');
    this.levelLayoutUrl = options.levelLayoutUrl ?? assetUrl('levels/kitchen-layout.json');
    this.buildGrid = {
      columns: options.buildGridColumns ?? BUILD_GRID_COLUMNS,
      rows: options.buildGridRows ?? BUILD_GRID_ROWS,
      verticalStep: options.buildGridVerticalStep ?? BUILD_GRID_VERTICAL_STEP,
    };
    this.textureAtlasImage = null;
    this.textureCache = new Map();
    this.surfaceMaterials = new Set();
    this.builtInEditableMeshes = new Map();
    this.deletedBuiltInPrimitives = new Set();
    this.loadedEditableLayout = cloneLayout(DEFAULT_EDITABLE_LAYOUT);
    this.editableGroup = new THREE.Group();
    this.editableGroup.name = 'EditableLayout';
    this.editableLayout = cloneLayout(DEFAULT_EDITABLE_LAYOUT);
    this.editableMeshes = new Map();
    this.ready = Promise.all([
      this._loadTextureAtlas(),
      this._loadEditableLayout(),
    ]).then(() => {
      this._applyLoadedEditableLayout();
      this._applyTextureAtlas();
      this._rebuildEditableLayout();
      return this;
    }).catch(() => this);

    // Materials
    this.floorColor = options.floorColor ?? '#d4a574'; // Wood
    this.wallColor = options.wallColor ?? '#e8dcc8'; // Plaster
    this.furnitureColor = options.furnitureColor ?? '#8b6f47'; // Wood furniture

    this.buildRoom();
    this.group.add(this.editableGroup);
  }

  _createSurfaceMaterial(baseColor, {
    textureCell = null,
    textureRepeat = 1,
    roughness = 0.92,
    metalness = 0.04,
    } = {}) {
    const material = new THREE.MeshStandardMaterial({
      color: new THREE.Color(baseColor),
      roughness,
      metalness,
    });

    material.dithering = true;
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
    const textureSettings = normalizeTextureSettings(repeat);
    const cacheKey = `${cellIndex}:${textureSettings.x}:${textureSettings.y}:${textureSettings.rotation}`;
    if (this.textureCache.has(cacheKey)) return this.textureCache.get(cacheKey);

    const image = this.textureAtlasImage;
    const col = cellIndex % ATLAS_GRID;
    const row = Math.floor(cellIndex / ATLAS_GRID);
    const xBounds = getCellBounds(col, image.width);
    const yBounds = getCellBounds(row, image.height);
    const cropMarginX = Math.min(ATLAS_CELL_MARGIN_PX, Math.floor((xBounds.size - 1) * 0.25));
    const cropMarginY = Math.min(ATLAS_CELL_MARGIN_PX, Math.floor((yBounds.size - 1) * 0.25));
    const sourceX = xBounds.start + cropMarginX;
    const sourceY = yBounds.start + cropMarginY;
    const sourceWidth = Math.max(1, xBounds.size - cropMarginX * 2);
    const sourceHeight = Math.max(1, yBounds.size - cropMarginY * 2);
    const canvas = document.createElement('canvas');
    canvas.width = xBounds.size;
    canvas.height = yBounds.size;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(
      image,
      sourceX,
      sourceY,
      sourceWidth,
      sourceHeight,
      0,
      0,
      xBounds.size,
      yBounds.size,
    );

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.generateMipmaps = true;
    texture.anisotropy = 8;
    texture.center.set(0.5, 0.5);
    texture.rotation = textureSettings.rotation;
    texture.needsUpdate = true;
    texture.repeat.set(textureSettings.x, textureSettings.y);
    this.textureCache.set(cacheKey, texture);
    return texture;
  }

  _applyTextureAtlas() {
    if (!this.textureAtlasImage) return;

    this.surfaceMaterials.forEach((material) => {
      const cellIndex = material.userData?.textureCell;
      if (cellIndex == null) {
        material.map = null;
        material.needsUpdate = true;
        return;
      }

      const texture = this._createAtlasTexture(cellIndex, material.userData.textureRepeat ?? 1);
      if (!texture) return;
      material.map = texture;
      material.needsUpdate = true;
    });
  }

  async _loadEditableLayout() {
    try {
      const response = await fetch(this.levelLayoutUrl, { cache: 'no-store' });
      if (!response.ok) return this.loadedEditableLayout;
      const layout = await response.json();
      this.loadedEditableLayout = {
        version: layout?.version ?? 1,
        primitives: Array.isArray(layout?.primitives) ? layout.primitives.map((entry) => this._normalizePrimitive(entry)) : [],
      };
    } catch {
      this.loadedEditableLayout = cloneLayout(DEFAULT_EDITABLE_LAYOUT);
    }

    return this.loadedEditableLayout;
  }

  _normalizePrimitive(entry = {}) {
    const type = entry.type === 'plane' || entry.type === 'cylinder' ? entry.type : 'box';
    const defaults = EDITABLE_TYPE_DEFAULTS[type] ?? EDITABLE_TYPE_DEFAULTS.box;
    const texture = entry.texture ?? {};

    return {
      id: entry.id ?? `primitive-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
      name: entry.name ?? `${type}-${(entry.id ?? 'item').slice(0, 4)}`,
      type,
      position: cloneVectorLike(entry.position, { x: 0, y: 0.5, z: 0 }),
      rotation: cloneVectorLike(entry.rotation, { x: 0, y: 0, z: 0 }),
      scale: cloneVectorLike(entry.scale, defaults.scale),
      texture: {
        cell: Number.isFinite(texture.cell) ? texture.cell : (texture.cell === null ? null : ROOM_TEXTURE_CELLS.tile),
        repeat: {
          x: texture.repeat?.x ?? 1,
          y: texture.repeat?.y ?? 1,
        },
        rotation: texture.rotation ?? 0,
      },
      faceTextures: normalizeFaceTextures(type, entry.faceTextures),
      material: {
        color: entry.material?.color ?? '#c9b391',
        roughness: entry.material?.roughness ?? 0.88,
        metalness: entry.material?.metalness ?? 0.04,
      },
      prefabId: entry.prefabId ?? null,
      prefabInstanceId: entry.prefabInstanceId ?? null,
      collider: entry.collider !== false,
      castShadow: entry.castShadow !== false,
      receiveShadow: entry.receiveShadow !== false,
      deleted: entry.deleted === true,
    };
  }

  _registerBuiltInPrimitive(mesh, definition, collider = null) {
    this._ensureUniqueEditableMaterials(mesh);

    const primitive = this._normalizePrimitive(definition);
    mesh.userData.editablePrimitive = true;
    mesh.userData.primitiveId = primitive.id;
    mesh.userData.colliderEnabled = primitive.collider;

    this.builtInEditableMeshes.set(primitive.id, {
      mesh,
      collider,
      primitive,
    });
    return primitive;
  }

  _ensureUniqueEditableMaterials(mesh) {
    if (!mesh?.material) return;

    const sourceMaterials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const clonedMaterials = sourceMaterials.map((material) => {
      if (!material) return material;
      const clone = material.clone();
      if (clone.userData?.textureCell != null || clone.userData?.textureRepeat != null) {
        this.surfaceMaterials.add(clone);
      }
      return clone;
    });

    mesh.material = Array.isArray(mesh.material) ? clonedMaterials : clonedMaterials[0];
  }

  _serializeBuiltInPrimitive(entry) {
    const { mesh } = entry;
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const material = materials[0];
    const textureRepeat = normalizeTextureSettings(material?.userData?.textureRepeat ?? 1);
    const faceTextures = {};

    (FACE_TEXTURE_SLOTS[entry.primitive.type] ?? []).forEach((slot, index) => {
      const faceMaterial = materials[index];
      if (!faceMaterial) return;
      const cell = faceMaterial.userData?.textureCell;
      if (Number.isFinite(cell) || cell === null) {
        faceTextures[slot] = cell;
      }
    });

    return {
      id: entry.primitive.id,
      name: mesh.name || entry.primitive.name,
      type: entry.primitive.type,
      position: {
        x: Number(mesh.position.x.toFixed(4)),
        y: Number(mesh.position.y.toFixed(4)),
        z: Number(mesh.position.z.toFixed(4)),
      },
      rotation: {
        x: Number(mesh.rotation.x.toFixed(4)),
        y: Number(mesh.rotation.y.toFixed(4)),
        z: Number(mesh.rotation.z.toFixed(4)),
      },
      scale: {
        x: Number(mesh.scale.x.toFixed(4)),
        y: Number(mesh.scale.y.toFixed(4)),
        z: Number(mesh.scale.z.toFixed(4)),
      },
      texture: {
        cell: material?.userData?.textureCell ?? null,
        repeat: {
          x: Number(textureRepeat.x.toFixed(4)),
          y: Number(textureRepeat.y.toFixed(4)),
        },
        rotation: Number(textureRepeat.rotation.toFixed(4)),
      },
      material: materialToEditableSurface(material, entry.primitive.material.color),
      faceTextures,
      prefabId: entry.primitive.prefabId ?? null,
      prefabInstanceId: entry.primitive.prefabInstanceId ?? null,
      collider: mesh.userData.colliderEnabled !== false,
      castShadow: mesh.castShadow !== false,
      receiveShadow: mesh.receiveShadow !== false,
      deleted: this.deletedBuiltInPrimitives.has(entry.primitive.id),
    };
  }

  _applyPrimitiveToMesh(primitive, mesh) {
    mesh.name = primitive.name;
    mesh.position.set(primitive.position.x, primitive.position.y, primitive.position.z);
    mesh.rotation.set(primitive.rotation.x, primitive.rotation.y, primitive.rotation.z);
    mesh.scale.set(primitive.scale.x, primitive.scale.y, primitive.scale.z);
    mesh.castShadow = primitive.castShadow;
    mesh.receiveShadow = primitive.receiveShadow;
    mesh.visible = !primitive.deleted;
    mesh.userData.colliderEnabled = primitive.collider;

    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const faceSlots = FACE_TEXTURE_SLOTS[primitive.type] ?? [];
    materials.forEach((material, index) => {
      if (!material) return;
      if (material.color) {
        material.color.set(primitive.material.color);
      }
      if ('roughness' in material) {
        material.roughness = primitive.material.roughness;
      }
      if ('metalness' in material) {
        material.metalness = primitive.material.metalness;
      }
      const slot = faceSlots[index];
      material.userData.textureCell = slot ? getFaceTextureCell(primitive, slot) : primitive.texture.cell;
      material.userData.textureRepeat = {
        x: primitive.texture.repeat.x,
        y: primitive.texture.repeat.y,
        rotation: primitive.texture.rotation,
      };
      material.side = primitive.type === 'plane' ? THREE.DoubleSide : material.side;
      material.needsUpdate = true;
    });
  }

  _applyLoadedEditableLayout() {
    const builtInIds = new Set(this.builtInEditableMeshes.keys());
    const customPrimitives = [];

    this.deletedBuiltInPrimitives.clear();

    for (const primitive of this.loadedEditableLayout.primitives) {
      if (builtInIds.has(primitive.id)) {
        const entry = this.builtInEditableMeshes.get(primitive.id);
        if (!entry) continue;
        this._applyPrimitiveToMesh(primitive, entry.mesh);
        if (primitive.deleted) {
          this.deletedBuiltInPrimitives.add(primitive.id);
        }
      } else if (!primitive.deleted) {
        customPrimitives.push(primitive);
      }
    }

    this.editableLayout = {
      version: this.loadedEditableLayout.version ?? 1,
      primitives: customPrimitives,
    };
  }

  _createEditablePrimitiveMaterial(definition) {
    const materialOptions = {
      textureRepeat: {
        x: definition.texture.repeat.x,
        y: definition.texture.repeat.y,
        rotation: definition.texture.rotation,
      },
      roughness: definition.material.roughness,
      metalness: definition.material.metalness,
    };
    const faceSlots = FACE_TEXTURE_SLOTS[definition.type] ?? [];

    if (faceSlots.length > 0) {
      return faceSlots.map((slot) => this._createSurfaceMaterial(definition.material.color, {
        ...materialOptions,
        textureCell: getFaceTextureCell(definition, slot),
      }));
    }

    const material = this._createSurfaceMaterial(definition.material.color, {
      ...materialOptions,
      textureCell: definition.texture.cell,
    });

    if (definition.type === 'plane') {
      material.side = THREE.DoubleSide;
    }

    return material;
  }

  _removeEditableColliders() {
    this.colliders = this.colliders.filter((entry) => entry.metadata?.source !== 'editable');
    this.runnables = this.runnables.filter((mesh) => mesh.userData?.editablePrimitive !== true);
    this.climbables = this.climbables.filter((mesh) => mesh.userData?.editablePrimitive !== true);
  }

  _rebuildEditableLayout() {
    this._removeEditableColliders();

    this.editableGroup.traverse((child) => {
      if (child.geometry) child.geometry.dispose();
      if (child.material) child.material.dispose();
    });
    this.editableGroup.clear();
    this.editableMeshes.clear();

    for (const primitive of this.editableLayout.primitives) {
      const geometry = createPrimitiveGeometry(primitive.type);
      const material = this._createEditablePrimitiveMaterial(primitive);
      const mesh = new THREE.Mesh(geometry, material);
      mesh.name = primitive.name;
      mesh.position.set(primitive.position.x, primitive.position.y, primitive.position.z);
      mesh.rotation.set(primitive.rotation.x, primitive.rotation.y, primitive.rotation.z);
      mesh.scale.set(primitive.scale.x, primitive.scale.y, primitive.scale.z);
      mesh.castShadow = primitive.castShadow;
      mesh.receiveShadow = primitive.receiveShadow;
      mesh.visible = !primitive.deleted;
      mesh.userData.editablePrimitive = true;
      mesh.userData.primitiveId = primitive.id;
      mesh.userData.colliderEnabled = primitive.collider;
      this.editableGroup.add(mesh);
      this.editableMeshes.set(primitive.id, mesh);

      if (primitive.collider) {
        this.colliders.push({
          mesh,
          aabb: AABB.fromMesh(mesh),
          type: primitive.type === 'plane' ? 'surface' : 'furniture',
          metadata: {
            source: 'editable',
            primitiveId: primitive.id,
          },
        });
      }
    }

    this._applyTextureAtlas();
    this.refreshColliders();
  }

  getEditableLayout() {
    const builtIns = Array.from(this.builtInEditableMeshes.values()).map((entry) => this._serializeBuiltInPrimitive(entry));
    const customs = this.editableLayout.primitives.map((entry) => this._normalizePrimitive(entry));
    return {
      version: Math.max(this.loadedEditableLayout.version ?? 1, this.editableLayout.version ?? 1, 1),
      primitives: [...builtIns, ...customs],
    };
  }

  setEditableLayout(layout) {
    this.loadedEditableLayout = {
      version: layout?.version ?? 1,
      primitives: Array.isArray(layout?.primitives) ? layout.primitives.map((entry) => this._normalizePrimitive(entry)) : [],
    };
    this._applyLoadedEditableLayout();
    this._rebuildEditableLayout();
    return this.getEditableLayout();
  }

  upsertEditablePrimitive(definition) {
    const primitive = this._normalizePrimitive(definition);
    if (this.builtInEditableMeshes.has(primitive.id)) {
      const entry = this.builtInEditableMeshes.get(primitive.id);
      this.deletedBuiltInPrimitives.delete(primitive.id);
      primitive.deleted = false;
      entry.primitive = primitive;
      this._applyPrimitiveToMesh(primitive, entry.mesh);
      this.refreshColliders();
      this._applyTextureAtlas();
      return primitive;
    }
    const index = this.editableLayout.primitives.findIndex((entry) => entry.id === primitive.id);
    if (index >= 0) {
      this.editableLayout.primitives[index] = primitive;
    } else {
      this.editableLayout.primitives.push(primitive);
    }
    this._rebuildEditableLayout();
    return primitive;
  }

  removeEditablePrimitive(id) {
    if (this.builtInEditableMeshes.has(id)) {
      const entry = this.builtInEditableMeshes.get(id);
      this.deletedBuiltInPrimitives.add(id);
      entry.mesh.visible = false;
      entry.mesh.userData.colliderEnabled = false;
      this.refreshColliders();
      return;
    }
    this.editableLayout.primitives = this.editableLayout.primitives.filter((entry) => entry.id !== id);
    this._rebuildEditableLayout();
  }

  getEditableMesh(id) {
    if (this.builtInEditableMeshes.has(id)) {
      return this.builtInEditableMeshes.get(id)?.mesh ?? null;
    }

    return this.editableMeshes.get(id) ?? null;
  }

  updateEditablePrimitiveTransform(id, transform = {}) {
    if (!id) return null;

    if (this.builtInEditableMeshes.has(id)) {
      const entry = this.builtInEditableMeshes.get(id);
      const next = this._serializeBuiltInPrimitive(entry);

      if (transform.position) {
        next.position = cloneVectorLike(transform.position, next.position);
      }
      if (transform.rotation) {
        next.rotation = cloneVectorLike(transform.rotation, next.rotation);
      }
      if (transform.scale) {
        next.scale = cloneVectorLike(transform.scale, next.scale);
      }

      return this.upsertEditablePrimitive(next);
    }

    const index = this.editableLayout.primitives.findIndex((entry) => entry.id === id);
    if (index < 0) return null;

    const primitive = this._normalizePrimitive(this.editableLayout.primitives[index]);
    if (transform.position) {
      primitive.position = cloneVectorLike(transform.position, primitive.position);
    }
    if (transform.rotation) {
      primitive.rotation = cloneVectorLike(transform.rotation, primitive.rotation);
    }
    if (transform.scale) {
      primitive.scale = cloneVectorLike(transform.scale, primitive.scale);
    }

    this.editableLayout.primitives[index] = primitive;
    const mesh = this.editableMeshes.get(id);
    if (mesh) {
      mesh.position.set(primitive.position.x, primitive.position.y, primitive.position.z);
      mesh.rotation.set(primitive.rotation.x, primitive.rotation.y, primitive.rotation.z);
      mesh.scale.set(primitive.scale.x, primitive.scale.y, primitive.scale.z);
      mesh.updateMatrixWorld(true);
    }
    this.refreshColliders();
    return primitive;
  }

  refreshColliders() {
    this.group.updateMatrixWorld(true);
    const active = [];
    this.colliders.forEach((collider) => {
      if (!collider.mesh?.visible || collider.mesh?.userData?.colliderEnabled === false) {
        return;
      }
      collider.aabb = AABB.fromMesh(collider.mesh);
      active.push(collider);
    });
    return active;
  }

  getBuildGridConfig() {
    const columns = Math.max(1, this.buildGrid.columns);
    const rows = Math.max(1, this.buildGrid.rows);
    return {
      columns,
      rows,
      cellWidth: this.width / columns,
      cellDepth: this.depth / rows,
      verticalStep: this.buildGrid.verticalStep,
      roomWidth: this.width,
      roomDepth: this.depth,
    };
  }

  getBuildGridAnchorPosition(col, row, spanX = 1, spanZ = 1) {
    const grid = this.getBuildGridConfig();
    const safeSpanX = Math.max(1, Math.round(spanX));
    const safeSpanZ = Math.max(1, Math.round(spanZ));
    const clampedCol = THREE.MathUtils.clamp(col, 0, grid.columns - safeSpanX);
    const clampedRow = THREE.MathUtils.clamp(row, 0, grid.rows - safeSpanZ);
    return new THREE.Vector3(
      -grid.roomWidth * 0.5 + (clampedCol + safeSpanX * 0.5) * grid.cellWidth,
      0,
      -grid.roomDepth * 0.5 + (clampedRow + safeSpanZ * 0.5) * grid.cellDepth,
    );
  }

  _getPrimitiveFootprint(primitive) {
    if (primitive.type === 'plane') {
      return {
        width: Math.max(0.0001, primitive.scale.x),
        depth: Math.max(0.0001, primitive.scale.y),
      };
    }

    return {
      width: Math.max(0.0001, primitive.scale.x),
      depth: Math.max(0.0001, primitive.scale.z),
    };
  }

  _snapGridScale(value, cellSize) {
    if (!Number.isFinite(value)) return cellSize;
    return Math.max(cellSize, Math.round(value / cellSize) * cellSize);
  }

  _snapGridAxisPosition(value, footprint, totalSize, cellSize) {
    const halfRoom = totalSize * 0.5;
    const clampedFootprint = Math.min(Math.max(footprint, cellSize), totalSize);
    const min = -halfRoom + (clampedFootprint * 0.5);
    const max = halfRoom - (clampedFootprint * 0.5);

    if (max <= min) {
      return 0;
    }

    const snapped = min + Math.round((value - min) / cellSize) * cellSize;
    return THREE.MathUtils.clamp(snapped, min, max);
  }

  snapPrimitiveToGrid(definition, { snapY = false, snapScale = false } = {}) {
    const primitive = this._normalizePrimitive(definition);
    const grid = this.getBuildGridConfig();

    if (snapScale) {
      if (primitive.type === 'plane') {
        primitive.scale.x = this._snapGridScale(primitive.scale.x, grid.cellWidth);
        primitive.scale.y = this._snapGridScale(primitive.scale.y, grid.cellDepth);
      } else {
        primitive.scale.x = this._snapGridScale(primitive.scale.x, grid.cellWidth);
        primitive.scale.z = this._snapGridScale(primitive.scale.z, grid.cellDepth);
      }
    }

    const footprint = this._getPrimitiveFootprint(primitive);
    primitive.position.x = this._snapGridAxisPosition(
      primitive.position.x,
      footprint.width,
      grid.roomWidth,
      grid.cellWidth,
    );
    primitive.position.z = this._snapGridAxisPosition(
      primitive.position.z,
      footprint.depth,
      grid.roomDepth,
      grid.cellDepth,
    );

    if (snapY) {
      primitive.position.y = snapToStep(primitive.position.y, grid.verticalStep);
    }

    primitive.position.x = Number(primitive.position.x.toFixed(4));
    primitive.position.y = Number(primitive.position.y.toFixed(4));
    primitive.position.z = Number(primitive.position.z.toFixed(4));
    primitive.scale.x = Number(primitive.scale.x.toFixed(4));
    primitive.scale.y = Number(primitive.scale.y.toFixed(4));
    primitive.scale.z = Number(primitive.scale.z.toFixed(4));
    return primitive;
  }

  instantiatePrefab(prefab, {
    col = 0,
    row = 0,
    instanceId = `prefab-instance-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
  } = {}) {
    if (!prefab?.id || !Array.isArray(prefab.primitives)) {
      return [];
    }

    const size = {
      x: Math.max(1, Math.round(prefab.size?.x ?? 1)),
      y: Math.max(1, Math.round(prefab.size?.y ?? 1)),
      z: Math.max(1, Math.round(prefab.size?.z ?? 1)),
    };
    const anchor = this.getBuildGridAnchorPosition(col, row, size.x, size.z);
    const created = [];

    prefab.primitives.forEach((part, index) => {
      const primitive = this._normalizePrimitive({
        ...part,
        id: `${instanceId}-part-${index + 1}`,
        name: `${prefab.name}-${part.name ?? `part-${index + 1}`}`,
        position: {
          x: anchor.x + (part.position?.x ?? 0),
          y: part.position?.y ?? 0,
          z: anchor.z + (part.position?.z ?? 0),
        },
        prefabId: prefab.id,
        prefabInstanceId: instanceId,
      });
      this.upsertEditablePrimitive(primitive);
      created.push(primitive.id);
    });

    return created;
  }

  buildRoom() {
    this.buildFloorAndWalls();
    this.buildFurniture();
    this.buildLoot();
  }

  buildFloorAndWalls() {
    const floorMat = this._createSurfaceMaterial(this.floorColor, {
      textureCell: ROOM_TEXTURE_CELLS.floor,
      textureRepeat: 6,
      roughness: 0.98,
      metalness: 0.02,
    });
    const wallMat = this._createSurfaceMaterial(this.wallColor, {
      textureCell: ROOM_TEXTURE_CELLS.wall,
      textureRepeat: 1,
      roughness: 1,
      metalness: 0,
    });

    // Floor
    const floorGeo = new THREE.PlaneGeometry(this.width, this.depth);
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI * 0.5;
    floor.position.y = 0;
    floor.name = 'Floor';
    floor.receiveShadow = true;
    this.group.add(floor);
    const floorCollider = {
      mesh: floor,
      aabb: AABB.fromMesh(floor),
      type: 'surface',
      metadata: { runnable: true }, // Can run on floor
    };
    this.colliders.push(floorCollider);
    this.runnables.push(floor);
    this._registerBuiltInPrimitive(floor, {
      id: 'builtin-floor',
      name: floor.name,
      type: 'plane',
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: floor.rotation.x, y: floor.rotation.y, z: floor.rotation.z },
      scale: { x: this.width, y: this.depth, z: 1 },
      texture: {
        cell: floorMat.userData.textureCell,
        repeat: normalizeTextureSettings(floorMat.userData.textureRepeat),
        rotation: 0,
      },
      material: materialToEditableSurface(floorMat, this.floorColor),
      collider: true,
      castShadow: false,
      receiveShadow: true,
    }, floorCollider);

    // Walls: back, front, left, right
    const wallThickness = 0.2;

    // Back wall
    const backWallGeo = new THREE.BoxGeometry(this.width, this.height, wallThickness);
    const backWall = new THREE.Mesh(backWallGeo, wallMat);
    backWall.position.set(0, this.height * 0.5, -this.depth * 0.5);
    backWall.name = 'BackWall';
    backWall.castShadow = true;
    backWall.receiveShadow = true;
    this.group.add(backWall);
    const backWallCollider = {
      mesh: backWall,
      aabb: AABB.fromMesh(backWall),
      type: 'wall',
    };
    this.colliders.push(backWallCollider);
    this._registerBuiltInPrimitive(backWall, {
      id: 'builtin-back-wall',
      name: backWall.name,
      type: 'box',
      position: { x: 0, y: this.height * 0.5, z: -this.depth * 0.5 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: this.width, y: this.height, z: wallThickness },
      texture: {
        cell: wallMat.userData.textureCell,
        repeat: normalizeTextureSettings(wallMat.userData.textureRepeat),
        rotation: 0,
      },
      material: materialToEditableSurface(wallMat, this.wallColor),
      collider: true,
    }, backWallCollider);

    // Front wall
    const frontWall = new THREE.Mesh(backWallGeo, wallMat);
    frontWall.position.set(0, this.height * 0.5, this.depth * 0.5);
    frontWall.name = 'FrontWall';
    frontWall.castShadow = true;
    frontWall.receiveShadow = true;
    this.group.add(frontWall);
    const frontWallCollider = {
      mesh: frontWall,
      aabb: AABB.fromMesh(frontWall),
      type: 'wall',
    };
    this.colliders.push(frontWallCollider);
    this._registerBuiltInPrimitive(frontWall, {
      id: 'builtin-front-wall',
      name: frontWall.name,
      type: 'box',
      position: { x: 0, y: this.height * 0.5, z: this.depth * 0.5 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: this.width, y: this.height, z: wallThickness },
      texture: {
        cell: wallMat.userData.textureCell,
        repeat: normalizeTextureSettings(wallMat.userData.textureRepeat),
        rotation: 0,
      },
      material: materialToEditableSurface(wallMat, this.wallColor),
      collider: true,
    }, frontWallCollider);

    // Left wall
    const sideWallGeo = new THREE.BoxGeometry(wallThickness, this.height, this.depth);
    const leftWall = new THREE.Mesh(sideWallGeo, wallMat);
    leftWall.position.set(-this.width * 0.5, this.height * 0.5, 0);
    leftWall.name = 'LeftWall';
    leftWall.castShadow = true;
    leftWall.receiveShadow = true;
    this.group.add(leftWall);
    const leftWallCollider = {
      mesh: leftWall,
      aabb: AABB.fromMesh(leftWall),
      type: 'wall',
    };
    this.colliders.push(leftWallCollider);
    this._registerBuiltInPrimitive(leftWall, {
      id: 'builtin-left-wall',
      name: leftWall.name,
      type: 'box',
      position: { x: -this.width * 0.5, y: this.height * 0.5, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: wallThickness, y: this.height, z: this.depth },
      texture: {
        cell: wallMat.userData.textureCell,
        repeat: normalizeTextureSettings(wallMat.userData.textureRepeat),
        rotation: 0,
      },
      material: materialToEditableSurface(wallMat, this.wallColor),
      collider: true,
    }, leftWallCollider);

    // Right wall
    const rightWall = new THREE.Mesh(sideWallGeo, wallMat);
    rightWall.position.set(this.width * 0.5, this.height * 0.5, 0);
    rightWall.name = 'RightWall';
    rightWall.castShadow = true;
    rightWall.receiveShadow = true;
    this.group.add(rightWall);
    const rightWallCollider = {
      mesh: rightWall,
      aabb: AABB.fromMesh(rightWall),
      type: 'wall',
    };
    this.colliders.push(rightWallCollider);
    this._registerBuiltInPrimitive(rightWall, {
      id: 'builtin-right-wall',
      name: rightWall.name,
      type: 'box',
      position: { x: this.width * 0.5, y: this.height * 0.5, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: wallThickness, y: this.height, z: this.depth },
      texture: {
        cell: wallMat.userData.textureCell,
        repeat: normalizeTextureSettings(wallMat.userData.textureRepeat),
        rotation: 0,
      },
      material: materialToEditableSurface(wallMat, this.wallColor),
      collider: true,
    }, rightWallCollider);

    // Ceiling
    const ceilingGeo = new THREE.PlaneGeometry(this.width, this.depth);
    const ceiling = new THREE.Mesh(ceilingGeo, wallMat);
    ceiling.rotation.x = Math.PI * 0.5;
    ceiling.position.y = this.height;
    ceiling.name = 'Ceiling';
    ceiling.receiveShadow = true;
    this.group.add(ceiling);
    const ceilingCollider = {
      mesh: ceiling,
      aabb: AABB.fromMesh(ceiling),
      type: 'surface',
    };
    this.colliders.push(ceilingCollider);
    this._registerBuiltInPrimitive(ceiling, {
      id: 'builtin-ceiling',
      name: ceiling.name,
      type: 'plane',
      position: { x: 0, y: this.height, z: 0 },
      rotation: { x: ceiling.rotation.x, y: ceiling.rotation.y, z: ceiling.rotation.z },
      scale: { x: this.width, y: this.depth, z: 1 },
      texture: {
        cell: wallMat.userData.textureCell,
        repeat: normalizeTextureSettings(wallMat.userData.textureRepeat),
        rotation: 0,
      },
      material: materialToEditableSurface(wallMat, this.wallColor),
      collider: true,
      castShadow: false,
      receiveShadow: true,
    }, ceilingCollider);
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

      let colliderEntry = null;
      if (collider) {
        colliderEntry = {
          mesh,
          aabb: AABB.fromMesh(mesh),
          type,
          metadata: { runnable, climbable, ...userData },
        };
        this.colliders.push(colliderEntry);
      }

      if (runnable) this.runnables.push(mesh);
      if (climbable) this.climbables.push(mesh);
      this._registerBuiltInPrimitive(mesh, {
        id: `builtin-${name}`,
        name,
        type: 'box',
        position: { x: position[0], y: position[1], z: position[2] },
        rotation: { x: rotation[0], y: rotation[1], z: rotation[2] },
        scale: { x: width, y: height, z: depth },
        texture: {
          cell: mesh.material?.userData?.textureCell ?? null,
          repeat: normalizeTextureSettings(mesh.material?.userData?.textureRepeat ?? 1),
          rotation: 0,
        },
        material: materialToEditableSurface(mesh.material, '#ffffff'),
        collider,
        castShadow: mesh.castShadow,
        receiveShadow: mesh.receiveShadow,
      }, colliderEntry);
      return mesh;
    };

    const woodMat = this._createSurfaceMaterial(this.furnitureColor, {
      textureCell: ROOM_TEXTURE_CELLS.cabinet,
      textureRepeat: 1.5,
      roughness: 0.92,
      metalness: 0.04,
    });
    const woodAltMat = this._createSurfaceMaterial(this.furnitureColor, {
      textureCell: ROOM_TEXTURE_CELLS.cabinetDark,
      textureRepeat: 1,
      roughness: 0.95,
      metalness: 0.03,
    });
    const counterMat = this._createSurfaceMaterial('#d7c6af', {
      textureCell: ROOM_TEXTURE_CELLS.counter,
      textureRepeat: 1.25,
      roughness: 0.72,
      metalness: 0.08,
    });
    const backsplashMat = this._createSurfaceMaterial('#dfeaf4', {
      textureCell: ROOM_TEXTURE_CELLS.tile,
      textureRepeat: 2,
      roughness: 0.8,
      metalness: 0.05,
    });
    const applianceMat = this._createSurfaceMaterial('#d8d8d8', {
      textureCell: ROOM_TEXTURE_CELLS.appliance,
      textureRepeat: 1,
      roughness: 0.52,
      metalness: 0.18,
    });
    const fridgeMat = this._createSurfaceMaterial('#d8d8d8', {
      textureCell: ROOM_TEXTURE_CELLS.fridge,
      textureRepeat: 1,
      roughness: 0.48,
      metalness: 0.14,
    });
    const fabricMat = this._createSurfaceMaterial('#eadfbc', {
      textureCell: ROOM_TEXTURE_CELLS.fabric,
      textureRepeat: 1.5,
      roughness: 1,
      metalness: 0,
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
      material: fridgeMat,
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
    return this.climbables.filter((mesh) => mesh.visible !== false && mesh.userData?.colliderEnabled !== false);
  }

  /**
   * Get all runnable surfaces
   */
  getRunnables() {
    return this.runnables.filter((mesh) => mesh.visible !== false && mesh.userData?.colliderEnabled !== false);
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
