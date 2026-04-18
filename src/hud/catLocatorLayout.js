import * as THREE from 'three';

const _tmp = new THREE.Vector3();
const _fwd = new THREE.Vector3();

/**
 * @param {{
 *   camera?: THREE.Camera,
 *   canvasRect?: DOMRect,
 *   catWorldPos?: THREE.Vector3,
 *   catAlive?: boolean,
 *   hideWhenCloserThan?: number,
 *   showWhenFartherThan?: number,
 * }=} opts
 * @returns {{ visible: false } | { visible: true, ex: number, ey: number, ang: number, distText: string }}
 */
export function computeCatLocatorLayout({
  camera,
  canvasRect,
  catWorldPos,
  catAlive = true,
  hideWhenCloserThan = 5,
  showWhenFartherThan = 7,
} = {}) {
  if (!camera || !canvasRect || !catWorldPos || !catAlive) {
    return { visible: false };
  }

  const w = canvasRect.width;
  const h = canvasRect.height;
  if (w < 16 || h < 16) {
    return { visible: false };
  }

  const dist = camera.position.distanceTo(catWorldPos);
  if (dist < hideWhenCloserThan) {
    _tmp.copy(catWorldPos).project(camera);
    const margin = 0.12;
    const onScreen = _tmp.z > -1 && _tmp.z < 1
      && _tmp.x > -1 + margin && _tmp.x < 1 - margin
      && _tmp.y > -1 + margin && _tmp.y < 1 - margin;
    if (onScreen) {
      return { visible: false };
    }
  }

  if (dist < showWhenFartherThan) {
    _tmp.copy(catWorldPos).project(camera);
    const margin = 0.11;
    const onScreen = _tmp.z > -1 && _tmp.z < 1
      && _tmp.x > -1 + margin && _tmp.x < 1 - margin
      && _tmp.y > -1 + margin && _tmp.y < 1 - margin;
    if (onScreen) {
      return { visible: false };
    }
  }

  _tmp.copy(catWorldPos).sub(camera.position);
  _fwd.set(0, 0, -1).applyQuaternion(camera.quaternion);
  const flatX = _tmp.x;
  const flatZ = _tmp.z;
  const len = Math.hypot(flatX, flatZ);
  if (len < 0.08) {
    return { visible: false };
  }

  const yawCat = Math.atan2(flatX, flatZ);
  const yawCam = Math.atan2(_fwd.x, _fwd.z);
  let ang = yawCat - yawCam;
  if (ang > Math.PI) ang -= Math.PI * 2;
  if (ang < -Math.PI) ang += Math.PI * 2;

  const cx = canvasRect.left + w * 0.5;
  const cy = canvasRect.top + h * 0.5;
  const rx = Math.min(w, h) * 0.4;
  const ry = Math.min(w, h) * 0.36;
  let ex = cx + Math.sin(ang) * rx;
  let ey = cy - Math.cos(ang) * ry;

  const pad = 28;
  ex = Math.min(canvasRect.right - pad, Math.max(canvasRect.left + pad, ex));
  ey = Math.min(canvasRect.bottom - pad, Math.max(canvasRect.top + pad, ey));

  return {
    visible: true,
    ex,
    ey,
    ang,
    distText: `${dist.toFixed(0)}m`,
  };
}
