import * as THREE from 'three';

/**
 * Absolute URL for files in `public/`, safe with `base: './'` and non-root page paths.
 * (Plain `./assets/...` fetch strings resolve against the *current* path, not the app root.)
 */
function publicAssetFetchUrl(relativePath) {
  const encoded = String(relativePath)
    .replace(/^\/+/, '')
    .split('/')
    .map((seg) => encodeURIComponent(seg))
    .join('/');
  const base = import.meta.env.BASE_URL || '/';
  const root = new URL(base, window.location.href);
  return new URL(encoded, root).href;
}

/**
 * Candidate path stems under `public/` (no extension). Order matters.
 * Static hosts are case-sensitive — try lowercase first, then common variants.
 */
const AMBIENT_CALM_STEMS = [
  'assets/cartoon saturn',
  'assets/Cartoon Saturn',
  'assets/cartoonsaturn',
  'assets/CartoonSaturn',
];
const AMBIENT_CHASE_STEMS = [
  'assets/corn dog alarm',
  'assets/Corn Dog Alarm',
  'assets/corn-dog-alarm',
  'assets/Corn-Dog-Alarm',
  'assets/corndogalarm',
];
const AMBIENT_FORMATS = ['.m4a', '.mp3', '.ogg', '.wav'];
/** Crossfade responsiveness (higher = quicker transitions). */
const AMBIENT_CROSSFADE_RATE = 2.85;
const AMBIENT_TRACK_GAIN = 0.92;

function bufferLooksLikeMarkup(arrayBuffer) {
  const n = Math.min(96, arrayBuffer.byteLength);
  if (n < 1) return true;
  const head = new Uint8Array(arrayBuffer, 0, n);
  const text = new TextDecoder('utf-8', { fatal: false }).decode(head).trimStart();
  return text.startsWith('<!') || text.startsWith('<html') || text.startsWith('<?xml');
}

/**
 * Procedural audio synthesis functions
 */
const SoundSynth = {
  /**
   * Generate a short squeak sound
   */
  squeak(audioContext, duration = 0.1, pitch = 800) {
    const osc = audioContext.createOscillator();
    const gain = audioContext.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(pitch, audioContext.currentTime);
    osc.frequency.exponentialRampToValueAtTime(pitch * 0.7, audioContext.currentTime + duration);

    gain.gain.setValueAtTime(0.3, audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + duration);

    osc.connect(gain);
    gain.connect(audioContext.destination);

    osc.start(audioContext.currentTime);
    osc.stop(audioContext.currentTime + duration);

    return gain;
  },

  /**
   * Generate a footstep sound (brief noise burst)
   */
  footstep(audioContext, duration = 0.05) {
    const buffer = audioContext.createBuffer(1, audioContext.sampleRate * duration, audioContext.sampleRate);
    const data = buffer.getChannelData(0);

    // Brown noise (walking sound)
    let last = 0;
    for (let i = 0; i < buffer.length; i++) {
      const white = Math.random() * 2 - 1;
      data[i] = (last + white * 0.02) / 1.02;
      last = data[i];
    }

    const source = audioContext.createBufferSource();
    const gain = audioContext.createGain();

    source.buffer = buffer;
    gain.gain.setValueAtTime(0.2, audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + duration);

    source.connect(gain);
    gain.connect(audioContext.destination);

    source.start(audioContext.currentTime);
    source.stop(audioContext.currentTime + duration);

    return gain;
  },

  /**
   * Generate a beep/ping sound
   */
  beep(audioContext, frequency = 600, duration = 0.1) {
    const osc = audioContext.createOscillator();
    const gain = audioContext.createGain();

    osc.type = 'square';
    osc.frequency.setValueAtTime(frequency, audioContext.currentTime);

    gain.gain.setValueAtTime(0.2, audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + duration);

    osc.connect(gain);
    gain.connect(audioContext.destination);

    osc.start(audioContext.currentTime);
    osc.stop(audioContext.currentTime + duration);

    return gain;
  },

  /**
   * Generate a crash/impact sound
   */
  crash(audioContext, duration = 0.3) {
    const buffer = audioContext.createBuffer(1, audioContext.sampleRate * duration, audioContext.sampleRate);
    const data = buffer.getChannelData(0);

    // Noise burst with pitch change
    for (let i = 0; i < buffer.length; i++) {
      const t = i / buffer.length;
      const noise = Math.random() * 2 - 1;
      const envelope = Math.exp(-t * 5);
      data[i] = noise * envelope;
    }

    const source = audioContext.createBufferSource();
    const gain = audioContext.createGain();
    const filter = audioContext.createBiquadFilter();

    source.buffer = buffer;
    filter.type = 'highpass';
    filter.frequency.setValueAtTime(2000, audioContext.currentTime);
    filter.frequency.exponentialRampToValueAtTime(200, audioContext.currentTime + duration);

    gain.gain.setValueAtTime(0.3, audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + duration);

    source.connect(filter);
    filter.connect(gain);
    gain.connect(audioContext.destination);

    source.start(audioContext.currentTime);
    source.stop(audioContext.currentTime + duration);

    return gain;
  },

  /**
   * Generate death sound (pitch drop)
   */
  deathSound(audioContext, duration = 0.4) {
    const osc = audioContext.createOscillator();
    const gain = audioContext.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(400, audioContext.currentTime);
    osc.frequency.exponentialRampToValueAtTime(100, audioContext.currentTime + duration);

    gain.gain.setValueAtTime(0.2, audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + duration);

    osc.connect(gain);
    gain.connect(audioContext.destination);

    osc.start(audioContext.currentTime);
    osc.stop(audioContext.currentTime + duration);

    return gain;
  },

  /**
   * Generate a sparkle/pickup sound
   */
  sparkle(audioContext, duration = 0.15) {
    const now = audioContext.currentTime;
    const notes = [800, 1200, 1600];
    let maxGain = null;

    notes.forEach((freq, i) => {
      const osc = audioContext.createOscillator();
      const gain = audioContext.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now);
      osc.frequency.exponentialRampToValueAtTime(freq * 1.5, now + duration);

      const delay = (i * duration) / 3;
      gain.gain.setValueAtTime(0, now + delay);
      gain.gain.linearRampToValueAtTime(0.15, now + delay + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.01, now + duration);

      osc.connect(gain);
      gain.connect(audioContext.destination);

      osc.start(now + delay);
      osc.stop(now + duration);

      if (!maxGain) maxGain = gain;
    });

    return maxGain;
  },

  emoteWave(audioContext) {
    const now = audioContext.currentTime;
    const notes = [500, 700, 500, 700];
    let maxGain = null;
    notes.forEach((freq, i) => {
      const osc = audioContext.createOscillator();
      const gain = audioContext.createGain();
      osc.type = 'sine';
      const delay = i * 0.12;
      osc.frequency.setValueAtTime(freq, now + delay);
      gain.gain.setValueAtTime(0, now + delay);
      gain.gain.linearRampToValueAtTime(0.18, now + delay + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.01, now + delay + 0.1);
      osc.connect(gain);
      gain.connect(audioContext.destination);
      osc.start(now + delay);
      osc.stop(now + delay + 0.1);
      if (!maxGain) maxGain = gain;
    });
    return maxGain;
  },

  emoteDance(audioContext) {
    const now = audioContext.currentTime;
    const bass = [200, 250, 300, 250, 200];
    let maxGain = null;
    bass.forEach((freq, i) => {
      const osc = audioContext.createOscillator();
      const gain = audioContext.createGain();
      osc.type = 'triangle';
      const delay = i * 0.15;
      osc.frequency.setValueAtTime(freq, now + delay);
      gain.gain.setValueAtTime(0, now + delay);
      gain.gain.linearRampToValueAtTime(0.2, now + delay + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.01, now + delay + 0.12);
      osc.connect(gain);
      gain.connect(audioContext.destination);
      osc.start(now + delay);
      osc.stop(now + delay + 0.12);
      if (!maxGain) maxGain = gain;
    });
    return maxGain;
  },

  emoteLaugh(audioContext) {
    const now = audioContext.currentTime;
    for (let i = 0; i < 4; i++) {
      const osc = audioContext.createOscillator();
      const gain = audioContext.createGain();
      osc.type = 'sine';
      const delay = i * 0.1;
      const freq = 600 + (i % 2) * 200;
      osc.frequency.setValueAtTime(freq, now + delay);
      gain.gain.setValueAtTime(0, now + delay);
      gain.gain.linearRampToValueAtTime(0.15, now + delay + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.01, now + delay + 0.08);
      osc.connect(gain);
      gain.connect(audioContext.destination);
      osc.start(now + delay);
      osc.stop(now + delay + 0.08);
    }
    return null;
  },

  emoteCry(audioContext) {
    const now = audioContext.currentTime;
    const osc = audioContext.createOscillator();
    const gain = audioContext.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(500, now);
    osc.frequency.exponentialRampToValueAtTime(300, now + 0.6);
    osc.frequency.exponentialRampToValueAtTime(350, now + 1.0);
    gain.gain.setValueAtTime(0.15, now);
    gain.gain.linearRampToValueAtTime(0.2, now + 0.3);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.8);
    osc.connect(gain);
    gain.connect(audioContext.destination);
    osc.start(now);
    osc.stop(now + 0.8);
    return gain;
  },

  emoteAngry(audioContext) {
    const now = audioContext.currentTime;
    const osc = audioContext.createOscillator();
    const gain = audioContext.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(200, now);
    osc.frequency.exponentialRampToValueAtTime(350, now + 0.2);
    osc.frequency.exponentialRampToValueAtTime(180, now + 0.5);
    gain.gain.setValueAtTime(0.12, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.5);
    osc.connect(gain);
    gain.connect(audioContext.destination);
    osc.start(now);
    osc.stop(now + 0.5);
    return gain;
  },

  emoteLove(audioContext) {
    const now = audioContext.currentTime;
    [523, 659, 784].forEach((freq, i) => {
      const osc = audioContext.createOscillator();
      const gain = audioContext.createGain();
      osc.type = 'sine';
      const delay = i * 0.15;
      osc.frequency.setValueAtTime(freq, now + delay);
      osc.frequency.exponentialRampToValueAtTime(freq * 1.2, now + delay + 0.2);
      gain.gain.setValueAtTime(0, now + delay);
      gain.gain.linearRampToValueAtTime(0.18, now + delay + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.01, now + delay + 0.25);
      osc.connect(gain);
      gain.connect(audioContext.destination);
      osc.start(now + delay);
      osc.stop(now + delay + 0.25);
    });
    return null;
  },

  emoteThumbsup(audioContext) {
    const now = audioContext.currentTime;
    [400, 600, 800].forEach((freq, i) => {
      const osc = audioContext.createOscillator();
      const gain = audioContext.createGain();
      osc.type = 'sine';
      const delay = i * 0.08;
      osc.frequency.setValueAtTime(freq, now + delay);
      gain.gain.setValueAtTime(0, now + delay);
      gain.gain.linearRampToValueAtTime(0.15, now + delay + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.01, now + delay + 0.15);
      osc.connect(gain);
      gain.connect(audioContext.destination);
      osc.start(now + delay);
      osc.stop(now + delay + 0.15);
    });
    return null;
  },

  emoteScream(audioContext) {
    const now = audioContext.currentTime;
    const osc = audioContext.createOscillator();
    const gain = audioContext.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(300, now);
    osc.frequency.exponentialRampToValueAtTime(900, now + 0.15);
    osc.frequency.exponentialRampToValueAtTime(600, now + 0.4);
    gain.gain.setValueAtTime(0.2, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.5);
    osc.connect(gain);
    gain.connect(audioContext.destination);
    osc.start(now);
    osc.stop(now + 0.5);
    return gain;
  },
};

/**
 * AudioManager: handles spatial audio, effects, and dynamic music
 */
export class AudioManager {
  constructor() {
    if (AudioManager.instance) {
      return AudioManager.instance;
    }

    this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
    this.listener = new THREE.AudioListener();
    this.masterGain = this.audioContext.createGain();
    this.masterGain.connect(this.audioContext.destination);
    this.masterGain.gain.value = 0.5; // Default volume

    this.musicContext = this.audioContext.createGain();
    this.musicContext.connect(this.masterGain);
    this.musicContext.gain.value = 0.3;

    this.sfxContext = this.audioContext.createGain();
    this.sfxContext.connect(this.masterGain);
    this.sfxContext.gain.value = 0.4;

    // Music system
    this.musicOscillators = [];
    this.isPlayingMusic = false;
    this.musicState = 'ambient'; // ambient, tense, triumph
    this.musicTime = 0;

    /** Looped MP3 ambient bed (calm vs chase), crossfaded in `update`. */
    this._ambientDecodePromise = null;
    this._ambientBuffers = null;
    this._ambientCalmGain = null;
    this._ambientChaseGain = null;
    this._ambientCalmSource = null;
    this._ambientChaseSource = null;
    this._ambientBedActive = false;
    this._ambientBlend = 0; // 0 = calm only, 1 = chase only
    this._ambientChaseTarget = 0;
    this._ambientBedStarting = null;

    // Spatial sounds
    this.spatialSounds = [];

    AudioManager.instance = this;
  }

  /**
   * Resume audio context if needed
   */
  async resume() {
    if (this.audioContext.state === 'suspended') {
      await this.audioContext.resume();
    }
  }

  /**
   * Play sound effect at world position
   */
  playSoundAtPosition(type, position, cameraPosition) {
    const distance = position.distanceTo(cameraPosition);
    const maxDistance = 20;
    const volume = Math.max(0, 1 - distance / maxDistance);

    if (volume <= 0) return;

    const direction = new THREE.Vector3().subVectors(position, cameraPosition);
    const angle = Math.atan2(direction.x, direction.z);
    const pan = Math.sin(angle);

    const panNode = this.audioContext.createStereoPanner();
    panNode.pan.value = Math.min(1, Math.max(-1, pan));
    panNode.connect(this.sfxContext);

    let sound;
    switch (type) {
      case 'squeak':
        sound = SoundSynth.squeak(this.audioContext, 0.1, 600 + Math.random() * 200);
        break;
      case 'footstep':
        sound = SoundSynth.footstep(this.audioContext, 0.05);
        break;
      case 'crash':
        sound = SoundSynth.crash(this.audioContext, 0.3);
        break;
      case 'pickup':
        sound = SoundSynth.sparkle(this.audioContext, 0.15);
        break;
      case 'death':
        sound = SoundSynth.deathSound(this.audioContext, 0.4);
        break;
      case 'beep':
        sound = SoundSynth.beep(this.audioContext, 600, 0.1);
        break;
      default:
        sound = SoundSynth.beep(this.audioContext, 500, 0.08);
    }

    sound.gain.value *= volume;
    sound.connect(panNode);

    this.spatialSounds.push({ sound, panNode, position, type });
  }

  playEmote(soundName, position) {
    const camPos = this.listener.position;
    if (!camPos) return;

    const distance = position.distanceTo(camPos);
    const maxDistance = 20;
    const volume = Math.max(0, 1 - distance / maxDistance);
    if (volume <= 0) return;

    const direction = new THREE.Vector3().subVectors(position, camPos);
    const angle = Math.atan2(direction.x, direction.z);
    const panNode = this.audioContext.createStereoPanner();
    panNode.pan.value = Math.min(1, Math.max(-1, Math.sin(angle)));
    panNode.connect(this.sfxContext);

    const synthFn = {
      wave: 'emoteWave',
      dance: 'emoteDance',
      laugh: 'emoteLaugh',
      cry: 'emoteCry',
      angry: 'emoteAngry',
      love: 'emoteLove',
      thumbsup: 'emoteThumbsup',
      scream: 'emoteScream',
    }[soundName];

    const sound = synthFn ? SoundSynth[synthFn]?.(this.audioContext) : null;
    if (sound) {
      sound.gain.value *= volume;
      sound.connect(panNode);
    }
  }

  /**
   * Decode and start looping ambient tracks (calm + chase), crossfaded via {@link setAmbientChaseTarget}.
   * Safe to call multiple times; starts once.
   */
  async startAmbientBed() {
    if (this._ambientBedActive) return;
    if (this._ambientBedStarting) return this._ambientBedStarting;

    this._ambientBedStarting = (async () => {
      if (!this._ambientDecodePromise) {
        this._ambientDecodePromise = this._loadAmbientBufferPair();
      }

      let buffers;
      try {
        buffers = await this._ambientDecodePromise;
      } catch (e) {
        console.warn(
          '[audio] Ambient bed failed to load:',
          e?.message || e,
          '(add public/assets/cartoon saturn.{m4a|mp3} and corn dog alarm.{m4a|mp3}, or run npm run prebuild with masters in assets/source/audio/)',
        );
        this._ambientDecodePromise = null;
        return;
      }

      if (this._ambientBedActive) return;

      const calmGain = this.audioContext.createGain();
      const chaseGain = this.audioContext.createGain();
      calmGain.connect(this.musicContext);
      chaseGain.connect(this.musicContext);

      const calmSrc = this.audioContext.createBufferSource();
      const chaseSrc = this.audioContext.createBufferSource();
      calmSrc.buffer = buffers.calm;
      chaseSrc.buffer = buffers.chase;
      calmSrc.loop = true;
      chaseSrc.loop = true;
      calmSrc.connect(calmGain);
      chaseSrc.connect(chaseGain);

      const now = this.audioContext.currentTime;
      calmSrc.start(now);
      chaseSrc.start(now);
      await this.audioContext.resume();

      this._ambientBuffers = buffers;
      this._ambientCalmGain = calmGain;
      this._ambientChaseGain = chaseGain;
      this._ambientCalmSource = calmSrc;
      this._ambientChaseSource = chaseSrc;
      this._ambientBedActive = true;
      this._ambientBlend = this._ambientChaseTarget;
      this._applyAmbientGains();
      if (import.meta.env.DEV) {
        console.log('[audio] Ambient bed playing (Web Audio). Context:', this.audioContext.state);
      }
    })();

    try {
      await this._ambientBedStarting;
    } finally {
      this._ambientBedStarting = null;
    }
  }

  async _loadAmbientBufferPair() {
    const [calmBuf, chaseBuf] = await Promise.all([
      this._tryFetchDecodeAmbientStemList(AMBIENT_CALM_STEMS),
      this._tryFetchDecodeAmbientStemList(AMBIENT_CHASE_STEMS),
    ]);
    if (!calmBuf && !chaseBuf) {
      throw new Error(
        'No decodable ambient audio under public/assets/ (expected cartoon saturn / corn dog alarm, .m4a or .mp3)',
      );
    }
    let calm = calmBuf;
    let chase = chaseBuf;
    if (!calm) {
      console.warn('[audio] Missing calm bed (cartoon saturn); using chase track for both layers.');
      calm = chase;
    }
    if (!chase) {
      console.warn(
        '[audio] Missing chase bed (corn dog alarm); using calm track for both — add public/assets/corn dog alarm.{m4a|mp3} for the alarm crossfade.',
      );
      chase = calm;
    }
    return { calm, chase };
  }

  async _tryFetchDecodeAmbientStemList(stems) {
    for (const stem of stems) {
      const buf = await this._tryFetchDecodeAmbientStem(stem);
      if (buf) return buf;
    }
    return null;
  }

  /**
   * Try each extension; returns null if nothing decodes (missing file / HTML shell / bad codec).
   */
  async _tryFetchDecodeAmbientStem(stemRelative) {
    let lastError = null;
    for (const ext of AMBIENT_FORMATS) {
      const url = publicAssetFetchUrl(`${stemRelative}${ext}`);
      try {
        const res = await fetch(url);
        if (!res.ok) {
          lastError = new Error(`HTTP ${res.status} for ${url}`);
          continue;
        }
        const data = await res.arrayBuffer();
        if (data.byteLength < 256) {
          lastError = new Error(`Too small (${data.byteLength} B): ${url}`);
          continue;
        }
        if (bufferLooksLikeMarkup(data)) {
          lastError = new Error(`Not audio (HTML/text response): ${url}`);
          continue;
        }
        const copy = data.slice(0);
        return await this.audioContext.decodeAudioData(copy);
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
      }
    }
    return null;
  }

  /**
   * When true, crossfades toward the chase/alarm track (local player is the cat's hunt target).
   */
  setAmbientChaseTarget(active) {
    this._ambientChaseTarget = active ? 1 : 0;
  }

  _applyAmbientGains() {
    if (!this._ambientCalmGain || !this._ambientChaseGain) return;
    const w = this._ambientBlend;
    this._ambientCalmGain.gain.value = (1 - w) * AMBIENT_TRACK_GAIN;
    this._ambientChaseGain.gain.value = w * AMBIENT_TRACK_GAIN;
  }

  _tickAmbientCrossfade(deltaSeconds) {
    if (!this._ambientBedActive) return;
    const target = this._ambientChaseTarget;
    const t = 1 - Math.exp(-AMBIENT_CROSSFADE_RATE * deltaSeconds);
    this._ambientBlend += (target - this._ambientBlend) * t;
    if (Math.abs(this._ambientBlend - target) < 0.002) {
      this._ambientBlend = target;
    }
    this._applyAmbientGains();
  }

  /**
   * Stops decoded ambient loops (e.g. session teardown). Decoded buffers are kept for a possible restart.
   */
  stopAmbientBed() {
    for (const src of [this._ambientCalmSource, this._ambientChaseSource]) {
      if (!src) continue;
      try {
        src.stop();
      } catch {
        // already stopped
      }
    }
    this._ambientCalmSource = null;
    this._ambientChaseSource = null;
    this._ambientCalmGain?.disconnect();
    this._ambientChaseGain?.disconnect();
    this._ambientCalmGain = null;
    this._ambientChaseGain = null;
    this._ambientBedActive = false;
    this._ambientBlend = 0;
    this._ambientChaseTarget = 0;
  }

  /**
   * Start dynamic music playback
   */
  startMusic() {
    if (this.isPlayingMusic) return;

    this.isPlayingMusic = true;
    this.musicTime = 0;
    this.musicState = 'ambient';
    this.playAmbientMusic();
  }

  /**
   * Play ambient exploration music (calm, looping)
   */
  playAmbientMusic() {
    const now = this.audioContext.currentTime;
    const tempo = 0.5; // Slow, calm

    // Simple harmonic progression: C-Am-F-G
    const chords = [
      { freq: 130.81, duration: 2 }, // C3
      { freq: 110, duration: 2 }, // A2
      { freq: 174.61, duration: 2 }, // F3
      { freq: 196, duration: 2 }, // G3
    ];

    this.playMusicChords(chords, now);
  }

  /**
   * Increase music tension (faster tempo, higher pitch)
   */
  setMusicTense() {
    if (this.musicState === 'tense') return;

    this.musicState = 'tense';
    this.stopMusic();

    const now = this.audioContext.currentTime;
    const chords = [
      { freq: 164.81, duration: 0.8 }, // E3
      { freq: 110, duration: 0.8 }, // A2
      { freq: 196, duration: 0.8 }, // G3
      { freq: 220, duration: 0.8 }, // A3
    ];

    this.playMusicChords(chords, now);
  }

  /**
   * Play triumphant success stinger
   */
  playTriumph() {
    const now = this.audioContext.currentTime;
    this.stopMusic();
    this.musicState = 'triumph';

    // Triumphant chord
    const frequencies = [262, 330, 392, 523]; // C-E-G-C
    const duration = 0.8;

    frequencies.forEach((freq, i) => {
      const osc = this.audioContext.createOscillator();
      const gain = this.audioContext.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now);

      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.15, now + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.01, now + duration);

      osc.connect(gain);
      gain.connect(this.musicContext);

      const delay = i * 0.1;
      osc.start(now + delay);
      osc.stop(now + duration);

      this.musicOscillators.push(osc);
    });
  }

  /**
   * Play chord progression
   */
  playMusicChords(chords, startTime) {
    const now = this.audioContext.currentTime;
    let currentTime = startTime || now;

    const playChord = (frequencies, duration) => {
      frequencies.forEach((freq) => {
        const osc = this.audioContext.createOscillator();
        const gain = this.audioContext.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, currentTime);

        gain.gain.setValueAtTime(0.1, currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, currentTime + duration);

        osc.connect(gain);
        gain.connect(this.musicContext);

        osc.start(currentTime);
        osc.stop(currentTime + duration);

        this.musicOscillators.push(osc);
      });
    };

    // Simple chord (root + 3rd + 5th)
    chords.forEach((chord) => {
      const root = chord.freq;
      const frequencies = [root, root * 1.25, root * 1.5];
      playChord(frequencies, chord.duration);
      currentTime += chord.duration;
    });

    // Loop music if still in ambient
    if (this.musicState === 'ambient') {
      setTimeout(() => {
        if (this.isPlayingMusic && this.musicState === 'ambient') {
          this.playAmbientMusic();
        }
      }, (currentTime - now) * 1000);
    }
  }

  /**
   * Stop all music
   */
  stopMusic() {
    this.musicOscillators.forEach((osc) => {
      try {
        osc.stop(this.audioContext.currentTime);
      } catch (e) {
        // Oscillator already stopped
      }
    });
    this.musicOscillators = [];
  }

  /**
   * Set master volume
   */
  setMasterVolume(value) {
    this.masterGain.gain.setTargetAtTime(Math.min(1, Math.max(0, value)), this.audioContext.currentTime, 0.01);
  }

  /**
   * Set music volume
   */
  setMusicVolume(value) {
    this.musicContext.gain.setTargetAtTime(Math.min(1, Math.max(0, value)), this.audioContext.currentTime, 0.01);
  }

  /**
   * Set SFX volume
   */
  setSFXVolume(value) {
    this.sfxContext.gain.setTargetAtTime(Math.min(1, Math.max(0, value)), this.audioContext.currentTime, 0.01);
  }

  /**
   * Get master volume
   */
  getMasterVolume() {
    return this.masterGain.gain.value;
  }

  /**
   * Get listener for spatial audio integration with Three.js
   */
  getListener() {
    return this.listener;
  }

  /**
   * Update audio context state (called each frame)
   * @param {THREE.Vector3} cameraPosition
   * @param {number} [deltaSeconds]
   */
  update(cameraPosition, deltaSeconds) {
    // Update listener position for spatial audio
    this.listener.position.copy(cameraPosition);
    if (typeof deltaSeconds === 'number' && deltaSeconds > 0) {
      this._tickAmbientCrossfade(deltaSeconds);
    }
  }

  /**
   * Cleanup
   */
  dispose() {
    this.stopMusic();
    this.stopAmbientBed();
    this._ambientBuffers = null;
    this._ambientDecodePromise = null;
    this.audioContext.close();
  }
}

// Singleton pattern
let audioManagerInstance = null;

export function getAudioManager() {
  if (!audioManagerInstance) {
    audioManagerInstance = new AudioManager();
  }
  return audioManagerInstance;
}
