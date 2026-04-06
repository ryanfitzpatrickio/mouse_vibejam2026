import { EMOTES } from './EmoteManager.js';
import { measureText } from '../utils/textLayout.js';

const SLOT_COUNT = EMOTES.length;
const SECTOR_ANGLE = (2 * Math.PI) / SLOT_COUNT;
const DEAD_ZONE_PX = 30;
const SLOT_FONT = '10px monospace';
const SLOT_WIDTH = 52;
const SLOT_LINE_HEIGHT = 12;

export class EmoteWheel {
  constructor({ onSelect }) {
    this.onSelect = onSelect;
    this.visible = false;
    this.selectedIndex = -1;
    this._container = null;
    this._wheel = null;
    this._slots = [];
    this._centerX = 0;
    this._centerY = 0;
    this._cursorX = 0;
    this._cursorY = 0;
    this._boundMouseMove = this._handleMouseMove.bind(this);
    this._boundMouseUp = this._handleMouseUp.bind(this);
    this._build();
  }

  _build() {
    this._container = document.createElement('div');
    Object.assign(this._container.style, {
      position: 'fixed',
      inset: '0',
      zIndex: '200',
      display: 'none',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'rgba(0, 0, 0, 0.25)',
      backdropFilter: 'blur(2px)',
      cursor: 'none',
    });

    this._wheel = document.createElement('div');
    Object.assign(this._wheel.style, {
      position: 'relative',
      width: '280px',
      height: '280px',
      borderRadius: '50%',
      background: 'rgba(20, 16, 12, 0.55)',
      backdropFilter: 'blur(16px)',
      border: '1px solid rgba(255, 255, 255, 0.12)',
      boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.08)',
      pointerEvents: 'none',
    });
    this._container.appendChild(this._wheel);

    this._cursorDot = document.createElement('div');
    Object.assign(this._cursorDot.style, {
      position: 'fixed',
      width: '12px',
      height: '12px',
      borderRadius: '50%',
      background: 'rgba(255, 230, 180, 0.85)',
      border: '1px solid rgba(255, 255, 255, 0.4)',
      pointerEvents: 'none',
      display: 'none',
      zIndex: '201',
      transform: 'translate(-50%, -50%)',
      boxShadow: '0 0 6px rgba(255, 220, 160, 0.4)',
    });
    document.body.appendChild(this._cursorDot);

    this._centerLabel = document.createElement('div');
    Object.assign(this._centerLabel.style, {
      position: 'absolute',
      top: '50%',
      left: '50%',
      transform: 'translate(-50%, -50%)',
      color: 'rgba(255, 240, 220, 0.5)',
      fontFamily: 'monospace',
      fontSize: '10px',
      textAlign: 'center',
      pointerEvents: 'none',
      whiteSpace: 'nowrap',
      transition: 'opacity 0.15s',
    });
    this._centerLabel.textContent = 'EMOTE';
    this._wheel.appendChild(this._centerLabel);

    const radius = 100;
    const startAngle = -Math.PI / 2;
    const step = SECTOR_ANGLE;

    EMOTES.forEach((emote, i) => {
      const angle = startAngle + i * step;
      const cx = 140 + Math.cos(angle) * radius - 28;
      const cy = 140 + Math.sin(angle) * radius - 28;

      const measured = measureText(emote.label, SLOT_FONT, SLOT_WIDTH, SLOT_LINE_HEIGHT);

      const slot = document.createElement('div');
      Object.assign(slot.style, {
        position: 'absolute',
        left: `${cx}px`,
        top: `${cy}px`,
        width: '56px',
        height: `${Math.max(56, measured.height + 4)}px`,
        borderRadius: '12px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(255, 255, 255, 0.06)',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        color: '#f0e8dc',
        fontFamily: 'monospace',
        fontSize: '10px',
        textAlign: 'center',
        lineHeight: `${SLOT_LINE_HEIGHT}px`,
        padding: '2px',
        userSelect: 'none',
        pointerEvents: 'none',
        transition: 'transform 0.08s, background 0.08s, border-color 0.08s',
      });
      slot.textContent = emote.label;
      this._slots.push(slot);
      this._wheel.appendChild(slot);
    });

    document.body.appendChild(this._container);
  }

  _handleMouseMove(e) {
    if (!this.visible) return;

    if (document.pointerLockElement) {
      this._cursorX += e.movementX || 0;
      this._cursorY += e.movementY || 0;
    } else if (e.clientX != null) {
      this._cursorX = e.clientX - this._centerX;
      this._cursorY = e.clientY - this._centerY;
    }

    this._cursorDot.style.left = `${this._centerX + this._cursorX}px`;
    this._cursorDot.style.top = `${this._centerY + this._cursorY}px`;

    const dist = Math.sqrt(this._cursorX * this._cursorX + this._cursorY * this._cursorY);

    if (dist < DEAD_ZONE_PX) {
      this._highlight(-1);
      return;
    }

    let angle = Math.atan2(this._cursorY, this._cursorX) + Math.PI / 2;
    if (angle < 0) angle += 2 * Math.PI;

    let index = Math.floor(angle / SECTOR_ANGLE);
    if (index >= SLOT_COUNT) index = 0;
    this._highlight(index);
  }

  _handleMouseUp() {
    this.confirm();
  }

  confirm() {
    if (!this.visible) return;
    if (this.selectedIndex >= 0) {
      this._select(this.selectedIndex);
    } else {
      this.hide();
    }
  }

  _highlight(index) {
    if (index === this.selectedIndex) return;
    this.selectedIndex = index;

    this._slots.forEach((slot, i) => {
      if (i === index) {
        slot.style.background = 'rgba(255, 255, 255, 0.15)';
        slot.style.borderColor = 'rgba(255, 230, 180, 0.4)';
        slot.style.transform = 'scale(1.12)';
      } else {
        slot.style.background = 'rgba(255, 255, 255, 0.06)';
        slot.style.borderColor = 'rgba(255, 255, 255, 0.1)';
        slot.style.transform = 'scale(1)';
      }
    });

    if (index >= 0) {
      this._centerLabel.textContent = EMOTES[index].label;
      this._centerLabel.style.opacity = '1';
      this._centerLabel.style.color = 'rgba(255, 230, 180, 0.9)';
    } else {
      this._centerLabel.textContent = 'EMOTE';
      this._centerLabel.style.opacity = '0.5';
      this._centerLabel.style.color = 'rgba(255, 240, 220, 0.5)';
    }
  }

  _select(index) {
    const emote = EMOTES[index];
    if (!emote) return;
    this.hide();
    this.onSelect?.(emote.id);
  }

  show() {
    this.visible = true;
    this.selectedIndex = -1;
    this._cursorX = 0;
    this._cursorY = 0;
    this._container.style.display = 'flex';
    const rect = this._wheel.getBoundingClientRect();
    this._centerX = rect.left + rect.width / 2;
    this._centerY = rect.top + rect.height / 2;
    this._cursorDot.style.left = `${this._centerX}px`;
    this._cursorDot.style.top = `${this._centerY}px`;
    this._cursorDot.style.display = 'block';
    this._highlight(-1);
    document.addEventListener('mousemove', this._boundMouseMove);
    document.addEventListener('mouseup', this._boundMouseUp);
  }

  hide() {
    this.visible = false;
    this.selectedIndex = -1;
    this._container.style.display = 'none';
    this._cursorDot.style.display = 'none';
    document.removeEventListener('mousemove', this._boundMouseMove);
    document.removeEventListener('mouseup', this._boundMouseUp);
    this._slots.forEach((slot) => {
      slot.style.background = 'rgba(255, 255, 255, 0.06)';
      slot.style.borderColor = 'rgba(255, 255, 255, 0.1)';
      slot.style.transform = 'scale(1)';
    });
  }

  toggle() {
    if (this.visible) this.hide();
    else this.show();
  }

  dispose() {
    this.hide();
    this._container?.remove();
    this._cursorDot?.remove();
  }
}
