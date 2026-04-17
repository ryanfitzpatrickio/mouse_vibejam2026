/**
 * Extraction Raid: phase timer banner + round-end score table.
 */

function formatClock(seconds) {
  const s = Math.max(0, Math.floor(seconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, '0')}`;
}

export class RoundRaidOverlay {
  constructor({ container = document.body } = {}) {
    this.container = container;
    this._phaseBanner = document.createElement('div');
    Object.assign(this._phaseBanner.style, {
      position: 'fixed',
      top: '14px',
      left: '50%',
      transform: 'translateX(-50%)',
      zIndex: '120',
      pointerEvents: 'none',
      fontFamily: 'monospace',
      fontSize: '13px',
      fontWeight: '700',
      color: '#fff',
      textShadow: '0 1px 3px rgba(0,0,0,0.9)',
      textAlign: 'center',
      maxWidth: 'min(92vw, 520px)',
      lineHeight: '1.35',
      display: 'none',
    });

    this._roundEndRoot = document.createElement('div');
    Object.assign(this._roundEndRoot.style, {
      position: 'fixed',
      inset: '0',
      zIndex: '200',
      background: 'rgba(0,0,0,0.72)',
      display: 'none',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '16px',
      boxSizing: 'border-box',
      pointerEvents: 'auto',
    });
    this._roundEndRoot.addEventListener('click', () => {
      this._roundEndRoot.style.display = 'none';
    });

    const panel = document.createElement('div');
    Object.assign(panel.style, {
      background: 'linear-gradient(165deg, #1e1a28 0%, #121018 100%)',
      border: '1px solid rgba(255,220,160,0.35)',
      borderRadius: '10px',
      padding: '16px 18px',
      maxWidth: 'min(96vw, 440px)',
      maxHeight: 'min(80vh, 560px)',
      overflow: 'auto',
      color: '#f5f0e6',
      fontFamily: 'monospace',
      fontSize: '11px',
      boxShadow: '0 12px 40px rgba(0,0,0,0.55)',
    });
    this._roundEndTitle = document.createElement('div');
    this._roundEndTitle.style.marginBottom = '10px';
    this._roundEndTitle.style.fontWeight = '800';
    this._roundEndTitle.style.fontSize = '14px';
    this._roundEndBody = document.createElement('div');
    this._roundEndBody.style.whiteSpace = 'pre-wrap';
    this._roundEndHint = document.createElement('div');
    this._roundEndHint.textContent = 'Click anywhere to close';
    this._roundEndHint.style.marginTop = '12px';
    this._roundEndHint.style.opacity = '0.65';
    this._roundEndHint.style.fontSize = '10px';

    panel.appendChild(this._roundEndTitle);
    panel.appendChild(this._roundEndBody);
    panel.appendChild(this._roundEndHint);
    this._roundEndRoot.appendChild(panel);

    this.container.appendChild(this._phaseBanner);
    this.container.appendChild(this._roundEndRoot);
  }

  /**
   * @param {{ phase?: string, phaseEndsAt?: number, number?: number }} round
   * @param {{ title?: string, subtitle?: string }} [hints]
   */
  updatePhaseBanner(round, nowSeconds = Date.now() / 1000, hints = {}) {
    if (!round?.phase || typeof round.phaseEndsAt !== 'number') {
      this._phaseBanner.style.display = 'none';
      return;
    }
    const remain = round.phaseEndsAt - nowSeconds;
    const label = round.phase === 'forage'
      ? `FORAGE  ·  ${formatClock(remain)}`
      : round.phase === 'extract'
        ? `EXTRACT  ·  ${formatClock(remain)}  ·  Hold E in a glowing hole`
        : `ROUND END  ·  ${formatClock(remain)}`;
    const sub = hints.subtitle ? `\n${hints.subtitle}` : '';
    this._phaseBanner.textContent = `${label}${sub}`;
    this._phaseBanner.style.display = 'block';
    if (round.phase === 'extract') {
      this._phaseBanner.style.color = '#fde68a';
    } else if (round.phase === 'intermission') {
      this._phaseBanner.style.color = '#a7f3d0';
    } else {
      this._phaseBanner.style.color = '#fff';
    }
  }

  /**
   * @param {object} data - round-end message payload
   */
  showRoundEnd(data) {
    if (!data?.results?.length) return;
    const rn = data.roundNumber ?? '?';
    this._roundEndTitle.textContent = `Round ${rn} results`;
    const lines = data.results.map((r, i) => {
      const ext = r.extracted ? '✓ EXT' : '✗';
      const name = typeof r.displayName === 'string' && r.displayName.trim()
        ? r.displayName.trim()
        : String(r.id ?? i).slice(0, 10);
      return `${i + 1}. ${name}  ${ext}  score ${r.finalScore ?? 0}  (+${r.xpAwarded ?? 0} XP)`;
    });
    this._roundEndBody.textContent = lines.join('\n');
    this._roundEndRoot.style.display = 'flex';
  }

  dispose() {
    this._phaseBanner.remove();
    this._roundEndRoot.remove();
  }
}
