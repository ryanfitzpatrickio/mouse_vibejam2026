/**
 * Player display names (server + client). Keep in sync with party/server sanitization.
 */

import {
  RegExpMatcher,
  englishDataset,
  englishRecommendedTransformers,
} from 'obscenity';

export const DISPLAY_NAME_MAX_LEN = 24;

const FALLBACK_DISPLAY_NAME = 'Mouse';
const profanityMatcher = new RegExpMatcher({
  ...englishDataset.build(),
  ...englishRecommendedTransformers,
});

/**
 * @param {unknown} raw
 * @returns {string}
 */
export function sanitizeDisplayName(raw) {
  if (typeof raw !== 'string') return FALLBACK_DISPLAY_NAME;
  const s = raw
    .normalize('NFKC')
    .replace(/[\p{Cc}\p{Cf}]/gu, '')
    .replace(/[^\p{L}\p{N} ._-]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, DISPLAY_NAME_MAX_LEN)
    .trim();

  if (!s) return FALLBACK_DISPLAY_NAME;
  if (profanityMatcher.hasMatch(s) || profanityMatcher.hasMatch(s.replace(/[\s._-]+/g, ''))) {
    return FALLBACK_DISPLAY_NAME;
  }
  return s;
}
