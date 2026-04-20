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

export function HumanRoleIcon(props) {
  return (
    <IconSvg size={props.size}>
      {/* Head */}
      <circle
        cx="50"
        cy="28"
        r="16"
        fill="#f0c8a8"
        stroke={OUTLINE}
        stroke-width={OUTLINE_W}
      />
      {/* Body / shoulders */}
      <path
        d="M16 90 C 18 64, 34 52, 50 52 C 66 52, 82 64, 84 90 Z"
        fill="#3b6fb5"
        stroke={OUTLINE}
        stroke-width={OUTLINE_W}
        stroke-linejoin="round"
      />
      {/* Highlight */}
      <path
        d="M36 18 C 32 22, 32 28, 36 32"
        fill="none"
        stroke="rgba(255,255,255,0.55)"
        stroke-width="4"
        stroke-linecap="round"
      />
    </IconSvg>
  );
}

function PortraitFrame(props) {
  return (
    <g>
      <circle
        cx="50"
        cy="50"
        r="42"
        fill={props.ringFill ?? '#dbe4f3'}
        stroke={OUTLINE}
        stroke-width={OUTLINE_W}
      />
      <circle
        cx="50"
        cy="50"
        r="33"
        fill={props.innerFill ?? '#7c8798'}
      />
      <path
        d="M28 26 C 24 32, 24 40, 28 46"
        fill="none"
        stroke="rgba(255,255,255,0.48)"
        stroke-width="4"
        stroke-linecap="round"
      />
    </g>
  );
}

export function HeroBrainPortrait(props) {
  return (
    <IconSvg size={props.size}>
      <PortraitFrame ringFill="#d9c4ff" innerFill="#6d5a97" />
      <path
        d="M30 58 C 30 36, 70 36, 70 58 C 70 74, 30 74, 30 58 Z"
        fill="#ffb84c"
        stroke={OUTLINE}
        stroke-width="6"
        stroke-linejoin="round"
      />
      <path
        d="M38 52 C 40 36, 60 36, 62 52"
        fill="none"
        stroke="#ffe39b"
        stroke-width="6"
        stroke-linecap="round"
      />
      <circle cx="42" cy="58" r="4" fill={OUTLINE} />
      <circle cx="58" cy="58" r="4" fill={OUTLINE} />
      <path d="M42 68 Q 50 73 58 68" fill="none" stroke={OUTLINE} stroke-width="4" stroke-linecap="round" />
      <path
        d="M24 52 C 26 30, 40 16, 50 16 C 60 16, 74 30, 76 52"
        fill="#f4a1b4"
        stroke={OUTLINE}
        stroke-width="6"
        stroke-linejoin="round"
      />
      <path
        d="M33 44 C 33 30, 41 22, 50 22 C 59 22, 67 30, 67 44"
        fill="none"
        stroke="#ffd2dd"
        stroke-width="4"
        stroke-linecap="round"
      />
    </IconSvg>
  );
}

export function HeroJerryPortrait(props) {
  return (
    <IconSvg size={props.size}>
      <PortraitFrame ringFill="#ffe39f" innerFill="#8f7750" />
      <ellipse cx="34" cy="32" rx="11" ry="12" fill="#d3c3b8" stroke={OUTLINE} stroke-width="6" />
      <ellipse cx="66" cy="32" rx="11" ry="12" fill="#d3c3b8" stroke={OUTLINE} stroke-width="6" />
      <circle cx="34" cy="32" r="5" fill="#f3a9b8" />
      <circle cx="66" cy="32" r="5" fill="#f3a9b8" />
      <ellipse cx="50" cy="56" rx="24" ry="22" fill="#b9b1aa" stroke={OUTLINE} stroke-width="6" />
      <circle cx="41" cy="56" r="3.8" fill={OUTLINE} />
      <circle cx="59" cy="56" r="3.8" fill={OUTLINE} />
      <ellipse cx="50" cy="66" rx="5.5" ry="4.2" fill="#f3a9b8" stroke={OUTLINE} stroke-width="3" />
      <path d="M24 52 C 28 46, 33 46, 37 52" fill="none" stroke="rgba(255,255,255,0.42)" stroke-width="4" stroke-linecap="round" />
    </IconSvg>
  );
}

export function HeroGusPortrait(props) {
  return (
    <IconSvg size={props.size}>
      <PortraitFrame ringFill="#ffd0e3" innerFill="#8e5d74" />
      <ellipse cx="34" cy="34" rx="10" ry="11" fill="#d7c6d1" stroke={OUTLINE} stroke-width="6" />
      <ellipse cx="66" cy="34" rx="10" ry="11" fill="#d7c6d1" stroke={OUTLINE} stroke-width="6" />
      <circle cx="34" cy="34" r="4.5" fill="#f3aac6" />
      <circle cx="66" cy="34" r="4.5" fill="#f3aac6" />
      <ellipse cx="50" cy="58" rx="23" ry="21" fill="#c8b5c2" stroke={OUTLINE} stroke-width="6" />
      <circle cx="41" cy="58" r="3.8" fill={OUTLINE} />
      <circle cx="59" cy="58" r="3.8" fill={OUTLINE} />
      <ellipse cx="50" cy="68" rx="5.5" ry="4.2" fill="#f7c3d7" stroke={OUTLINE} stroke-width="3" />
      <path
        d="M31 42 C 38 24, 63 24, 69 42"
        fill="none"
        stroke="#ffddea"
        stroke-width="6"
        stroke-linecap="round"
      />
      <path
        d="M44 28 C 47 22, 53 22, 56 28"
        fill="none"
        stroke="#ffeef5"
        stroke-width="4"
        stroke-linecap="round"
      />
    </IconSvg>
  );
}

export function HeroSpeedyPortrait(props) {
  return (
    <IconSvg size={props.size}>
      <PortraitFrame ringFill="#b9deff" innerFill="#45688d" />
      <ellipse cx="34" cy="33" rx="10" ry="11" fill="#d0d6df" stroke={OUTLINE} stroke-width="6" />
      <ellipse cx="66" cy="33" rx="10" ry="11" fill="#d0d6df" stroke={OUTLINE} stroke-width="6" />
      <circle cx="34" cy="33" r="4.5" fill="#f0b0be" />
      <circle cx="66" cy="33" r="4.5" fill="#f0b0be" />
      <ellipse cx="50" cy="58" rx="23" ry="21" fill="#bcc7d4" stroke={OUTLINE} stroke-width="6" />
      <circle cx="41" cy="58" r="3.8" fill={OUTLINE} />
      <circle cx="59" cy="58" r="3.8" fill={OUTLINE} />
      <ellipse cx="50" cy="68" rx="5.5" ry="4.2" fill="#f6c0cf" stroke={OUTLINE} stroke-width="3" />
      <path
        d="M28 46 L 44 28 L 49 42 L 60 24 L 55 40 L 72 40"
        fill="none"
        stroke="#fff1a6"
        stroke-width="6"
        stroke-linecap="round"
        stroke-linejoin="round"
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
  HUMAN_ROLE: HumanRoleIcon,
  HERO_BRAIN: HeroBrainPortrait,
  HERO_JERRY: HeroJerryPortrait,
  HERO_GUS: HeroGusPortrait,
  HERO_SPEEDY: HeroSpeedyPortrait,
});
