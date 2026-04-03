import * as THREE from 'three/webgpu';
import { Room } from '../world/Room.js';

function createRenderer({ canvas, forceWebGL = false } = {}) {
  const renderer = new THREE.WebGPURenderer({
    antialias: true,
    canvas,
    forceWebGL,
  });

  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  return renderer;
}

export async function createKitchenRoomScene({ canvas, forceWebGL = false } = {}) {
  let renderer;

  try {
    renderer = createRenderer({ canvas, forceWebGL });
    await renderer.init();
  } catch (error) {
    if (forceWebGL) {
      throw error;
    }

    renderer = createRenderer({ canvas, forceWebGL: true });
    await renderer.init();
  }

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#87ceeb'); // Sky blue

  // Camera positioned to view the room from a good angle
  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
  camera.position.set(5, 2.5, 5);
  camera.lookAt(0, 1, 0);

  // Lighting
  const ambientLight = new THREE.AmbientLight('#ffffff', 0.6);
  const keyLight = new THREE.DirectionalLight('#fff3dd', 1.2);
  keyLight.position.set(3, 4, 3);
  const fillLight = new THREE.DirectionalLight('#6699ff', 0.5);
  fillLight.position.set(-2, 2, -3);

  scene.add(ambientLight, keyLight, fillLight);

  // Create the kitchen room
  const room = new Room({
    width: 8,
    depth: 8,
    height: 4,
    floorColor: '#d4a574',
    wallColor: '#e8dcc8',
    furnitureColor: '#8b6f47',
  });

  scene.add(room.getGroup());

  function resize(width, height, pixelRatio = window.devicePixelRatio || 1) {
    const safeWidth = Math.max(1, Math.floor(width));
    const safeHeight = Math.max(1, Math.floor(height));
    renderer.setPixelRatio(Math.min(2, pixelRatio));
    renderer.setSize(safeWidth, safeHeight, false);
    camera.aspect = safeWidth / safeHeight;
    camera.updateProjectionMatrix();
  }

  function render(timeMs = 0) {
    // Update loot animations
    room.updateLoot(timeMs);

    // Rotate camera slightly to show the room from different angles
    const t = timeMs * 0.0003;
    const radius = 6;
    camera.position.x = Math.cos(t) * radius;
    camera.position.z = Math.sin(t) * radius;
    camera.lookAt(0, 1, 0);

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
    resize,
    render,
    dispose,
  };
}
