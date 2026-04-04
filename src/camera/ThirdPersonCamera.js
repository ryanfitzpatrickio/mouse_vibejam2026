import * as THREE from 'three/webgpu';

const UP = new THREE.Vector3(0, 1, 0);

/**
 * Third-person spring-arm camera controller with collision handling.
 */
export class ThirdPersonCamera {
  constructor({
    camera,
    domElement = null,
    collisionObjects = null,
    collisionQuery = null,
    armLength = 4.5,
    minArmLength = 1.1,
    maxArmLength = 7.5,
    shoulderOffset = new THREE.Vector3(0, 1.3, 0),
    stiffness = 22,
    damping = 10,
    yaw = Math.PI,
    pitch = -0.22,
    minPitch = -1.2,
    maxPitch = 1.2,
    mouseSensitivity = 0.0024,
    fov = null,
  } = {}) {
    if (!camera) {
      throw new Error('ThirdPersonCamera requires a THREE.PerspectiveCamera instance.');
    }

    this.camera = camera;
    this.domElement = domElement;

    this.collisionObjects = collisionObjects;
    this.collisionQuery = collisionQuery;

    this.armLength = armLength;
    this.minArmLength = minArmLength;
    this.maxArmLength = maxArmLength;

    this.stiffness = stiffness;
    this.damping = damping;

    this.yaw = yaw;
    this.pitch = pitch;
    this.minPitch = minPitch;
    this.maxPitch = maxPitch;
    this.mouseSensitivity = mouseSensitivity;

    this.pointerLocked = false;

    this.shoulderOffset = shoulderOffset.clone();

    this._currentPosition = this.camera.position.clone();
    this._targetPosition = new THREE.Vector3();
    this._pivot = new THREE.Vector3();
    this._smoothedPivot = new THREE.Vector3();
    this._velocity = new THREE.Vector3();

    this._raycaster = new THREE.Raycaster();
    this._lookDirection = new THREE.Vector3();

    this._desiredQuaternion = new THREE.Quaternion();
    this._smoothedQuaternion = this.camera.quaternion.clone();
    this._rotationEuler = new THREE.Euler(0, 0, 0, 'YXZ');

    this._tempVectorA = new THREE.Vector3();
    this._tempVectorB = new THREE.Vector3();

    this._onMouseMove = this._onMouseMove.bind(this);
    this._onPointerLockChange = this._onPointerLockChange.bind(this);

    if (typeof fov === 'number') {
      this.setFov(fov);
    }

    if (this.domElement) {
      this.attachPointerLock(this.domElement);
    }
  }

  attachPointerLock(domElement) {
    this.detachPointerLock();

    this.domElement = domElement;

    if (!this.domElement || typeof document === 'undefined') {
      return;
    }

    document.addEventListener('mousemove', this._onMouseMove, false);
    document.addEventListener('pointerlockchange', this._onPointerLockChange, false);
    this._onPointerLockChange();
  }

  detachPointerLock() {
    if (typeof document === 'undefined') {
      this.pointerLocked = false;
      return;
    }

    document.removeEventListener('mousemove', this._onMouseMove, false);
    document.removeEventListener('pointerlockchange', this._onPointerLockChange, false);
    this.pointerLocked = false;
  }

  requestPointerLock() {
    if (!this.domElement || !this.domElement.requestPointerLock) {
      return;
    }

    this.domElement.requestPointerLock();
  }

  setFov(fov) {
    this.camera.fov = fov;
    this.camera.updateProjectionMatrix();
  }

  setArmLength(length) {
    this.armLength = THREE.MathUtils.clamp(length, this.minArmLength, this.maxArmLength);
  }

  /**
   * Returns a normalized, camera-relative movement direction from WASD-like input.
   */
  getCameraRelativeMovement(inputState) {
    const x = (inputState.right ? 1 : 0) - (inputState.left ? 1 : 0);
    const back = inputState.back ?? inputState.backward ?? false;
    const z = (back ? 1 : 0) - (inputState.forward ? 1 : 0);

    if (x === 0 && z === 0) {
      return new THREE.Vector3();
    }

    const move = new THREE.Vector3();
    const forward = new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    const right = new THREE.Vector3().crossVectors(forward, UP).normalize().negate();

    move.addScaledVector(forward, z);
    move.addScaledVector(right, x);

    return move.normalize();
  }

  /**
   * @param {number} delta - seconds
   * @param {THREE.Vector3} targetPosition - character/world follow point
   */
  update(delta, targetPosition) {
    if (!targetPosition) {
      throw new Error('ThirdPersonCamera.update(delta, targetPosition) requires targetPosition.');
    }

    const dt = Math.max(0.0001, delta || 0.016);

    this._pivot.copy(targetPosition).add(this.shoulderOffset);
    this._smoothedPivot.lerp(this._pivot, 1 - Math.exp(-this.stiffness * dt));

    this._rotationEuler.set(this.pitch, this.yaw, 0);
    this._desiredQuaternion.setFromEuler(this._rotationEuler);
    this._smoothedQuaternion.slerp(this._desiredQuaternion, 1 - Math.exp(-this.damping * dt));

    this._lookDirection.set(0, 0, 1).applyQuaternion(this._smoothedQuaternion).normalize();

    const unclampedArm = THREE.MathUtils.clamp(this.armLength, this.minArmLength, this.maxArmLength);
    const collisionSafeArm = this._resolveCollisionArmLength(this._smoothedPivot, this._lookDirection, unclampedArm);

    this._targetPosition.copy(this._smoothedPivot).addScaledVector(this._lookDirection, collisionSafeArm);

    const alpha = 1 - Math.exp(-this.stiffness * dt);
    this._currentPosition.lerp(this._targetPosition, alpha);
    this.camera.position.copy(this._currentPosition);

    this._tempVectorA.copy(this._smoothedPivot);
    this.camera.lookAt(this._tempVectorA);
  }

  dispose() {
    this.detachPointerLock();
  }

  _resolveCollisionArmLength(pivot, lookDirection, desiredArm) {
    const objects =
      typeof this.collisionQuery === 'function' ? this.collisionQuery() : this.collisionObjects;

    if (!objects || objects.length === 0) {
      return desiredArm;
    }

    const directionFromPivot = this._tempVectorB.copy(lookDirection).normalize();

    this._raycaster.set(pivot, directionFromPivot);
    this._raycaster.far = desiredArm;

    const intersections = this._raycaster.intersectObjects(objects, true);

    if (!intersections.length) {
      return desiredArm;
    }

    const collisionDistance = Math.max(this.minArmLength, intersections[0].distance - 0.08);
    return Math.min(desiredArm, collisionDistance);
  }

  _onMouseMove(event) {
    if (!this.pointerLocked) {
      return;
    }

    this.yaw -= event.movementX * this.mouseSensitivity;
    this.pitch -= event.movementY * this.mouseSensitivity;
    this.pitch = THREE.MathUtils.clamp(this.pitch, this.minPitch, this.maxPitch);
  }

  _onPointerLockChange() {
    if (typeof document === 'undefined') {
      this.pointerLocked = false;
      return;
    }

    this.pointerLocked = document.pointerLockElement === this.domElement;
  }
}

export default ThirdPersonCamera;
