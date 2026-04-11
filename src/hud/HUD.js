import { measureText } from '../utils/textLayout.js';

const FONT = '10px monospace';
const BAR_WIDTH = 160;
const LINE_HEIGHT = 14;

/** Inline mouse icon matching favicon.svg (64 viewBox) */
const MOUSE_SVG_NS = 'http://www.w3.org/2000/svg';
function createMouseIconSvg(sizePx) {
  const svg = document.createElementNS(MOUSE_SVG_NS, 'svg');
  svg.setAttribute('xmlns', MOUSE_SVG_NS);
  svg.setAttribute('viewBox', '0 0 64 64');
  svg.setAttribute('width', String(sizePx));
  svg.setAttribute('height', String(sizePx));
  svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML = `
  <circle cx="18" cy="16" r="14" fill="#ccc" stroke="#333" stroke-width="2"/>
  <circle cx="18" cy="16" r="8" fill="#f8a0a0"/>
  <circle cx="46" cy="16" r="14" fill="#ccc" stroke="#333" stroke-width="2"/>
  <circle cx="46" cy="16" r="8" fill="#f8a0a0"/>
  <ellipse cx="32" cy="36" rx="22" ry="20" fill="#ccc" stroke="#333" stroke-width="2"/>
  <g stroke="#000" stroke-width="3" stroke-linecap="round">
    <line x1="21" y1="29" x2="27" y2="35"/><line x1="27" y1="29" x2="21" y2="35"/>
  </g>
  <g stroke="#000" stroke-width="3" stroke-linecap="round">
    <line x1="37" y1="29" x2="43" y2="35"/><line x1="43" y1="29" x2="37" y2="35"/>
  </g>
  <ellipse cx="32" cy="42" rx="3" ry="2.5" fill="#f8a0a0"/>
  <g stroke="#333" stroke-width="1.2" stroke-linecap="round">
    <line x1="12" y1="40" x2="24" y2="42"/><line x1="12" y1="44" x2="24" y2="44"/>
    <line x1="40" y1="42" x2="52" y2="40"/><line x1="40" y1="44" x2="52" y2="44"/>
  </g>`;
  return svg;
}

export class HUD {
  constructor({ container = document.body } = {}) {
    this.container = container;
    this._createElements();
  }

  _createElements() {
    this.element = document.createElement('div');
    this.element.id = 'hud';
    Object.assign(this.element.style, {
      position: 'fixed',
      bottom: '20px',
      left: '20px',
      pointerEvents: 'none',
      zIndex: '100',
      fontFamily: 'monospace',
      userSelect: 'none',
    });

    this.healthBar = this._createBar('HEALTH', '#ff4444', '#661111');
    this.staminaBar = this._createBar('STAMINA', '#44ff88', '#116633');

    this.statsRow = document.createElement('div');
    Object.assign(this.statsRow.style, {
      display: 'flex',
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      width: `${BAR_WIDTH}px`,
      marginTop: '4px',
      gap: '8px',
    });

    this.pingLabel = document.createElement('div');
    this.pingLabel.textContent = '-- ms';
    Object.assign(this.pingLabel.style, {
      color: '#fff',
      fontSize: '10px',
      textShadow: '1px 1px 2px #000',
      flexShrink: '0',
    });
    const pingMeasured = measureText('-- ms', FONT, BAR_WIDTH, LINE_HEIGHT);
    this.pingLabel.style.height = `${pingMeasured.height}px`;

    this.playersWrap = document.createElement('div');
    Object.assign(this.playersWrap.style, {
      display: 'flex',
      flexDirection: 'row',
      alignItems: 'center',
      gap: '6px',
      flexShrink: '0',
    });
    this.playersWrap.appendChild(createMouseIconSvg(20));

    this.playerCountBadge = document.createElement('div');
    this.playerCountBadge.textContent = '1';
    Object.assign(this.playerCountBadge.style, {
      minWidth: '20px',
      height: '20px',
      padding: '0 4px',
      boxSizing: 'border-box',
      borderRadius: '50%',
      background: '#22c55e',
      border: '1px solid rgba(255,255,255,0.35)',
      color: '#fff',
      fontSize: '10px',
      fontWeight: '700',
      lineHeight: '18px',
      textAlign: 'center',
      textShadow: '0 0 2px rgba(0,0,0,0.8)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    });

    this.playersWrap.appendChild(this.playerCountBadge);
    this.statsRow.appendChild(this.pingLabel);
    this.statsRow.appendChild(this.playersWrap);
    this.element.appendChild(this.statsRow);

    this.respawnOverlay = document.createElement('div');
    this.respawnOverlay.style.display = 'none';
    Object.assign(this.respawnOverlay.style, {
      position: 'fixed',
      top: '0',
      left: '0',
      width: '100%',
      height: '100%',
      background: 'rgba(0,0,0,0.5)',
      zIndex: '99',
      pointerEvents: 'none',
      fontFamily: 'monospace',
      userSelect: 'none',
    });

    this.respawnLabel = document.createElement('div');
    this.respawnLabel.textContent = 'RESPAWNING IN 10';
    Object.assign(this.respawnLabel.style, {
      position: 'absolute',
      top: '50%',
      left: '50%',
      transform: 'translate(-50%, -50%)',
      color: '#ff4444',
      fontSize: '24px',
      textShadow: '2px 2px 4px #000',
    });
    this.respawnOverlay.appendChild(this.respawnLabel);
    this.container.appendChild(this.respawnOverlay);

    this.container.appendChild(this.element);
  }

  _createBar(label, fgColor, bgColor) {
    const wrapper = document.createElement('div');
    Object.assign(wrapper.style, {
      marginBottom: '6px',
      width: '160px',
    });

    const lbl = document.createElement('div');
    lbl.textContent = label;
    Object.assign(lbl.style, {
      color: '#fff',
      fontSize: '10px',
      marginBottom: '2px',
      textShadow: '1px 1px 2px #000',
    });
    const labelMeasured = measureText(label, FONT, BAR_WIDTH, LINE_HEIGHT);
    lbl.style.height = `${labelMeasured.height}px`;

    const bg = document.createElement('div');
    Object.assign(bg.style, {
      width: '100%',
      height: '8px',
      background: bgColor,
      border: '1px solid rgba(255,255,255,0.3)',
    });

    const fg = document.createElement('div');
    Object.assign(fg.style, {
      width: '100%',
      height: '100%',
      background: fgColor,
      transition: 'width 0.1s',
    });

    bg.appendChild(fg);
    wrapper.appendChild(lbl);
    wrapper.appendChild(bg);
    this.element.appendChild(wrapper);
    return fg;
  }

  update({ stamina, health, ping, playerCount, alive = true, respawnCountdown = 0 } = {}) {
    if (stamina !== undefined) {
      this.staminaBar.style.width = `${Math.max(0, Math.min(1, stamina)) * 100}%`;
    }
    if (health !== undefined) {
      this.healthBar.style.width = `${Math.max(0, Math.min(1, health)) * 100}%`;
    }
    if (ping !== undefined) {
      const text = `${Math.round(ping)} ms`;
      this.pingLabel.textContent = text;
      const measured = measureText(text, FONT, BAR_WIDTH, LINE_HEIGHT);
      this.pingLabel.style.height = `${measured.height}px`;
    }
    if (playerCount !== undefined) {
      const n = Math.max(0, Math.floor(playerCount));
      const measured = measureText(String(n), FONT, BAR_WIDTH, LINE_HEIGHT);
      this.playerCountBadge.textContent = String(n);
      this.playerCountBadge.style.height = `${measured.height}px`;
    }

    if (!alive && respawnCountdown > 0) {
      this.respawnOverlay.style.display = 'block';
      const seconds = Math.ceil(respawnCountdown);
      this.respawnLabel.textContent = `RESPAWNING IN ${seconds}`;
    } else {
      this.respawnOverlay.style.display = 'none';
    }
  }

  dispose() {
    this.element.remove();
  }
}
