/**
 * Shared definitions for collection-based hero unlocks.
 * Used by both the client (rendering, dialog copy) and the server (scatter,
 * pickup validation, claim).
 */

export const UNLOCK_HERO_DEFS = Object.freeze({
  gus: Object.freeze({
    heroKey: 'gus',
    label: 'Gus',
    itemPlural: 'sewing treasures',
    itemShortPlural: 'treasures',
    collectibleKind: 'sewing',
    scatterCount: 8,
    requiredCount: 3,
  }),
  speedy: Object.freeze({
    heroKey: 'speedy',
    label: 'Speedy',
    itemPlural: 'speed tokens',
    itemShortPlural: 'tokens',
    collectibleKind: 'speed',
    scatterCount: 8,
    requiredCount: 3,
  }),
});

export const UNLOCK_HERO_KEYS = Object.freeze(Object.keys(UNLOCK_HERO_DEFS));

export function getUnlockHeroDef(heroKey) {
  return UNLOCK_HERO_DEFS[heroKey] ?? null;
}

/** Collectible kinds scattered in the world, keyed by unlock hero. */
export const COLLECTIBLE_KIND_BY_HERO = Object.freeze({
  gus: 'sewing',
  speedy: 'speed',
});

export const HERO_BY_COLLECTIBLE_KIND = Object.freeze({
  sewing: 'gus',
  speed: 'speedy',
});

/** Pickup radius in world units (client predicts, server validates). */
export const COLLECTIBLE_PICKUP_RADIUS = 0.9;
