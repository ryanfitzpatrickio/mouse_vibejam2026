import * as THREE from 'three';

/**
 * Renders server-authoritative ropes as a simple line strip per rope.
 * Segment positions come from `net.ropes` snapshots each frame.
 */
export class RopeSystem extends THREE.Group {
  constructor() {
    super();
    this.name = 'RopeSystem';
    this._lines = new Map();
    this._material = new THREE.LineBasicMaterial({ color: 0xc48a4a });
  }

  update(ropes) {
    if (!Array.isArray(ropes)) return;
    const seen = new Set();
    for (const rope of ropes) {
      if (!rope?.id || !Array.isArray(rope.segments) || rope.segments.length < 2) continue;
      seen.add(rope.id);
      let line = this._lines.get(rope.id);
      if (!line) {
        const geometry = new THREE.BufferGeometry();
        const positions = new Float32Array(rope.segments.length * 3);
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        line = new THREE.Line(geometry, this._material);
        line.frustumCulled = false;
        this.add(line);
        this._lines.set(rope.id, line);
      }
      const attr = line.geometry.getAttribute('position');
      if (attr.count !== rope.segments.length) {
        const next = new Float32Array(rope.segments.length * 3);
        line.geometry.setAttribute('position', new THREE.BufferAttribute(next, 3));
      }
      const arr = line.geometry.getAttribute('position').array;
      for (let i = 0; i < rope.segments.length; i += 1) {
        const s = rope.segments[i];
        arr[i * 3] = s.x;
        arr[i * 3 + 1] = s.y;
        arr[i * 3 + 2] = s.z;
      }
      line.geometry.getAttribute('position').needsUpdate = true;
      line.geometry.computeBoundingSphere();
    }
    for (const id of [...this._lines.keys()]) {
      if (!seen.has(id)) {
        const line = this._lines.get(id);
        this.remove(line);
        line.geometry.dispose();
        this._lines.delete(id);
      }
    }
  }

  dispose() {
    for (const line of this._lines.values()) {
      this.remove(line);
      line.geometry.dispose();
    }
    this._lines.clear();
    this._material.dispose();
  }
}
