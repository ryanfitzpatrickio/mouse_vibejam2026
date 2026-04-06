import { measureText } from '../utils/textLayout.js';

const STORAGE_KEY = 'mouse-renderer-mode-v2';
const DEFAULT_MODE = 'webgl';
const METRICS_FONT = '12px monospace';
const METRICS_LINE_HEIGHT = 16;

function isValidMode(mode) {
  return mode === 'webgl' || mode === 'webgpu';
}

export function readRendererMode() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (isValidMode(raw)) return raw;
  } catch {
    // Ignore storage access failures.
  }

  return DEFAULT_MODE;
}

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
  constructor({
    container = document.body,
    mode = readRendererMode(),
    onApply = null,
    webgpuAvailable = true,
    webgpuReason = '',
    visible = false,
  } = {}) {
    this.container = container;
    this.mode = isValidMode(mode) ? mode : DEFAULT_MODE;
    this.onApply = onApply;
    this.webgpuAvailable = webgpuAvailable;
    this.webgpuReason = webgpuReason;
    this.fpsTarget = mode === 'webgpu' ? 120 : 60;
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
    title.textContent = 'RENDERER MODE';
    Object.assign(title.style, {
      fontWeight: '700',
      letterSpacing: '0.08em',
      marginBottom: '10px',
      color: '#9ed7ff',
    });
    this.element.appendChild(title);

    const row = document.createElement('label');
    Object.assign(row.style, {
      display: 'grid',
      gap: '6px',
    });

    const label = document.createElement('span');
    label.textContent = 'Backend';
    label.style.color = '#ffd97a';
    row.appendChild(label);

    this.select = document.createElement('select');
    Object.assign(this.select.style, {
      width: '100%',
      padding: '6px 8px',
      borderRadius: '8px',
      border: '1px solid rgba(255,255,255,0.18)',
      background: 'rgba(255,255,255,0.08)',
      color: '#fff',
      fontFamily: 'inherit',
      fontSize: '12px',
    });

    const options = [
      { value: 'webgl', label: 'WebGL + OutlineEffect' },
      { value: 'webgpu', label: 'WebGPU + TSL Outline' },
    ];

    for (const option of options) {
      const el = document.createElement('option');
      el.value = option.value;
      el.textContent = option.label;
      if (option.value === 'webgpu' && !this.webgpuAvailable) {
        el.disabled = true;
        el.textContent = `${option.label} (unavailable)`;
      }
      this.select.appendChild(el);
    }

    this.select.value = this.mode;
    row.appendChild(this.select);

    const help = document.createElement('div');
    help.textContent = 'Changes reload the app.';
    Object.assign(help.style, {
      color: '#b7c7d6',
      marginTop: '4px',
    });
    row.appendChild(help);

    this.capabilityNote = document.createElement('div');
    Object.assign(this.capabilityNote.style, {
      color: this.webgpuAvailable ? '#9ee8b2' : '#ffb089',
      marginTop: '2px',
      whiteSpace: 'pre-wrap',
    });
    this.capabilityNote.textContent = this.webgpuAvailable
      ? 'WebGPU is available.'
      : `WebGPU unavailable.\n${this.webgpuReason || 'Browser or context does not support it.'}`;
    row.appendChild(this.capabilityNote);

    this.targetNote = document.createElement('div');
    Object.assign(this.targetNote.style, {
      color: '#b7c7d6',
      marginTop: '2px',
    });
    this.targetNote.textContent = `FPS target: ${this.fpsTarget}`;
    row.appendChild(this.targetNote);

    this.element.appendChild(row);

    this._createPerformanceSection();

    const actions = document.createElement('div');
    Object.assign(actions.style, {
      display: 'flex',
      gap: '8px',
      marginTop: '10px',
    });

    this.applyButton = document.createElement('button');
    this.applyButton.type = 'button';
    this.applyButton.textContent = 'Apply';
    this.applyButton.addEventListener('click', () => this.apply());
    this._styleButton(this.applyButton);
    actions.appendChild(this.applyButton);

    this.status = document.createElement('div');
    Object.assign(this.status.style, {
      marginTop: '8px',
      color: '#9ee8b2',
      minHeight: '16px',
    });

    this.element.appendChild(actions);
    this.element.appendChild(this.status);
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
      marginTop: '10px',
      padding: '8px',
      borderRadius: '10px',
      background: 'rgba(255,255,255,0.04)',
      border: '1px solid rgba(255,255,255,0.08)',
    });

    const heading = document.createElement('div');
    heading.textContent = 'PERFORMANCE';
    Object.assign(heading.style, {
      color: '#ffd97a',
      marginBottom: '6px',
      fontWeight: '700',
    });
    section.appendChild(heading);

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

  _styleButton(button) {
    Object.assign(button.style, {
      appearance: 'none',
      border: '1px solid rgba(255,255,255,0.18)',
      background: 'rgba(255,255,255,0.08)',
      color: '#fff',
      padding: '6px 10px',
      borderRadius: '8px',
      cursor: 'pointer',
      fontFamily: 'inherit',
      fontSize: '12px',
    });
  }

  apply() {
    this.mode = isValidMode(this.select.value) ? this.select.value : DEFAULT_MODE;
    if (this.mode === 'webgpu' && !this.webgpuAvailable) {
      this.status.textContent = 'WebGPU unavailable, staying on WebGL.';
      this.select.value = 'webgl';
      return;
    }
    writeRendererMode(this.mode);
    this.status.textContent = `Saved ${this.mode}. Reloading...`;
    if (typeof this.onApply === 'function') {
      this.onApply(this.mode);
      return;
    }
    window.location.reload();
  }

  setRuntimeMessage(message) {
    if (!this.status) return;
    this.status.textContent = message;
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
