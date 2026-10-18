export type EventType = 'pageview' | 'event' | 'click';

/** Normalized row ready for storage. Strings are already length-checked. */
export type StoredEvent = {
  type: EventType;
  name: string;
  visitorId: string;
  sessionId: string;
  timestamp: number;
  url: string;
  path: string;
  referrer: string;
  referrerHost: string;
  title: string;
  screenWidth: number;
  screenHeight: number;
  language: string;
  utmSource: string;
  utmMedium: string;
  utmCampaign: string;
  utmTerm: string;
  utmContent: string;
  props: string | null;
};

export type Interval = 'hour' | 'day';

export type Range = {
  siteId: string;
  from: number;
  to: number;
  interval: Interval;
  limit: number;
};

export type TimeseriesPoint = {
  bucket: string;
  pageviews: number;
  visitors: number;
};

export type Timeseries = {
  points: TimeseriesPoint[];
  totals: { pageviews: number; visitors: number };
};

export type PageStat = { path: string; pageviews: number; visitors: number };
export type ReferrerStat = { host: string; visits: number; visitors: number };
export type EventStat = { name: string; type: EventType; count: number; visitors: number };

/**
 * Storage boundary. SQLite is the default driver; a Postgres adapter only
 * needs to implement these methods and can be constructed from DATABASE_URL.
 */
export interface AnalyticsStore {
  insertEvents(siteId: string, events: StoredEvent[]): void;
  timeseries(range: Range): Timeseries;
  topPages(range: Range): PageStat[];
  topReferrers(range: Range): ReferrerStat[];
  topEvents(range: Range): EventStat[];
  close(): void;
}
