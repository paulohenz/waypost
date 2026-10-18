import { afterEach, describe, expect, it, vi } from 'vitest';

describe('script-tag autostart', () => {
  afterEach(async () => {
    const mod = await import('../src/snippet');
    mod.shutdown();
    localStorage.clear();
    sessionStorage.clear();
    document.body.innerHTML = '';
  });

  it('reads data attributes and records a pageview', async () => {
    window.history.replaceState({}, '', '/snippet');
    const script = document.createElement('script');
    script.dataset.endpoint = '/collect';
    script.dataset.site = 'demo';
    script.dataset.autoClicks = 'false';
    script.dataset.token = 't';
    document.body.appendChild(script);
    const beacon = vi.fn((_url: string, _data?: BodyInit | null) => true);
    navigator.sendBeacon = beacon;
    const mod = await import('../src/snippet');
    mod.flush();
    expect(beacon).toHaveBeenCalledTimes(1);
    const body = beacon.mock.calls[0]?.[1];
    const text = body instanceof Blob ? await body.text() : '';
    const payload = JSON.parse(text) as { siteId: string; token: string; events: Array<{ path: string }> };
    expect(payload.siteId).toBe('demo');
    expect(payload.token).toBe('t');
    expect(payload.events[0]?.path).toBe('/snippet');
    expect(typeof mod.track).toBe('function');
  });
});
