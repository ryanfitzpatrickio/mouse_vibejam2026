import * as THREE from 'three';

export class PlacementMode {
  constructor({ domElement } = {}) {
    this.domElement = domElement ?? document.body;
    this.target = null;
    this._active = false;
    this._initialTransform = null;
    this._onDone = null;

    this.moveSpeed = 0.3;
    this.fineMoveSpeed = 0.03;
    this.rotateSpeed = 0.003;
    this.fineRotateSpeed = 0.0003;
    this.scaleSpeed = 0.05;
    this.fineScaleSpeed = 0.005;

    this._keys = new Set();
    this._isDragging = false;
    this._lastMouseX = 0;
    this._lastMouseY = 0;
    this._prevCursor = '';

    this._onKeyDown = this._onKeyDown.bind(this);
    this._onKeyUp = this._onKeyUp.bind(this);
    this._onMouseDown = this._onMouseDown.bind(this);
    this._onMouseUp = this._onMouseUp.bind(this);
    this._onMouseMove = this._onMouseMove.bind(this);
    this._onWheel = this._onWheel.bind(this);
    this._onContextMenu = this._onContextMenu.bind(this);
  }

  get active() {
    return this._active;
  }

  activate(target, { onDone, label } = {}) {
    if (this._active) this.deactivate();
    if (!target) return;

    this.target = target;
    this._active = true;
    this._onDone = onDone;
    this._label = label || target.name || target.type;

    this._initialTransform = {
      position: target.position.clone(),
      rotation: new THREE.Euler(target.rotation.x, target.rotation.y, target.rotation.z, target.rotation.order),
      scale: target.scale.clone(),
    };

    const el = this.domElement;
    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
    el.addEventListener('mousedown', this._onMouseDown);
    window.addEventListener('mouseup', this._onMouseUp);
    window.addEventListener('mousemove', this._onMouseMove);
    el.addEventListener('wheel', this._onWheel, { passive: false });
    el.addEventListener('contextmenu', this._onContextMenu);

    this._prevCursor = el.style.cursor;
    el.style.cursor = 'crosshair';

    console.log(
      `%c[PlacementMode]%c ${this._label}\n` +
      '  WASD = move local XZ, Q/E = move Y\n' +
      '  Drag = rotate XY, Shift+Drag = rotate Z\n' +
      '  Scroll = uniform scale\n' +
      '  Ctrl = fine (all), R = reset, Esc = done & log',
      'color: #0af; font-weight: bold', 'color: inherit',
    );
  }

  deactivate() {
    if (!this._active) return;
    this._active = false;

    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);
    this.domElement.removeEventListener('mousedown', this._onMouseDown);
    window.removeEventListener('mouseup', this._onMouseUp);
    window.removeEventListener('mousemove', this._onMouseMove);
    this.domElement.removeEventListener('wheel', this._onWheel);
    this.domElement.removeEventListener('contextmenu', this._onContextMenu);

    this.domElement.style.cursor = this._prevCursor;

    const t = this.target;
    if (t) {
      const placement = {
        position: { x: +t.position.x.toFixed(4), y: +t.position.y.toFixed(4), z: +t.position.z.toFixed(4) },
        rotation: { x: +t.rotation.x.toFixed(4), y: +t.rotation.y.toFixed(4), z: +t.rotation.z.toFixed(4) },
        scale: { x: +t.scale.x.toFixed(4), y: +t.scale.y.toFixed(4), z: +t.scale.z.toFixed(4) },
      };
      console.log(
        `%c[PlacementMode]%c ${this._label} final placement:`,
        'color: #0af; font-weight: bold', 'color: #0f0',
      );
      console.log(JSON.stringify(placement, null, 2));

      if (this._onDone) this._onDone(placement);
    }

    this.target = null;
    this._keys.clear();
    this._isDragging = false;
  }

  update(dt) {
    if (!this._active || !this.target) return;

    const fine = this._keys.has('ControlLeft') || this._keys.has('ControlRight');
    const speed = (fine ? this.fineMoveSpeed : this.moveSpeed) * dt;

    const localX = new THREE.Vector3(1, 0, 0);
    const localY = new THREE.Vector3(0, 1, 0);
    const localZ = new THREE.Vector3(0, 0, 1);

    if (this._keys.has('KeyD')) this.target.position.addScaledVector(localX, speed);
    if (this._keys.has('KeyA')) this.target.position.addScaledVector(localX, -speed);
    if (this._keys.has('KeyE')) this.target.position.addScaledVector(localY, speed);
    if (this._keys.has('KeyQ')) this.target.position.addScaledVector(localY, -speed);
    if (this._keys.has('KeyW')) this.target.position.addScaledVector(localZ, speed);
    if (this._keys.has('KeyS')) this.target.position.addScaledVector(localZ, -speed);
  }

  _onKeyDown(e) {
    if (!this._active) return;
    this._keys.add(e.code);

    if (e.code === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      this.deactivate();
      return;
    }

    if (e.code === 'KeyR') {
      const init = this._initialTransform;
      if (init && this.target) {
        this.target.position.copy(init.position);
        this.target.rotation.copy(init.rotation);
        this.target.scale.copy(init.scale);
        console.log('[PlacementMode] Reset');
      }
    }

    if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE', 'KeyR'].includes(e.code)) {
      e.preventDefault();
    }
  }

  _onKeyUp(e) {
    this._keys.delete(e.code);
  }

  _onMouseDown(e) {
    if (!this._active) return;
    if (e.button === 0 || e.button === 2) {
      this._isDragging = true;
      this._lastMouseX = e.clientX;
      this._lastMouseY = e.clientY;
      e.preventDefault();
    }
  }

  _onMouseUp(e) {
    if (e.button === 0 || e.button === 2) this._isDragging = false;
  }

  _onMouseMove(e) {
    if (!this._active || !this._isDragging) return;

    const dx = e.clientX - this._lastMouseX;
    const dy = e.clientY - this._lastMouseY;
    this._lastMouseX = e.clientX;
    this._lastMouseY = e.clientY;

    const fine = this._keys.has('ControlLeft') || this._keys.has('ControlRight');
    const speed = fine ? this.fineRotateSpeed : this.rotateSpeed;
    const shift = this._keys.has('ShiftLeft') || this._keys.has('ShiftRight');

    if (shift) {
      this.target.rotation.z += dx * speed;
    } else {
      this.target.rotation.y += dx * speed;
      this.target.rotation.x += dy * speed;
    }
  }

  _onWheel(e) {
    if (!this._active) return;
    e.preventDefault();

    const fine = this._keys.has('ControlLeft') || this._keys.has('ControlRight');
    const speed = fine ? this.fineScaleSpeed : this.scaleSpeed;
    const delta = e.deltaY > 0 ? -speed : speed;

    const s = Math.max(0.01, this.target.scale.x + delta);
    this.target.scale.set(s, s, s);
  }

  _onContextMenu(e) {
    if (this._active) e.preventDefault();
  }
}
