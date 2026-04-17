import {
  createSection,
  createNumberField,
  createRangeField,
  styleField,
} from '../ui/fields.js';

const DEG_TO_RAD = Math.PI / 180;

export function installLightSection(editor) {
  const section = createSection(editor.panel, 'Light');
  editor.lightSection = section;

  editor.lightColorInput = document.createElement('input');
  editor.lightColorInput.type = 'color';
  styleField(editor.lightColorInput);
  editor.lightColorInput.addEventListener('input', () => {
    editor._updateSelected((light) => {
      light.color = editor.lightColorInput.value;
    }, { snapPosition: false, snapScale: false });
  });
  const colorWrap = document.createElement('label');
  colorWrap.textContent = 'Color';
  Object.assign(colorWrap.style, { display: 'grid', gap: '4px', color: '#d7c5a7' });
  colorWrap.appendChild(editor.lightColorInput);
  colorWrap.style.marginTop = '0';
  section.appendChild(colorWrap);
  editor.lightColorInput._wrap = colorWrap;

  editor.lightTypeSelect = document.createElement('select');
  styleField(editor.lightTypeSelect);
  editor.lightTypeSelect.style.marginTop = '8px';
  [
    ['point', 'Point'],
    ['spot', 'Spot'],
    ['directional', 'Directional'],
  ].forEach(([value, label]) => {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = label;
    editor.lightTypeSelect.appendChild(option);
  });
  editor.lightTypeSelect.addEventListener('change', () => {
    editor._updateSelected((light) => {
      light.lightType = editor.lightTypeSelect.value;
    }, { snapPosition: false, snapScale: false });
  });
  section.appendChild(editor.lightTypeSelect);

  editor.lightIntensityInput = createRangeField(section, 'Intensity', 0, 50, 0.1, (value) => {
    editor._updateSelected((light) => {
      light.intensity = value;
    }, { snapPosition: false, snapScale: false });
  });

  editor.lightDistanceInput = createNumberField(section, 'Distance', { step: 0.1, min: 0 }, (value) => {
    editor._updateSelected((light) => {
      light.distance = Math.max(0, value ?? 0);
    }, { snapPosition: false, snapScale: false });
  });

  editor.lightDecayInput = createNumberField(section, 'Decay', { step: 0.05, min: 0 }, (value) => {
    editor._updateSelected((light) => {
      light.decay = Math.max(0, value ?? 0);
    }, { snapPosition: false, snapScale: false });
  });

  editor.lightAngleInput = createRangeField(section, 'Cone Angle', 5, 85, 1, (value) => {
    editor._updateSelected((light) => {
      light.angle = value * DEG_TO_RAD;
    }, { snapPosition: false, snapScale: false });
  });

  editor.lightPenumbraInput = createRangeField(section, 'Penumbra', 0, 1, 0.01, (value) => {
    editor._updateSelected((light) => {
      light.penumbra = value;
    }, { snapPosition: false, snapScale: false });
  });
}
