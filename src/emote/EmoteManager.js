import { spawnEmoteBubble } from './EmoteBubble.js';

const EMOTE_DEFS = [
  { id: 'wave',     label: 'Wave',      emoji: '👋', eyeRow: 'surprised', sound: 'wave',     clip: 'Bite',       duration: 1.4 },
  { id: 'dance',    label: 'Dance',     emoji: '💃', eyeRow: 'idle',      sound: 'dance',    clip: 'Run',        duration: 2.4 },
  { id: 'laugh',    label: 'Laugh',     emoji: '😂', eyeRow: 'surprised', sound: 'laugh',    clip: 'Bite',       duration: 1.2 },
  { id: 'cry',      label: 'Cry',       emoji: '😭', eyeRow: 'shocked',   sound: 'cry',      clip: 'Walk',       duration: 2.0 },
  { id: 'angry',    label: 'Angry',     emoji: '😠', eyeRow: 'angry',     sound: 'angry',    clip: 'Bite',       duration: 1.0 },
  { id: 'love',     label: 'Love',      emoji: '😍', eyeRow: 'surprised', sound: 'love',     clip: 'Idle Alert', duration: 1.8 },
  { id: 'thumbsup', label: 'Thumbs Up', emoji: '👍', eyeRow: 'idle',      sound: 'thumbsup', clip: 'Idle Alert', duration: 1.2 },
  { id: 'scream',   label: 'Scream',    emoji: '😱', eyeRow: 'shocked',   sound: 'scream',   clip: 'Death',      duration: 1.4 },
];

export const EMOTES = Object.freeze(EMOTE_DEFS);
export const EMOTE_MAP = Object.freeze(Object.fromEntries(EMOTE_DEFS.map((e) => [e.id, e])));

export class EmoteManager {
  constructor({ mouse, audioManager, scene = null, getTargetObject = null, getBubbleOffsetY = null }) {
    this.mouse = mouse;
    this.audioManager = audioManager;
    this.scene = scene;
    this.getTargetObject = typeof getTargetObject === 'function' ? getTargetObject : null;
    this.getBubbleOffsetY = typeof getBubbleOffsetY === 'function' ? getBubbleOffsetY : null;
    this.activeEmote = null;
    this.emoteTimer = 0;
    this._bubble = null;
  }

  play(emoteId) {
    const def = EMOTE_MAP[emoteId];
    if (!def) return false;
    if (this.activeEmote) this.cancel();

    this.activeEmote = def;
    this.emoteTimer = def.duration;

    this.mouse?.animationManager?.playEmoteClip(def.clip);
    this.mouse?.eyeAnimator?.setExpressionOverride(def.eyeRow);

    const target = this.getTargetObject?.() ?? this.mouse;

    if (this.audioManager && target?.position) {
      this.audioManager.playEmote(def.sound, target.position);
    }

    if (this.scene && target && def.emoji) {
      this._bubble?.dispose();
      this._bubble = spawnEmoteBubble(this.scene, target, def.emoji, {
        offsetY: this.getBubbleOffsetY?.() ?? undefined,
      });
    }
    return true;
  }

  cancel() {
    if (!this.activeEmote) return;
    this.activeEmote = null;
    this.emoteTimer = 0;
    this.mouse?.animationManager?.stopEmote();
    this.mouse?.eyeAnimator?.clearExpressionOverride();
  }

  update(dt) {
    if (!this.activeEmote) return;
    this.emoteTimer -= dt;
    if (this.emoteTimer <= 0) {
      this.cancel();
    }
  }

  get isPlaying() {
    return this.activeEmote != null;
  }
}
