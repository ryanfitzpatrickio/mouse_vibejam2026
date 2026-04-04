import fs from 'node:fs/promises';
import path from 'node:path';
import { defineConfig } from 'vite';

function devLevelSavePlugin() {
  const layoutPath = path.resolve(process.cwd(), 'public/levels/kitchen-layout.json');
  const prefabPath = path.resolve(process.cwd(), 'public/levels/prefabs.json');

  return {
    name: 'dev-level-save',
    configureServer(server) {
      const handleJsonSave = (targetPath, publicPath) => async (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ ok: false, error: 'Method not allowed' }));
          return;
        }

        let body = '';
        req.on('data', (chunk) => {
          body += chunk;
        });

        req.on('end', async () => {
          try {
            const payload = JSON.parse(body || '{}');
            await fs.mkdir(path.dirname(targetPath), { recursive: true });
            await fs.writeFile(targetPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');

            res.statusCode = 200;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({
              ok: true,
              path: publicPath,
            }));
          } catch (error) {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({
              ok: false,
              error: error instanceof Error ? error.message : String(error),
            }));
          }
        });
      };

      server.middlewares.use(
        '/__dev/save-level',
        handleJsonSave(layoutPath, '/levels/kitchen-layout.json'),
      );
      server.middlewares.use(
        '/__dev/save-prefabs',
        handleJsonSave(prefabPath, '/levels/prefabs.json'),
      );
    },
  };
}

export default defineConfig({
  plugins: [devLevelSavePlugin()],
  base: './',
  root: '.',
  publicDir: 'public',
  build: {
    target: 'esnext',
    modulePreload: { polyfill: false },
    rollupOptions: {
      output: {
        manualChunks: undefined,
      },
    },
  },
  server: {
    open: true,
  },
});
