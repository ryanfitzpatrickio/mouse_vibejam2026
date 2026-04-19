const NON_PASSIVE = { passive: false };
const CAPTURE_NON_PASSIVE = { passive: false, capture: true };
const SVG_NS = 'http://www.w3.org/2000/svg';

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

function addSvgPath(svg, attrs) {
  const path = document.createElementNS(SVG_NS, 'path');
  for (const [key, value] of Object.entries(attrs)) path.setAttribute(key, value);
  svg.append(path);
}

function addSvgCircle(svg, attrs) {
  const circle = document.createElementNS(SVG_NS, 'circle');
  for (const [key, value] of Object.entries(attrs)) circle.setAttribute(key, value);
  svg.append(circle);
}

function addSvgLine(svg, attrs) {
  const line = document.createElementNS(SVG_NS, 'line');
  for (const [key, value] of Object.entries(attrs)) line.setAttribute(key, value);
  svg.append(line);
}

function createIcon(name) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', '22');
  svg.setAttribute('height', '22');
  svg.setAttribute('aria-hidden', 'true');
  Object.assign(svg.style, {
    display: 'block',
    flexShrink: '0',
    pointerEvents: 'none',
  });
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.9');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');

  if (name === 'jump') {
    addSvgPath(svg, { d: 'M12 20V5' });
    addSvgPath(svg, { d: 'M6.5 10.5 12 5l5.5 5.5' });
    addSvgPath(svg, { d: 'M6 20h12' });
  } else if (name === 'sprint') {
    addSvgPath(svg, { d: 'M4 17 10 7l3.2 5H18' });
    addSvgPath(svg, { d: 'M13 7h5' });
    addSvgPath(svg, { d: 'M15.5 4.5 18 7l-2.5 2.5' });
  } else if (name === 'crouch') {
    addSvgPath(svg, { d: 'M7 8h7.5a3.5 3.5 0 0 1 0 7H10' });
    addSvgPath(svg, { d: 'M10 15v4' });
    addSvgPath(svg, { d: 'M6 19h9' });
  } else if (name === 'emote') {
    addSvgCircle(svg, { cx: '12', cy: '12', r: '8' });
    addSvgLine(svg, { x1: '9', y1: '10', x2: '9.01', y2: '10' });
    addSvgLine(svg, { x1: '15', y1: '10', x2: '15.01', y2: '10' });
    addSvgPath(svg, { d: 'M8.8 14.2c1.6 1.8 4.8 1.8 6.4 0' });
  } else if (name === 'ball') {
    addSvgCircle(svg, { cx: '10.5', cy: '13.5', r: '5.5' });
    addSvgPath(svg, { d: 'M10.5 8v11' });
    addSvgPath(svg, { d: 'M5 13.5h11' });
    addSvgPath(svg, { d: 'M17 5v5' });
    addSvgPath(svg, { d: 'M14.5 7.5h5' });
  } else if (name === 'use') {
    addSvgPath(svg, { d: 'M7 12.5V7a1.4 1.4 0 0 1 2.8 0v5' });
    addSvgPath(svg, { d: 'M9.8 11V5.8a1.4 1.4 0 0 1 2.8 0V11' });
    addSvgPath(svg, { d: 'M12.6 11.3V7a1.4 1.4 0 0 1 2.8 0v5.4' });
    addSvgPath(svg, { d: 'M15.4 12.8v-2a1.3 1.3 0 0 1 2.6 0V14c0 4-2.8 6-6 6h-1.2C8 20 6 18 6 15.6v-1.8' });
  } else if (name === 'drop') {
    addSvgPath(svg, { d: 'M12 4v10' });
    addSvgPath(svg, { d: 'M7.5 10.5 12 15l4.5-4.5' });
    addSvgPath(svg, { d: 'M6 19h12' });
  } else if (name === 'grab') {
    addSvgPath(svg, { d: 'M8 11V6a1.4 1.4 0 0 1 2.8 0v5' });
    addSvgPath(svg, { d: 'M10.8 10V5.2a1.4 1.4 0 0 1 2.8 0V11' });
    addSvgPath(svg, { d: 'M13.6 11V7a1.4 1.4 0 0 1 2.8 0v5.2' });
    addSvgPath(svg, { d: 'M16.4 12.4v-1.6a1.3 1.3 0 0 1 2.6 0V15c0 3.4-2.4 5.5-5.5 5.5h-1C9.6 20.5 7.5 18.4 7.5 15.5V13' });
  } else if (name === 'rope') {
    addSvgPath(svg, { d: 'M6 4c3 2 3 4 0 6s-3 4 0 6 3 4 0 6' });
    addSvgPath(svg, { d: 'M13 4c3 2 3 4 0 6s-3 4 0 6 3 4 0 6' });
  } else if (name === 'hero') {
    addSvgPath(svg, { d: 'M12 3 14.2 8l5.3.5-4 3.8 1.2 5.3L12 14.9 7.3 17.6l1.2-5.3-4-3.8L9.8 8z' });
  } else if (name === 'smack') {
    addSvgPath(svg, { d: 'M4 13 10 7l3 3-6 6z' });
    addSvgPath(svg, { d: 'M11 8l2-2 5 5-2 2' });
    addSvgPath(svg, { d: 'M15 3v2M18 5l-1.4 1.4M19 9h2' });
  }

  return svg;
}

function setButtonActive(button, active) {
  button.dataset.active = active ? 'true' : 'false';
  button.style.transform = active ? 'translateY(1px) scale(0.97)' : 'translateY(0) scale(1)';
  button.style.background = active
    ? 'linear-gradient(180deg, rgba(255,255,255,0.26), rgba(255,255,255,0.08)), rgba(192,77,52,0.52)'
    : 'linear-gradient(180deg, rgba(255,255,255,0.18), rgba(255,255,255,0.06)), rgba(15,18,18,0.42)';
  button.style.borderColor = active ? 'rgba(255,236,185,0.56)' : 'rgba(255,255,255,0.28)';
  button.style.color = active ? '#fff3d4' : '#fff8ef';
}

function createButton({ label, icon, primary = false, area = '' }) {
  const button = document.createElement('button');
  button.type = 'button';
  button.ariaLabel = label;
  button.draggable = false;
  if (area) button.style.gridArea = area;

  const iconEl = createIcon(icon);
  const text = document.createElement('span');
  text.textContent = label;
  Object.assign(text.style, {
    fontSize: primary ? '12px' : '10px',
    fontWeight: '800',
    lineHeight: '1',
    textTransform: 'uppercase',
    letterSpacing: '0',
    whiteSpace: 'nowrap',
    pointerEvents: 'none',
  });

  button.append(iconEl, text);
  Object.assign(button.style, {
    appearance: 'none',
    WebkitAppearance: 'none',
    border: '1px solid rgba(255,255,255,0.28)',
    borderRadius: '8px',
    background: 'linear-gradient(180deg, rgba(255,255,255,0.18), rgba(255,255,255,0.06)), rgba(15,18,18,0.42)',
    color: '#fff8ef',
    width: primary ? '74px' : '62px',
    height: primary ? '118px' : '54px',
    padding: primary ? '12px 8px' : '7px 6px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '5px',
    boxSizing: 'border-box',
    boxShadow: '0 12px 26px rgba(0,0,0,0.34), inset 0 1px 0 rgba(255,255,255,0.18)',
    backdropFilter: 'blur(12px)',
    WebkitBackdropFilter: 'blur(12px)',
    touchAction: 'none',
    userSelect: 'none',
    WebkitUserSelect: 'none',
    WebkitTouchCallout: 'none',
    WebkitTapHighlightColor: 'transparent',
    cursor: 'pointer',
    transition: 'transform 80ms ease, background 80ms ease, border-color 80ms ease, color 80ms ease',
  });
  return button;
}

export class MobileControls {
  constructor({
    controller,
    thirdPersonCamera,
    parent = document.body,
    onSpawnExtraBall = null,
    onOpenEmote = null,
  } = {}) {
    this.controller = controller;
    this.thirdPersonCamera = thirdPersonCamera;
    this.parent = parent;
    this.onSpawnExtraBall = onSpawnExtraBall;
    this.onOpenEmote = onOpenEmote;
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
      background: 'radial-gradient(circle at 35% 28%, rgba(255,255,255,0.2), rgba(255,255,255,0.06) 46%, rgba(0,0,0,0.18))',
      border: '1px solid rgba(255,255,255,0.28)',
      boxShadow: '0 16px 34px rgba(0,0,0,0.34), inset 0 1px 0 rgba(255,255,255,0.16)',
      backdropFilter: 'blur(12px)',
      WebkitBackdropFilter: 'blur(12px)',
    });

    this.joystickKnob = document.createElement('div');
    Object.assign(this.joystickKnob.style, {
      position: 'absolute',
      width: '60px',
      height: '60px',
      borderRadius: '50%',
      background: 'radial-gradient(circle at 35% 30%, rgba(255,255,255,0.42), rgba(255,255,255,0.1))',
      border: '1px solid rgba(255,255,255,0.38)',
      boxShadow: '0 8px 20px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.24)',
      left: '50%',
      top: '50%',
      transform: 'translate(-50%, -50%)',
      pointerEvents: 'none',
    });
    this.joystickZone.appendChild(this.joystickKnob);

    this.cameraZone = document.createElement('div');
    Object.assign(this.cameraZone.style, {
      position: 'absolute',
      inset: '0',
      zIndex: '1',
      pointerEvents: 'auto',
      touchAction: 'none',
      WebkitUserSelect: 'none',
      WebkitTouchCallout: 'none',
      WebkitTapHighlightColor: 'transparent',
    });

    const CLUSTER_SIZE = 260;
    const SATELLITE_SIZE = 54;
    const JUMP_SIZE = 82;
    const RADIUS = 96;

    this.buttonStack = document.createElement('div');
    Object.assign(this.buttonStack.style, {
      position: 'absolute',
      right: 'calc(12px + env(safe-area-inset-right))',
      top: '50%',
      transform: 'translateY(-50%)',
      width: `${CLUSTER_SIZE}px`,
      height: `${CLUSTER_SIZE}px`,
      zIndex: '3',
      pointerEvents: 'none',
      touchAction: 'none',
      WebkitUserSelect: 'none',
      WebkitTouchCallout: 'none',
      WebkitTapHighlightColor: 'transparent',
    });

    this._buttons = {
      jump: createButton({ label: 'Jump', icon: 'jump', primary: true }),
      emote: createButton({ label: 'Emote', icon: 'emote' }),
      hero: createButton({ label: 'Hero', icon: 'hero' }),
      smack: createButton({ label: 'Smack', icon: 'smack' }),
      use: createButton({ label: 'Use', icon: 'use' }),
      grab: createButton({ label: 'Grab', icon: 'grab' }),
      crouch: createButton({ label: 'Slide', icon: 'crouch' }),
      sprint: createButton({ label: 'Sprint', icon: 'sprint' }),
      rope: createButton({ label: 'Rope', icon: 'rope' }),
    };

    const center = CLUSTER_SIZE / 2;
    const placeAt = (el, x, y, size) => {
      Object.assign(el.style, {
        position: 'absolute',
        left: `${x - size / 2}px`,
        top: `${y - size / 2}px`,
        width: `${size}px`,
        height: `${size}px`,
        padding: '4px',
      });
      el.style.pointerEvents = 'auto';
    };

    placeAt(this._buttons.jump, center, center, JUMP_SIZE);

    const satellites = ['emote', 'hero', 'use', 'smack', 'grab', 'crouch', 'sprint', 'rope'];
    const startAngle = -Math.PI / 2;
    for (let i = 0; i < satellites.length; i++) {
      const a = startAngle + (i / satellites.length) * Math.PI * 2;
      const x = center + Math.cos(a) * RADIUS;
      const y = center + Math.sin(a) * RADIUS;
      placeAt(this._buttons[satellites[i]], x, y, SATELLITE_SIZE);
    }

    this.buttonStack.append(
      this._buttons.jump,
      this._buttons.emote,
      this._buttons.hero,
      this._buttons.use,
      this._buttons.smack,
      this._buttons.grab,
      this._buttons.crouch,
      this._buttons.sprint,
      this._buttons.rope,
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
      const target = event.target;
      if (target && typeof target.closest === 'function' && target.closest('[data-scroll-container]')) return;
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

    this._bindTapButton(this._buttons.use, () => {
      if (!kb) return;
      this.controller.keys[kb.interact] = true;
    });

    this._bindHoldButton(this._buttons.grab, () => {
      if (kb) this.controller.keys[kb.grab] = true;
    }, () => {
      if (kb) this.controller.keys[kb.grab] = false;
    });

    this._bindHoldButton(this._buttons.rope, () => {
      if (kb) this.controller.keys[kb.ropeGrab] = true;
    }, () => {
      if (kb) this.controller.keys[kb.ropeGrab] = false;
    });

    this._bindTapButton(this._buttons.smack, () => {
      if (this.controller) this.controller.smackPressed = true;
    });

    this._bindTapButton(this._buttons.hero, () => {
      if (!kb) return;
      this.controller.keys[kb.heroActivate] = true;
    });

    this._bindTapButton(this._buttons.emote, () => {
      this.onOpenEmote?.();
    });
  }

  _bindHoldButton(button, onDown, onUp) {
    let heldPointerId = null;

    const end = (pointerId = heldPointerId) => {
      if (heldPointerId === null) return;
      releasePointerCaptureSafe(button, pointerId);
      heldPointerId = null;
      setButtonActive(button, false);
      onUp?.();
    };

    button.addEventListener('pointerdown', (event) => {
      consumeControlEvent(event);
      if (heldPointerId !== null) return;
      heldPointerId = event.pointerId;
      setPointerCaptureSafe(button, event.pointerId);
      setButtonActive(button, true);
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
      setButtonActive(button, false);
    };

    button.addEventListener('pointerdown', (event) => {
      consumeControlEvent(event);
      if (activePointerId !== null) return;
      activePointerId = event.pointerId;
      setPointerCaptureSafe(button, event.pointerId);
      setButtonActive(button, true);
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

  _releaseHeldInputs() {
    const kb = this.controller?.keyBindings;
    if (kb) {
      this.controller.keys[kb.sprint] = false;
      this.controller.keys[kb.crouch] = false;
      this.controller.keys[kb.jump] = false;
      this.controller.keys[kb.grab] = false;
      this.controller.keys[kb.ropeGrab] = false;
    }
    this._held.jump = false;
    this._held.sprint = false;
    this._held.crouch = false;
    for (const button of Object.values(this._buttons)) {
      setButtonActive(button, false);
    }
  }

  hide() {
    this.root.style.display = 'none';
    this._releaseHeldInputs();
    this._releaseViewportLock();
  }

  dispose() {
    this._releaseHeldInputs();
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
