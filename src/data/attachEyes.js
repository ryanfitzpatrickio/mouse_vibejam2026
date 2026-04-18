import * as THREE from 'three';
import { MouseEyeAtlasAnimator } from '../animation/MouseEyeAtlasAnimator.js';
import { getEyePlacement, subscribeEyePlacement } from './eyePlacements.js';

/**
 * Find a child by name (bone, group, mesh). Falls back to the model itself.
 * Bones in skinned meshes often have suffixes (e.g. "mixamorig:Head"); we
 * accept exact match first, then a case-insensitive contains match.
 */
export function findSocket(model, socketName) {
  if (!model || !socketName) return model;
  const exact = model.getObjectByName(socketName);
  if (exact) return exact;
  const needle = socketName.toLowerCase();
  let fuzzy = null;
  model.traverse((child) => {
    if (fuzzy) return;
    if (child.name && child.name.toLowerCase().includes(needle)) fuzzy = child;
  });
  return fuzzy ?? model;
}

/** Collect bone-like nodes for the dressing-room socket dropdown. */
export function listSockets(model) {
  if (!model) return [];
  const out = [];
  const seen = new Set();
  model.traverse((child) => {
    const name = child.name;
    if (!name || seen.has(name)) return;
    if (child.isBone || /head|neck|spine|hand|hip|root/i.test(name)) {
      out.push(name);
      seen.add(name);
    }
  });
  return out;
}

function placementToAttachOptions(placement) {
  return {
    localOffset: new THREE.Vector3(placement.position.x, placement.position.y, placement.position.z),
    localRotation: new THREE.Euler(placement.rotation.x, placement.rotation.y, placement.rotation.z),
    localScale: new THREE.Vector3(placement.scale.x, placement.scale.y, placement.scale.z),
    eyeSize: placement.eyeSize ?? 0.13,
  };
}

/**
 * Attach an eye animator to a model using the stored placement for `modelKey`.
 * Returns an unsubscribe handle that disposes the live-update subscription.
 *
 * Caller is responsible for `eyeAnimator.update(dt)` each frame and for
 * disposing the animator when the entity is destroyed.
 *
 * @param {string} modelKey
 * @param {MouseEyeAtlasAnimator} eyeAnimator
 * @param {THREE.Object3D} model
 * @param {{ stateToExpression?: Record<string,string>, hideTargets?: THREE.Object3D[] }} [opts]
 */
export function attachEyesToModel(modelKey, eyeAnimator, model, opts = {}) {
  if (!eyeAnimator || !model) return () => {};
  const placement = getEyePlacement(modelKey);
  if (!placement) return () => {};

  const anchor = findSocket(model, placement.socket);
  eyeAnimator.attach(anchor, {
    ...placementToAttachOptions(placement),
    hideTargets: opts.hideTargets ?? [],
  });

  let lastSocket = placement.socket;
  const unsubscribe = subscribeEyePlacement(modelKey, (next) => {
    if (!next) return;
    if (next.socket !== lastSocket) {
      lastSocket = next.socket;
      const newAnchor = findSocket(model, next.socket);
      eyeAnimator.attach(newAnchor, {
        ...placementToAttachOptions(next),
        hideTargets: opts.hideTargets ?? [],
      });
      return;
    }
    eyeAnimator.setPlacement({
      position: next.position,
      rotation: next.rotation,
      scale: next.scale,
      eyeSize: next.eyeSize,
    });
  });

  return unsubscribe;
}
