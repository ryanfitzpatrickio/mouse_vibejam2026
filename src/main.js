import { createMouseAnimationScene } from './demo/mouseAnimationScene.js';

const canvas = document.getElementById('canvas');

const demo = await createMouseAnimationScene({ canvas });

demo.resize(window.innerWidth, window.innerHeight, window.devicePixelRatio);

function animate(timeMs) {
  demo.render(timeMs);
}

demo.renderer.setAnimationLoop(animate);

window.addEventListener('resize', () => {
  demo.resize(window.innerWidth, window.innerHeight, window.devicePixelRatio);
});
