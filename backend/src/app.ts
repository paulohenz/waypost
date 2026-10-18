import { timingSafeEqual } from 'node:crypto';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { parseRange, type RangeQuery } from './range.js';
import type { AnalyticsStore } from './types.js';
import { validateCollect } from './validate.js';

const DEFAULT_MAX_BODY = 64 * 1024;

export type AppAssets = {
  html: () => string | null;
  sdk: () => string | null;
};

export type CreateAppOptions = {
  now?: () => number;
  /** When set, `POST /collect` requires the same `token` inside the JSON body. */
  ingestToken?: string;
  maxBodyBytes?: number;
  assets?: AppAssets;
};

function tokensMatch(expected: string, provided: string): boolean {
  const left = Buffer.from(expected);
  const right = Buffer.from(provided);
  if (left.length !== right.length) {
    timingSafeEqual(left, left);
    return false;
  }
  return timingSafeEqual(left, right);
}

function queryOf(search: (name: string) => string | undefined): RangeQuery {
  return {
    siteId: search('siteId'),
    from: search('from'),
    to: search('to'),
    interval: search('interval'),
    limit: search('limit'),
  };
}

export function createApp(store: AnalyticsStore, options: CreateAppOptions = {}) {
  const now = options.now ?? Date.now;
  const maxBodyBytes = options.maxBodyBytes ?? DEFAULT_MAX_BODY;
  const app = new Hono();

  app.use(
    '*',
    cors({
      origin: '*',
      allowMethods: ['GET', 'POST', 'OPTIONS'],
      allowHeaders: ['Content-Type'],
      maxAge: 86_400,
    }),
  );

  app.get('/health', (c) => c.json({ ok: true }));
  app.get('/favicon.ico', (c) => c.body(null, 204));

  app.get('/collect', (c) => c.json({ error: 'method_not_allowed', message: 'Use POST /collect.' }, 405));

  app.post('/collect', async (c) => {
    const declared = Number(c.req.header('content-length') ?? 0);
    if (Number.isFinite(declared) && declared > maxBodyBytes) {
      return c.json({ error: 'payload_too_large', message: 'Request body is too large.' }, 413);
    }
    const text = await c.req.text();
    if (text.length > maxBodyBytes) {
      return c.json({ error: 'payload_too_large', message: 'Request body is too large.' }, 413);
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(text) as unknown;
    } catch {
      return c.json({ error: 'invalid_json', message: 'Body must be JSON.' }, 400);
    }
    if (options.ingestToken) {
      const token =
        parsed && typeof parsed === 'object' && 'token' in parsed && typeof parsed.token === 'string'
          ? parsed.token
          : '';
      if (!token || !tokensMatch(options.ingestToken, token)) {
        return c.json({ error: 'unauthorized', message: 'Invalid ingest token.' }, 401);
      }
    }
    const result = validateCollect(parsed, now());
    if (!result.ok) return c.json({ error: result.error, message: result.message }, 400);
    try {
      store.insertEvents(result.siteId, result.events);
    } catch (error) {
      console.error('[waypost] failed to store events', error);
      return c.json({ error: 'store_failed', message: 'Could not store events.' }, 500);
    }
    return c.body(null, 204);
  });

  app.get('/stats/timeseries', (c) => {
    const parsed = parseRange(queryOf((name) => c.req.query(name)), now());
    if (!parsed.ok) return c.json({ error: parsed.error, message: parsed.message }, 400);
    const series = store.timeseries(parsed.range);
    return c.json({
      siteId: parsed.range.siteId,
      interval: parsed.range.interval,
      from: parsed.range.from,
      to: parsed.range.to,
      ...series,
    });
  });

  app.get('/stats/pages', (c) => {
    const parsed = parseRange(queryOf((name) => c.req.query(name)), now());
    if (!parsed.ok) return c.json({ error: parsed.error, message: parsed.message }, 400);
    return c.json({ siteId: parsed.range.siteId, pages: store.topPages(parsed.range) });
  });

  app.get('/stats/referrers', (c) => {
    const parsed = parseRange(queryOf((name) => c.req.query(name)), now());
    if (!parsed.ok) return c.json({ error: parsed.error, message: parsed.message }, 400);
    return c.json({ siteId: parsed.range.siteId, referrers: store.topReferrers(parsed.range) });
  });

  app.get('/stats/events', (c) => {
    const parsed = parseRange(queryOf((name) => c.req.query(name)), now());
    if (!parsed.ok) return c.json({ error: parsed.error, message: parsed.message }, 400);
    return c.json({ siteId: parsed.range.siteId, events: store.topEvents(parsed.range) });
  });

  if (options.assets) {
    const assets = options.assets;
    app.get('/', (c) => {
      const html = assets.html();
      if (html == null) return c.json({ error: 'not_found', message: 'Example page is not available.' }, 404);
      return c.html(html, 200, { 'Cache-Control': 'no-cache' });
    });
    app.get('/waypost.js', (c) => {
      const sdk = assets.sdk();
      if (sdk == null) {
        return c.text('console.error("[waypost] SDK build not found. Run npm run build -w waypost-analytics");', 503, {
          'Content-Type': 'text/javascript; charset=utf-8',
          'Cache-Control': 'no-cache',
        });
      }
      return c.text(sdk, 200, {
        'Content-Type': 'text/javascript; charset=utf-8',
        'Cache-Control': 'no-cache',
      });
    });
  }

  app.notFound((c) => c.json({ error: 'not_found', message: 'Not found.' }, 404));

  app.onError((error, c) => {
    console.error('[waypost] request failed', error);
    return c.json({ error: 'internal_error', message: 'Something went wrong.' }, 500);
  });

  return app;
}
