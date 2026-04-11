/**
 * Cat ambient AI as a small behavior tree: a priority selector over routines.
 * Hunt / combat stay in predator.js; this file encodes "normal cat" life choices
 * and tuning constants shared with the simulator.
 *
 * Tree shape (conceptually):
 *   Selector
 *     ├─ [handled upstream] Hunt if prey in aggro range
 *     └─ Sequence: Life loop
 *           idle wait → random child: sleep | groom | play | patrol
 */

export const CAT_BT = Object.freeze({
  /** Another mouse must be this much closer (m) to steal aggro from current target */
  switchTargetAdvantage: 2.2,
  chaseTargetRefresh: 0.55,
  /** Frustration (seconds of “stuck” weighted) before bored wander */
  frustrationMax: 1.05,
  /** Below this ground speed while chasing, count as pushing a wall */
  stuckSpeedThreshold: 0.52,
  /** `navSteerMove` failed — no valid path segment */
  pathFailFrustrationRate: 3.2,
  /** Path says move but we barely slide (collision vs nav) */
  stuckMoveFrustrationRate: 2.0,
  /** Frustration per second when plateaued near best approach + low motion */
  plateauStallFrustrationRate: 2.4,
  /** Must be this far from prey (m) before plateau stall can build */
  chasePlateauMinDist: 0.58,
  /** Within this many meters of our best approach counts as “plateau” */
  chasePlateauSpan: 0.38,
  /** Seconds near plateau + slow before plateau frustration applies */
  chasePlateauGrace: 0.42,
  boredWanderMin: 3.5,
  boredWanderMax: 6.5,
  playPatrolRadiusScale: 0.55,
  /**
   * Cat only cares about mice whose vertical capsule overlaps its own (same as melee hit test).
   * Prevents hunting across floors / counters where height never lines up.
   */
  requireVerticalStrikeOverlapForHunt: true,
  /** No aggro / chase fixation on mice hidden behind world collision (same ray test as melee). */
  requireLineOfSightForHunt: true,
  /** Chase / alert / roar give up when LOS stays blocked this long (seconds). */
  losBlockedGiveUpSeconds: 0.34,
});

/** @returns {{ state: string, timer: number }} */
export function selectRoutineAfterIdle() {
  const r = Math.random();
  if (r < 0.2) {
    return { state: 'sleep', timer: 3.2 + Math.random() * 5 };
  }
  if (r < 0.45) {
    return { state: 'groom', timer: 2 + Math.random() * 3.5 };
  }
  if (r < 0.72) {
    return { state: 'play', timer: 1.6 + Math.random() * 2.4 };
  }
  return { state: 'patrol', timer: 0 };
}

export function initialIdleDelay() {
  return 0.7 + Math.random() * 1.6;
}
