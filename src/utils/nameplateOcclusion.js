import * as THREE from 'three';

const _raycaster = new THREE.Raycaster();
const _dir = new THREE.Vector3();
const _origin = new THREE.Vector3();

/** Skip raycast when camera is extremely far (nameplate already tiny). */
const OCCLUSION_MAX_DIST = 120;
/** Re-evaluate at most once every N frames per player (cuts full-scene intersect cost). */
const OCCLUSION_THROTTLE_FRAMES = 4;

const _occlusionCache = new WeakMap();
const _occlusionKeyFallback = { __nameplateOcclusionFallback: true };

/**
 * @param {THREE.Object3D | null | undefined} mesh
 * @param {THREE.Object3D | null | undefined} root
 */
function meshIsUnderRoot(mesh, root) {
  if (!mesh || !root) return false;
  let o = mesh;
  while (o) {
    if (o === root) return true;
    o = o.parent;
  }
  return false;
}

/**
 * True if level geometry blocks the camera from seeing `targetWorldPos` (player head / name anchor).
 * Aligns skip rules with {@link OcclusionFader} so floors / non-occluders behave the same.
 *
 * @param {THREE.Scene} scene
 * @param {THREE.Camera} camera
 * @param {THREE.Vector3} targetWorldPos
 * @param {THREE.Object3D} [ignorePlayerRoot] — mouse group; hits on this avatar are ignored
 * @param {number} [frameIndex] — monotonic per-frame id from the game loop; enables throttling
 */
export function isNameplateOccluded(scene, camera, targetWorldPos, ignorePlayerRoot, frameIndex = 0) {
  _origin.copy(camera.position);
  _dir.copy(targetWorldPos).sub(_origin);
  const dist = _dir.length();
  if (dist < 0.08) return false;
  if (dist > OCCLUSION_MAX_DIST) return false;
  _dir.divideScalar(dist);

  const cacheKey = (ignorePlayerRoot && typeof ignorePlayerRoot === 'object')
    ? ignorePlayerRoot
    : _occlusionKeyFallback;
  let rec = _occlusionCache.get(cacheKey);
  if (!rec) {
    rec = { lastEvalFrame: -1_000_000, lastResult: false };
    _occlusionCache.set(cacheKey, rec);
  }
  if (frameIndex === rec.lastEvalFrame) return rec.lastResult;
  if (
    rec.lastEvalFrame >= 0
    && frameIndex > rec.lastEvalFrame
    && frameIndex - rec.lastEvalFrame < OCCLUSION_THROTTLE_FRAMES
  ) {
    return rec.lastResult;
  }

  const margin = 0.12;
  _raycaster.set(_origin, _dir);
  _raycaster.far = Math.max(0, dist - margin);
  _raycaster.camera = camera;

  if (_raycaster.far < 0.02) {
    rec.lastEvalFrame = frameIndex;
    rec.lastResult = false;
    return false;
  }

  const hits = _raycaster.intersectObjects(scene.children, true);

  for (const hit of hits) {
    const obj = hit.object;
    if (!obj.isMesh) continue;
    if (obj.visible === false) continue;
    if (meshIsUnderRoot(obj, ignorePlayerRoot)) continue;
    if (obj.userData?.skipFade) continue;
    if (obj.userData?.isFloor) continue;
    if (obj.userData?.surfaceType === 'floor') continue;
    if (obj.userData?.cameraOccluder === false) continue;
    if (obj.userData?.runnable === true) continue;

    const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
    let blocks = false;
    for (const mat of materials) {
      if (!mat) continue;
      const op = mat.opacity ?? 1;
      const visible = mat.visible !== false;
      if (visible && op > 0.08) {
        blocks = true;
        break;
      }
    }
    if (blocks) {
      rec.lastEvalFrame = frameIndex;
      rec.lastResult = true;
      return true;
    }
  }

  rec.lastEvalFrame = frameIndex;
  rec.lastResult = false;
  return false;
}
