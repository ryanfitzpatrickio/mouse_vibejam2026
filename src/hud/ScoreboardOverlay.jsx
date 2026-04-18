import { For, Show } from 'solid-js';
import { render } from 'solid-js/web';
import { createStore } from 'solid-js/store';
import { batch } from 'solid-js';
import {
  HUD_PANEL_STYLE,
  HUD_LABEL_FONT,
  HUD_SMALL_LABEL_FONT,
  HUD_LABEL_SHADOW,
} from './hudStyle.js';
import { HeartHealthHappy, MouseHeadTarget, CheeseItem, StaminaBolt } from './hudSprites.jsx';

function isFormTarget(target) {
  return target instanceof HTMLElement
    && (target.isContentEditable || /^(input|textarea|select)$/i.test(target.tagName));
}

const CONTROLS = [
  { keys: ['W', 'A', 'S', 'D'], label: 'Move' },
  { keys: ['Space'], label: 'Jump' },
  { keys: ['Shift'], label: 'Sprint' },
  { keys: ['Ctrl'], label: 'Crouch' },
  { keys: ['E'], label: 'Smack' },
  { keys: ['Q'], label: 'Grab' },
  { keys: ['R'], label: 'Spawn ball' },
  { keys: ['F'], label: 'Emote' },
  { keys: ['H'], label: 'Hero' },
];

function KeyCap(props) {
  return (
    <span
      style={{
        display: 'inline-block',
        'min-width': '22px',
        padding: '2px 6px',
        'border-radius': '6px',
        background: 'rgba(255,255,255,0.14)',
        border: '1px solid rgba(255,255,255,0.28)',
        'text-align': 'center',
        'font-size': '11px',
        'letter-spacing': '0.02em',
      }}
    >
      {props.children}
    </span>
  );
}

function ControlsPanel() {
  return (
    <div
      style={{
        display: 'flex',
        'flex-direction': 'column',
        gap: '8px',
        'border-top': '1px solid rgba(255,255,255,0.12)',
        'padding-top': '10px',
        'margin-top': '2px',
      }}
    >
      <div
        style={{
          font: HUD_LABEL_FONT,
          'letter-spacing': '0.08em',
          'text-transform': 'uppercase',
          'text-shadow': HUD_LABEL_SHADOW,
          'text-align': 'center',
        }}
      >
        Controls
      </div>
      <div
        style={{
          display: 'grid',
          'grid-template-columns': 'repeat(auto-fill, minmax(160px, 1fr))',
          gap: '6px 12px',
          padding: '0 6px',
          color: '#fff',
          font: HUD_LABEL_FONT,
          'text-shadow': HUD_LABEL_SHADOW,
        }}
      >
        <For each={CONTROLS}>
          {(c) => (
            <div
              style={{
                display: 'flex',
                'align-items': 'center',
                gap: '8px',
              }}
            >
              <span style={{ display: 'inline-flex', gap: '3px' }}>
                <For each={c.keys}>{(k) => <KeyCap>{k}</KeyCap>}</For>
              </span>
              <span style={{ color: 'rgba(255,255,255,0.85)' }}>{c.label}</span>
            </div>
          )}
        </For>
      </div>
    </div>
  );
}

function ColHeader(props) {
  return (
    <div
      style={{
        display: 'flex',
        'flex-direction': 'column',
        'align-items': props.align ?? 'flex-end',
        gap: '2px',
      }}
    >
      {props.children}
      <span
        style={{
          color: 'rgba(255,255,255,0.7)',
          font: HUD_SMALL_LABEL_FONT,
          'letter-spacing': '0.06em',
          'text-transform': 'uppercase',
          'text-shadow': HUD_LABEL_SHADOW,
        }}
      >
        {props.label}
      </span>
    </div>
  );
}

function ScoreboardView(props) {
  return (
    <div
      id="scoreboard"
      role="dialog"
      aria-label="Scoreboard"
      style={{
        ...HUD_PANEL_STYLE,
        display: props.state.tabHeld ? 'flex' : 'none',
        'flex-direction': 'column',
        position: 'fixed',
        top: '24px',
        left: '50%',
        transform: 'translateX(-50%)',
        'min-width': 'min(420px, 92vw)',
        'max-width': 'min(96vw, 720px)',
        'max-height': 'calc(100vh - 48px)',
        'z-index': '101',
        'pointer-events': 'none',
        padding: '14px 16px',
        gap: '10px',
        'box-sizing': 'border-box',
        'user-select': 'none',
        overflow: 'auto',
        '-webkit-overflow-scrolling': 'touch',
      }}
    >
      <div
        style={{
          font: HUD_LABEL_FONT,
          'letter-spacing': '0.08em',
          'text-transform': 'uppercase',
          'text-shadow': HUD_LABEL_SHADOW,
          'text-align': 'center',
        }}
      >
        Players
      </div>

      <Show when={props.state.rows.length > 0}>
        <div
          style={{
            display: 'grid',
            'grid-template-columns': '1fr 72px 72px 56px',
            'align-items': 'end',
            gap: '12px',
            padding: '0 6px',
          }}
        >
          <ColHeader label="Player" align="flex-start">
            <div style={{ height: '22px' }} />
          </ColHeader>
          <ColHeader label="Chase">
            <StaminaBolt size={22} />
          </ColHeader>
          <ColHeader label="Cheese">
            <CheeseItem size={22} />
          </ColHeader>
          <ColHeader label="KOs">
            <HeartHealthHappy size={22} />
          </ColHeader>
        </div>
      </Show>

      <div style={{ display: 'flex', 'flex-direction': 'column', gap: '4px' }}>
        <For each={props.state.rows}>
          {(row, i) => {
            const cs = () => Math.max(0, Number(row.chaseSec) || 0);
            const bg = () => (i() % 2 === 0
              ? 'rgba(0,0,0,0.18)'
              : 'rgba(255,255,255,0.05)');
            return (
              <div
                style={{
                  display: 'grid',
                  'grid-template-columns': '1fr 72px 72px 56px',
                  'align-items': 'center',
                  gap: '12px',
                  padding: '4px 6px',
                  'border-radius': '6px',
                  background: bg(),
                  color: '#fff',
                  font: HUD_LABEL_FONT,
                  'text-shadow': HUD_LABEL_SHADOW,
                }}
              >
                <span
                  style={{
                    display: 'flex',
                    'align-items': 'center',
                    gap: '8px',
                    overflow: 'hidden',
                    'text-overflow': 'ellipsis',
                    'white-space': 'nowrap',
                  }}
                >
                  <MouseHeadTarget size={22} />
                  <span
                    style={{
                      overflow: 'hidden',
                      'text-overflow': 'ellipsis',
                      'white-space': 'nowrap',
                    }}
                  >
                    {row.label}
                  </span>
                </span>
                <span style={{ 'text-align': 'right', color: '#fde68a' }}>
                  {cs().toFixed(1)}s
                </span>
                <span style={{ 'text-align': 'right', color: '#fff7c2' }}>
                  {String(Math.max(0, Math.floor(Number(row.cheese) || 0)))}
                </span>
                <span style={{ 'text-align': 'right', color: '#fda4af' }}>
                  {String(Math.max(0, Math.floor(Number(row.deaths) || 0)))}
                </span>
              </div>
            );
          }}
        </For>
        <Show when={props.state.rows.length === 0}>
          <div
            style={{
              color: 'rgba(255,255,255,0.6)',
              font: HUD_LABEL_FONT,
              'text-align': 'center',
              padding: '8px',
              'text-shadow': HUD_LABEL_SHADOW,
            }}
          >
            No players yet
          </div>
        </Show>
      </div>

      <Show when={!props.state.coarsePointer}>
        <ControlsPanel />
      </Show>
    </div>
  );
}

/** Hold Tab for player list (multiplayer). */
export class ScoreboardOverlay {
  constructor({ container = document.body } = {}) {
    this.container = container;
    this._mount = document.createElement('div');
    container.appendChild(this._mount);
    const coarsePointer = typeof window !== 'undefined'
      && window.matchMedia?.('(pointer: coarse)').matches;
    const [state, setState] = createStore({
      tabHeld: false,
      rows: [],
      coarsePointer,
    });
    this._setState = setState;
    this._dispose = render(() => <ScoreboardView state={state} />, this._mount);

    this._onKeyDown = (e) => {
      if (e.code !== 'Tab') return;
      if (isFormTarget(e.target)) return;
      e.preventDefault();
      if (!state.tabHeld) {
        batch(() => this._setState({ tabHeld: true }));
      }
    };
    this._onKeyUp = (e) => {
      if (e.code !== 'Tab') return;
      batch(() => this._setState({ tabHeld: false }));
    };
    this._onVisibility = () => {
      if (document.hidden) {
        batch(() => this._setState({ tabHeld: false }));
      }
    };
    this._onBlur = () => {
      batch(() => this._setState({ tabHeld: false }));
    };

    document.addEventListener('keydown', this._onKeyDown);
    document.addEventListener('keyup', this._onKeyUp);
    document.addEventListener('visibilitychange', this._onVisibility);
    window.addEventListener('blur', this._onBlur);
  }

  setRows(rows) {
    const next = Array.isArray(rows) ? rows : [];
    batch(() => {
      this._setState({ rows: next });
    });
  }

  dispose() {
    document.removeEventListener('keydown', this._onKeyDown);
    document.removeEventListener('keyup', this._onKeyUp);
    document.removeEventListener('visibilitychange', this._onVisibility);
    window.removeEventListener('blur', this._onBlur);
    this._dispose();
    this._mount.remove();
  }
}
