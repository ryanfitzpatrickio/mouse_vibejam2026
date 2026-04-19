import { setInputSource, getInputSource } from './inputSource.js';

const STICK_DEADZONE = 0.28;
const TRIGGER_DEADZONE = 0.15;
const LOOK_SENSITIVITY_YAW = 2.8;
const LOOK_SENSITIVITY_PITCH = 2.0;
const LOOK_EXPO = 2.0;
/** Exponent applied to left-stick magnitude. >1 = more slow-walk range near center. */
const MOVE_RESPONSE_EXPO = 1.6;

/**
 * Polls a connected gamepad (Xbox-style / standard mapping) and feeds input
 * into a CharacterController's `keys` / `mouseButtons` state and a
 * ThirdPersonCamera's yaw/pitch. Designed for wireless Xbox controllers over
 * Bluetooth but works with any Standard Gamepad mapping.
 *
 * Buttons (standard mapping indices):
 *   0 A  -> jump            1 B  -> grab
 *   2 X  -> interact        3 Y  -> emote
 *   4 LB -> hero (one-shot) 5 RB -> throw (release held mouse / ball / item with physics)
 *   6 LT -> crouch          7 RT -> sprint
 *   8 View/Select/Share (hold) -> scoreboard
 *   9 Menu/Start (edge) -> adversary toggle (works even if stick/camera last used keyboard)
 *  10 L3 (edge) -> swap touch control sides
 *  11 R3 (edge) -> spawn ball
 *  12/13/14/15 D-Pad -> movement
 */
export class GamepadManager {
  constructor({
    controller,
    thirdPersonCamera = null,
    scoreboardOverlay = null,
    onToggleControlSides = null,
    onSpawnExtraBall = null,
  } = {}) {
    this.controller = controller;
    this.thirdPersonCamera = thirdPersonCamera;
    this.scoreboardOverlay = scoreboardOverlay;
    this.onToggleControlSides = onToggleControlSides;
    this.onSpawnExtraBall = onSpawnExtraBall;
    this._prevPressed = [];
    this._activeIndex = null;
    /** Post-deadzone left stick, `{ x, y }` in [-1, 1]. Zero when no pad / idle. */
    this.leftStick = { x: 0, y: 0 };

    this._onConnect = (e) => {
      if (this._activeIndex == null) this._activeIndex = e.gamepad.index;
    };
    this._onDisconnect = (e) => {
      if (this._activeIndex === e.gamepad.index) this._activeIndex = null;
    };
    window.addEventListener('gamepadconnected', this._onConnect);
    window.addEventListener('gamepaddisconnected', this._onDisconnect);
  }

  _getActiveGamepad() {
    const pads = typeof navigator !== 'undefined' && navigator.getGamepads
      ? navigator.getGamepads()
      : null;
    if (!pads) return null;
    if (this._activeIndex != null && pads[this._activeIndex]?.connected) {
      return pads[this._activeIndex];
    }
    for (const pad of pads) {
      if (pad && pad.connected) {
        this._activeIndex = pad.index;
        return pad;
      }
    }
    return null;
  }

  update(dt) {
    const controller = this.controller;
    if (!controller || !controller.inputEnabled) return;
    const pad = this._getActiveGamepad();
    if (!pad) {
      this._prevPressed = [];
      controller.analogMove = null;
      this.leftStick.x = 0;
      this.leftStick.y = 0;
      this.scoreboardOverlay?.setGamepadScoreboardHeld?.(false);
      return;
    }

    const kb = controller.keyBindings;
    const keys = controller.keys;
    const axes = pad.axes;
    const buttons = pad.buttons;
    const pressed = buttons.map((b) => !!b?.pressed);
    const prev = this._prevPressed;
    const edge = (i) => pressed[i] && !prev[i];

    // These controls should still work after input source flips to keyboard
    // (e.g. human adversary using mouse for camera), so read them directly.
    this.scoreboardOverlay?.setGamepadScoreboardHeld?.(!!pressed[8]);
    if (edge(9)) keys[kb.adversaryToggle] = true;
    if (edge(10)) this.onToggleControlSides?.();
    if (edge(11)) this.onSpawnExtraBall?.();

    const anyActivity = pressed.some(Boolean)
      || axes.some((v) => Math.abs(v ?? 0) > STICK_DEADZONE);
    if (anyActivity) setInputSource('gamepad');
    // Don't overwrite keyboard state while the keyboard is the active source —
    // otherwise an idle connected controller zeroes out WASD every frame.
    if (getInputSource() !== 'gamepad') {
      this._prevPressed = pressed;
      controller.analogMove = null;
      this.leftStick.x = 0;
      this.leftStick.y = 0;
      return;
    }

    const [lx, ly] = applyRadialDeadzone(axes[0] ?? 0, axes[1] ?? 0, STICK_DEADZONE);
    this.leftStick.x = lx;
    this.leftStick.y = ly;

    // Digital keys drive animation / emote-interrupt logic. Values are
    // already post-deadzone so any nonzero component counts as a press.
    keys[kb.forward] = ly < 0 || pressed[12];
    keys[kb.backward] = ly > 0 || pressed[13];
    keys[kb.left] = lx < 0 || pressed[14];
    keys[kb.right] = lx > 0 || pressed[15];

    // Analog magnitude passed through to physics so a light push walks slowly
    // and a full push walks full speed. D-pad falls back to 1.0 magnitude.
    let moveX = lx;
    let moveZ = ly;
    if (pressed[14]) moveX = Math.min(moveX, -1);
    if (pressed[15]) moveX = Math.max(moveX, 1);
    if (pressed[12]) moveZ = Math.min(moveZ, -1);
    if (pressed[13]) moveZ = Math.max(moveZ, 1);
    const mag = Math.hypot(moveX, moveZ);
    if (mag > 1) {
      moveX /= mag;
      moveZ /= mag;
    }
    if (mag > 0) {
      const curved = Math.pow(Math.min(1, mag), MOVE_RESPONSE_EXPO);
      const scale = curved / Math.max(mag, 0.0001);
      controller.analogMove = { x: moveX * scale, z: moveZ * scale };
    } else {
      controller.analogMove = null;
    }

    const rtValue = buttons[7]?.value ?? 0;
    const ltValue = buttons[6]?.value ?? 0;
    keys[kb.sprint] = rtValue > TRIGGER_DEADZONE || pressed[7];
    keys[kb.crouch] = ltValue > TRIGGER_DEADZONE || pressed[6];
    keys[kb.grab] = pressed[1];
    keys[kb.ropeGrab] = pressed[1];
    keys[kb.jump] = pressed[0];
    keys[kb.interact] = pressed[2];
    keys[kb.emote] = pressed[3];

    if (edge(4)) keys[kb.heroActivate] = true;

    // RB is the throw key. We piggyback on the same `drop` binding the
    // CharacterController watches so KeyG / RB share a single edge path; the
    // controller's _prevThrowDown latch turns the held bit into a one-shot.
    keys[kb.drop] = !!pressed[5];

    if (this.thirdPersonCamera) {
      const [rx, ry] = applyRadialDeadzone(axes[2] ?? 0, axes[3] ?? 0, STICK_DEADZONE);
      if (rx !== 0 || ry !== 0) {
        const cam = this.thirdPersonCamera;
        const expoX = Math.sign(rx) * Math.pow(Math.abs(rx), LOOK_EXPO);
        const expoY = Math.sign(ry) * Math.pow(Math.abs(ry), LOOK_EXPO);
        cam.yaw -= expoX * LOOK_SENSITIVITY_YAW * dt;
        cam.pitch -= expoY * LOOK_SENSITIVITY_PITCH * dt;
        cam.pitch = Math.max(cam.minPitch, Math.min(cam.maxPitch, cam.pitch));
      }
    }

    this._prevPressed = pressed;
  }

  dispose() {
    window.removeEventListener('gamepadconnected', this._onConnect);
    window.removeEventListener('gamepaddisconnected', this._onDisconnect);
  }
}

/**
 * Radial deadzone: treats the 2-axis stick as a circle. If the combined
 * magnitude is below `dz`, both axes are zero; otherwise axes are rescaled so
 * output magnitude goes 0..1 as input goes dz..1. This prevents drift where a
 * quick flick leaves one axis stuck just above a per-axis deadzone.
 */
function applyRadialDeadzone(x, y, dz) {
  const mag = Math.hypot(x, y);
  if (mag <= dz) return [0, 0];
  const scale = (mag - dz) / ((1 - dz) * mag);
  return [x * scale, y * scale];
}

export default GamepadManager;
