#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import * as THREE from 'three';
import { generateSoloNavMesh } from 'navcat/blocks';
import { getPositionsAndIndices } from 'navcat/three';
import { NAV_AGENT_CONFIGS, NAV_AREA_TYPES, NAV_POLY_AREA_IDS, NAV_POLY_FLAGS, normalizeNavArea } from '../shared/navConfig.js';
import { buildRoomCollidersFromLayout, getGlbColliderLocalBounds } from '../shared/roomCollision.js';
import kitchenLayout from '../shared/kitchen-layout.generated.js';
import { isAssetBuildUpToDate, markAssetBuildCurrent } from './build-cache.mjs';

const ROOT = process.cwd();
const CAT_OUTPUT = path.join(ROOT, 'shared', 'kitchen-navmesh.generated.js');
const MOUSE_OUTPUT = path.join(ROOT, 'shared', 'kitchen-mouse-navmesh.generated.js');
const CACHE_NAME = 'generate-kitchen-navmesh-module';

const SURFACE_THICKNESS = 0.05;
const WALL_THICKNESS = 0.18;
const OBSTACLE_MIN_THICKNESS = 0.35;
const CELL_SIZE = 0.2;
const CELL_HEIGHT = 0.1;
const DETAIL_SAMPLE_DISTANCE_VOXELS = 6;
const DETAIL_SAMPLE_MAX_ERROR_VOXELS = 1;
const sharedMaterial = new THREE.MeshBasicMaterial();

function composeMatrix(position = {}, rotation = {}, scale = {}) {
  const matrix = new THREE.Matrix4();
  const quat = new THREE.Quaternion().setFromEuler(
    new THREE.Euler(rotation.x ?? 0, rotation.y ?? 0, rotation.z ?? 0),
  );
  matrix.compose(
    new THREE.Vector3(position.x ?? 0, position.y ?? 0, position.z ?? 0),
    quat,
    new THREE.Vector3(scale.x ?? 1, scale.y ?? 1, scale.z ?? 1),
  );
  return matrix;
}

function createPrimitiveWorldMatrix(primitive, scaleOverride = null) {
  const localMatrix = composeMatrix(
    primitive.position,
    primitive.rotation,
    scaleOverride ?? primitive.scale,
  );

  if (!primitive.prefabInstanceId) {
    return localMatrix;
  }

  return new THREE.Matrix4().multiplyMatrices(
    composeMatrix(
      primitive.prefabInstanceOrigin,
      primitive.prefabInstanceRotation,
      primitive.prefabInstanceScale,
    ),
    localMatrix,
  );
}

function createWorldMesh(geometry, matrix) {
  const mesh = new THREE.Mesh(geometry.clone(), sharedMaterial);
  mesh.geometry.applyMatrix4(matrix);
  mesh.updateMatrixWorld(true);
  return mesh;
}

function getColliderCenter(box) {
  return {
    x: (box.min.x + box.max.x) * 0.5,
    y: (box.min.y + box.max.y) * 0.5,
    z: (box.min.z + box.max.z) * 0.5,
  };
}

function getColliderSize(box) {
  return {
    x: Math.max(0, box.max.x - box.min.x),
    y: Math.max(0, box.max.y - box.min.y),
    z: Math.max(0, box.max.z - box.min.z),
  };
}

function createMeshFromColliderBox(collider) {
  const box = collider?.aabb;
  if (!box) return null;

  const baseSize = getColliderSize(box);
  const center = getColliderCenter(box);
  const isSurface = collider.type === 'surface';
  const size = {
    x: Math.max(baseSize.x, isSurface ? 0.01 : OBSTACLE_MIN_THICKNESS),
    y: Math.max(baseSize.y, isSurface ? SURFACE_THICKNESS : OBSTACLE_MIN_THICKNESS),
    z: Math.max(baseSize.z, isSurface ? 0.01 : OBSTACLE_MIN_THICKNESS),
  };

  const mesh = new THREE.Mesh(new THREE.BoxGeometry(size.x, size.y, size.z), sharedMaterial);
  mesh.position.set(
    center.x,
    isSurface ? box.max.y - size.y * 0.5 : center.y,
    center.z,
  );
  mesh.updateMatrixWorld(true);
  return mesh;
}

function createGlbBoundsGeometry(assetId) {
  const bounds = getGlbColliderLocalBounds(assetId);
  if (!bounds?.min || !bounds?.max) {
    return new THREE.BoxGeometry(1, 1, 1);
  }

  const size = {
    x: Math.max(0.001, bounds.max.x - bounds.min.x),
    y: Math.max(0.001, bounds.max.y - bounds.min.y),
    z: Math.max(0.001, bounds.max.z - bounds.min.z),
  };
  const center = {
    x: (bounds.min.x + bounds.max.x) * 0.5,
    y: (bounds.min.y + bounds.max.y) * 0.5,
    z: (bounds.min.z + bounds.max.z) * 0.5,
  };
  const geometry = new THREE.BoxGeometry(size.x, size.y, size.z);
  geometry.translate(center.x, center.y, center.z);
  return geometry;
}

function createMeshForPrimitive(primitive, collider) {
  if (!primitive || primitive.deleted === true || primitive.collider === false) return null;

  const clearance = primitive.colliderClearance ?? 0;
  if (primitive.type === 'plane') {
    const thickness = collider?.type === 'surface' ? SURFACE_THICKNESS : WALL_THICKNESS;
    return createWorldMesh(
      new THREE.BoxGeometry(1, 1, 1),
      createPrimitiveWorldMatrix(primitive, {
        x: primitive.scale?.x ?? 1,
        y: primitive.scale?.y ?? 1,
        z: thickness,
      }),
    );
  }

  if (clearance > 0.001) {
    return createMeshFromColliderBox(collider);
  }

  if (primitive.type === 'cylinder') {
    return createWorldMesh(
      new THREE.CylinderGeometry(0.5, 0.5, 1, 24, 1),
      createPrimitiveWorldMatrix(primitive),
    );
  }

  if (primitive.type === 'glb') {
    return createWorldMesh(
      createGlbBoundsGeometry(primitive.glbAssetId),
      createPrimitiveWorldMatrix(primitive),
    );
  }

  return createWorldMesh(
    new THREE.BoxGeometry(1, 1, 1),
    createPrimitiveWorldMatrix(primitive),
  );
}

function createNavMeshOptions(agentConfig) {
  return {
    cellSize: CELL_SIZE,
    cellHeight: CELL_HEIGHT,
    walkableRadiusWorld: agentConfig.walkableRadiusWorld,
    walkableRadiusVoxels: Math.ceil(agentConfig.walkableRadiusWorld / CELL_SIZE),
    walkableClimbWorld: agentConfig.walkableClimbWorld,
    walkableClimbVoxels: Math.ceil(agentConfig.walkableClimbWorld / CELL_HEIGHT),
    walkableHeightWorld: agentConfig.walkableHeightWorld,
    walkableHeightVoxels: Math.ceil(agentConfig.walkableHeightWorld / CELL_HEIGHT),
    walkableSlopeAngleDegrees: 45,
    borderSize: 0,
    minRegionArea: 8,
    mergeRegionArea: 20,
    maxSimplificationError: 1.3,
    maxEdgeLength: 12,
    maxVerticesPerPoly: 5,
    detailSampleDistance: DETAIL_SAMPLE_DISTANCE_VOXELS < 0.9 ? 0 : CELL_SIZE * DETAIL_SAMPLE_DISTANCE_VOXELS,
    detailSampleMaxError: CELL_HEIGHT * DETAIL_SAMPLE_MAX_ERROR_VOXELS,
  };
}

function createAreaColliders(layout) {
  const taggedPrimitives = (layout.primitives ?? [])
    .filter((primitive) => primitive && primitive.deleted !== true && normalizeNavArea(primitive.navArea) !== NAV_AREA_TYPES.DEFAULT)
    .map((primitive) => ({ ...primitive, collider: true }));

  if (!taggedPrimitives.length) return [];

  const navAreaById = new Map(taggedPrimitives.map((primitive) => [primitive.id, normalizeNavArea(primitive.navArea)]));
  return buildRoomCollidersFromLayout({ primitives: taggedPrimitives }, { scaleFactor: 1 })
    .map((collider) => ({
      ...collider,
      navArea: navAreaById.get(collider.metadata?.primitiveId) ?? NAV_AREA_TYPES.DEFAULT,
    }));
}

function syncNodeFlags(navMesh) {
  for (const tile of Object.values(navMesh.tiles ?? {})) {
    const polys = tile?.polys ?? [];
    const polyNodes = tile?.polyNodes ?? [];
    for (let polyIndex = 0; polyIndex < polys.length; polyIndex += 1) {
      const poly = polys[polyIndex];
      poly.flags = Number.isFinite(poly.flags) ? poly.flags : NAV_POLY_FLAGS.DEFAULT;
      if (!poly.flags) poly.flags = NAV_POLY_FLAGS.DEFAULT;
      poly.area = Number.isFinite(poly.area) ? poly.area : NAV_POLY_AREA_IDS.DEFAULT;
      const nodeIndex = polyNodes[polyIndex];
      const node = navMesh.nodes?.[nodeIndex];
      if (node) {
        node.flags = poly.flags;
        node.area = poly.area;
      }
    }
  }
}

function getPolyBounds(tile, poly) {
  const bounds = {
    minX: Number.POSITIVE_INFINITY,
    minY: Number.POSITIVE_INFINITY,
    minZ: Number.POSITIVE_INFINITY,
    maxX: Number.NEGATIVE_INFINITY,
    maxY: Number.NEGATIVE_INFINITY,
    maxZ: Number.NEGATIVE_INFINITY,
  };

  for (const vertexIndex of poly.vertices ?? []) {
    const base = vertexIndex * 3;
    const x = tile.vertices[base];
    const y = tile.vertices[base + 1];
    const z = tile.vertices[base + 2];
    bounds.minX = Math.min(bounds.minX, x);
    bounds.minY = Math.min(bounds.minY, y);
    bounds.minZ = Math.min(bounds.minZ, z);
    bounds.maxX = Math.max(bounds.maxX, x);
    bounds.maxY = Math.max(bounds.maxY, y);
    bounds.maxZ = Math.max(bounds.maxZ, z);
  }

  return bounds;
}

function boundsOverlap(a, b) {
  return a.minX <= b.max.x
    && a.maxX >= b.min.x
    && a.minY <= b.max.y + 1.0
    && a.maxY >= b.min.y - 1.0
    && a.minZ <= b.max.z
    && a.maxZ >= b.min.z;
}

function applyAreaTags(navMesh, areaColliders) {
  syncNodeFlags(navMesh);
  const mouseOnlyAreas = areaColliders.filter((collider) => collider.navArea === NAV_AREA_TYPES.MOUSE_ONLY && collider.aabb);
  if (!mouseOnlyAreas.length) return navMesh;

  for (const tile of Object.values(navMesh.tiles ?? {})) {
    const polys = tile?.polys ?? [];
    for (let polyIndex = 0; polyIndex < polys.length; polyIndex += 1) {
      const poly = polys[polyIndex];
      const polyBounds = getPolyBounds(tile, poly);
      const inMouseOnlyArea = mouseOnlyAreas.some((collider) => boundsOverlap(polyBounds, collider.aabb));
      if (!inMouseOnlyArea) continue;

      poly.flags = (poly.flags || NAV_POLY_FLAGS.DEFAULT) | NAV_POLY_FLAGS.MOUSE_ONLY;
      poly.area = NAV_POLY_AREA_IDS.MOUSE_ONLY;

      const nodeIndex = tile.polyNodes?.[polyIndex];
      const node = navMesh.nodes?.[nodeIndex];
      if (node) {
        node.flags = poly.flags;
        node.area = poly.area;
      }
    }
  }

  return navMesh;
}

function buildSourceMeshes(layout) {
  const primitiveById = new Map((layout.primitives ?? []).map((primitive) => [primitive.id, primitive]));
  const colliders = buildRoomCollidersFromLayout(layout, { scaleFactor: 1 });
  return colliders
    .map((collider) => createMeshForPrimitive(primitiveById.get(collider.metadata?.primitiveId), collider))
    .filter(Boolean);
}

function writeGeneratedModule(outputPath, navMesh) {
  const source = `// Auto-generated from kitchen layout colliders. Do not edit directly.\nexport default ${JSON.stringify(navMesh, null, 2)};\n`;
  fs.writeFileSync(outputPath, source);
}

const cacheInputs = [
  path.join(ROOT, 'public', 'levels', 'kitchen-layout.json'),
  path.join(ROOT, 'shared', 'kitchen-layout.generated.js'),
  path.join(ROOT, 'shared', 'navConfig.js'),
  path.join(ROOT, 'shared', 'roomCollision.js'),
  path.join(ROOT, 'scripts', 'generate-kitchen-navmesh-module.mjs'),
  path.join(ROOT, 'scripts', 'build-cache.mjs'),
];

if (await isAssetBuildUpToDate({
  cacheName: CACHE_NAME,
  inputs: cacheInputs,
  outputs: [CAT_OUTPUT, MOUSE_OUTPUT],
})) {
  console.log(`Skipped ${path.relative(ROOT, CAT_OUTPUT)} and ${path.relative(ROOT, MOUSE_OUTPUT)} (up to date)`);
  process.exit(0);
}

const meshes = buildSourceMeshes(kitchenLayout);
const [positions, indices] = getPositionsAndIndices(meshes);
const areaColliders = createAreaColliders(kitchenLayout);

const catResult = generateSoloNavMesh(
  { positions, indices },
  createNavMeshOptions(NAV_AGENT_CONFIGS.cat),
);
applyAreaTags(catResult.navMesh, areaColliders);
writeGeneratedModule(CAT_OUTPUT, catResult.navMesh);

const mouseResult = generateSoloNavMesh(
  { positions, indices },
  createNavMeshOptions(NAV_AGENT_CONFIGS.mouse),
);
applyAreaTags(mouseResult.navMesh, areaColliders);
writeGeneratedModule(MOUSE_OUTPUT, mouseResult.navMesh);

await markAssetBuildCurrent({
  cacheName: CACHE_NAME,
  inputs: cacheInputs,
});

console.log(
  `Wrote ${path.relative(ROOT, CAT_OUTPUT)} (${catResult.navMesh.nodes.length} nodes) and `
  + `${path.relative(ROOT, MOUSE_OUTPUT)} (${mouseResult.navMesh.nodes.length} nodes)`,
);
