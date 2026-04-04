import * as THREE from 'three/webgpu';

const STATE_TO_CLIP = Object.freeze({
  idle: 'Idle',
  run: 'Run',
  walk: 'Walk',
  jump: 'Jump',
  chew: 'Bite',
  carry: 'Idle Alert',
  death: 'Death',
});

export class MouseAnimationManager {
  constructor({ fadeDuration = 0.18 } = {}) {
    this.fadeDuration = fadeDuration;
    this.mixer = null;
    this.root = null;
    this.actions = new Map();
    this.currentAction = null;
    this.currentState = 'idle';
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
