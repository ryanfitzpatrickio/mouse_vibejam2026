import * as THREE from 'three';

const _knockDir = new THREE.Vector3();

/**
 * Manages all predator entities — spawning, updating AI, and handling
 * combat interactions with the player.
 */
export class PredatorManager {
  constructor({ scene, controller, collisionQuery }) {
    this.scene = scene;
    this.controller = controller;
    this.collisionQuery = collisionQuery;
    this.predators = [];
  }

  /**
   * Add a predator to the world.
   * @param {Predator} predator - An already-loaded predator instance.
   * @param {THREE.Vector3} spawnPos - World position to place it.
   */
  add(predator, spawnPos) {
    predator.collisionQuery = this.collisionQuery;
    predator.spawn(spawnPos, this.controller.mouse);

    predator.onAttackHit = (pred, target) => {
      if (!this.controller.alive) return;

      // Knockback direction: from predator toward player
      _knockDir.copy(this.controller.position).sub(pred.position).setY(0);
      if (_knockDir.lengthSq() < 0.001) _knockDir.set(0, 0, 1);
      _knockDir.normalize().multiplyScalar(pred.knockbackForce);
      _knockDir.y = 3; // pop up slightly

      this.controller.velocity.add(_knockDir);
      this.controller.takeDamage(pred.damage);
    };

    this.scene.add(predator);
    this.predators.push(predator);
  }

  update(dt) {
    for (const predator of this.predators) {
      predator.update(dt);
    }
  }

  dispose() {
    for (const predator of this.predators) {
      this.scene.remove(predator);
    }
    this.predators.length = 0;
  }
}
