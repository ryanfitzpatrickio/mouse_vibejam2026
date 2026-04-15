import * as THREE from 'three';
import { Mouse } from '../entities/Mouse.js';
import { Room } from '../world/Room.js';
import { getAudioManager } from '../audio/AudioManager.js';

function createRenderer({ canvas, forceWebGL = false } = {}) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, canvas });

  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  return renderer;
}

export async function createAudioScene({ canvas, forceWebGL = false } = {}) {
  let renderer;

  try {
    renderer = createRenderer({ canvas, forceWebGL });
  } catch (error) {
    if (forceWebGL) {
      throw error;
    }

    renderer = createRenderer({ canvas, forceWebGL: true });
  }

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#87ceeb');

  // Camera
  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
  camera.position.set(4, 2.5, 5);
  camera.lookAt(0, 0.5, 0);

  // Lighting
  const ambientLight = new THREE.AmbientLight('#ffffff', 0.7);
  const keyLight = new THREE.DirectionalLight('#fff3dd', 1.2);
  keyLight.position.set(3, 4, 3);
  scene.add(ambientLight, keyLight);

  // Create room
  const room = new Room({
    height: 4,
    scale: 1,
  });
  scene.add(room.getGroup());
  await room.ready;

  // Create mouse
  const mouse = new Mouse({
    furColor: '#f5a962',
    bellyColor: '#f8d4b0',
  });
  scene.add(mouse);
  await mouse.ready;
  mouse.position.set(-1, mouse.groundOffset, 0);

  // Audio manager
  const audioManager = getAudioManager();
  audioManager.attachListenerToCamera(camera);
  await audioManager.resume();
  audioManager.startMusic();

  // HUD text for audio feedback
  const hudDiv = document.createElement('div');
  hudDiv.style.position = 'absolute';
  hudDiv.style.top = '20px';
  hudDiv.style.left = '20px';
  hudDiv.style.color = '#fff';
  hudDiv.style.fontFamily = 'monospace';
  hudDiv.style.fontSize = '14px';
  hudDiv.style.backgroundColor = 'rgba(0,0,0,0.7)';
  hudDiv.style.padding = '10px';
  hudDiv.style.borderRadius = '5px';
  hudDiv.style.zIndex = '100';
  hudDiv.style.maxWidth = '400px';
  document.body.appendChild(hudDiv);

  // Audio event cycle
  let eventTimer = 0;
  const eventDuration = 2.5;
  let currentEvent = 0;
  const audioEvents = [
    { name: 'Squeak', fn: () => audioManager.playSoundAtPosition('squeak', mouse.position) },
    { name: 'Footstep', fn: () => audioManager.playSoundAtPosition('footstep', mouse.position) },
    { name: 'Crash', fn: () => audioManager.playSoundAtPosition('crash', new THREE.Vector3(2, 1, 2)) },
    { name: 'Pickup', fn: () => audioManager.playSoundAtPosition('pickup', mouse.position) },
    { name: 'Tense Music', fn: () => audioManager.setMusicTense() },
    { name: 'Triumph', fn: () => audioManager.playTriumph() },
    { name: 'Reset', fn: () => audioManager.playAmbientMusic() },
  ];

  function resize(width, height, pixelRatio = window.devicePixelRatio || 1) {
    const safeWidth = Math.max(1, Math.floor(width));
    const safeHeight = Math.max(1, Math.floor(height));
    renderer.setPixelRatio(Math.min(2, pixelRatio));
    renderer.setSize(safeWidth, safeHeight, false);
    camera.aspect = safeWidth / safeHeight;
    camera.updateProjectionMatrix();
  }

  function render(timeMs = 0) {
    const deltaTime = 0.016;

    // Update audio
    audioManager.update(0.016);

    // Update mouse
    mouse.update(deltaTime);
    room.updateLoot(timeMs);

    // Cycle through audio events
    eventTimer += deltaTime;
    if (eventTimer >= eventDuration) {
      eventTimer = 0;
      const event = audioEvents[currentEvent];
      if (event) {
        event.fn();
        hudDiv.innerHTML = `<strong>Audio Demo</strong><br/>Playing: ${event.name}<br/>Master Vol: ${(audioManager.getMasterVolume() * 100).toFixed(0)}%`;
      }
      currentEvent = (currentEvent + 1) % audioEvents.length;
    }

    // Rotating camera
    const t = timeMs * 0.0003;
    const radius = 4;
    camera.position.x = Math.cos(t) * radius;
    camera.position.z = Math.sin(t) * radius;
    camera.lookAt(mouse.position);

    renderer.render(scene, camera);
  }

  function dispose() {
    room.dispose();
    audioManager.dispose();
    renderer.dispose();
    hudDiv.remove();
  }

  return {
    renderer,
    scene,
    camera,
    room,
    mouse,
    audioManager,
    resize,
    render,
    dispose,
  };
}
