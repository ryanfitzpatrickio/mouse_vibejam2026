import { For, Show } from 'solid-js';
import { render } from 'solid-js/web';
import { createStore } from 'solid-js/store';
import { batch } from 'solid-js';
import { EMOTES } from './EmoteManager.js';
import {
  HUD_PANEL_STYLE,
  HUD_TRACK_STYLE,
  HUD_LABEL_SHADOW,
  HUD_SMALL_LABEL_FONT,
  HUD_LABEL_FONT,
} from '../hud/hudStyle.js';

const SLOT_COUNT = EMOTES.length;
const SECTOR_ANGLE = (2 * Math.PI) / SLOT_COUNT;
const DEAD_ZONE_PX = 40;
const WHEEL_SIZE = 340;
const SLOT_SIZE = 76;
const SLOT_RADIUS = 116;

function buildSlotLayouts() {
  const center = WHEEL_SIZE / 2;
  const half = SLOT_SIZE / 2;
  const startAngle = -Math.PI / 2;
  return EMOTES.map((emote, i) => {
    const angle = startAngle + i * SECTOR_ANGLE;
    const cx = center + Math.cos(angle) * SLOT_RADIUS - half;
    const cy = center + Math.sin(angle) * SLOT_RADIUS - half;
    return { left: cx, top: cy, label: emote.label, emoji: emote.emoji };
  });
}

function EmoteWheelView(props) {
  const slotStyle = (index) => {
    const on = index === props.state.selectedIndex;
    return {
      position: 'absolute',
      left: `${props.layouts[index].left}px`,
      top: `${props.layouts[index].top}px`,
      width: `${SLOT_SIZE}px`,
      height: `${SLOT_SIZE}px`,
      'border-radius': '16px',
      display: 'flex',
      'flex-direction': 'column',
      'align-items': 'center',
      'justify-content': 'center',
      gap: '2px',
      background: on
        ? 'linear-gradient(180deg, rgba(255,220,140,0.95) 0%, rgba(220,170,80,0.95) 100%)'
        : 'linear-gradient(180deg, rgba(126,136,152,0.95) 0%, rgba(84,93,108,0.95) 100%)',
      border: on
        ? '3px solid rgba(255, 240, 200, 0.95)'
        : '3px solid rgba(180, 190, 210, 0.9)',
      'box-shadow': [
        'inset 0 2px 0 rgba(255,255,255,0.28)',
        'inset 0 -2px 0 rgba(0,0,0,0.35)',
        on ? '0 6px 16px rgba(255,180,80,0.45)' : '0 4px 10px rgba(0,0,0,0.4)',
      ].join(', '),
      color: '#fff',
      'user-select': 'none',
      'pointer-events': 'none',
      transition: 'transform 0.08s, background 0.08s, border-color 0.08s, box-shadow 0.08s',
      transform: on ? 'scale(1.14)' : 'scale(1)',
    };
  };

  return (
    <>
      <div
        ref={(el) => props.setContainerRef?.(el)}
        style={{
          position: 'fixed',
          inset: '0',
          'z-index': '200',
          display: props.state.visible ? 'flex' : 'none',
          'align-items': 'center',
          'justify-content': 'center',
          background: 'rgba(0, 0, 0, 0.35)',
          'backdrop-filter': 'blur(3px)',
          cursor: 'none',
          'touch-action': 'none',
          WebkitTapHighlightColor: 'transparent',
        }}
      >
        <div
          ref={(el) => props.setWheelRef?.(el)}
          style={{
            ...HUD_PANEL_STYLE,
            position: 'relative',
            width: `${WHEEL_SIZE}px`,
            height: `${WHEEL_SIZE}px`,
            'border-radius': '50%',
            'pointer-events': 'none',
          }}
        >
          <div
            style={{
              ...HUD_TRACK_STYLE,
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              width: '110px',
              height: '52px',
              display: 'flex',
              'align-items': 'center',
              'justify-content': 'center',
              color: '#fff',
              font: HUD_LABEL_FONT,
              'letter-spacing': '0.04em',
              'text-shadow': HUD_LABEL_SHADOW,
              'pointer-events': 'none',
              'white-space': 'nowrap',
              transition: 'opacity 0.15s',
              opacity: props.state.centerOpacity,
            }}
          >
            {props.state.centerLabel}
          </div>
          <For each={props.layouts}>
            {(layout, i) => (
              <div style={slotStyle(i())}>
                <div style={{ 'font-size': '28px', 'line-height': '1' }}>{layout.emoji}</div>
                <div
                  style={{
                    font: HUD_SMALL_LABEL_FONT,
                    'letter-spacing': '0.03em',
                    'text-shadow': HUD_LABEL_SHADOW,
                    'line-height': '1',
                  }}
                >
                  {layout.label}
                </div>
              </div>
            )}
          </For>
        </div>
      </div>
      <div
        style={{
          position: 'fixed',
          width: '16px',
          height: '16px',
          'border-radius': '50%',
          background: 'radial-gradient(circle at 30% 30%, #fff7dc 0%, #ffcc66 70%, #b8832a 100%)',
          border: '2px solid rgba(20, 26, 36, 0.85)',
          'pointer-events': 'none',
          display: props.state.cursorVisible ? 'block' : 'none',
          'z-index': '201',
          transform: 'translate(-50%, -50%)',
          'box-shadow': '0 0 8px rgba(255, 210, 120, 0.7), inset 0 1px 0 rgba(255,255,255,0.5)',
          left: `${props.state.cursorLeft}px`,
          top: `${props.state.cursorTop}px`,
        }}
      />
    </>
  );
}

export class EmoteWheel {
  constructor({ onSelect }) {
    this.onSelect = onSelect;
    this._pointerId = null;
    this._centerX = 0;
    this._centerY = 0;
    this._cursorX = 0;
    this._cursorY = 0;
    this._layouts = buildSlotLayouts();
    this._containerRef = null;
    this._wheelRef = null;

    const [state, setState] = createStore({
      visible: false,
      selectedIndex: -1,
      centerLabel: 'EMOTE',
      centerOpacity: 0.5,
      centerColor: 'rgba(255, 240, 220, 0.5)',
      cursorLeft: 0,
      cursorTop: 0,
      cursorVisible: false,
    });
    this._state = state;
    this._setState = setState;

    this._boundMouseMove = this._handleMouseMove.bind(this);
    this._boundMouseUp = this._handleMouseUp.bind(this);
    this._boundPointerDown = this._handlePointerDown.bind(this);
    this._boundPointerMove = this._handlePointerMove.bind(this);
    this._boundPointerUp = this._handlePointerUp.bind(this);

    this._dispose = render(() => (
      <EmoteWheelView
        state={state}
        layouts={this._layouts}
        setContainerRef={(el) => { this._containerRef = el; }}
        setWheelRef={(el) => { this._wheelRef = el; }}
      />
    ), document.body);
  }

  _setPointerCapture(pointerId) {
    try {
      this._containerRef?.setPointerCapture(pointerId);
    } catch { /* ignore */ }
  }

  _releasePointerCapture(pointerId) {
    try {
      if (this._containerRef?.hasPointerCapture?.(pointerId)) {
        this._containerRef.releasePointerCapture(pointerId);
      }
    } catch { /* ignore */ }
  }

  _highlight(index) {
    if (index === this._state.selectedIndex) return;
    if (index >= 0) {
      batch(() => {
        this._setState({
          selectedIndex: index,
          centerLabel: EMOTES[index].label,
          centerOpacity: 1,
          centerColor: 'rgba(255, 230, 180, 0.9)',
        });
      });
    } else {
      batch(() => {
        this._setState({
          selectedIndex: -1,
          centerLabel: 'EMOTE',
          centerOpacity: 0.5,
          centerColor: 'rgba(255, 240, 220, 0.5)',
        });
      });
    }
  }

  _updateSelectionFromCursor() {
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

  _handleMouseMove(e) {
    if (!this._state.visible) return;
    if (document.pointerLockElement) {
      this._cursorX += e.movementX || 0;
      this._cursorY += e.movementY || 0;
    } else if (e.clientX != null) {
      this._cursorX = e.clientX - this._centerX;
      this._cursorY = e.clientY - this._centerY;
    }
    batch(() => {
      this._setState({
        cursorLeft: this._centerX + this._cursorX,
        cursorTop: this._centerY + this._cursorY,
      });
    });
    this._updateSelectionFromCursor();
  }

  _handlePointerDown(e) {
    if (!this._state.visible || this._pointerId !== null) return;
    if (e.cancelable) e.preventDefault();
    e.stopPropagation();
    this._pointerId = e.pointerId;
    this._setPointerCapture(e.pointerId);
    this._cursorX = e.clientX - this._centerX;
    this._cursorY = e.clientY - this._centerY;
    batch(() => {
      this._setState({
        cursorLeft: e.clientX,
        cursorTop: e.clientY,
      });
    });
    this._updateSelectionFromCursor();
  }

  _handlePointerMove(e) {
    if (!this._state.visible || e.pointerId !== this._pointerId) return;
    if (e.cancelable) e.preventDefault();
    e.stopPropagation();
    this._cursorX = e.clientX - this._centerX;
    this._cursorY = e.clientY - this._centerY;
    batch(() => {
      this._setState({
        cursorLeft: e.clientX,
        cursorTop: e.clientY,
      });
    });
    this._updateSelectionFromCursor();
  }

  _handlePointerUp(e) {
    if (e.pointerId !== this._pointerId) return;
    if (e.cancelable) e.preventDefault();
    e.stopPropagation();
    this._releasePointerCapture(e.pointerId);
    this._pointerId = null;
    this.confirm();
  }

  _handleMouseUp() {
    this.confirm();
  }

  confirm() {
    if (!this._state.visible) return;
    const idx = this._state.selectedIndex;
    if (idx >= 0) {
      const emote = EMOTES[idx];
      if (emote) {
        this.hide();
        this.onSelect?.(emote.id);
      }
    } else {
      this.hide();
    }
  }

  _select(index) {
    const emote = EMOTES[index];
    if (!emote) return;
    this.hide();
    this.onSelect?.(emote.id);
  }

  show() {
    batch(() => {
      this._setState({
        visible: true,
        selectedIndex: -1,
        cursorVisible: true,
      });
    });
    this._cursorX = 0;
    this._cursorY = 0;
    this._pointerId = null;
    queueMicrotask(() => {
      const rect = this._wheelRef?.getBoundingClientRect();
      if (!rect) return;
      this._centerX = rect.left + rect.width / 2;
      this._centerY = rect.top + rect.height / 2;
      batch(() => {
        this._setState({
          cursorLeft: this._centerX,
          cursorTop: this._centerY,
        });
      });
      this._highlight(-1);
    });
    this._containerRef?.addEventListener('pointerdown', this._boundPointerDown);
    this._containerRef?.addEventListener('pointermove', this._boundPointerMove);
    this._containerRef?.addEventListener('pointerup', this._boundPointerUp);
    this._containerRef?.addEventListener('pointercancel', this._boundPointerUp);
    document.addEventListener('mousemove', this._boundMouseMove);
    document.addEventListener('mouseup', this._boundMouseUp);
  }

  hide() {
    this._pointerId = null;
    batch(() => {
      this._setState({
        visible: false,
        selectedIndex: -1,
        cursorVisible: false,
      });
    });
    this._containerRef?.removeEventListener('pointerdown', this._boundPointerDown);
    this._containerRef?.removeEventListener('pointermove', this._boundPointerMove);
    this._containerRef?.removeEventListener('pointerup', this._boundPointerUp);
    this._containerRef?.removeEventListener('pointercancel', this._boundPointerUp);
    document.removeEventListener('mousemove', this._boundMouseMove);
    document.removeEventListener('mouseup', this._boundMouseUp);
  }

  toggle() {
    if (this._state.visible) this.hide();
    else this.show();
  }

  dispose() {
    this.hide();
    this._dispose();
  }
}
