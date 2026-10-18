import { sanitizeProps, clip } from './props';
import { isOptedOut, readPrivacySignals } from './privacy';
import { createQueue, type Queue } from './queue';
import { loadIdentity, safeStore, STORAGE_KEYS, type KeyValueStore } from './storage';
import { sendBatch } from './transport';
import type { AnalyticsEvent, AutoClickOptions, InitResult, Primitive, UtmParams, WaypostOptions } from './types';
import { hasUtm, parseUtm, readStoredUtm } from './utm';

const DEFAULT_BATCH = 10;
const DEFAULT_FLUSH = 5000;
const DEFAULT_SESSION = 30 * 60 * 1000;
const MAX_BATCH = 20;
const MAX_FLUSH = 120_000;
const PENDING_LIMIT = 20;

type ResolvedClick = { attribute: string; links: boolean } | null;

type Resolved = {
  endpoint: string;
  siteId: string;
  token?: string;
  autoPageviews: boolean;
  autoClicks: ResolvedClick;
  respectDoNotTrack: boolean;
  batchSize: number;
  flushInterval: number;
  sessionTimeout: number;
  debug: boolean;
};

type Runtime = {
  options: Resolved;
  queue: Queue<AnalyticsEvent>;
  local: KeyValueStore;
  session: KeyValueStore;
  detach: Array<() => void>;
  enabled: boolean;
  lastRoute: string;
  lastRouteAt: number;
};

let runtime: Runtime | null = null;
const pending: Array<{ name: string; props?: Record<string, Primitive> }> = [];

function clamp(value: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

function resolveClick(option: WaypostOptions['autoClicks']): ResolvedClick {
  if (!option) return null;
  const source: AutoClickOptions = option === true ? {} : option;
  const attribute = source.attribute?.trim() || 'data-track';
  if (!/^[A-Za-z_:][A-Za-z0-9_.:-]*$/.test(attribute)) {
    throw new TypeError(`Invalid click attribute: ${attribute}`);
  }
  return { attribute, links: source.links !== false };
}

function resolveOptions(options: WaypostOptions): Resolved {
  if (!options || typeof options.endpoint !== 'string' || options.endpoint.trim() === '') {
    throw new TypeError('waypost.init: endpoint is required');
  }
  if (typeof options.siteId !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(options.siteId)) {
    throw new TypeError('waypost.init: siteId must be 1–64 characters (letters, digits, "_" or "-")');
  }
  const token = typeof options.token === 'string' ? options.token.trim() : '';
  return {
    endpoint: options.endpoint.trim(),
    siteId: options.siteId,
    token: token || undefined,
    autoPageviews: options.autoPageviews !== false,
    autoClicks: resolveClick(options.autoClicks),
    respectDoNotTrack: options.respectDoNotTrack !== false,
    batchSize: Math.round(clamp(options.batchSize ?? DEFAULT_BATCH, 1, MAX_BATCH, DEFAULT_BATCH)),
    flushInterval: Math.round(clamp(options.flushInterval ?? DEFAULT_FLUSH, 0, MAX_FLUSH, DEFAULT_FLUSH)),
    sessionTimeout: Math.round(
      clamp(options.sessionTimeout ?? DEFAULT_SESSION, 1_000, 24 * 60 * 60 * 1000, DEFAULT_SESSION),
    ),
    debug: options.debug === true,
  };
}

function noopStore(): KeyValueStore {
  return { get: () => null, set: () => {}, remove: () => {} };
}

function debug(message: string, extra?: unknown): void {
  if (!runtime?.options.debug) return;
  if (extra === undefined) console.debug('[waypost]', message);
  else console.debug('[waypost]', message, extra);
}

function pagePath(loc: Location): string {
  const path = loc.pathname || '/';
  const hash = loc.hash && loc.hash !== '#' ? loc.hash : '';
  return clip(path + hash, 1024);
}

function currentUtm(session: KeyValueStore, search: string): UtmParams {
  const fresh = parseUtm(search);
  const stored = readStoredUtm(session.get(STORAGE_KEYS.utm));
  if (hasUtm(stored)) return stored;
  if (hasUtm(fresh)) {
    session.set(STORAGE_KEYS.utm, JSON.stringify(fresh));
    return fresh;
  }
  return {};
}

function buildEvent(
  type: AnalyticsEvent['type'],
  name: string,
  props?: Record<string, Primitive>,
): AnalyticsEvent | null {
  if (!runtime) return null;
  const now = Date.now();
  const identity = loadIdentity(runtime.local, runtime.session, runtime.options.sessionTimeout, now);
  const loc = window.location;
  const cleanProps = sanitizeProps(props);
  return {
    type,
    name: clip(name.trim(), 120),
    visitorId: identity.visitorId,
    sessionId: identity.sessionId,
    timestamp: now,
    url: clip(loc.href || '', 2048),
    path: pagePath(loc),
    referrer: clip(document.referrer || '', 2048),
    title: clip(document.title || '', 300),
    screenWidth: window.screen?.width || 0,
    screenHeight: window.screen?.height || 0,
    language: clip(navigator.language || '', 35),
    utm: currentUtm(runtime.session, loc.search || ''),
    ...(cleanProps ? { props: cleanProps } : {}),
  };
}

function enqueue(type: AnalyticsEvent['type'], name: string, props?: Record<string, Primitive>): void {
  if (!runtime?.enabled) return;
  const trimmed = name.trim();
  if (!trimmed) return;
  const event = buildEvent(type, trimmed, props);
  if (!event) return;
  runtime.queue.push(event);
  debug('queued', { type, name: event.name });
}

function routeKey(): string {
  const loc = window.location;
  return `${loc.pathname}${loc.search}${loc.hash}`;
}

function onRoute(): void {
  if (!runtime?.options.autoPageviews) return;
  const key = routeKey();
  const now = Date.now();
  if (key === runtime.lastRoute && now - runtime.lastRouteAt < 50) return;
  runtime.lastRoute = key;
  runtime.lastRouteAt = now;
  enqueue('pageview', 'pageview');
}

function installHistory(onChange: () => void): () => void {
  const hist = window.history;
  const marker = hist as History & { __waypostPatched?: boolean };
  if (marker.__waypostPatched) return () => {};
  const originalPush = hist.pushState.bind(hist);
  const originalReplace = hist.replaceState.bind(hist);
  const wrap =
    (original: History['pushState']) =>
    (data: unknown, unused: string, url?: string | URL | null): void => {
      original(data, unused, url);
      onChange();
    };
  hist.pushState = wrap(originalPush);
  hist.replaceState = wrap(originalReplace);
  const onPop = () => onChange();
  window.addEventListener('popstate', onPop);
  window.addEventListener('hashchange', onPop);
  marker.__waypostPatched = true;
  return () => {
    hist.pushState = originalPush;
    hist.replaceState = originalReplace;
    window.removeEventListener('popstate', onPop);
    window.removeEventListener('hashchange', onPop);
    delete marker.__waypostPatched;
  };
}

function elementText(el: Element): string {
  return (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 80);
}

function eventElement(target: EventTarget | null): Element | null {
  if (target instanceof Element) return target;
  if (target instanceof Node) return target.parentElement;
  return null;
}

function installClicks(options: { attribute: string; links: boolean }): () => void {
  const escaped =
    typeof CSS !== 'undefined' && typeof CSS.escape === 'function' ? CSS.escape(options.attribute) : options.attribute;
  const selector = `[${escaped}]`;
  const onClick = (event: Event) => {
    const origin = eventElement(event.target);
    if (!origin) return;
    const marked = origin.closest(selector);
    const link = options.links ? origin.closest('a[href]') : null;
    const node = marked || link;
    if (!node) return;
    const named = marked?.getAttribute(options.attribute)?.trim();
    const hrefNode = node instanceof HTMLAnchorElement ? node : link instanceof HTMLAnchorElement ? link : null;
    const href = hrefNode ? hrefNode.href : node.getAttribute('href') || '';
    const props: Record<string, Primitive> = { tag: node.tagName.toLowerCase() };
    const text = elementText(node);
    if (text) props.text = text;
    if (href) props.href = href;
    if (node.id) props.id = node.id;
    enqueue('click', named || 'click', props);
  };
  document.addEventListener('click', onClick, true);
  return () => document.removeEventListener('click', onClick, true);
}

function detachRuntime(): void {
  if (!runtime) return;
  for (const stop of runtime.detach) stop();
  runtime.queue.destroy();
  runtime = null;
}

function deliver(events: AnalyticsEvent[]): void {
  if (!runtime) return;
  const payload: { siteId: string; token?: string; events: AnalyticsEvent[] } = {
    siteId: runtime.options.siteId,
    events,
  };
  if (runtime.options.token) payload.token = runtime.options.token;
  const body = JSON.stringify(payload);
  debug('send', { count: events.length, endpoint: runtime.options.endpoint });
  sendBatch(runtime.options.endpoint, body);
}

/**
 * Start tracking. Safe to call again: the previous listeners are removed
 * and a fresh queue is created. Visitor and session ids stay in storage.
 */
export function init(options: WaypostOptions): InitResult {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    throw new Error('waypost.init() must run in a browser');
  }
  const resolved = resolveOptions(options);
  if (runtime) {
    runtime.queue.flush();
    detachRuntime();
  }

  const enabled = !(resolved.respectDoNotTrack && isOptedOut(readPrivacySignals(window)));

  // Do Not Track must not write a visitor id or attach listeners.
  const local = enabled ? safeStore(window.localStorage) : noopStore();
  const session = enabled ? safeStore(window.sessionStorage) : noopStore();

  runtime = {
    options: resolved,
    queue: createQueue<AnalyticsEvent>({
      batchSize: resolved.batchSize,
      flushInterval: resolved.flushInterval,
      send: enabled ? deliver : () => {},
    }),
    local,
    session,
    detach: [],
    enabled,
    lastRoute: '',
    lastRouteAt: 0,
  };

  if (!enabled) {
    debug('disabled by Do Not Track or Global Privacy Control');
    pending.length = 0;
    return { enabled: false };
  }

  if (resolved.autoPageviews) {
    runtime.detach.push(installHistory(onRoute));
    onRoute();
  }
  if (resolved.autoClicks) {
    runtime.detach.push(installClicks(resolved.autoClicks));
  }

  const onHide = () => {
    if (document.visibilityState === 'hidden') flush();
  };
  const onPageHide = () => flush();
  document.addEventListener('visibilitychange', onHide);
  window.addEventListener('pagehide', onPageHide);
  runtime.detach.push(() => document.removeEventListener('visibilitychange', onHide));
  runtime.detach.push(() => window.removeEventListener('pagehide', onPageHide));

  const queued = pending.splice(0, pending.length);
  for (const item of queued) enqueue('event', item.name, item.props);

  debug('ready', { siteId: resolved.siteId, endpoint: resolved.endpoint });
  return { enabled: true };
}

/** Queue a custom event. Calls made before `init` are kept (up to 20). */
export function track(eventName: string, props?: Record<string, Primitive>): void {
  if (typeof eventName !== 'string') return;
  if (!runtime) {
    if (pending.length < PENDING_LIMIT) pending.push({ name: eventName, props });
    return;
  }
  enqueue('event', eventName, props);
}

/** Send the queued batch now. */
export function flush(): void {
  runtime?.queue.flush();
}

/** Flush, remove listeners, and forget in-memory state. Storage is kept. */
export function shutdown(): void {
  if (runtime?.enabled) runtime.queue.flush();
  detachRuntime();
  pending.length = 0;
}
