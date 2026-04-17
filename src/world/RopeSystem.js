import * as THREE from 'three';
import {
  DEFAULT_ROPE_COLOR,
  ROPE_SEGMENT_RADIUS,
} from '../../shared/ropes.js';

/**
 * Renders server-authoritative ropes as a tube along segment positions.
 * Style (radius, color, optional atlas texture) comes from layout merged by id.
 */
export class RopeSystem extends THREE.Group {
  constructor({ resolveTexture = null } = {}) {
    super();
    this.name = 'RopeSystem';
    this._resolveTexture = typeof resolveTexture === 'function' ? resolveTexture : null;
    /** @type {Map<string, { group: THREE.Group, mesh: THREE.Mesh, material: THREE.MeshStandardMaterial, styleKey: string }>} */
    this._entries = new Map();
  }

  /**
   * @param {{ id: string, segments: { x: number, y: number, z: number }[] }[]} ropesSnapshot
   * @param {Map<string, { segmentRadius?: number, color?: string, texture?: { atlas: string, cell: number } | null }>} [styleById]
   */
  update(ropesSnapshot, styleById) {
    if (!Array.isArray(ropesSnapshot)) return;
    const styles = styleById instanceof Map ? styleById : new Map();
    const seen = new Set();

    for (const rope of ropesSnapshot) {
      if (!rope?.id || !Array.isArray(rope.segments) || rope.segments.length < 2) continue;
      seen.add(rope.id);

      const st = styles.get(rope.id) ?? {};
      const segmentRadius = Number.isFinite(st.segmentRadius) ? st.segmentRadius : ROPE_SEGMENT_RADIUS;
      const color = typeof st.color === 'string' ? st.color : DEFAULT_ROPE_COLOR;
      const tex = st.texture && Number.isFinite(st.texture.cell)
        ? st.texture
        : null;
      const styleKey = `${segmentRadius}|${color}|${tex ? `${tex.atlas}:${tex.cell}` : 'none'}`;

      let entry = this._entries.get(rope.id);
      if (!entry) {
        const group = new THREE.Group();
        group.name = `rope-visual-${rope.id}`;
        this.add(group);
        entry = { group, mesh: null, material: null, styleKey: '' };
        this._entries.set(rope.id, entry);
      }

      if (!entry.material || entry.styleKey !== styleKey) {
        if (entry.material) entry.material.dispose();
        const map = tex && this._resolveTexture
          ? this._resolveTexture(tex.atlas, tex.cell)
          : null;
        entry.material = new THREE.MeshStandardMaterial({
          color: map ? 0xffffff : new THREE.Color(color),
          map: map ?? null,
          roughness: map ? 0.7 : 0.52,
          metalness: 0.05,
        });
        entry.material.side = THREE.DoubleSide;
        entry.styleKey = styleKey;
      }

      const pts = rope.segments.map((s) => new THREE.Vector3(s.x, s.y, s.z));
      let curve;
      if (pts.length === 2) {
        curve = new THREE.LineCurve3(pts[0], pts[1]);
      } else {
        curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
      }

      const tubularSegments = Math.max(16, (pts.length - 1) * 10);
      const radialSegments = 6;

      if (entry.mesh) {
        entry.mesh.geometry.dispose();
        entry.group.remove(entry.mesh);
      }

      const geometry = new THREE.TubeGeometry(
        curve,
        tubularSegments,
        segmentRadius,
        radialSegments,
        false,
      );
      const mesh = new THREE.Mesh(geometry, entry.material);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.frustumCulled = false;
      entry.group.add(mesh);
      entry.mesh = mesh;
    }

    for (const id of [...this._entries.keys()]) {
      if (seen.has(id)) continue;
      const entry = this._entries.get(id);
      if (entry?.mesh) entry.mesh.geometry.dispose();
      if (entry?.material) entry.material.dispose();
      this.remove(entry.group);
      this._entries.delete(id);
    }
  }

  dispose() {
    for (const entry of this._entries.values()) {
      entry.mesh?.geometry?.dispose();
      entry.material?.dispose();
    }
    this._entries.clear();
  }
}
