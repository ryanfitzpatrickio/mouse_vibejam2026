import {
  MAX_ROPE_LENGTH,
  MAX_ROPE_SEGMENTS,
  MIN_ROPE_LENGTH,
  MIN_ROPE_SEGMENTS,
} from '../../../shared/ropes.js';
import { createSection, createRangeField, createNumberField } from '../ui/fields.js';

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
}
