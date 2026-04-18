/**
 * Server-authoritative rigid-body ball + floor, pushed by player proxies.
 *
 * Note: The stock `ammo.js` npm build aborts in Node (Emscripten NO_DYNAMIC_EXECUTION).
 * Three’s Ammo WASM expects a separate fetch. We use cannon-es here so PartyKit/Node
 * get a real dynamic sphere without vendoring WASM; swap this module for Ammo later if needed.
 */

import { World, Vec3, Sphere, Box, Body } from 'cannon-es';
import { PHYSICS } from '../shared/physics.js';

const BALL_RADIUS = 0.38;
const BALL_MASS = 5;
const EXTRA_BALL_RADIUS_MIN = 0.16;
const EXTRA_BALL_RADIUS_MAX = 0.52;
/** Safety cap on concurrent extra balls (room-wide). */
const MAX_EXTRA_BALLS = 128;
/** Extra player-spawned balls are removed after this many ms. */
const EXTRA_BALL_TTL_MS = 60_000;
const DEFAULT_BALL_COLOR = '#e8945c';
const PLAYER_PROXY_RADIUS = 0.34;
/** Foot Y + this ≈ torso center for a rough push proxy */
const PLAYER_PROXY_CENTER_Y = PHYSICS.playerHeight * 0.45;

/** Cannon needs non-zero thickness; wall AABBs from layout can be paper-thin. */
const MIN_STATIC_HALF_EXTENT = 0.05;
/** Extra meat on wall boxes so a fast sphere is less likely to tunnel thin panels. */
const WALL_MIN_HALF_THICK = 0.18;
const FLOOR_SURFACE_GROUND_Y = 0;

/**
 * @param {{ type?: string, aabb?: { min: {x,y,z}, max: {x,y,z} }, metadata?: { runnable?: boolean } }} collider
 */
export function shouldSkipLayoutColliderForBall(collider) {
  if (!collider?.aabb?.min || !collider?.aabb?.max) return true;
  const box = collider.aabb;
  const dx = box.max.x - box.min.x;
  const dy = box.max.y - box.min.y;
  const dz = box.max.z - box.min.z;
  // Plane walls are flat: one AABB axis is ~0. Capsule code still uses them; we fatten in aabbToStaticBody.
  if (collider.type !== 'wall') {
    if (dx < 1e-5 || dy < 1e-5 || dz < 1e-5) return true;
  }
  if (collider.type === 'loot') return true;
  // Same idea as shared physics: skip floor planes so we don't double up with the ground slab
  if ((collider.type === 'surface' || collider.metadata?.runnable)
    && Math.abs(box.max.y - FLOOR_SURFACE_GROUND_Y) <= 0.05) {
    return true;
  }
  return false;
}

export function aabbToStaticBody(aabb, layoutType = 'furniture') {
  const dx = aabb.max.x - aabb.min.x;
  const dy = aabb.max.y - aabb.min.y;
  const dz = aabb.max.z - aabb.min.z;
  let hx = Math.max(dx * 0.5, MIN_STATIC_HALF_EXTENT);
  let hy = Math.max(dy * 0.5, MIN_STATIC_HALF_EXTENT);
  let hz = Math.max(dz * 0.5, MIN_STATIC_HALF_EXTENT);

  if (layoutType === 'wall') {
    const m = Math.min(hx, hy, hz);
    if (m < WALL_MIN_HALF_THICK) {
      if (hx <= hy && hx <= hz) hx = WALL_MIN_HALF_THICK;
      else if (hy <= hz) hy = WALL_MIN_HALF_THICK;
      else hz = WALL_MIN_HALF_THICK;
    }
  }

  const cx = (aabb.min.x + aabb.max.x) * 0.5;
  const cy = (aabb.min.y + aabb.max.y) * 0.5;
  const cz = (aabb.min.z + aabb.max.z) * 0.5;
  const body = new Body({ mass: 0 });
  body.addShape(new Box(new Vec3(hx, hy, hz)));
  body.position.set(cx, cy, cz);
  return body;
}

function randomExtraBallColor() {
  const r = 48 + Math.floor(Math.random() * 208);
  const g = 48 + Math.floor(Math.random() * 208);
  const b = 48 + Math.floor(Math.random() * 208);
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

function massForRadius(radius) {
  const t = radius / BALL_RADIUS;
  const m = BALL_MASS * t * t * t;
  return Math.max(0.35, Math.min(22, m));
}

export function createPushBallWorld({
  ballSpawnX = 2.2,
  ballSpawnY = BALL_RADIUS + 0.08,
  ballSpawnZ = 0.4,
} = {}) {
  const world = new World({
    gravity: new Vec3(0, -14, 0),
  });
  world.defaultContactMaterial.friction = 0.55;
  world.defaultContactMaterial.restitution = 0.12;

  const groundHalf = new Vec3(52, 0.12, 52);
  const ground = new Body({
    mass: 0,
    shape: new Box(groundHalf),
  });
  ground.position.set(0, -groundHalf.y, 0);
  world.addBody(ground);

  /** @type {Body[]} */
  const levelStaticBodies = [];

  const ballShape = new Sphere(BALL_RADIUS);
  const ball = new Body({
    mass: BALL_MASS,
    shape: ballShape,
    linearDamping: 0.06,
    angularDamping: 0.12,
    material: world.defaultContactMaterial,
  });
  ball.position.set(ballSpawnX, ballSpawnY, ballSpawnZ);
  world.addBody(ball);

  /** @type {Map<string, { body: Body, radius: number, color: string, spawnedAtMs: number }>} */
  const extraBalls = new Map();
  let nextExtraBallId = 0;

  /** @type {Map<string, Body>} */
  const playerProxies = new Map();

  function resetBallBody(body, x, y, z) {
    body.position.set(x, y, z);
    body.velocity.set(0, 0, 0);
    body.angularVelocity.set(0, 0, 0);
    body.quaternion.set(0, 0, 0, 1);
  }

  /**
   * Spawn a random extra sphere near the player (server-only).
   * @returns {boolean} false if at cap
   */
  function spawnExtraBallNear(position, rotationY) {
    if (extraBalls.size >= MAX_EXTRA_BALLS) return false;
    const radius = EXTRA_BALL_RADIUS_MIN
      + Math.random() * (EXTRA_BALL_RADIUS_MAX - EXTRA_BALL_RADIUS_MIN);
    const dist = 1.15 + Math.random() * 0.35;
    const fx = Math.sin(rotationY);
    const fz = Math.cos(rotationY);
    const x = position.x + fx * dist;
    const z = position.z + fz * dist;
    const y = Math.max(position.y + 0.45, radius + 0.12);

    const id = `ball-${nextExtraBallId++}`;
    const shape = new Sphere(radius);
    const body = new Body({
      mass: massForRadius(radius),
      shape,
      linearDamping: 0.06,
      angularDamping: 0.12,
      material: world.defaultContactMaterial,
    });
    body.position.set(x, y, z);
    world.addBody(body);
    extraBalls.set(id, {
      body,
      radius,
      color: randomExtraBallColor(),
      spawnedAtMs: Date.now(),
    });
    return true;
  }

  function serializeBallBody(body, id, radius, color) {
    return {
      id,
      r: +radius.toFixed(3),
      color,
      x: +body.position.x.toFixed(3),
      y: +body.position.y.toFixed(3),
      z: +body.position.z.toFixed(3),
      qx: +body.quaternion.x.toFixed(4),
      qy: +body.quaternion.y.toFixed(4),
      qz: +body.quaternion.z.toFixed(4),
      qw: +body.quaternion.w.toFixed(4),
    };
  }

  function setLevelColliders(colliders) {
    for (const b of levelStaticBodies) {
      world.removeBody(b);
    }
    levelStaticBodies.length = 0;
    if (!Array.isArray(colliders)) return;
    for (const c of colliders) {
      if (shouldSkipLayoutColliderForBall(c)) continue;
      if (c.type !== 'wall' && c.type !== 'furniture' && c.type !== 'surface') continue;
      const body = aabbToStaticBody(c.aabb, c.type);
      world.addBody(body);
      levelStaticBodies.push(body);
    }
  }

  function syncPlayers(playersMap) {
    const alive = new Set();
    for (const [id, state] of playersMap) {
      if (!state?.alive) continue;
      alive.add(id);
      let proxy = playerProxies.get(id);
      if (!proxy) {
        proxy = new Body({
          mass: 0,
          type: Body.KINEMATIC,
          shape: new Sphere(PLAYER_PROXY_RADIUS),
          collisionResponse: true,
        });
        world.addBody(proxy);
        playerProxies.set(id, proxy);
      }
      proxy.position.set(
        state.position.x,
        state.position.y + PLAYER_PROXY_CENTER_Y,
        state.position.z,
      );
      proxy.velocity.set(0, 0, 0);
      proxy.angularVelocity.set(0, 0, 0);
    }
    for (const [id, body] of playerProxies) {
      if (!alive.has(id)) {
        world.removeBody(body);
        playerProxies.delete(id);
      }
    }
  }

  function step(dt, maxSubSteps = 6) {
    const now = Date.now();
    for (const [id, entry] of extraBalls) {
      if (now - entry.spawnedAtMs >= EXTRA_BALL_TTL_MS) {
        world.removeBody(entry.body);
        extraBalls.delete(id);
      }
    }

    world.fixedStep(dt, maxSubSteps);
    if (ball.position.y < -3) {
      resetBallBody(ball, ballSpawnX, ballSpawnY, ballSpawnZ);
    }
    for (const [, { body, radius }] of extraBalls) {
      if (body.position.y < -3) {
        const ox = (Math.random() - 0.5) * 4;
        const oz = (Math.random() - 0.5) * 4;
        resetBallBody(body, ox, radius + 0.1, oz);
      }
    }
  }

  function getBallsState() {
    const list = [
      serializeBallBody(ball, 'push-ball', BALL_RADIUS, DEFAULT_BALL_COLOR),
    ];
    for (const [id, { body, radius, color }] of extraBalls) {
      list.push(serializeBallBody(body, id, radius, color));
    }
    return list;
  }

  function getBallsForAi() {
    const list = [{
      id: 'push-ball',
      x: ball.position.x, y: ball.position.y, z: ball.position.z,
      vx: ball.velocity.x, vy: ball.velocity.y, vz: ball.velocity.z,
      radius: BALL_RADIUS,
    }];
    for (const [id, { body, radius }] of extraBalls) {
      list.push({
        id,
        x: body.position.x, y: body.position.y, z: body.position.z,
        vx: body.velocity.x, vy: body.velocity.y, vz: body.velocity.z,
        radius,
      });
    }
    return list;
  }

  /**
   * Smack any balls in front of `origin` in the XZ forward direction.
   * Returns the number of balls impulsed.
   */
  function smackBallsInFront(origin, forwardX, forwardZ, {
    range = 1.9,
    speed = 11,
    upSpeed = 3.5,
  } = {}) {
    const entries = [[ball, BALL_RADIUS]];
    for (const [, { body, radius }] of extraBalls) entries.push([body, radius]);
    let hit = 0;
    for (const [body, radius] of entries) {
      const dx = body.position.x - origin.x;
      const dz = body.position.z - origin.z;
      const dy = body.position.y - (origin.y + PLAYER_PROXY_CENTER_Y);
      const distXZ = Math.sqrt(dx * dx + dz * dz);
      if (distXZ > range + radius) continue;
      if (Math.abs(dy) > 1.3 + radius) continue;
      const dot = distXZ > 0.001 ? (dx * forwardX + dz * forwardZ) / distXZ : 1;
      if (dot < -0.1) continue;
      body.wakeUp?.();
      body.velocity.x = forwardX * speed;
      body.velocity.z = forwardZ * speed;
      body.velocity.y = Math.max(body.velocity.y, upSpeed);
      hit++;
    }
    return hit;
  }

  return {
    syncPlayers,
    step,
    getBallsState,
    getBallsForAi,
    smackBallsInFront,
    spawnExtraBallNear,
    setLevelColliders,
  };
}
