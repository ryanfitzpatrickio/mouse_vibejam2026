/**
 * Shared cartoon-HUD style tokens. Matches the metallic rounded panel look
 * used by HudView: gradient fill, light border with inner highlight, outlined
 * label text. Import from any Solid overlay that wants to feel consistent.
 */

export const HUD_LABEL_SHADOW = [
  '-1.5px -1.5px 0 #0b1220',
  '1.5px -1.5px 0 #0b1220',
  '-1.5px 1.5px 0 #0b1220',
  '1.5px 1.5px 0 #0b1220',
  '0 0 4px rgba(0,0,0,0.6)',
].join(', ');

export const HUD_LABEL_FONT = '700 18px "Fredoka", "Baloo", system-ui, sans-serif';
export const HUD_VALUE_FONT = '700 17px "Fredoka", "Baloo", system-ui, sans-serif';
export const HUD_SMALL_LABEL_FONT = '700 13px "Fredoka", "Baloo", system-ui, sans-serif';

/** Cartoon metallic panel used behind HUD-style overlays. */
export const HUD_PANEL_STYLE = Object.freeze({
  background: 'linear-gradient(180deg, rgba(126,136,152,0.92) 0%, rgba(84,93,108,0.92) 100%)',
  'border-radius': '18px',
  border: '3px solid rgba(180, 190, 210, 0.9)',
  'box-shadow': [
    'inset 0 2px 0 rgba(255,255,255,0.25)',
    'inset 0 -2px 0 rgba(0,0,0,0.35)',
    '0 6px 14px rgba(0,0,0,0.45)',
  ].join(', '),
  'backdrop-filter': 'blur(2px)',
  color: '#fff',
  'font-family': '"Fredoka", "Baloo", system-ui, sans-serif',
});

/** Inner sunken track (same look as the stat bars' background). */
export const HUD_TRACK_STYLE = Object.freeze({
  background: 'linear-gradient(180deg, #5a6270 0%, #3f4753 100%)',
  'box-shadow': 'inset 0 2px 3px rgba(0,0,0,0.55), 0 1px 0 rgba(255,255,255,0.14)',
  border: '2px solid rgba(20, 26, 36, 0.85)',
  'border-radius': '10px',
});

/** Outlined label text, matches HUD bars. */
export const HUD_TEXT_STYLE = Object.freeze({
  color: '#fff',
  font: HUD_LABEL_FONT,
  'letter-spacing': '0.04em',
  'text-shadow': HUD_LABEL_SHADOW,
});
