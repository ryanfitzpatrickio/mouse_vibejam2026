/**
 * Server-only cannon-es cylinder for the roomba so thin wall AABBs don’t tunnel
 * like the swept AABB predator resolver. Static layout matches pushBallWorld.
 */

import { World, Vec3, Body, Cylinder, Quaternion } from 'cannon-es';
import { ROOMBA_BODY_HEIGHT, ROOMBA_RADIUS_XZ } from '../shared/roombaDimensions.js';
import { shouldSkipLayoutColliderForBall, aabbToStaticBody } from './pushBallWorld.js';

const DEFAULT_RADIUS = ROOMBA_RADIUS_XZ;
const DEFAULT_HEIGHT = ROOMBA_BODY_HEIGHT;
/** Slightly above MOVE_SPEED so the motor can keep up after wall contact. */
const MOTOR_MAX_SPEED = 4.25;

export function createRoombaCannonWorld() {
  const world = new World({ gravity: new Vec3(0, 0, 0) });
  world.defaultContactMaterial.friction = 0.52;
  world.defaultContactMaterial.restitution = 0.04;

  /** @type {import('cannon-es').Body[]} */
  const levelStaticBodies = [];

  function setLevelColliders(colliders) {
    for (const b of levelStaticBodies) world.removeBody(b);
    levelStaticBodies.length = 0;
    if (!Array.isArray(colliders)) return;
    for (const c of colliders) {
      if (shouldSkipLayoutColliderForBall(c)) continue;
      if (c.type !== 'wall' && c.type !== 'furniture' && c.type !== 'surface') continue;
      const staticBody = aabbToStaticBody(c.aabb, c.type);
      world.addBody(staticBody);
      levelStaticBodies.push(staticBody);
    }
  }

  const h = DEFAULT_HEIGHT;
  const cyl = new Cylinder(DEFAULT_RADIUS, DEFAULT_RADIUS, h, 10);
  const body = new Body({
    mass: 72,
    linearDamping: 0.07,
    angularDamping: 0.99,
    material: world.defaultContactMaterial,
  });
  body.addShape(cyl);
  body.angularFactor.set(0, 0, 0);
  world.addBody(body);

  const axisY = new Vec3(0, 1, 0);
  const quat = new Quaternion();
  let initialized = false;

  function resetBody() {
    initialized = false;
  }

  /**
   * AI has written desired `roomba.position` (XZ + nav Y). Drive the cylinder toward it, step physics, write XZ back.
   * @param {{ position: {x:number,y:number,z:number}, rotation: number, phase: string, radius?: number, height?: number }} roomba
   * @param {number} dt
   */
  function solve(roomba, dt) {
    const halfH = (roomba.height ?? DEFAULT_HEIGHT) * 0.5;
    const floorY = roomba.position.y;
    const baseY = floorY + halfH;

    quat.setFromAxisAngle(axisY, roomba.rotation);
    body.quaternion.copy(quat);

    if (roomba.phase === 'charging') {
      body.velocity.set(0, 0, 0);
      body.position.set(roomba.position.x, baseY, roomba.position.z);
      initialized = true;
      return;
    }

    const tx = roomba.position.x;
    const tz = roomba.position.z;

    if (!initialized) {
      body.position.set(tx, baseY, tz);
      body.velocity.set(0, 0, 0);
      initialized = true;
    }

    const step = Math.max(dt, 1e-4);
    let vx = (tx - body.position.x) / step;
    let vz = (tz - body.position.z) / step;
    const mag = Math.hypot(vx, vz);
    if (mag > MOTOR_MAX_SPEED) {
      const s = MOTOR_MAX_SPEED / mag;
      vx *= s;
      vz *= s;
    }
    body.velocity.set(vx, 0, vz);
    body.position.y = baseY;

    // Use `world.step` substeps — `fixedStep` keys off `performance.now()` and can advance
    // zero time when called multiple times in one event-loop turn.
    const maxDt = Math.min(dt, 0.05);
    const n = 12;
    const h = maxDt / n;
    for (let i = 0; i < n; i += 1) {
      body.position.y = baseY;
      body.velocity.y = 0;
      world.step(h);
    }

    body.position.y = baseY;
    body.velocity.y = 0;

    roomba.position.x = body.position.x;
    roomba.position.z = body.position.z;
  }

  return { setLevelColliders, solve, resetBody };
}
