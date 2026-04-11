import * as THREE from 'three';

const _raycaster = new THREE.Raycaster();
const _dir = new THREE.Vector3();
const _origin = new THREE.Vector3();

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
 */
export function isNameplateOccluded(scene, camera, targetWorldPos, ignorePlayerRoot) {
  _origin.copy(camera.position);
  _dir.copy(targetWorldPos).sub(_origin);
  const dist = _dir.length();
  if (dist < 0.08) return false;
  _dir.divideScalar(dist);

  const margin = 0.12;
  _raycaster.set(_origin, _dir);
  _raycaster.far = Math.max(0, dist - margin);
  _raycaster.camera = camera;

  if (_raycaster.far < 0.02) return false;

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
    if (blocks) return true;
  }

  return false;
}
