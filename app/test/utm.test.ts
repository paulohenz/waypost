import { describe, expect, it } from 'vitest';
import { hasUtm, parseUtm, readStoredUtm } from '../src/utm';

describe('parseUtm', () => {
  it('reads campaign parameters and ignores everything else', () => {
    const utm = parseUtm('?utm_source=news&utm_medium=email&utm_campaign=spring&ref=home&utm_term=trail&utm_content=hero');
    expect(utm).toEqual({
      source: 'news',
      medium: 'email',
      campaign: 'spring',
      term: 'trail',
      content: 'hero',
    });
  });

  it('accepts a search string without a leading question mark', () => {
    expect(parseUtm('utm_source=newsletter')).toEqual({ source: 'newsletter' });
  });

  it('drops blank values and trims', () => {
    expect(parseUtm('?utm_source=%20%20&utm_medium=%20social%20')).toEqual({ medium: 'social' });
  });

  it('clips long values', () => {
    const source = 's'.repeat(250);
    expect(parseUtm(`?utm_source=${source}`).source).toHaveLength(200);
  });

  it('returns an empty object when nothing matches', () => {
    expect(parseUtm('')).toEqual({});
    expect(hasUtm({})).toBe(false);
    expect(hasUtm({ source: 'a' })).toBe(true);
  });
});

describe('readStoredUtm', () => {
  it('ignores corrupt payloads', () => {
    expect(readStoredUtm(null)).toEqual({});
    expect(readStoredUtm('not-json')).toEqual({});
    expect(readStoredUtm('[]')).toEqual({});
    expect(readStoredUtm('{"source":12}')).toEqual({});
  });

  it('keeps known string fields', () => {
    expect(readStoredUtm('{"source":"news","nope":"x"}')).toEqual({ source: 'news' });
  });
});
