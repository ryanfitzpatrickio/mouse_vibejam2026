This will give your mice, furniture, and the whole house that perfect *Untitled Goose Game* + cartoon Fortnite vibe: flat colors, crisp shadow bands, bold rim highlights, and optional black outlines. It fits the chaotic-cute tone perfectly and runs great on WebGPU (with WebGL2 fallback via TSL).

### 1. Quick Win: Use the Built-in `MeshToonNodeMaterial`
Three.js already ships **MeshToonNodeMaterial** — the official TSL/WebGPU version of the classic toon shader. It’s exactly what you want for “key cel shading” (hard key lighting + quantized toon bands).

```js
// At the top of your main file
import * as THREE from 'three/webgpu';
import { 
  MeshToonNodeMaterial, 
  uniform, vec3, float 
} from 'three/tsl';

// Create renderer (replace your current one)
const renderer = new THREE.WebGPURenderer({ 
  antialias: true, 
  forceWebGL: false // false = prefer WebGPU 
});
renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping; // looks great with cel

// Example mouse material (apply to your mouse GLTF or procedural mesh)
const mouseMaterial = new MeshToonNodeMaterial({
  color: new THREE.Color('#ffaa88'),     // base mouse color
  gradientMap: null,                     // we'll set a custom one below
  shininess: 0,                          // toon usually has no specular
  flatShading: true                      // optional — very cel-like
});

// Custom 3-band gradient (the "key cel" look)
const gradientTexture = new THREE.DataTexture(
  new Uint8Array([0, 0, 0, 255, 100, 100, 100, 255, 255, 255, 255, 255]), 
  3, 1, THREE.RGBAFormat
);
gradientTexture.needsUpdate = true;
mouseMaterial.gradientMap = gradientTexture;

// Apply to your mouse mesh(es)
mouseMesh.material = mouseMaterial;
```

**Result:** Instant hard-edged cel shading with 3 clear lighting bands (dark → mid → highlight). Super cheap, fully TSL-native, works on WebGPU and WebGL2.

### 2. Custom "Key Cel" TSL Shader (for more control)
If you want to go deeper (extra rim light, dynamic bands, emissive mischief glow, etc.), here’s a clean custom TSL version you can drop in. It’s only ~60 lines and fully editable.

```js
import * as THREE from 'three/webgpu';
import { 
  Fn, uniform, vec3, vec4, float, 
  normalWorld, positionWorld, cameraPosition,
  dot, normalize, max, step, mix, pow 
} from 'three/tsl';

const createKeyCelMaterial = (baseColor = '#ffaa88') => {
  const material = new THREE.MeshStandardNodeMaterial(); // or MeshBasicNodeMaterial for unlit look

  const lightDir = uniform(new THREE.Vector3(1, 1, 1).normalize()); // main "key" light direction
  const toonBands = uniform(3.0);          // number of cel bands (2–5 looks great)
  const rimPower = uniform(3.0);           // rim light sharpness
  const rimStrength = uniform(0.4);

  material.colorNode = Fn(() => {
    const N = normalize(normalWorld);
    const V = normalize(cameraPosition.sub(positionWorld));
    const L = lightDir;

    const NdotL = max(dot(N, L), 0.0);
    // Toon diffuse (the key cel magic)
    const toonDiffuse = step(0.2, NdotL)
      .mul(step(0.5, NdotL).add(1.0).div(toonBands))
      .add(0.15); // minimum ambient

    // Rim light (classic cartoon highlight)
    const rim = pow(1.0 - max(dot(N, V), 0.0), rimPower).mul(rimStrength);

    // Final color
    return vec4(
      vec3(baseColor).mul(toonDiffuse).add(rim),
      1.0
    );
  })();

  return material;
};

// Usage
const mouseMaterial = createKeyCelMaterial('#ffddaa');
mouseMesh.material = mouseMaterial;
```

**Why this is better than raw GLSL:**
- Fully node-based → easy to animate (e.g. `time` for pulsing mischief glow)
- Works on WebGPU *and* WebGL2 automatically
- Super easy to expose uniforms for runtime tweaking (color, bands, rim, etc.)

### 3. Adding Black Outlines (the full cartoon look)
Cel shading looks 10× better with outlines. Two easy options:

**Option A (Fastest — Post-process)**  
Use Three.js WebGPU post-processing + a simple edge detection pass (there are official TSL examples).

**Option B (Classic & cheap — Inverted hull)**  
Render the mesh twice:
1. Normal cel material
2. Slightly larger mesh with backface culling + black material

```js
const outlineMaterial = new THREE.MeshBasicNodeMaterial({
  color: new THREE.Color('#000000'),
  side: THREE.BackSide
});
const outlineMesh = mouseMesh.clone();
outlineMesh.material = outlineMaterial;
outlineMesh.scale.setScalar(1.05); // thickness
scene.add(outlineMesh);
```

You can parent the outline to the mouse and update in the same loop.

### 4. Integration Tips for Mouse Trouble
- **Apply to everything**: Mice, furniture, loot items, even the cat (make the cat extra toony!).
- **Performance**: TSL materials are extremely lightweight. Keep your bundle under 100 KB easily.
- **Lighting**: Use a single strong directional “key” light + soft ambient. Avoid too many lights — cel hates complexity.
- **Mischief VFX**: When a mouse knocks something over, temporarily boost `rimStrength` or add a quick emissive flash using TSL’s `time` node.
- **Mobile**: WebGPU works great on modern phones. Test with `forceWebGL: true` fallback.

### Next Steps
1. Switch your renderer to `WebGPURenderer` (do it in Phase 1 of the GDD).
2. Drop the `MeshToonNodeMaterial` version first — you’ll have a playable cel-shaded prototype in <30 minutes.
3. Then swap to the custom TSL version above if you want more “key” control.

This shader is going to make Mouse Trouble look *adorably dangerous*. 🐭✨