import { render } from 'solid-js/web';
import { createStore } from 'solid-js/store';
import { batch } from 'solid-js';
import { HudView } from './HudView.jsx';

const PATCH_KEYS = [
  'stamina',
  'health',
  'ping',
  'playerCount',
  'cheese',
  'lives',
  'alive',
  'respawnCountdown',
];

/**
 * In-game HUD (bottom-left bars + stats + respawn overlay), implemented in Solid.js.
 */
export class HUD {
  constructor({ container = document.body } = {}) {
    this.container = container;
    this._mount = document.createElement('div');
    this.container.appendChild(this._mount);

    const [state, setState] = createStore({
      stamina: 1,
      health: 1,
      ping: undefined,
      playerCount: 1,
      cheese: 0,
      lives: 2,
      alive: true,
      respawnCountdown: 0,
    });
    this._setState = setState;
    this._dispose = render(() => <HudView state={state} />, this._mount);
  }

  update(patch = {}) {
    const part = {};
    for (const k of PATCH_KEYS) {
      if (patch[k] !== undefined) {
        part[k] = patch[k];
      }
    }
    if (!Object.keys(part).length) return;
    batch(() => {
      this._setState(part);
    });
  }

  dispose() {
    this._dispose();
    this._mount.remove();
  }
}
