import * as THREE from 'three';

export function createOutlineMaterial({ color = '#000000' } = {}) {
  const material = new THREE.MeshBasicMaterial({
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

export function createOutlineGroup(sourceRoot, { scale = 1.05, color = '#000000' } = {}) {
  const outlineRoot = new THREE.Group();
  outlineRoot.name = `${sourceRoot.name || 'root'}_outlineGroup`;

  sourceRoot.updateMatrixWorld(true);

  sourceRoot.traverse((child) => {
    if (!child.isMesh) return;

    const outlineMesh = createOutlineMesh(child, { scale, color });
    outlineMesh.matrixAutoUpdate = true;
    outlineMesh.position.copy(child.position);
    outlineMesh.quaternion.copy(child.quaternion);
    outlineMesh.scale.copy(child.scale).multiplyScalar(scale);

    if (child.parent === sourceRoot) {
      outlineRoot.add(outlineMesh);
      return;
    }

    let targetParent = outlineRoot;
    const path = [];
    let current = child.parent;

    while (current && current !== sourceRoot) {
      path.push(current);
      current = current.parent;
    }

    for (let i = path.length - 1; i >= 0; i -= 1) {
      const group = new THREE.Group();
      group.name = `${path[i].name || 'group'}_outline`;
      targetParent.add(group);
      targetParent = group;
    }

    targetParent.add(outlineMesh);
  });

  return outlineRoot;
}
