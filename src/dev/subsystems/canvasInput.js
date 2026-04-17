import { resolveEditableHitObject, editableIdFromObject, hideProbe } from './probeVisuals.js';

export function bindCanvasEvents(editor) {
  const canvas = editor.app.renderer.domElement;

  canvas.addEventListener('pointermove', (event) => {
    editor.pointerInsideCanvas = true;
    const rect = canvas.getBoundingClientRect();
    editor.pointerNdc.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    editor.pointerNdc.y = -(((event.clientY - rect.top) / rect.height) * 2 - 1);
    editor.pointerScreen.x = event.clientX;
    editor.pointerScreen.y = event.clientY;
  });

  canvas.addEventListener('pointerleave', () => {
    editor.pointerInsideCanvas = false;
    hideProbe(editor);
  });

  canvas.addEventListener('dblclick', (event) => {
    if (!editor.visible) return;
    event.preventDefault();
    const hitObject = resolveEditableHitObject(editor.currentHit?.object);
    const editableId = editableIdFromObject(hitObject);
    if (!editableId) return;
    editor.selectedId = editableId;
    editor._syncForm();
    editor._setStatus(`Selected ${hitObject.name || 'object'}.`);
  });
}
