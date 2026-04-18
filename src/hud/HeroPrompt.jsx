import { createSignal, Show } from 'solid-js';
import { render } from 'solid-js/web';
import {
  HUD_PANEL_STYLE,
  HUD_LABEL_FONT,
  HUD_LABEL_SHADOW,
  HUD_SMALL_LABEL_FONT,
} from './hudStyle.js';

function HeroPromptView(props) {
  return (
    <Show when={props.visible()}>
      <div
        id="hero-prompt"
        style={{
          ...HUD_PANEL_STYLE,
          position: 'fixed',
          left: '50%',
          bottom: '20%',
          transform: 'translateX(-50%)',
          'z-index': '150',
          padding: '14px 22px',
          'text-align': 'center',
          'pointer-events': 'none',
          'min-width': '320px',
        }}
      >
        <div
          style={{
            font: HUD_LABEL_FONT,
            'letter-spacing': '0.04em',
            'text-shadow': HUD_LABEL_SHADOW,
            color: '#ffe08a',
          }}
        >
          You are the round leader
        </div>
        <div
          style={{
            'margin-top': '6px',
            font: HUD_SMALL_LABEL_FONT,
            'text-shadow': HUD_LABEL_SHADOW,
            color: '#fff',
          }}
        >
          Press H to respawn as The Brain
        </div>
      </div>
    </Show>
  );
}

export class HeroPrompt {
  constructor() {
    const [visible, setVisible] = createSignal(false);
    this._setVisible = setVisible;
    this._dispose = render(() => <HeroPromptView visible={visible} />, document.body);
  }

  setVisible(v) {
    this._setVisible(!!v);
  }

  dispose() {
    this._setVisible(false);
    this._dispose();
  }
}
