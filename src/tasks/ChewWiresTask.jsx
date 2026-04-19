import { createSignal, For, Show, onCleanup, onMount } from 'solid-js';
import { render } from 'solid-js/web';
import {
  HUD_PANEL_STYLE,
  HUD_LABEL_FONT,
  HUD_LABEL_SHADOW,
  HUD_SMALL_LABEL_FONT,
} from '../hud/hudStyle.js';

const BOARD_W = 640;
const BOARD_H = 420;
const WIRE_COUNT = 8;
const TARGET_COUNT = 4;

const WIRE_PALETTE = [
  { base: '#3a3f4a', glow: '#3a3f4a', name: 'drab' },
  { base: '#4c4030', glow: '#4c4030', name: 'tan' },
  { base: '#2d3b4c', glow: '#2d3b4c', name: 'blue-dim' },
  { base: '#3b2d4c', glow: '#3b2d4c', name: 'violet-dim' },
];
const HIGHLIGHT_PALETTE = [
  { base: '#ff4d4d', glow: '#ffb36b', name: 'red' },
  { base: '#32d14a', glow: '#9dffa8', name: 'green' },
  { base: '#4db8ff', glow: '#b3e1ff', name: 'blue' },
  { base: '#ffd23f', glow: '#fff1a8', name: 'yellow' },
];

function rand(min, max) {
  return min + Math.random() * (max - min);
}

function shuffle(arr) {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function buildWirePath(startY, endY) {
  const cx1 = rand(BOARD_W * 0.25, BOARD_W * 0.45);
  const cy1 = startY + rand(-60, 60);
  const cx2 = rand(BOARD_W * 0.55, BOARD_W * 0.75);
  const cy2 = endY + rand(-60, 60);
  const startX = -24;
  const endX = BOARD_W + 24;
  return {
    d: `M ${startX} ${startY} C ${cx1} ${cy1} ${cx2} ${cy2} ${endX} ${endY}`,
    startX, startY, endX, endY,
    cx1, cy1, cx2, cy2,
  };
}

function generateWires() {
  const wires = [];
  const verticalSlots = [];
  const rowHeight = (BOARD_H - 60) / WIRE_COUNT;
  for (let i = 0; i < WIRE_COUNT; i += 1) {
    verticalSlots.push(30 + rowHeight * (i + 0.5) + rand(-12, 12));
  }
  const shuffledSlots = shuffle(verticalSlots);
  const targetIndices = new Set(
    shuffle(Array.from({ length: WIRE_COUNT }, (_, i) => i)).slice(0, TARGET_COUNT),
  );
  const highlightColors = shuffle(HIGHLIGHT_PALETTE);
  const dullColors = shuffle(WIRE_PALETTE);
  let dullIdx = 0;
  let hlIdx = 0;
  for (let i = 0; i < WIRE_COUNT; i += 1) {
    const startY = shuffledSlots[i];
    const endY = shuffledSlots[(i + 3) % WIRE_COUNT];
    const path = buildWirePath(startY, endY);
    const isTarget = targetIndices.has(i);
    const color = isTarget
      ? highlightColors[hlIdx++ % highlightColors.length]
      : dullColors[dullIdx++ % dullColors.length];
    wires.push({
      id: `wire-${i}`,
      path,
      color,
      isTarget,
      cut: false,
      cutT: rand(0.4, 0.6),
    });
  }
  return wires;
}

function WireView(props) {
  const wire = () => props.wire;
  const cut = () => wire().cut;
  const color = () => wire().color;

  const handleClick = (e) => {
    e.stopPropagation();
    if (cut()) return;
    props.onCut(wire());
  };

  return (
    <g>
      <Show when={!cut()}>
        <path
          d={wire().path.d}
          stroke={color().glow}
          stroke-width={wire().isTarget ? 16 : 12}
          fill="none"
          stroke-linecap="round"
          style={{
            opacity: wire().isTarget ? 0.55 : 0.25,
            filter: wire().isTarget ? 'blur(6px)' : 'blur(3px)',
            'pointer-events': 'none',
          }}
        />
        <path
          d={wire().path.d}
          stroke={color().base}
          stroke-width={wire().isTarget ? 7 : 6}
          fill="none"
          stroke-linecap="round"
          style={{
            'pointer-events': 'none',
            filter: wire().isTarget
              ? `drop-shadow(0 0 4px ${color().glow})`
              : 'none',
          }}
        />
        <path
          d={wire().path.d}
          stroke="transparent"
          stroke-width={wire().isTarget ? 48 : 20}
          fill="none"
          stroke-linecap="round"
          style={{
            cursor: 'crosshair',
            'pointer-events': 'stroke',
          }}
          onClick={handleClick}
          onPointerDown={handleClick}
        />
        <Show when={wire().isTarget}>
          <path
            d={wire().path.d}
            stroke="#fff"
            stroke-width={2}
            fill="none"
            stroke-linecap="round"
            stroke-dasharray="4 10"
            style={{
              'pointer-events': 'none',
              opacity: 0.85,
              animation: 'chewwires-dash 1.2s linear infinite',
            }}
          />
        </Show>
      </Show>
      <Show when={cut()}>
        <CutWireHalves wire={wire()} />
      </Show>
    </g>
  );
}

function CutWireHalves(props) {
  const wire = () => props.wire;
  const t = () => wire().cutT;
  const head = () => {
    const w = wire();
    const { startX, startY, endX, endY, cx1, cy1, cx2, cy2 } = w.path;
    // Split cubic at t using de Casteljau
    const T = t();
    const p0 = { x: startX, y: startY };
    const p1 = { x: cx1, y: cy1 };
    const p2 = { x: cx2, y: cy2 };
    const p3 = { x: endX, y: endY };
    const q0 = lerp(p0, p1, T);
    const q1 = lerp(p1, p2, T);
    const q2 = lerp(p2, p3, T);
    const r0 = lerp(q0, q1, T);
    const r1 = lerp(q1, q2, T);
    const s = lerp(r0, r1, T);
    return {
      first: `M ${p0.x} ${p0.y} C ${q0.x} ${q0.y} ${r0.x} ${r0.y} ${s.x} ${s.y}`,
      second: `M ${s.x} ${s.y} C ${r1.x} ${r1.y} ${q2.x} ${q2.y} ${p3.x} ${p3.y}`,
      splitPoint: s,
    };
  };
  return (
    <>
      <path
        d={head().first}
        stroke={wire().color.base}
        stroke-width={wire().isTarget ? 7 : 6}
        fill="none"
        stroke-linecap="round"
        style={{
          opacity: 0.6,
          transform: 'translateY(18px) rotate(-3deg)',
          'transform-origin': `${wire().path.startX}px ${wire().path.startY}px`,
          transition: 'transform 0.5s ease-out, opacity 0.5s ease-out',
        }}
      />
      <path
        d={head().second}
        stroke={wire().color.base}
        stroke-width={wire().isTarget ? 7 : 6}
        fill="none"
        stroke-linecap="round"
        style={{
          opacity: 0.6,
          transform: 'translateY(22px) rotate(4deg)',
          'transform-origin': `${wire().path.endX}px ${wire().path.endY}px`,
          transition: 'transform 0.5s ease-out, opacity 0.5s ease-out',
        }}
      />
      <g transform={`translate(${head().splitPoint.x} ${head().splitPoint.y})`}>
        <For each={[0, 60, 120, 180, 240, 300]}>
          {(ang, idx) => (
            <line
              x1="0"
              y1="0"
              x2={Math.cos((ang / 180) * Math.PI) * 10}
              y2={Math.sin((ang / 180) * Math.PI) * 10}
              stroke="#ffd27a"
              stroke-width="2"
              style={{ opacity: 0.95 - idx() * 0.05 }}
            />
          )}
        </For>
      </g>
    </>
  );
}

function lerp(a, b, t) {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

function ChewWiresView(props) {
  const [wires, setWires] = createSignal(generateWires());
  const [mistakes, setMistakes] = createSignal(0);
  const [done, setDone] = createSignal(false);

  const targetsRemaining = () =>
    wires().filter((w) => w.isTarget && !w.cut).length;

  const onCutWire = (wire) => {
    if (done()) return;
    setWires((cur) => cur.map((w) => (w.id === wire.id ? { ...w, cut: true } : w)));
    if (!wire.isTarget) {
      setMistakes((m) => m + 1);
      return;
    }
    if (targetsRemaining() === 0) {
      setDone(true);
      setTimeout(() => {
        props.onComplete?.();
      }, 550);
    }
  };

  const handleCancel = (e) => {
    e?.stopPropagation?.();
    props.onCancel?.();
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: '0',
        'z-index': '400',
        display: 'flex',
        'align-items': 'center',
        'justify-content': 'center',
        background: 'rgba(8, 10, 16, 0.68)',
        'backdrop-filter': 'blur(4px)',
      }}
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) handleCancel(e);
      }}
    >
      <style>{`
        @keyframes chewwires-dash {
          from { stroke-dashoffset: 0; }
          to { stroke-dashoffset: -28; }
        }
        @keyframes chewwires-pulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.06); }
        }
      `}</style>
      <div
        style={{
          ...HUD_PANEL_STYLE,
          padding: '14px',
          display: 'grid',
          gap: '10px',
          width: 'min(676px, calc(100vw - 20px))',
          'max-height': 'calc(100dvh - 20px)',
          'box-sizing': 'border-box',
          overflow: 'hidden',
        }}
      >
        <div style={{ display: 'flex', 'justify-content': 'space-between', 'align-items': 'center' }}>
          <div
            style={{
              font: HUD_LABEL_FONT,
              color: '#ffe08a',
              'letter-spacing': '0.04em',
              'text-shadow': HUD_LABEL_SHADOW,
            }}
          >
            Chew wires
          </div>
          <div
            style={{
              font: HUD_SMALL_LABEL_FONT,
              color: '#ffd27a',
              'text-shadow': HUD_LABEL_SHADOW,
            }}
          >
            Bite the glowing wires — {targetsRemaining()} left
          </div>
        </div>
        <div
          style={{
            background: 'linear-gradient(180deg, #1a2230 0%, #0a0f18 100%)',
            border: '2px solid rgba(20, 26, 36, 0.85)',
            'border-radius': '12px',
            padding: '8px',
            'box-shadow': 'inset 0 2px 8px rgba(0,0,0,0.55)',
          }}
        >
          <svg
            viewBox={`0 0 ${BOARD_W} ${BOARD_H}`}
            preserveAspectRatio="xMidYMid meet"
            style={{
              display: 'block',
              width: '100%',
              height: 'auto',
              'max-height': 'calc(100dvh - 160px)',
              'border-radius': '8px',
              background: 'radial-gradient(ellipse at center, #1f2a3a 0%, #090d14 90%)',
            }}
          >
            <For each={wires()}>
              {(wire) => <WireView wire={wire} onCut={onCutWire} />}
            </For>
            <Show when={done()}>
              <text
                x={BOARD_W / 2}
                y={BOARD_H / 2}
                text-anchor="middle"
                style={{
                  font: '800 42px "Fredoka", "Baloo", system-ui, sans-serif',
                  fill: '#ffe08a',
                  'text-shadow': HUD_LABEL_SHADOW,
                  animation: 'chewwires-pulse 0.5s ease-out',
                }}
              >
                Chewed!
              </text>
            </Show>
          </svg>
        </div>
        <div
          style={{
            display: 'flex',
            'justify-content': 'space-between',
            'align-items': 'center',
            color: '#d7c5a7',
            font: HUD_SMALL_LABEL_FONT,
            'text-shadow': HUD_LABEL_SHADOW,
          }}
        >
          <div>Mistakes: {mistakes()}</div>
          <button
            type="button"
            onClick={handleCancel}
            style={{
              ...HUD_PANEL_STYLE,
              padding: '6px 14px',
              font: HUD_SMALL_LABEL_FONT,
              color: '#fff',
              cursor: 'pointer',
              border: '2px solid rgba(180, 190, 210, 0.9)',
            }}
          >
            Leave (Esc)
          </button>
        </div>
      </div>
    </div>
  );
}

export function openChewWiresTask({ onComplete, onCancel } = {}) {
  const host = document.createElement('div');
  host.setAttribute('data-task', 'chew-wires');
  document.body.appendChild(host);

  let finished = false;
  const dispose = render(() => (
    <ChewWiresView
      onComplete={() => {
        if (finished) return;
        finished = true;
        onComplete?.();
        close();
      }}
      onCancel={() => {
        if (finished) return;
        finished = true;
        onCancel?.();
        close();
      }}
    />
  ), host);

  const keyHandler = (e) => {
    if (e.key === 'Escape') {
      if (finished) return;
      finished = true;
      onCancel?.();
      close();
    }
  };
  document.addEventListener('keydown', keyHandler);

  function close() {
    document.removeEventListener('keydown', keyHandler);
    try { dispose(); } catch { /* ignore */ }
    host.remove();
  }

  return { close };
}
