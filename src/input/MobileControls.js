const NON_PASSIVE = { passive: false };
const CAPTURE_NON_PASSIVE = { passive: false, capture: true };

function preventGesture(event) {
  if (event.cancelable) event.preventDefault();
}

function consumeControlEvent(event) {
  preventGesture(event);
  event.stopPropagation();
}

function setPointerCaptureSafe(element, pointerId) {
  try {
    element.setPointerCapture(pointerId);
  } catch {
    // Android can throw if a pointer is canceled between dispatch and capture.
  }
}

function releasePointerCaptureSafe(element, pointerId) {
  try {
    if (element.hasPointerCapture?.(pointerId)) {
      element.releasePointerCapture(pointerId);
    }
  } catch {
    // Ignore stale pointer capture state.
  }
}

function createButton(label, accent = '#d9a56c') {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = label;
  button.ariaLabel = label;
  button.draggable = false;
  Object.assign(button.style, {
    appearance: 'none',
    WebkitAppearance: 'none',
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
    WebkitTouchCallout: 'none',
    WebkitTapHighlightColor: 'transparent',
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
      overscrollBehavior: 'none',
      userSelect: 'none',
      WebkitUserSelect: 'none',
      WebkitTouchCallout: 'none',
      WebkitTapHighlightColor: 'transparent',
      fontFamily: 'system-ui, sans-serif',
    });

    this.joystickZone = document.createElement('div');
    Object.assign(this.joystickZone.style, {
      position: 'absolute',
      left: '16px',
      bottom: 'calc(16px + env(safe-area-inset-bottom))',
      zIndex: '2',
      width: '150px',
      height: '150px',
      pointerEvents: 'auto',
      touchAction: 'none',
      WebkitUserSelect: 'none',
      WebkitTouchCallout: 'none',
      WebkitTapHighlightColor: 'transparent',
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
      zIndex: '1',
      pointerEvents: 'auto',
      touchAction: 'none',
      WebkitUserSelect: 'none',
      WebkitTouchCallout: 'none',
      WebkitTapHighlightColor: 'transparent',
    });

    this.buttonStack = document.createElement('div');
    Object.assign(this.buttonStack.style, {
      position: 'absolute',
      right: 'calc(18px + env(safe-area-inset-right))',
      bottom: 'calc(18px + env(safe-area-inset-bottom))',
      zIndex: '3',
      display: 'grid',
      gridTemplateColumns: 'repeat(2, minmax(72px, 1fr))',
      gap: '10px',
      pointerEvents: 'auto',
      touchAction: 'none',
      WebkitUserSelect: 'none',
      WebkitTouchCallout: 'none',
      WebkitTapHighlightColor: 'transparent',
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
    this._previousViewportStyles = null;
    this._viewportLocked = false;
    this._preventDocumentTouch = (event) => {
      if (this.root.style.display === 'none') return;
      preventGesture(event);
    };
    this._preventRootTouch = (event) => {
      preventGesture(event);
    };
  }

  async init() {
    this._installViewportGestureGuards();
    this._installJoystick();
    this._installCameraTouch();
    this._installButtons();
    return this;
  }

  _installJoystick() {
    this.joystickZone.addEventListener('pointerdown', (e) => {
      if (this._joystickTouchId !== null) return;
      consumeControlEvent(e);
      this._joystickTouchId = e.pointerId;
      setPointerCaptureSafe(this.joystickZone, e.pointerId);
      const rect = this.joystickZone.getBoundingClientRect();
      this._joystickCenterX = rect.left + rect.width * 0.5;
      this._joystickCenterY = rect.top + rect.height * 0.5;
      this._updateJoystick(e.clientX, e.clientY);
    });

    this.joystickZone.addEventListener('pointermove', (e) => {
      if (e.pointerId !== this._joystickTouchId) return;
      consumeControlEvent(e);
      this._updateJoystick(e.clientX, e.clientY);
    });

    const endJoystick = (e) => {
      if (e.pointerId !== this._joystickTouchId) return;
      consumeControlEvent(e);
      releasePointerCaptureSafe(this.joystickZone, e.pointerId);
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
      consumeControlEvent(e);
      this._cameraTouchId = e.pointerId;
      this._cameraLastX = e.clientX;
      this._cameraLastY = e.clientY;
      setPointerCaptureSafe(this.cameraZone, e.pointerId);
    });

    this.cameraZone.addEventListener('pointermove', (e) => {
      if (e.pointerId !== this._cameraTouchId) return;
      consumeControlEvent(e);
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
        consumeControlEvent(e);
        releasePointerCaptureSafe(this.cameraZone, e.pointerId);
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

    const end = (pointerId = heldPointerId) => {
      if (heldPointerId === null) return;
      releasePointerCaptureSafe(button, pointerId);
      heldPointerId = null;
      button.dataset.active = 'false';
      onUp?.();
    };

    button.addEventListener('pointerdown', (event) => {
      consumeControlEvent(event);
      if (heldPointerId !== null) return;
      heldPointerId = event.pointerId;
      setPointerCaptureSafe(button, event.pointerId);
      button.dataset.active = 'true';
      onDown?.();
    });
    button.addEventListener('pointerup', (event) => {
      if (event.pointerId !== heldPointerId) return;
      consumeControlEvent(event);
      end(event.pointerId);
    });
    button.addEventListener('pointercancel', (event) => {
      if (event.pointerId !== heldPointerId) return;
      consumeControlEvent(event);
      end(event.pointerId);
    });
    button.addEventListener('lostpointercapture', (event) => {
      if (event.pointerId !== heldPointerId) return;
      end(event.pointerId);
    });
  }

  _bindTapButton(button, onTap) {
    let activePointerId = null;

    const clear = (pointerId = activePointerId) => {
      if (activePointerId === null) return;
      releasePointerCaptureSafe(button, pointerId);
      activePointerId = null;
      button.dataset.active = 'false';
    };

    button.addEventListener('pointerdown', (event) => {
      consumeControlEvent(event);
      if (activePointerId !== null) return;
      activePointerId = event.pointerId;
      setPointerCaptureSafe(button, event.pointerId);
      button.dataset.active = 'true';
      onTap?.();
    });
    button.addEventListener('pointerup', (event) => {
      if (event.pointerId !== activePointerId) return;
      consumeControlEvent(event);
      clear(event.pointerId);
    });
    button.addEventListener('pointercancel', (event) => {
      if (event.pointerId !== activePointerId) return;
      consumeControlEvent(event);
      clear(event.pointerId);
    });
    button.addEventListener('lostpointercapture', (event) => {
      if (event.pointerId !== activePointerId) return;
      clear(event.pointerId);
    });
  }

  _installViewportGestureGuards() {
    this._applyViewportLock();
    this.root.addEventListener('touchstart', this._preventRootTouch, CAPTURE_NON_PASSIVE);
    this.root.addEventListener('touchmove', this._preventRootTouch, CAPTURE_NON_PASSIVE);
    this.root.addEventListener('touchend', this._preventRootTouch, CAPTURE_NON_PASSIVE);
    this.root.addEventListener('touchcancel', this._preventRootTouch, CAPTURE_NON_PASSIVE);
    document.addEventListener('touchmove', this._preventDocumentTouch, NON_PASSIVE);
    window.addEventListener('gesturestart', this._preventDocumentTouch, NON_PASSIVE);
    window.addEventListener('gesturechange', this._preventDocumentTouch, NON_PASSIVE);
    window.addEventListener('contextmenu', this._preventDocumentTouch, NON_PASSIVE);
  }

  _applyViewportLock() {
    if (this._viewportLocked) return;
    const html = document.documentElement;
    const body = document.body;
    const canvas = document.getElementById('canvas');
    this._previousViewportStyles = {
      html: {
        touchAction: html.style.touchAction,
        overscrollBehavior: html.style.overscrollBehavior,
        userSelect: html.style.userSelect,
        WebkitUserSelect: html.style.WebkitUserSelect,
        WebkitTouchCallout: html.style.WebkitTouchCallout,
      },
      body: {
        touchAction: body.style.touchAction,
        overscrollBehavior: body.style.overscrollBehavior,
        userSelect: body.style.userSelect,
        WebkitUserSelect: body.style.WebkitUserSelect,
        WebkitTouchCallout: body.style.WebkitTouchCallout,
      },
      canvas: canvas ? {
        touchAction: canvas.style.touchAction,
        userSelect: canvas.style.userSelect,
        WebkitUserSelect: canvas.style.WebkitUserSelect,
        WebkitTapHighlightColor: canvas.style.WebkitTapHighlightColor,
      } : null,
    };

    Object.assign(html.style, {
      touchAction: 'none',
      overscrollBehavior: 'none',
      userSelect: 'none',
      WebkitUserSelect: 'none',
      WebkitTouchCallout: 'none',
    });
    Object.assign(body.style, {
      touchAction: 'none',
      overscrollBehavior: 'none',
      userSelect: 'none',
      WebkitUserSelect: 'none',
      WebkitTouchCallout: 'none',
    });
    if (canvas) {
      Object.assign(canvas.style, {
        touchAction: 'none',
        userSelect: 'none',
        WebkitUserSelect: 'none',
        WebkitTapHighlightColor: 'transparent',
      });
    }

    this._viewportLocked = true;
  }

  _releaseViewportLock() {
    if (!this._viewportLocked || !this._previousViewportStyles) return;
    const html = document.documentElement;
    const body = document.body;
    const canvas = document.getElementById('canvas');
    Object.assign(html.style, this._previousViewportStyles.html);
    Object.assign(body.style, this._previousViewportStyles.body);
    if (canvas && this._previousViewportStyles.canvas) {
      Object.assign(canvas.style, this._previousViewportStyles.canvas);
    }
    this._previousViewportStyles = null;
    this._viewportLocked = false;
  }

  show() {
    this.root.style.display = 'block';
    this._applyViewportLock();
  }

  hide() {
    this.root.style.display = 'none';
    this._releaseViewportLock();
  }

  dispose() {
    this.root.removeEventListener('touchstart', this._preventRootTouch, true);
    this.root.removeEventListener('touchmove', this._preventRootTouch, true);
    this.root.removeEventListener('touchend', this._preventRootTouch, true);
    this.root.removeEventListener('touchcancel', this._preventRootTouch, true);
    document.removeEventListener('touchmove', this._preventDocumentTouch);
    window.removeEventListener('gesturestart', this._preventDocumentTouch);
    window.removeEventListener('gesturechange', this._preventDocumentTouch);
    window.removeEventListener('contextmenu', this._preventDocumentTouch);
    this._releaseViewportLock();
    this.root.remove();
  }
}
