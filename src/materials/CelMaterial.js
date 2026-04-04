import * as THREE from 'three';

const DEFAULT_LIGHT_DIRECTION = new THREE.Vector3(1, 1, 1).normalize();

export function createThreeBandGradientTexture({
  dark = 0,
  mid = 100,
  light = 255,
} = {}) {
  const gradientTexture = new THREE.DataTexture(
    new Uint8Array([
      dark,
      mid,
      light,
    ]),
    3,
    1,
    THREE.RedFormat,
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
  const material = new THREE.MeshToonMaterial({
    color: new THREE.Color(color),
    gradientMap: gradientTexture ?? createThreeBandGradientTexture(),
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
  const material = new THREE.MeshToonMaterial({
    color: new THREE.Color(baseColor),
    gradientMap: createThreeBandGradientTexture(),
    flatShading: true,
  });

  material.name = 'KeyCelMaterial';
  material.userData.celUniforms = {
    baseColor: new THREE.Color(baseColor),
    lightDirection: lightDirection.clone().normalize(),
    toonBands,
    rimPower,
    rimStrength,
  };

  return material;
}

export function createCelMaterial(options = {}) {
  if (options.useToonFallback) {
    return createToonFallbackMaterial(options);
  }

  return createKeyCelMaterial(options);
}
