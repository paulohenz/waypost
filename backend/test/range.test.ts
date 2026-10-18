import { describe, expect, it } from 'vitest';
import { parseBound, parseRange } from '../src/range.js';

const NOW = Date.parse('2026-10-18T15:00:00.000Z');

describe('parseBound', () => {
  it('treats a date-only end as the next UTC midnight', () => {
    expect(parseBound('2026-10-18', 'start')).toBe(Date.parse('2026-10-18T00:00:00.000Z'));
    expect(parseBound('2026-10-18', 'end')).toBe(Date.parse('2026-10-19T00:00:00.000Z'));
    expect(parseBound('2026-02-31', 'start')).toBeNull();
    expect(parseBound('2026-10-18T15:04:00.000Z', 'end')).toBe(Date.parse('2026-10-18T15:04:00.000Z'));
  });
});

describe('parseRange', () => {
  it('defaults to the last 30 days, daily buckets, and 10 rows', () => {
    const result = parseRange({ siteId: 'demo' }, NOW);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.range).toMatchObject({ siteId: 'demo', interval: 'day', limit: 10, to: NOW });
    expect(result.range.from).toBe(NOW - 30 * 24 * 60 * 60 * 1000);
  });

  it('rejects bad queries', () => {
    expect(parseRange({ siteId: '' }, NOW).ok).toBe(false);
    expect(parseRange({ siteId: 'demo', interval: 'week' }, NOW).ok).toBe(false);
    expect(parseRange({ siteId: 'demo', from: 'nope' }, NOW).ok).toBe(false);
    expect(parseRange({ siteId: 'demo', from: '2026-10-18', to: '2026-10-18T00:00:00.000Z' }, NOW).ok).toBe(false);
    expect(parseRange({ siteId: 'demo', from: '2020-01-01', to: '2026-01-01' }, NOW).ok).toBe(false);
    expect(parseRange({ siteId: 'demo', limit: '0' }, NOW).ok).toBe(false);
    expect(parseRange({ siteId: 'demo', limit: '101' }, NOW).ok).toBe(false);
    expect(parseRange({ siteId: 'demo', limit: 'ten' }, NOW).ok).toBe(false);
  });
});
