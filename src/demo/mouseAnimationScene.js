import * as THREE from 'three';
import { Mouse } from '../entities/Mouse.js';
import { Room } from '../world/Room.js';

function createRenderer({ canvas, forceWebGL = false } = {}) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, canvas });

  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  return renderer;
}

export async function createMouseAnimationScene({ canvas, forceWebGL = false } = {}) {
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
  // const keyLight = new THREE.DirectionalLight('#fff3dd', 1.2);
  // keyLight.position.set(3, 4, 3);
  const fillLight = new THREE.DirectionalLight('#6699ff', 0.4);
  fillLight.position.set(-2, 2, -3);

  scene.add(fillLight);

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

  // Animation state cycling
  let animationIndex = 0;
  const animationStates = ['idle', 'walk', 'run', 'chew', 'jump', 'carry', 'death'];
  let stateTimer = 0;
  const stateDuration = 3; // seconds per state

  function resize(width, height, pixelRatio = window.devicePixelRatio || 1) {
    const safeWidth = Math.max(1, Math.floor(width));
    const safeHeight = Math.max(1, Math.floor(height));
    renderer.setPixelRatio(Math.min(2, pixelRatio));
    renderer.setSize(safeWidth, safeHeight, false);
    camera.aspect = safeWidth / safeHeight;
    camera.updateProjectionMatrix();
  }

  function render(timeMs = 0) {
    const deltaTime = 0.016; // Assuming ~60fps

    // Cycle through animation states
    stateTimer += deltaTime;
    if (stateTimer >= stateDuration) {
      stateTimer = 0;
      animationIndex = (animationIndex + 1) % animationStates.length;
      mouse.setAnimationState(animationStates[animationIndex]);
    }

    // Update mouse
    mouse.update(deltaTime);

    // Update loot
    room.updateLoot(timeMs);

    // Rotating camera to view mouse
    const t = timeMs * 0.0003;
    const radius = 4;
    camera.position.x = Math.cos(t) * radius;
    camera.position.z = Math.sin(t) * radius;
    camera.lookAt(mouse.position);

    renderer.render(scene, camera);
  }

  function dispose() {
    room.dispose();
    renderer.dispose();
  }

  return {
    renderer,
    scene,
    camera,
    room,
    mouse,
    resize,
    render,
    dispose,
  };
}
