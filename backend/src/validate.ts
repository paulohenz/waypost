import type { EventType, StoredEvent } from './types.js';

const SITE_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;
const IDENTITY = /^[A-Za-z0-9_-]{8,80}$/;
const CONTROL = /[\u0000-\u001F\u007F]/;
const TYPES = new Set<EventType>(['pageview', 'event', 'click']);

const MAX_BATCH = 20;
const PAST_MS = 30 * 24 * 60 * 60 * 1000;
const FUTURE_MS = 15 * 60 * 1000;
const MAX_PROPS = 25;
const MAX_PROP_KEY = 40;
const MAX_PROP_STRING = 200;

export type CollectSuccess = { ok: true; siteId: string; events: StoredEvent[] };
export type CollectFailure = { ok: false; error: string; message: string };
export type CollectResult = CollectSuccess | CollectFailure;

export function referrerHost(referrer: string, pageUrl: string): string {
  if (!referrer) return '';
  let host = '';
  try {
    host = new URL(referrer).host;
  } catch {
    return '';
  }
  if (!host) return '';
  try {
    if (pageUrl && new URL(pageUrl).host === host) return '';
  } catch {
    /* keep the host when the page URL cannot be parsed */
  }
  return host.slice(0, 255);
}

function fail(message: string): CollectFailure {
  return { ok: false, error: 'invalid_payload', message };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value) as object | null;
  return proto === Object.prototype || proto === null;
}

function readString(value: unknown, max: number, fallback: string | null): string | null {
  if (value == null) return fallback;
  if (typeof value !== 'string' || value.length > max) return null;
  return value;
}

function readProps(value: unknown): { ok: true; json: string | null } | CollectFailure {
  if (value == null) return { ok: true, json: null };
  if (!isPlainObject(value)) return fail('props must be a plain object');
  const keys = Object.keys(value);
  if (keys.length > MAX_PROPS) return fail(`props accepts at most ${MAX_PROPS} keys`);
  const out: Record<string, string | number | boolean | null> = {};
  for (const key of keys) {
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
      return fail('props contains a reserved key');
    }
    if (!key.trim() || key.length > MAX_PROP_KEY) return fail('a props key is empty or too long');
    const item = value[key];
    if (item === null || typeof item === 'boolean') {
      out[key] = item as boolean | null;
      continue;
    }
    if (typeof item === 'string') {
      if (item.length > MAX_PROP_STRING) return fail('a props value is too long');
      out[key] = item;
      continue;
    }
    if (typeof item === 'number' && Number.isFinite(item)) {
      out[key] = item;
      continue;
    }
    return fail('props values must be strings, finite numbers, booleans, or null');
  }
  return { ok: true, json: keys.length === 0 ? null : JSON.stringify(out) };
}

function readUtm(value: unknown): { ok: true; fields: Record<string, string> } | CollectFailure {
  const fields = { source: '', medium: '', campaign: '', term: '', content: '' };
  if (value == null) return { ok: true, fields };
  if (!isPlainObject(value)) return fail('utm must be an object');
  for (const field of Object.keys(fields)) {
    const item = value[field];
    if (item == null || item === '') continue;
    if (typeof item !== 'string' || item.length > 200) return fail(`utm.${field} must be a string of at most 200 characters`);
    fields[field as keyof typeof fields] = item;
  }
  return { ok: true, fields };
}

function readEvent(value: unknown, index: number, now: number): { ok: true; event: StoredEvent } | CollectFailure {
  if (!isPlainObject(value)) return fail(`events[${index}] must be an object`);
  const type = value.type;
  if (typeof type !== 'string' || !TYPES.has(type as EventType)) {
    return fail(`events[${index}].type must be pageview, event, or click`);
  }
  if (typeof value.name !== 'string') return fail(`events[${index}].name is required`);
  const name = value.name.trim();
  if (!name || name.length > 120 || CONTROL.test(name)) {
    return fail(`events[${index}].name must be 1–120 characters without control characters`);
  }
  if (typeof value.visitorId !== 'string' || !IDENTITY.test(value.visitorId)) {
    return fail(`events[${index}].visitorId is invalid`);
  }
  if (typeof value.sessionId !== 'string' || !IDENTITY.test(value.sessionId)) {
    return fail(`events[${index}].sessionId is invalid`);
  }
  if (typeof value.timestamp !== 'number' || !Number.isFinite(value.timestamp)) {
    return fail(`events[${index}].timestamp must be a finite number`);
  }
  if (value.timestamp < now - PAST_MS || value.timestamp > now + FUTURE_MS) {
    return fail(`events[${index}].timestamp is outside the accepted window`);
  }

  const url = readString(value.url, 2048, '');
  const path = readString(value.path, 1024, '/');
  const referrer = readString(value.referrer, 2048, '');
  const title = readString(value.title, 300, '');
  const language = readString(value.language, 35, '');
  if (url === null || path === null || referrer === null || title === null || language === null) {
    return fail(`events[${index}] has a context field that is not a string or is too long`);
  }

  const screenWidth = readScreen(value.screenWidth);
  const screenHeight = readScreen(value.screenHeight);
  if (screenWidth === null || screenHeight === null) {
    return fail(`events[${index}] has an invalid screen size`);
  }

  const utm = readUtm(value.utm);
  if (!utm.ok) return fail(`events[${index}].${utm.message.replace(/^utm/, 'utm')}`);
  const props = readProps(value.props);
  if (!props.ok) return fail(`events[${index}].${props.message}`);

  return {
    ok: true,
    event: {
      type: type as EventType,
      name,
      visitorId: value.visitorId,
      sessionId: value.sessionId,
      timestamp: value.timestamp,
      url,
      path: path || '/',
      referrer,
      referrerHost: referrerHost(referrer, url),
      title,
      screenWidth,
      screenHeight,
      language,
      utmSource: utm.fields.source ?? '',
      utmMedium: utm.fields.medium ?? '',
      utmCampaign: utm.fields.campaign ?? '',
      utmTerm: utm.fields.term ?? '',
      utmContent: utm.fields.content ?? '',
      props: props.json,
    },
  };
}

function readScreen(value: unknown): number | null {
  if (value == null) return 0;
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  const truncated = Math.trunc(value);
  if (truncated < 0 || truncated > 100_000) return null;
  return truncated;
}

/** Validate a decoded collect body. `now` is injectable for tests. */
export function validateCollect(body: unknown, now = Date.now()): CollectResult {
  if (!isPlainObject(body)) return fail('body must be a JSON object');
  if (typeof body.siteId !== 'string' || !SITE_ID.test(body.siteId)) {
    return fail('siteId must be 1–64 characters (letters, digits, "_" or "-")');
  }
  if (!Array.isArray(body.events) || body.events.length === 0) {
    return fail('events must be a non-empty array');
  }
  if (body.events.length > MAX_BATCH) return fail(`events accepts at most ${MAX_BATCH} items`);

  const events: StoredEvent[] = [];
  for (let index = 0; index < body.events.length; index += 1) {
    const parsed = readEvent(body.events[index], index, now);
    if (!parsed.ok) return parsed;
    events.push(parsed.event);
  }
  return { ok: true, siteId: body.siteId, events };
}
