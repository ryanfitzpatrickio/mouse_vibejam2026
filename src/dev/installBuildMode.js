import * as THREE from 'three';

const RAD_TO_DEG = 180 / Math.PI;
const DEG_TO_RAD = Math.PI / 180;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function createPrimitiveId() {
  return `primitive-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function createDefaultPrimitive(type, app) {
  const forward = new THREE.Vector3();
  app.camera.getWorldDirection(forward);
  forward.y = 0;
  if (forward.lengthSq() < 0.0001) {
    forward.set(0, 0, -1);
  }
  forward.normalize();

  const spawn = app.mouse.position.clone().add(forward.multiplyScalar(2.25));
  spawn.y = Math.max(app.mouse.position.y, 0.6);

  const primitive = {
    id: createPrimitiveId(),
    name: `${type}-${Math.random().toString(36).slice(2, 5)}`,
    type,
    position: {
      x: Number(spawn.x.toFixed(3)),
      y: Number(spawn.y.toFixed(3)),
      z: Number(spawn.z.toFixed(3)),
    },
    rotation: { x: 0, y: 0, z: 0 },
    scale: { x: 1, y: 1, z: 1 },
    texture: {
      cell: 0,
      repeat: { x: 1, y: 1 },
      rotation: 0,
    },
    material: {
      color: '#ffffff',
      roughness: 0.88,
      metalness: 0.04,
    },
    collider: true,
    castShadow: true,
    receiveShadow: true,
  };

  if (type === 'plane') {
    primitive.rotation.x = -Math.PI * 0.5;
    primitive.scale = { x: 2, y: 2, z: 1 };
  }

  if (type === 'cylinder') {
    primitive.scale = { x: 1, y: 1.5, z: 1 };
  }

  return primitive;
}

function createAtlasButtonStyle(index, columns = 10, rows = 10) {
  const col = index % columns;
  const row = Math.floor(index / columns);
  const x = columns > 1 ? (col / (columns - 1)) * 100 : 0;
  const y = rows > 1 ? (row / (rows - 1)) * 100 : 0;

  return {
    backgroundImage: "url('/textures.webp')",
    backgroundSize: `${columns * 100}% ${rows * 100}%`,
    backgroundPosition: `${x}% ${y}%`,
  };
}

class BuildModeEditor {
  constructor(app, manifest, OrbitControls, TransformControls) {
    this.app = app;
    this.manifest = manifest;
    this.OrbitControls = OrbitControls;
    this.TransformControls = TransformControls;
    this.layout = app.room.getEditableLayout();
    this.selectedId = this.layout.primitives[0]?.id ?? null;
    this.visible = false;
    this.statusTimer = null;
    this.pointerNdc = new THREE.Vector2();
    this.pointerScreen = { x: 0, y: 0 };
    this.pointerInsideCanvas = false;
    this.raycaster = new THREE.Raycaster();
    this.currentHit = null;

    this._createUI();
    this._createProbeVisuals();
    this._createOrbitControls();
    this._createTransformControls();
    this._bindCanvasEvents();
    this._renderPalette();
    this._refreshList();
    this._syncForm();
  }

  isActive() {
    return this.visible;
  }

  toggle() {
    this.visible = !this.visible;
    this.panel.style.display = this.visible ? 'block' : 'none';
    if (this.visible) {
      this.app.thirdPersonCamera?.setEnabled(false);
      this.controls.target.copy(this.app.mouse.position);
      this.controls.target.y += 0.6;
      this.controls.enabled = true;
      this.transformControls.enabled = true;
      this._attachTransformControls();
      document.exitPointerLock?.();
    } else {
      this.controls.enabled = false;
      this.transformControls.enabled = false;
      this.transformControls.detach();
      this._hideProbe();
      this.app.thirdPersonCamera?.syncFromCamera(this.app.mouse.position);
      this.app.thirdPersonCamera?.setEnabled(true);
    }
  }

  update(deltaSeconds = 1 / 60) {
    if (!this.visible) return;

    const desiredTarget = this.app.mouse.position.clone();
    desiredTarget.y += 0.6;
    this.controls.target.lerp(desiredTarget, 1 - Math.exp(-6 * deltaSeconds));
    this.controls.update();
    this.app.thirdPersonCamera?.syncFromCamera(this.app.mouse.position);
    this._updateProbe();
  }

  _createUI() {
    this.panel = document.createElement('aside');
    Object.assign(this.panel.style, {
      position: 'fixed',
      top: '20px',
      right: '20px',
      width: '360px',
      maxHeight: 'calc(100vh - 40px)',
      overflowY: 'auto',
      zIndex: '140',
      padding: '14px',
      borderRadius: '14px',
      background: 'rgba(12, 10, 9, 0.92)',
      color: '#f7efe5',
      border: '1px solid rgba(255,255,255,0.12)',
      boxShadow: '0 18px 50px rgba(0,0,0,0.35)',
      backdropFilter: 'blur(10px)',
      fontFamily: 'monospace',
      display: 'none',
    });

    const title = document.createElement('div');
    title.textContent = 'BUILD MODE';
    Object.assign(title.style, {
      fontWeight: '700',
      letterSpacing: '0.08em',
      color: '#ffd7a4',
      marginBottom: '6px',
    });
    this.panel.appendChild(title);

    const note = document.createElement('div');
    note.textContent = 'DEV ONLY. B toggles this panel.';
    Object.assign(note.style, {
      color: '#d8c3a8',
      marginBottom: '12px',
      fontSize: '11px',
    });
    this.panel.appendChild(note);

    this.actions = document.createElement('div');
    Object.assign(this.actions.style, {
      display: 'grid',
      gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
      gap: '8px',
      marginBottom: '12px',
    });
    this.panel.appendChild(this.actions);

    this._addActionButton('Add Box', () => this._addPrimitive('box'));
    this._addActionButton('Add Plane', () => this._addPrimitive('plane'));
    this._addActionButton('Add Cyl', () => this._addPrimitive('cylinder'));
    this._addActionButton('Move', () => this._setTransformMode('translate'));
    this._addActionButton('Rotate', () => this._setTransformMode('rotate'));
    this._addActionButton('Scale', () => this._setTransformMode('scale'));
    this._addActionButton('Duplicate', () => this._duplicateSelected());
    this._addActionButton('Delete', () => this._deleteSelected(), '#5d221f');
    this._addActionButton('Save', () => this.save(), '#23472d');
    this._addActionButton('Export', () => this.exportBackup());

    this._createSelectionSection();
    this._createTransformSection();
    this._createMaterialSection();
    this._createPaletteSection();

    this.status = document.createElement('div');
    Object.assign(this.status.style, {
      marginTop: '10px',
      minHeight: '18px',
      color: '#9ee8b2',
      fontSize: '11px',
      whiteSpace: 'pre-wrap',
    });
    this.panel.appendChild(this.status);

    document.body.appendChild(this.panel);
  }

  _createOrbitControls() {
    this.controls = new this.OrbitControls(this.app.camera, this.app.renderer.domElement);
    this.controls.enabled = false;
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.screenSpacePanning = true;
    this.controls.minDistance = 1.5;
    this.controls.maxDistance = 28;
  }

  _createProbeVisuals() {
    const positions = new Float32Array(6);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const material = new THREE.LineBasicMaterial({
      color: '#ffdf8a',
      transparent: true,
      opacity: 0.9,
    });
    this.pointerLine = new THREE.Line(geometry, material);
    this.pointerLine.visible = false;
    this.pointerLine.renderOrder = 999;
    this.pointerLine.userData.editorHelper = true;
    this.app.scene.add(this.pointerLine);

    this.hitTooltip = document.createElement('div');
    Object.assign(this.hitTooltip.style, {
      position: 'fixed',
      zIndex: '141',
      pointerEvents: 'none',
      padding: '6px 8px',
      borderRadius: '8px',
      background: 'rgba(12, 10, 9, 0.9)',
      color: '#fff6ec',
      border: '1px solid rgba(255,255,255,0.12)',
      fontFamily: 'monospace',
      fontSize: '11px',
      whiteSpace: 'pre',
      display: 'none',
    });
    document.body.appendChild(this.hitTooltip);
  }

  _createTransformControls() {
    this.transformControls = new this.TransformControls(this.app.camera, this.app.renderer.domElement);
    this.transformControls.enabled = false;
    this.transformControls.setMode('translate');
    this.transformControls.size = 0.85;
    this.transformControlsHelper = this.transformControls.getHelper();
    this.transformControlsHelper.userData.editorHelper = true;
    this.transformControls.addEventListener('dragging-changed', (event) => {
      this.controls.enabled = !event.value && this.visible;
    });
    this.transformControls.addEventListener('objectChange', () => {
      const object = this.transformControls.object;
      const primitiveId = object?.userData?.primitiveId;
      if (!primitiveId) return;

      this.app.room.updateEditablePrimitiveTransform(primitiveId, {
        position: object.position,
        rotation: object.rotation,
        scale: object.scale,
      });
      this.layout = this.app.room.getEditableLayout();
      this._syncForm();
      this._attachTransformControls();
    });
    this.app.scene.add(this.transformControlsHelper);
  }

  _bindCanvasEvents() {
    const canvas = this.app.renderer.domElement;

    canvas.addEventListener('pointermove', (event) => {
      this.pointerInsideCanvas = true;
      const rect = canvas.getBoundingClientRect();
      this.pointerNdc.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      this.pointerNdc.y = -(((event.clientY - rect.top) / rect.height) * 2 - 1);
      this.pointerScreen.x = event.clientX;
      this.pointerScreen.y = event.clientY;
    });

    canvas.addEventListener('pointerleave', () => {
      this.pointerInsideCanvas = false;
      this._hideProbe();
    });

    canvas.addEventListener('dblclick', (event) => {
      if (!this.visible) return;
      event.preventDefault();
      if (!this.currentHit?.object?.userData?.primitiveId) return;
      this.selectedId = this.currentHit.object.userData.primitiveId;
      this._syncForm();
      this._setStatus(`Selected ${this.currentHit.object.name}.`);
    });
  }

  _updateProbe() {
    if (!this.pointerInsideCanvas) {
      this._hideProbe();
      return;
    }

    this.raycaster.setFromCamera(this.pointerNdc, this.app.camera);
    const hits = this.raycaster.intersectObjects(this.app.scene.children, true)
      .filter((hit) => hit.object?.visible !== false && hit.object?.userData?.editorHelper !== true);

    const hit = hits[0] ?? null;
    this.currentHit = hit;
    if (!hit) {
      this._hideProbe();
      return;
    }

    const position = this.pointerLine.geometry.attributes.position;
    position.setXYZ(0, this.app.camera.position.x, this.app.camera.position.y, this.app.camera.position.z);
    position.setXYZ(1, hit.point.x, hit.point.y, hit.point.z);
    position.needsUpdate = true;
    this.pointerLine.visible = true;

    const primitiveId = hit.object.userData?.primitiveId;
    const primitive = primitiveId
      ? this.layout.primitives.find((entry) => entry.id === primitiveId)
      : null;
    this.hitTooltip.style.display = 'block';
    this.hitTooltip.style.left = `${this.pointerScreen.x + 14}px`;
    this.hitTooltip.style.top = `${this.pointerScreen.y + 14}px`;
    this.hitTooltip.textContent = [
      hit.object.name || 'unnamed',
      primitive ? `cell ${primitive.texture.cell ?? 'none'}` : '',
      `x ${hit.point.x.toFixed(2)} y ${hit.point.y.toFixed(2)} z ${hit.point.z.toFixed(2)}`,
    ].filter(Boolean).join('\n');
  }

  _hideProbe() {
    this.currentHit = null;
    if (this.pointerLine) {
      this.pointerLine.visible = false;
    }
    if (this.hitTooltip) {
      this.hitTooltip.style.display = 'none';
    }
  }

  _setTransformMode(mode) {
    this.transformControls?.setMode(mode);
    this._setStatus(`Transform mode: ${mode}`);
  }

  _attachTransformControls() {
    if (!this.transformControls || !this.visible) return;
    const mesh = this.app.room.getEditableMesh(this.selectedId);
    if (!mesh || mesh.visible === false) {
      this.transformControls.detach();
      return;
    }
    this.transformControls.attach(mesh);
  }

  _createSelectionSection() {
    const section = this._createSection('Selection');

    this.primitiveSelect = document.createElement('select');
    this._styleField(this.primitiveSelect);
    this.primitiveSelect.addEventListener('change', () => {
      this.selectedId = this.primitiveSelect.value || null;
      this._syncForm();
    });
    section.appendChild(this.primitiveSelect);

    this.nameInput = document.createElement('input');
    this.nameInput.type = 'text';
    this.nameInput.placeholder = 'Primitive name';
    this._styleField(this.nameInput);
    this.nameInput.style.marginTop = '8px';
    this.nameInput.addEventListener('input', () => {
      this._updateSelected((primitive) => {
        primitive.name = this.nameInput.value || primitive.type;
      });
    });
    section.appendChild(this.nameInput);

    const toggles = document.createElement('div');
    Object.assign(toggles.style, {
      display: 'grid',
      gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
      gap: '8px',
      marginTop: '8px',
    });
    section.appendChild(toggles);

    this.colliderToggle = this._createCheckbox('Collider', toggles, (checked) => {
      this._updateSelected((primitive) => {
        primitive.collider = checked;
      });
    });
    this.castShadowToggle = this._createCheckbox('Cast Shadow', toggles, (checked) => {
      this._updateSelected((primitive) => {
        primitive.castShadow = checked;
      });
    });
    this.receiveShadowToggle = this._createCheckbox('Recv Shadow', toggles, (checked) => {
      this._updateSelected((primitive) => {
        primitive.receiveShadow = checked;
      });
    });
  }

  _createTransformSection() {
    const section = this._createSection('Transform');

    this.positionInputs = this._createVectorInputs(section, 'Position', { step: 0.05 }, (axis, value) => {
      this._updateSelected((primitive) => {
        primitive.position[axis] = value;
      });
    });
    this.rotationInputs = this._createVectorInputs(section, 'Rotation', { step: 1 }, (axis, value) => {
      this._updateSelected((primitive) => {
        primitive.rotation[axis] = value * DEG_TO_RAD;
      });
    });
    this.scaleInputs = this._createVectorInputs(section, 'Scale', { step: 0.1, min: 0.1 }, (axis, value) => {
      this._updateSelected((primitive) => {
        primitive.scale[axis] = Math.max(0.1, value);
      });
    });
  }

  _createMaterialSection() {
    const section = this._createSection('Surface');

    const grid = document.createElement('div');
    Object.assign(grid.style, {
      display: 'grid',
      gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
      gap: '8px',
    });
    section.appendChild(grid);

    this.textureCellInput = this._createNumberField(grid, 'Texture Cell', {
      step: 1,
      min: 0,
      max: (this.manifest?.cells?.length ?? 100) - 1,
    }, (value) => {
      this._updateSelected((primitive) => {
        primitive.texture.cell = Number.isFinite(value)
          ? clamp(Math.round(value), 0, (this.manifest?.cells?.length ?? 100) - 1)
          : null;
      });
      this._highlightPalette();
    });

    this.colorInput = document.createElement('input');
    this.colorInput.type = 'color';
    this._styleField(this.colorInput);
    this.colorInput.addEventListener('input', () => {
      this._updateSelected((primitive) => {
        primitive.material.color = this.colorInput.value;
      });
    });
    const colorWrap = document.createElement('label');
    colorWrap.textContent = 'Tint';
    Object.assign(colorWrap.style, { display: 'grid', gap: '4px', color: '#d7c5a7' });
    colorWrap.appendChild(this.colorInput);
    grid.appendChild(colorWrap);

    this.repeatInputs = this._createVector2Inputs(section, 'Texture Repeat', { step: 0.1, min: 0.1 }, (axis, value) => {
      this._updateSelected((primitive) => {
        primitive.texture.repeat[axis] = Math.max(0.1, value);
      });
    });

    this.textureRotationInput = this._createNumberField(section, 'Texture Rotation', {
      step: 1,
    }, (value) => {
      this._updateSelected((primitive) => {
        primitive.texture.rotation = value * DEG_TO_RAD;
      });
    });

    this.roughnessInput = this._createRangeField(section, 'Roughness', 0, 1, 0.01, (value) => {
      this._updateSelected((primitive) => {
        primitive.material.roughness = value;
      });
    });

    this.metalnessInput = this._createRangeField(section, 'Metalness', 0, 1, 0.01, (value) => {
      this._updateSelected((primitive) => {
        primitive.material.metalness = value;
      });
    });
  }

  _createPaletteSection() {
    const section = this._createSection('Texture Palette');

    this.paletteGrid = document.createElement('div');
    Object.assign(this.paletteGrid.style, {
      display: 'grid',
      gridTemplateColumns: 'repeat(5, minmax(0, 1fr))',
      gap: '6px',
    });
    section.appendChild(this.paletteGrid);
  }

  _renderPalette() {
    this.paletteGrid.innerHTML = '';
    const columns = this.manifest?.grid?.columns ?? 10;
    const rows = this.manifest?.grid?.rows ?? 10;
    const cells = this.manifest?.cells ?? [];

    cells.forEach((cell) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.cellIndex = String(cell.index);
      Object.assign(button.style, {
        position: 'relative',
        width: '100%',
        aspectRatio: '1',
        borderRadius: '8px',
        border: '1px solid rgba(255,255,255,0.18)',
        cursor: 'pointer',
        overflow: 'hidden',
        ...createAtlasButtonStyle(cell.index, columns, rows),
      });
      button.title = cell.description ?? `Cell ${cell.index}`;
      button.addEventListener('click', () => {
        this.textureCellInput.value = String(cell.index);
        this._updateSelected((primitive) => {
          primitive.texture.cell = cell.index;
        });
        this._highlightPalette();
      });

      const badge = document.createElement('span');
      badge.textContent = String(cell.index);
      Object.assign(badge.style, {
        position: 'absolute',
        left: '4px',
        bottom: '4px',
        fontSize: '10px',
        color: '#fff',
        background: 'rgba(0,0,0,0.55)',
        padding: '1px 4px',
        borderRadius: '999px',
      });
      button.appendChild(badge);

      this.paletteGrid.appendChild(button);
    });
  }

  _addActionButton(label, onClick, background = '#2f2c28') {
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
    this.actions.appendChild(button);
  }

  _createSection(title) {
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
    this.panel.appendChild(section);
    return section;
  }

  _createVectorInputs(parent, label, attrs, onChange) {
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
      this._styleField(input);
      input.addEventListener('input', () => {
        onChange(axis, Number(input.value || 0));
      });
      grid.appendChild(input);
      inputs[axis] = input;
    });
    return inputs;
  }

  _createVector2Inputs(parent, label, attrs, onChange) {
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
      this._styleField(input);
      input.addEventListener('input', () => {
        onChange(axis, Number(input.value || 0));
      });
      grid.appendChild(input);
      inputs[axis] = input;
    });
    return inputs;
  }

  _createNumberField(parent, label, attrs, onChange) {
    const wrap = document.createElement('label');
    wrap.textContent = label;
    Object.assign(wrap.style, {
      display: 'grid',
      gap: '4px',
      color: '#d7c5a7',
      marginTop: parent === this.panel ? '8px' : '0',
    });
    const input = document.createElement('input');
    input.type = 'number';
    Object.assign(input, attrs);
    this._styleField(input);
    input.addEventListener('input', () => {
      onChange(input.value === '' ? null : Number(input.value));
    });
    wrap.appendChild(input);
    parent.appendChild(wrap);
    return input;
  }

  _createRangeField(parent, label, min, max, step, onChange) {
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
    return input;
  }

  _createCheckbox(label, parent, onChange) {
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
    return input;
  }

  _styleField(field) {
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

  _selectedPrimitive() {
    return this._editorPrimitives().find((entry) => entry.id === this.selectedId) ?? null;
  }

  _editorPrimitives() {
    return this.layout.primitives.filter((entry) => entry.deleted !== true);
  }

  _refreshList() {
    this.layout = this.app.room.getEditableLayout();
    this.primitiveSelect.innerHTML = '';
    const editorPrimitives = this._editorPrimitives();
    if (!editorPrimitives.length) {
      const option = document.createElement('option');
      option.value = '';
      option.textContent = 'No editable primitives';
      this.primitiveSelect.appendChild(option);
      this.selectedId = null;
      return;
    }

    if (!editorPrimitives.some((entry) => entry.id === this.selectedId)) {
      this.selectedId = editorPrimitives[0].id;
    }

    editorPrimitives.forEach((primitive) => {
      const option = document.createElement('option');
      option.value = primitive.id;
      option.textContent = `${primitive.name} (${primitive.type})`;
      this.primitiveSelect.appendChild(option);
    });
    this.primitiveSelect.value = this.selectedId;
    this._attachTransformControls();
  }

  _syncForm() {
    this._refreshList();
    const primitive = this._selectedPrimitive();
    const disabled = !primitive;

    [
      this.nameInput,
      ...Object.values(this.positionInputs),
      ...Object.values(this.rotationInputs),
      ...Object.values(this.scaleInputs),
      this.textureCellInput,
      this.colorInput,
      ...Object.values(this.repeatInputs),
      this.textureRotationInput,
      this.roughnessInput,
      this.metalnessInput,
      this.colliderToggle,
      this.castShadowToggle,
      this.receiveShadowToggle,
    ].forEach((field) => {
      field.disabled = disabled;
    });

    if (!primitive) {
      this._highlightPalette();
      return;
    }

    this.nameInput.value = primitive.name;
    this.positionInputs.x.value = primitive.position.x;
    this.positionInputs.y.value = primitive.position.y;
    this.positionInputs.z.value = primitive.position.z;
    this.rotationInputs.x.value = (primitive.rotation.x * RAD_TO_DEG).toFixed(1);
    this.rotationInputs.y.value = (primitive.rotation.y * RAD_TO_DEG).toFixed(1);
    this.rotationInputs.z.value = (primitive.rotation.z * RAD_TO_DEG).toFixed(1);
    this.scaleInputs.x.value = primitive.scale.x;
    this.scaleInputs.y.value = primitive.scale.y;
    this.scaleInputs.z.value = primitive.scale.z;
    this.textureCellInput.value = primitive.texture.cell ?? '';
    this.colorInput.value = primitive.material.color;
    this.repeatInputs.x.value = primitive.texture.repeat.x;
    this.repeatInputs.y.value = primitive.texture.repeat.y;
    this.textureRotationInput.value = (primitive.texture.rotation * RAD_TO_DEG).toFixed(1);
    this.roughnessInput.value = primitive.material.roughness;
    this.roughnessInput._output.textContent = Number(primitive.material.roughness).toFixed(2);
    this.metalnessInput.value = primitive.material.metalness;
    this.metalnessInput._output.textContent = Number(primitive.material.metalness).toFixed(2);
    this.colliderToggle.checked = primitive.collider;
    this.castShadowToggle.checked = primitive.castShadow;
    this.receiveShadowToggle.checked = primitive.receiveShadow;
    this._highlightPalette();
  }

  _highlightPalette() {
    const selectedCell = String(this._selectedPrimitive()?.texture.cell ?? '');
    this.paletteGrid.querySelectorAll('button').forEach((button) => {
      button.style.outline = button.dataset.cellIndex === selectedCell ? '2px solid #ffe39d' : 'none';
    });
  }

  _updateSelected(mutator) {
    const primitive = this._selectedPrimitive();
    if (!primitive) return;

    const next = deepClone(primitive);
    mutator(next);
    this.app.room.upsertEditablePrimitive(next);
    this.layout = this.app.room.getEditableLayout();
    this._syncForm();
    this._attachTransformControls();
  }

  _addPrimitive(type) {
    const primitive = createDefaultPrimitive(type, this.app);
    this.app.room.upsertEditablePrimitive(primitive);
    this.layout = this.app.room.getEditableLayout();
    this.selectedId = primitive.id;
    this._syncForm();
    this._attachTransformControls();
    this._setStatus(`Added ${primitive.name}.`);
  }

  _duplicateSelected() {
    const primitive = this._selectedPrimitive();
    if (!primitive) return;
    const copy = deepClone(primitive);
    copy.id = createPrimitiveId();
    copy.name = `${primitive.name}-copy`;
    copy.position.x += 0.6;
    copy.position.z += 0.6;
    this.app.room.upsertEditablePrimitive(copy);
    this.layout = this.app.room.getEditableLayout();
    this.selectedId = copy.id;
    this._syncForm();
    this._attachTransformControls();
    this._setStatus(`Duplicated ${primitive.name}.`);
  }

  _deleteSelected() {
    if (!this.selectedId) return;
    const currentName = this._selectedPrimitive()?.name ?? 'primitive';
    this.app.room.removeEditablePrimitive(this.selectedId);
    this.layout = this.app.room.getEditableLayout();
    this.selectedId = this.layout.primitives[0]?.id ?? null;
    this._syncForm();
    this._attachTransformControls();
    this._setStatus(`Deleted ${currentName}.`);
  }

  async save() {
    const payload = this.app.room.getEditableLayout();
    const response = await fetch('/__dev/save-level', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const result = await response.json();
    if (!response.ok || !result.ok) {
      this._setStatus(`Save failed: ${result.error || response.statusText}`, true);
      return;
    }
    this._setStatus('Saved /levels/kitchen-layout.json');
  }

  exportBackup() {
    const payload = JSON.stringify(this.app.room.getEditableLayout(), null, 2);
    const blob = new Blob([`${payload}\n`], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `kitchen-layout-backup-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    link.click();
    URL.revokeObjectURL(url);
    this._setStatus('Exported backup JSON.');
  }

  _setStatus(message, isError = false) {
    this.status.textContent = message;
    this.status.style.color = isError ? '#ffb089' : '#9ee8b2';
    if (this.statusTimer) {
      clearTimeout(this.statusTimer);
    }
    this.statusTimer = setTimeout(() => {
      this.status.textContent = '';
    }, 3000);
  }
}

async function loadManifest() {
  try {
    const response = await fetch('/textures.manifest.json', { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } catch {
    return {
      grid: { columns: 10, rows: 10 },
      cells: Array.from({ length: 100 }, (_, index) => ({
        index,
        description: `Cell ${index}`,
      })),
    };
  }
}

export async function installBuildMode(app) {
  const manifest = await loadManifest();
  const { OrbitControls } = await import('three/addons/controls/OrbitControls.js');
  const { TransformControls } = await import('three/addons/controls/TransformControls.js');
  return new BuildModeEditor(app, manifest, OrbitControls, TransformControls);
}
