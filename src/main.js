import { createGameSession } from './app/createGameSession.js';
import { EyePlacementPanel } from './hud/EyePlacementPanel.js';
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
});

let app;

try {
  app = await createGameSession({ canvas, mode });
} catch (error) {
  if (mode === 'webgpu') {
    writeRendererMode('webgl');
    const reason = error instanceof Error ? error.message : String(error);
    modePanel.setRuntimeMessage(`WebGPU failed: ${reason}\nUsing WebGL.`);
    app = await createGameSession({ canvas, mode: 'webgl' });
  } else {
    throw error;
  }
}
const eyePanel = new EyePlacementPanel({ mouse: app.mouse });

canvas.addEventListener('click', () => {
  app.thirdPersonCamera.requestPointerLock();
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
  const perf = app.update(timeMs, dt);
  modePanel.updatePerformance({
    timeMs,
    deltaSeconds: dt,
    drawCalls: perf?.drawCalls ?? 0,
  });
}

app.renderer.setAnimationLoop(animate);
