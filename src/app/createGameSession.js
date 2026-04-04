import * as THREE from 'three';
import { Mouse } from '../entities/Mouse.js';
import { Room } from '../world/Room.js';
import { ThirdPersonCamera } from '../camera/ThirdPersonCamera.js';
import { CharacterController } from '../controllers/CharacterController.js';
import { HUD } from '../hud/HUD.js';

function applyOutlineParameters(root, { thickness = 0.003, color = '#0a0a0a' } = {}) {
  root.traverse((child) => {
    if (!child.isMesh || !child.material || child.userData?.skipOutline) return;
    child.material.userData.outlineParameters = {
      thickness,
      color: new THREE.Color(color).toArray(),
      alpha: 1,
      visible: true,
    };
  });
}

function createWebGLRenderer(canvas) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, canvas });
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  return renderer;
}

async function createWebGPURenderer(canvas) {
  const { WebGPURenderer, RenderPipeline, MeshToonNodeMaterial } = await import('three/webgpu');
  const { toonOutlinePass } = await import('three/tsl');

  const renderer = new WebGPURenderer({ antialias: true, canvas });
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  await renderer.init();

  return { renderer, RenderPipeline, toonOutlinePass, MeshToonNodeMaterial };
}

export async function createGameSession({ canvas, mode = 'webgl' } = {}) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#87ceeb');

  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100);

  const ambientLight = new THREE.AmbientLight('#ffffff', 0.7);
  const keyLight = new THREE.DirectionalLight('#fff3dd', 1.2);
  keyLight.position.set(3, 4, 3);
  const fillLight = new THREE.DirectionalLight('#6699ff', 0.4);
  fillLight.position.set(-2, 2, -3);
  scene.add(ambientLight, keyLight, fillLight);

  const mouse = new Mouse({
    furColor: '#f5a962',
    bellyColor: '#f8d4b0',
    rendererMode: mode,
  });
  scene.add(mouse);
  await mouse.ready;
  mouse.position.set(0, mouse.groundOffset, 0);
  mouse.setViewCamera(camera);

  let room;
  let renderer;
  let render;

  if (mode === 'webgpu') {
    const gpu = await createWebGPURenderer(canvas);
    renderer = gpu.renderer;
    const renderPipeline = new gpu.RenderPipeline(renderer);
    renderPipeline.outputNode = gpu.toonOutlinePass(scene, camera);

    room = new Room({
      width: 8,
      depth: 8,
      height: 4,
      scale: 4,
      rendererMode: 'webgpu',
      rendererToolkit: gpu,
    });
    scene.add(room.getGroup());
    await room.ready;
    mouse.setRendererMode('webgpu', gpu);
    render = () => renderPipeline.render();
  } else {
    renderer = createWebGLRenderer(canvas);
    const { OutlineEffect } = await import('three/addons/effects/OutlineEffect.js');
    const effect = new OutlineEffect(renderer);

    room = new Room({ width: 8, depth: 8, height: 4, scale: 4 });
    scene.add(room.getGroup());
    await room.ready;
    applyOutlineParameters(room.getGroup(), { thickness: 0.004, color: '#0a0a0a' });
    applyOutlineParameters(mouse.avatar ?? mouse, { thickness: 0.0035, color: '#0a0a0a' });
    render = () => effect.render(scene, camera);
  }

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

  function resize(width, height, pixelRatio = window.devicePixelRatio || 1) {
    const safeWidth = Math.max(1, Math.floor(width));
    const safeHeight = Math.max(1, Math.floor(height));
    renderer.setPixelRatio(Math.min(2, pixelRatio));
    renderer.setSize(safeWidth, safeHeight, false);
    camera.aspect = safeWidth / safeHeight;
    camera.updateProjectionMatrix();
  }

  function update(timeMs = 0, deltaSeconds = 1 / 60) {
    controller.update(deltaSeconds, 0);
    room.updateLoot(timeMs);
    hud.update({
      stamina: controller.staminaPercent,
      health: controller.healthPercent,
    });
    render();
    return {
      drawCalls: renderer.info?.render?.calls ?? 0,
    };
  }

  function dispose() {
    hud.dispose();
    renderer.dispose();
  }

  return {
    mode,
    renderer,
    scene,
    camera,
    room,
    mouse,
    thirdPersonCamera,
    controller,
    hud,
    resize,
    update,
    dispose,
  };
}
