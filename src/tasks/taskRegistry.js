import { RAID_TASK_TYPES } from '../../shared/raidLayout.js';
import { UNLOCK_HERO_DEFS } from '../../shared/heroUnlocks.js';
import { openChewWiresTask } from './ChewWiresTask.jsx';
import { openHeroUnlockTask } from './HeroUnlockTask.jsx';
import { SmokeSparksEffect } from './SmokeSparksEffect.js';

/**
 * Map a raid-task type to a runtime handler that opens a minigame dialog.
 * Keep each task modular: register a new one by adding a type in raidLayout.js
 * and an entry here. Handlers receive { onComplete, onCancel } and return
 * `{ close() }` so callers can force-close on disconnect/cancel.
 */
export const TASK_RUNTIMES = Object.freeze({
  [RAID_TASK_TYPES.CHEW_WIRES]: {
    id: RAID_TASK_TYPES.CHEW_WIRES,
    label: 'Chew Wires',
    promptVerb: 'chew wires',
    rewardAmount: 8,
    open: openChewWiresTask,
    onCompleteEffect: (scene, worldPos) => new SmokeSparksEffect(scene, worldPos),
  },
  [RAID_TASK_TYPES.UNLOCK_GUS]: {
    id: RAID_TASK_TYPES.UNLOCK_GUS,
    label: 'Unlock Gus',
    promptVerb: `give 3 ${UNLOCK_HERO_DEFS.gus.itemShortPlural} to ${UNLOCK_HERO_DEFS.gus.label}`,
    rewardAmount: 0,
    unlockHeroKey: 'gus',
    open: openHeroUnlockTask('gus'),
  },
  [RAID_TASK_TYPES.UNLOCK_SPEEDY]: {
    id: RAID_TASK_TYPES.UNLOCK_SPEEDY,
    label: 'Unlock Speedy',
    promptVerb: `give 3 ${UNLOCK_HERO_DEFS.speedy.itemShortPlural} to ${UNLOCK_HERO_DEFS.speedy.label}`,
    rewardAmount: 0,
    unlockHeroKey: 'speedy',
    open: openHeroUnlockTask('speedy'),
  },
});

export function getTaskRuntime(taskType) {
  return TASK_RUNTIMES[taskType] ?? null;
}
