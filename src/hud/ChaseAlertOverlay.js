/**
 * Top-center warning while the cat is actively hunting this player (server chase streak).
 */
export class ChaseAlertOverlay {
  constructor({ container = document.body } = {}) {
    this.root = document.createElement('div');
    this.root.setAttribute('role', 'status');
    this.root.setAttribute('aria-live', 'polite');
    Object.assign(this.root.style, {
      display: 'none',
      position: 'fixed',
      top: '64px',
      left: '50%',
      transform: 'translateX(-50%)',
      zIndex: '102',
      pointerEvents: 'none',
      userSelect: 'none',
      textAlign: 'center',
      fontFamily: 'monospace',
      padding: '10px 22px',
      borderRadius: '8px',
      background: 'linear-gradient(180deg, rgba(120,20,20,0.92), rgba(40,8,8,0.88))',
      border: '1px solid rgba(255,120,80,0.55)',
      boxShadow: '0 4px 18px rgba(0,0,0,0.45)',
    });

    this.titleEl = document.createElement('div');
    this.titleEl.textContent = 'CHASED';
    Object.assign(this.titleEl.style, {
      fontSize: '11px',
      fontWeight: '800',
      letterSpacing: '0.28em',
      color: 'rgba(255,200,160,0.95)',
      textShadow: '0 0 8px rgba(255,80,40,0.6)',
      marginBottom: '4px',
    });
    this.root.appendChild(this.titleEl);

    this.timerEl = document.createElement('div');
    Object.assign(this.timerEl.style, {
      fontSize: '22px',
      fontWeight: '700',
      color: '#fff',
      textShadow: '0 1px 3px #000, 0 0 12px rgba(255,60,30,0.35)',
      lineHeight: '1.1',
    });
    this.root.appendChild(this.timerEl);

    container.appendChild(this.root);
  }

  /**
   * @param {{ active?: boolean, streakSeconds?: number }} opts
   */
  update({ active = false, streakSeconds = 0 } = {}) {
    const on = active && streakSeconds > 0.02;
    if (!on) {
      this.root.style.display = 'none';
      return;
    }
    this.root.style.display = 'block';
    this.timerEl.textContent = `${streakSeconds.toFixed(1)}s`;
  }

  dispose() {
    this.root.remove();
  }
}
