import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { MouseEyeAtlasAnimator } from '../animation/MouseEyeAtlasAnimator.js';
import {
  exportEyePlacements,
  getEyePlacement,
  getEyeTargetDef,
  listEyeTargets,
  resetEyePlacement,
  setEyePlacement,
} from '../data/eyePlacements.js';
import { findSocket, listSockets } from '../data/attachEyes.js';
import { assetUrl } from '../utils/assetUrl.js';

const RAD2DEG = 180 / Math.PI;
const DEG2RAD = Math.PI / 180;

/**
 * Dev-only "Dressing Room" dialog. Loads any registered eye-placement target
 * (mouse, brain, jerry, cat, human) into an isolated viewport so eyes can be
 * positioned, rotated, and scaled relative to a chosen socket bone. Changes
 * persist via the eyePlacements store and are broadcast live to in-game
 * entities listening for that target.
 *
 * Future-proofed for additional slot types (e.g. hand items).
 */
export class DressingRoomDialog {
  constructor({ OrbitControls, TransformControls } = {}) {
    this.OrbitControls = OrbitControls;
    this.TransformControls = TransformControls;
    this.targets = listEyeTargets();
    this.activeKey = this.targets[0]?.key ?? 'mouse';
    this._raf = 0;
    this._gltfCache = new Map();
    this._previewModel = null;
    this._eyeAnimator = null;
    this._lastTime = 0;
    this._suppressInputSync = false;

    this._buildUI();
    this._buildScene();
  }

  open(modelKey) {
    if (modelKey && this.targets.find((t) => t.key === modelKey)) {
      this.activeKey = modelKey;
    }
    this.overlay.style.display = 'grid';
    this._resizeRenderer();
    this._loadActiveTarget().catch((err) => this._setStatus(`load failed: ${err.message}`, true));
    this._startLoop();
  }

  close() {
    this.overlay.style.display = 'none';
    this._stopLoop();
    this._transformControls?.detach();
  }

  isOpen() {
    return this.overlay.style.display !== 'none';
  }

  toggle(modelKey) {
    if (this.isOpen()) this.close();
    else this.open(modelKey);
  }

  _buildUI() {
    this.overlay = document.createElement('div');
    Object.assign(this.overlay.style, {
      position: 'fixed',
      inset: '0',
      zIndex: '170',
      display: 'none',
      gridTemplateColumns: 'minmax(440px, 1fr) 360px',
      background: 'rgba(0,0,0,0.7)',
      backdropFilter: 'blur(8px)',
      fontFamily: 'monospace',
      color: '#f7efe5',
    });

    const viewportWrap = document.createElement('div');
    Object.assign(viewportWrap.style, {
      position: 'relative',
      minHeight: '100vh',
      padding: '20px',
      boxSizing: 'border-box',
    });
    this.overlay.appendChild(viewportWrap);

    this.canvas = document.createElement('canvas');
    Object.assign(this.canvas.style, {
      width: '100%',
      height: '100%',
      display: 'block',
      borderRadius: '18px',
      background: 'linear-gradient(180deg, rgba(42,52,63,1) 0%, rgba(20,18,16,1) 100%)',
      boxShadow: '0 18px 50px rgba(0,0,0,0.35)',
    });
    viewportWrap.appendChild(this.canvas);

    const hint = document.createElement('div');
    hint.textContent = 'Dressing Room — orbit to inspect, drag gizmo to nudge eyes, then Save.';
    Object.assign(hint.style, {
      position: 'absolute',
      left: '32px',
      bottom: '28px',
      padding: '8px 10px',
      borderRadius: '10px',
      background: 'rgba(12,10,9,0.72)',
      border: '1px solid rgba(255,255,255,0.12)',
      fontSize: '12px',
    });
    viewportWrap.appendChild(hint);

    this.panel = document.createElement('aside');
    Object.assign(this.panel.style, {
      overflowY: 'auto',
      padding: '20px',
      boxSizing: 'border-box',
      background: 'rgba(12,10,9,0.95)',
      borderLeft: '1px solid rgba(255,255,255,0.08)',
      fontSize: '12px',
    });
    this.overlay.appendChild(this.panel);

    const title = document.createElement('div');
    title.textContent = 'DRESSING ROOM';
    Object.assign(title.style, {
      fontWeight: '700',
      letterSpacing: '0.08em',
      color: '#ffd7a4',
      marginBottom: '12px',
    });
    this.panel.appendChild(title);

    this.targetSelect = this._addSelect('Character', this.targets.map((t) => ({ value: t.key, label: t.label })), this.activeKey, (val) => {
      this.activeKey = val;
      this._loadActiveTarget().catch((err) => this._setStatus(`load failed: ${err.message}`, true));
    });

    this.socketSelect = this._addSelect('Socket bone', [{ value: '', label: '(model root)' }], '', (val) => {
      const placement = { socket: val || null };
      setEyePlacement(this.activeKey, placement);
      this._reflectPlacementToInputs(getEyePlacement(this.activeKey));
    });

    const transformBtns = document.createElement('div');
    Object.assign(transformBtns.style, { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px', margin: '8px 0' });
    transformBtns.appendChild(this._makeButton('Move', () => this._setTransformMode('translate')));
    transformBtns.appendChild(this._makeButton('Rotate', () => this._setTransformMode('rotate')));
    transformBtns.appendChild(this._makeButton('Scale', () => this._setTransformMode('scale')));
    this.panel.appendChild(transformBtns);

    this.posInputs = this._addVectorRow('Position', [-2, 2, 0.001]);
    this.rotInputs = this._addVectorRow('Rotation°', [-360, 360, 0.5]);
    this.scaleInputs = this._addVectorRow('Scale', [0.01, 8, 0.001]);
    this.eyeSizeInput = this._addNumberRow('Eye size', 0.01, 1, 0.001);

    const actions = document.createElement('div');
    Object.assign(actions.style, { display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '6px', marginTop: '12px' });
    actions.appendChild(this._makeButton('Reset target', () => this._resetActive(), '#5d221f'));
    actions.appendChild(this._makeButton('Copy JSON', () => this._copyJson()));
    this.panel.appendChild(actions);

    this.status = document.createElement('div');
    Object.assign(this.status.style, { marginTop: '10px', minHeight: '18px', color: '#9ee8b2', whiteSpace: 'pre-wrap' });
    this.panel.appendChild(this.status);

    const closeBtn = this._makeButton('Close (N)', () => this.close());
    closeBtn.style.marginTop = '12px';
    this.panel.appendChild(closeBtn);

    document.body.appendChild(this.overlay);
  }

  _addSelect(label, options, value, onChange) {
    const row = document.createElement('label');
    Object.assign(row.style, { display: 'block', marginBottom: '8px' });
    row.appendChild(this._makeLabelSpan(label));
    const select = document.createElement('select');
    Object.assign(select.style, this._inputStyle());
    for (const opt of options) {
      const option = document.createElement('option');
      option.value = opt.value;
      option.textContent = opt.label;
      select.appendChild(option);
    }
    select.value = value;
    select.addEventListener('change', () => onChange(select.value));
    row.appendChild(select);
    this.panel.appendChild(row);
    return select;
  }

  _addVectorRow(label, [min, max, step]) {
    const wrap = document.createElement('div');
    Object.assign(wrap.style, { marginBottom: '8px' });
    wrap.appendChild(this._makeLabelSpan(label));
    const grid = document.createElement('div');
    Object.assign(grid.style, { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '4px' });
    const inputs = ['x', 'y', 'z'].map((axis) => {
      const input = document.createElement('input');
      input.type = 'number';
      input.min = String(min);
      input.max = String(max);
      input.step = String(step);
      input.dataset.axis = axis;
      Object.assign(input.style, this._inputStyle());
      input.addEventListener('input', () => this._onInputsChanged());
      grid.appendChild(input);
      return input;
    });
    wrap.appendChild(grid);
    this.panel.appendChild(wrap);
    return inputs;
  }

  _addNumberRow(label, min, max, step) {
    const wrap = document.createElement('div');
    Object.assign(wrap.style, { marginBottom: '8px' });
    wrap.appendChild(this._makeLabelSpan(label));
    const input = document.createElement('input');
    input.type = 'number';
    input.min = String(min);
    input.max = String(max);
    input.step = String(step);
    Object.assign(input.style, this._inputStyle());
    input.addEventListener('input', () => this._onInputsChanged());
    wrap.appendChild(input);
    this.panel.appendChild(wrap);
    return input;
  }

  _makeLabelSpan(text) {
    const span = document.createElement('div');
    span.textContent = text;
    Object.assign(span.style, { color: '#cbb89a', marginBottom: '2px', fontSize: '11px' });
    return span;
  }

  _inputStyle() {
    return {
      width: '100%',
      boxSizing: 'border-box',
      padding: '4px 6px',
      background: 'rgba(255,255,255,0.05)',
      color: '#f7efe5',
      border: '1px solid rgba(255,255,255,0.12)',
      borderRadius: '6px',
      fontFamily: 'monospace',
      fontSize: '12px',
    };
  }

  _makeButton(label, onClick, bg = '#23472d') {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = label;
    Object.assign(btn.style, {
      padding: '6px 8px',
      background: bg,
      color: '#f7efe5',
      border: '1px solid rgba(255,255,255,0.12)',
      borderRadius: '6px',
      cursor: 'pointer',
      fontFamily: 'monospace',
      fontSize: '12px',
    });
    btn.addEventListener('click', onClick);
    return btn;
  }

  _buildScene() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#2e333a');

    this.camera = new THREE.PerspectiveCamera(50, 1, 0.01, 200);
    this.camera.position.set(2.2, 1.6, 2.6);

    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));

    this.scene.add(new THREE.HemisphereLight('#dfe8f1', '#3b2f26', 1.2));
    const sun = new THREE.DirectionalLight('#ffdcb3', 1.6);
    sun.position.set(4, 6, 3);
    this.scene.add(sun);

    const grid = new THREE.GridHelper(8, 8, 0x556677, 0x222a33);
    grid.position.y = 0;
    this.scene.add(grid);

    this.modelRoot = new THREE.Group();
    this.scene.add(this.modelRoot);

    if (this.OrbitControls) {
      this._orbit = new this.OrbitControls(this.camera, this.canvas);
      this._orbit.enableDamping = true;
      this._orbit.dampingFactor = 0.08;
      this._orbit.target.set(0, 1.0, 0);
    }

    if (this.TransformControls) {
      this._transformControls = new this.TransformControls(this.camera, this.canvas);
      this._transformControls.size = 0.7;
      this._transformControls.addEventListener('dragging-changed', (event) => {
        if (this._orbit) this._orbit.enabled = !event.value;
      });
      this._transformControls.addEventListener('objectChange', () => this._onGizmoChanged());
      const helper = this._transformControls.getHelper?.() ?? this._transformControls;
      this.scene.add(helper);
    }

    window.addEventListener('resize', () => {
      if (this.isOpen()) this._resizeRenderer();
    });
  }

  _resizeRenderer() {
    const rect = this.canvas.getBoundingClientRect();
    const w = Math.max(64, Math.floor(rect.width));
    const h = Math.max(64, Math.floor(rect.height));
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  _setTransformMode(mode) {
    this._transformControls?.setMode(mode);
  }

  async _loadActiveTarget() {
    const def = getEyeTargetDef(this.activeKey);
    if (!def) return;
    this._setStatus(`Loading ${def.label}…`);

    if (this._previewModel) {
      this.modelRoot.remove(this._previewModel);
      this._previewModel = null;
    }
    if (this._eyeAnimator) {
      this._eyeAnimator.dispose();
      this._eyeAnimator = null;
    }
    this._mixer = null;
    this._transformControls?.detach();

    const gltf = await this._loadGltf(def.modelPath);
    // Use SkeletonUtils.clone so cloned skinned meshes actually deform under
    // their own skeleton (regular .clone() leaves the mesh bound to the
    // ORIGINAL skeleton, so playing animations on the clone wouldn't move
    // the mesh — and bone positions wouldn't match in-game's idle pose).
    const model = cloneSkinned(gltf.scene);
    model.traverse((child) => { if (child.isMesh) child.castShadow = false; });
    this.modelRoot.add(model);
    this._previewModel = model;

    // Drive the model with its idle animation so the head bone (and the
    // eyes parented to it) sit in the same rest pose you see in-game,
    // not in the GLB's bind pose. Without this the cat looks T-posed and
    // any eye placement tuned here is offset from where it lands at runtime.
    if (gltf.animations?.length) {
      this._mixer = new THREE.AnimationMixer(model);
      const clip = gltf.animations.find((c) => /^idle$/i.test(c.name))
        ?? gltf.animations.find((c) => /idle/i.test(c.name))
        ?? gltf.animations[0];
      if (clip) {
        const action = this._mixer.clipAction(clip);
        action.play();
        // Advance once so the bones snap to the first frame before bbox/socket lookup.
        this._mixer.update(0);
      }
      model.updateMatrixWorld(true);
    }

    // Match the in-game world height for this character so eye placement
    // values are 1:1 portable: bone world-space scale (and therefore the
    // visible eye plane size) ends up identical to the live game.
    //
    // IMPORTANT: bbox method must match the in-game entity. Predators use
    // `Box3.setFromObject` (includes bones); HeroAvatar uses mesh-only
    // because some skinned skeletons have stray empties at extreme positions
    // that poison setFromObject. Pick per `kind`.
    model.updateMatrixWorld(true);
    let box;
    if (def.kind === 'predator') {
      box = new THREE.Box3().setFromObject(model);
    } else {
      box = new THREE.Box3();
      const meshBox = new THREE.Box3();
      model.traverse((child) => {
        if (!child.isMesh || !child.geometry) return;
        if (!child.geometry.boundingBox) child.geometry.computeBoundingBox();
        meshBox.copy(child.geometry.boundingBox).applyMatrix4(child.matrixWorld);
        box.union(meshBox);
      });
      if (box.isEmpty()) box.setFromObject(model);
    }
    const size = new THREE.Vector3();
    box.getSize(size);
    const targetH = def.previewWorldHeight ?? 1.6;
    const measuredH = Math.max(0.001, size.y);
    const fit = targetH / measuredH;
    model.scale.setScalar(fit);
    model.position.y = -box.min.y * fit;

    // Frame the camera to the model's visible height so a 0.6m brain is just
    // as inspectable as a 9m human (with eyes still visibly large enough).
    if (this._orbit) {
      const center = targetH * 0.55;
      const dist = Math.max(0.6, targetH * 1.8);
      this._orbit.target.set(0, center, 0);
      this.camera.position.set(dist * 0.7, center + dist * 0.4, dist);
      this.camera.near = Math.max(0.001, targetH * 0.005);
      this.camera.far = Math.max(50, targetH * 30);
      this.camera.updateProjectionMatrix();
      this._orbit.update();
    }

    // Populate socket dropdown from the just-loaded model.
    this._refillSocketOptions(model);

    // Attach a fresh eye animator for live preview.
    this._eyeAnimator = new MouseEyeAtlasAnimator();
    await this._eyeAnimator.load();
    const placement = getEyePlacement(this.activeKey);
    const anchor = findSocket(model, placement.socket);
    this._eyeAnimator.attach(anchor, {
      localOffset: new THREE.Vector3(placement.position.x, placement.position.y, placement.position.z),
      localRotation: new THREE.Euler(placement.rotation.x, placement.rotation.y, placement.rotation.z),
      localScale: new THREE.Vector3(placement.scale.x, placement.scale.y, placement.scale.z),
      eyeSize: placement.eyeSize ?? 0.13,
    });
    this._eyeAnimator.setViewCamera(this.camera);
    this._eyeAnimator.setState('idle', { immediate: true });
    if (this._transformControls && this._eyeAnimator.group) {
      this._transformControls.attach(this._eyeAnimator.group);
      this._transformControls.setMode('translate');
    }

    this._reflectPlacementToInputs(placement);
    this._setStatus(`Editing ${def.label}.`);
  }

  _loadGltf(path) {
    if (!this._gltfCache.has(path)) {
      const loader = new GLTFLoader();
      loader.setMeshoptDecoder(MeshoptDecoder);
      this._gltfCache.set(path, loader.loadAsync(assetUrl(path)));
    }
    return this._gltfCache.get(path);
  }

  _refillSocketOptions(model) {
    const sockets = listSockets(model);
    while (this.socketSelect.firstChild) this.socketSelect.firstChild.remove();
    const root = document.createElement('option');
    root.value = '';
    root.textContent = '(model root)';
    this.socketSelect.appendChild(root);
    for (const name of sockets) {
      const opt = document.createElement('option');
      opt.value = name;
      opt.textContent = name;
      this.socketSelect.appendChild(opt);
    }
    const placement = getEyePlacement(this.activeKey);
    this.socketSelect.value = placement.socket ?? '';
  }

  _reflectPlacementToInputs(placement) {
    if (!placement) return;
    this._suppressInputSync = true;
    try {
      const setVec = (inputs, vec, scale = 1) => {
        inputs[0].value = (vec.x * scale).toFixed(4);
        inputs[1].value = (vec.y * scale).toFixed(4);
        inputs[2].value = (vec.z * scale).toFixed(4);
      };
      setVec(this.posInputs, placement.position);
      setVec(this.rotInputs, placement.rotation, RAD2DEG);
      setVec(this.scaleInputs, placement.scale);
      this.eyeSizeInput.value = (placement.eyeSize ?? 0.13).toFixed(3);
      this.socketSelect.value = placement.socket ?? '';
    } finally {
      this._suppressInputSync = false;
    }
    this._applyPlacementToAnimator(placement);
  }

  _applyPlacementToAnimator(placement) {
    if (!this._eyeAnimator) return;
    this._eyeAnimator.setPlacement({
      position: placement.position,
      rotation: placement.rotation,
      scale: placement.scale,
      eyeSize: placement.eyeSize,
    });
  }

  _onInputsChanged() {
    if (this._suppressInputSync) return;
    const num = (input) => {
      const n = Number(input.value);
      return Number.isFinite(n) ? n : 0;
    };
    const placement = {
      position: { x: num(this.posInputs[0]), y: num(this.posInputs[1]), z: num(this.posInputs[2]) },
      rotation: {
        x: num(this.rotInputs[0]) * DEG2RAD,
        y: num(this.rotInputs[1]) * DEG2RAD,
        z: num(this.rotInputs[2]) * DEG2RAD,
      },
      scale: { x: num(this.scaleInputs[0]), y: num(this.scaleInputs[1]), z: num(this.scaleInputs[2]) },
      eyeSize: num(this.eyeSizeInput),
    };
    setEyePlacement(this.activeKey, placement);
    this._applyPlacementToAnimator(getEyePlacement(this.activeKey));
  }

  _onGizmoChanged() {
    const group = this._eyeAnimator?.group;
    if (!group) return;
    const placement = {
      position: { x: group.position.x, y: group.position.y, z: group.position.z },
      rotation: { x: group.rotation.x, y: group.rotation.y, z: group.rotation.z },
      scale: { x: group.scale.x, y: group.scale.y, z: group.scale.z },
    };
    setEyePlacement(this.activeKey, placement);
    this._reflectPlacementToInputs(getEyePlacement(this.activeKey));
  }

  _resetActive() {
    resetEyePlacement(this.activeKey);
    this._reflectPlacementToInputs(getEyePlacement(this.activeKey));
    this._setStatus(`Reset ${this.activeKey} to defaults.`);
  }

  async _copyJson() {
    const data = exportEyePlacements();
    const text = JSON.stringify(data, null, 2);
    try {
      await navigator.clipboard.writeText(text);
      this._setStatus('Copied JSON to clipboard.');
    } catch {
      this._setStatus('Clipboard blocked — JSON in console.', true);
      // eslint-disable-next-line no-console
      console.log('[DressingRoom] eye placements:', text);
    }
  }

  _setStatus(text, isError = false) {
    this.status.textContent = text;
    this.status.style.color = isError ? '#ff8b8b' : '#9ee8b2';
  }

  _startLoop() {
    if (this._raf) return;
    const tick = (timeMs) => {
      this._raf = requestAnimationFrame(tick);
      const dt = this._lastTime ? (timeMs - this._lastTime) * 0.001 : 1 / 60;
      this._lastTime = timeMs;
      this._orbit?.update();
      this._mixer?.update(dt);
      this._eyeAnimator?.update(dt);
      this.renderer.render(this.scene, this.camera);
    };
    this._lastTime = 0;
    this._raf = requestAnimationFrame(tick);
  }

  _stopLoop() {
    if (this._raf) cancelAnimationFrame(this._raf);
    this._raf = 0;
  }
}
