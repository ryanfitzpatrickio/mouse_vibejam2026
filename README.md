# vibejam2026
![Mouse preview](./mouse.gif)

Mouse Trouble is a multiplayer kitchen-stealth game built with Vite and Three.js. You play a mouse in a stylized kitchen, move through the room with server-authoritative networking, and interact with a level that can be edited locally in build mode.

The project includes:
- A rigged mouse character with baked animation clips and an animated eye atlas.
- A kitchen level built from editable JSON primitives, prefabs, and texture-atlas surfaces.
- Client prediction, server reconciliation, and remote player interpolation.
- A dev-only build mode for grid-snapped level editing and prefab authoring.
- WebGL and WebGPU renderer paths, with production defaulting to WebGL.

## Development

```bash
npm install
npm run dev
```

For local multiplayer, the PartyKit server is in `party/server.js` and the client connects through `VITE_PARTYKIT_HOST`.

## Build

```bash
npm run build
```

The build pipeline also generates optimized runtime assets:
- `assets/source/mouse-skinned.glb` is combined from the rigged mouse and skin source.
- `public/mouse-skinned.optimized.glb` is compressed for production.
- `public/textures.optimized.webp` and `public/eyeset1.optimized.webp` are generated from the source atlases.

## Deploy

This is a static Vite app. Cloudflare Pages is the simplest deployment target:

- Build command: `npm run build`
- Build output directory: `dist`

Wrangler is also configured for Workers static assets:

```bash
npm install
npx wrangler login
npm run deploy:cf
```

The Wrangler config lives in [wrangler.jsonc](/Users/personal/source/vibejam2026/wrangler.jsonc) and serves the built `dist` directory with SPA fallback.

## Environment

```bash
VITE_PARTYKIT_HOST=mouse-trouble.username.partykit.dev
```
