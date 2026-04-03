import * as THREE from 'three/webgpu';
import { createKeyCelMaterial, createToonFallbackMaterial } from '../materials/index.js';

/**
 * Mouse character: procedural mesh + animation system
 * Sized appropriately for human/mouse scale interaction with room furniture
 */
export class Mouse extends THREE.Group {
  constructor(options = {}) {
    super();
    this.name = 'Mouse';

    // Customization
    this.furColor = options.furColor ?? '#f5a962';
    this.bellieColor = options.bellyColor ?? '#f8d4b0';
    this.eyeColor = options.eyeColor ?? '#000000';
    this.noseColor = options.noseColor ?? '#ff8866';
    this.scale.set(0.6, 0.6, 0.6); // Small relative to room

    // Animation state
    this.animationState = 'idle';
    this.carryingItem = null;
    this.targetPosition = new THREE.Vector3();
    this.targetRotation = new THREE.Euler();

    // Body parts (stored for animation access)
    this.parts = {};

    // Animation parameters
    this.animationTime = 0;
    this.animationSpeed = 1.0;
    this.blendFactor = 0.0; // For smooth transitions

    // Create mesh
    this.buildMouse();
  }

  buildMouse() {
    // Materials
    const furMat = createKeyCelMaterial({
      baseColor: this.furColor,
      toonBands: 3,
      rimPower: 2.5,
      rimStrength: 0.3,
    });

    const bellyMat = createKeyCelMaterial({
      baseColor: this.bellieColor,
      toonBands: 3,
    });

    const eyeMat = new THREE.MeshStandardMaterial({
      color: this.eyeColor,
      metalness: 0.5,
      roughness: 0.2,
      emissive: '#222222',
    });

    const noseMat = new THREE.MeshStandardMaterial({
      color: this.noseColor,
      metalness: 0.3,
      roughness: 0.3,
    });

    // BODY: elongated sphere
    const bodyGeo = new THREE.CapsuleGeometry(0.3, 0.8, 8, 8);
    const body = new THREE.Mesh(bodyGeo, furMat);
    body.position.z = 0;
    body.name = 'Body';
    this.add(body);
    this.parts.body = body;

    // BELLY: lighter colored underbelly
    const bellyGeo = new THREE.CapsuleGeometry(0.25, 0.7, 8, 6);
    const belly = new THREE.Mesh(bellyGeo, bellyMat);
    belly.position.z = 0.15; // In front of body
    belly.scale.z = 0.7;
    belly.name = 'Belly';
    this.add(belly);
    this.parts.belly = belly;

    // HEAD: rounded sphere on front
    const headGeo = new THREE.SphereGeometry(0.35, 16, 12);
    const head = new THREE.Mesh(headGeo, furMat);
    head.position.set(0, 0, 0.65);
    head.name = 'Head';
    this.add(head);
    this.parts.head = head;

    // EARS: tall expressive ears
    const earGeo = new THREE.ConeGeometry(0.15, 0.5, 8);
    const earLeft = new THREE.Mesh(earGeo, furMat);
    earLeft.position.set(-0.2, 0.25, 0.75);
    earLeft.rotation.z = 0.3;
    earLeft.name = 'EarLeft';
    this.add(earLeft);
    this.parts.earLeft = earLeft;

    const earRight = new THREE.Mesh(earGeo, furMat);
    earRight.position.set(0.2, 0.25, 0.75);
    earRight.rotation.z = -0.3;
    earRight.name = 'EarRight';
    this.add(earRight);
    this.parts.earRight = earRight;

    // EYES: big expressive eyes
    const eyeGeo = new THREE.SphereGeometry(0.12, 12, 8);
    const eyeLeft = new THREE.Mesh(eyeGeo, eyeMat);
    eyeLeft.position.set(-0.15, 0.15, 0.88);
    eyeLeft.name = 'EyeLeft';
    this.add(eyeLeft);
    this.parts.eyeLeft = eyeLeft;

    const eyeRight = new THREE.Mesh(eyeGeo, eyeMat);
    eyeRight.position.set(0.15, 0.15, 0.88);
    eyeRight.name = 'EyeRight';
    this.add(eyeRight);
    this.parts.eyeRight = eyeRight;

    // PUPILS: glossy highlights for expression
    const pupilGeo = new THREE.SphereGeometry(0.055, 8, 6);
    const pupilMat = new THREE.MeshStandardMaterial({
      color: '#ffffff',
      metalness: 0.8,
      roughness: 0.1,
      emissive: '#ffffff',
      emissiveIntensity: 0.3,
    });

    const pupilLeft = new THREE.Mesh(pupilGeo, pupilMat);
    pupilLeft.position.set(-0.17, 0.13, 0.96);
    pupilLeft.name = 'PupilLeft';
    this.add(pupilLeft);
    this.parts.pupilLeft = pupilLeft;

    const pupilRight = new THREE.Mesh(pupilGeo, pupilMat);
    pupilRight.position.set(0.17, 0.13, 0.96);
    pupilRight.name = 'PupilRight';
    this.add(pupilRight);
    this.parts.pupilRight = pupilRight;

    // NOSE: small rounded
    const noseGeo = new THREE.SphereGeometry(0.08, 8, 6);
    const nose = new THREE.Mesh(noseGeo, noseMat);
    nose.position.set(0, 0, 1.0);
    nose.name = 'Nose';
    this.add(nose);
    this.parts.nose = nose;

    // TAIL: long flowing tail
    const tailGeo = new THREE.TubeGeometry(
      new THREE.LineCurve3(
        new THREE.Vector3(0, -0.2, -0.5),
        new THREE.Vector3(0.2, -0.3, -1.2),
      ),
      8,
      0.08,
      6,
    );
    const tail = new THREE.Mesh(tailGeo, furMat);
    tail.name = 'Tail';
    this.add(tail);
    this.parts.tail = tail;

    // LEGS: 4 small legs
    const legGeo = new THREE.CapsuleGeometry(0.08, 0.35, 6, 4);
    const legPositions = [
      { x: -0.2, z: 0.1 }, // front left
      { x: 0.2, z: 0.1 }, // front right
      { x: -0.15, z: -0.3 }, // back left
      { x: 0.15, z: -0.3 }, // back right
    ];

    legPositions.forEach((pos, i) => {
      const leg = new THREE.Mesh(legGeo, furMat);
      leg.position.set(pos.x, -0.35, pos.z);
      leg.rotation.z = Math.PI * 0.5;
      leg.name = `Leg${i}`;
      this.add(leg);
      this.parts[`leg${i}`] = leg;
    });
  }

  /**
   * Set animation state and trigger transition
   */
  setAnimationState(newState) {
    if (this.animationState !== newState) {
      this.animationState = newState;
      this.animationTime = 0;
      this.blendFactor = 0;
    }
  }

  /**
   * Check current animation state
   */
  getAnimationState() {
    return this.animationState;
  }

  /**
   * Update animation based on state and time
   */
  update(deltaTime = 0.016) {
    this.animationTime += deltaTime * this.animationSpeed;

    // Update animation based on current state
    switch (this.animationState) {
      case 'idle':
        this.animateIdle();
        break;
      case 'run':
        this.animateRun();
        break;
      case 'jump':
        this.animateJump();
        break;
      case 'chew':
        this.animateChew();
        break;
      case 'carry':
        this.animateCarry();
        break;
      case 'death':
        this.animateDeath();
        break;
    }

    // Update carried item position if present
    if (this.carryingItem) {
      this.updateCarriedItem();
    }
  }

  /**
   * IDLE: Subtle breathing and weight shift
   */
  animateIdle() {
    const t = this.animationTime;
    const bob = Math.sin(t * 2) * 0.05;
    const sway = Math.sin(t * 0.8) * 0.08;

    // Body breathing
    this.parts.body.position.y = bob;
    this.parts.belly.position.y = bob;
    this.parts.head.position.y = bob + 0.02;

    // Head rotation sway
    this.parts.head.rotation.z = sway * 0.3;

    // Tail sway
    this.parts.tail.rotation.y = sway;

    // Ears wiggle
    this.parts.earLeft.rotation.x = Math.sin(t * 3) * 0.1;
    this.parts.earRight.rotation.x = Math.sin(t * 3 + Math.PI) * 0.1;

    // Eye blink (simple opacity)
    const blink = Math.max(0, Math.sin(t * 1.5));
    [this.parts.pupilLeft, this.parts.pupilRight].forEach((eye) => {
      eye.material.opacity = blink;
    });
  }

  /**
   * RUN: Full body motion - leg cycle, body bob, tail swish
   */
  animateRun() {
    const t = this.animationTime * 2; // Faster
    const legCycle = Math.sin(t) * 0.3;
    const legCycle2 = Math.sin(t + Math.PI) * 0.3;
    const bodyBob = Math.abs(Math.sin(t * 0.5)) * 0.15;
    const tailSwish = Math.sin(t) * 0.5;

    // Legs: alternating cycle
    this.parts.leg0.rotation.x = legCycle;
    this.parts.leg1.rotation.x = legCycle2;
    this.parts.leg2.rotation.x = legCycle2;
    this.parts.leg3.rotation.x = legCycle;

    // Body bob and lean
    this.parts.body.position.y = bodyBob;
    this.parts.body.rotation.z = Math.sin(t) * 0.15;

    // Head forward lean
    this.parts.head.rotation.x = 0.2;
    this.parts.head.position.y = bodyBob;

    // Tail active swish
    this.parts.tail.rotation.y = tailSwish;
    this.parts.tail.rotation.x = Math.sin(t) * 0.3;
  }

  /**
   * JUMP: Tuck and stretch
   */
  animateJump() {
    const t = this.animationTime;
    let jumpPhase;

    if (t < 0.3) {
      // Crouch phase
      jumpPhase = t / 0.3;
    } else if (t < 0.7) {
      // Air phase
      jumpPhase = 1.0;
    } else if (t < 1.0) {
      // Land phase
      jumpPhase = 1.0 - (t - 0.7) / 0.3;
    } else {
      // Return to idle
      this.setAnimationState('idle');
      return;
    }

    // Crouch tuck
    const tuck = (1.0 - jumpPhase) * 0.4;
    this.parts.body.scale.y = 1.0 - tuck;
    this.parts.body.position.y = -tuck * 0.2;

    // Head tuck
    this.parts.head.position.z = 0.65 - tuck * 0.3;

    // Legs curl
    [0, 1, 2, 3].forEach((i) => {
      this.parts[`leg${i}`].rotation.x = -tuck * 1.5;
    });

    // Jump upward arc
    const jumpHeight = jumpPhase * 0.8;
    this.position.y = jumpHeight;

    // Stretch on landing
    this.parts.body.scale.y = 1.0 + jumpPhase * 0.1;
  }

  /**
   * CHEW: Head bobbing, jaw-like motion
   */
  animateChew() {
    const t = this.animationTime * 3;
    const chewBob = Math.sin(t) * 0.12;
    const chewTilt = Math.sin(t * 0.7) * 0.2;

    // Head vertical bob
    this.parts.head.position.y = chewBob;

    // Head tilt side to side
    this.parts.head.rotation.x = chewTilt;

    // Nose wrinkle
    this.parts.nose.scale.x = 1.0 + Math.sin(t) * 0.15;

    // Ears twitch
    this.parts.earLeft.rotation.x = Math.sin(t) * 0.15;
    this.parts.earRight.rotation.x = Math.sin(t + 0.5) * 0.15;

    // Tail sway
    this.parts.tail.rotation.y = Math.sin(t * 0.5) * 0.3;
  }

  /**
   * CARRY: Item positioned on back or in mouth
   */
  animateCarry() {
    const t = this.animationTime;
    const idleBob = Math.sin(t * 2) * 0.04;

    // Idle-like but with slight forward lean
    this.parts.body.position.y = idleBob;
    this.parts.body.rotation.x = 0.1;
    this.parts.head.rotation.x = 0.15;

    // Tail curled
    this.parts.tail.rotation.y = 0.3;
    this.parts.tail.rotation.z = 0.2;

    // Back legs slightly bent (carrying weight)
    this.parts.leg2.rotation.x = -0.2;
    this.parts.leg3.rotation.x = -0.2;
  }

  /**
   * DEATH: Ragdoll tumble
   */
  animateDeath() {
    const t = this.animationTime;

    // Spin and tumble
    this.rotation.x += 0.1;
    this.rotation.y += 0.15;
    this.rotation.z += 0.08;

    // Limbs flail
    [0, 1, 2, 3].forEach((i) => {
      this.parts[`leg${i}`].rotation.x = Math.sin(t + i) * Math.PI * 0.5;
    });

    // Head flop
    this.parts.head.rotation.z = Math.sin(t * 2) * 0.4;
    this.parts.head.rotation.y = Math.cos(t * 1.5) * 0.4;

    // Tail wild
    this.parts.tail.rotation.y = Math.sin(t * 3) * 0.8;

    // Falling
    this.position.y -= 0.1 * deltaTime;
  }

  /**
   * Update position of carried item
   */
  updateCarriedItem() {
    if (!this.carryingItem) return;

    // Position on back
    const itemOffset = new THREE.Vector3(0, 0.3, -0.2);
    itemOffset.applyQuaternion(this.quaternion);
    this.carryingItem.position.copy(this.position).add(itemOffset);

    // Match rotation
    this.carryingItem.rotation.copy(this.rotation);
  }

  /**
   * Pick up an item
   */
  pickupItem(item) {
    this.carryingItem = item;
    this.setAnimationState('carry');
    if (item.parent) {
      item.removeFromParent();
    }
    this.add(item);
  }

  /**
   * Drop carried item
   */
  dropItem() {
    if (this.carryingItem) {
      const world = this.parent;
      if (world) {
        world.add(this.carryingItem);
      }
      this.carryingItem = null;
      this.setAnimationState('idle');
    }
  }

  /**
   * Simple movement
   */
  move(direction, distance = 0.1) {
    direction.normalize();
    const movement = direction.multiplyScalar(distance);

    // Add to current position
    this.position.add(movement);

    // Rotate to face direction
    if (direction.lengthSq() > 0.01) {
      const angle = Math.atan2(direction.x, direction.z);
      this.rotation.y = angle;
    }
  }
}
