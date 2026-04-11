/**
 * Hold Tab to show a simple player list with death counts (multiplayer snapshots).
 */
export class ScoreboardOverlay {
  constructor({ container = document.body } = {}) {
    this.container = container;
    this._tabHeld = false;
    this._rows = [];

    this.panel = document.createElement('div');
    this.panel.setAttribute('role', 'dialog');
    this.panel.setAttribute('aria-label', 'Scoreboard');
    Object.assign(this.panel.style, {
      display: 'none',
      position: 'fixed',
      top: '24px',
      left: '50%',
      transform: 'translateX(-50%)',
      minWidth: '240px',
      maxWidth: 'min(92vw, 560px)',
      zIndex: '101',
      pointerEvents: 'none',
      fontFamily: 'monospace',
      fontSize: '12px',
      color: '#fff',
      textShadow: '1px 1px 2px #000',
      userSelect: 'none',
      background: 'rgba(0,0,0,0.72)',
      border: '1px solid rgba(255,255,255,0.25)',
      borderRadius: '6px',
      padding: '10px 14px',
      boxSizing: 'border-box',
    });

    this.title = document.createElement('div');
    this.title.textContent = 'Players';
    Object.assign(this.title.style, {
      fontWeight: '700',
      fontSize: '11px',
      letterSpacing: '0.06em',
      textTransform: 'uppercase',
      color: 'rgba(255,255,255,0.85)',
      marginBottom: '8px',
      borderBottom: '1px solid rgba(255,255,255,0.15)',
      paddingBottom: '6px',
    });
    this.panel.appendChild(this.title);

    this.list = document.createElement('div');
    Object.assign(this.list.style, {
      display: 'flex',
      flexDirection: 'column',
      gap: '4px',
    });
    this.panel.appendChild(this.list);

    this.container.appendChild(this.panel);

    this._onKeyDown = (e) => {
      if (e.code !== 'Tab') return;
      if (this._isFormTarget(e.target)) return;
      e.preventDefault();
      if (!this._tabHeld) {
        this._tabHeld = true;
        this._render();
      }
    };
    this._onKeyUp = (e) => {
      if (e.code !== 'Tab') return;
      this._tabHeld = false;
      this._render();
    };
    this._onVisibility = () => {
      if (document.hidden) {
        this._tabHeld = false;
        this._render();
      }
    };
    this._onBlur = () => {
      this._tabHeld = false;
      this._render();
    };

    document.addEventListener('keydown', this._onKeyDown);
    document.addEventListener('keyup', this._onKeyUp);
    document.addEventListener('visibilitychange', this._onVisibility);
    window.addEventListener('blur', this._onBlur);
  }

  _isFormTarget(target) {
    return target instanceof HTMLElement
      && (target.isContentEditable || /^(input|textarea|select)$/i.test(target.tagName));
  }

  /**
   * @param {{ label: string, deaths: number, chaseSec: number, cheese: number }[]} rows
   */
  setRows(rows) {
    this._rows = Array.isArray(rows) ? rows : [];
    if (this._tabHeld) this._render();
  }

  _render() {
    if (!this._tabHeld) {
      this.panel.style.display = 'none';
      return;
    }
    this.panel.style.display = 'block';
    this.list.innerHTML = '';

    if (this._rows.length > 0) {
      const header = document.createElement('div');
      Object.assign(header.style, {
        display: 'grid',
        gridTemplateColumns: '1fr auto auto auto',
        alignItems: 'baseline',
        gap: '10px',
        marginBottom: '6px',
        fontSize: '9px',
        fontWeight: '700',
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        color: 'rgba(255,255,255,0.45)',
      });
      const hName = document.createElement('span');
      hName.textContent = 'Player';
      const hChase = document.createElement('span');
      hChase.textContent = 'Chase';
      hChase.style.textAlign = 'right';
      const hCheese = document.createElement('span');
      hCheese.textContent = 'Cheese';
      hCheese.style.textAlign = 'right';
      const hDeaths = document.createElement('span');
      hDeaths.textContent = 'KOs';
      hDeaths.style.textAlign = 'right';
      header.appendChild(hName);
      header.appendChild(hChase);
      header.appendChild(hCheese);
      header.appendChild(hDeaths);
      this.list.appendChild(header);
    }

    for (const row of this._rows) {
      const line = document.createElement('div');
      Object.assign(line.style, {
        display: 'grid',
        gridTemplateColumns: '1fr auto auto auto',
        alignItems: 'baseline',
        gap: '10px',
      });
      const name = document.createElement('span');
      name.textContent = row.label;
      name.style.overflow = 'hidden';
      name.style.textOverflow = 'ellipsis';
      name.style.whiteSpace = 'nowrap';
      const chase = document.createElement('span');
      const cs = Math.max(0, Number(row.chaseSec) || 0);
      chase.textContent = `${cs.toFixed(1)}s`;
      chase.style.flexShrink = '0';
      chase.style.textAlign = 'right';
      chase.style.color = 'rgba(255,220,140,0.95)';
      chase.style.fontWeight = '700';
      chase.style.minWidth = '52px';
      const cheese = document.createElement('span');
      cheese.textContent = String(Math.max(0, Math.floor(Number(row.cheese) || 0)));
      cheese.style.flexShrink = '0';
      cheese.style.textAlign = 'right';
      cheese.style.color = 'rgba(255,236,120,0.98)';
      cheese.style.fontWeight = '700';
      cheese.style.minWidth = '40px';
      const deaths = document.createElement('span');
      deaths.textContent = String(Math.max(0, Math.floor(Number(row.deaths) || 0)));
      deaths.style.flexShrink = '0';
      deaths.style.textAlign = 'right';
      deaths.style.color = 'rgba(255,180,120,0.95)';
      deaths.style.fontWeight = '700';
      deaths.style.minWidth = '28px';
      line.appendChild(name);
      line.appendChild(chase);
      line.appendChild(cheese);
      line.appendChild(deaths);
      this.list.appendChild(line);
    }
    if (this._rows.length === 0) {
      const empty = document.createElement('div');
      empty.textContent = 'No players yet';
      empty.style.color = 'rgba(255,255,255,0.5)';
      empty.style.fontSize = '11px';
      this.list.appendChild(empty);
    }
  }

  dispose() {
    document.removeEventListener('keydown', this._onKeyDown);
    document.removeEventListener('keyup', this._onKeyUp);
    document.removeEventListener('visibilitychange', this._onVisibility);
    window.removeEventListener('blur', this._onBlur);
    this.panel.remove();
  }
}
