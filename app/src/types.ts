/** JSON-safe value accepted on custom events and click properties. */
export type Primitive = string | number | boolean | null;

export type EventType = 'pageview' | 'event' | 'click';

/** Campaign parameters copied from the landing URL. Empty fields are omitted. */
export type UtmParams = {
  source?: string;
  medium?: string;
  campaign?: string;
  term?: string;
  content?: string;
};

/**
 * One analytics event. The collector expects a batch of these inside
 * `{ siteId, events }` (and `token`, when configured).
 */
export type AnalyticsEvent = {
  type: EventType;
  name: string;
  visitorId: string;
  sessionId: string;
  timestamp: number;
  url: string;
  path: string;
  referrer: string;
  title: string;
  screenWidth: number;
  screenHeight: number;
  language: string;
  utm: UtmParams;
  props?: Record<string, Primitive>;
};

export type AutoClickOptions = {
  /**
   * Attribute that names a click. Default `data-track`.
   * The attribute value becomes the event name.
   */
  attribute?: string;
  /** Also record clicks on `<a href>`. Default `true`. */
  links?: boolean;
};

export type WaypostOptions = {
  /** Absolute or relative URL of the collect endpoint. */
  endpoint: string;
  /** Site key stored with every event. Letters, digits, `_`, and `-`. */
  siteId: string;
  /**
   * Shared secret sent in the JSON body when the collector requires one.
   * `sendBeacon` cannot set headers, so the token travels in the payload.
   */
  token?: string;
  /** Record a pageview on init and on SPA navigations. Default `true`. */
  autoPageviews?: boolean;
  /**
   * Record clicks. `true` captures `[data-track]` and links.
   * Pass an object to change the attribute or disable link capture.
   * Default `false`.
   */
  autoClicks?: boolean | AutoClickOptions;
  /**
   * When `true` (default), do nothing if the browser sends Do Not Track
   * or Global Privacy Control.
   */
  respectDoNotTrack?: boolean;
  /** Flush once this many events are queued. Default `10`. Range 1–20. */
  batchSize?: number;
  /** Flush on this interval, in milliseconds. Default `5000`. */
  flushInterval?: number;
  /**
   * Inactivity window before a new session id is minted, in milliseconds.
   * Default 30 minutes. The id lives in `sessionStorage` (one per tab).
   */
  sessionTimeout?: number;
  /** Log queue and delivery details with `console.debug`. Default `false`. */
  debug?: boolean;
};

export type InitResult = {
  /** `false` when tracking is disabled, usually because of Do Not Track. */
  enabled: boolean;
};
