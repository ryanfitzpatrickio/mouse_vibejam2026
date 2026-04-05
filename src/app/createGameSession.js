import * as THREE from 'three';
import { Mouse } from '../entities/Mouse.js';
import { Room } from '../world/Room.js';
import { ThirdPersonCamera } from '../camera/ThirdPersonCamera.js';
import { CharacterController } from '../controllers/CharacterController.js';
import { HUD } from '../hud/HUD.js';
import { attachEdgeOutlines } from '../materials/index.js';
import { NetworkClient } from '../net/NetworkClient.js';
import { RemotePlayerManager } from '../net/RemotePlayerManager.js';
import { simulateTick, createPlayerState } from '../../shared/physics.js';

function createLightMarker(color) {
  return new THREE.Mesh(
    new THREE.SphereGeometry(0.18, 12, 12),
    new THREE.MeshBasicMaterial({
      color: new THREE.Color(color),
      transparent: true,
      opacity: 0.18,
    }),
  );
}

function applyAtmosphere(scene) {
  scene.background = new THREE.Color('#8e7a63');
  scene.fog = new THREE.Fog('#8d7964', 16, 68);
}

function addLighting(scene, room) {
  const scale = room.scaleFactor ?? 1;
  const roomWidth = room.width * scale;
  const roomDepth = room.depth * scale;
  const roomHeight = room.height * scale;

  const hemisphere = new THREE.HemisphereLight('#c4d6e8', '#4f3928', 1.25);
  scene.add(hemisphere);

  const sun = new THREE.DirectionalLight('#ffdcb3', 2.2);
  sun.position.set(roomWidth * 0.2, roomHeight * 1.35, roomDepth * 0.35);
  sun.castShadow = true;
  sun.shadow.mapSize.set(isMobile ? 1024 : 2048, isMobile ? 1024 : 2048);
  sun.shadow.bias = isMobile ? -0.001 : -0.0004;
  sun.shadow.normalBias = isMobile ? 0.04 : 0.02;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = roomHeight * 3.5;
  sun.shadow.camera.left = -roomWidth * 0.8;
  sun.shadow.camera.right = roomWidth * 0.8;
  sun.shadow.camera.top = roomDepth * 0.8;
  sun.shadow.camera.bottom = -roomDepth * 0.8;
  sun.target.position.set(0, roomHeight * 0.25, 0);
  scene.add(sun);
  scene.add(sun.target);

  const coolFill = new THREE.DirectionalLight('#88aee8', 0.7);
  coolFill.position.set(-roomWidth * 0.45, roomHeight * 0.95, -roomDepth * 0.35);
  scene.add(coolFill);

  const counterPractical = new THREE.PointLight('#ffc47a', 26, roomWidth * 0.75, 2);
  counterPractical.position.set(0, roomHeight - 2.1, -roomDepth * 0.33);
  counterPractical.add(createLightMarker('#ffc47a'));
  scene.add(counterPractical);

  const tablePractical = new THREE.PointLight('#ffe2b0', 18, roomWidth * 0.65, 2);
  tablePractical.position.set(-roomWidth * 0.22, roomHeight - 1.9, roomDepth * 0.14);
  tablePractical.add(createLightMarker('#ffe2b0'));
  scene.add(tablePractical);

  const fridgeBounce = new THREE.PointLight('#9dc2ff', 7, roomWidth * 0.4, 2);
  fridgeBounce.position.set(roomWidth * 0.36, roomHeight * 0.42, -roomDepth * 0.28);
  scene.add(fridgeBounce);
}

function createWebGLRenderer(canvas) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, canvas });
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;
  renderer.shadowMap.enabled = true;
  // PCFSoftShadowMap uses poisson disk sampling with texture comparison
  // functions that produce artifacts on some mobile Mali GPUs (e.g. G715).
  // PCFShadowMap is more compatible across mobile GPU generations.
  renderer.shadowMap.type = isMobile ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;
  return renderer;
}

async function createWebGPURenderer(canvas) {
  const { WebGPURenderer, RenderPipeline, MeshToonNodeMaterial } = await import('three/webgpu');
  const { toonOutlinePass } = await import('three/tsl');

  const renderer = new WebGPURenderer({ antialias: true, canvas });
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;
  if ('shadowMap' in renderer && renderer.shadowMap) {
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = isMobile ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;
  }
  await renderer.init();

  return { renderer, RenderPipeline, toonOutlinePass, MeshToonNodeMaterial };
}

const isMobile = typeof window !== 'undefined'
  && (window.matchMedia?.('(pointer: coarse)')?.matches || navigator.maxTouchPoints > 0);

export async function createGameSession({ canvas, mode = 'webgl', roomId = 'default' } = {}) {
  const scene = new THREE.Scene();
  applyAtmosphere(scene);

  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100);

  const mouse = new Mouse({
    furColor: '#f5a962',
    bellyColor: '#f8d4b0',
    rendererMode: mode,
  });
  scene.add(mouse);
  await mouse.ready;
  mouse.position.set(0, mouse.groundOffset, 0);
  mouse.setViewCamera(camera);
  attachEdgeOutlines(mouse, { color: '#090909', thresholdAngle: 24, opacity: 0.95 });

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
    addLighting(scene, room);
    attachEdgeOutlines(room.getGroup(), { color: '#090909', thresholdAngle: 22, opacity: 0.9 });
    mouse.setRendererMode('webgpu', gpu);
    render = () => renderPipeline.render();
  } else {
    renderer = createWebGLRenderer(canvas);
    room = new Room({ width: 8, depth: 8, height: 4, scale: 4 });
    scene.add(room.getGroup());
    await room.ready;
    addLighting(scene, room);
    attachEdgeOutlines(room.getGroup(), { color: '#090909', thresholdAngle: 22, opacity: 0.9 });
    render = () => renderer.render(scene, camera);
  }

  const thirdPersonCamera = new ThirdPersonCamera({
    camera,
    domElement: canvas,
    armLength: 3.5,
    collisionQuery: () => room.getCollisionColliders(),
  });

  const controller = new CharacterController({
    mouse,
    thirdPersonCamera,
    collisionQuery: () => room.getCollisionColliders(),
  });

  const hud = new HUD();

  // --- Multiplayer ---
  const net = new NetworkClient(roomId);
  const remotePlayerManager = new RemotePlayerManager({ scene, rendererMode: mode });
  net.connect();

  function resize(width, height, pixelRatio = window.devicePixelRatio || 1) {
    const safeWidth = Math.max(1, Math.floor(width));
    const safeHeight = Math.max(1, Math.floor(height));
    renderer.setPixelRatio(Math.min(2, pixelRatio));
    renderer.setSize(safeWidth, safeHeight, false);
    camera.aspect = safeWidth / safeHeight;
    camera.updateProjectionMatrix();
  }

  // --- Client-side prediction using shared physics ---
  // Uses simulateTick (same code as server) so prediction matches server exactly,
  // eliminating rubberbanding from divergent physics.
  const CLIENT_BOUNDS = Object.freeze({ minX: -16, maxX: 16, minZ: -16, maxZ: 16 });
  const predictionState = createPlayerState('local');
  let lastReconciledSeq = -2;

  function copyServerToPrediction(ss) {
    predictionState.position.x = ss.position.x;
    predictionState.position.y = ss.position.y;
    predictionState.position.z = ss.position.z;
    predictionState.velocity.x = ss.velocity.x;
    predictionState.velocity.y = ss.velocity.y;
    predictionState.velocity.z = ss.velocity.z;
    predictionState.rotation = ss.rotation;
    predictionState.grounded = ss.grounded;
    predictionState.stamina = ss.stamina;
    predictionState.staminaRegenTimer = ss.staminaRegenTimer;
    predictionState.health = ss.health;
    predictionState.alive = ss.alive;
    predictionState.sprinting = ss.sprinting;
    predictionState.crouching = ss.crouching;
    predictionState.sliding = ss.sliding;
    predictionState.slideTimer = ss.slideTimer;
    predictionState.slideCooldownTimer = ss.slideCooldownTimer;
    predictionState.slideDirX = ss.slideDirX;
    predictionState.slideDirZ = ss.slideDirZ;
    predictionState.canDoubleJump = ss.canDoubleJump;
    predictionState.hasDoubleJumped = ss.hasDoubleJumped;
  }

  function reconcileWithServer() {
    if (net.serverSeq <= lastReconciledSeq) return;
    lastReconciledSeq = net.serverSeq;

    const ss = net.serverState;
    if (!ss) return;

    copyServerToPrediction(ss);

    const dt = 1 / 30;
    const colliders = room.getCollisionColliders();
    for (const input of net.pendingInputs) {
      simulateTick(predictionState, input, dt, CLIENT_BOUNDS, colliders);
    }
  }

  net.on((data) => {
    if (data.type === 'init' && data.players?.[net.localId]) {
      copyServerToPrediction(data.players[net.localId]);
      lastReconciledSeq = -2;
    }
  });

  const PHYSICS_STEP = 1 / 30;
  const MAX_PHYSICS_STEPS = 4;
  let physicsAccum = 0;
  let jumpLatch = false;
  let mobileControls = null;

  function setMobileControls(mc) {
    mobileControls = mc;
  }

  function update(timeMs = 0, deltaSeconds = 1 / 60) {
    physicsAccum += deltaSeconds;

    let steps = 0;
    while (physicsAccum >= PHYSICS_STEP && steps < MAX_PHYSICS_STEPS) {
      physicsAccum -= PHYSICS_STEP;
      steps += 1;

      const keys = controller.keys;
      const kb = controller.keyBindings;

      const jumpPressed = !!keys[kb.jump];
      keys[kb.jump] = false;
      if (jumpPressed) jumpLatch = true;

      let inputDir;
      const mc = mobileControls;
      if (mc && (mc.moveX !== 0 || mc.moveZ !== 0)) {
        const forward = new THREE.Vector3(Math.sin(thirdPersonCamera.yaw), 0, Math.cos(thirdPersonCamera.yaw));
        const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize().negate();
        inputDir = new THREE.Vector3()
          .addScaledVector(forward, mc.moveZ)
          .addScaledVector(right, mc.moveX);
        if (inputDir.lengthSq() > 0.0001) inputDir.normalize();
      } else {
        inputDir = thirdPersonCamera.getCameraRelativeMovement({
          forward: !!keys[kb.forward],
          backward: !!keys[kb.backward],
          back: !!keys[kb.backward],
          left: !!keys[kb.left],
          right: !!keys[kb.right],
        });
      }

      if (inputDir.lengthSq() > 0.01) {
        const targetAngle = Math.atan2(inputDir.x, inputDir.z);
        let diff = targetAngle - mouse.rotation.y;
        if (diff > Math.PI) diff -= Math.PI * 2;
        if (diff < -Math.PI) diff += Math.PI * 2;
        mouse.rotation.y += diff * Math.min(1, PHYSICS_STEP * 12);
      }

      const input = {
        moveX: inputDir.x,
        moveZ: inputDir.z,
        sprint: !!keys[kb.sprint],
        jump: jumpLatch,
        crouch: !!keys[kb.crouch],
        rotation: mouse.rotation.y,
      };
      jumpLatch = false;

      const colliders = room.getCollisionColliders();
      simulateTick(predictionState, input, PHYSICS_STEP, CLIENT_BOUNDS, colliders);

      mouse.position.x = predictionState.position.x;
      mouse.position.y = predictionState.position.y + mouse.groundOffset;
      mouse.position.z = predictionState.position.z;

      controller.velocity.set(
        predictionState.velocity.x,
        predictionState.velocity.y,
        predictionState.velocity.z,
      );
      controller.grounded = predictionState.grounded;
      controller.sprinting = predictionState.sprinting;
      controller.crouching = predictionState.crouching;
      controller.sliding = predictionState.sliding;
      controller.stamina = predictionState.stamina;
      controller.health = predictionState.health;
      controller.alive = predictionState.alive;

      controller._updateAnimation(PHYSICS_STEP);
      controller._updateCamera(PHYSICS_STEP);
      controller._handleAbilities();

      if (net.connected) {
        net.sendInput(input);
        reconcileWithServer();
      }
    }

    if (steps >= MAX_PHYSICS_STEPS) {
      physicsAccum = 0;
    }

    room.updateLoot(timeMs);

    if (net.connected) {
      remotePlayerManager.sync(net.remotePlayers);
      remotePlayerManager.update(deltaSeconds);
    }

    hud.update({
      stamina: controller.staminaPercent,
      health: controller.healthPercent,
      ping: net.ping,
    });
    render();
    return {
      drawCalls: renderer.info?.render?.calls ?? 0,
    };
  }

  function dispose() {
    net.disconnect();
    remotePlayerManager.dispose();
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
    net,
    resize,
    update,
    dispose,
    setMobileControls,
  };
}
