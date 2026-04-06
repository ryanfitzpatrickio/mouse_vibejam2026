export function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function createAtlasButtonStyle(index, atlasUrl, columns = 10, rows = 10) {
  const col = index % columns;
  const row = Math.floor(index / columns);
  const x = columns > 1 ? (col / (columns - 1)) * 100 : 0;
  const y = rows > 1 ? (row / (rows - 1)) * 100 : 0;

  return {
    backgroundImage: `url('${atlasUrl}')`,
    backgroundSize: `${columns * 100}% ${rows * 100}%`,
    backgroundPosition: `${x}% ${y}%`,
  };
}

export function titleCase(value) {
  return String(value).charAt(0).toUpperCase() + String(value).slice(1);
}

export function stripJsonCodeFence(text) {
  return String(text)
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```$/i, '')
    .trim();
}

export function safeParseJson(text) {
  const cleaned = stripJsonCodeFence(text);
  try {
    return JSON.parse(cleaned);
  } catch {
    let patched = cleaned
      .replace(/,\s*$/, '')
      .replace(/,\s*([}\]])/, '$1');
    let opens = 0;
    let openArrays = 0;
    for (const ch of patched) {
      if (ch === '{') opens++;
      else if (ch === '}') opens--;
      else if (ch === '[') openArrays++;
      else if (ch === ']') openArrays--;
    }
    while (openArrays > 0) { patched += ']'; openArrays--; }
    while (opens > 0) { patched += '}'; opens--; }
    return JSON.parse(patched);
  }
}

export function getStoredString(key, fallback = '') {
  try {
    return window.localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}

export function setStoredString(key, value) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Ignore storage failures in private mode or restricted contexts.
  }
}
