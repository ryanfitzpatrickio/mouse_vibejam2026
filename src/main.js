import * as THREE from 'three/webgpu';
import { Mouse } from './entities/Mouse.js';
import { Room } from './world/Room.js';
import { ThirdPersonCamera } from './camera/ThirdPersonCamera.js';
import { CharacterController } from './controllers/CharacterController.js';
import { HUD } from './hud/HUD.js';

const canvas = document.getElementById('canvas');

let renderer;
try {
  renderer = new THREE.WebGPURenderer({ antialias: true, canvas });
  await renderer.init();
} catch {
  renderer = new THREE.WebGPURenderer({ antialias: true, canvas, forceWebGL: true });
  await renderer.init();
}

renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;

const scene = new THREE.Scene();
scene.background = new THREE.Color('#87ceeb');

const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100);

const ambientLight = new THREE.AmbientLight('#ffffff', 0.7);
const keyLight = new THREE.DirectionalLight('#fff3dd', 1.2);
keyLight.position.set(3, 4, 3);
const fillLight = new THREE.DirectionalLight('#6699ff', 0.4);
fillLight.position.set(-2, 2, -3);
scene.add(ambientLight, keyLight, fillLight);

const room = new Room({ width: 8, depth: 8, height: 4, scale: 4 });
scene.add(room.getGroup());

const mouse = new Mouse({ furColor: '#f5a962', bellyColor: '#f8d4b0' });
scene.add(mouse);
await mouse.ready;
mouse.position.set(0, mouse.groundOffset, 0);

const thirdPersonCamera = new ThirdPersonCamera({
  camera,
  domElement: canvas,
  armLength: 3.5,
});

const controller = new CharacterController({
  mouse,
  thirdPersonCamera,
  collisionQuery: () => room.getCollisionColliders(),
});

const hud = new HUD();

canvas.addEventListener('click', () => {
  thirdPersonCamera.requestPointerLock();
});

function resize() {
  const w = Math.max(1, Math.floor(window.innerWidth));
  const h = Math.max(1, Math.floor(window.innerHeight));
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}

resize();
window.addEventListener('resize', resize);

let lastTime = 0;

function animate(timeMs) {
  const dt = lastTime ? (timeMs - lastTime) * 0.001 : 1 / 60;
  lastTime = timeMs;

  controller.update(dt, 0);
  room.updateLoot(timeMs);
  hud.update({
    stamina: controller.staminaPercent,
    health: controller.healthPercent,
  });

  renderer.render(scene, camera);
}

renderer.setAnimationLoop(animate);
