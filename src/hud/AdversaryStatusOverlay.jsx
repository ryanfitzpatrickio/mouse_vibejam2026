import { render } from 'solid-js/web';
import { createStore } from 'solid-js/store';
import { Show, createSignal, onCleanup } from 'solid-js';
import {
  HUD_PANEL_STYLE,
  HUD_LABEL_FONT,
  HUD_VALUE_FONT,
  HUD_SMALL_LABEL_FONT,
  HUD_LABEL_SHADOW,
  HUD_TRACK_STYLE,
} from './hudStyle.js';
import { actionLabel } from '../input/inputSource.js';

function formatSeconds(value) {
  return `${Math.max(0, Number(value) || 0).toFixed(1)}s`;
}

function useIsMobile() {
  const mm = typeof window !== 'undefined' ? window.matchMedia : null;
  const queries = mm ? [
    mm.call(window, '(pointer: coarse)'),
    mm.call(window, '(hover: none)'),
    mm.call(window, '(max-width: 820px)'),
  ] : [];
  const evaluate = () => queries.some((q) => q?.matches);
  const [isMobile, setIsMobile] = createSignal(evaluate());
  const handler = () => setIsMobile(evaluate());
  for (const q of queries) {
    q?.addEventListener?.('change', handler);
  }
  onCleanup(() => {
    for (const q of queries) q?.removeEventListener?.('change', handler);
  });
  return isMobile;
}

function AdversaryStatusView(props) {
  const mode = () => props.state.mode;
  const active = () => mode() !== 'off';
  const isAvailable = () => mode() === 'available';
  const isLocal = () => mode() === 'local';
  const hiding = () => props.state.hiding;
  const statusText = () => (hiding() ? 'Hiding' : 'Seen');
  const statusColor = () => (hiding() ? '#9dffb1' : '#ffcf8a');
  const fill = () => `${Math.min(100, Math.max(0, (Number(props.state.streakSeconds) || 0) * 8))}%`;
  const isMobile = useIsMobile();

  const compactColor = () => (isAvailable() ? '#ffe08a' : statusColor());

  const buttonLabel = () => {
    if (isAvailable()) return 'Become human';
    if (isLocal()) return 'Return as mouse';
    return null;
  };

  return (
    <Show when={active()}>
      <Show
        when={!isMobile()}
        fallback={
          <Show when={buttonLabel()}>
            <button
              type="button"
              id="adversary-toggle-mobile"
              onClick={(e) => { e.preventDefault(); props.onToggle?.(); }}
              onTouchEnd={(e) => { e.preventDefault(); props.onToggle?.(); }}
              style={{
                position: 'fixed',
                top: '10px',
                right: '12px',
                'z-index': '121',
                font: HUD_SMALL_LABEL_FONT,
                color: '#111',
                background: compactColor(),
                border: 'none',
                'border-radius': '6px',
                padding: '8px 12px',
                'box-shadow': '0 2px 6px rgba(0,0,0,0.35)',
                cursor: 'pointer',
              }}
            >
              {buttonLabel()}
            </button>
          </Show>
        }
      >
      <div
        id="adversary-status"
        role="status"
        aria-live="polite"
        style={{
          ...HUD_PANEL_STYLE,
          position: 'fixed',
          top: '86px',
          right: '14px',
          'z-index': '121',
          width: 'min(330px, calc(100vw - 28px))',
          padding: '12px 14px',
          'pointer-events': 'none',
          'box-sizing': 'border-box',
        }}
      >
        <div
          style={{
            display: 'flex',
            'align-items': 'center',
            'justify-content': 'space-between',
            gap: '10px',
          }}
        >
          <div
            style={{
              font: HUD_SMALL_LABEL_FONT,
              color: '#dce8ff',
              'letter-spacing': '0.08em',
              'text-shadow': HUD_LABEL_SHADOW,
              'text-transform': 'uppercase',
            }}
          >
            Human role
          </div>
          <div
            style={{
              ...HUD_TRACK_STYLE,
              padding: '3px 9px',
              color: isAvailable() ? '#ffe08a' : statusColor(),
              font: HUD_SMALL_LABEL_FONT,
              'text-shadow': HUD_LABEL_SHADOW,
              'white-space': 'nowrap',
            }}
          >
            {isAvailable() ? 'Open' : statusText()}
          </div>
        </div>

        <div
          style={{
            'margin-top': '7px',
            font: HUD_LABEL_FONT,
            color: '#fff7c2',
            'text-shadow': HUD_LABEL_SHADOW,
            'line-height': '1.05',
          }}
        >
          {isAvailable()
            ? 'Adversary available'
            : isLocal()
              ? 'You are the human'
              : `${props.state.displayName || 'A player'} is the human`}
        </div>

        <Show when={!isAvailable()}>
          <div
            style={{
              display: 'grid',
              'grid-template-columns': '1fr auto',
              gap: '6px 10px',
              'align-items': 'center',
              'margin-top': '10px',
            }}
          >
            <div style={{ font: HUD_SMALL_LABEL_FONT, color: '#e8eefb', 'text-shadow': HUD_LABEL_SHADOW }}>
              Clear time
            </div>
            <div style={{ font: HUD_VALUE_FONT, color: '#fff', 'text-shadow': HUD_LABEL_SHADOW }}>
              {formatSeconds(props.state.safeSeconds)}
            </div>
            <div style={{ font: HUD_SMALL_LABEL_FONT, color: '#e8eefb', 'text-shadow': HUD_LABEL_SHADOW }}>
              Current streak
            </div>
            <div style={{ font: HUD_VALUE_FONT, color: statusColor(), 'text-shadow': HUD_LABEL_SHADOW }}>
              {formatSeconds(props.state.streakSeconds)}
            </div>
          </div>

          <div
            style={{
              ...HUD_TRACK_STYLE,
              position: 'relative',
              height: '12px',
              overflow: 'hidden',
              'margin-top': '9px',
            }}
          >
            <div
              style={{
                position: 'absolute',
                inset: '0 auto 0 0',
                width: fill(),
                background: hiding()
                  ? 'linear-gradient(90deg, #4ade80, #bef264)'
                  : 'linear-gradient(90deg, #f97316, #facc15)',
                'box-shadow': 'inset 0 1px 0 rgba(255,255,255,0.35)',
              }}
            />
          </div>
        </Show>

        <div
          style={{
            'margin-top': '8px',
            font: HUD_SMALL_LABEL_FONT,
            color: '#ffffff',
            'text-shadow': HUD_LABEL_SHADOW,
            'line-height': '1.15',
          }}
        >
          {isAvailable()
            ? `Press ${actionLabel('adversaryToggle')} to become human`
            : isLocal()
              ? `Stay away from mice. Press ${actionLabel('adversaryToggle')} to return.`
              : hiding()
                ? 'No mice are close.'
                : 'Mice are close.'}
        </div>
      </div>
      </Show>
    </Show>
  );
}

export class AdversaryStatusOverlay {
  constructor({ container = document.body, onToggle = null } = {}) {
    this._mount = document.createElement('div');
    container.appendChild(this._mount);
    const [state, setState] = createStore({
      mode: 'off',
      displayName: '',
      safeSeconds: 0,
      streakSeconds: 0,
      hiding: false,
    });
    this._setState = setState;
    this._onToggle = onToggle;
    this._dispose = render(
      () => <AdversaryStatusView state={state} onToggle={() => this._onToggle?.()} />,
      this._mount,
    );
  }

  setOnToggle(fn) {
    this._onToggle = fn;
  }

  update(patch = {}) {
    this._setState({
      mode: patch.mode ?? 'off',
      displayName: patch.displayName ?? '',
      safeSeconds: patch.safeSeconds ?? 0,
      streakSeconds: patch.streakSeconds ?? 0,
      hiding: !!patch.hiding,
    });
  }

  dispose() {
    this._dispose();
    this._mount.remove();
  }
}
