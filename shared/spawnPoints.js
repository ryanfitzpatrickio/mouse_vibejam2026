export const SPAWN_TYPES = Object.freeze({
  PLAYER: 'player',
  ENEMY: 'enemy',
  HUMAN: 'human',
  ROOMBA: 'roomba',
});

export function normalizeSpawnType(value) {
  return value === SPAWN_TYPES.PLAYER
    || value === SPAWN_TYPES.ENEMY
    || value === SPAWN_TYPES.HUMAN
    || value === SPAWN_TYPES.ROOMBA
    ? value
    : null;
}

export function isSpawnMarkerPrimitive(primitive) {
  return normalizeSpawnType(primitive?.spawnType) !== null;
}

export function getSpawnMarkerPosition(primitive) {
  if (!primitive?.position) {
    return { x: 0, y: 0, z: 0 };
  }

  const type = primitive.type;
  const centeredHeight = type === 'plane'
    ? 0
    : Math.max(0, Number(primitive.scale?.y) || 0) * 0.5;

  return {
    x: primitive.position.x ?? 0,
    y: (primitive.position.y ?? 0) - centeredHeight,
    z: primitive.position.z ?? 0,
  };
}

export function collectSpawnPointsFromLayout(layout) {
  const player = [];
  const enemy = [];
  const human = [];
  const roomba = [];

  for (const primitive of layout?.primitives ?? []) {
    if (primitive?.deleted === true) continue;

    const spawnType = normalizeSpawnType(primitive?.spawnType);
    if (!spawnType) continue;

    const point = {
      id: primitive.id ?? `${spawnType}-spawn`,
      ...getSpawnMarkerPosition(primitive),
    };

    if (spawnType === SPAWN_TYPES.PLAYER) {
      player.push(point);
      continue;
    }

    if (spawnType === SPAWN_TYPES.ENEMY) {
      enemy.push(point);
      continue;
    }

    if (spawnType === SPAWN_TYPES.ROOMBA) {
      roomba.push(point);
      continue;
    }

    human.push(point);
  }

  return { player, enemy, human, roomba };
}
