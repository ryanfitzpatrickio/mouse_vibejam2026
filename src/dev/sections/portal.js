import { VIBE_PORTAL_TYPES, normalizeVibePortalType } from '../../../shared/vibePortal.js';
import { createSection, createRangeField, styleField } from '../ui/fields.js';

export function installPortalSection(editor) {
  const section = createSection(editor.panel, 'Portal');
  editor.portalSection = section;

  const typeWrap = document.createElement('label');
  typeWrap.textContent = 'Portal Type';
  Object.assign(typeWrap.style, {
    display: 'grid',
    gap: '4px',
    color: '#d7c5a7',
  });
  editor.portalTypeSelect = document.createElement('select');
  styleField(editor.portalTypeSelect);
  [
    [VIBE_PORTAL_TYPES.EXIT, 'Vibe Jam Exit'],
    [VIBE_PORTAL_TYPES.RETURN, 'Return / Start'],
  ].forEach(([value, label]) => {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = label;
    editor.portalTypeSelect.appendChild(option);
  });
  editor.portalTypeSelect.addEventListener('change', () => {
    editor._updateSelected((portal) => {
      portal.portalType = normalizeVibePortalType(editor.portalTypeSelect.value);
      portal.name = portal.portalType === VIBE_PORTAL_TYPES.RETURN ? 'Return Portal' : 'Vibe Jam Portal';
    }, { snapPosition: false, snapScale: false });
  });
  typeWrap.appendChild(editor.portalTypeSelect);
  section.appendChild(typeWrap);

  editor.portalTriggerRadiusInput = createRangeField(section, 'Trigger Radius', 0.25, 3, 0.05, (value) => {
    editor._updateSelected((portal) => {
      portal.triggerRadius = value;
    }, { snapPosition: false, snapScale: false });
  });
}
