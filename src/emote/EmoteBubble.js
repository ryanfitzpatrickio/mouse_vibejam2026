import * as THREE from 'three';
import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';

const HEAD_OFFSET_Y = 1.35;
const FLASH_IN = 0.18;
const HOLD = 0.1;
const TOTAL = 1.9;
const FLOAT_UP_PX = 48;

export function spawnEmoteBubble(scene, mouse, emoji) {
  if (!scene || !mouse || !emoji) return { dispose() {} };

  const anchor = new THREE.Object3D();
  scene.add(anchor);

  const el = document.createElement('div');
  el.textContent = emoji;
  Object.assign(el.style, {
    fontSize: '44px',
    lineHeight: '1',
    pointerEvents: 'none',
    userSelect: 'none',
    WebkitUserSelect: 'none',
    willChange: 'transform, opacity',
    filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.55))',
    transform: 'translateY(0) scale(0.4)',
    opacity: '0',
  });

  const obj = new CSS2DObject(el);
  anchor.add(obj);

  const start = performance.now();
  let raf = 0;
  let disposed = false;

  function tick(now) {
    if (disposed) return;
    anchor.position.set(
      mouse.position.x,
      mouse.position.y + HEAD_OFFSET_Y,
      mouse.position.z,
    );
    const t = (now - start) / 1000;
    if (t < FLASH_IN) {
      const k = t / FLASH_IN;
      const s = 0.4 + (1.35 - 0.4) * k;
      el.style.transform = `translateY(0px) scale(${s})`;
      el.style.opacity = String(k);
    } else if (t < FLASH_IN + HOLD) {
      const k = (t - FLASH_IN) / HOLD;
      const s = 1.35 - 0.35 * k;
      el.style.transform = `translateY(0px) scale(${s})`;
      el.style.opacity = '1';
    } else if (t < TOTAL) {
      const k = (t - FLASH_IN - HOLD) / (TOTAL - FLASH_IN - HOLD);
      el.style.transform = `translateY(${-FLOAT_UP_PX * k}px) scale(1)`;
      el.style.opacity = String(Math.max(0, 1 - k));
    } else {
      dispose();
      return;
    }
    raf = requestAnimationFrame(tick);
  }
  raf = requestAnimationFrame(tick);

  function dispose() {
    if (disposed) return;
    disposed = true;
    cancelAnimationFrame(raf);
    anchor.remove(obj);
    scene.remove(anchor);
    el.remove();
  }
  return { dispose };
}
