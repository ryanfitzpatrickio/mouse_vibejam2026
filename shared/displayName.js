/**
 * Player display names (server + client). Keep in sync with party/server sanitization.
 */

export const DISPLAY_NAME_MAX_LEN = 24;

/**
 * @param {unknown} raw
 * @returns {string}
 */
export function sanitizeDisplayName(raw) {
  if (typeof raw !== 'string') return 'Mouse';
  let s = raw.normalize('NFKC').trim().slice(0, DISPLAY_NAME_MAX_LEN);
  s = s.replace(/[\u0000-\u001F\u007F\u202E]/g, '');
  return s || 'Mouse';
}
