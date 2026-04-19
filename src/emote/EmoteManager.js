import { spawnEmoteBubble } from './EmoteBubble.js';

const EMOTE_DEFS = [
  { id: 'wave',     label: 'Wave',      emoji: '👋', eyeOneShot: 'wink',          sound: 'wave',     clip: 'Bite',       duration: 1.4 },
  { id: 'dance',    label: 'Dance',     emoji: '💃', eyeOneShot: 'victorySquint', sound: 'dance',    clip: 'Run',        duration: 2.4 },
  { id: 'laugh',    label: 'Laugh',     emoji: '😂', eyeOneShot: 'happyClosed',   sound: 'laugh',    clip: 'Bite',       duration: 1.2 },
  { id: 'cry',      label: 'Cry',       emoji: '😭', eyeOneShot: 'crying',        sound: 'cry',      clip: 'Walk',       duration: 2.0 },
  { id: 'angry',    label: 'Angry',     emoji: '😠', eyeOneShot: 'furiousNarrow', sound: 'angry',    clip: 'Bite',       duration: 1.0 },
  { id: 'love',     label: 'Love',      emoji: '😍', eyeOneShot: 'sparklingHappy', sound: 'love',    clip: 'Idle Alert', duration: 1.8 },
  { id: 'thumbsup', label: 'Thumbs Up', emoji: '👍', eyeOneShot: 'brightWide',    sound: 'thumbsup', clip: 'Idle Alert', duration: 1.2 },
  { id: 'scream',   label: 'Scream',    emoji: '😱', eyeOneShot: 'tinyPanic',     sound: 'scream',   clip: 'Death',      duration: 1.4 },
];

export const HUMAN_ADVERSARY_RAT_EMOTE_ID = 'human-rat-meme';
export const HUMAN_ADVERSARY_RAT_EMOTE = Object.freeze({
  id: HUMAN_ADVERSARY_RAT_EMOTE_ID,
  label: 'Rat!',
  emoji: '🐭',
  duration: 30.0,
  humanOnly: true,
});
export const EMOTES = Object.freeze(EMOTE_DEFS);
export const HUMAN_ADVERSARY_EMOTES = Object.freeze([...EMOTE_DEFS, HUMAN_ADVERSARY_RAT_EMOTE]);
export const EMOTE_MAP = Object.freeze(Object.fromEntries(
  [...EMOTE_DEFS, HUMAN_ADVERSARY_RAT_EMOTE].map((e) => [e.id, e]),
));

export class EmoteManager {
  constructor({
    mouse,
    audioManager,
    scene = null,
    getTargetObject = null,
    getBubbleOffsetY = null,
    onSpecialEmote = null,
    onSpecialEmoteCancel = null,
    isHumanEmoter = null,
  }) {
    this.mouse = mouse;
    this.audioManager = audioManager;
    this.scene = scene;
    this.getTargetObject = typeof getTargetObject === 'function' ? getTargetObject : null;
    this.getBubbleOffsetY = typeof getBubbleOffsetY === 'function' ? getBubbleOffsetY : null;
    this.onSpecialEmote = typeof onSpecialEmote === 'function' ? onSpecialEmote : null;
    this.onSpecialEmoteCancel = typeof onSpecialEmoteCancel === 'function' ? onSpecialEmoteCancel : null;
    this.isHumanEmoter = typeof isHumanEmoter === 'function' ? isHumanEmoter : null;
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

    const target = this.getTargetObject?.() ?? this.mouse;

    if (def.id === HUMAN_ADVERSARY_RAT_EMOTE_ID) {
      this.onSpecialEmote?.(def);
    } else {
      this.mouse?.animationManager?.playEmoteClip(def.clip);
      this.mouse?.eyeAnimator?.setExpressionOverride(def.eyeOneShot ?? def.eyeRow, {
        duration: def.eyeOneShot ? def.duration : 0,
      });
    }

    if (def.id !== HUMAN_ADVERSARY_RAT_EMOTE_ID && this.audioManager && target?.position) {
      this.audioManager.playEmote(def.sound, target.position, {
        human: !!this.isHumanEmoter?.(),
      });
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
    const active = this.activeEmote;
    this.activeEmote = null;
    this.emoteTimer = 0;
    if (active.id === HUMAN_ADVERSARY_RAT_EMOTE_ID) {
      this.onSpecialEmoteCancel?.(active);
    }
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
