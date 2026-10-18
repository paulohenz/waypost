import type { Interval, Range } from './types.js';

const SITE_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;
const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_SPAN = 30 * DAY_MS;
const MAX_SPAN = 366 * DAY_MS;

export type RangeQuery = {
  siteId?: string;
  from?: string;
  to?: string;
  interval?: string;
  limit?: string;
};

export type RangeResult = { ok: true; range: Range } | { ok: false; error: string; message: string };

function fail(message: string): RangeResult {
  return { ok: false, error: 'invalid_query', message };
}

/** `YYYY-MM-DD` is a UTC day. `to` on a date-only value includes that whole day. */
export function parseBound(value: string, edge: 'start' | 'end'): number | null {
  const dateOnly = DATE_ONLY.exec(value);
  if (dateOnly) {
    const ms = Date.parse(`${value}T00:00:00.000Z`);
    if (Number.isNaN(ms)) return null;
    if (new Date(ms).toISOString().slice(0, 10) !== value) return null;
    return edge === 'end' ? ms + DAY_MS : ms;
  }
  const ms = Date.parse(value);
  if (Number.isNaN(ms)) return null;
  return ms;
}

export function parseRange(query: RangeQuery, now = Date.now()): RangeResult {
  const siteId = query.siteId ?? '';
  if (!SITE_ID.test(siteId)) return fail('siteId is required and must match the collect format');

  let interval: Interval = 'day';
  if (query.interval != null && query.interval !== '') {
    if (query.interval !== 'hour' && query.interval !== 'day') {
      return fail('interval must be hour or day');
    }
    interval = query.interval;
  }

  const from = query.from ? parseBound(query.from, 'start') : now - DEFAULT_SPAN;
  const to = query.to ? parseBound(query.to, 'end') : now;
  if (from == null || to == null) return fail('from and to must be YYYY-MM-DD or an ISO timestamp');
  if (from >= to) return fail('from must be earlier than to');
  if (to - from > MAX_SPAN) return fail('the range cannot exceed 366 days');

  let limit = 10;
  if (query.limit != null && query.limit !== '') {
    if (!/^\d+$/.test(query.limit)) return fail('limit must be an integer');
    limit = Number(query.limit);
    if (limit < 1 || limit > 100) return fail('limit must be between 1 and 100');
  }

  return { ok: true, range: { siteId, from, to, interval, limit } };
}
