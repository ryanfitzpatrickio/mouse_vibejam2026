import * as THREE from 'three/webgpu';

export class UprightCapsuleCollider {
  constructor({
    radius = 0.22,
    height = 0.78,
    groundSnapDistance = 0.18,
  } = {}) {
    this.radius = radius;
    this.height = Math.max(height, radius * 2);
    this.groundSnapDistance = groundSnapDistance;
    this.position = new THREE.Vector3();
    this._expandedBox = new THREE.Box3();
  }

  setPosition(position) {
    this.position.copy(position);
  }

  getSupportHeight(colliders = [], baseGroundY = 0) {
    let supportY = baseGroundY;

    for (const collider of colliders) {
      const box = collider?.aabb;
      if (!box) continue;

      const isSurface = collider.type === 'surface' || collider.metadata?.runnable;
      if (!isSurface) continue;

      const withinX = this.position.x >= box.min.x - this.radius
        && this.position.x <= box.max.x + this.radius;
      const withinZ = this.position.z >= box.min.z - this.radius
        && this.position.z <= box.max.z + this.radius;

      if (!withinX || !withinZ) continue;

      const surfaceY = box.max.y;
      if (this.position.y >= surfaceY - this.groundSnapDistance) {
        supportY = Math.max(supportY, surfaceY);
      }
    }

    return supportY;
  }

  resolveAgainstBox(box, velocity = null) {
    const capsuleMinY = this.position.y;
    const capsuleMaxY = this.position.y + this.height;

    if (capsuleMaxY < box.min.y || capsuleMinY > box.max.y) {
      return false;
    }

    const expandedMinX = box.min.x - this.radius;
    const expandedMaxX = box.max.x + this.radius;
    const expandedMinZ = box.min.z - this.radius;
    const expandedMaxZ = box.max.z + this.radius;

    const insideX = this.position.x >= expandedMinX && this.position.x <= expandedMaxX;
    const insideZ = this.position.z >= expandedMinZ && this.position.z <= expandedMaxZ;

    if (!insideX || !insideZ) {
      return false;
    }

    this._expandedBox.min.set(expandedMinX, box.min.y, expandedMinZ);
    this._expandedBox.max.set(expandedMaxX, box.max.y, expandedMaxZ);

    const distLeft = this.position.x - this._expandedBox.min.x;
    const distRight = this._expandedBox.max.x - this.position.x;
    const distBack = this.position.z - this._expandedBox.min.z;
    const distFront = this._expandedBox.max.z - this.position.z;

    const minDist = Math.min(distLeft, distRight, distBack, distFront);

    if (minDist === distLeft) {
      this.position.x = this._expandedBox.min.x;
      if (velocity) velocity.x = Math.min(velocity.x, 0);
    } else if (minDist === distRight) {
      this.position.x = this._expandedBox.max.x;
      if (velocity) velocity.x = Math.max(velocity.x, 0);
    } else if (minDist === distBack) {
      this.position.z = this._expandedBox.min.z;
      if (velocity) velocity.z = Math.min(velocity.z, 0);
    } else {
      this.position.z = this._expandedBox.max.z;
      if (velocity) velocity.z = Math.max(velocity.z, 0);
    }

    return true;
  }
}
