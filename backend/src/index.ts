import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { serve } from '@hono/node-server';
import { createApp } from './app.js';
import { openStore } from './store.js';

const port = Number(process.env.PORT ?? 3921);
const host = process.env.HOST ?? '0.0.0.0';

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error(`Invalid PORT: ${process.env.PORT}`);
}

function findUp(start: string, relative: string): string | null {
  let dir = start;
  for (let i = 0; i < 8; i += 1) {
    const candidate = join(dir, relative);
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
  return null;
}

const here = dirname(fileURLToPath(import.meta.url));
const htmlPath = findUp(process.cwd(), 'example/index.html') ?? findUp(here, 'example/index.html');
const sdkPath = findUp(process.cwd(), 'app/dist/waypost.js') ?? findUp(here, 'app/dist/waypost.js');

if (!htmlPath) console.warn('[waypost] example/index.html not found; GET / will 404');
if (!sdkPath) console.warn('[waypost] app/dist/waypost.js not found. Build the SDK with npm run build -w waypost-analytics');

const store = openStore();
const app = createApp(store, {
  ingestToken: process.env.INGEST_TOKEN?.trim() || undefined,
  assets: {
    html: () => (htmlPath && existsSync(htmlPath) ? readFileSync(htmlPath, 'utf8') : null),
    sdk: () => (sdkPath && existsSync(sdkPath) ? readFileSync(sdkPath, 'utf8') : null),
  },
});

const server = serve({ fetch: app.fetch, port, hostname: host });
const shownHost = host === '0.0.0.0' || host === '::' ? '127.0.0.1' : host;
console.log(`Waypost collector listening on http://${shownHost}:${port}`);
console.log(`Example page: http://${shownHost}:${port}/`);
console.log(`Database: ${process.env.DATABASE_PATH?.trim() || 'data/waypost.sqlite'}`);

function shutdown() {
  server.close();
  store.close();
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
