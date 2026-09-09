import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { createApp } from './app.js';

const PORT = Number(process.env.PORT ?? 3001);
const app = createApp();

// Single-port demo: serve the production frontend build when present,
// so `npm run build && npm run serve` delivers API + UI together.
// In dev (`npm run server` + `npm run dev`) Vite proxies /api instead.
const rootDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const distDir = path.join(rootDir, 'dist');
if (existsSync(path.join(distDir, 'index.html'))) {
  app.use(express.static(distDir));
  app.use((req, res, next) => {
    if (req.path.startsWith('/api')) {
      next();
      return;
    }
    res.sendFile(path.join(distDir, 'index.html'));
  });
}

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`[orca] API listening on http://localhost:${PORT} (POST /api/chat)`);
});
