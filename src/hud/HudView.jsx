import { Show, createMemo, For } from 'solid-js';
import { Dynamic } from 'solid-js/web';
import { HUD_ICONS } from './hudSprites.jsx';
import {
  HUD_PANEL_STYLE,
  HUD_LABEL_FONT as LABEL_FONT,
  HUD_VALUE_FONT as VALUE_FONT,
  HUD_LABEL_SHADOW as LABEL_SHADOW,
} from './hudStyle.js';

/**
 * Cartoon HUD: metallic rounded panel with icon + fill bar rows for health/stamina,
 * and a combined lives/cheese/live-mice row below.
 */

// --- Layout constants (panel-local px). Tweak here; the panel auto-sizes. ---
const PANEL_PADDING = 12;
const PANEL_WIDTH = 460;
const BAR_HEIGHT = 28;
const ICON_SIZE = 36;
const ROW_GAP = 8;

function Sprite(props) {
  return (
    <Dynamic
      component={HUD_ICONS[props.name]}
      size={props.size ?? ICON_SIZE}
    />
  );
}

function StatBar(props) {
  const pct = () => `${Math.max(0, Math.min(1, props.value())) * 100}%`;
  return (
    <div
      style={{
        display: 'flex',
        'align-items': 'center',
        gap: '10px',
      }}
    >
      <Sprite name={props.iconName} size={ICON_SIZE} />
      <div
        style={{
          position: 'relative',
          flex: '1',
          height: `${BAR_HEIGHT}px`,
          'border-radius': `${BAR_HEIGHT / 2}px`,
          background: 'linear-gradient(180deg, #5a6270 0%, #3f4753 100%)',
          'box-shadow': 'inset 0 2px 3px rgba(0,0,0,0.55), 0 1px 0 rgba(255,255,255,0.14)',
          border: '2px solid rgba(20, 26, 36, 0.85)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: '2px',
            bottom: '2px',
            left: '2px',
            width: `calc(${pct()} - 4px)`,
            'min-width': '0',
            'border-radius': `${(BAR_HEIGHT - 4) / 2}px`,
            background: props.fillColor,
            'box-shadow': `inset 0 1.5px 0 ${props.fillHighlight}, inset 0 -1.5px 0 rgba(0,0,0,0.25)`,
            transition: 'width 0.12s ease-out',
          }}
        />
        <div
          style={{
            position: 'absolute',
            inset: '0',
            display: 'flex',
            'align-items': 'center',
            'padding-left': '14px',
            color: '#fff',
            font: LABEL_FONT,
            'letter-spacing': '0.04em',
            'text-shadow': LABEL_SHADOW,
            'pointer-events': 'none',
          }}
        >
          {props.label}
        </div>
      </div>
      <div
        style={{
          'min-width': '72px',
          'text-align': 'right',
          color: '#fff',
          font: VALUE_FONT,
          'text-shadow': LABEL_SHADOW,
        }}
      >
        {props.valueText()}
      </div>
    </div>
  );
}

function LivesCell(props) {
  const slots = createMemo(() => {
    const max = Math.max(1, Math.min(3, Math.floor(Number(props.maxLives?.() ?? 2))));
    const cur = Math.max(0, Math.min(max, Math.floor(Number(props.lives?.() ?? 0))));
    return Array.from({ length: max }, (_, i) => (i < cur ? 'HEART_LIFE_FULL' : 'HEART_LIFE_LOST'));
  });

  return (
    <div style={{ display: 'flex', 'align-items': 'center', gap: '8px' }}>
      <div style={{ display: 'flex', gap: '4px' }}>
        <For each={slots()}>{(name) => <Sprite name={name} size={34} />}</For>
      </div>
      <div
        style={{
          color: '#fff',
          font: LABEL_FONT,
          'letter-spacing': '0.04em',
          'text-shadow': LABEL_SHADOW,
          'line-height': '1.05',
        }}
      >
        LIVES
      </div>
    </div>
  );
}

function Counter(props) {
  return (
    <div
      style={{
        display: 'flex',
        'align-items': 'center',
        gap: '8px',
      }}
    >
      <Sprite name={props.iconName} size={48} />
      <div
        style={{
          display: 'flex',
          'flex-direction': 'column',
          'line-height': '1.05',
        }}
      >
        <div
          style={{
            color: props.labelColor,
            font: LABEL_FONT,
            'letter-spacing': '0.04em',
            'text-shadow': LABEL_SHADOW,
          }}
        >
          {props.label}
        </div>
        <div
          style={{
            color: '#fff',
            font: VALUE_FONT,
            'text-shadow': LABEL_SHADOW,
          }}
        >
          {props.valueText()}
        </div>
      </div>
    </div>
  );
}

export function HudView(props) {
  const healthPct = () => props.state.health;
  const staminaPct = () => props.state.stamina;

  const healthText = createMemo(() => {
    const v = Math.round((props.state.health ?? 0) * 100);
    return `${v}/100`;
  });
  const staminaText = createMemo(() => {
    const v = Math.round((props.state.stamina ?? 0) * 100);
    return `${v}/100`;
  });

  const cheeseMax = createMemo(() => Math.max(1, Math.floor(Number(props.state.cheeseMax ?? 50))));
  const cheeseText = createMemo(() => {
    const n = Math.max(0, Math.floor(Number(props.state.cheese) || 0));
    return `${n} / ${cheeseMax()}`;
  });
  const playerMax = createMemo(() => Math.max(1, Math.floor(Number(props.state.playerCountMax ?? 10))));
  const playerText = createMemo(() => {
    const n = Math.max(0, Math.floor(Number(props.state.playerCount) || 0));
    return `${n} / ${playerMax()}`;
  });

  return (
    <>
      <div
        id="hud"
        style={{
          ...HUD_PANEL_STYLE,
          position: 'fixed',
          bottom: '20px',
          left: '20px',
          'pointer-events': 'none',
          'z-index': '100',
          'user-select': 'none',
          width: `${PANEL_WIDTH}px`,
          padding: `${PANEL_PADDING}px`,
          display: 'flex',
          'flex-direction': 'column',
          gap: `${ROW_GAP}px`,
        }}
      >
        <StatBar
          iconName="HEART_HEALTH_HAPPY"
          label="HEALTH"
          valueText={healthText}
          value={healthPct}
          fillColor="linear-gradient(180deg, #ff6a6a 0%, #c9302c 100%)"
          fillHighlight="rgba(255,190,190,0.6)"
        />
        <StatBar
          iconName="STAMINA_BOLT"
          label="STAMINA"
          valueText={staminaText}
          value={staminaPct}
          fillColor="linear-gradient(180deg, #7ee084 0%, #3a8a46 100%)"
          fillHighlight="rgba(200,245,205,0.6)"
        />

        <div
          style={{
            display: 'flex',
            'justify-content': 'space-between',
            'align-items': 'center',
            gap: '10px',
          }}
        >
          <LivesCell
            lives={() => props.state.lives}
            maxLives={() => props.state.maxLives ?? 2}
          />
          <Counter
            iconName="CHEESE_ITEM"
            label="CHEESE:"
            labelColor="#f6d98a"
            valueText={cheeseText}
          />
          <Counter
            iconName="MOUSE_HEAD_TARGET"
            label="LIVE:"
            labelColor="#d8e2ff"
            valueText={playerText}
          />
        </div>
      </div>

      <Show when={!props.state.alive && props.state.respawnCountdown > 0}>
        <div
          style={{
            position: 'fixed',
            top: '0',
            left: '0',
            width: '100%',
            height: '100%',
            background: 'rgba(0,0,0,0.5)',
            'z-index': '150',
            'pointer-events': 'none',
            'font-family': 'monospace',
            'user-select': 'none',
          }}
        >
          <div
            style={{
              position: 'absolute',
              'z-index': '1',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              width: 'max-content',
              color: '#ff4444',
              'font-size': '24px',
              'text-shadow': '2px 2px 4px #000',
            }}
          >
            RESPAWNING IN {Math.ceil(props.state.respawnCountdown)}
          </div>
        </div>
      </Show>
    </>
  );
}
