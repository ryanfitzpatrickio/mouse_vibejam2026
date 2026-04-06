import * as THREE from 'three';
import {
  createPrefabPartId,
  normalizePrefabPrimitive,
} from './prefabRegistry.js';
import { DEFAULT_TEXTURE_ATLAS } from './textureAtlasRegistry.js';

export function createLocalPrimitive(type, grid) {
  const primitive = normalizePrefabPrimitive({
    id: createPrefabPartId(),
    name: `${type}-part`,
    type,
    position: { x: 0, y: grid.verticalStep * 0.5, z: 0 },
    scale: {
      x: grid.cellWidth,
      y: Math.max(grid.verticalStep, 0.5),
      z: grid.cellDepth,
    },
    texture: {
      atlas: DEFAULT_TEXTURE_ATLAS,
      cell: 0,
      repeat: { x: 1, y: 1 },
      rotation: 0,
    },
  });

  if (type === 'plane') {
    primitive.rotation.x = -Math.PI * 0.5;
    primitive.position.y = 0;
    primitive.scale = { x: 1, y: 1, z: 1 };
    primitive.receiveShadow = true;
  } else if (type === 'cylinder') {
    primitive.scale = { x: 1, y: grid.verticalStep * 2, z: 1 };
    primitive.position.y = primitive.scale.y * 0.5;
  }

  return primitive;
}

export function createPrimitiveGeometry(type) {
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

export function capGeneratedScale(value, max = 4) {
  return Number(Math.min(max, Math.max(0.05, value)).toFixed(4));
}

export function fitGeneratedPrefabToEditorSpace(prefab, { footprint = 2, maxHeight = 2, totalHeight = 4 } = {}) {
  const primitives = Array.isArray(prefab.primitives) ? prefab.primitives : [];
  if (!primitives.length) {
    return prefab;
  }

  const bounds = primitives.reduce((acc, primitive) => {
    const position = primitive.position ?? { x: 0, y: 0, z: 0 };
    const scale = primitive.scale ?? { x: 1, y: 1, z: 1 };
    const halfX = Math.abs(scale.x ?? 1) * 0.5;
    const halfY = Math.abs(scale.y ?? 1) * 0.5;
    const halfZ = Math.abs(scale.z ?? 1) * 0.5;

    acc.minX = Math.min(acc.minX, position.x - halfX);
    acc.maxX = Math.max(acc.maxX, position.x + halfX);
    acc.minY = Math.min(acc.minY, position.y - halfY);
    acc.maxY = Math.max(acc.maxY, position.y + halfY);
    acc.minZ = Math.min(acc.minZ, position.z - halfZ);
    acc.maxZ = Math.max(acc.maxZ, position.z + halfZ);
    return acc;
  }, {
    minX: Infinity,
    maxX: -Infinity,
    minY: Infinity,
    maxY: -Infinity,
    minZ: Infinity,
    maxZ: -Infinity,
  });

  const width = Math.max(0.001, bounds.maxX - bounds.minX);
  const depth = Math.max(0.001, bounds.maxZ - bounds.minZ);
  const height = Math.max(0.001, bounds.maxY - bounds.minY);
  const centerX = (bounds.minX + bounds.maxX) * 0.5;
  const centerZ = (bounds.minZ + bounds.maxZ) * 0.5;
  const fitX = footprint / width;
  const fitY = totalHeight / height;
  const fitZ = footprint / depth;

  return {
    ...prefab,
    size: { x: 1, y: 1, z: 1 },
    primitives: primitives.map((primitive) => normalizePrefabPrimitive({
      ...primitive,
      position: {
        x: ((primitive.position?.x ?? 0) - centerX) * fitX,
        y: ((primitive.position?.y ?? 0) - bounds.minY) * fitY,
        z: ((primitive.position?.z ?? 0) - centerZ) * fitZ,
      },
      scale: {
        x: capGeneratedScale((primitive.scale?.x ?? 1) * fitX, footprint),
        y: capGeneratedScale(Math.min(maxHeight, (primitive.scale?.y ?? 1) * fitY), maxHeight),
        z: capGeneratedScale((primitive.scale?.z ?? 1) * fitZ, footprint),
      },
    })),
  };
}

export function makeGeneratedPart({
  name,
  type = 'box',
  position = { x: 0, y: 0.5, z: 0 },
  rotation = { x: 0, y: 0, z: 0 },
  scale = { x: 1, y: 1, z: 1 },
  texture = {},
  material = {},
  collider = true,
  castShadow = true,
  receiveShadow = true,
}) {
  return normalizePrefabPrimitive({
    id: createPrefabPartId(),
    name: name ?? `${type}-part`,
    type,
    position,
    rotation,
    scale: {
      x: capGeneratedScale(scale.x ?? 1),
      y: capGeneratedScale(scale.y ?? 1),
      z: capGeneratedScale(scale.z ?? 1),
    },
    texture: {
      atlas: texture.atlas ?? DEFAULT_TEXTURE_ATLAS,
      cell: Number.isFinite(texture.cell) ? texture.cell : 0,
      repeat: texture.repeat ?? { x: 1, y: 1 },
      rotation: texture.rotation ?? 0,
    },
    material: {
      color: material.color ?? '#ffffff',
      roughness: material.roughness ?? 0.82,
      metalness: material.metalness ?? 0.06,
    },
    collider,
    castShadow,
    receiveShadow,
  });
}
