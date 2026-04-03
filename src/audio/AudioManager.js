import * as THREE from 'three/webgpu';

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

    if (volume <= 0) return; // Too far to hear

    // Spatial panning
    const direction = new THREE.Vector3().subVectors(position, cameraPosition);
    const angle = Math.atan2(direction.x, direction.z);
    const pan = Math.sin(angle); // -1 to 1

    const panNode = this.audioContext.createStereoPanner();
    panNode.pan.value = Math.min(1, Math.max(-1, pan));
    panNode.connect(this.sfxContext);

    // Play effect based on type
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

    // Apply volume based on distance
    sound.gain.value *= volume;
    sound.connect(panNode);

    this.spatialSounds.push({ sound, panNode, position, type });
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
   */
  update(cameraPosition) {
    // Update listener position for spatial audio
    this.listener.position.copy(cameraPosition);
  }

  /**
   * Cleanup
   */
  dispose() {
    this.stopMusic();
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
