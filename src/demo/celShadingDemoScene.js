import * as THREE from 'three/webgpu';

import {
  createKeyCelMaterial,
  createThreeBandGradientTexture,
  createToonFallbackMaterial,
} from '../materials/CelMaterial.js';
import { createOutlineMesh } from '../materials/OutlineMaterial.js';

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

export async function createCelShadingDemoScene({ canvas, forceWebGL = false } = {}) {
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
  scene.background = new THREE.Color('#cbe9ff');

  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
  camera.position.set(4.5, 3, 6);
  camera.lookAt(0, 0.75, 0);

  const ambientLight = new THREE.AmbientLight('#ffffff', 0.5);
  const keyLight = new THREE.DirectionalLight('#fff3dd', 1.25);
  keyLight.position.set(3, 4, 2);
  scene.add(ambientLight, keyLight);

  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(6, 48),
    new THREE.MeshStandardMaterial({ color: '#fdf2d4' }),
  );
  floor.rotation.x = -Math.PI * 0.5;
  floor.position.y = -0.75;
  scene.add(floor);

  const customCel = createKeyCelMaterial({
    baseColor: '#ffb089',
    toonBands: 3,
    rimPower: 3,
    rimStrength: 0.4,
  });

  const toonFallback = createToonFallbackMaterial({
    color: '#8ed0ff',
    gradientTexture: createThreeBandGradientTexture(),
  });

  const cube = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.4, 1.4), customCel);
  cube.position.set(-1.25, 0.1, 0);
  cube.name = 'CelDemoCube';

  const sphere = new THREE.Mesh(new THREE.SphereGeometry(0.9, 32, 24), toonFallback);
  sphere.position.set(1.35, 0.2, 0);
  sphere.name = 'CelDemoSphere';

  scene.add(cube, sphere);
  scene.add(createOutlineMesh(cube, { scale: 1.05, color: '#000000' }));
  scene.add(createOutlineMesh(sphere, { scale: 1.05, color: '#000000' }));

  function resize(width, height, pixelRatio = window.devicePixelRatio || 1) {
    const safeWidth = Math.max(1, Math.floor(width));
    const safeHeight = Math.max(1, Math.floor(height));
    renderer.setPixelRatio(Math.min(2, pixelRatio));
    renderer.setSize(safeWidth, safeHeight, false);
    camera.aspect = safeWidth / safeHeight;
    camera.updateProjectionMatrix();
  }

  function render(timeMs = 0) {
    const t = timeMs * 0.001;

    cube.rotation.y = t * 0.8;
    cube.rotation.x = Math.sin(t * 1.3) * 0.1;

    sphere.rotation.y = -t * 0.65;
    sphere.position.y = 0.2 + Math.sin(t * 1.7) * 0.08;

    renderer.render(scene, camera);
  }

  function dispose() {
    renderer.dispose();
  }

  return {
    renderer,
    scene,
    camera,
    meshes: { cube, sphere },
    resize,
    render,
    dispose,
  };
}
