import * as THREE from 'three';

export function installProbeVisuals(editor) {
  const positions = new Float32Array(6);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const material = new THREE.LineBasicMaterial({
    color: '#ffdf8a',
    transparent: true,
    opacity: 0.9,
  });
  editor.pointerLine = new THREE.Line(geometry, material);
  editor.pointerLine.visible = false;
  editor.pointerLine.renderOrder = 999;
  editor.pointerLine.userData.editorHelper = true;
  editor.app.scene.add(editor.pointerLine);

  editor.hitTooltip = document.createElement('div');
  Object.assign(editor.hitTooltip.style, {
    position: 'fixed',
    zIndex: '141',
    pointerEvents: 'none',
    padding: '6px 8px',
    borderRadius: '8px',
    background: 'rgba(12, 10, 9, 0.9)',
    color: '#fff6ec',
    border: '1px solid rgba(255,255,255,0.12)',
    fontFamily: 'monospace',
    fontSize: '11px',
    whiteSpace: 'pre',
    display: 'none',
  });
  document.body.appendChild(editor.hitTooltip);
}

export function resolveEditableHitObject(object) {
  let current = object ?? null;
  while (
    current
    && !current.userData?.primitiveId
    && !current.userData?.prefabInstanceId
    && !current.userData?.lightId
    && !current.userData?.portalId
    && !current.userData?.ropeId
  ) {
    current = current.parent;
  }
  return current;
}

export function editableIdFromObject(object) {
  return object?.userData?.primitiveId
    ?? object?.userData?.prefabInstanceId
    ?? object?.userData?.lightId
    ?? object?.userData?.portalId
    ?? object?.userData?.ropeId
    ?? null;
}

export function updateProbe(editor) {
  if (!editor.pointerInsideCanvas) {
    hideProbe(editor);
    return;
  }

  editor.raycaster.setFromCamera(editor.pointerNdc, editor.app.camera);
  const hits = editor.raycaster.intersectObjects(editor.app.scene.children, true)
    .filter((hit) => hit.object?.visible !== false && hit.object?.userData?.editorHelper !== true);

  const hit = hits[0] ?? null;
  editor.currentHit = hit;
  if (!hit) {
    hideProbe(editor);
    return;
  }

  const position = editor.pointerLine.geometry.attributes.position;
  position.setXYZ(0, editor.app.camera.position.x, editor.app.camera.position.y, editor.app.camera.position.z);
  position.setXYZ(1, hit.point.x, hit.point.y, hit.point.z);
  position.needsUpdate = true;
  editor.pointerLine.visible = true;

  const hitObject = resolveEditableHitObject(hit.object);
  const editableId = editableIdFromObject(hitObject);
  const primitive = editableId
    ? editor.layout.primitives.find((entry) => entry.id === editableId)
    : null;
  const light = editableId
    ? (editor.layout.lights ?? []).find((entry) => entry.id === editableId)
    : null;
  const portal = editableId
    ? (editor.layout.portals ?? []).find((entry) => entry.id === editableId)
    : null;
  const rope = editableId
    ? (editor.layout.ropes ?? []).find((entry) => entry.id === editableId)
    : null;
  const gridCell = editor._getGridCellFromPoint(hit.point);
  editor.hitTooltip.style.display = 'block';
  editor.hitTooltip.style.left = `${editor.pointerScreen.x + 14}px`;
  editor.hitTooltip.style.top = `${editor.pointerScreen.y + 14}px`;
  editor.hitTooltip.textContent = [
    hitObject?.name || hit.object.name || 'unnamed',
    gridCell ? `grid ${gridCell.col + 1}, ${gridCell.row + 1}` : '',
    primitive ? `cell ${primitive.texture.cell ?? 'none'}` : '',
    light ? `${light.lightType} light` : '',
    portal ? `${portal.portalType} portal` : '',
    rope ? `rope (${rope.segmentCount} seg · ${rope.length.toFixed(2)}m)` : '',
    `x ${hit.point.x.toFixed(2)} y ${hit.point.y.toFixed(2)} z ${hit.point.z.toFixed(2)}`,
  ].filter(Boolean).join('\n');
}

export function hideProbe(editor) {
  editor.currentHit = null;
  if (editor.pointerLine) {
    editor.pointerLine.visible = false;
  }
  if (editor.hitTooltip) {
    editor.hitTooltip.style.display = 'none';
  }
}
