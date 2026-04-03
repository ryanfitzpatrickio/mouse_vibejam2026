import { createAudioScene } from './demo/audioScene.js';

const canvas = document.getElementById('canvas');

const demo = await createAudioScene({ canvas });

demo.resize(window.innerWidth, window.innerHeight, window.devicePixelRatio);

function animate(timeMs) {
  demo.render(timeMs);
}

demo.renderer.setAnimationLoop(animate);

window.addEventListener('resize', () => {
  demo.resize(window.innerWidth, window.innerHeight, window.devicePixelRatio);
});
