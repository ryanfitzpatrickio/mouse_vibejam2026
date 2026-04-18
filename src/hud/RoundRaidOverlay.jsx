import { render } from 'solid-js/web';
import { createStore } from 'solid-js/store';
import { batch } from 'solid-js';

function formatClock(seconds) {
  const s = Math.max(0, Math.floor(seconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, '0')}`;
}

function RoundRaidView(props) {
  return (
    <>
      <div
        style={{
          position: 'fixed',
          top: '14px',
          left: '50%',
          transform: 'translateX(-50%)',
          'z-index': '120',
          'pointer-events': 'none',
          'font-family': 'monospace',
          'font-size': '13px',
          'font-weight': '700',
          color: props.state.phaseColor,
          'text-shadow': '0 1px 3px rgba(0,0,0,0.9)',
          'text-align': 'center',
          'max-width': 'min(92vw, 520px)',
          'line-height': '1.35',
          display: props.state.phaseVisible ? 'block' : 'none',
          'white-space': 'pre-line',
        }}
      >
        {props.state.phaseText}
      </div>
      <div
        style={{
          position: 'fixed',
          inset: '0',
          'z-index': '200',
          background: 'rgba(0,0,0,0.72)',
          display: props.state.roundEndVisible ? 'flex' : 'none',
          'align-items': 'center',
          'justify-content': 'center',
          padding: '16px',
          'box-sizing': 'border-box',
          'pointer-events': 'auto',
        }}
        onClick={() => props.onRoundEndDismiss()}
      >
        <div
          style={{
            background: 'linear-gradient(165deg, #1e1a28 0%, #121018 100%)',
            border: '1px solid rgba(255,220,160,0.35)',
            'border-radius': '10px',
            padding: '16px 18px',
            'max-width': 'min(96vw, 440px)',
            'max-height': 'min(80vh, 560px)',
            overflow: 'auto',
            color: '#f5f0e6',
            'font-family': 'monospace',
            'font-size': '11px',
            'box-shadow': '0 12px 40px rgba(0,0,0,0.55)',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div
            style={{
              'margin-bottom': '10px',
              'font-weight': '800',
              'font-size': '14px',
            }}
          >
            {props.state.roundEndTitle}
          </div>
          <div style={{ 'white-space': 'pre-wrap' }}>{props.state.roundEndBody}</div>
          <div
            style={{
              'margin-top': '12px',
              opacity: '0.65',
              'font-size': '10px',
            }}
          >
            Click anywhere to close
          </div>
        </div>
      </div>
    </>
  );
}

/** Phase timer banner + round-end score table. */
export class RoundRaidOverlay {
  constructor({ container = document.body } = {}) {
    this.container = container;
    this._mount = document.createElement('div');
    container.appendChild(this._mount);
    const [state, setState] = createStore({
      phaseVisible: false,
      phaseText: '',
      phaseColor: '#fff',
      roundEndVisible: false,
      roundEndTitle: '',
      roundEndBody: '',
    });
    this._setState = setState;
    this._dismiss = () => {
      batch(() => this._setState({ roundEndVisible: false }));
    };
    this._dispose = render(() => (
      <RoundRaidView state={state} onRoundEndDismiss={this._dismiss} />
    ), this._mount);
  }

  updatePhaseBanner(round, nowSeconds = Date.now() / 1000, hints = {}) {
    if (!round?.phase || typeof round.phaseEndsAt !== 'number') {
      batch(() => this._setState({ phaseVisible: false }));
      return;
    }
    const remain = round.phaseEndsAt - nowSeconds;
    const label = round.phase === 'forage'
      ? `FORAGE  ·  ${formatClock(remain)}`
      : round.phase === 'extract'
        ? `EXTRACT  ·  ${formatClock(remain)}  ·  Hold E in a glowing hole`
        : `ROUND END  ·  ${formatClock(remain)}`;
    const sub = hints.subtitle ? `\n${hints.subtitle}` : '';
    const text = `${label}${sub}`;
    let color = '#fff';
    if (round.phase === 'extract') color = '#fde68a';
    else if (round.phase === 'intermission') color = '#a7f3d0';
    batch(() => {
      this._setState({
        phaseVisible: true,
        phaseText: text,
        phaseColor: color,
      });
    });
  }

  showRoundEnd(data) {
    if (!data?.results?.length) return;
    const rn = data.roundNumber ?? '?';
    const title = `Round ${rn} results`;
    const lines = data.results.map((r, i) => {
      const ext = r.extracted ? '✓ EXT' : '✗';
      const name = typeof r.displayName === 'string' && r.displayName.trim()
        ? r.displayName.trim()
        : String(r.id ?? i).slice(0, 10);
      return `${i + 1}. ${name}  ${ext}  score ${r.finalScore ?? 0}  (+${r.xpAwarded ?? 0} XP)`;
    });
    batch(() => {
      this._setState({
        roundEndVisible: true,
        roundEndTitle: title,
        roundEndBody: lines.join('\n'),
      });
    });
  }

  dispose() {
    this._dispose();
    this._mount.remove();
  }
}
