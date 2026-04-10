function createButton(label, accent = '#d9a56c') {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = label;
  Object.assign(button.style, {
    appearance: 'none',
    border: '1px solid rgba(255,255,255,0.22)',
    borderRadius: '999px',
    background: `linear-gradient(180deg, rgba(255,255,255,0.14), rgba(0,0,0,0.22)), ${accent}`,
    color: '#fff8ef',
    minWidth: '72px',
    minHeight: '72px',
    padding: '10px 14px',
    fontSize: '13px',
    fontWeight: '700',
    letterSpacing: '0.04em',
    textTransform: 'uppercase',
    boxShadow: '0 10px 24px rgba(0,0,0,0.3)',
    touchAction: 'none',
    userSelect: 'none',
    WebkitUserSelect: 'none',
    cursor: 'pointer',
  });
  return button;
}

export class MobileControls {
  constructor({ controller, thirdPersonCamera, parent = document.body } = {}) {
    this.controller = controller;
    this.thirdPersonCamera = thirdPersonCamera;
    this.parent = parent;
    this.moveX = 0;
    this.moveZ = 0;

    this.root = document.createElement('div');
    this.root.dataset.mobileControls = 'true';
    Object.assign(this.root.style, {
      position: 'fixed',
      inset: '0',
      zIndex: '25',
      pointerEvents: 'none',
      touchAction: 'none',
      userSelect: 'none',
      WebkitUserSelect: 'none',
      fontFamily: 'system-ui, sans-serif',
    });

    this.joystickZone = document.createElement('div');
    Object.assign(this.joystickZone.style, {
      position: 'absolute',
      left: '16px',
      bottom: '16px',
      width: '150px',
      height: '150px',
      pointerEvents: 'auto',
      touchAction: 'none',
      borderRadius: '50%',
      background: 'rgba(255,255,255,0.08)',
      border: '2px solid rgba(255,255,255,0.18)',
    });

    this.joystickKnob = document.createElement('div');
    Object.assign(this.joystickKnob.style, {
      position: 'absolute',
      width: '60px',
      height: '60px',
      borderRadius: '50%',
      background: 'radial-gradient(circle, rgba(255,255,255,0.35), rgba(255,255,255,0.12))',
      border: '2px solid rgba(255,255,255,0.3)',
      left: '50%',
      top: '50%',
      transform: 'translate(-50%, -50%)',
      pointerEvents: 'none',
    });
    this.joystickZone.appendChild(this.joystickKnob);

    this.cameraZone = document.createElement('div');
    Object.assign(this.cameraZone.style, {
      position: 'absolute',
      top: '0',
      left: '0',
      right: '0',
      bottom: '200px',
      pointerEvents: 'auto',
      touchAction: 'none',
    });

    this.buttonStack = document.createElement('div');
    Object.assign(this.buttonStack.style, {
      position: 'absolute',
      right: '18px',
      bottom: '18px',
      display: 'grid',
      gridTemplateColumns: 'repeat(2, minmax(72px, 1fr))',
      gap: '10px',
      pointerEvents: 'auto',
      touchAction: 'none',
      alignItems: 'end',
    });

    this._buttons = {
      jump: createButton('Jump', '#a88a5a'),
      sprint: createButton('Sprint', '#5a8aa8'),
      crouch: createButton('Crouch', '#8a5aa8'),
      action: createButton('Action', '#a85a5a'),
    };

    this.buttonStack.append(
      this._buttons.jump,
      this._buttons.sprint,
      this._buttons.crouch,
      this._buttons.action,
    );

    this.root.append(this.cameraZone, this.joystickZone, this.buttonStack);
    this.parent.appendChild(this.root);

    this._held = { jump: false, sprint: false, crouch: false };
    this._cameraTouchId = null;
    this._cameraLastX = 0;
    this._cameraLastY = 0;
    this._cameraSensitivity = 0.005;
    this._joystickTouchId = null;
    this._joystickCenterX = 0;
    this._joystickCenterY = 0;
    this._joystickMaxDist = 45;
  }

  async init() {
    this._installJoystick();
    this._installCameraTouch();
    this._installButtons();
    return this;
  }

  _installJoystick() {
    this.joystickZone.addEventListener('pointerdown', (e) => {
      if (this._joystickTouchId !== null) return;
      e.preventDefault();
      this._joystickTouchId = e.pointerId;
      this.joystickZone.setPointerCapture(e.pointerId);
      const rect = this.joystickZone.getBoundingClientRect();
      this._joystickCenterX = rect.left + rect.width * 0.5;
      this._joystickCenterY = rect.top + rect.height * 0.5;
      this._updateJoystick(e.clientX, e.clientY);
    });

    this.joystickZone.addEventListener('pointermove', (e) => {
      if (e.pointerId !== this._joystickTouchId) return;
      e.preventDefault();
      this._updateJoystick(e.clientX, e.clientY);
    });

    const endJoystick = (e) => {
      if (e.pointerId !== this._joystickTouchId) return;
      this._joystickTouchId = null;
      this.moveX = 0;
      this.moveZ = 0;
      this.joystickKnob.style.transform = 'translate(-50%, -50%)';
    };
    this.joystickZone.addEventListener('pointerup', endJoystick);
    this.joystickZone.addEventListener('pointercancel', endJoystick);
  }

  _updateJoystick(clientX, clientY) {
    let dx = clientX - this._joystickCenterX;
    let dy = clientY - this._joystickCenterY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > this._joystickMaxDist) {
      dx = (dx / dist) * this._joystickMaxDist;
      dy = (dy / dist) * this._joystickMaxDist;
    }
    this.moveX = dx / this._joystickMaxDist;
    this.moveZ = dy / this._joystickMaxDist;
    this.joystickKnob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
  }

  _installCameraTouch() {
    this.cameraZone.addEventListener('pointerdown', (e) => {
      if (this._cameraTouchId !== null) return;
      this._cameraTouchId = e.pointerId;
      this._cameraLastX = e.clientX;
      this._cameraLastY = e.clientY;
      this.cameraZone.setPointerCapture(e.pointerId);
    });

    this.cameraZone.addEventListener('pointermove', (e) => {
      if (e.pointerId !== this._cameraTouchId) return;
      const cam = this.thirdPersonCamera;
      if (!cam) return;
      const dx = e.clientX - this._cameraLastX;
      const dy = e.clientY - this._cameraLastY;
      cam.yaw -= dx * this._cameraSensitivity;
      cam.pitch -= dy * this._cameraSensitivity;
      cam.pitch = Math.max(cam.minPitch, Math.min(cam.maxPitch, cam.pitch));
      this._cameraLastX = e.clientX;
      this._cameraLastY = e.clientY;
    });

    const endCamera = (e) => {
      if (e.pointerId === this._cameraTouchId) {
        this._cameraTouchId = null;
      }
    };
    this.cameraZone.addEventListener('pointerup', endCamera);
    this.cameraZone.addEventListener('pointercancel', endCamera);
  }

  _installButtons() {
    const kb = this.controller?.keyBindings;

    this._bindHoldButton(this._buttons.sprint, () => {
      this._held.sprint = true;
      if (kb) this.controller.keys[kb.sprint] = true;
    }, () => {
      this._held.sprint = false;
      if (kb) this.controller.keys[kb.sprint] = false;
    });

    this._bindHoldButton(this._buttons.crouch, () => {
      this._held.crouch = true;
      if (kb) this.controller.keys[kb.crouch] = true;
    }, () => {
      this._held.crouch = false;
      if (kb) this.controller.keys[kb.crouch] = false;
    });

    this._bindHoldButton(this._buttons.jump, () => {
      this._held.jump = true;
      if (kb) this.controller.keys[kb.jump] = true;
    }, () => {
      this._held.jump = false;
      if (kb) this.controller.keys[kb.jump] = false;
    });

    this._bindTapButton(this._buttons.action, () => {
      if (!kb) return;
      this.controller.keys[kb.interact] = true;
    });
  }

  _bindHoldButton(button, onDown, onUp) {
    let heldPointerId = null;

    const end = () => {
      heldPointerId = null;
      button.dataset.active = 'false';
      onUp?.();
    };

    button.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      event.stopPropagation();
      heldPointerId = event.pointerId;
      button.setPointerCapture(event.pointerId);
      button.dataset.active = 'true';
      onDown?.();
    });
    button.addEventListener('pointerup', (event) => {
      if (event.pointerId !== heldPointerId) return;
      event.preventDefault();
      event.stopPropagation();
      end();
    });
    button.addEventListener('pointercancel', (event) => {
      if (event.pointerId !== heldPointerId) return;
      end();
    });
    button.addEventListener('lostpointercapture', (event) => {
      if (event.pointerId !== heldPointerId) return;
      end();
    });
  }

  _bindTapButton(button, onTap) {
    button.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      event.stopPropagation();
      button.setPointerCapture(event.pointerId);
      button.dataset.active = 'true';
      onTap?.();
    });
    button.addEventListener('pointerup', (event) => {
      event.preventDefault();
      event.stopPropagation();
      button.dataset.active = 'false';
    });
    button.addEventListener('pointercancel', () => {
      button.dataset.active = 'false';
    });
    button.addEventListener('lostpointercapture', () => {
      button.dataset.active = 'false';
    });
  }

  show() {
    this.root.style.display = 'block';
  }

  hide() {
    this.root.style.display = 'none';
  }

  dispose() {
    this.root.remove();
  }
}
