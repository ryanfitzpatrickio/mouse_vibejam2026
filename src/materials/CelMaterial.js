import * as THREE from 'three/webgpu';
import {
  Fn,
  cameraPosition,
  dot,
  float,
  max,
  normalize,
  normalWorld,
  positionWorld,
  pow,
  step,
  uniform,
  vec3,
  vec4,
} from 'three/tsl';

const DEFAULT_LIGHT_DIRECTION = new THREE.Vector3(1, 1, 1).normalize();

export function createThreeBandGradientTexture({
  dark = 0,
  mid = 100,
  light = 255,
} = {}) {
  const gradientTexture = new THREE.DataTexture(
    new Uint8Array([
      dark,
      dark,
      dark,
      255,
      mid,
      mid,
      mid,
      255,
      light,
      light,
      light,
      255,
    ]),
    3,
    1,
    THREE.RGBAFormat,
  );

  gradientTexture.needsUpdate = true;
  gradientTexture.magFilter = THREE.NearestFilter;
  gradientTexture.minFilter = THREE.NearestFilter;
  gradientTexture.generateMipmaps = false;

  return gradientTexture;
}

export function createToonFallbackMaterial({
  color = '#ffaa88',
  gradientTexture,
  flatShading = true,
} = {}) {
  const material = new THREE.MeshToonNodeMaterial({
    color: new THREE.Color(color),
    gradientMap: gradientTexture ?? createThreeBandGradientTexture(),
    shininess: 0,
    flatShading,
  });

  material.name = 'CelToonFallbackMaterial';
  return material;
}

export function createKeyCelMaterial({
  baseColor = '#ffaa88',
  toonBands = 3,
  rimPower = 3,
  rimStrength = 0.4,
  lightDirection = DEFAULT_LIGHT_DIRECTION,
} = {}) {
  const material = new THREE.MeshStandardNodeMaterial();
  material.lights = false;

  const baseColorUniform = uniform(new THREE.Color(baseColor));
  const lightDirectionUniform = uniform(lightDirection.clone().normalize());
  const toonBandsUniform = uniform(toonBands);
  const rimPowerUniform = uniform(rimPower);
  const rimStrengthUniform = uniform(rimStrength);

  material.colorNode = Fn(() => {
    const N = normalize(normalWorld);
    const V = normalize(cameraPosition.sub(positionWorld));
    const L = normalize(lightDirectionUniform);

    const NdotL = max(dot(N, L), float(0.0));
    const safeBands = max(toonBandsUniform, float(1.0));

    const toonDiffuse = step(float(0.2), NdotL)
      .mul(step(float(0.5), NdotL).add(float(1.0)).div(safeBands))
      .add(float(0.15));

    const rim = pow(float(1.0).sub(max(dot(N, V), float(0.0))), rimPowerUniform).mul(
      rimStrengthUniform,
    );

    return vec4(vec3(baseColorUniform).mul(toonDiffuse).add(vec3(rim)), float(1.0));
  })();

  material.name = 'KeyCelMaterial';
  material.userData.celUniforms = {
    baseColor: baseColorUniform,
    lightDirection: lightDirectionUniform,
    toonBands: toonBandsUniform,
    rimPower: rimPowerUniform,
    rimStrength: rimStrengthUniform,
  };

  material.userData.setBaseColor = (value) => {
    baseColorUniform.value.set(value);
  };

  material.userData.setLightDirection = (value) => {
    lightDirectionUniform.value.copy(value).normalize();
  };

  material.userData.setToonBands = (value) => {
    toonBandsUniform.value = value;
  };

  material.userData.setRimPower = (value) => {
    rimPowerUniform.value = value;
  };

  material.userData.setRimStrength = (value) => {
    rimStrengthUniform.value = value;
  };

  return material;
}

export function createCelMaterial(options = {}) {
  if (options.useToonFallback) {
    return createToonFallbackMaterial(options);
  }

  return createKeyCelMaterial(options);
}
