import * as THREE from 'three';
import { Mouse } from '../entities/Mouse.js';
import { Bunny } from '../entities/Bunny.js';
import { Cat } from '../entities/Cat.js';
import { PredatorManager } from '../entities/PredatorManager.js';
import { Room } from '../world/Room.js';
import { ThirdPersonCamera } from '../camera/ThirdPersonCamera.js';
import { CharacterController } from '../controllers/CharacterController.js';
import { HUD } from '../hud/HUD.js';
import { attachEdgeOutlines } from '../materials/index.js';
import { NetworkClient } from '../net/NetworkClient.js';
import { RemotePlayerManager } from '../net/RemotePlayerManager.js';
import { EmoteManager } from '../emote/EmoteManager.js';
import { EmoteWheel } from '../emote/EmoteWheel.js';
import { getAudioManager } from '../audio/AudioManager.js';
import { OcclusionFader } from '../utils/OcclusionFader.js';
import { simulateTick, createPlayerState } from '../../shared/physics.js';
import kitchenNavMesh from '../../shared/kitchen-navmesh.generated.js';

function applyAtmosphere(scene) {
  scene.background = new THREE.Color('#8e7a63');
  scene.fog = new THREE.Fog('#8d7964', 16, 68);
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
const ENABLE_BUNNY_PREDATOR = false;
const ENABLE_CAT_PREDATOR = true;

function buildNavMeshOverlay(navMesh) {
  const group = new THREE.Group();
  group.name = 'navmesh-overlay';

  const fillPositions = [];
  const linePositions = [];

  for (const tile of Object.values(navMesh?.tiles ?? {})) {
    const vertices = tile?.vertices;
    const polys = tile?.polys;
    if (!Array.isArray(vertices) || !Array.isArray(polys)) continue;

    for (const poly of polys) {
      const indices = Array.isArray(poly?.vertices)
        ? poly.vertices.filter((index) => Number.isInteger(index) && index >= 0)
        : [];
      if (indices.length < 3) continue;

      const points = indices.map((index) => {
        const base = index * 3;
        return {
          x: vertices[base],
          y: (vertices[base + 1] ?? 0) + 0.03,
          z: vertices[base + 2],
        };
      });

      for (let i = 1; i < points.length - 1; i += 1) {
        const a = points[0];
        const b = points[i];
        const c = points[i + 1];
        fillPositions.push(
          a.x, a.y, a.z,
          b.x, b.y, b.z,
          c.x, c.y, c.z,
        );
      }

      for (let i = 0; i < points.length; i += 1) {
        const current = points[i];
        const next = points[(i + 1) % points.length];
        linePositions.push(
          current.x, current.y + 0.005, current.z,
          next.x, next.y + 0.005, next.z,
        );
      }
    }
  }

  if (fillPositions.length) {
    const fillGeometry = new THREE.BufferGeometry();
    fillGeometry.setAttribute('position', new THREE.Float32BufferAttribute(fillPositions, 3));
    const fillMaterial = new THREE.MeshBasicMaterial({
      color: '#6de2b5',
      transparent: true,
      opacity: 0.22,
      side: THREE.DoubleSide,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });
    const fillMesh = new THREE.Mesh(fillGeometry, fillMaterial);
    fillMesh.renderOrder = 50;
    group.add(fillMesh);
  }

  if (linePositions.length) {
    const lineGeometry = new THREE.BufferGeometry();
    lineGeometry.setAttribute('position', new THREE.Float32BufferAttribute(linePositions, 3));
    const lineMaterial = new THREE.LineBasicMaterial({
      color: '#b7fff0',
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
    });
    const lineSegments = new THREE.LineSegments(lineGeometry, lineMaterial);
    lineSegments.renderOrder = 51;
    group.add(lineSegments);
  }

  group.visible = false;
  return group;
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

  let room;
  let renderer;
  let render;
  const navMeshOverlay = buildNavMeshOverlay(kitchenNavMesh);
  scene.add(navMeshOverlay);

  if (mode === 'webgpu') {
    const gpu = await createWebGPURenderer(canvas);
    renderer = gpu.renderer;
    const renderPipeline = new gpu.RenderPipeline(renderer);
    renderPipeline.outputNode = gpu.toonOutlinePass(scene, camera);

    room = new Room({
      width: 48,
      depth: 48,
      height: 4,
      scale: 1,
      rendererMode: 'webgpu',
      rendererToolkit: gpu,
    });
    scene.add(room.getGroup());
    await Promise.all([mouse.ready, room.ready]);
    mouse.position.set(0, mouse.groundOffset, 0);
    mouse.setViewCamera(camera);
    attachEdgeOutlines(mouse, { color: '#090909', thresholdAngle: 24, opacity: 0.95, batch: false });
    attachEdgeOutlines(room.getGroup(), { color: '#090909', thresholdAngle: 22, opacity: 0.9 });
    mouse.setRendererMode('webgpu', gpu);
    render = () => renderPipeline.render();
  } else {
    renderer = createWebGLRenderer(canvas);
    room = new Room({ width: 48, depth: 48, height: 4, scale: 1 });
    scene.add(room.getGroup());
    await Promise.all([mouse.ready, room.ready]);
    mouse.position.set(0, mouse.groundOffset, 0);
    mouse.setViewCamera(camera);
    attachEdgeOutlines(mouse, { color: '#090909', thresholdAngle: 24, opacity: 0.95, batch: false });
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

  controller.onEmote = () => {
    emoteWheel.show();
  };
  controller.onEmoteEnd = () => {
    emoteWheel.confirm();
  };

  // --- Predators ---
  const bunny = ENABLE_BUNNY_PREDATOR ? new Bunny() : null;
  const predatorManager = ENABLE_BUNNY_PREDATOR
    ? new PredatorManager({
      scene,
      controller,
      collisionQuery: () => room.getCollisionColliders(),
    })
    : null;

  if (bunny && predatorManager) {
    await bunny.ready;
    predatorManager.add(bunny, new THREE.Vector3(5, 0, 5));
  }

  const cat = ENABLE_CAT_PREDATOR ? new Cat() : null;
  if (cat) {
    await cat.ready;
    scene.add(cat);
  }

  // --- Dev placement mode ---
  let placementMode = null;
  if (import.meta.env.DEV) {
    const { PlacementMode } = await import('../dev/PlacementMode.js');
    placementMode = new PlacementMode({ domElement: canvas });

    const placeables = [];
    if (cat?.eyeAnimator?.group) {
      placeables.push({ label: 'CatEyes', target: cat.eyeAnimator.group, owner: cat.eyeAnimator });
    }

    let placementIndex = -1;
    window.startPlacement = (target, opts) => {
      if (target) {
        placementMode.activate(target, opts);
      } else {
        placementIndex = (placementIndex + 1) % (placeables.length || 1);
        const p = placeables[placementIndex];
        if (p) {
          placementMode.activate(p.target, {
            label: p.label,
            onDone: (placement) => {
              if (p.owner?.setPlacement) {
                p.owner.setPlacement(placement);
              }
            },
          });
        }
      }
    };

    if (cat) window.cat = cat;
    window.mouse = mouse;
  }

  const hud = new HUD();

  const audioManager = getAudioManager();
  const emoteManager = new EmoteManager({ mouse, audioManager });
  const emoteWheel = new EmoteWheel({
    onSelect: (emoteId) => {
      emoteManager.play(emoteId);
    },
  });

  const occlusionFader = new OcclusionFader({
    scene,
    camera,
    getPlayer: () => mouse,
  });

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
  const CLIENT_BOUNDS = Object.freeze({ minX: -24, maxX: 24, minZ: -24, maxZ: 24 });
  const predictionState = createPlayerState('local');
  let lastReconciledSeq = -2;

  // Visual smoothing: render position lerps toward prediction to hide small corrections
  const renderPos = new THREE.Vector3();
  let renderPosInitialized = false;
  const RECONCILE_SNAP_THRESHOLD = 3.0; // teleport if error > this
  const RECONCILE_SKIP_THRESHOLD = 0.001; // ignore corrections smaller than this
  const RECONCILE_SMOOTH_RATE = 20; // lerp speed for corrections

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
    predictionState.wallHolding = !!ss.wallHolding;
    predictionState.wallNormalX = ss.wallNormalX ?? 0;
    predictionState.wallNormalZ = ss.wallNormalZ ?? 0;
    predictionState.wallJumpWindowTimer = ss.wallJumpWindowTimer ?? 0;
    predictionState.wallAttachCooldownTimer = ss.wallAttachCooldownTimer ?? 0;
    predictionState.deathTime = ss.deathTime ?? 0;
  }

  function reconcileWithServer() {
    if (net.serverSeq <= lastReconciledSeq) return;
    lastReconciledSeq = net.serverSeq;

    const ss = net.serverState;
    if (!ss) return;

    // Save pre-reconciliation predicted position
    const prevX = predictionState.position.x;
    const prevY = predictionState.position.y;
    const prevZ = predictionState.position.z;

    copyServerToPrediction(ss);

    const dt = 1 / 30;
    const colliders = room.getCollisionColliders();
    for (const input of net.pendingInputs) {
      simulateTick(predictionState, input, dt, CLIENT_BOUNDS, colliders);
    }

    // Measure correction magnitude
    const dx = predictionState.position.x - prevX;
    const dy = predictionState.position.y - prevY;
    const dz = predictionState.position.z - prevZ;
    const errorSq = dx * dx + dy * dy + dz * dz;

    if (errorSq < RECONCILE_SKIP_THRESHOLD * RECONCILE_SKIP_THRESHOLD) {
      // Correction is negligible — revert to pre-reconciliation to avoid micro-jitter
      predictionState.position.x = prevX;
      predictionState.position.y = prevY;
      predictionState.position.z = prevZ;
    }
  }

  net.on((data) => {
    if (data.type === 'init' && data.players?.[net.localId]) {
      copyServerToPrediction(data.players[net.localId]);
      lastReconciledSeq = -2;
      // Snap render position to spawn
      renderPos.set(
        predictionState.position.x,
        predictionState.position.y + mouse.groundOffset,
        predictionState.position.z,
      );
      renderPosInitialized = true;
    }
  });

  const PHYSICS_STEP = 1 / 30;
  const MAX_PHYSICS_STEPS = 4;
  let physicsAccum = 0;
  let previousJumpHeld = false;
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

      const jumpHeld = !!keys[kb.jump];
      const jumpPressed = jumpHeld && !previousJumpHeld;
      previousJumpHeld = jumpHeld;

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
        jump: jumpPressed,
        jumpPressed,
        jumpHeld,
        crouch: !!keys[kb.crouch],
        rotation: mouse.rotation.y,
      };

      const colliders = room.getCollisionColliders();
      simulateTick(predictionState, input, PHYSICS_STEP, CLIENT_BOUNDS, colliders);

      // Update render position with smoothing to hide reconciliation corrections
      const targetX = predictionState.position.x;
      const targetY = predictionState.position.y + mouse.groundOffset;
      const targetZ = predictionState.position.z;

      if (!renderPosInitialized) {
        renderPos.set(targetX, targetY, targetZ);
        renderPosInitialized = true;
      } else {
        const errX = targetX - renderPos.x;
        const errY = targetY - renderPos.y;
        const errZ = targetZ - renderPos.z;
        const errSq = errX * errX + errY * errY + errZ * errZ;

        if (errSq > RECONCILE_SNAP_THRESHOLD * RECONCILE_SNAP_THRESHOLD) {
          // Large error (teleport/spawn) — snap immediately
          renderPos.set(targetX, targetY, targetZ);
        } else {
          // Smooth toward prediction target
          const t = 1 - Math.exp(-RECONCILE_SMOOTH_RATE * PHYSICS_STEP);
          renderPos.x += errX * t;
          renderPos.y += errY * t;
          renderPos.z += errZ * t;
        }
      }

      mouse.position.x = renderPos.x;
      mouse.position.y = renderPos.y;
      mouse.position.z = renderPos.z;

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
      emoteManager.update(PHYSICS_STEP);

      if (net.connected) {
        const inputWithEmote = { ...input };
        if (emoteManager.isPlaying && emoteManager.activeEmote) {
          inputWithEmote.emote = emoteManager.activeEmote.id;
        }
        net.sendInput(inputWithEmote);
        reconcileWithServer();
      }
    }

    if (steps >= MAX_PHYSICS_STEPS) {
      physicsAccum = 0;
    }

    predatorManager?.update(deltaSeconds);

    if (cat && net.connected) {
      const serverCat = net.remotePredators.get('cat-0');
      if (serverCat) cat.applyServerState(serverCat);
    }
    cat?.update(deltaSeconds);

    placementMode?.update(deltaSeconds);
    room.updateLoot(timeMs);

    if (net.connected) {
      remotePlayerManager.sync(net.remotePlayers);
      remotePlayerManager.update(deltaSeconds);
    }

    const isAlive = controller.alive;
    const deathTime = net.serverState?.deathTime ?? 0;
    const respawnCountdown = !isAlive && deathTime > 0
      ? Math.max(0, 10 - (Date.now() / 1000 - deathTime))
      : 0;

    hud.update({
      stamina: controller.staminaPercent,
      health: controller.healthPercent,
      ping: net.ping,
      alive: isAlive,
      respawnCountdown,
    });
    occlusionFader.update(deltaSeconds);
    render();
    return {
      drawCalls: renderer.info?.render?.calls ?? 0,
    };
  }

  function dispose() {
    navMeshOverlay.traverse((child) => {
      child.geometry?.dispose?.();
      if (Array.isArray(child.material)) {
        child.material.forEach((material) => material?.dispose?.());
      } else {
        child.material?.dispose?.();
      }
    });
    placementMode?.deactivate();
    net.disconnect();
    remotePlayerManager.dispose();
    predatorManager?.dispose();
    emoteWheel.dispose();
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
    bunny,
    cat,
    predatorManager,
    placementMode,
    thirdPersonCamera,
    controller,
    hud,
    net,
    emoteManager,
    emoteWheel,
    resize,
    update,
    dispose,
    setMobileControls,
    toggleNavMeshOverlay(forceVisible) {
      navMeshOverlay.visible = typeof forceVisible === 'boolean'
        ? forceVisible
        : !navMeshOverlay.visible;
      return navMeshOverlay.visible;
    },
  };
}
