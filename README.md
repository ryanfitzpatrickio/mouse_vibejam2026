# vibejam2026

## Deploy

This is a static Vite app. Deploy it to Cloudflare Pages with:

- Build command: `npm run build`
- Build output directory: `dist`

No Worker is required for the current app. Cloudflare's newer recommendation for brand-new projects is Workers Static Assets, but for this repo Pages is the simpler fit because there is no API layer or server-side rendering.

If you later add runtime logic, move to Pages Functions or Workers Static Assets. For now, the static site is enough.

If you want to use Wrangler instead, the repo is already configured for Workers static assets:

- Install: `npm install`
- Log in: `npx wrangler login`
- Deploy: `npm run deploy:cf`

The Wrangler config lives in [wrangler.jsonc](/Users/personal/source/vibejam2026/wrangler.jsonc) and serves the built `dist` directory with SPA fallback.
