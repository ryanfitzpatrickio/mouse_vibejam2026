import { prepare, prepareWithSegments, layout, layoutWithLines } from '@chenglou/pretext';

const preparedCache = new Map();

export function measureText(text, font, maxWidth, lineHeight) {
  const key = `${text}\0${font}`;
  let prepared = preparedCache.get(key);
  if (!prepared) {
    prepared = prepare(text, font);
    preparedCache.set(key, prepared);
  }
  return layout(prepared, maxWidth, lineHeight);
}

export function measureTextLines(text, font, maxWidth, lineHeight) {
  const key = `${text}\0${font}\0seg`;
  let prepared = preparedCache.get(key);
  if (!prepared) {
    prepared = prepareWithSegments(text, font);
    preparedCache.set(key, prepared);
  }
  return layoutWithLines(prepared, maxWidth, lineHeight);
}

export function measureTextWidth(text, font, maxWidth) {
  const key = `${text}\0${font}\0seg`;
  let prepared = preparedCache.get(key);
  if (!prepared) {
    prepared = prepareWithSegments(text, font);
    preparedCache.set(key, prepared);
  }
  const result = layoutWithLines(prepared, maxWidth, 1);
  let maxW = 0;
  for (const line of result.lines) {
    if (line.width > maxW) maxW = line.width;
  }
  return { lineCount: result.lineCount, maxLineWidth: maxW };
}

export function sizeElementToFit(element, font, maxWidth, lineHeight) {
  const text = element.textContent;
  if (!text) return { height: 0, lineCount: 0 };
  const result = measureText(text, font, maxWidth, lineHeight);
  element.style.height = `${result.height}px`;
  return result;
}

export function clearTextLayoutCache() {
  preparedCache.clear();
}
