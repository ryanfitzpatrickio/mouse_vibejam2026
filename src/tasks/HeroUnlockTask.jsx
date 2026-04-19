import { createSignal, For, Show, onCleanup, onMount } from 'solid-js';
import { render } from 'solid-js/web';
import {
  HUD_PANEL_STYLE,
  HUD_LABEL_FONT,
  HUD_SMALL_LABEL_FONT,
} from '../hud/hudStyle.js';
import { getUnlockHeroDef } from '../../shared/heroUnlocks.js';
import { actionLabel, setInputSource } from '../input/inputSource.js';

const SLOT_COUNT = 3;

function UnlockView({ heroKey, getCollected, onSubmit, onCancel }) {
  const def = getUnlockHeroDef(heroKey);
  const [slots, setSlots] = createSignal(new Array(SLOT_COUNT).fill(false));
  const [flashing, setFlashing] = createSignal(false);
  const [errMsg, setErrMsg] = createSignal('');
  const [selected, setSelected] = createSignal(0);

  const filled = () => slots().filter(Boolean).length;

  const moveSelection = (delta) => {
    const s = slots();
    if (s.length === 0) return;
    let idx = selected();
    for (let step = 0; step < s.length; step += 1) {
      idx = (idx + delta + s.length) % s.length;
      if (!s[idx]) { setSelected(idx); return; }
    }
  };

  const confirmSelected = () => {
    handleClick(selected());
  };

  function handleClick(i) {
    if (flashing()) return;
    const next = slots().slice();
    if (next[i]) return;
    const collected = getCollected?.() ?? 0;
    if (!import.meta.env.DEV && filled() >= collected) {
      setErrMsg(`You only have ${collected} ${def?.itemShortPlural}.`);
      return;
    }
    next[i] = true;
    setSlots(next);
    setErrMsg('');
    if (next.every(Boolean)) {
      setFlashing(true);
      setTimeout(() => onSubmit?.(), 720);
    } else {
      // Advance the selector to the next empty slot.
      for (let step = 1; step <= next.length; step += 1) {
        const nextIdx = (i + step) % next.length;
        if (!next[nextIdx]) { setSelected(nextIdx); break; }
      }
    }
  }

  onMount(() => {
    const onKey = (e) => {
      if (flashing()) return;
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp' || e.key === 'a' || e.key === 'A' || e.key === 'w' || e.key === 'W') {
        e.preventDefault();
        setInputSource('keyboard');
        moveSelection(-1);
      } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === 'd' || e.key === 'D' || e.key === 's' || e.key === 'S') {
        e.preventDefault();
        setInputSource('keyboard');
        moveSelection(1);
      } else if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        e.stopPropagation();
        setInputSource('keyboard');
        confirmSelected();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onCancel?.();
      }
    };
    document.addEventListener('keydown', onKey, true);

    const padState = { left: false, right: false, up: false, down: false, a: false, b: false, axisLatched: false };
    let raf = 0;
    const poll = () => {
      const pads = typeof navigator !== 'undefined' && navigator.getGamepads
        ? navigator.getGamepads() : [];
      let pad = null;
      for (const p of pads) { if (p && p.connected) { pad = p; break; } }
      if (pad && !flashing()) {
        const left = !!pad.buttons[14]?.pressed;
        const right = !!pad.buttons[15]?.pressed;
        const up = !!pad.buttons[12]?.pressed;
        const down = !!pad.buttons[13]?.pressed;
        const a = !!pad.buttons[0]?.pressed;
        const b = !!pad.buttons[1]?.pressed;
        const sx = pad.axes[0] ?? 0;
        const sy = pad.axes[1] ?? 0;
        const anyActivity = left || right || up || down || a || b
          || Math.abs(sx) > 0.3 || Math.abs(sy) > 0.3;
        if (anyActivity) setInputSource('gamepad');

        if ((left && !padState.left) || (up && !padState.up)) moveSelection(-1);
        if ((right && !padState.right) || (down && !padState.down)) moveSelection(1);
        if (a && !padState.a) confirmSelected();
        if (b && !padState.b) onCancel?.();

        const axisNeg = sx < -0.5 || sy < -0.5;
        const axisPos = sx > 0.5 || sy > 0.5;
        if (axisNeg && !padState.axisLatched) {
          moveSelection(-1);
          padState.axisLatched = true;
        } else if (axisPos && !padState.axisLatched) {
          moveSelection(1);
          padState.axisLatched = true;
        } else if (Math.abs(sx) < 0.3 && Math.abs(sy) < 0.3) {
          padState.axisLatched = false;
        }

        padState.left = left; padState.right = right;
        padState.up = up; padState.down = down;
        padState.a = a; padState.b = b;
      }
      raf = requestAnimationFrame(poll);
    };
    raf = requestAnimationFrame(poll);

    onCleanup(() => {
      document.removeEventListener('keydown', onKey, true);
      cancelAnimationFrame(raf);
    });
  });

  return (
    <div
      style={{
        position: 'fixed', inset: '0', background: 'rgba(0,0,0,0.55)',
        display: 'flex', 'align-items': 'center', 'justify-content': 'center',
        'z-index': '1000',
      }}
    >
      <div style={{ ...HUD_PANEL_STYLE, padding: '20px 24px', 'min-width': '340px' }}>
        <div style={{ font: HUD_LABEL_FONT, 'margin-bottom': '6px' }}>
          Give {SLOT_COUNT} {def?.itemPlural ?? 'items'} to {def?.label ?? heroKey}
        </div>
        <div style={{ font: HUD_SMALL_LABEL_FONT, color: '#c4b08c', 'margin-bottom': '14px' }}>
          Click the items you want to submit.
        </div>
        <div style={{ display: 'flex', gap: '12px', 'justify-content': 'center', 'margin-bottom': '12px' }}>
          <For each={slots()}>
            {(active, i) => (
              <button
                type="button"
                onClick={() => { setSelected(i()); handleClick(i()); }}
                onMouseEnter={() => setSelected(i())}
                style={{
                  width: '72px', height: '72px', 'border-radius': '10px',
                  border: selected() === i() && !active
                    ? '2px solid #ffffff'
                    : active ? '2px solid #ffd27a' : '2px dashed #857055',
                  background: active
                    ? (flashing() ? '#fff8dd' : '#b48a4a')
                    : 'rgba(40,30,20,0.55)',
                  cursor: flashing() ? 'default' : 'pointer',
                  transition: 'all 0.22s ease',
                  'box-shadow': flashing() && active
                    ? '0 0 24px 8px #ffdf8a'
                    : selected() === i() && !active ? '0 0 12px 2px rgba(255,255,255,0.6)' : 'none',
                  color: active ? '#1a1008' : '#d7c5a7',
                  font: HUD_LABEL_FONT,
                }}
              >
                {active ? '★' : (i() + 1).toString()}
              </button>
            )}
          </For>
        </div>
        <Show when={errMsg()}>
          <div style={{ color: '#ffb36b', font: HUD_SMALL_LABEL_FONT, 'text-align': 'center' }}>{errMsg()}</div>
        </Show>
        <div style={{ 'margin-top': '12px', display: 'flex', 'justify-content': 'space-between', font: HUD_SMALL_LABEL_FONT, color: '#c4b08c' }}>
          <span>You have: {getCollected?.() ?? 0}</span>
          <button
            type="button"
            onClick={() => onCancel?.()}
            disabled={flashing()}
            style={{
              background: 'transparent', border: 'none', color: '#c4b08c',
              cursor: flashing() ? 'default' : 'pointer', font: HUD_SMALL_LABEL_FONT,
            }}
          >
            Cancel ({actionLabel('cancel')})
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Open the hero-unlock submit dialog. Returns { close } so the TaskController
 * can force-close on disconnect or round-end.
 */
export function openHeroUnlockTask(heroKey) {
  return ({ onComplete, onCancel } = {}) => {
    const host = document.createElement('div');
    host.setAttribute('data-task', `unlock-${heroKey}`);
    document.body.appendChild(host);

    let finished = false;
    const finish = (fn) => {
      if (finished) return;
      finished = true;
      fn?.();
      close();
    };

    const dispose = render(() => (
      <UnlockView
        heroKey={heroKey}
        getCollected={() => window.__unlockCollected?.(heroKey) ?? 0}
        onSubmit={() => finish(onComplete)}
        onCancel={() => finish(onCancel)}
      />
    ), host);

    const keyHandler = (e) => {
      if (e.key === 'Escape') finish(onCancel);
    };
    window.addEventListener('keydown', keyHandler);

    function close() {
      window.removeEventListener('keydown', keyHandler);
      dispose();
      host.remove();
    }

    onCleanup(close);
    return { close };
  };
}
