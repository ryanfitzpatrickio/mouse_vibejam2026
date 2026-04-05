import { assetUrl } from '../utils/assetUrl.js';
import { GENERATED_TEXTURE_ATLASES } from './textureAtlasRegistry.generated.js';

export const DEFAULT_TEXTURE_ATLAS = 'textures';

export const TEXTURE_ATLASES = Object.freeze(
  GENERATED_TEXTURE_ATLASES?.length ? GENERATED_TEXTURE_ATLASES : [
    Object.freeze({
      id: 'textures',
      label: 'textures.webp',
      imageUrl: assetUrl('textures.optimized.webp'),
      manifestUrl: assetUrl('textures.manifest.json'),
    }),
  ],
);

export function getTextureAtlasById(id) {
  return TEXTURE_ATLASES.find((atlas) => atlas.id === id) ?? TEXTURE_ATLASES[0];
}

async function loadManifest(manifestUrl) {
  try {
    const response = await fetch(manifestUrl, { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } catch {
    return {
      grid: { columns: 10, rows: 10 },
      cells: Array.from({ length: 100 }, (_, index) => ({
        index,
        description: `Cell ${index}`,
      })),
    };
  }
}

export async function loadTextureAtlases() {
  return Promise.all(TEXTURE_ATLASES.map(async (atlas) => ({
    ...atlas,
    manifest: await loadManifest(atlas.manifestUrl),
  })));
}
