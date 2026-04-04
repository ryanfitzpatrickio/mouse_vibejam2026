export const ROOM_COLLISION_CONFIG = Object.freeze({
  scaleFactor: 4,
});

function scaleVec3(value = {}, scaleFactor = 1) {
  return {
    x: (value.x ?? 0) * scaleFactor,
    y: (value.y ?? 0) * scaleFactor,
    z: (value.z ?? 0) * scaleFactor,
  };
}

function makeAabb(center, size) {
  const halfX = size.x * 0.5;
  const halfY = size.y * 0.5;
  const halfZ = size.z * 0.5;
  return {
    min: {
      x: center.x - halfX,
      y: center.y - halfY,
      z: center.z - halfZ,
    },
    max: {
      x: center.x + halfX,
      y: center.y + halfY,
      z: center.z + halfZ,
    },
  };
}

function isGroundPlane(primitive) {
  return primitive.type === 'plane' && (primitive.position?.y ?? 0) <= 0.1;
}

function isCeilingPlane(primitive) {
  return primitive.type === 'plane' && (primitive.position?.y ?? 0) > 0.1;
}

function colliderTypeForPrimitive(primitive) {
  if (isGroundPlane(primitive)) return 'surface';
  if (isCeilingPlane(primitive)) return 'surface';
  if (primitive.name?.toLowerCase().includes('wall')) return 'wall';
  return 'furniture';
}

export function buildRoomCollidersFromLayout(layout, {
  scaleFactor = ROOM_COLLISION_CONFIG.scaleFactor,
} = {}) {
  const primitives = Array.isArray(layout?.primitives) ? layout.primitives : [];
  const colliders = [];

  for (const primitive of primitives) {
    if (!primitive || primitive.deleted === true || primitive.collider === false) continue;

    const position = scaleVec3(primitive.position, scaleFactor);
    const scale = scaleVec3(primitive.scale, scaleFactor);
    const colliderType = colliderTypeForPrimitive(primitive);
    const metadata = {
      source: 'layout',
      primitiveId: primitive.id ?? null,
      prefabId: primitive.prefabId ?? null,
      prefabInstanceId: primitive.prefabInstanceId ?? null,
      runnable: colliderType === 'surface' && isGroundPlane(primitive),
    };

    if (primitive.type === 'plane') {
      const width = Math.max(0.0001, scale.x);
      const depth = Math.max(0.0001, scale.y);
      colliders.push({
        type: colliderType,
        metadata,
        aabb: makeAabb(position, { x: width, y: 0.0001, z: depth }),
      });
      continue;
    }

    if (primitive.type === 'cylinder') {
      const width = Math.max(0.0001, Math.max(scale.x, scale.z));
      const depth = width;
      colliders.push({
        type: colliderType,
        metadata,
        aabb: makeAabb(position, { x: width, y: Math.max(0.0001, scale.y), z: depth }),
      });
      continue;
    }

    colliders.push({
      type: colliderType,
      metadata,
      aabb: makeAabb(position, {
        x: Math.max(0.0001, scale.x),
        y: Math.max(0.0001, scale.y),
        z: Math.max(0.0001, scale.z),
      }),
    });
  }

  return colliders;
}
