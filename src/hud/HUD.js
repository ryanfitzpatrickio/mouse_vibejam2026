import { measureText } from '../utils/textLayout.js';

const FONT = '10px monospace';
const BAR_WIDTH = 160;
const LINE_HEIGHT = 14;

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

    this.pingLabel = document.createElement('div');
    this.pingLabel.textContent = '-- ms';
    Object.assign(this.pingLabel.style, {
      color: '#fff',
      fontSize: '10px',
      marginTop: '4px',
      textShadow: '1px 1px 2px #000',
    });
    const pingMeasured = measureText('-- ms', FONT, BAR_WIDTH, LINE_HEIGHT);
    this.pingLabel.style.height = `${pingMeasured.height}px`;
    this.element.appendChild(this.pingLabel);

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

  update({ stamina, health, ping } = {}) {
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
  }

  dispose() {
    this.element.remove();
  }
}
