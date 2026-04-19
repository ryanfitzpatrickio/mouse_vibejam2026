import { clamp } from '../editorShared.js';
import {
  createSection,
  createNumberField,
  createRangeField,
  createVector2Inputs,
  styleField,
} from '../ui/fields.js';

const DEG_TO_RAD = Math.PI / 180;

export function installMaterialSection(editor) {
  const section = createSection(editor.panel, 'Surface');
  editor.surfaceSection = section;

  const grid = document.createElement('div');
  Object.assign(grid.style, {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
    gap: '8px',
  });
  section.appendChild(grid);

  editor.textureCellInput = createNumberField(grid, 'Texture Cell', {
    step: 1,
    min: 0,
    max: (editor._activeTextureAtlas().manifest?.cells?.length ?? 100) - 1,
  }, (value) => {
    editor._updateSelected((primitive) => {
      primitive.texture.cell = Number.isFinite(value)
        ? clamp(Math.round(value), 0, (editor._activeTextureAtlas().manifest?.cells?.length ?? 100) - 1)
        : null;
      primitive.texture.atlas = editor.activeTextureAtlasId;
    });
    editor._highlightPalette();
  });

  editor.colorInput = document.createElement('input');
  editor.colorInput.type = 'color';
  styleField(editor.colorInput);
  editor.colorInput.addEventListener('input', () => {
    editor._updateSelected((primitive) => {
      primitive.material.color = editor.colorInput.value;
    });
  });
  const colorWrap = document.createElement('label');
  colorWrap.textContent = 'Tint';
  Object.assign(colorWrap.style, { display: 'grid', gap: '4px', color: '#d7c5a7' });
  colorWrap.appendChild(editor.colorInput);
  grid.appendChild(colorWrap);

  editor.repeatInputs = createVector2Inputs(section, 'Texture Repeat', { step: 0.1, min: 0.1 }, (axis, value) => {
    editor._updateSelected((primitive) => {
      primitive.texture.repeat[axis] = Math.max(0.1, value);
    });
  });

  editor.textureRotationInput = createNumberField(section, 'Texture Rotation', {
    step: 1,
  }, (value) => {
    editor._updateSelected((primitive) => {
      primitive.texture.rotation = value * DEG_TO_RAD;
    });
  });

  editor.chromaSimilarityInput = createRangeField(section, 'Chroma Similarity', 0, 1, 0.01, (value) => {
    editor._updateSelected((primitive) => {
      primitive.chroma = primitive.chroma ?? {};
      primitive.chroma.similarity = value;
    });
  });

  editor.chromaFeatherInput = createRangeField(section, 'Chroma Feather', 0, 1, 0.01, (value) => {
    editor._updateSelected((primitive) => {
      primitive.chroma = primitive.chroma ?? {};
      primitive.chroma.feather = value;
    });
  });

  editor.roughnessInput = createRangeField(section, 'Roughness', 0, 1, 0.01, (value) => {
    editor._updateSelected((primitive) => {
      primitive.material.roughness = value;
    });
  });

  editor.metalnessInput = createRangeField(section, 'Metalness', 0, 1, 0.01, (value) => {
    editor._updateSelected((primitive) => {
      primitive.material.metalness = value;
    });
  });
}
