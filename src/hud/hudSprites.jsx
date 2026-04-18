/**
 * Inline SVG icons for the HUD, styled to match the cartoon sprite sheet
 * (bold black outlines, flat fills, soft highlights). Each component accepts
 * a `size` prop (px). Use these directly from HudView in place of bitmap sprites.
 */

const OUTLINE = '#1a1f2a';
const OUTLINE_W = 8;

function IconSvg(props) {
  const s = () => props.size ?? 44;
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 100 100"
      width={s()}
      height={s()}
      style={{ 'flex-shrink': '0', overflow: 'visible' }}
      aria-hidden="true"
    >
      {props.children}
    </svg>
  );
}

function HeartPath(props) {
  return (
    <path
      d="M50 86 C 18 64, 8 42, 20 26 C 30 13, 45 16, 50 30 C 55 16, 70 13, 80 26 C 92 42, 82 64, 50 86 Z"
      fill={props.fill}
      stroke={OUTLINE}
      stroke-width={OUTLINE_W}
      stroke-linejoin="round"
    />
  );
}

function HeartHighlight() {
  return (
    <path
      d="M32 30 C 28 36, 28 44, 32 50"
      fill="none"
      stroke="rgba(255,255,255,0.55)"
      stroke-width="5"
      stroke-linecap="round"
    />
  );
}

function HappyFace(props) {
  const eyeR = props.eyeR ?? 3.2;
  return (
    <g fill={OUTLINE}>
      <circle cx="40" cy="46" r={eyeR} />
      <circle cx="60" cy="46" r={eyeR} />
      <path
        d="M40 56 Q 50 64 60 56"
        fill="none"
        stroke={OUTLINE}
        stroke-width="4"
        stroke-linecap="round"
      />
    </g>
  );
}

export function HeartHealthHappy(props) {
  return (
    <IconSvg size={props.size}>
      <HeartPath fill="#e74c4c" />
      <HeartHighlight />
      <HappyFace />
    </IconSvg>
  );
}

export function HeartLifeFull(props) {
  return (
    <IconSvg size={props.size}>
      <HeartPath fill="#e74c4c" />
      <HeartHighlight />
      <HappyFace eyeR={2.6} />
    </IconSvg>
  );
}

export function HeartLifeLost(props) {
  return (
    <IconSvg size={props.size}>
      <HeartPath fill="#7a2323" />
      <g
        stroke="#d33a3a"
        stroke-width="9"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <line x1="28" y1="32" x2="72" y2="66" />
        <line x1="72" y1="32" x2="28" y2="66" />
      </g>
      <g
        stroke={OUTLINE}
        stroke-width="2.5"
        stroke-linecap="round"
      >
        <line x1="28" y1="32" x2="72" y2="66" />
        <line x1="72" y1="32" x2="28" y2="66" />
      </g>
    </IconSvg>
  );
}

export function StaminaBolt(props) {
  return (
    <IconSvg size={props.size}>
      <path
        d="M58 10 L 28 54 L 46 54 L 40 90 L 74 42 L 54 42 L 62 10 Z"
        fill="#ffd23a"
        stroke={OUTLINE}
        stroke-width={OUTLINE_W}
        stroke-linejoin="round"
      />
      <path
        d="M50 20 L 38 48"
        fill="none"
        stroke="rgba(255,255,255,0.65)"
        stroke-width="4"
        stroke-linecap="round"
      />
    </IconSvg>
  );
}

export function MouseHeadTarget(props) {
  return (
    <IconSvg size={props.size}>
      <circle
        cx="26"
        cy="30"
        r="16"
        fill="#c9b9b0"
        stroke={OUTLINE}
        stroke-width={OUTLINE_W}
      />
      <circle
        cx="74"
        cy="30"
        r="16"
        fill="#c9b9b0"
        stroke={OUTLINE}
        stroke-width={OUTLINE_W}
      />
      <circle cx="26" cy="30" r="8" fill="#f2a9b7" />
      <circle cx="74" cy="30" r="8" fill="#f2a9b7" />
      <ellipse
        cx="50"
        cy="58"
        rx="32"
        ry="28"
        fill="#8a8a93"
        stroke={OUTLINE}
        stroke-width={OUTLINE_W}
      />
      <path
        d="M24 54 Q 28 48 36 54"
        fill="none"
        stroke="rgba(255,255,255,0.4)"
        stroke-width="4"
        stroke-linecap="round"
      />
      <circle cx="40" cy="60" r="3.5" fill={OUTLINE} />
      <circle cx="60" cy="60" r="3.5" fill={OUTLINE} />
      <ellipse cx="50" cy="74" rx="6" ry="4" fill="#f2a9b7" stroke={OUTLINE} stroke-width="3" />
    </IconSvg>
  );
}

export function CheeseItem(props) {
  return (
    <IconSvg size={props.size}>
      {/* Wedge body: point top-left, wide base bottom-right. */}
      <path
        d="M 30 20 L 86 58 L 86 78 L 18 78 Z"
        fill="#f5c94a"
        stroke={OUTLINE}
        stroke-width={OUTLINE_W}
        stroke-linejoin="round"
        stroke-linecap="round"
      />
      {/* Darker front face to imply depth. */}
      <path
        d="M 18 78 L 86 78 L 86 66 L 18 66 Z"
        fill="#e8a72b"
        stroke={OUTLINE}
        stroke-width={OUTLINE_W}
        stroke-linejoin="round"
      />
      {/* Holes on the top face. */}
      <circle cx="46" cy="42" r="5" fill="#b8791a" />
      <circle cx="66" cy="54" r="4" fill="#b8791a" />
      <circle cx="38" cy="58" r="3.5" fill="#b8791a" />
      {/* Holes on the front face. */}
      <ellipse cx="38" cy="73" rx="3.5" ry="2.5" fill="#8c5a12" />
      <ellipse cx="66" cy="73" rx="3" ry="2" fill="#8c5a12" />
      {/* Top-edge highlight. */}
      <path
        d="M 32 24 L 82 58"
        fill="none"
        stroke="rgba(255,255,255,0.55)"
        stroke-width="4"
        stroke-linecap="round"
      />
    </IconSvg>
  );
}

/** Name-keyed icon registry — mirrors the old sprite-sheet lookup. */
export const HUD_ICONS = Object.freeze({
  HEART_HEALTH_HAPPY: HeartHealthHappy,
  HEART_LIFE_FULL: HeartLifeFull,
  HEART_LIFE_LOST: HeartLifeLost,
  STAMINA_BOLT: StaminaBolt,
  MOUSE_HEAD_TARGET: MouseHeadTarget,
  CHEESE_ITEM: CheeseItem,
});
