import * as THREE from 'three';
import { FACE_TEXTURE_SLOTS } from '../dev/prefabRegistry.js';
import { DEFAULT_TEXTURE_ATLAS, TEXTURE_ATLASES } from '../dev/textureAtlasRegistry.js';
import { assetUrl } from '../utils/assetUrl.js';

const ATLAS_GRID = 10;
const ATLAS_CELL_MARGIN_PX = 3;
const BUILD_GRID_COLUMNS = 24;
const BUILD_GRID_ROWS = 24;
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

function roundVectorLike(source, fallback) {
  return {
    x: Number((source?.x ?? fallback.x).toFixed(4)),
    y: Number((source?.y ?? fallback.y).toFixed(4)),
    z: Number((source?.z ?? fallback.z).toFixed(4)),
  };
}

function worldToLocalPrefabPosition(position, origin, rotation, scale) {
  const local = new THREE.Vector3(
    position.x - origin.x,
    position.y - origin.y,
    position.z - origin.z,
  );
  const inverseRotation = new THREE.Quaternion().setFromEuler(
    new THREE.Euler(rotation.x ?? 0, rotation.y ?? 0, rotation.z ?? 0),
  ).invert();
  local.applyQuaternion(inverseRotation);
  local.divide(new THREE.Vector3(
    Math.abs(scale.x) > 1e-6 ? scale.x : 1,
    Math.abs(scale.y) > 1e-6 ? scale.y : 1,
    Math.abs(scale.z) > 1e-6 ? scale.z : 1,
  ));
  return roundVectorLike(local, { x: 0, y: 0, z: 0 });
}

function normalizeTextureAtlasId(value) {
  return typeof value === 'string' && /^textures\d*$/i.test(value) ? value.toLowerCase() : DEFAULT_TEXTURE_ATLAS;
}

function cloneLayout(layout) {
  return JSON.parse(JSON.stringify(layout ?? DEFAULT_EDITABLE_LAYOUT));
}

function normalizeFaceTextures(type, value = {}) {
  const slots = FACE_TEXTURE_SLOTS[type] ?? [];
  const result = {};

  slots.forEach((slot) => {
    const ref = value?.[slot];
    if (ref == null) return;
    if (ref === null) {
      result[slot] = null;
      return;
    }
    if (typeof ref === 'number') {
      result[slot] = {
        atlas: DEFAULT_TEXTURE_ATLAS,
        cell: ref,
      };
      return;
    }
    result[slot] = {
      atlas: normalizeTextureAtlasId(ref.atlas),
      cell: Number.isFinite(ref.cell) ? ref.cell : 0,
    };
  });

  return result;
}

function getFaceTextureCell(definition, slot) {
  const ref = getFaceTextureRef(definition, slot);
  return ref?.cell ?? null;
}

function getFaceTextureAtlas(definition, slot) {
  const ref = getFaceTextureRef(definition, slot);
  return ref?.atlas ?? DEFAULT_TEXTURE_ATLAS;
}

function getFaceTextureRef(definition, slot) {
  if (Object.prototype.hasOwnProperty.call(definition.faceTextures ?? {}, slot)) {
    const value = definition.faceTextures[slot];
    if (value == null) return value;
    if (typeof value === 'number') {
      return {
        atlas: DEFAULT_TEXTURE_ATLAS,
        cell: value,
      };
    }
    return {
      atlas: normalizeTextureAtlasId(value.atlas),
      cell: Number.isFinite(value.cell) ? value.cell : null,
    };
  }

  return definition.texture;
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
    this.glbLoader = null;
    this.glbModelCache = new Map();
    this.glbRegistry = null;

    // Room dimensions
    this.width = options.width ?? 48;
    this.depth = options.depth ?? 48;
    this.height = options.height ?? 4;
    this.scaleFactor = options.scale ?? 1;
    this.group.scale.setScalar(this.scaleFactor);
    this.rendererMode = options.rendererMode ?? 'webgl';
    this.rendererToolkit = options.rendererToolkit ?? null;
    this.textureAtlasUrls = Object.fromEntries(TEXTURE_ATLASES.map((atlas) => [
      atlas.id,
      atlas.imageUrl,
    ]));
    this.levelLayoutUrl = options.levelLayoutUrl ?? assetUrl('levels/kitchen-layout.json');
    this.buildGrid = {
      columns: options.buildGridColumns ?? BUILD_GRID_COLUMNS,
      rows: options.buildGridRows ?? BUILD_GRID_ROWS,
      verticalStep: options.buildGridVerticalStep ?? BUILD_GRID_VERTICAL_STEP,
    };
    this.textureAtlasImage = null;
    this.textureAtlasImages = new Map();
    this.textureCache = new Map();
    this.surfaceMaterials = new Set();
    this.builtInEditableMeshes = new Map();
    this.deletedBuiltInPrimitives = new Set();
    this.loadedEditableLayout = cloneLayout(DEFAULT_EDITABLE_LAYOUT);
    this.editableGroup = new THREE.Group();
    this.editableGroup.name = 'EditableLayout';
    this.editableLayout = cloneLayout(DEFAULT_EDITABLE_LAYOUT);
    this.editableMeshes = new Map();
    this.prefabInstanceGroups = new Map();
    this.prefabInstanceIdByPrimitiveId = new Map();
    this.ready = Promise.all([
      this._loadTextureAtlas(),
      this._loadEditableLayout(),
    ]).then(() => this._loadGlbModels()).then(() => {
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
    textureAtlas = DEFAULT_TEXTURE_ATLAS,
    textureRepeat = 1,
    roughness = 0.92,
    metalness = 0.04,
    side = THREE.FrontSide,
    } = {}) {
    // Deduplicate materials with identical parameters
    const repeatKey = typeof textureRepeat === 'object'
      ? `${textureRepeat.x ?? 1},${textureRepeat.y ?? 1},${textureRepeat.rotation ?? 0}`
      : `${textureRepeat},${textureRepeat},0`;
    const cacheKey = `${baseColor}|${textureCell}|${textureAtlas}|${repeatKey}|${roughness}|${metalness}|${side}`;

    if (!this._materialCache) this._materialCache = new Map();
    const cached = this._materialCache.get(cacheKey);
    if (cached) return cached;

    const material = new THREE.MeshStandardMaterial({
      color: new THREE.Color(baseColor),
      roughness,
      metalness,
      side,
    });

    material.dithering = true;
    material.userData.textureAtlas = textureAtlas;
    material.userData.textureCell = textureCell;
    material.userData.textureRepeat = textureRepeat;
    this.surfaceMaterials.add(material);
    this._materialCache.set(cacheKey, material);
    return material;
  }

  async _loadTextureAtlas() {
    const loaded = [];
    for (const [atlas, url] of Object.entries(this.textureAtlasUrls)) {
      try {
        loaded.push([atlas, await loadImage(url)]);
      } catch (error) {
        if (atlas === DEFAULT_TEXTURE_ATLAS) {
          throw error;
        }
      }
    }
    this.textureAtlasImages = new Map(loaded);
    this.textureAtlasImage = this.textureAtlasImages.get(DEFAULT_TEXTURE_ATLAS) ?? null;
    return this.textureAtlasImage;
  }

  _createAtlasTexture(cellIndex, repeat = 1, atlas = DEFAULT_TEXTURE_ATLAS) {
    const atlasId = typeof repeat === 'object' && repeat?.atlas ? repeat.atlas : atlas;
    const image = this.textureAtlasImages.get(atlasId) ?? this.textureAtlasImage;
    if (!image) return null;
    const textureSettings = normalizeTextureSettings(repeat);
    const cacheKey = `${atlasId}:${cellIndex}:${textureSettings.x}:${textureSettings.y}:${textureSettings.rotation}`;
    if (this.textureCache.has(cacheKey)) return this.textureCache.get(cacheKey);

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
    if (!this.textureAtlasImages.size) return;

    this.surfaceMaterials.forEach((material) => {
      const cellIndex = material.userData?.textureCell;
      if (cellIndex == null) {
        material.map = null;
        material.needsUpdate = true;
        return;
      }

      const texture = this._createAtlasTexture(
        cellIndex,
        material.userData.textureRepeat ?? 1,
        material.userData.textureAtlas ?? DEFAULT_TEXTURE_ATLAS,
      );
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

  async _loadGlbRegistry() {
    if (this.glbRegistry) return this.glbRegistry;
    try {
      const response = await fetch(assetUrl('levels/glb-registry.json'), { cache: 'no-store' });
      if (!response.ok) return { assets: [] };
      this.glbRegistry = await response.json();
      return this.glbRegistry;
    } catch {
      return { assets: [] };
    }
  }

  async _initGlbLoader() {
    if (this.glbLoader) return;
    const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
    const { MeshoptDecoder } = await import('three/examples/jsm/libs/meshopt_decoder.module.js');
    this.glbLoader = new GLTFLoader();
    this.glbLoader.setMeshoptDecoder(MeshoptDecoder);
  }

  async _loadGlbModelByAssetId(assetId) {
    if (this.glbModelCache.has(assetId)) return this.glbModelCache.get(assetId);
    const registry = await this._loadGlbRegistry();
    const entry = registry.assets?.find((a) => a.id === assetId);
    if (!entry) return null;
    await this._initGlbLoader();
    const url = assetUrl(entry.publicPath);
    try {
      const gltf = await this.glbLoader.loadAsync(url);
      const scene = gltf.scene;
      scene.updateMatrixWorld(true);
      this.glbModelCache.set(assetId, scene);
      return scene;
    } catch (err) {
      console.warn(`Failed to load GLB asset ${assetId}:`, err);
      return null;
    }
  }

  async loadGlbModel(assetId) {
    return this._loadGlbModelByAssetId(assetId);
  }

  async _loadGlbModels() {
    const glbPrimitives = this.loadedEditableLayout.primitives.filter((p) => p.type === 'glb' && p.glbAssetId);
    if (!glbPrimitives.length) return;
    const assetIds = [...new Set(glbPrimitives.map((p) => p.glbAssetId))];
    await Promise.all(assetIds.map((id) => this._loadGlbModelByAssetId(id)));
  }

  _normalizePrimitive(entry = {}) {
    const type = entry.type === 'plane' || entry.type === 'cylinder' || entry.type === 'glb' ? entry.type : 'box';
    const defaults = EDITABLE_TYPE_DEFAULTS[type] ?? EDITABLE_TYPE_DEFAULTS.box;
    const texture = typeof entry.texture === 'number' ? { cell: entry.texture } : (entry.texture ?? {});
    const atlas = normalizeTextureAtlasId(texture.atlas);

    return {
      id: entry.id ?? `primitive-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
      name: entry.name ?? `${type}-${(entry.id ?? 'item').slice(0, 4)}`,
      type,
      position: cloneVectorLike(entry.position, { x: 0, y: 0.5, z: 0 }),
      rotation: cloneVectorLike(entry.rotation, { x: 0, y: 0, z: 0 }),
      scale: cloneVectorLike(entry.scale, defaults.scale),
      texture: {
        atlas,
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
      glbAssetId: entry.glbAssetId ?? null,
      prefabId: entry.prefabId ?? null,
      prefabInstanceId: entry.prefabInstanceId ?? null,
      prefabInstanceOrigin: entry.prefabInstanceOrigin ? cloneVectorLike(entry.prefabInstanceOrigin, { x: 0, y: 0, z: 0 }) : null,
      prefabInstanceRotation: entry.prefabInstanceRotation ? cloneVectorLike(entry.prefabInstanceRotation, { x: 0, y: 0, z: 0 }) : null,
      prefabInstanceScale: entry.prefabInstanceScale ? cloneVectorLike(entry.prefabInstanceScale, { x: 1, y: 1, z: 1 }) : null,
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
        faceTextures[slot] = {
          atlas: faceMaterial.userData?.textureAtlas ?? DEFAULT_TEXTURE_ATLAS,
          cell,
        };
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
        atlas: material?.userData?.textureAtlas ?? DEFAULT_TEXTURE_ATLAS,
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
      prefabInstanceOrigin: entry.primitive.prefabInstanceOrigin ?? null,
      prefabInstanceRotation: entry.primitive.prefabInstanceRotation ?? null,
      prefabInstanceScale: entry.primitive.prefabInstanceScale ?? null,
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
      const ref = slot ? getFaceTextureRef(primitive, slot) : primitive.texture;
      material.userData.textureCell = ref?.cell ?? null;
      material.userData.textureAtlas = ref?.atlas ?? DEFAULT_TEXTURE_ATLAS;
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

    this._normalizePrefabInstanceTransforms();
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
        textureAtlas: getFaceTextureAtlas(definition, slot),
      }));
    }

    const material = this._createSurfaceMaterial(definition.material.color, {
      ...materialOptions,
      textureCell: definition.texture.cell,
      textureAtlas: definition.texture.atlas ?? DEFAULT_TEXTURE_ATLAS,
      side: definition.type === 'plane' ? THREE.DoubleSide : THREE.FrontSide,
    });

    return material;
  }

  _normalizePrefabInstanceTransforms() {
    const groupedPrimitives = new Map();

    for (const primitive of this.editableLayout.primitives) {
      if (!primitive.prefabInstanceId) continue;
      const bucket = groupedPrimitives.get(primitive.prefabInstanceId) ?? [];
      bucket.push(primitive);
      groupedPrimitives.set(primitive.prefabInstanceId, bucket);
    }

    groupedPrimitives.forEach((primitives) => {
      const anchor = primitives[0];
      if (!anchor) return;

      const origin = cloneVectorLike(anchor.prefabInstanceOrigin ?? anchor.position, { x: 0, y: 0, z: 0 });
      const rotation = cloneVectorLike(anchor.prefabInstanceRotation ?? { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 });
      const scale = cloneVectorLike(anchor.prefabInstanceScale ?? { x: 1, y: 1, z: 1 }, { x: 1, y: 1, z: 1 });
      const needsMigration = primitives.some((primitive) => !primitive.prefabInstanceOrigin || !primitive.prefabInstanceRotation || !primitive.prefabInstanceScale);

      if (needsMigration) {
        primitives.forEach((primitive) => {
          primitive.position = worldToLocalPrefabPosition(primitive.position, origin, rotation, scale);
          primitive.prefabInstanceOrigin = cloneVectorLike(origin, { x: 0, y: 0, z: 0 });
          primitive.prefabInstanceRotation = cloneVectorLike(rotation, { x: 0, y: 0, z: 0 });
          primitive.prefabInstanceScale = cloneVectorLike(scale, { x: 1, y: 1, z: 1 });
        });
        return;
      }

      primitives.forEach((primitive) => {
        primitive.prefabInstanceOrigin = cloneVectorLike(origin, { x: 0, y: 0, z: 0 });
        primitive.prefabInstanceRotation = cloneVectorLike(rotation, { x: 0, y: 0, z: 0 });
        primitive.prefabInstanceScale = cloneVectorLike(scale, { x: 1, y: 1, z: 1 });
      });
    });
  }

  _removeEditableColliders() {
    this.colliders = this.colliders.filter((entry) => entry.metadata?.source !== 'editable');
    this.runnables = this.runnables.filter((mesh) => mesh.userData?.editablePrimitive !== true);
    this.climbables = this.climbables.filter((mesh) => mesh.userData?.editablePrimitive !== true);
  }

  _rebuildEditableLayout() {
    this._removeEditableColliders();

    this.editableGroup.traverse((child) => {
      if (child.userData?.isGlbClone) {
        if (Array.isArray(child.material)) {
          child.material.forEach((material) => material?.dispose?.());
        } else if (child.material) {
          child.material.dispose?.();
        }
        return;
      }
      if (child.geometry) child.geometry.dispose();
      if (Array.isArray(child.material)) {
        child.material.forEach((material) => material?.dispose?.());
      } else if (child.material) {
        child.material.dispose?.();
      }
    });
    this.editableGroup.clear();
    this.editableMeshes.clear();
    this.prefabInstanceGroups.clear();
    this.prefabInstanceIdByPrimitiveId.clear();

    const groupedPrimitives = new Map();

    for (const primitive of this.editableLayout.primitives) {
      if (primitive.prefabInstanceId) {
        const bucket = groupedPrimitives.get(primitive.prefabInstanceId) ?? [];
        bucket.push(primitive);
        groupedPrimitives.set(primitive.prefabInstanceId, bucket);
        this.prefabInstanceIdByPrimitiveId.set(primitive.id, primitive.prefabInstanceId);
        continue;
      }

      if (primitive.type === 'glb') {
        const cachedModel = this.glbModelCache.get(primitive.glbAssetId);
        if (!cachedModel) continue;
        const clone = cachedModel.clone(true);
        clone.traverse((child) => {
          if (child.isMesh && child.material) {
            child.material = Array.isArray(child.material)
              ? child.material.map((m) => m.clone())
              : child.material.clone();
          }
        });
        clone.name = primitive.name;
        clone.position.set(primitive.position.x, primitive.position.y, primitive.position.z);
        clone.rotation.set(primitive.rotation.x, primitive.rotation.y, primitive.rotation.z);
        clone.scale.set(primitive.scale.x, primitive.scale.y, primitive.scale.z);
        clone.castShadow = primitive.castShadow;
        clone.receiveShadow = primitive.receiveShadow;
        clone.visible = !primitive.deleted;
        clone.userData.editablePrimitive = true;
        clone.userData.primitiveId = primitive.id;
        clone.userData.colliderEnabled = primitive.collider;
        clone.userData.isGlbClone = true;
        clone.traverse((child) => { child.userData.isGlbClone = true; });
        this.editableGroup.add(clone);
        this.editableMeshes.set(primitive.id, clone);

        if (primitive.collider) {
          clone.updateMatrixWorld(true);
          this.colliders.push({
            mesh: clone,
            aabb: AABB.fromMesh(clone),
            type: 'furniture',
            metadata: { source: 'editable', primitiveId: primitive.id },
          });
        }
        continue;
      }

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

    for (const [instanceId, primitives] of groupedPrimitives.entries()) {
      const anchor = primitives[0];
      if (!anchor) continue;
      const origin = anchor.prefabInstanceOrigin ?? anchor.position;
      const rotation = anchor.prefabInstanceRotation ?? { x: 0, y: 0, z: 0 };
      const scale = anchor.prefabInstanceScale ?? { x: 1, y: 1, z: 1 };

      const group = new THREE.Group();
      group.name = `PrefabInstance-${instanceId}`;
      group.position.set(origin.x, origin.y, origin.z);
      group.rotation.set(rotation.x, rotation.y, rotation.z);
      group.scale.set(scale.x, scale.y, scale.z);
      group.userData.editablePrimitive = true;
      group.userData.prefabInstanceId = instanceId;
      this.editableGroup.add(group);
      this.prefabInstanceGroups.set(instanceId, {
        group,
        origin,
        rotation,
        scale,
        primitiveIds: primitives.map((primitive) => primitive.id),
      });

      primitives.forEach((primitive) => {
        const geometry = createPrimitiveGeometry(primitive.type);
        const material = this._createEditablePrimitiveMaterial(primitive);
        const mesh = new THREE.Mesh(geometry, material);
        mesh.name = primitive.name;
        mesh.position.set(
          primitive.position.x,
          primitive.position.y,
          primitive.position.z,
        );
        mesh.rotation.set(primitive.rotation.x, primitive.rotation.y, primitive.rotation.z);
        mesh.scale.set(primitive.scale.x, primitive.scale.y, primitive.scale.z);
        mesh.castShadow = primitive.castShadow;
        mesh.receiveShadow = primitive.receiveShadow;
        mesh.visible = !primitive.deleted;
        mesh.userData.editablePrimitive = true;
        mesh.userData.primitiveId = primitive.id;
        mesh.userData.prefabInstanceId = instanceId;
        group.add(mesh);
        this.editableMeshes.set(primitive.id, mesh);
        this.prefabInstanceIdByPrimitiveId.set(primitive.id, instanceId);

        if (primitive.collider) {
          this.colliders.push({
            mesh,
            aabb: AABB.fromMesh(mesh),
            type: primitive.type === 'plane' ? 'surface' : 'furniture',
            metadata: {
              source: 'editable',
              primitiveId: primitive.id,
              prefabInstanceId: instanceId,
            },
          });
        }
      });
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

  purgeEditablePrimitive(id) {
    if (this.builtInEditableMeshes.has(id)) {
      const entry = this.builtInEditableMeshes.get(id);
      this.deletedBuiltInPrimitives.add(id);
      entry.mesh.visible = false;
      entry.mesh.userData.colliderEnabled = false;
      this.refreshColliders();
      return;
    }

    const prefabInstanceId = this.prefabInstanceIdByPrimitiveId.get(id);
    if (prefabInstanceId) {
      this.editableLayout.primitives = this.editableLayout.primitives.filter((entry) => entry.prefabInstanceId !== prefabInstanceId);
      this.loadedEditableLayout.primitives = this.loadedEditableLayout.primitives.filter((entry) => entry.prefabInstanceId !== prefabInstanceId);
      this._rebuildEditableLayout();
      return;
    }

    this.editableLayout.primitives = this.editableLayout.primitives.filter((entry) => entry.id !== id);
    this.loadedEditableLayout.primitives = this.loadedEditableLayout.primitives.filter((entry) => entry.id !== id);
    this._rebuildEditableLayout();
  }

  getEditableMesh(id) {
    const prefabInstanceId = this.prefabInstanceIdByPrimitiveId.get(id);
    if (prefabInstanceId) {
      return this.prefabInstanceGroups.get(prefabInstanceId)?.group ?? null;
    }
    if (this.builtInEditableMeshes.has(id)) {
      return this.builtInEditableMeshes.get(id)?.mesh ?? null;
    }

    return this.editableMeshes.get(id) ?? null;
  }

  updateEditablePrimitiveTransform(id, transform = {}) {
    if (!id) return null;

    const prefabInstanceId = this.prefabInstanceIdByPrimitiveId.get(id);
    if (prefabInstanceId) {
      return this.updatePrefabInstanceTransform(prefabInstanceId, transform);
    }

    if (this.prefabInstanceGroups.has(id)) {
      return this.updatePrefabInstanceTransform(id, transform);
    }

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

  updatePrefabInstanceTransform(instanceId, transform = {}) {
    const primitives = this.editableLayout.primitives.filter((entry) => entry.prefabInstanceId === instanceId);
    if (!primitives.length) return null;

    if (!transform.position && !transform.rotation && !transform.scale) {
      return primitives[0];
    }

    const anchor = primitives[0].prefabInstanceOrigin ?? primitives[0].position;
    const nextAnchor = transform.position ? cloneVectorLike(transform.position, anchor) : cloneVectorLike(anchor, { x: 0, y: 0, z: 0 });
    const nextRotation = transform.rotation
      ? cloneVectorLike(transform.rotation, primitives[0].prefabInstanceRotation ?? { x: 0, y: 0, z: 0 })
      : cloneVectorLike(primitives[0].prefabInstanceRotation ?? { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 });
    const nextScale = transform.scale
      ? cloneVectorLike(transform.scale, primitives[0].prefabInstanceScale ?? { x: 1, y: 1, z: 1 })
      : cloneVectorLike(primitives[0].prefabInstanceScale ?? { x: 1, y: 1, z: 1 }, { x: 1, y: 1, z: 1 });

    primitives.forEach((primitive) => {
      primitive.prefabInstanceOrigin = roundVectorLike(nextAnchor, { x: 0, y: 0, z: 0 });
      primitive.prefabInstanceRotation = roundVectorLike(nextRotation, { x: 0, y: 0, z: 0 });
      primitive.prefabInstanceScale = roundVectorLike(nextScale, { x: 1, y: 1, z: 1 });
    });

    this.editableLayout.primitives = this.editableLayout.primitives.map((entry) => (
      entry.prefabInstanceId === instanceId
        ? primitives.find((primitive) => primitive.id === entry.id) ?? entry
        : entry
    ));

    const instanceEntry = this.prefabInstanceGroups.get(instanceId);
    if (instanceEntry) {
      const newOrigin = primitives[0].prefabInstanceOrigin ?? primitives[0].position;
      const newRotation = primitives[0].prefabInstanceRotation ?? { x: 0, y: 0, z: 0 };
      const newScale = primitives[0].prefabInstanceScale ?? { x: 1, y: 1, z: 1 };
      instanceEntry.group.position.set(newOrigin.x, newOrigin.y, newOrigin.z);
      instanceEntry.group.rotation.set(newRotation.x, newRotation.y, newRotation.z);
      instanceEntry.group.scale.set(newScale.x, newScale.y, newScale.z);
      instanceEntry.origin = cloneVectorLike(newOrigin, { x: 0, y: 0, z: 0 });
      instanceEntry.rotation = cloneVectorLike(newRotation, { x: 0, y: 0, z: 0 });
      instanceEntry.scale = cloneVectorLike(newScale, { x: 1, y: 1, z: 1 });

      primitives.forEach((primitive) => {
        const mesh = this.editableMeshes.get(primitive.id);
        if (mesh) {
          mesh.position.set(primitive.position.x, primitive.position.y, primitive.position.z);
        }
      });

      instanceEntry.group.updateMatrixWorld(true);
    }

    this.refreshColliders();
    return primitives[0];
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

  _snapGridAxisPosition(value, footprint, totalSize, cellSize, allowOverflow = false) {
    const halfRoom = totalSize * 0.5;
    const min = allowOverflow ? -halfRoom : -halfRoom + (Math.min(Math.max(footprint, cellSize), totalSize) * 0.5);
    const max = allowOverflow ? halfRoom : halfRoom - (Math.min(Math.max(footprint, cellSize), totalSize) * 0.5);

    if (max <= min) {
      return 0;
    }

    const snapped = min + Math.round((value - min) / cellSize) * cellSize;
    return THREE.MathUtils.clamp(snapped, min, max);
  }

  snapPrimitiveToGrid(definition, {
    snapY = false,
    snapScale = false,
    snapPosition = true,
    allowEdgeOverflow = false,
  } = {}) {
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

    if (snapPosition) {
      const footprint = this._getPrimitiveFootprint(primitive);
      primitive.position.x = this._snapGridAxisPosition(
        primitive.position.x,
        footprint.width,
        grid.roomWidth,
        grid.cellWidth,
        allowEdgeOverflow,
      );
      primitive.position.z = this._snapGridAxisPosition(
        primitive.position.z,
        footprint.depth,
        grid.roomDepth,
        grid.cellDepth,
        allowEdgeOverflow,
      );
    }

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
    scale: placeScale = 2,
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
          x: (part.position?.x ?? 0) * placeScale,
          y: (part.position?.y ?? 0) * placeScale,
          z: (part.position?.z ?? 0) * placeScale,
        },
        scale: {
          x: (part.scale?.x ?? 1) * placeScale,
          y: (part.scale?.y ?? 1) * placeScale,
          z: (part.scale?.z ?? 1) * placeScale,
        },
        prefabInstanceOrigin: {
          x: anchor.x,
          y: anchor.y,
          z: anchor.z,
        },
        prefabInstanceRotation: {
          x: 0,
          y: 0,
          z: 0,
        },
        prefabInstanceScale: {
          x: 1,
          y: 1,
          z: 1,
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
  }

  buildFloorAndWalls() {
    const floorMat = this._createSurfaceMaterial(this.floorColor, {
      textureCell: ROOM_TEXTURE_CELLS.floor,
      textureRepeat: 6,
      roughness: 0.98,
      metalness: 0.02,
    });

    // Floor
    const floorGeo = new THREE.PlaneGeometry(this.width, this.depth);
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI * 0.5;
    floor.position.y = 0;
    floor.name = 'Floor';
    floor.receiveShadow = true;
    floor.userData.surfaceType = 'floor';
    floor.userData.cameraOccluder = false;
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
