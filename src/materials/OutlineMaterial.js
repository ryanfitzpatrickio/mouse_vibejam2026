import * as THREE from 'three/webgpu';

export function createOutlineMaterial({ color = '#000000' } = {}) {
  const material = new THREE.MeshBasicNodeMaterial({
    color: new THREE.Color(color),
    side: THREE.BackSide,
  });

  material.name = 'InvertedHullOutlineMaterial';
  return material;
}

export function createOutlineMesh(sourceMesh, { scale = 1.05, color = '#000000' } = {}) {
  const outlineMesh = sourceMesh.clone();
  outlineMesh.material = createOutlineMaterial({ color });
  outlineMesh.scale.multiplyScalar(scale);
  outlineMesh.name = `${sourceMesh.name || 'mesh'}_outline`;
  return outlineMesh;
}
