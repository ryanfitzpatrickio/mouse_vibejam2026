import * as THREE from 'three';
import { PrefabEditorDialog } from './PrefabEditorDialog.js';
import { DEFAULT_PREFAB_LIBRARY, normalizePrefabLibrary } from './prefabRegistry.js';
import { loadTextureAtlases, TEXTURE_ATLASES } from './textureAtlasRegistry.js';
import { assetUrl } from '../utils/assetUrl.js';

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
  const grid = app.room.getBuildGridConfig();
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
      atlas: 'textures',
      cell: 0,
      repeat: { x: 1, y: 1 },
      rotation: 0,
    },
    material: {
      color: '#ffffff',
      roughness: 0.88,
      metalness: 0.04,
    },
    prefabId: null,
    collider: true,
    castShadow: true,
    receiveShadow: true,
  };

  if (type === 'plane') {
    primitive.rotation.x = -Math.PI * 0.5;
    primitive.scale = { x: 1, y: 1, z: 1 };
  }

  if (type === 'cylinder') {
    primitive.scale = { x: 1, y: 1.5, z: 1 };
  }

  if (type === 'box') {
    primitive.scale = { x: 1, y: 1, z: 1 };
  }

  return app.room.snapPrimitiveToGrid(primitive, { snapY: true, snapScale: true });
}

function createAtlasButtonStyle(index, atlasUrl, columns = 10, rows = 10) {
  const col = index % columns;
  const row = Math.floor(index / columns);
  const x = columns > 1 ? (col / (columns - 1)) * 100 : 0;
  const y = rows > 1 ? (row / (rows - 1)) * 100 : 0;

  return {
    backgroundImage: `url('${atlasUrl}')`,
    backgroundSize: `${columns * 100}% ${rows * 100}%`,
    backgroundPosition: `${x}% ${y}%`,
  };
}

class BuildModeEditor {
  constructor(app, textureAtlases, prefabLibrary, OrbitControls, TransformControls) {
    this.app = app;
    this.textureAtlases = textureAtlases;
    this.activeTextureAtlasId = textureAtlases[0]?.id ?? TEXTURE_ATLASES[0].id;
    this.OrbitControls = OrbitControls;
    this.TransformControls = TransformControls;
    this.prefabLibrary = normalizePrefabLibrary(prefabLibrary ?? DEFAULT_PREFAB_LIBRARY);
    this.layout = app.room.getEditableLayout();
    this.selectedId = this.layout.primitives[0]?.id ?? null;
    this.visible = false;
    this.statusTimer = null;
    this.pointerNdc = new THREE.Vector2();
    this.pointerScreen = { x: 0, y: 0 };
    this.pointerInsideCanvas = false;
    this.raycaster = new THREE.Raycaster();
    this.currentHit = null;
    this._suppressTransformSync = false;
    this.transformMode = 'translate';
    this.glbRegistry = null;
    this._glbFileInput = null;

    this._createUI();
    this._createProbeVisuals();
    this._createOrbitControls();
    this._createTransformControls();
    this._bindCanvasEvents();
    this._createPrefabEditorDialog();
    this._renderPalette();
    this._refreshList();
    this._syncForm();
  }

  isActive() {
    return this.visible;
  }

  _activeTextureAtlas() {
    return this.textureAtlases.find((atlas) => atlas.id === this.activeTextureAtlasId) ?? this.textureAtlases[0] ?? TEXTURE_ATLASES[0];
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

    const grid = this.app.room.getBuildGridConfig();
    const gridNote = document.createElement('div');
    gridNote.textContent = `Grid: ${grid.columns}x${grid.rows} | cell ${grid.cellWidth.toFixed(3)} x ${grid.cellDepth.toFixed(3)}`;
    Object.assign(gridNote.style, {
      color: '#9ee8b2',
      marginBottom: '12px',
      fontSize: '11px',
    });
    this.panel.appendChild(gridNote);

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
    this._createPrefabSection();
    this._createGlbSection();
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

  _createPrefabEditorDialog() {
    this.prefabEditor = new PrefabEditorDialog({
      room: this.app.room,
      textureAtlases: this.textureAtlases,
      OrbitControls: this.OrbitControls,
      TransformControls: this.TransformControls,
      onSaveLibrary: async (library) => {
        const result = await this._savePrefabLibrary(library);
        if (result?.ok) {
          this.prefabLibrary = normalizePrefabLibrary(library);
          this._syncPrefabSection();
        }
        return result;
      },
    });
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
      if (!event.value) {
        this.layout = this.app.room.getEditableLayout();
        this._syncForm();
        this._attachTransformControls();
      }
    });
    this.transformControls.addEventListener('objectChange', () => {
      if (this._suppressTransformSync) return;
      const object = this.transformControls.object;
      const primitiveId = object?.userData?.primitiveId;
      const prefabInstanceId = object?.userData?.prefabInstanceId;
      if (!primitiveId && !prefabInstanceId) return;

      const primitive = primitiveId
        ? this.layout.primitives.find((entry) => entry.id === primitiveId)
        : null;
      const mode = this.transformMode || this.transformControls?.mode || 'translate';
      const isGlb = primitive?.type === 'glb';
      const next = primitive
        ? this.app.room.snapPrimitiveToGrid({
          ...deepClone(primitive),
          position: {
            x: object.position.x,
            y: object.position.y,
            z: object.position.z,
          },
          rotation: {
            x: object.rotation.x,
            y: object.rotation.y,
            z: object.rotation.z,
          },
          scale: {
            x: object.scale.x,
            y: object.scale.y,
            z: object.scale.z,
          },
        }, {
          snapY: true,
          snapPosition: mode !== 'scale',
          snapScale: mode === 'scale' && !isGlb,
          allowEdgeOverflow: true,
        })
        : {
          position: {
            x: Number(object.position.x.toFixed(4)),
            y: Number(object.position.y.toFixed(4)),
            z: Number(object.position.z.toFixed(4)),
          },
          rotation: {
            x: Number(object.rotation.x.toFixed(4)),
            y: Number(object.rotation.y.toFixed(4)),
            z: Number(object.rotation.z.toFixed(4)),
          },
          scale: {
            x: Number(object.scale.x.toFixed(4)),
            y: Number(object.scale.y.toFixed(4)),
            z: Number(object.scale.z.toFixed(4)),
          },
        };

      this._suppressTransformSync = true;
      object.position.set(next.position.x, next.position.y, next.position.z);
      object.rotation.set(next.rotation.x, next.rotation.y, next.rotation.z);
      object.scale.set(next.scale.x, next.scale.y, next.scale.z);
      this._suppressTransformSync = false;

      this.app.room.updateEditablePrimitiveTransform(primitiveId || prefabInstanceId, {
        position: next.position,
        rotation: next.rotation,
        scale: next.scale,
      });
      this.layout = this.app.room.getEditableLayout();
      this._syncForm();
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
      let hitObject = this.currentHit?.object;
      while (hitObject && !hitObject.userData?.primitiveId) {
        hitObject = hitObject.parent;
      }
      if (!hitObject?.userData?.primitiveId) return;
      this.selectedId = hitObject.userData.primitiveId;
      this._syncForm();
      this._setStatus(`Selected ${hitObject.name || 'object'}.`);
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

    let hitObject = hit.object;
    while (hitObject && !hitObject.userData?.primitiveId) {
      hitObject = hitObject.parent;
    }
    const primitiveId = hitObject?.userData?.primitiveId;
    const primitive = primitiveId
      ? this.layout.primitives.find((entry) => entry.id === primitiveId)
      : null;
    const gridCell = this._getGridCellFromPoint(hit.point);
    this.hitTooltip.style.display = 'block';
    this.hitTooltip.style.left = `${this.pointerScreen.x + 14}px`;
    this.hitTooltip.style.top = `${this.pointerScreen.y + 14}px`;
    this.hitTooltip.textContent = [
      hitObject?.name || hit.object.name || 'unnamed',
      gridCell ? `grid ${gridCell.col + 1}, ${gridCell.row + 1}` : '',
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
    this.transformMode = mode;
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

    this.clearanceInput = this._createRangeField(section, 'Clearance', 0, 2, 0.05, (value) => {
      this._updateSelected((primitive) => {
        primitive.colliderClearance = value;
      });
    });
  }

  _createTransformSection() {
    const section = this._createSection('Transform');

    this.positionInputs = this._createVectorInputs(section, 'Position', { step: 0.05 }, (axis, value) => {
      this._updateSelected((primitive) => {
        primitive.position[axis] = value;
      }, { snapPosition: true, snapScale: false });
    });
    this.rotationInputs = this._createVectorInputs(section, 'Rotation', { step: 1 }, (axis, value) => {
      this._updateSelected((primitive) => {
        primitive.rotation[axis] = value * DEG_TO_RAD;
      }, { snapPosition: false, snapScale: false });
    });
    this.scaleInputs = this._createVectorInputs(section, 'Scale', { step: 0.1, min: 0.1 }, (axis, value) => {
      this._updateSelected((primitive) => {
        primitive.scale[axis] = Math.max(0.1, value);
      }, { snapPosition: false, snapScale: true });
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
      max: (this._activeTextureAtlas().manifest?.cells?.length ?? 100) - 1,
    }, (value) => {
      this._updateSelected((primitive) => {
        primitive.texture.cell = Number.isFinite(value)
          ? clamp(Math.round(value), 0, (this._activeTextureAtlas().manifest?.cells?.length ?? 100) - 1)
          : null;
        primitive.texture.atlas = this.activeTextureAtlasId;
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

  _createPrefabSection() {
    const section = this._createSection('Prefabs');

    this.prefabSelect = document.createElement('select');
    this._styleField(this.prefabSelect);
    this.prefabSelect.addEventListener('change', () => {
      this._syncPrefabSection();
    });

    section.appendChild(this.prefabSelect);

    const actions = document.createElement('div');
    Object.assign(actions.style, {
      display: 'grid',
      gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
      gap: '8px',
      marginTop: '8px',
    });
    section.appendChild(actions);

    this._addInlineButton(actions, 'New / Edit', () => this._openPrefabEditor());
    this._addInlineButton(actions, 'Place', () => this._placeSelectedPrefab(), '#23472d');
    this._addInlineButton(actions, 'Delete', () => this._deleteSelectedPrefab(), '#5d221f');
    this._addInlineButton(actions, 'Save Lib', () => this._savePrefabLibrary());

    this.prefabMeta = document.createElement('div');
    Object.assign(this.prefabMeta.style, {
      color: '#d8c3a8',
      marginTop: '8px',
      fontSize: '11px',
      lineHeight: '1.35',
      whiteSpace: 'pre-wrap',
    });
    section.appendChild(this.prefabMeta);
  }

  _createPaletteSection() {
    const section = this._createSection('Texture Palette');

    this.textureAtlasTabs = document.createElement('div');
    Object.assign(this.textureAtlasTabs.style, {
      display: 'flex',
      flexWrap: 'wrap',
      gap: '6px',
      marginBottom: '8px',
    });
    section.appendChild(this.textureAtlasTabs);

    this.paletteGrid = document.createElement('div');
    Object.assign(this.paletteGrid.style, {
      display: 'grid',
      gridTemplateColumns: 'repeat(5, minmax(0, 1fr))',
      gap: '6px',
    });
    section.appendChild(this.paletteGrid);
  }

  _createGlbSection() {
    const section = this._createSection('GLB Models');

    this._glbFileInput = document.createElement('input');
    this._glbFileInput.type = 'file';
    this._glbFileInput.accept = '.glb';
    this._glbFileInput.style.display = 'none';
    this._glbFileInput.addEventListener('change', () => this._handleGlbUpload());
    document.body.appendChild(this._glbFileInput);

    const uploadRow = document.createElement('div');
    Object.assign(uploadRow.style, {
      display: 'grid',
      gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
      gap: '8px',
    });
    section.appendChild(uploadRow);

    this._addInlineButton(uploadRow, 'Upload GLB', () => this._glbFileInput.click());
    this._addInlineButton(uploadRow, 'Refresh', () => this._loadGlbRegistry());

    this.glbSelect = document.createElement('select');
    this._styleField(this.glbSelect);
    this.glbSelect.style.marginTop = '8px';
    section.appendChild(this.glbSelect);

    this._addInlineButton(section, 'Place GLB', () => this._placeSelectedGlb(), '#23472d');
    this._addInlineButton(section, 'Delete Asset', () => this._deleteSelectedGlb(), '#5d221f');

    this.glbStatus = document.createElement('div');
    Object.assign(this.glbStatus.style, {
      color: '#d8c3a8',
      marginTop: '8px',
      fontSize: '11px',
      lineHeight: '1.35',
      whiteSpace: 'pre-wrap',
    });
    section.appendChild(this.glbStatus);

    this._loadGlbRegistry();
  }

  async _loadGlbRegistry() {
    try {
      const response = await fetch(assetUrl('levels/glb-registry.json'), { cache: 'no-store' });
      if (!response.ok) {
        this.glbRegistry = { assets: [] };
      } else {
        this.glbRegistry = await response.json();
      }
    } catch {
      this.glbRegistry = { assets: [] };
    }
    this._syncGlbSection();
  }

  _syncGlbSection() {
    if (!this.glbSelect) return;
    const currentValue = this.glbSelect.value;
    this.glbSelect.innerHTML = '';
    const assets = this.glbRegistry?.assets ?? [];
    if (!assets.length) {
      const option = document.createElement('option');
      option.value = '';
      option.textContent = 'No GLB models uploaded';
      this.glbSelect.appendChild(option);
    } else {
      assets.forEach((asset) => {
        const option = document.createElement('option');
        option.value = asset.id;
        option.textContent = `${asset.name} (${(asset.size / 1024).toFixed(0)} KB)`;
        this.glbSelect.appendChild(option);
      });
      if (currentValue && assets.some((a) => a.id === currentValue)) {
        this.glbSelect.value = currentValue;
      }
    }

    const selected = this._selectedGlbAsset();
    if (this.glbStatus) {
      if (!selected) {
        this.glbStatus.textContent = 'Upload a .glb file to add custom models.';
      } else {
        this.glbStatus.textContent = [
          `File: ${selected.filename}`,
          `Size: ${(selected.size / 1024).toFixed(0)} KB`,
          `Uploaded: ${selected.uploadedAt ? new Date(selected.uploadedAt).toLocaleString() : 'unknown'}`,
        ].join('\n');
      }
    }
  }

  _selectedGlbAsset() {
    const id = this.glbSelect?.value;
    if (!id) return null;
    return (this.glbRegistry?.assets ?? []).find((a) => a.id === id) ?? null;
  }

  async _handleGlbUpload() {
    const file = this._glbFileInput?.files?.[0];
    if (!file) return;
    this._setStatus(`Uploading ${file.name}...`);

    try {
      const buffer = await file.arrayBuffer();
      const response = await fetch(`/__dev/upload-glb?name=${encodeURIComponent(file.name)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/octet-stream' },
        body: buffer,
      });
      const result = await response.json();
      if (!response.ok || !result.ok) {
        this._setStatus(`Upload failed: ${result.error || response.statusText}`, true);
        return;
      }

      this.app.room.glbRegistry = null;
      const preloaded = await this.app.room.loadGlbModel(result.entry.id);
      if (!preloaded) {
        this._setStatus(`Uploaded ${result.entry.name} but model preload failed.`, true);
      } else {
        this._setStatus(`Uploaded ${result.entry.name}.`);
      }
    } catch (err) {
      this._setStatus(`Upload error: ${err.message}`, true);
    }

    await this._loadGlbRegistry();
    this._glbFileInput.value = '';
  }

  async _placeSelectedGlb() {
    const asset = this._selectedGlbAsset();
    if (!asset) return;
    this._setStatus(`Loading ${asset.name}...`);

    const model = await this.app.room.loadGlbModel(asset.id);
    if (!model) {
      this._setStatus(`Failed to load GLB: ${asset.name}`, true);
      return;
    }

    const box = new THREE.Box3().setFromObject(model);
    const size = new THREE.Vector3();
    box.getSize(size);
    const maxDim = Math.max(size.x, size.y, size.z, 0.001);
    const autoScale = 1 / maxDim;

    const grid = this.app.room.getBuildGridConfig();
    const forward = new THREE.Vector3();
    this.app.camera.getWorldDirection(forward);
    forward.y = 0;
    if (forward.lengthSq() < 0.0001) forward.set(0, 0, -1);
    forward.normalize();
    const spawn = this.app.mouse.position.clone().add(forward.multiplyScalar(2.25));
    spawn.y = Math.max(this.app.mouse.position.y, 0);

    const primitive = {
      id: createPrimitiveId(),
      name: asset.name,
      type: 'glb',
      glbAssetId: asset.id,
      position: {
        x: Number(spawn.x.toFixed(4)),
        y: Number(spawn.y.toFixed(4)),
        z: Number(spawn.z.toFixed(4)),
      },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: autoScale, y: autoScale, z: autoScale },
      texture: { atlas: 'textures', cell: null, repeat: { x: 1, y: 1 }, rotation: 0 },
      material: { color: '#ffffff', roughness: 0.88, metalness: 0.04 },
      collider: true,
      colliderClearance: 0,
      castShadow: true,
      receiveShadow: true,
    };

    this.app.room.upsertEditablePrimitive(primitive);
    this.layout = this.app.room.getEditableLayout();
    this.selectedId = primitive.id;
    this._syncForm();
    this._attachTransformControls();
    this._setStatus(`Placed ${asset.name} (auto-scaled ${autoScale.toFixed(3)}x).`);
  }

  async _deleteSelectedGlb() {
    const asset = this._selectedGlbAsset();
    if (!asset) return;
    this.glbRegistry.assets = this.glbRegistry.assets.filter((a) => a.id !== asset.id);
    try {
      await fetch('/__dev/save-glb-registry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(this.glbRegistry),
      });
    } catch {}
    this.app.room.glbRegistry = null;
    this._syncGlbSection();
    this._setStatus(`Removed ${asset.name} from registry. File still on disk.`);
  }

  _renderPalette() {
    this._renderTextureAtlasTabs();
    this.paletteGrid.innerHTML = '';
    const activeAtlas = this._activeTextureAtlas();
    const columns = activeAtlas.manifest?.grid?.columns ?? 10;
    const rows = activeAtlas.manifest?.grid?.rows ?? 10;
    const cells = activeAtlas.manifest?.cells ?? [];

    cells.forEach((cell) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.cellIndex = String(cell.index);
      button.dataset.atlasId = activeAtlas.id;
      Object.assign(button.style, {
        position: 'relative',
        width: '100%',
        aspectRatio: '1',
        borderRadius: '8px',
        border: '1px solid rgba(255,255,255,0.18)',
        cursor: 'pointer',
        overflow: 'hidden',
        ...createAtlasButtonStyle(cell.index, activeAtlas.imageUrl, columns, rows),
      });
      button.title = `${activeAtlas.label}: ${cell.description ?? `Cell ${cell.index}`}`;
      button.addEventListener('click', () => {
        this.textureCellInput.value = String(cell.index);
        this._updateSelected((primitive) => {
          primitive.texture.atlas = activeAtlas.id;
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

  _renderTextureAtlasTabs() {
    this.textureAtlasTabs.innerHTML = '';
    this.textureAtlases.forEach((atlas) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = atlas.label;
      Object.assign(button.style, {
        padding: '6px 8px',
        borderRadius: '8px',
        border: '1px solid rgba(255,255,255,0.12)',
        background: this.activeTextureAtlasId === atlas.id ? '#6d4f2a' : 'rgba(255,255,255,0.06)',
        color: '#fff4e8',
        cursor: 'pointer',
        fontFamily: 'inherit',
        fontSize: '11px',
      });
      button.addEventListener('click', () => {
        this.activeTextureAtlasId = atlas.id;
        this._renderPalette();
        this._syncForm();
      });
      this.textureAtlasTabs.appendChild(button);
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

  _addInlineButton(parent, label, onClick, background = '#2f2c28') {
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
      input.removeAttribute('max');
      input.removeAttribute('min');
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
      input.removeAttribute('max');
      input.removeAttribute('min');
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
    input.removeAttribute('max');
    input.removeAttribute('min');
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
    this._syncPrefabSection();
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
      this.clearanceInput,
      this.prefabSelect,
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
    this.activeTextureAtlasId = primitive.texture.atlas ?? this.activeTextureAtlasId;
    this.textureCellInput.value = primitive.texture.cell ?? '';
    this.textureCellInput.max = String((this._activeTextureAtlas().manifest?.cells?.length ?? 100) - 1);
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
    this.clearanceInput.value = primitive.colliderClearance ?? 0;
    this.clearanceInput._output.textContent = (primitive.colliderClearance ?? 0).toFixed(2);
    this.prefabSelect.value = primitive.prefabId ?? '';
    this._highlightPalette();
  }

  _highlightPalette() {
    const selectedCell = String(this._selectedPrimitive()?.texture.cell ?? '');
    const selectedAtlas = this._selectedPrimitive()?.texture?.atlas ?? this.activeTextureAtlasId;
    this.paletteGrid.querySelectorAll('button').forEach((button) => {
      button.style.outline = button.dataset.cellIndex === selectedCell && button.dataset.atlasId === selectedAtlas
        ? '2px solid #ffe39d'
        : 'none';
    });
  }

  _selectedPrefab() {
    return this.prefabLibrary.prefabs.find((prefab) => prefab.id === this.prefabSelect.value) ?? null;
  }

  _syncPrefabSection() {
    const currentValue = this.prefabSelect?.value;
    if (this.prefabSelect) {
      this.prefabSelect.innerHTML = '';
      this.prefabLibrary.prefabs.forEach((prefab) => {
        const option = document.createElement('option');
        option.value = prefab.id;
        option.textContent = prefab.name;
        this.prefabSelect.appendChild(option);
      });
      if (currentValue && this.prefabLibrary.prefabs.some((prefab) => prefab.id === currentValue)) {
        this.prefabSelect.value = currentValue;
      } else if (this.prefabLibrary.prefabs[0]) {
        this.prefabSelect.value = this.prefabLibrary.prefabs[0].id;
      }
    }

    const prefab = this._selectedPrefab();
    if (!this.prefabMeta) return;
    if (!prefab) {
      this.prefabMeta.textContent = 'No prefabs in library.';
      return;
    }

    this.prefabMeta.textContent = [
      `Size: ${prefab.size.x} x ${prefab.size.y} x ${prefab.size.z} cells`,
      `Parts: ${prefab.primitives.length}`,
    ].join('\n');
  }

  _openPrefabEditor() {
    this.prefabEditor.open(this.prefabLibrary, this.prefabSelect.value || null);
  }

  _getFallbackGridCell(spanX = 1, spanZ = 1) {
    const grid = this.app.room.getBuildGridConfig();
    const point = this.app.mouse.position.clone();
    const col = clamp(
      Math.floor(((point.x + grid.roomWidth * 0.5) / grid.roomWidth) * grid.columns),
      0,
      Math.max(0, grid.columns - spanX),
    );
    const row = clamp(
      Math.floor(((point.z + grid.roomDepth * 0.5) / grid.roomDepth) * grid.rows),
      0,
      Math.max(0, grid.rows - spanZ),
    );
    return { col, row };
  }

  _placeSelectedPrefab() {
    const prefab = this._selectedPrefab();
    if (!prefab) return;

    const spanX = Math.max(1, prefab.size?.x ?? 1);
    const spanZ = Math.max(1, prefab.size?.z ?? 1);
    const cell = this.currentHit
      ? this._getGridCellFromPoint(this.currentHit.point)
      : this._getFallbackGridCell(spanX, spanZ);
    const targetCell = cell ?? this._getFallbackGridCell(spanX, spanZ);
    const ids = this.app.room.instantiatePrefab(prefab, {
      col: targetCell.col,
      row: targetCell.row,
    });
    this.layout = this.app.room.getEditableLayout();
    this.selectedId = ids[0] ?? this.selectedId;
    this._syncForm();
    this._attachTransformControls();
    this._setStatus(`Placed ${prefab.name}.`);
  }

  async _savePrefabLibrary(library = this.prefabLibrary) {
    const payload = normalizePrefabLibrary(library);
    const response = await fetch('/__dev/save-prefabs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const result = await response.json();
    if (!response.ok || !result.ok) {
      this._setStatus(`Prefab save failed: ${result.error || response.statusText}`, true);
      return { ok: false, error: result.error || response.statusText };
    }
    this.prefabLibrary = payload;
    this._syncPrefabSection();
    this._setStatus('Saved /levels/prefabs.json');
    return { ok: true };
  }

  _deleteSelectedPrefab() {
    const prefab = this._selectedPrefab();
    if (!prefab) return;
    this.prefabLibrary.prefabs = this.prefabLibrary.prefabs.filter((entry) => entry.id !== prefab.id);
    this._syncPrefabSection();
    this._setStatus(`Deleted ${prefab.name}.`);
  }

  _getGridCellFromPoint(point) {
    if (!point) return null;
    const grid = this.app.room.getBuildGridConfig();
    const localPoint = this.app.room.getGroup().worldToLocal(point.clone());
    const col = Math.floor(((localPoint.x + grid.roomWidth * 0.5) / grid.roomWidth) * grid.columns);
    const row = Math.floor(((localPoint.z + grid.roomDepth * 0.5) / grid.roomDepth) * grid.rows);

    if (col < 0 || col >= grid.columns || row < 0 || row >= grid.rows) {
      return null;
    }

    return { col, row };
  }

  _updateSelected(mutator, { snapPosition = true, snapScale = false, snapY = true } = {}) {
    const primitive = this._selectedPrimitive();
    if (!primitive) return;

    const next = deepClone(primitive);
    mutator(next);
    const snapped = this.app.room.snapPrimitiveToGrid(next, {
      snapY,
      snapPosition,
      snapScale,
      allowEdgeOverflow: true,
    });
    this.app.room.upsertEditablePrimitive(snapped);
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
    const grid = this.app.room.getBuildGridConfig();
    const copy = deepClone(primitive);
    copy.id = createPrimitiveId();
    copy.name = `${primitive.name}-copy`;
    copy.position.x += grid.cellWidth;
    copy.position.z += grid.cellDepth;
    const snapped = this.app.room.snapPrimitiveToGrid(copy, { snapY: true, allowEdgeOverflow: true });
    this.app.room.upsertEditablePrimitive(snapped);
    this.layout = this.app.room.getEditableLayout();
    this.selectedId = snapped.id;
    this._syncForm();
    this._attachTransformControls();
    this._setStatus(`Duplicated ${primitive.name}.`);
  }

  _deleteSelected() {
    if (!this.selectedId) return;
    const currentName = this._selectedPrimitive()?.name ?? 'primitive';
    this.app.room.purgeEditablePrimitive(this.selectedId);
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
  return loadTextureAtlases();
}

async function loadPrefabLibrary() {
  try {
    const response = await fetch(assetUrl('levels/prefabs.json'), { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json();
    return normalizePrefabLibrary(payload);
  } catch {
    return normalizePrefabLibrary(DEFAULT_PREFAB_LIBRARY);
  }
}

export async function installBuildMode(app) {
  const textureAtlases = await loadManifest();
  const prefabLibrary = await loadPrefabLibrary();
  const { OrbitControls } = await import('three/addons/controls/OrbitControls.js');
  const { TransformControls } = await import('three/addons/controls/TransformControls.js');
  return new BuildModeEditor(app, textureAtlases, prefabLibrary, OrbitControls, TransformControls);
}
