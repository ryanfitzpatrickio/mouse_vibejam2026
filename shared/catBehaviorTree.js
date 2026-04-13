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
  /** Mice above the room floor, wall-holding, or airborne are targeted before floor mice. */
  offGroundTargetPriorityMinY: 0.28,
  /** Threat lead required before the cat switches from a valid current target (unused while chase lock is on). */
  threatSwitchMargin: 7,
  /** Chase-jump attempts allowed toward the current target before stopping vertical leaps (path + frustration only). */
  chaseJumpMaxAttempts: 3,
  /** Extra frustration per second when jump budget is spent but prey is still on a higher layer. */
  chaseJumpExhaustedFrustrationPerSecond: 2.85,
  threatCurrentTargetBonus: 6,
  threatDistanceWeight: 18,
  threatOffGroundBonus: 100,
  threatWallHoldBonus: 28,
  threatAirborneBonus: 18,
  threatElevatedPerMeter: 5,
  threatCheesePerPiece: 16,
  threatEmoteBonus: 14,
  threatLoudEmoteBonus: 12,
  threatSprintBonus: 5,
  threatSlideBonus: 4,
  threatLowHealthBonus: 3,
  chaseTargetRefresh: 0.55,
  /** Frustration (seconds of “stuck” weighted) before bored wander */
  frustrationMax: 1.05,
  /** Below this ground speed while chasing, count as pushing a wall */
  stuckSpeedThreshold: 0.52,
  /** `navSteerMove` failed — no valid path segment */
  pathFailFrustrationRate: 3.2,
  /** Path says move but we barely slide (collision vs nav) */
  stuckMoveFrustrationRate: 2.0,
  /** Sustained "trying to move but barely moving" before a physical recovery hop. */
  unstuckIntentSeconds: 0.36,
  unstuckCooldown: 1.15,
  unstuckDuration: 0.32,
  unstuckHopUpSpeed: 3.9,
  unstuckSideStepSpeed: 5.8,
  unstuckMinStepRatio: 0.18,
  unstuckMinStepDistance: 0.028,
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
  /** Melee/attack still require vertical overlap; hunt/chase uses vertical band + jump ascent. */
  requireVerticalStrikeOverlapForHunt: true,
  /** No aggro / chase fixation on mice hidden behind world collision (same ray test as melee). */
  requireLineOfSightForHunt: true,
  /** Max meters a mouse may be below the cat and still be hunted (e.g. lower floor). */
  maxPreyBelowForHunt: 3.0,
  /** If prey feet / nav layer are this much higher, chase may leap to the shared surface. */
  chaseElevateMinGap: 0.32,
  /** Next nav waypoint must be at least this much above us to commit to a jump. */
  chaseJumpMinWaypointRise: 0.12,
  /** Max horizontal distance to current steer waypoint to start a waypoint-led jump. */
  chaseJumpLaunchDistXZ: 1.55,
  /** Prep / jump when chase plateau + little motion under an elevated mouse (seconds). */
  chaseJumpPlateauStallSeconds: 0.28,
  chaseJumpPrepTime: 0.18,
  chaseJumpUpSpeed: 6.0,
  chaseJumpForwardSpeed: 4.8,
  chaseJumpMaxForwardSpeed: 10.5,
  chaseJumpMaxAirTime: 1.05,
  chaseSurfaceLeapMinCatY: 0.55,
  chaseSurfaceLeapMinGapXZ: 1.4,
  chaseSurfaceLeapMaxGapXZ: 8.5,
  chaseSurfaceLeapMaxDrop: 1.15,
  chaseSurfaceLeapMaxRise: 1.2,
  /** Prey walk layer this far below the cat → hop off ledge toward them (chase). */
  chaseDropMinGap: 0.36,
  /** Safety: do not auto-drop farther than this. */
  chaseDropMaxGap: 4.35,
  chaseDropMaxDistXZ: 9.5,
  chaseDropMinDistXZ: 0.22,
  chaseDropPrepTime: 0.15,
  /** Tiny upward kick to clear counter lips before gravity takes over. */
  chaseDropHopUpSpeed: 2.35,
  chaseDropForwardSpeed: 6.6,
  chaseDropAirTimeMin: 0.52,
  chaseDropAirTimeMax: 2.55,
  /** Let the cat fall through nav snapping briefly after leaving a ledge. */
  chaseDropIgnoreNavTime: 1.08,
  chaseDropCooldown: 1.05,
  /** With prey below, treat this plateau time + no nav move as “stuck on the ledge”. */
  chaseDropStuckPlateauSeconds: 0.2,
  chaseSurfaceLeapPathRatio: 1.7,
  chaseSurfaceLeapMinPathSaving: 2.0,
  chaseSurfaceLeapNoPathCooldown: 0.85,
  /** Extra air time scales with jump height (seconds, capped). */
  chaseJumpAirTimePerMeter: 0.2,
  chaseJumpMaxAirTimeExtra: 3.2,
  /** Clearance added when solving jump speed from navmesh target height. */
  chaseJumpHeightMargin: 0.28,
  /** Safety cap on upward launch speed (very tall nav still works up to this). */
  chaseJumpMaxVy: 26,
  chaseDesperateJumpCooldown: 2.6,
  /**
   * When no prey is in aggro, if the cat is this far above spawn floor it switches to patrol-home
   * so it does not sleep/wander on counters where players lose track of it.
   */
  catDescendAmbientAboveSpawn: 0.5,
  elevationSearchDuration: 2.2,
  elevationSearchHopUpSpeed: 5.4,
  elevationSearchHopLookTime: 0.45,
  elevationDropPrepTime: 0.16,
  elevationDropUpSpeed: 2.4,
  elevationDropForwardSpeed: 6.8,
  elevationDropIgnoreNavTime: 0.95,
  /** Chase / alert / roar give up when LOS stays blocked this long (seconds). */
  losBlockedGiveUpSeconds: 0.34,
  /**
   * Melee only if cat nav support Y under the cat matches nav surface Y near the mouse (m).
   * Prevents jump-strikes from below / mid-air; cat must land on the same walkable layer first.
   */
  sameNavSurfaceYTolerance: 0.42,
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
