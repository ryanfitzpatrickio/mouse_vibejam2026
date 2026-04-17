import { createSection, createRangeField } from '../ui/fields.js';

export function installExtractionSection(editor) {
  const section = createSection(editor.panel, 'Extraction hole');
  editor.extractionSection = section;

  editor.extractionRadiusInput = createRangeField(section, 'Radius', 0.35, 4, 0.05, (value) => {
    editor._updateSelected((ep) => {
      ep.radius = value;
    }, { snapPosition: false, snapScale: false });
  });
}
