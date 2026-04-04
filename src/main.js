import { createGameSession } from './app/createGameSession.js';
import { RendererModePanel, readRendererMode, writeRendererMode } from './hud/RendererModePanel.js';

const canvas = document.getElementById('canvas');
const mode = readRendererMode();
const webgpuAvailable = typeof navigator !== 'undefined' && navigator.gpu && window.isSecureContext;
const webgpuReason = !window.isSecureContext
  ? 'WebGPU requires a secure context. Use https:// or localhost.'
  : (!navigator.gpu ? 'navigator.gpu is not available in this browser.' : '');

const modePanel = new RendererModePanel({
  mode,
  webgpuAvailable,
  webgpuReason,
  onApply: () => window.location.reload(),
  visible: false,
});

let app;
let buildMode = null;

function showFatalBootError(error) {
  const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  console.error('Fatal boot error:', error);

  const overlay = document.createElement('div');
  Object.assign(overlay.style, {
    position: 'fixed',
    inset: '0',
    zIndex: '9999',
    display: 'grid',
    placeItems: 'center',
    background: 'rgba(0, 0, 0, 0.88)',
    color: '#fff4ea',
    fontFamily: 'monospace',
    padding: '24px',
  });

  overlay.innerHTML = `
    <div style="max-width:720px;width:100%;border:1px solid rgba(255,255,255,0.15);border-radius:14px;padding:18px;background:rgba(20,16,14,0.96)">
      <div style="font-weight:700;color:#ffb089;margin-bottom:10px">APP BOOT FAILED</div>
      <div style="margin-bottom:10px;white-space:pre-wrap">${message}</div>
      <div style="color:#d8c3a8;font-size:12px;line-height:1.4">
        Open the browser console for the full stack trace.
      </div>
    </div>
  `;

  document.body.appendChild(overlay);
}

try {
  app = await createGameSession({ canvas, mode });
} catch (error) {
  if (mode === 'webgpu') {
    writeRendererMode('webgl');
    const reason = error instanceof Error ? error.message : String(error);
    modePanel.setRuntimeMessage(`WebGPU failed: ${reason}\nUsing WebGL.`);
    try {
      app = await createGameSession({ canvas, mode: 'webgl' });
    } catch (fallbackError) {
      showFatalBootError(fallbackError);
      throw fallbackError;
    }
  } else {
    showFatalBootError(error);
    throw error;
  }
}

if (import.meta.env.DEV) {
  const { installBuildMode } = await import('./dev/installBuildMode.js');
  buildMode = await installBuildMode(app);
}

canvas.addEventListener('click', () => {
  if (buildMode?.isActive?.()) return;
  app.thirdPersonCamera.requestPointerLock();
});

window.addEventListener('keydown', (event) => {
  if (event.repeat) return;

  const key = event.key?.toLowerCase();
  if (key === 'p') {
    modePanel.toggleVisible();
    return;
  }

  if (key === 'b' && buildMode) {
    buildMode.toggle();
  }
});

function resize() {
  const w = Math.max(1, Math.floor(window.innerWidth));
  const h = Math.max(1, Math.floor(window.innerHeight));
  app.resize(w, h, window.devicePixelRatio);
}

resize();
window.addEventListener('resize', resize);

let lastTime = 0;

function animate(timeMs) {
  const dt = lastTime ? (timeMs - lastTime) * 0.001 : 1 / 60;
  lastTime = timeMs;

  if (buildMode?.isActive?.()) {
    buildMode.update(dt);
  }

  const perf = app.update(timeMs, dt);
  modePanel.updatePerformance({
    timeMs,
    deltaSeconds: dt,
    drawCalls: perf?.drawCalls ?? 0,
  });
}

app.renderer.setAnimationLoop(animate);
