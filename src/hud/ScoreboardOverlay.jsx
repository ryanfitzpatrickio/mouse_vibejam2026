import { For, Show } from 'solid-js';
import { render } from 'solid-js/web';
import { createStore } from 'solid-js/store';
import { batch } from 'solid-js';

function isFormTarget(target) {
  return target instanceof HTMLElement
    && (target.isContentEditable || /^(input|textarea|select)$/i.test(target.tagName));
}

function ScoreboardView(props) {
  return (
    <div
      role="dialog"
      aria-label="Scoreboard"
      style={{
        display: props.state.tabHeld ? 'block' : 'none',
        position: 'fixed',
        top: '24px',
        left: '50%',
        transform: 'translateX(-50%)',
        'min-width': '240px',
        'max-width': 'min(92vw, 560px)',
        'z-index': '101',
        'pointer-events': 'none',
        'font-family': 'monospace',
        'font-size': '12px',
        color: '#fff',
        'text-shadow': '1px 1px 2px #000',
        'user-select': 'none',
        background: 'rgba(0,0,0,0.72)',
        border: '1px solid rgba(255,255,255,0.25)',
        'border-radius': '6px',
        padding: '10px 14px',
        'box-sizing': 'border-box',
      }}
    >
      <div
        style={{
          'font-weight': '700',
          'font-size': '11px',
          'letter-spacing': '0.06em',
          'text-transform': 'uppercase',
          color: 'rgba(255,255,255,0.85)',
          'margin-bottom': '8px',
          'border-bottom': '1px solid rgba(255,255,255,0.15)',
          'padding-bottom': '6px',
        }}
      >
        Players
      </div>
      <div style={{ display: 'flex', 'flex-direction': 'column', gap: '4px' }}>
        <Show when={props.state.rows.length > 0}>
          <div
            style={{
              display: 'grid',
              'grid-template-columns': '1fr auto auto auto',
              'align-items': 'baseline',
              gap: '10px',
              'margin-bottom': '6px',
              'font-size': '9px',
              'font-weight': '700',
              'letter-spacing': '0.08em',
              'text-transform': 'uppercase',
              color: 'rgba(255,255,255,0.45)',
            }}
          >
            <span>Player</span>
            <span style={{ 'text-align': 'right' }}>Chase</span>
            <span style={{ 'text-align': 'right' }}>Cheese</span>
            <span style={{ 'text-align': 'right' }}>KOs</span>
          </div>
        </Show>
        <For each={props.state.rows}>
          {(row) => {
            const cs = () => Math.max(0, Number(row.chaseSec) || 0);
            return (
              <div
                style={{
                  display: 'grid',
                  'grid-template-columns': '1fr auto auto auto',
                  'align-items': 'baseline',
                  gap: '10px',
                }}
              >
                <span
                  style={{
                    overflow: 'hidden',
                    'text-overflow': 'ellipsis',
                    'white-space': 'nowrap',
                  }}
                >
                  {row.label}
                </span>
                <span
                  style={{
                    'flex-shrink': '0',
                    'text-align': 'right',
                    color: 'rgba(255,220,140,0.95)',
                    'font-weight': '700',
                    'min-width': '52px',
                  }}
                >
                  {cs().toFixed(1)}s
                </span>
                <span
                  style={{
                    'flex-shrink': '0',
                    'text-align': 'right',
                    color: 'rgba(255,236,120,0.98)',
                    'font-weight': '700',
                    'min-width': '40px',
                  }}
                >
                  {String(Math.max(0, Math.floor(Number(row.cheese) || 0)))}
                </span>
                <span
                  style={{
                    'flex-shrink': '0',
                    'text-align': 'right',
                    color: 'rgba(255,180,120,0.95)',
                    'font-weight': '700',
                    'min-width': '28px',
                  }}
                >
                  {String(Math.max(0, Math.floor(Number(row.deaths) || 0)))}
                </span>
              </div>
            );
          }}
        </For>
        <Show when={props.state.rows.length === 0}>
          <div style={{ color: 'rgba(255,255,255,0.5)', 'font-size': '11px' }}>
            No players yet
          </div>
        </Show>
      </div>
    </div>
  );
}

/** Hold Tab for player list (multiplayer). */
export class ScoreboardOverlay {
  constructor({ container = document.body } = {}) {
    this.container = container;
    this._mount = document.createElement('div');
    container.appendChild(this._mount);
    const [state, setState] = createStore({
      tabHeld: false,
      rows: [],
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
