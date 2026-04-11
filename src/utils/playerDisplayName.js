import { sanitizeDisplayName } from '../../shared/displayName.js';

const STORAGE_KEY = 'mouseTrouble.displayName.v1';

/**
 * Name shown on the local nameplate until the server snapshot overrides it.
 */
export function getClientPreferredDisplayName() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (typeof raw === 'string' && raw.trim()) {
      return sanitizeDisplayName(raw);
    }
    const created = sanitizeDisplayName(`Mouse${Math.floor(100 + Math.random() * 900)}`);
    localStorage.setItem(STORAGE_KEY, created);
    return created;
  } catch {
    return 'Mouse';
  }
}
