import { describe, expect, it } from 'vitest';
import { referrerHost, validateCollect } from '../src/validate.js';

const NOW = Date.parse('2026-10-18T15:00:00.000Z');

function event(overrides: Record<string, unknown> = {}) {
  return {
    type: 'pageview',
    name: 'pageview',
    visitorId: '11111111-1111-4111-8111-111111111111',
    sessionId: '22222222-2222-4222-8222-222222222222',
    timestamp: NOW,
    url: 'https://shop.example/cadernos',
    path: '/cadernos',
    referrer: 'https://news.example/story',
    title: 'Cadernos',
    screenWidth: 1440,
    screenHeight: 900,
    language: 'pt-BR',
    utm: { source: 'news', medium: 'email' },
    props: { plan: 'campo' },
    ...overrides,
  };
}

describe('referrerHost', () => {
  it('keeps external hosts and drops same-site or unusable referrers', () => {
    expect(referrerHost('https://news.example/a', 'https://shop.example/')).toBe('news.example');
    expect(referrerHost('https://shop.example/old', 'https://shop.example/new')).toBe('');
    expect(referrerHost('', 'https://shop.example/')).toBe('');
    expect(referrerHost('not a url', 'https://shop.example/')).toBe('');
  });
});

describe('validateCollect', () => {
  it('normalizes a valid batch', () => {
    const result = validateCollect({ siteId: 'demo', events: [event()] }, NOW);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.siteId).toBe('demo');
    expect(result.events[0]).toMatchObject({
      path: '/cadernos',
      referrerHost: 'news.example',
      utmSource: 'news',
      utmMedium: 'email',
      props: JSON.stringify({ plan: 'campo' }),
    });
  });

  it('rejects malformed envelopes and events', () => {
    expect(validateCollect(null, NOW).ok).toBe(false);
    expect(validateCollect({ siteId: 'bad id', events: [event()] }, NOW).ok).toBe(false);
    expect(validateCollect({ siteId: 'demo', events: [] }, NOW).ok).toBe(false);
    expect(validateCollect({ siteId: 'demo', events: Array.from({ length: 21 }, () => event()) }, NOW).ok).toBe(false);
    expect(validateCollect({ siteId: 'demo', events: [event({ type: 'scroll' })] }, NOW).ok).toBe(false);
    expect(validateCollect({ siteId: 'demo', events: [event({ name: '   ' })] }, NOW).ok).toBe(false);
    expect(validateCollect({ siteId: 'demo', events: [event({ visitorId: 'short' })] }, NOW).ok).toBe(false);
    expect(validateCollect({ siteId: 'demo', events: [event({ timestamp: NOW + 60 * 60 * 1000 })] }, NOW).ok).toBe(false);
    expect(validateCollect({ siteId: 'demo', events: [event({ timestamp: NOW - 31 * 24 * 60 * 60 * 1000 })] }, NOW).ok).toBe(
      false,
    );
    expect(validateCollect({ siteId: 'demo', events: [event({ props: { nested: { a: 1 } } })] }, NOW).ok).toBe(false);
    const reserved = JSON.parse('{"constructor":"x"}') as Record<string, unknown>;
    expect(validateCollect({ siteId: 'demo', events: [event({ props: reserved })] }, NOW).ok).toBe(false);
    expect(validateCollect({ siteId: 'demo', events: [event({ screenWidth: -1 })] }, NOW).ok).toBe(false);
    expect(validateCollect({ siteId: 'demo', events: [event({ url: 'x'.repeat(3000) })] }, NOW).ok).toBe(false);
  });

  it('defaults missing context instead of dropping the event', () => {
    const result = validateCollect(
      {
        siteId: 'demo',
        events: [
          {
            type: 'event',
            name: ' signup ',
            visitorId: 'visitor_01',
            sessionId: 'session_01',
            timestamp: NOW,
          },
        ],
      },
      NOW,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.events[0]).toMatchObject({ name: 'signup', path: '/', url: '', props: null, referrerHost: '' });
  });
});
