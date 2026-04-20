import * as THREE from 'three';
import { COLLECTIBLE_PICKUP_RADIUS } from '../../shared/heroUnlocks.js';

const KIND_STYLE = {
  sewing: Object.freeze({
    primary: '#d486a8',
    secondary: '#f7bfd6',
    accent: '#fff3f7',
    shadow: '#5a2e45',
    scale: Object.freeze({ x: 0.5, y: 0.5 }),
  }),
  speed: Object.freeze({
    primary: '#6fb4ff',
    secondary: '#a6dcff',
    accent: '#fff4ad',
    shadow: '#234a78',
    scale: Object.freeze({ x: 0.48, y: 0.48 }),
  }),
};

const SPRITE_TEXTURE_CACHE = new Map();

function createTexture(size, draw) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  draw(ctx, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

function roundRect(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w * 0.5, h * 0.5);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function drawGlow(ctx, size, color) {
  const center = size * 0.5;
  const gradient = ctx.createRadialGradient(center, center, size * 0.04, center, center, size * 0.34);
  gradient.addColorStop(0, `${color}ee`);
  gradient.addColorStop(0.42, `${color}66`);
  gradient.addColorStop(1, `${color}00`);
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(center, center, size * 0.38, 0, Math.PI * 2);
  ctx.fill();
}

function getSewingTexture() {
  if (SPRITE_TEXTURE_CACHE.has('sewing')) return SPRITE_TEXTURE_CACHE.get('sewing');
  const texture = createTexture(256, (ctx, size) => {
    const style = KIND_STYLE.sewing;
    drawGlow(ctx, size, style.primary);

    ctx.save();
    ctx.translate(size * 0.5, size * 0.52);
    ctx.rotate(-0.16);

    ctx.fillStyle = style.secondary;
    roundRect(ctx, -70, -54, 140, 26, 14);
    ctx.fill();
    roundRect(ctx, -70, 28, 140, 26, 14);
    ctx.fill();

    const bodyGradient = ctx.createLinearGradient(0, -24, 0, 24);
    bodyGradient.addColorStop(0, '#fce1ec');
    bodyGradient.addColorStop(0.5, style.primary);
    bodyGradient.addColorStop(1, '#b95e85');
    ctx.fillStyle = bodyGradient;
    roundRect(ctx, -54, -36, 108, 72, 24);
    ctx.fill();

    ctx.strokeStyle = '#ffffff99';
    ctx.lineWidth = 6;
    for (let i = -18; i <= 18; i += 12) {
      ctx.beginPath();
      ctx.moveTo(-38, i);
      ctx.lineTo(38, i + 6);
      ctx.stroke();
    }

    ctx.fillStyle = style.shadow;
    ctx.beginPath();
    ctx.arc(0, 0, 16, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffdceb';
    ctx.beginPath();
    ctx.arc(0, 0, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.strokeStyle = '#ffeaf2';
    ctx.lineWidth = 8;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(54, 82);
    ctx.bezierCurveTo(78, 70, 98, 94, 112, 120);
    ctx.bezierCurveTo(132, 158, 170, 162, 184, 128);
    ctx.stroke();
    ctx.restore();

    ctx.save();
    ctx.translate(176, 126);
    ctx.rotate(0.35);
    ctx.fillStyle = style.accent;
    ctx.beginPath();
    ctx.moveTo(-7, -40);
    ctx.lineTo(7, -40);
    ctx.lineTo(3, 26);
    ctx.lineTo(-3, 26);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#ffd1df';
    ctx.beginPath();
    ctx.moveTo(-9, -42);
    ctx.lineTo(0, -62);
    ctx.lineTo(9, -42);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  });
  SPRITE_TEXTURE_CACHE.set('sewing', texture);
  return texture;
}

function getSpeedTexture() {
  if (SPRITE_TEXTURE_CACHE.has('speed')) return SPRITE_TEXTURE_CACHE.get('speed');
  const texture = createTexture(256, (ctx, size) => {
    const style = KIND_STYLE.speed;
    drawGlow(ctx, size, style.primary);

    const center = size * 0.5;
    const outerGradient = ctx.createRadialGradient(center, center, size * 0.06, center, center, size * 0.28);
    outerGradient.addColorStop(0, '#effaff');
    outerGradient.addColorStop(0.48, style.secondary);
    outerGradient.addColorStop(1, '#3e88da');
    ctx.fillStyle = outerGradient;
    ctx.beginPath();
    ctx.arc(center, center, 60, 0, Math.PI * 2);
    ctx.fill();

    ctx.lineWidth = 10;
    ctx.strokeStyle = '#d9f6ff';
    ctx.beginPath();
    ctx.arc(center, center, 54, 0, Math.PI * 2);
    ctx.stroke();

    ctx.strokeStyle = '#ddf6ffcc';
    ctx.lineWidth = 12;
    ctx.lineCap = 'round';
    for (let i = 0; i < 3; i += 1) {
      const y = 104 + i * 18;
      ctx.beginPath();
      ctx.moveTo(34, y);
      ctx.lineTo(72, y);
      ctx.stroke();
    }

    ctx.fillStyle = style.accent;
    ctx.beginPath();
    ctx.moveTo(136, 68);
    ctx.lineTo(94, 130);
    ctx.lineTo(126, 130);
    ctx.lineTo(108, 188);
    ctx.lineTo(166, 116);
    ctx.lineTo(132, 116);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#ffffffcc';
    ctx.beginPath();
    ctx.moveTo(125, 84);
    ctx.lineTo(112, 108);
    ctx.lineTo(132, 108);
    ctx.lineTo(118, 154);
    ctx.lineTo(150, 112);
    ctx.lineTo(130, 112);
    ctx.closePath();
    ctx.fill();
  });
  SPRITE_TEXTURE_CACHE.set('speed', texture);
  return texture;
}

function getCollectibleTexture(kind) {
  return kind === 'speed' ? getSpeedTexture() : getSewingTexture();
}

/**
 * Renders server-scattered hero-unlock collectibles as small billboard sprites.
 * Polls each frame for local-player proximity and fires the pickup message
 * (server validates and broadcasts removal).
 */
export class UnlockCollectibles {
  constructor({ scene, net, getPlayer }) {
    this.scene = scene;
    this.net = net;
    this.getPlayer = getPlayer;
    this.root = new THREE.Group();
    this.root.name = 'UnlockCollectibles';
    scene.add(this.root);
    /** itemId -> { sprite, item, pulseOffset, spinSpeed } */
    this.items = new Map();
    /** itemIds we've already sent a pickup for (avoid spamming). */
    this._pending = new Set();
    this._time = 0;
  }

  _buildSprite(kind) {
    const style = KIND_STYLE[kind] ?? KIND_STYLE.sewing;
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: getCollectibleTexture(kind),
      transparent: true,
      alphaTest: 0.08,
      depthTest: true,
      depthWrite: false,
      sizeAttenuation: true,
      toneMapped: false,
    }));
    sprite.scale.set(style.scale.x, style.scale.y, 1);
    sprite.renderOrder = 8;
    sprite.userData.baseScaleX = style.scale.x;
    sprite.userData.baseScaleY = style.scale.y;
    return sprite;
  }

  _sync() {
    const serverItems = this.net?.unlockItems;
    if (!Array.isArray(serverItems)) return;
    const seen = new Set();
    for (const item of serverItems) {
      if (!item || item.consumed) continue;
      seen.add(item.id);
      if (this.items.has(item.id)) continue;
      const sprite = this._buildSprite(item.kind);
      sprite.position.set(item.x, (item.y ?? 0) + 0.28, item.z);
      sprite.userData.itemId = item.id;
      sprite.userData.baseY = sprite.position.y;
      this.root.add(sprite);
      this.items.set(item.id, {
        sprite,
        item,
        pulseOffset: Math.random() * Math.PI * 2,
        spinSpeed: 0.8 + Math.random() * 0.5,
      });
    }
    // Remove any we have that the server no longer reports.
    for (const [id, entry] of this.items) {
      if (!seen.has(id)) {
        this.root.remove(entry.sprite);
        entry.sprite.material?.dispose?.();
        this.items.delete(id);
        this._pending.delete(id);
      }
    }
  }

  update(dt) {
    this._sync();
    this._time += dt;
    const player = this.getPlayer?.();
    const px = player?.position?.x ?? 0;
    const pz = player?.position?.z ?? 0;
    const py = player?.position?.y ?? 0;
    const rSq = COLLECTIBLE_PICKUP_RADIUS * COLLECTIBLE_PICKUP_RADIUS;
    for (const [id, entry] of this.items) {
      // Gentle bob + pulse + spin so items read as interactive even at mouse scale.
      const bob = Math.sin(this._time * 2.4 + entry.item.x) * 0.05;
      const pulse = 1 + Math.sin(this._time * 5.2 + entry.pulseOffset) * 0.07;
      entry.sprite.position.y = entry.sprite.userData.baseY + bob;
      entry.sprite.scale.set(
        entry.sprite.userData.baseScaleX * pulse,
        entry.sprite.userData.baseScaleY * pulse,
        1,
      );
      entry.sprite.material.rotation += dt * entry.spinSpeed;
      if (!player || this._pending.has(id)) continue;
      const dx = entry.item.x - px;
      const dz = entry.item.z - pz;
      const dy = (entry.item.y ?? 0) - py;
      if (dx * dx + dz * dz + dy * dy * 0.25 < rSq) {
        this._pending.add(id);
        this.net?.sendUnlockPickup?.(id);
      }
    }
  }

  dispose() {
    for (const entry of this.items.values()) {
      this.root.remove(entry.sprite);
      entry.sprite.material?.dispose?.();
    }
    this.items.clear();
    this.scene.remove(this.root);
  }
}
