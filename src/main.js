import { createGameSession } from './app/createGameSession.js';
import { RendererModePanel, readRendererMode } from './hud/RendererModePanel.js';

readRendererMode(); // migrate legacy localStorage `webgpu` → `webgl`

const canvas = document.getElementById('canvas');

const modePanel = new RendererModePanel({
  visible: false,
});

let app;
let buildMode = null;
let mobileControls = null;

const isCoarsePointer = window.matchMedia?.('(pointer: coarse)')?.matches ?? false;
const shouldShowMobileControls = isCoarsePointer || navigator.maxTouchPoints > 0;

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
  app = await createGameSession({ canvas });
} catch (error) {
  showFatalBootError(error);
  throw error;
}

app.bindPerformancePanel?.(modePanel);

if (import.meta.env.DEV) {
  const { installBuildMode } = await import('./dev/installBuildMode.js');
  buildMode = await installBuildMode(app);
}

if (shouldShowMobileControls) {
  const { MobileControls } = await import('./input/MobileControls.js');
  mobileControls = await new MobileControls({
    controller: app.controller,
    thirdPersonCamera: app.thirdPersonCamera,
    onSpawnExtraBall: () => app.spawnExtraBall?.(),
    onOpenEmote: () => app.emoteWheel?.toggle?.(),
  }).init();
  app.setMobileControls(mobileControls);
}

if (buildMode?.isActive?.()) {
  mobileControls?.hide();
}

canvas.addEventListener('click', () => {
  if (buildMode?.isActive?.() || shouldShowMobileControls) return;
  app.thirdPersonCamera.requestPointerLock();
});

window.addEventListener('keydown', (event) => {
  if (event.repeat) return;
  const target = event.target;
  if (
    target instanceof HTMLElement
    && (target.isContentEditable || /^(input|textarea|select)$/i.test(target.tagName))
  ) {
    return;
  }

  const key = event.key?.toLowerCase();
  if (key === 'p') {
    modePanel.toggleVisible();
    return;
  }

  if (key === 'b' && buildMode) {
    buildMode.toggle();
    if (buildMode.isActive?.()) {
      mobileControls?.hide();
    } else {
      mobileControls?.show();
    }
    return;
  }

  if (key === 'o') {
    app.toggleNavMeshOverlay?.();
    modePanel.syncPerformanceToggleChecks?.();
  }

  if (key === 'n' && !buildMode?.isActive?.()) {
    app.spawnExtraBall?.();
  }
});

function resize() {
  const w = Math.max(1, Math.floor(window.innerWidth));
  const h = Math.max(1, Math.floor(window.innerHeight));
  app.resize(w, h, window.devicePixelRatio);
}

resize();
window.addEventListener('resize', resize);
window.addEventListener('beforeunload', () => {
  mobileControls?.dispose();
});

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
