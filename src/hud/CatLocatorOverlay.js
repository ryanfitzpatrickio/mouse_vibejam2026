import * as THREE from 'three';

/**
 * Edge-of-screen arrow toward the cat when it is far or not in the forward view (third-person safe).
 */
export class CatLocatorOverlay {
  constructor({ container = document.body } = {}) {
    this.arrow = document.createElement('div');
    this.arrow.textContent = '▲';
    this.arrow.setAttribute('aria-hidden', 'true');
    Object.assign(this.arrow.style, {
      position: 'fixed',
      display: 'none',
      zIndex: '98',
      pointerEvents: 'none',
      color: '#ff6b4a',
      fontSize: '22px',
      fontWeight: '900',
      textShadow: '0 0 8px #000, 0 1px 3px #000',
      userSelect: 'none',
      transformOrigin: '50% 50%',
    });
    this.dist = document.createElement('div');
    Object.assign(this.dist.style, {
      position: 'fixed',
      display: 'none',
      zIndex: '98',
      pointerEvents: 'none',
      color: 'rgba(255,245,230,0.92)',
      fontSize: '10px',
      fontFamily: 'monospace',
      fontWeight: '700',
      textShadow: '1px 1px 2px #000',
      userSelect: 'none',
    });
    container.appendChild(this.arrow);
    container.appendChild(this.dist);
    this._tmp = new THREE.Vector3();
    this._fwd = new THREE.Vector3();
  }

  /**
   * @param {{
   *   camera?: THREE.Camera,
   *   canvasRect?: DOMRect,
   *   catWorldPos?: THREE.Vector3,
   *   catAlive?: boolean,
   *   hideWhenCloserThan?: number,
   *   showWhenFartherThan?: number,
   * }=} opts
   */
  update({
    camera,
    canvasRect,
    catWorldPos,
    catAlive = true,
    hideWhenCloserThan = 5,
    showWhenFartherThan = 7,
  } = {}) {
    if (!camera || !canvasRect || !catWorldPos || !catAlive) {
      this.arrow.style.display = 'none';
      this.dist.style.display = 'none';
      return;
    }

    const w = canvasRect.width;
    const h = canvasRect.height;
    if (w < 16 || h < 16) {
      this.arrow.style.display = 'none';
      this.dist.style.display = 'none';
      return;
    }

    const dist = camera.position.distanceTo(catWorldPos);
    if (dist < hideWhenCloserThan) {
      this._tmp.copy(catWorldPos).project(camera);
      const margin = 0.12;
      const onScreen = this._tmp.z > -1 && this._tmp.z < 1
        && this._tmp.x > -1 + margin && this._tmp.x < 1 - margin
        && this._tmp.y > -1 + margin && this._tmp.y < 1 - margin;
      if (onScreen) {
        this.arrow.style.display = 'none';
        this.dist.style.display = 'none';
        return;
      }
    }

    if (dist < showWhenFartherThan) {
      this._tmp.copy(catWorldPos).project(camera);
      const margin = 0.11;
      const onScreen = this._tmp.z > -1 && this._tmp.z < 1
        && this._tmp.x > -1 + margin && this._tmp.x < 1 - margin
        && this._tmp.y > -1 + margin && this._tmp.y < 1 - margin;
      if (onScreen) {
        this.arrow.style.display = 'none';
        this.dist.style.display = 'none';
        return;
      }
    }

    this._tmp.copy(catWorldPos).sub(camera.position);
    this._fwd.set(0, 0, -1).applyQuaternion(camera.quaternion);
    const flatX = this._tmp.x;
    const flatZ = this._tmp.z;
    const len = Math.hypot(flatX, flatZ);
    if (len < 0.08) {
      this.arrow.style.display = 'none';
      this.dist.style.display = 'none';
      return;
    }

    const yawCat = Math.atan2(flatX, flatZ);
    const yawCam = Math.atan2(this._fwd.x, this._fwd.z);
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

    this.arrow.style.left = `${ex - 11}px`;
    this.arrow.style.top = `${ey - 11}px`;
    this.arrow.style.transform = `rotate(${ang * (180 / Math.PI) + 90}deg)`;
    this.arrow.style.display = 'block';

    this.dist.textContent = `${dist.toFixed(0)}m`;
    this.dist.style.left = `${ex - 16}px`;
    this.dist.style.top = `${ey + 16}px`;
    this.dist.style.display = 'block';
  }

  dispose() {
    this.arrow.remove();
    this.dist.remove();
  }
}
