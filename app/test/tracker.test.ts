import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flush, init, shutdown, track } from '../src/index';
import { STORAGE_KEYS } from '../src/storage';

type Payload = {
  siteId: string;
  token?: string;
  events: Array<{
    type: string;
    name: string;
    visitorId: string;
    sessionId: string;
    path: string;
    url: string;
    referrer: string;
    title: string;
    language: string;
    screenWidth: number;
    screenHeight: number;
    utm: Record<string, string>;
    props?: Record<string, unknown>;
  }>;
};

const beacon = vi.fn((_url: string, _data?: BodyInit | null) => true);

beforeEach(() => {
  shutdown();
  localStorage.clear();
  sessionStorage.clear();
  document.title = '';
  document.body.innerHTML = '';
  beacon.mockClear();
  navigator.sendBeacon = beacon;
  window.history.replaceState({}, '', '/');
});

afterEach(() => {
  shutdown();
  vi.useRealTimers();
  localStorage.clear();
  sessionStorage.clear();
});

async function sent(): Promise<Payload[]> {
  const payloads: Payload[] = [];
  for (const call of beacon.mock.calls) {
    const body = call[1];
    const text = body instanceof Blob ? await body.text() : String(body ?? '');
    payloads.push(JSON.parse(text) as Payload);
  }
  return payloads;
}

async function events() {
  const payloads = await sent();
  return payloads.flatMap((payload) => payload.events);
}

describe('init and track', () => {
  it('requires endpoint and a safe site id', () => {
    expect(() => init({ endpoint: '  ', siteId: 'demo' })).toThrow(/endpoint/);
    expect(() => init({ endpoint: '/collect', siteId: 'has space' })).toThrow(/siteId/);
  });

  it('records a pageview with browser context and does not set a cookie', async () => {
    document.title = 'Início';
    Object.defineProperty(document, 'referrer', { configurable: true, value: 'https://news.example/story' });
    document.cookie = 'unrelated=1';
    const before = document.cookie;
    const result = init({ endpoint: '/collect', siteId: 'demo', flushInterval: 60_000 });
    expect(result.enabled).toBe(true);
    flush();
    const [event] = await events();
    expect(event).toMatchObject({
      type: 'pageview',
      name: 'pageview',
      path: '/',
      title: 'Início',
      referrer: 'https://news.example/story',
    });
    expect(event?.visitorId).toMatch(/^[0-9a-f-]{36}$/);
    expect(event?.sessionId).toMatch(/^[0-9a-f-]{36}$/);
    expect(typeof event?.screenWidth).toBe('number');
    expect(typeof event?.language).toBe('string');
    expect(localStorage.getItem(STORAGE_KEYS.visitor)).toBe(event?.visitorId);
    expect(document.cookie).toBe(before);
    const payloads = await sent();
    expect(payloads[0]?.siteId).toBe('demo');
    expect(beacon.mock.calls[0]?.[0]).toBe('/collect');
  });

  it('tracks custom events, clips the name, and sanitizes props', async () => {
    init({ endpoint: '/collect', siteId: 'demo', autoPageviews: false, flushInterval: 60_000 });
    track('  signup  ', { plan: 'campo', seats: 2, bad: { nested: true } as unknown as string });
    track('   ');
    track('n'.repeat(200));
    flush();
    const list = await events();
    expect(list.map((event) => event.name)).toEqual(['signup', 'n'.repeat(120)]);
    expect(list[0]?.props).toEqual({ plan: 'campo', seats: 2 });
    expect(list[0]?.type).toBe('event');
  });

  it('holds events queued before init', async () => {
    track('early', { plan: 'campo' });
    init({ endpoint: '/collect', siteId: 'demo', autoPageviews: false, flushInterval: 60_000, token: 'secret' });
    flush();
    const payloads = await sent();
    expect(payloads[0]?.token).toBe('secret');
    expect(payloads[0]?.events[0]).toMatchObject({ name: 'early', props: { plan: 'campo' } });
  });

  it('flushes on the interval, at batch size, and on pagehide', async () => {
    vi.useFakeTimers();
    init({ endpoint: '/collect', siteId: 'demo', autoPageviews: false, batchSize: 10, flushInterval: 5_000 });
    track('later');
    vi.advanceTimersByTime(5_000);
    expect((await events()).map((event) => event.name)).toEqual(['later']);

    beacon.mockClear();
    init({ endpoint: '/collect', siteId: 'demo', autoPageviews: false, batchSize: 2, flushInterval: 60_000 });
    track('a');
    track('b');
    expect(beacon).toHaveBeenCalledTimes(1);

    beacon.mockClear();
    track('c');
    window.dispatchEvent(new Event('pagehide'));
    expect((await events()).map((event) => event.name)).toEqual(['c']);
  });

  it('follows pushState, replaceState, popstate, and hash changes', async () => {
    init({ endpoint: '/collect', siteId: 'demo', flushInterval: 60_000 });
    flush();
    beacon.mockClear();

    document.title = 'Cadernos';
    window.history.pushState({}, '', '/cadernos');
    window.history.replaceState({}, '', '/cadernos?tab=linho');
    flush();
    let list = await events();
    expect(list.map((event) => event.path)).toEqual(['/cadernos', '/cadernos']);

    beacon.mockClear();
    // Browsers emit hashchange when location.hash is set. happy-dom updates
    // the URL but does not emit the event, so the test dispatches it.
    window.location.hash = '#notas';
    window.dispatchEvent(new Event('hashchange'));
    flush();
    list = await events();
    expect(list.some((event) => event.path === '/cadernos#notas')).toBe(true);

    beacon.mockClear();
    await new Promise((resolve) => setTimeout(resolve, 60));
    window.dispatchEvent(new PopStateEvent('popstate'));
    flush();
    list = await events();
    expect(list.some((event) => event.type === 'pageview' && event.path.includes('/cadernos'))).toBe(true);
  });

  it('does not double-count one navigation or a second init', async () => {
    init({ endpoint: '/collect', siteId: 'demo', flushInterval: 60_000 });
    init({ endpoint: '/collect', siteId: 'demo', flushInterval: 60_000 });
    flush();
    beacon.mockClear();
    window.history.pushState({}, '', '/uma-vez');
    flush();
    const list = await events();
    expect(list.filter((event) => event.path === '/uma-vez')).toHaveLength(1);
  });

  it('keeps the visitor id and the first-touch UTM for the session', async () => {
    window.history.replaceState({}, '', '/?utm_source=news&utm_medium=email&utm_campaign=spring&gclid=abc');
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-18T12:00:00Z'));
    init({
      endpoint: '/collect',
      siteId: 'demo',
      flushInterval: 60_000,
      sessionTimeout: 1_000,
    });
    flush();
    window.history.pushState({}, '', '/precos?utm_source=other');
    flush();
    const list = await events();
    expect(list[0]?.utm).toEqual({ source: 'news', medium: 'email', campaign: 'spring' });
    expect(list[1]?.utm).toEqual(list[0]?.utm);
    expect(list[1]?.url).toContain('/precos');
    expect(list[0]?.visitorId).toBe(list[1]?.visitorId);
    expect(list[0]?.sessionId).toBe(list[1]?.sessionId);

    beacon.mockClear();
    vi.setSystemTime(new Date('2026-10-18T12:00:02Z'));
    window.history.pushState({}, '', '/depois');
    flush();
    const [next] = await events();
    expect(next?.visitorId).toBe(list[0]?.visitorId);
    expect(next?.sessionId).not.toBe(list[0]?.sessionId);
    expect(next?.utm).toEqual({});
  });

  it('captures named clicks and links only when asked', async () => {
    document.body.innerHTML = `
      <a id="in" href="/cadernos">Cadernos</a>
      <a id="out" href="https://example.com/pricing">Externo</a>
      <button id="cta" data-track="inscrever"><span>Criar conta</span></button>
      <button id="plain">Ignorar</button>
    `;
    init({ endpoint: '/collect', siteId: 'demo', autoPageviews: false, autoClicks: false, flushInterval: 60_000 });
    document.getElementById('cta')!.click();
    flush();
    expect(await events()).toEqual([]);

    init({
      endpoint: '/collect',
      siteId: 'demo',
      autoPageviews: false,
      autoClicks: { links: false, attribute: 'data-track' },
      flushInterval: 60_000,
    });
    document.getElementById('out')!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    document.querySelector('#cta span')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    document.getElementById('plain')!.click();
    flush();
    let list = await events();
    expect(list.map((event) => event.name)).toEqual(['inscrever']);
    expect(list[0]?.props).toMatchObject({ tag: 'button', text: 'Criar conta', id: 'cta' });

    beacon.mockClear();
    init({ endpoint: '/collect', siteId: 'demo', autoPageviews: false, autoClicks: true, flushInterval: 60_000 });
    document.getElementById('out')!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    flush();
    list = await events();
    expect(list[0]).toMatchObject({
      type: 'click',
      name: 'click',
      props: { tag: 'a', href: 'https://example.com/pricing', id: 'out' },
    });
  });
});

describe('Do Not Track', () => {
  afterEach(() => {
    delete (Navigator.prototype as { doNotTrack?: string }).doNotTrack;
    delete (navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl;
  });

  it('stays idle when DNT or GPC is set, without writing storage', async () => {
    Object.defineProperty(Navigator.prototype, 'doNotTrack', { configurable: true, get: () => '1' });
    track('before');
    const result = init({ endpoint: '/collect', siteId: 'demo' });
    expect(result.enabled).toBe(false);
    track('after');
    flush();
    expect(beacon).not.toHaveBeenCalled();
    expect(localStorage.getItem(STORAGE_KEYS.visitor)).toBeNull();
    expect(sessionStorage.getItem(STORAGE_KEYS.session)).toBeNull();
  });

  it('can be told to ignore the privacy signals', async () => {
    Object.defineProperty(navigator, 'globalPrivacyControl', { configurable: true, value: true });
    const result = init({
      endpoint: '/collect',
      siteId: 'demo',
      respectDoNotTrack: false,
      autoPageviews: false,
      flushInterval: 60_000,
    });
    expect(result.enabled).toBe(true);
    track('anyway');
    flush();
    expect((await events())[0]?.name).toBe('anyway');
  });
});
