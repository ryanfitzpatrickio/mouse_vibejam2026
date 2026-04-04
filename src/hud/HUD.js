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

  update({ stamina, health } = {}) {
    if (stamina !== undefined) {
      this.staminaBar.style.width = `${Math.max(0, Math.min(1, stamina)) * 100}%`;
    }
    if (health !== undefined) {
      this.healthBar.style.width = `${Math.max(0, Math.min(1, health)) * 100}%`;
    }
  }

  dispose() {
    this.element.remove();
  }
}
