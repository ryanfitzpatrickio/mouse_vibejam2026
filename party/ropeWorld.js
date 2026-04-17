/**
 * Server-only cannon-es rope world. Each rope is a chain of small sphere bodies
 * connected by PointToPointConstraints, pinned at the top to a fixed body.
 * Players can grab the nearest segment; while swinging, the server drives the
 * player's position from the attached segment body. Release hands segment
 * velocity back to the player and clears the ropeSwing state.
 */

import { World, Vec3, Sphere, Body, PointToPointConstraint, DistanceConstraint } from 'cannon-es';
import { PHYSICS } from '../shared/physics.js';
import { ROPES, ROPE_SEGMENT_RADIUS, ROPE_GRAB_RANGE } from '../shared/ropes.js';
import { aabbToStaticBody, shouldSkipLayoutColliderForBall } from './pushBallWorld.js';

const SEGMENT_MASS = 0.6;
const PLAYER_BODY_MASS = 2.8;
const PLAYER_GRAB_OFFSET_Y = PHYSICS.playerHeight * 0.65;
const PUMP_FORCE = 55;
const RELEASE_COOLDOWN_S = 0.25;
const MAX_SWING_SECONDS = 20;
// Extra upward impulse on each scoot to give the climb a lively pop.
const SCOOT_UP_IMPULSE = 3.8;
// Stiffness for rope constraint equations. Cannon's PointToPointConstraint
// defaults to ~1e7 which stretches badly under a heavy player mass.
const ROPE_STIFFNESS = 1e9;
const ROPE_RELAXATION = 3;

function _stiffen(constraint) {
  for (const eq of constraint.equations) {
    eq.stiffness = ROPE_STIFFNESS;
    eq.relaxation = ROPE_RELAXATION;
  }
  constraint.update?.();
}

export function createRopeWorld(options = {}) {
  const initialRopes = Array.isArray(options?.ropes) && options.ropes.length
    ? options.ropes
    : ROPES;

  const world = new World({ gravity: new Vec3(0, -18, 0) });
  world.defaultContactMaterial.friction = 0.05;
  world.defaultContactMaterial.restitution = 0.0;
  // Default solver iterations (10) are too loose for a chain with a heavy
  // player at the bottom — the rope visibly stretches. Crank it up.
  if (world.solver && typeof world.solver.iterations === 'number') {
    world.solver.iterations = 40;
    world.solver.tolerance = 0.0001;
  }

  /** @type {Map<string, {
   *   def: object,
   *   bodies: Body[],
   *   constraints: PointToPointConstraint[],
   * }>} */
  const ropes = new Map();

  /** @type {Map<string, {
   *   ropeId: string,
   *   segmentIndex: number,
   *   playerBody: Body,
   *   constraint: PointToPointConstraint,
   *   cooldown: number,
   *   swingTime: number,
   * }>} */
  const swingers = new Map();

  /** @type {Body[]} */
  const levelStaticBodies = [];

  function _buildRope(def) {
    const { id, anchor, length, segmentCount } = def;
    const segLen = length / segmentCount;
    const bodies = [];
    const constraints = [];

    const top = new Body({ mass: 0 });
    top.position.set(anchor.x, anchor.y, anchor.z);
    world.addBody(top);
    bodies.push(top);

    for (let i = 1; i <= segmentCount; i += 1) {
      const b = new Body({
        mass: SEGMENT_MASS,
        shape: new Sphere(ROPE_SEGMENT_RADIUS),
        linearDamping: 0.12,
        angularDamping: 0.9,
      });
      b.position.set(anchor.x, anchor.y - segLen * i, anchor.z);
      b.allowSleep = false;
      world.addBody(b);
      bodies.push(b);

      const prev = bodies[bodies.length - 2];
      const c = new PointToPointConstraint(
        prev, new Vec3(0, -segLen * 0.5, 0),
        b, new Vec3(0, segLen * 0.5, 0),
      );
      world.addConstraint(c);
      _stiffen(c);
      constraints.push(c);
    }

    ropes.set(id, { def, bodies, constraints });
  }

  for (const def of initialRopes) _buildRope(def);

  function _clearRopes() {
    for (const { bodies, constraints } of ropes.values()) {
      for (const c of constraints) world.removeConstraint(c);
      for (const b of bodies) world.removeBody(b);
    }
    ropes.clear();
  }

  function setRopes(nextDefs) {
    const defs = Array.isArray(nextDefs) && nextDefs.length ? nextDefs : ROPES;
    _clearRopes();
    for (const def of defs) _buildRope(def);
  }

  function setLevelColliders(colliders) {
    for (const b of levelStaticBodies) world.removeBody(b);
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

  function _nearestSegment(state) {
    let best = null;
    const px = state.position.x;
    const py = state.position.y + PLAYER_GRAB_OFFSET_Y;
    const pz = state.position.z;
    for (const rope of ropes.values()) {
      for (let i = 1; i < rope.bodies.length; i += 1) {
        const b = rope.bodies[i];
        const dx = b.position.x - px;
        const dy = b.position.y - py;
        const dz = b.position.z - pz;
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (dist <= ROPE_GRAB_RANGE && (best === null || dist < best.dist)) {
          best = { ropeId: rope.def.id, segmentIndex: i, body: b, dist };
        }
      }
    }
    return best;
  }

  function tryGrab(playerId, state) {
    if (!state?.alive) return false;
    if (swingers.has(playerId)) return false;
    if (state.ropeSwing) return false;
    const near = _nearestSegment(state);
    if (!near) return false;

    // Reject grab while the player is grounded: otherwise grabbing next to a
    // dangling rope tip latches on with a fully-slack cable and the player
    // just stands there "semi-attached". Requiring a jump/air state means the
    // rope actually takes their weight.
    if (state.grounded) return false;

    const playerBody = new Body({
      mass: PLAYER_BODY_MASS,
      shape: new Sphere(PHYSICS.playerRadius),
      linearDamping: 0.02,
      angularDamping: 0.99,
    });
    playerBody.angularFactor.set(0, 0, 0);
    playerBody.position.set(
      state.position.x,
      state.position.y + PLAYER_GRAB_OFFSET_Y,
      state.position.z,
    );
    playerBody.velocity.set(state.velocity.x, state.velocity.y, state.velocity.z);
    world.addBody(playerBody);

    const constraint = new PointToPointConstraint(
      near.body, new Vec3(0, 0, 0),
      playerBody, new Vec3(0, 0, 0),
    );
    world.addConstraint(constraint);
    _stiffen(constraint);

    // Hard cable: keeps the player at a fixed radius from the fixed anchor so
    // a heavy player body can't stretch the soft segment chain. The chain
    // constraint above still drives lateral/vertical feel and the visual shape.
    const rope = ropes.get(near.ropeId);
    const segLen = rope.def.length / rope.def.segmentCount;
    const cableLen = segLen * near.segmentIndex;
    const cable = new DistanceConstraint(rope.bodies[0], playerBody, cableLen);
    world.addConstraint(cable);
    _stiffen(cable);

    swingers.set(playerId, {
      ropeId: near.ropeId,
      segmentIndex: near.segmentIndex,
      playerBody,
      constraint,
      cable,
      cooldown: 0,
      swingTime: 0,
    });
    state.ropeSwing = { ropeId: near.ropeId, segmentIndex: near.segmentIndex };
    state.wallHolding = false;
    state.grounded = false;
    return true;
  }

  function release(playerId, state) {
    const entry = swingers.get(playerId);
    if (!entry) return;
    const v = entry.playerBody.velocity;
    world.removeConstraint(entry.constraint);
    if (entry.cable) world.removeConstraint(entry.cable);
    world.removeBody(entry.playerBody);
    swingers.delete(playerId);
    if (state) {
      state.ropeSwing = null;
      state.velocity.x = v.x;
      state.velocity.y = v.y;
      state.velocity.z = v.z;
      state.grounded = false;
      state.canDoubleJump = true;
      state.hasDoubleJumped = false;
    }
  }

  function scootUp(playerId, state) {
    const entry = swingers.get(playerId);
    if (!entry) return false;
    const rope = ropes.get(entry.ropeId);
    if (!rope) return false;
    const nextIdx = Math.max(1, entry.segmentIndex - 1);
    if (nextIdx === entry.segmentIndex) return false;
    const nextBody = rope.bodies[nextIdx];
    world.removeConstraint(entry.constraint);
    const c = new PointToPointConstraint(
      nextBody, new Vec3(0, 0, 0),
      entry.playerBody, new Vec3(0, 0, 0),
    );
    world.addConstraint(c);
    _stiffen(c);
    entry.constraint = c;
    entry.segmentIndex = nextIdx;
    if (entry.cable) {
      const segLen = rope.def.length / rope.def.segmentCount;
      entry.cable.distance = segLen * nextIdx;
    }
    if (state?.ropeSwing) state.ropeSwing.segmentIndex = nextIdx;
    entry.playerBody.velocity.y += SCOOT_UP_IMPULSE;
    return true;
  }

  function removePlayer(playerId) {
    const entry = swingers.get(playerId);
    if (!entry) return;
    world.removeConstraint(entry.constraint);
    if (entry.cable) world.removeConstraint(entry.cable);
    world.removeBody(entry.playerBody);
    swingers.delete(playerId);
  }

  function isSwinging(playerId) {
    return swingers.has(playerId);
  }

  function step(dt, getPlayerState) {
    const maxDt = Math.min(Math.max(dt, 1e-4), 0.05);
    const sub = 8;
    const h = maxDt / sub;
    // Apply per-player pump forces + climb reattachment before stepping.
    for (const [pid, entry] of swingers) {
      const st = getPlayerState(pid);
      if (!st?.alive) continue;
      // WASD drives a full-horizontal pump so forward/back builds swing
      // momentum in the camera-facing direction (moveX/moveZ are already
      // camera-relative world-space components from the client).
      const mx = Number.isFinite(st._ropeInput?.moveX) ? st._ropeInput.moveX : 0;
      const mz = Number.isFinite(st._ropeInput?.moveZ) ? st._ropeInput.moveZ : 0;
      if (mx !== 0 || mz !== 0) {
        const len = Math.hypot(mx, mz) || 1;
        entry.playerBody.applyForce(
          new Vec3((mx / len) * PUMP_FORCE, 0, (mz / len) * PUMP_FORCE),
          entry.playerBody.position,
        );
      }

      // Jump while swinging = scoot up one segment (one-shot). No down climb —
      // player releases and re-grabs if they need to go lower.
      if (st._ropeInput?.scootUp) {
        scootUp(pid, st);
      }
    }
    for (let i = 0; i < sub; i += 1) world.step(h);

    for (const pid of [...swingers.keys()]) {
      const entry = swingers.get(pid);
      if (!entry) continue;
      const st = getPlayerState(pid);
      if (!st?.alive) {
        release(pid, st);
        continue;
      }
      entry.swingTime += maxDt;

      const p = entry.playerBody.position;
      st.position.x = p.x;
      st.position.y = Math.max(0, p.y - PLAYER_GRAB_OFFSET_Y);
      st.position.z = p.z;
      st.velocity.x = entry.playerBody.velocity.x;
      st.velocity.y = entry.playerBody.velocity.y;
      st.velocity.z = entry.playerBody.velocity.z;
      st.grounded = false;
      st.animState = 'jump';

      if (entry.swingTime >= MAX_SWING_SECONDS) {
        release(pid, st);
        continue;
      }

      if (st._ropeInput?.releasePressed) {
        release(pid, st);
        if (st) st.roombaLaunchCooldown = Math.max(st.roombaLaunchCooldown ?? 0, RELEASE_COOLDOWN_S);
        continue;
      }
    }
  }

  function getRopesSnapshot() {
    const out = [];
    for (const rope of ropes.values()) {
      const segs = [];
      for (let i = 0; i < rope.bodies.length; i += 1) {
        const b = rope.bodies[i];
        segs.push({ x: b.position.x, y: b.position.y, z: b.position.z });
      }
      out.push({ id: rope.def.id, segments: segs });
    }
    return out;
  }

  return {
    setLevelColliders,
    setRopes,
    tryGrab,
    scootUp,
    release,
    removePlayer,
    isSwinging,
    step,
    getRopesSnapshot,
  };
}
