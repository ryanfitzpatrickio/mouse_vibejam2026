import { createSection } from '../ui/fields.js';

export function installPaletteSection(editor) {
  const section = createSection(editor.panel, 'Texture Palette');

  editor.textureAtlasTabs = document.createElement('div');
  Object.assign(editor.textureAtlasTabs.style, {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '6px',
    marginBottom: '8px',
  });
  section.appendChild(editor.textureAtlasTabs);

  editor.paletteGrid = document.createElement('div');
  Object.assign(editor.paletteGrid.style, {
    display: 'grid',
    gridTemplateColumns: 'repeat(5, minmax(0, 1fr))',
    gap: '6px',
  });
  section.appendChild(editor.paletteGrid);
}
