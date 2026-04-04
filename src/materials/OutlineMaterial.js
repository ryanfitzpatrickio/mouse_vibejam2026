import * as THREE from 'three';

export function createOutlineMaterial({
  color = '#000000',
  skinning = false,
  morphTargets = false,
  morphNormals = false,
} = {}) {
  const material = new THREE.MeshBasicMaterial({
    color: new THREE.Color(color),
    side: THREE.BackSide,
    depthWrite: false,
    toneMapped: false,
  });

  material.skinning = skinning;
  material.morphTargets = morphTargets;
  material.morphNormals = morphNormals;
  material.name = 'InvertedHullOutlineMaterial';
  return material;
}

export function createOutlineMesh(sourceMesh, { scale = 1.05, color = '#000000' } = {}) {
  let outlineMesh;

  if (sourceMesh.isSkinnedMesh) {
    outlineMesh = new THREE.SkinnedMesh(sourceMesh.geometry, createOutlineMaterial({
      color,
      skinning: true,
      morphTargets: sourceMesh.morphTargetInfluences != null,
      morphNormals: sourceMesh.morphTargetInfluences != null,
    }));
    outlineMesh.bind(sourceMesh.skeleton, sourceMesh.bindMatrix);
    outlineMesh.bindMode = sourceMesh.bindMode;
    outlineMesh.morphTargetInfluences = sourceMesh.morphTargetInfluences?.slice?.() ?? sourceMesh.morphTargetInfluences ?? null;
    outlineMesh.morphTargetDictionary = sourceMesh.morphTargetDictionary ?? null;
  } else {
    outlineMesh = new THREE.Mesh(sourceMesh.geometry, createOutlineMaterial({ color }));
  }

  outlineMesh.scale.multiplyScalar(scale);
  outlineMesh.name = `${sourceMesh.name || 'mesh'}_outline`;
  outlineMesh.position.copy(sourceMesh.position);
  outlineMesh.quaternion.copy(sourceMesh.quaternion);
  outlineMesh.rotation.order = sourceMesh.rotation.order;
  outlineMesh.castShadow = false;
  outlineMesh.receiveShadow = false;
  outlineMesh.frustumCulled = false;
  outlineMesh.userData.skipOutline = true;
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

export function attachEdgeOutlines(sourceRoot, {
  color = '#000000',
  thresholdAngle = 28,
  opacity = 0.95,
  skinnedScale = 1.035,
} = {}) {
  const outlineMaterial = new THREE.LineBasicMaterial({
    color: new THREE.Color(color),
    transparent: opacity < 1,
    opacity,
    depthWrite: false,
    toneMapped: false,
  });

  const outlinedMeshes = [];

  sourceRoot.traverse((child) => {
    if (!child.isMesh || !child.geometry || child.userData?.skipOutline || child.userData?.edgeOutlineAttached) {
      return;
    }

    if (child.isSkinnedMesh) {
      const outline = createOutlineMesh(child, { scale: skinnedScale, color });
      outline.renderOrder = 3;
      outline.frustumCulled = false;
      outline.userData.skipOutline = true;
      outline.userData.outlineSource = child;
      outline.userData.editorHelper = child.userData?.editorHelper === true;
      if (child.parent) {
        child.parent.add(outline);
      } else {
        child.add(outline);
      }
      child.userData.edgeOutlineAttached = true;
      outlinedMeshes.push(outline);
      return;
    }

    const outline = new THREE.LineSegments(
      new THREE.EdgesGeometry(child.geometry, thresholdAngle),
      outlineMaterial.clone(),
    );
    outline.name = `${child.name || 'mesh'}_edgeOutline`;
    outline.renderOrder = 4;
    outline.frustumCulled = false;
    outline.userData.skipOutline = true;
    outline.userData.editorHelper = child.userData?.editorHelper === true;
    child.add(outline);
    child.userData.edgeOutlineAttached = true;
    outlinedMeshes.push(outline);
  });

  return outlinedMeshes;
}
