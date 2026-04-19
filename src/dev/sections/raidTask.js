import { RAID_TASK_TYPES, RAID_TASK_TYPE_LABELS } from '../../../shared/raidLayout.js';
import { createSection, styleField } from '../ui/fields.js';

export function installRaidTaskSection(editor) {
  const section = createSection(editor.panel, 'Tasks');
  editor.raidTaskSection = section;

  const typeWrap = document.createElement('label');
  typeWrap.textContent = 'Task type';
  Object.assign(typeWrap.style, {
    display: 'grid',
    gap: '4px',
    color: '#d7c5a7',
  });
  editor.raidTaskTypeSelect = document.createElement('select');
  styleField(editor.raidTaskTypeSelect);
  Object.values(RAID_TASK_TYPES).forEach((value) => {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = RAID_TASK_TYPE_LABELS[value] ?? value;
    editor.raidTaskTypeSelect.appendChild(option);
  });
  editor.raidTaskTypeSelect.addEventListener('change', () => {
    editor._updateSelected((task) => {
      task.taskType = editor.raidTaskTypeSelect.value;
    }, { snapPosition: false, snapScale: false });
  });
  typeWrap.appendChild(editor.raidTaskTypeSelect);
  section.appendChild(typeWrap);
}
