/**
 * Pure UI-field builders for build mode. Extracted from installBuildMode.js
 * so section modules can share them. Each function appends DOM and returns
 * the control (plus a `_wrap` ref to its labeled container where relevant).
 */

export function styleField(field) {
  Object.assign(field.style, {
    width: '100%',
    padding: '6px 8px',
    borderRadius: '8px',
    border: '1px solid rgba(255,255,255,0.16)',
    background: 'rgba(255,255,255,0.06)',
    color: '#fff6ec',
    fontFamily: 'inherit',
    fontSize: '12px',
    boxSizing: 'border-box',
  });
}

export function addActionButton(parent, label, onClick, background = '#2f2c28') {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = label;
  Object.assign(button.style, {
    padding: '8px 10px',
    borderRadius: '8px',
    border: '1px solid rgba(255,255,255,0.12)',
    background,
    color: '#fff4e8',
    cursor: 'pointer',
    fontFamily: 'inherit',
    fontSize: '11px',
  });
  button.addEventListener('click', onClick);
  parent.appendChild(button);
  return button;
}

export function addInlineButton(parent, label, onClick, background = '#2f2c28') {
  return addActionButton(parent, label, onClick, background);
}

export function createSection(panel, title) {
  const section = document.createElement('section');
  Object.assign(section.style, {
    marginTop: '12px',
    paddingTop: '12px',
    borderTop: '1px solid rgba(255,255,255,0.08)',
  });

  const heading = document.createElement('div');
  heading.textContent = title.toUpperCase();
  Object.assign(heading.style, {
    color: '#ffd7a4',
    marginBottom: '8px',
    fontWeight: '700',
    fontSize: '11px',
  });

  section.appendChild(heading);
  panel.appendChild(section);
  return section;
}

export function createVectorInputs(parent, label, attrs, onChange) {
  const wrap = document.createElement('div');
  Object.assign(wrap.style, { marginTop: '6px' });
  parent.appendChild(wrap);

  const title = document.createElement('div');
  title.textContent = label;
  title.style.color = '#d7c5a7';
  wrap.appendChild(title);

  const grid = document.createElement('div');
  Object.assign(grid.style, {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
    gap: '6px',
    marginTop: '4px',
  });
  wrap.appendChild(grid);

  const inputs = {};
  ['x', 'y', 'z'].forEach((axis) => {
    const input = document.createElement('input');
    input.type = 'number';
    Object.assign(input, attrs);
    input.removeAttribute('max');
    input.removeAttribute('min');
    styleField(input);
    input.addEventListener('input', () => {
      onChange(axis, Number(input.value || 0));
    });
    grid.appendChild(input);
    inputs[axis] = input;
  });
  inputs._wrap = wrap;
  return inputs;
}

export function createVector2Inputs(parent, label, attrs, onChange) {
  const wrap = document.createElement('div');
  Object.assign(wrap.style, { marginTop: '8px' });
  parent.appendChild(wrap);

  const title = document.createElement('div');
  title.textContent = label;
  title.style.color = '#d7c5a7';
  wrap.appendChild(title);

  const grid = document.createElement('div');
  Object.assign(grid.style, {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
    gap: '6px',
    marginTop: '4px',
  });
  wrap.appendChild(grid);

  const inputs = {};
  ['x', 'y'].forEach((axis) => {
    const input = document.createElement('input');
    input.type = 'number';
    Object.assign(input, attrs);
    input.removeAttribute('max');
    input.removeAttribute('min');
    styleField(input);
    input.addEventListener('input', () => {
      onChange(axis, Number(input.value || 0));
    });
    grid.appendChild(input);
    inputs[axis] = input;
  });
  inputs._wrap = wrap;
  return inputs;
}

export function createNumberField(parent, label, attrs, onChange, { topLevel = false } = {}) {
  const wrap = document.createElement('label');
  wrap.textContent = label;
  Object.assign(wrap.style, {
    display: 'grid',
    gap: '4px',
    color: '#d7c5a7',
    marginTop: topLevel ? '8px' : '0',
  });
  const input = document.createElement('input');
  input.type = 'number';
  Object.assign(input, attrs);
  input.removeAttribute('max');
  input.removeAttribute('min');
  styleField(input);
  input.addEventListener('input', () => {
    onChange(input.value === '' ? null : Number(input.value));
  });
  wrap.appendChild(input);
  parent.appendChild(wrap);
  input._wrap = wrap;
  return input;
}

export function createRangeField(parent, label, min, max, step, onChange) {
  const wrap = document.createElement('label');
  wrap.textContent = label;
  Object.assign(wrap.style, {
    display: 'grid',
    gap: '4px',
    color: '#d7c5a7',
    marginTop: '8px',
  });
  const input = document.createElement('input');
  input.type = 'range';
  input.min = String(min);
  input.max = String(max);
  input.step = String(step);
  input.addEventListener('input', () => {
    onChange(Number(input.value));
    output.textContent = Number(input.value).toFixed(2);
  });
  const output = document.createElement('div');
  output.style.color = '#f2e5cf';
  output.style.fontSize = '11px';
  wrap.append(input, output);
  parent.appendChild(wrap);
  input._output = output;
  input._wrap = wrap;
  return input;
}

export function createCheckbox(label, parent, onChange) {
  const wrap = document.createElement('label');
  Object.assign(wrap.style, {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    color: '#d7c5a7',
    fontSize: '11px',
  });
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.addEventListener('change', () => onChange(input.checked));
  wrap.append(input, document.createTextNode(label));
  parent.appendChild(wrap);
  input._wrap = wrap;
  return input;
}
