import {
  MAX_ROPE_LENGTH,
  MAX_ROPE_SEGMENTS,
  MAX_SEGMENT_RADIUS,
  MIN_ROPE_LENGTH,
  MIN_ROPE_SEGMENTS,
  MIN_SEGMENT_RADIUS,
} from '../../../shared/ropes.js';
import { createSection, createRangeField, createNumberField, styleField, addInlineButton } from '../ui/fields.js';

const THICKNESS_MIN = MIN_SEGMENT_RADIUS * 2;
const THICKNESS_MAX = MAX_SEGMENT_RADIUS * 2;

export function installRopeSection(editor) {
  const section = createSection(editor.panel, 'Rope');
  editor.ropeSection = section;

  editor.ropeLengthInput = createRangeField(section, 'Length', MIN_ROPE_LENGTH, MAX_ROPE_LENGTH, 0.05, (value) => {
    editor._updateSelected((rope) => {
      rope.length = value;
    }, { snapPosition: false, snapScale: false });
  });

  editor.ropeSegmentsInput = createNumberField(section, 'Segments', {
    min: MIN_ROPE_SEGMENTS,
    max: MAX_ROPE_SEGMENTS,
    step: 1,
  }, (value) => {
    editor._updateSelected((rope) => {
      rope.segmentCount = Math.round(value);
    }, { snapPosition: false, snapScale: false });
  });

  editor.ropeThicknessInput = createRangeField(
    section,
    'Thickness (diameter)',
    THICKNESS_MIN,
    THICKNESS_MAX,
    0.005,
    (value) => {
      editor._updateSelected((rope) => {
        rope.segmentRadius = value * 0.5;
      }, { snapPosition: false, snapScale: false });
    },
  );

  const colorWrap = document.createElement('label');
  colorWrap.textContent = 'Color';
  Object.assign(colorWrap.style, {
    display: 'grid',
    gap: '4px',
    color: '#d7c5a7',
    marginTop: '8px',
  });
  editor.ropeColorInput = document.createElement('input');
  editor.ropeColorInput.type = 'color';
  Object.assign(editor.ropeColorInput.style, {
    width: '100%',
    height: '32px',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
  });
  editor.ropeColorInput.addEventListener('input', () => {
    editor._updateSelected((rope) => {
      rope.color = editor.ropeColorInput.value;
    }, { snapPosition: false, snapScale: false });
  });
  colorWrap.appendChild(editor.ropeColorInput);
  section.appendChild(colorWrap);

  const texWrap = document.createElement('div');
  texWrap.textContent = 'Strand texture (optional)';
  Object.assign(texWrap.style, {
    color: '#d7c5a7',
    marginTop: '8px',
    fontSize: '11px',
  });
  section.appendChild(texWrap);

  const atlasLabel = document.createElement('label');
  atlasLabel.textContent = 'Atlas';
  Object.assign(atlasLabel.style, {
    display: 'grid',
    gap: '4px',
    color: '#d7c5a7',
    marginTop: '4px',
  });
  editor.ropeTextureAtlasSelect = document.createElement('select');
  styleField(editor.ropeTextureAtlasSelect);
  (editor.textureAtlases ?? []).forEach((atlas) => {
    const option = document.createElement('option');
    option.value = atlas.id;
    option.textContent = atlas.label;
    editor.ropeTextureAtlasSelect.appendChild(option);
  });
  editor.ropeTextureAtlasSelect.addEventListener('change', () => {
    editor._syncRopeTextureFromFields();
  });
  atlasLabel.appendChild(editor.ropeTextureAtlasSelect);
  section.appendChild(atlasLabel);

  editor.ropeTextureCellInput = createNumberField(section, 'Texture cell', {
    min: 0,
    max: 999,
    step: 1,
  }, () => {
    editor._syncRopeTextureFromFields();
  });

  addInlineButton(section, 'Clear texture', () => {
    editor.ropeTextureCellInput.value = '';
    editor._syncRopeTextureFromFields();
  }, '#3a3028');
}
