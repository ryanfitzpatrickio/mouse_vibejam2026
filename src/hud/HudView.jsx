import { Show, createMemo } from 'solid-js';
import { measureText } from '../utils/textLayout.js';

const FONT = '10px monospace';
const BAR_WIDTH = 160;
const LINE_HEIGHT = 14;

function MouseIcon(props) {
  const size = () => props.size ?? 20;
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 64 64"
      width={size()}
      height={size()}
      aria-hidden="true"
    >
      <circle cx="18" cy="16" r="14" fill="#ccc" stroke="#333" stroke-width="2" />
      <circle cx="18" cy="16" r="8" fill="#f8a0a0" />
      <circle cx="46" cy="16" r="14" fill="#ccc" stroke="#333" stroke-width="2" />
      <circle cx="46" cy="16" r="8" fill="#f8a0a0" />
      <ellipse cx="32" cy="36" rx="22" ry="20" fill="#ccc" stroke="#333" stroke-width="2" />
      <g stroke="#000" stroke-width="3" stroke-linecap="round">
        <line x1="21" y1="29" x2="27" y2="35" />
        <line x1="27" y1="29" x2="21" y2="35" />
      </g>
      <g stroke="#000" stroke-width="3" stroke-linecap="round">
        <line x1="37" y1="29" x2="43" y2="35" />
        <line x1="43" y1="29" x2="37" y2="35" />
      </g>
      <ellipse cx="32" cy="42" rx="3" ry="2.5" fill="#f8a0a0" />
      <g stroke="#333" stroke-width="1.2" stroke-linecap="round">
        <line x1="12" y1="40" x2="24" y2="42" />
        <line x1="12" y1="44" x2="24" y2="44" />
        <line x1="40" y1="42" x2="52" y2="40" />
        <line x1="40" y1="44" x2="52" y2="44" />
      </g>
    </svg>
  );
}

function StatBar(props) {
  const labelH = createMemo(() => measureText(props.label, FONT, BAR_WIDTH, LINE_HEIGHT).height);
  const fillPct = () => `${Math.max(0, Math.min(1, props.value())) * 100}%`;

  return (
    <div style={{ 'margin-bottom': '6px', width: '160px' }}>
      <div
        style={{
          color: '#fff',
          'font-size': '10px',
          'margin-bottom': '2px',
          'text-shadow': '1px 1px 2px #000',
          height: `${labelH()}px`,
        }}
      >
        {props.label}
      </div>
      <div
        style={{
          width: '100%',
          height: '8px',
          background: props.bgColor,
          border: '1px solid rgba(255,255,255,0.3)',
        }}
      >
        <div
          style={{
            width: fillPct(),
            height: '100%',
            background: props.fgColor,
            transition: 'width 0.1s',
          }}
        />
      </div>
    </div>
  );
}

export function HudView(props) {
  const pingText = createMemo(() => {
    const p = props.state.ping;
    if (p === undefined || p === null || Number.isNaN(p)) return '-- ms';
    return `${Math.round(p)} ms`;
  });
  const pingH = createMemo(() => measureText(pingText(), FONT, BAR_WIDTH, LINE_HEIGHT).height);

  const playerCount = () => Math.max(0, Math.floor(props.state.playerCount ?? 0));
  const playerBadgeH = createMemo(() => measureText(String(playerCount()), FONT, BAR_WIDTH, LINE_HEIGHT).height);

  const cheeseCount = () => Math.max(0, Math.floor(Number(props.state.cheese) || 0));
  const cheeseBadgeH = createMemo(() => measureText(String(cheeseCount()), FONT, BAR_WIDTH, LINE_HEIGHT).height);

  const livesLine = createMemo(() => {
    const n = Math.max(0, Math.min(3, Math.floor(Number(props.state.lives) || 0)));
    return `${'♥'.repeat(n) || '—'} lives`;
  });

  // #hud first so respawn layer (later sibling) paints above corner bars.
  // Respawn z-index 150 > RoundRaid phase banner (120) so countdown stays visible on top.
  return (
    <>
      <div
        id="hud"
        style={{
          position: 'fixed',
          bottom: '20px',
          left: '20px',
          'pointer-events': 'none',
          'z-index': '100',
          'font-family': 'monospace',
          'user-select': 'none',
        }}
      >
        <StatBar label="HEALTH" fgColor="#ff4444" bgColor="#661111" value={() => props.state.health} />
        <StatBar label="STAMINA" fgColor="#44ff88" bgColor="#116633" value={() => props.state.stamina} />

        <div
          style={{
            display: 'flex',
            'flex-direction': 'row',
            'align-items': 'center',
            'justify-content': 'space-between',
            width: `${Math.max(BAR_WIDTH, 232)}px`,
            'max-width': 'min(260px, 92vw)',
            'margin-top': '4px',
            gap: '8px',
            'flex-wrap': 'wrap',
          }}
        >
          <div
            style={{
              color: '#fff',
              'font-size': '10px',
              'text-shadow': '1px 1px 2px #000',
              'flex-shrink': '0',
              height: `${pingH()}px`,
            }}
          >
            {pingText()}
          </div>

          <div
            style={{
              display: 'flex',
              'flex-direction': 'row',
              'align-items': 'center',
              gap: '6px',
              'flex-shrink': '0',
            }}
          >
            <MouseIcon size={20} />
            <div
              style={{
                'min-width': '20px',
                height: `${playerBadgeH()}px`,
                padding: '0 4px',
                'box-sizing': 'border-box',
                'border-radius': '50%',
                background: '#22c55e',
                border: '1px solid rgba(255,255,255,0.35)',
                color: '#fff',
                'font-size': '10px',
                'font-weight': '700',
                'line-height': '18px',
                'text-align': 'center',
                'text-shadow': '0 0 2px rgba(0,0,0,0.8)',
                display: 'flex',
                'align-items': 'center',
                'justify-content': 'center',
              }}
            >
              {playerCount()}
            </div>
          </div>

          <div
            style={{
              display: 'flex',
              'flex-direction': 'row',
              'align-items': 'center',
              gap: '6px',
              'flex-shrink': '0',
            }}
          >
            <div
              style={{
                'font-size': '14px',
                'line-height': '1',
                filter: 'drop-shadow(0 0 1px rgba(0,0,0,0.8))',
              }}
            >
              🧀
            </div>
            <div
              style={{
                'min-width': '22px',
                height: `${cheeseBadgeH()}px`,
                padding: '0 4px',
                'box-sizing': 'border-box',
                'border-radius': '4px',
                background: 'rgba(234,179,8,0.35)',
                border: '1px solid rgba(255,236,160,0.45)',
                color: '#fff7c2',
                'font-size': '10px',
                'font-weight': '700',
                'line-height': '18px',
                'text-align': 'center',
                'text-shadow': '0 0 2px rgba(0,0,0,0.85)',
              }}
            >
              {cheeseCount()}
            </div>
          </div>

          <div
            style={{
              color: '#fda4af',
              'font-size': '10px',
              'font-weight': '700',
              'text-shadow': '1px 1px 2px #000',
              'flex-shrink': '0',
            }}
          >
            {livesLine()}
          </div>
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
