import { createSignal, For, Show, onCleanup } from 'solid-js';
import { render } from 'solid-js/web';
import {
  HUD_PANEL_STYLE,
  HUD_LABEL_FONT,
  HUD_SMALL_LABEL_FONT,
} from '../hud/hudStyle.js';
import { getUnlockHeroDef } from '../../shared/heroUnlocks.js';

const SLOT_COUNT = 3;

function UnlockView({ heroKey, getCollected, onSubmit, onCancel }) {
  const def = getUnlockHeroDef(heroKey);
  const [slots, setSlots] = createSignal(new Array(SLOT_COUNT).fill(false));
  const [flashing, setFlashing] = createSignal(false);
  const [errMsg, setErrMsg] = createSignal('');

  const filled = () => slots().filter(Boolean).length;

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
    }
  }

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
                onClick={() => handleClick(i())}
                style={{
                  width: '72px', height: '72px', 'border-radius': '10px',
                  border: active ? '2px solid #ffd27a' : '2px dashed #857055',
                  background: active
                    ? (flashing() ? '#fff8dd' : '#b48a4a')
                    : 'rgba(40,30,20,0.55)',
                  cursor: flashing() ? 'default' : 'pointer',
                  transition: 'all 0.22s ease',
                  'box-shadow': flashing() && active ? '0 0 24px 8px #ffdf8a' : 'none',
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
            Cancel (Esc)
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
