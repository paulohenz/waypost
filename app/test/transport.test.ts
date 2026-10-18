import { afterEach, describe, expect, it, vi } from 'vitest';
import { sendBatch } from '../src/transport';

const originalBeacon = navigator.sendBeacon;
const originalFetch = globalThis.fetch;

afterEach(() => {
  navigator.sendBeacon = originalBeacon;
  globalThis.fetch = originalFetch;
});

describe('sendBatch', () => {
  it('prefers sendBeacon with a text/plain blob', async () => {
    const beacon = vi.fn((_url: string, data?: BodyInit | null) => {
      expect(data).toBeInstanceOf(Blob);
      expect((data as Blob).type).toContain('text/plain');
      return true;
    });
    navigator.sendBeacon = beacon;
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    sendBatch('/collect', '{"ok":true}');
    expect(beacon).toHaveBeenCalledWith('/collect', expect.any(Blob));
    expect(await (beacon.mock.calls[0]?.[1] as Blob).text()).toBe('{"ok":true}');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('falls back to fetch when sendBeacon returns false', async () => {
    navigator.sendBeacon = () => false;
    const fetchMock = vi.fn(() => Promise.resolve(new Response(null, { status: 204 })));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    sendBatch('/collect', '{"n":1}');
    expect(fetchMock).toHaveBeenCalledWith('/collect', {
      method: 'POST',
      body: '{"n":1}',
      headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
      keepalive: true,
      mode: 'cors',
      credentials: 'omit',
    });
  });

  it('falls back to fetch when sendBeacon throws or is missing', () => {
    const fetchMock = vi.fn(() => Promise.resolve(new Response(null, { status: 204 })));
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    navigator.sendBeacon = () => {
      throw new Error('blocked');
    };
    sendBatch('/collect', 'x');
    expect(fetchMock).toHaveBeenCalledTimes(1);

    navigator.sendBeacon = undefined as unknown as Navigator['sendBeacon'];
    sendBatch('/collect', 'y');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('swallows a fetch that rejects or throws', async () => {
    navigator.sendBeacon = () => false;
    globalThis.fetch = vi.fn(() => Promise.reject(new Error('offline'))) as unknown as typeof fetch;
    expect(() => sendBatch('/collect', 'x')).not.toThrow();
    await Promise.resolve();

    globalThis.fetch = (() => {
      throw new Error('no fetch');
    }) as unknown as typeof fetch;
    expect(() => sendBatch('/collect', 'x')).not.toThrow();
  });
});
