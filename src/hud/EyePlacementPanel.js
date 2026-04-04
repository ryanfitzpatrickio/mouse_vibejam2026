import * as THREE from 'three';

const DEFAULT_VALUES = Object.freeze({
  position: { x: 0, y: 0.014, z: -0.193 },
  rotation: { x: -2.3096, y: 0, z: 0 },
  scale: { x: 2.071, y: 2.059, z: 2.06 },
  frameCrop: { x: 0.06, y: 0.08 },
});

function formatNumber(value) {
  return Number.parseFloat(value).toFixed(3);
}

export class EyePlacementPanel {
  constructor({ mouse, container = document.body, storageKey = 'mouse-eye-placement' } = {}) {
    this.mouse = mouse;
    this.container = container;
    this.storageKey = storageKey;
    this.inputs = new Map();
    this._load();
    this._createElements();
    this._applyToMouse();
  }

  _createElements() {
    this.element = document.createElement('section');
    this.element.id = 'eye-placement-panel';
    Object.assign(this.element.style, {
      position: 'fixed',
      top: '20px',
      right: '20px',
      zIndex: '120',
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
    });

    const title = document.createElement('div');
    title.textContent = 'EYE PLACEMENT';
    Object.assign(title.style, {
      fontWeight: '700',
      letterSpacing: '0.08em',
      marginBottom: '10px',
      color: '#ffe9ad',
    });
    this.element.appendChild(title);

    this.fields = document.createElement('div');
    Object.assign(this.fields.style, {
      display: 'grid',
      gap: '8px',
    });
    this.element.appendChild(this.fields);

    this._addGroup('Position', [
      { key: 'position.x', label: 'X', min: -1.0, max: 1.0, step: 0.001 },
      { key: 'position.y', label: 'Y', min: -1.0, max: 1.0, step: 0.001 },
      { key: 'position.z', label: 'Z', min: -1.0, max: 1.0, step: 0.001 },
    ]);

    this._addGroup('Rotation', [
      { key: 'rotation.x', label: 'X', min: -3.1416, max: 3.1416, step: 0.001 },
      { key: 'rotation.y', label: 'Y', min: -3.1416, max: 3.1416, step: 0.001 },
      { key: 'rotation.z', label: 'Z', min: -3.1416, max: 3.1416, step: 0.001 },
    ]);

    this._addGroup('Scale', [
      { key: 'scale.x', label: 'X', min: 0.1, max: 3.0, step: 0.001 },
      { key: 'scale.y', label: 'Y', min: 0.1, max: 3.0, step: 0.001 },
      { key: 'scale.z', label: 'Z', min: 0.1, max: 3.0, step: 0.001 },
    ]);

    this._addGroup('Crop', [
      { key: 'frameCrop.x', label: 'X', min: 0.0, max: 0.15, step: 0.001 },
      { key: 'frameCrop.y', label: 'Y', min: 0.0, max: 0.15, step: 0.001 },
    ]);

    const actions = document.createElement('div');
    Object.assign(actions.style, {
      display: 'flex',
      gap: '8px',
      marginTop: '10px',
    });

    this.copyButton = document.createElement('button');
    this.copyButton.type = 'button';
    this.copyButton.textContent = 'Copy';
    this.copyButton.addEventListener('click', () => this.copySettings());
    this._styleButton(this.copyButton);
    actions.appendChild(this.copyButton);

    this.resetButton = document.createElement('button');
    this.resetButton.type = 'button';
    this.resetButton.textContent = 'Reset';
    this.resetButton.addEventListener('click', () => this.reset());
    this._styleButton(this.resetButton);
    actions.appendChild(this.resetButton);

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

  _addGroup(label, fields) {
    const group = document.createElement('div');
    Object.assign(group.style, {
      padding: '8px',
      borderRadius: '10px',
      background: 'rgba(255,255,255,0.04)',
      border: '1px solid rgba(255,255,255,0.08)',
    });

    const heading = document.createElement('div');
    heading.textContent = label;
    Object.assign(heading.style, {
      color: '#ffd97a',
      marginBottom: '6px',
      fontWeight: '700',
    });
    group.appendChild(heading);

    fields.forEach((field) => {
      group.appendChild(this._addSlider(field));
    });

    this.fields.appendChild(group);
  }

  _addSlider({ key, label, min, max, step }) {
    const row = document.createElement('label');
    Object.assign(row.style, {
      display: 'grid',
      gridTemplateColumns: '34px 1fr 58px',
      gap: '8px',
      alignItems: 'center',
      marginBottom: '5px',
    });

    const name = document.createElement('span');
    name.textContent = label;

    const input = document.createElement('input');
    input.type = 'range';
    input.min = String(min);
    input.max = String(max);
    input.step = String(step);
    input.value = String(this._getValue(key));
    input.addEventListener('input', () => {
      this._setValue(key, Number.parseFloat(input.value));
      this._save();
      this._applyToMouse();
    });

    const value = document.createElement('span');
    value.textContent = formatNumber(Number.parseFloat(input.value));
    value.style.textAlign = 'right';

    input.addEventListener('input', () => {
      value.textContent = formatNumber(Number.parseFloat(input.value));
    });

    row.appendChild(name);
    row.appendChild(input);
    row.appendChild(value);

    this.inputs.set(key, { input, value });
    return row;
  }

  _getValue(path) {
    const [group, axis] = path.split('.');
    return this.values?.[group]?.[axis] ?? DEFAULT_VALUES[group][axis];
  }

  _setValue(path, nextValue) {
    const [group, axis] = path.split('.');
    this.values[group][axis] = nextValue;
  }

  _load() {
    this.values = structuredClone(DEFAULT_VALUES);
    try {
      const raw = localStorage.getItem(this.storageKey);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      this.values.position = { ...this.values.position, ...(parsed.position ?? {}) };
      this.values.rotation = { ...this.values.rotation, ...(parsed.rotation ?? {}) };
      this.values.scale = { ...this.values.scale, ...(parsed.scale ?? {}) };
      this.values.frameCrop = { ...this.values.frameCrop, ...(parsed.frameCrop ?? {}) };
    } catch {
      // Ignore invalid saved state.
    }
  }

  _save() {
    localStorage.setItem(this.storageKey, JSON.stringify(this.values));
  }

  _applyToMouse() {
    if (!this.mouse?.eyeAnimator?.setPlacement) return;

    this.mouse.eyeAnimator.setPlacement({
      position: new THREE.Vector3(
        this.values.position.x,
        this.values.position.y,
        this.values.position.z,
      ),
      rotation: new THREE.Euler(
        this.values.rotation.x,
        this.values.rotation.y,
        this.values.rotation.z,
      ),
      scale: new THREE.Vector3(
        this.values.scale.x,
        this.values.scale.y,
        this.values.scale.z,
      ),
      frameCrop: new THREE.Vector2(
        this.values.frameCrop.x,
        this.values.frameCrop.y,
      ),
    });
  }

  async copySettings() {
    const payload = this.getSettingsObject();
    const text = `mouse.eyeAnimator.setPlacement(${JSON.stringify(payload, null, 2)});`;
    await navigator.clipboard.writeText(text);
    this.status.textContent = 'Copied settings JSON.';
  }

  getSettingsObject() {
    return structuredClone(this.values);
  }

  reset() {
    this.values = structuredClone(DEFAULT_VALUES);
    this.inputs.forEach((entry, key) => {
      entry.input.value = String(this._getValue(key));
      entry.value.textContent = formatNumber(Number.parseFloat(entry.input.value));
    });
    this._save();
    this._applyToMouse();
    this.status.textContent = 'Reset to defaults.';
  }

  dispose() {
    this.element.remove();
  }
}
