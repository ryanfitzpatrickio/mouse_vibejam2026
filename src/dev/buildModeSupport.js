import * as THREE from 'three';
import { normalizePrefabPrimitive } from './prefabRegistry.js';
import { SPAWN_TYPES } from '../../shared/spawnPoints.js';
import { NAV_AREA_TYPES } from '../../shared/navConfig.js';
import { VIBE_PORTAL_TYPES, normalizeVibePortalType } from '../../shared/vibePortal.js';

export function createPrimitiveId() {
  return `primitive-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export function createLightId() {
  return `light-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export function createPortalId() {
  return `portal-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
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
    navArea: NAV_AREA_TYPES.DEFAULT,
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

export function createSpawnMarkerPrimitive(spawnType, app) {
  const type = spawnType === SPAWN_TYPES.ENEMY ? SPAWN_TYPES.ENEMY : SPAWN_TYPES.PLAYER;
  const forward = new THREE.Vector3();
  app.camera.getWorldDirection(forward);
  forward.y = 0;
  if (forward.lengthSq() < 0.0001) {
    forward.set(0, 0, -1);
  }
  forward.normalize();

  const spawn = app.mouse.position.clone().add(forward.multiplyScalar(2.25));
  const scale = { x: 0.65, y: 0.3, z: 0.65 };
  const baseY = Math.max(app.mouse.position.y, 0);
  const marker = {
    id: createPrimitiveId(),
    name: `${type}-spawn-${Math.random().toString(36).slice(2, 5)}`,
    type: 'cylinder',
    spawnType: type,
    position: {
      x: Number(spawn.x.toFixed(3)),
      y: Number((baseY + scale.y * 0.5).toFixed(3)),
      z: Number(spawn.z.toFixed(3)),
    },
    rotation: { x: 0, y: 0, z: 0 },
    scale,
    texture: {
      atlas: 'textures',
      cell: null,
      repeat: { x: 1, y: 1 },
      rotation: 0,
    },
    material: {
      color: type === SPAWN_TYPES.PLAYER ? '#4fd1ff' : '#ff7a59',
      roughness: 0.36,
      metalness: 0.06,
    },
    prefabId: null,
    navArea: NAV_AREA_TYPES.DEFAULT,
    collider: false,
    colliderClearance: 0,
    castShadow: false,
    receiveShadow: false,
  };

  return marker;
}

export function createDefaultLight(lightType, app) {
  const type = lightType === 'spot' || lightType === 'directional' ? lightType : 'point';
  const forward = new THREE.Vector3();
  app.camera.getWorldDirection(forward);
  forward.y = 0;
  if (forward.lengthSq() < 0.0001) {
    forward.set(0, 0, -1);
  }
  forward.normalize();

  const spawn = app.mouse.position.clone().add(forward.multiplyScalar(2.5));
  const yaw = Math.atan2(forward.x, forward.z);
  const defaults = type === 'spot'
    ? {
      color: '#ffd89f',
      intensity: 24,
      distance: 18,
      decay: 2,
      angle: Math.PI / 5,
      penumbra: 0.28,
      castShadow: true,
    }
    : type === 'directional'
      ? {
        color: '#ffe1b8',
        intensity: 1.7,
        distance: 0,
        decay: 2,
        angle: Math.PI / 4,
        penumbra: 0,
        castShadow: true,
      }
      : {
        color: '#ffc47a',
        intensity: 18,
        distance: 14,
        decay: 2,
        angle: Math.PI / 4,
        penumbra: 0,
        castShadow: false,
      };

  return {
    id: createLightId(),
    name: `${type}-light-${Math.random().toString(36).slice(2, 5)}`,
    lightType: type,
    position: {
      x: Number(spawn.x.toFixed(3)),
      y: Number(Math.max(app.mouse.position.y, 1.8).toFixed(3)),
      z: Number(spawn.z.toFixed(3)),
    },
    rotation: {
      x: type === 'point' ? 0 : Number((-25 * Math.PI / 180).toFixed(4)),
      y: Number(yaw.toFixed(4)),
      z: 0,
    },
    color: defaults.color,
    intensity: defaults.intensity,
    distance: defaults.distance,
    decay: defaults.decay,
    angle: defaults.angle,
    penumbra: defaults.penumbra,
    castShadow: defaults.castShadow,
  };
}

export function createDefaultPortal(portalType, app) {
  const type = normalizeVibePortalType(portalType);
  const forward = new THREE.Vector3();
  app.camera.getWorldDirection(forward);
  forward.y = 0;
  if (forward.lengthSq() < 0.0001) {
    forward.set(0, 0, -1);
  }
  forward.normalize();

  const spawn = app.mouse.position.clone().add(forward.multiplyScalar(2.5));
  const yaw = Math.atan2(forward.x, forward.z);

  return {
    id: createPortalId(),
    name: type === VIBE_PORTAL_TYPES.RETURN
      ? `return-portal-${Math.random().toString(36).slice(2, 5)}`
      : `vibe-portal-${Math.random().toString(36).slice(2, 5)}`,
    portalType: type,
    position: {
      x: Number(spawn.x.toFixed(3)),
      y: Number(Math.max(0, app.mouse.position.y).toFixed(3)),
      z: Number(spawn.z.toFixed(3)),
    },
    rotation: {
      x: 0,
      y: Number(yaw.toFixed(4)),
      z: 0,
    },
    triggerRadius: 0.9,
  };
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
