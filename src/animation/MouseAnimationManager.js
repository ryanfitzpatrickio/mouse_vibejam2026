import * as THREE from 'three';

const STATE_TO_CLIP = Object.freeze({
  idle: 'Idle',
  run: 'Run',
  walk: 'Walk',
  jump: 'Jump',
  chew: 'Bite',
  carry: 'Idle Alert',
  death: 'Death',
});

/** Per-clip playback rate (1 = authored speed). Walk is sped up to match ~4 m/s in-world stride. */
const CLIP_TIME_SCALE = Object.freeze({
  Walk: 3.5,
});

export class MouseAnimationManager {
  constructor({ fadeDuration = 0.18 } = {}) {
    this.fadeDuration = fadeDuration;
    this.mixer = null;
    this.root = null;
    this.actions = new Map();
    this.currentAction = null;
    this.currentState = 'idle';
    this._emoteActive = false;
  }

  get emoteActive() {
    return this._emoteActive;
  }

  attach(root, clips = []) {
    this.root = root;
    this.mixer = new THREE.AnimationMixer(root);
    this.actions.clear();

    clips.forEach((clip) => {
      this.actions.set(clip.name, this.mixer.clipAction(clip));
    });

    this._play('Idle', true);
  }

  setState(state, { immediate = false } = {}) {
    this.currentState = state;
    const clipName = STATE_TO_CLIP[state] ?? 'Idle';
    this._play(clipName, immediate);
  }

  update(delta) {
    if (this.mixer) {
      this.mixer.update(delta);
    }
  }

  _play(clipName, immediate = false) {
    if (!this.mixer) return;

    const action = this.actions.get(clipName) ?? this.actions.get('Idle');
    if (!action || this.currentAction === action) return;

    const previous = this.currentAction;
    this.currentAction = action;

    const once = clipName === 'Jump' || clipName === 'Death';
    action.enabled = true;
    action.reset();
    action.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, once ? 1 : Infinity);
    action.clampWhenFinished = once;
    action.timeScale = CLIP_TIME_SCALE[clipName] ?? 1;
    action.play();

    if (previous && previous !== action) {
      if (immediate) {
        previous.stop();
      } else {
        previous.fadeOut(this.fadeDuration);
        action.crossFadeFrom(previous, this.fadeDuration, false);
      }
    }
  }

  playEmoteClip(clipName) {
    if (!this.mixer) return;
    const action = this.actions.get(clipName);
    if (!action) return;

    this._emoteActive = true;

    const previous = this.currentAction;
    this.currentAction = action;
    action.enabled = true;
    action.reset();
    action.setLoop(THREE.LoopOnce, 1);
    action.clampWhenFinished = true;
    action.play();

    if (previous && previous !== action) {
      previous.fadeOut(this.fadeDuration);
      action.crossFadeFrom(previous, this.fadeDuration, false);
    }
  }

  stopEmote() {
    if (!this._emoteActive) return;
    this._emoteActive = false;
    if (this.currentAction) {
      this.currentAction.fadeOut(this.fadeDuration);
    }
  }

  dispose() {
    if (this.mixer) {
      this.mixer.stopAllAction();
      if (this.root) this.mixer.uncacheRoot(this.root);
    }

    this.actions.clear();
    this.currentAction = null;
    this.root = null;
    this.mixer = null;
  }
}
