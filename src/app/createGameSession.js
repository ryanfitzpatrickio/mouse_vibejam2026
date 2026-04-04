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
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.02;
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
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
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
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  }
  await renderer.init();

  return { renderer, RenderPipeline, toonOutlinePass, MeshToonNodeMaterial };
}

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

  // --- Server reconciliation ---
  // Correction stored as a decaying offset so it doesn't fight CharacterController.
  const RECONCILE_SNAP_THRESHOLD = 3.0;
  const RECONCILE_IGNORE_THRESHOLD = 0.1;
  const CORRECTION_DECAY = 8; // how fast offset drains per second
  let lastReconciledSeq = -1;
  let correctionX = 0;
  let correctionY = 0;
  let correctionZ = 0;

  function reconcileWithServer() {
    if (net.serverSeq <= lastReconciledSeq) return;
    lastReconciledSeq = net.serverSeq;

    const serverState = net.serverState;
    if (!serverState) return;

    // Replay unacked inputs from server-confirmed state
    const replayState = createPlayerState(net.localId);
    replayState.position = { ...serverState.position };
    replayState.velocity = { ...serverState.velocity };
    replayState.grounded = serverState.grounded;
    replayState.stamina = serverState.stamina;
    replayState.rotation = serverState.rotation;
    replayState.sprinting = serverState.sprinting;
    replayState.crouching = serverState.crouching;
    replayState.sliding = serverState.sliding;
    replayState.slideTimer = serverState.slideTimer;
    replayState.slideCooldownTimer = serverState.slideCooldownTimer;
    replayState.slideDirX = serverState.slideDirX;
    replayState.slideDirZ = serverState.slideDirZ;
    replayState.canDoubleJump = serverState.canDoubleJump;
    replayState.hasDoubleJumped = serverState.hasDoubleJumped;

    const dt = 1 / 30;
    const colliders = room.getCollisionColliders();
    for (const input of net.pendingInputs) {
      simulateTick(replayState, input, dt, null, colliders);
    }

    // Compute error between where client thinks it is vs where server+replay says
    const targetX = replayState.position.x;
    const targetY = replayState.position.y + mouse.groundOffset;
    const targetZ = replayState.position.z;
    const errX = targetX - (mouse.position.x - correctionX);
    const errY = targetY - (mouse.position.y - correctionY);
    const errZ = targetZ - (mouse.position.z - correctionZ);
    const dist = Math.sqrt(errX * errX + errY * errY + errZ * errZ);

    if (dist < RECONCILE_IGNORE_THRESHOLD) return;

    if (dist > RECONCILE_SNAP_THRESHOLD) {
      // Teleport
      mouse.position.set(targetX, targetY, targetZ);
      controller.velocity.set(replayState.velocity.x, replayState.velocity.y, replayState.velocity.z);
      correctionX = 0;
      correctionY = 0;
      correctionZ = 0;
    } else {
      // Add error to correction offset — it will drain smoothly in update()
      correctionX += errX;
      correctionY += errY;
      correctionZ += errZ;
    }

    controller.stamina = replayState.stamina;
  }

  // Throttle input sends to ~30Hz to match server tick rate
  const PHYSICS_STEP = 1 / 30;
  const MAX_PHYSICS_STEPS = 4;
  let physicsAccum = 0;
  let jumpLatch = false; // latches jump until next send

  function update(timeMs = 0, deltaSeconds = 1 / 60) {
    physicsAccum += deltaSeconds;

    let steps = 0;
    while (physicsAccum >= PHYSICS_STEP && steps < MAX_PHYSICS_STEPS) {
      physicsAccum -= PHYSICS_STEP;
      steps += 1;

      // Local prediction — CharacterController owns movement feel
      controller.update(PHYSICS_STEP, 0);

      // Apply decaying correction offset (doesn't fight controller)
      const decay = Math.min(1, PHYSICS_STEP * CORRECTION_DECAY);
      const applyX = correctionX * decay;
      const applyY = correctionY * decay;
      const applyZ = correctionZ * decay;
      mouse.position.x += applyX;
      mouse.position.y += applyY;
      mouse.position.z += applyZ;
      correctionX -= applyX;
      correctionY -= applyY;
      correctionZ -= applyZ;

      if (net.connected) {
        // Latch one-shot inputs between sends
        if (controller.jumpRequested) {
          jumpLatch = true;
          controller.jumpRequested = false;
        }

        const inputDir = thirdPersonCamera.getCameraRelativeMovement({
          forward: !!controller.keys[controller.keyBindings.forward],
          backward: !!controller.keys[controller.keyBindings.backward],
          back: !!controller.keys[controller.keyBindings.backward],
          left: !!controller.keys[controller.keyBindings.left],
          right: !!controller.keys[controller.keyBindings.right],
        });

        net.sendInput({
          moveX: inputDir.x,
          moveZ: inputDir.z,
          sprint: !!controller.keys[controller.keyBindings.sprint],
          jump: jumpLatch,
          crouch: !!controller.keys[controller.keyBindings.crouch],
          rotation: mouse.rotation.y,
        });
        jumpLatch = false;

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
  };
}
