import { afterEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { createSqliteStore } from '../src/sqlite-store.js';
import type { AnalyticsStore } from '../src/types.js';

const VISITOR_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const VISITOR_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const SESSION = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

function event(overrides: Record<string, unknown> = {}) {
  return {
    type: 'pageview',
    name: 'pageview',
    visitorId: VISITOR_A,
    sessionId: SESSION,
    timestamp: Date.now(),
    url: 'https://shop.example/',
    path: '/',
    referrer: '',
    title: 'Início',
    screenWidth: 1280,
    screenHeight: 800,
    language: 'pt-BR',
    utm: {},
    ...overrides,
  };
}

function setup(options?: { token?: string; assets?: boolean }) {
  const store = createSqliteStore(':memory:');
  const app = createApp(store, {
    ingestToken: options?.token,
    assets: options?.assets
      ? { html: () => '<!doctype html><title>demo</title>', sdk: () => 'window.waypost = {};' }
      : undefined,
  });
  return { store, app };
}

async function collect(app: ReturnType<typeof createApp>, body: unknown, headers?: Record<string, string>) {
  return app.request('/collect', {
    method: 'POST',
    headers: { 'content-type': 'text/plain;charset=UTF-8', origin: 'https://shop.example', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

describe('collect', () => {
  const closers: AnalyticsStore[] = [];
  afterEach(() => {
    for (const store of closers.splice(0)) store.close();
  });

  it('stores a batch and answers 204 with CORS headers', async () => {
    const { app, store } = setup();
    closers.push(store);
    const response = await collect(app, { siteId: 'demo', events: [event()] });
    expect(response.status).toBe(204);
    expect(response.headers.get('access-control-allow-origin')).toBe('*');
    const stats = await app.request('/stats/pages?siteId=demo');
    const body = (await stats.json()) as { pages: Array<{ path: string; pageviews: number }> };
    expect(body.pages).toEqual([{ path: '/', pageviews: 1, visitors: 1 }]);
  });

  it('rejects invalid json, huge bodies, bad payloads, and the wrong method', async () => {
    const { app, store } = setup();
    closers.push(store);
    expect((await collect(app, '{')).status).toBe(400);
    expect((await collect(app, { siteId: 'demo', events: [] })).status).toBe(400);
    expect((await collect(app, { siteId: 'demo', events: [event({ type: 'nope' })] })).status).toBe(400);
    expect((await collect(app, 'x'.repeat(70_000))).status).toBe(413);
    expect((await collect(app, { siteId: 'demo', events: [event()] }, { 'content-length': '999999' })).status).toBe(413);
    expect((await app.request('/collect')).status).toBe(405);
    expect((await app.request('/missing')).status).toBe(404);
  });

  it('requires the ingest token only when one is configured', async () => {
    const { app, store } = setup({ token: 'secret' });
    closers.push(store);
    expect((await collect(app, { siteId: 'demo', events: [event()] })).status).toBe(401);
    expect((await collect(app, { siteId: 'demo', token: 'nope', events: [event()] })).status).toBe(401);
    expect((await collect(app, { siteId: 'demo', token: 'secret', events: [event()] })).status).toBe(204);
  });

  it('answers preflight requests', async () => {
    const { app, store } = setup();
    closers.push(store);
    const response = await app.request('/collect', {
      method: 'OPTIONS',
      headers: {
        origin: 'https://shop.example',
        'access-control-request-method': 'POST',
        'access-control-request-headers': 'content-type',
      },
    });
    expect(response.status).toBe(204);
    expect(response.headers.get('access-control-allow-origin')).toBe('*');
  });

  it('returns 500 when the store throws and does not leak the error', async () => {
    const broken: AnalyticsStore = {
      insertEvents: () => {
        throw new Error('disk full at /secret/path');
      },
      timeseries: () => ({ points: [], totals: { pageviews: 0, visitors: 0 } }),
      topPages: () => [],
      topReferrers: () => [],
      topEvents: () => [],
      close: () => {},
    };
    const app = createApp(broken);
    const response = await collect(app, { siteId: 'demo', events: [event()] });
    expect(response.status).toBe(500);
    const body = (await response.json()) as { error: string; message: string };
    expect(body.error).toBe('store_failed');
    expect(body.message).not.toContain('secret');
  });
});

describe('stats', () => {
  const closers: AnalyticsStore[] = [];
  afterEach(() => {
    for (const store of closers.splice(0)) store.close();
  });

  it('aggregates pageviews, unique visitors, pages, referrers, and events', async () => {
    const { app, store } = setup();
    closers.push(store);
    const hour = 60 * 60 * 1000;
    const t1 = Date.now() - 3 * hour;
    const t2 = Date.now() - hour;
    const day = new Date(t1).toISOString().slice(0, 10);

    const response = await collect(app, {
      siteId: 'demo',
      events: [
        event({ timestamp: t1, path: '/', url: 'https://shop.example/', referrer: 'https://news.example/a' }),
        event({ timestamp: t1, path: '/cadernos', url: 'https://shop.example/cadernos', visitorId: VISITOR_B }),
        event({
          timestamp: t2,
          path: '/',
          url: 'https://shop.example/',
          referrer: 'https://news.example/b',
        }),
        event({
          timestamp: t1,
          path: '/interno',
          url: 'https://shop.example/interno',
          referrer: 'https://shop.example/old',
        }),
        event({ timestamp: t1, type: 'event', name: 'newsletter', props: { origem: 'exemplo' } }),
        event({ timestamp: t2, type: 'click', name: 'inscrever', props: { tag: 'button' } }),
        event({ timestamp: t2, type: 'click', name: 'inscrever', visitorId: VISITOR_B, extra: true }),
      ],
    });
    expect(response.status).toBe(204);

    await collect(app, {
      siteId: 'other',
      events: [event({ timestamp: t1, path: '/secret' })],
    });

    const from = new Date(Date.now() - 2 * 24 * hour).toISOString().slice(0, 10);
    const to = new Date(Date.now() + 24 * hour).toISOString().slice(0, 10);
    const query = `siteId=demo&from=${from}&to=${to}`;

    const seriesResponse = await app.request(`/stats/timeseries?${query}&interval=hour`);
    const series = (await seriesResponse.json()) as {
      points: Array<{ bucket: string; pageviews: number; visitors: number }>;
      totals: { pageviews: number; visitors: number };
    };
    expect(series.totals).toEqual({ pageviews: 4, visitors: 2 });
    const bucketVisitors = series.points.reduce((sum, point) => sum + point.visitors, 0);
    expect(bucketVisitors).toBeGreaterThan(series.totals.visitors);
    expect(series.points.reduce((sum, point) => sum + point.pageviews, 0)).toBe(4);

    const daySeries = (await (await app.request(`/stats/timeseries?${query}&interval=day`)).json()) as {
      points: Array<{ bucket: string; pageviews: number }>;
    };
    expect(daySeries.points.some((point) => point.bucket === day)).toBe(true);

    const pages = (await (await app.request(`/stats/pages?${query}&limit=2`)).json()) as {
      pages: Array<{ path: string; pageviews: number; visitors: number }>;
    };
    expect(pages.pages).toEqual([
      { path: '/', pageviews: 2, visitors: 1 },
      { path: '/cadernos', pageviews: 1, visitors: 1 },
    ]);

    const referrers = (await (await app.request(`/stats/referrers?${query}`)).json()) as {
      referrers: Array<{ host: string; visits: number; visitors: number }>;
    };
    expect(referrers.referrers).toEqual([{ host: 'news.example', visits: 2, visitors: 1 }]);

    const events = (await (await app.request(`/stats/events?${query}`)).json()) as {
      events: Array<{ name: string; type: string; count: number; visitors: number }>;
    };
    expect(events.events).toEqual([
      { name: 'inscrever', type: 'click', count: 2, visitors: 2 },
      { name: 'newsletter', type: 'event', count: 1, visitors: 1 },
    ]);

    const other = (await (await app.request(`/stats/pages?siteId=other&from=${from}&to=${to}`)).json()) as {
      pages: Array<{ path: string }>;
    };
    expect(other.pages).toEqual([{ path: '/secret', pageviews: 1, visitors: 1 }]);
  });

  it('rejects a missing site id and serves health plus the example assets', async () => {
    const { app, store } = setup({ assets: true });
    closers.push(store);
    expect((await app.request('/stats/events')).status).toBe(400);
    expect(await (await app.request('/health')).json()).toEqual({ ok: true });
    expect(await (await app.request('/')).text()).toContain('demo');
    expect((await app.request('/waypost.js')).headers.get('content-type')).toContain('javascript');
    expect((await app.request('/favicon.ico')).status).toBe(204);
  });

  it('serves a stub when the example SDK file is missing', async () => {
    const store = createSqliteStore(':memory:');
    closers.push(store);
    const app = createApp(store, { assets: { html: () => null, sdk: () => null } });
    expect((await app.request('/')).status).toBe(404);
    expect((await app.request('/waypost.js')).status).toBe(503);
  });
});
