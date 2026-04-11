import { measureText } from '../utils/textLayout.js';

const STORAGE_KEY = 'mouse-renderer-mode-v2';
const DEFAULT_MODE = 'webgl';
const METRICS_FONT = '12px monospace';
const METRICS_LINE_HEIGHT = 16;

function isValidMode(mode) {
  return mode === 'webgl';
}

/** @deprecated Only `webgl` is supported; kept to migrate old `webgpu` localStorage entries. */
export function readRendererMode() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === 'webgpu') {
      try {
        localStorage.setItem(STORAGE_KEY, 'webgl');
      } catch {
        /* ignore */
      }
      return 'webgl';
    }
    if (isValidMode(raw)) return raw;
  } catch {
    // Ignore storage access failures.
  }

  return DEFAULT_MODE;
}

/** @deprecated Only `webgl` is supported. */
export function writeRendererMode(mode) {
  if (!isValidMode(mode)) return DEFAULT_MODE;
  try {
    localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    // Ignore storage access failures.
  }
  return mode;
}

export class RendererModePanel {
  constructor({ container = document.body, visible = false } = {}) {
    this.container = container;
    this.fpsTarget = 60;
    this.samples = [];
    this.sampleWindowMs = 5000;
    this.visible = visible;
    this._createElements();
  }

  _createElements() {
    this.element = document.createElement('section');
    this.element.id = 'renderer-mode-panel';
    Object.assign(this.element.style, {
      position: 'fixed',
      top: '20px',
      left: '20px',
      zIndex: '121',
      width: '320px',
      padding: '12px',
      borderRadius: '12px',
      background: 'rgba(10, 12, 16, 0.86)',
      color: '#f4f4f4',
      fontFamily: 'monospace',
      fontSize: '12px',
      lineHeight: '1.2',
      boxShadow: '0 12px 32px rgba(0, 0, 0, 0.35)',
      border: '1px solid rgba(255, 255, 255, 0.12)',
      backdropFilter: 'blur(6px)',
      display: this.visible ? 'block' : 'none',
    });

    const title = document.createElement('div');
    title.textContent = 'PERFORMANCE';
    Object.assign(title.style, {
      fontWeight: '700',
      letterSpacing: '0.08em',
      marginBottom: '6px',
      color: '#9ed7ff',
    });
    this.element.appendChild(title);

    const hint = document.createElement('div');
    hint.textContent = 'Toggle with P · WebGL renderer';
    Object.assign(hint.style, {
      color: '#b7c7d6',
      marginBottom: '10px',
      fontSize: '11px',
    });
    this.element.appendChild(hint);

    this.targetNote = document.createElement('div');
    Object.assign(this.targetNote.style, {
      color: '#b7c7d6',
      marginBottom: '8px',
    });
    this.targetNote.textContent = `FPS chart target: ${this.fpsTarget}`;
    this.element.appendChild(this.targetNote);

    this._createPerformanceSection();
    this.container.appendChild(this.element);
  }

  setVisible(visible) {
    this.visible = Boolean(visible);
    if (this.element) {
      this.element.style.display = this.visible ? 'block' : 'none';
    }
  }

  toggleVisible() {
    this.setVisible(!this.visible);
  }

  _createPerformanceSection() {
    const section = document.createElement('div');
    Object.assign(section.style, {
      padding: '8px',
      borderRadius: '10px',
      background: 'rgba(255,255,255,0.04)',
      border: '1px solid rgba(255,255,255,0.08)',
    });

    this.metrics = document.createElement('div');
    Object.assign(this.metrics.style, {
      display: 'grid',
      gap: '4px',
      marginBottom: '8px',
      color: '#d8e6f3',
    });
    section.appendChild(this.metrics);

    this.chart = document.createElement('canvas');
    this.chart.width = 288;
    this.chart.height = 92;
    Object.assign(this.chart.style, {
      width: '100%',
      height: '92px',
      display: 'block',
      background: 'rgba(0,0,0,0.22)',
      borderRadius: '8px',
      border: '1px solid rgba(255,255,255,0.08)',
    });
    this.chartCtx = this.chart.getContext('2d');
    section.appendChild(this.chart);

    this.element.appendChild(section);
  }

  updatePerformance({ timeMs = 0, deltaSeconds = 0, drawCalls = 0 } = {}) {
    if (!Number.isFinite(deltaSeconds) || deltaSeconds <= 0) return;

    const now = timeMs;
    const fps = 1 / deltaSeconds;
    this.samples.push({ timeMs: now, fps, drawCalls });

    while (this.samples.length > 1 && now - this.samples[0].timeMs > this.sampleWindowMs) {
      this.samples.shift();
    }

    const lastSample = this.samples[this.samples.length - 1];
    const totalTime = this.samples.length > 0
      ? Math.max(0.001, (lastSample.timeMs - this.samples[0].timeMs) / 1000)
      : 0.001;
    const avgFps = this.samples.reduce((sum, sample) => sum + sample.fps, 0) / this.samples.length;
    const drawCallsPerSecond = this.samples.reduce((sum, sample) => sum + sample.drawCalls, 0) / totalTime;
    const avgDrawCalls = this.samples.reduce((sum, sample) => sum + sample.drawCalls, 0) / this.samples.length;

    this._renderPerformance(avgFps, avgDrawCalls, drawCallsPerSecond);
  }

  _renderPerformance(avgFps, avgDrawCalls, drawCallsPerSecond) {
    if (!this.chartCtx) return;

    const ctx = this.chartCtx;
    const { width, height } = this.chart;
    ctx.clearRect(0, 0, width, height);

    ctx.fillStyle = 'rgba(0, 0, 0, 0.22)';
    ctx.fillRect(0, 0, width, height);

    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = 1;
    for (let i = 1; i < 4; i += 1) {
      const y = (height / 4) * i;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    const samples = this.samples;
    const maxValue = Math.max(
      this.fpsTarget,
      1,
      ...samples.map((sample) => sample.fps),
      ...samples.map((sample) => sample.drawCalls),
    );

    const targetY = height - 4 - ((this.fpsTarget / maxValue) * (height - 12));
    ctx.strokeStyle = 'rgba(158, 232, 178, 0.35)';
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(0, targetY);
    ctx.lineTo(width, targetY);
    ctx.stroke();
    ctx.setLineDash([]);

    const drawLine = (getter, color) => {
      if (samples.length < 2) return;
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      samples.forEach((sample, index) => {
        const x = (index / (samples.length - 1)) * (width - 8) + 4;
        const value = getter(sample);
        const y = height - 4 - ((value / maxValue) * (height - 12));
        if (index === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
    };

    drawLine((sample) => sample.fps, '#9ee8b2');
    drawLine((sample) => sample.drawCalls, '#ffd97a');

    const fpsText = `Avg FPS: ${avgFps.toFixed(1)}`;
    const dcText = `Draw calls/frame: ${avgDrawCalls.toFixed(1)}`;
    const dcsText = `Draw calls/sec: ${drawCallsPerSecond.toFixed(1)}`;

    const fpsMeasured = measureText(fpsText, METRICS_FONT, 288, METRICS_LINE_HEIGHT);
    const dcMeasured = measureText(dcText, METRICS_FONT, 288, METRICS_LINE_HEIGHT);
    const dcsMeasured = measureText(dcsText, METRICS_FONT, 288, METRICS_LINE_HEIGHT);

    this.metrics.innerHTML = `
      <div style="height:${fpsMeasured.height}px">Avg FPS: <span style="color:#9ee8b2">${avgFps.toFixed(1)}</span></div>
      <div style="height:${dcMeasured.height}px">Draw calls/frame: <span style="color:#ffd97a">${avgDrawCalls.toFixed(1)}</span></div>
      <div style="height:${dcsMeasured.height}px">Draw calls/sec: <span style="color:#ffd97a">${drawCallsPerSecond.toFixed(1)}</span></div>
    `;
  }

  dispose() {
    this.element?.remove();
  }
}
