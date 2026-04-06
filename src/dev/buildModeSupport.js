import * as THREE from 'three';
import { normalizePrefabPrimitive } from './prefabRegistry.js';

export function createPrimitiveId() {
  return `primitive-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export function createDefaultPrimitive(type, app) {
  const forward = new THREE.Vector3();
  app.camera.getWorldDirection(forward);
  forward.y = 0;
  if (forward.lengthSq() < 0.0001) {
    forward.set(0, 0, -1);
  }
  forward.normalize();

  const spawn = app.mouse.position.clone().add(forward.multiplyScalar(2.25));
  spawn.y = Math.max(app.mouse.position.y, 0.6);

  const primitive = {
    id: createPrimitiveId(),
    name: `${type}-${Math.random().toString(36).slice(2, 5)}`,
    type,
    position: {
      x: Number(spawn.x.toFixed(3)),
      y: Number(spawn.y.toFixed(3)),
      z: Number(spawn.z.toFixed(3)),
    },
    rotation: { x: 0, y: 0, z: 0 },
    scale: { x: 1, y: 1, z: 1 },
    texture: {
      atlas: 'textures',
      cell: 0,
      repeat: { x: 1, y: 1 },
      rotation: 0,
    },
    material: {
      color: '#ffffff',
      roughness: 0.88,
      metalness: 0.04,
    },
    prefabId: null,
    collider: true,
    castShadow: true,
    receiveShadow: true,
  };

  if (type === 'plane') {
    primitive.rotation.x = -Math.PI * 0.5;
    primitive.scale = { x: 1, y: 1, z: 1 };
  }

  if (type === 'cylinder') {
    primitive.scale = { x: 1, y: 1.5, z: 1 };
  }

  if (type === 'box') {
    primitive.scale = { x: 1, y: 1, z: 1 };
  }

  return normalizePrefabPrimitive(primitive);
}

export async function loadPrefabLibraryFromAsset(url) {
  try {
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) {
      return null;
    }
    return await response.json();
  } catch {
    return null;
  }
}
