import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type {
  AnalyticsStore,
  EventStat,
  EventType,
  PageStat,
  Range,
  ReferrerStat,
  StoredEvent,
  Timeseries,
  TimeseriesPoint,
} from './types.js';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY,
  site_id TEXT NOT NULL,
  type TEXT NOT NULL,
  name TEXT NOT NULL,
  visitor_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  timestamp INTEGER NOT NULL,
  received_at INTEGER NOT NULL,
  url TEXT NOT NULL,
  path TEXT NOT NULL,
  referrer TEXT NOT NULL,
  referrer_host TEXT NOT NULL,
  title TEXT NOT NULL,
  screen_width INTEGER NOT NULL,
  screen_height INTEGER NOT NULL,
  language TEXT NOT NULL,
  utm_source TEXT NOT NULL,
  utm_medium TEXT NOT NULL,
  utm_campaign TEXT NOT NULL,
  utm_term TEXT NOT NULL,
  utm_content TEXT NOT NULL,
  props TEXT
);
CREATE INDEX IF NOT EXISTS idx_events_site_type_ts ON events (site_id, type, timestamp);
`;

type Row = Record<string, unknown>;

function num(value: unknown): number {
  if (typeof value === 'bigint') return Number(value);
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : value == null ? '' : String(value);
}

/**
 * Bucket expressions are fixed strings chosen after the interval is
 * whitelisted. They are never built from request input.
 */
function bucketSql(interval: Range['interval']): string {
  if (interval === 'hour') {
    return "strftime('%Y-%m-%dT%H:00:00Z', CAST(timestamp / 1000 AS INTEGER), 'unixepoch')";
  }
  return "strftime('%Y-%m-%d', CAST(timestamp / 1000 AS INTEGER), 'unixepoch')";
}

export function createSqliteStore(filename: string): AnalyticsStore {
  if (filename !== ':memory:') mkdirSync(dirname(filename), { recursive: true });
  const db = new DatabaseSync(filename);
  if (filename !== ':memory:') db.exec('PRAGMA journal_mode = WAL');
  db.exec(SCHEMA);

  const insert = db.prepare(`
    INSERT INTO events (
      site_id, type, name, visitor_id, session_id, timestamp, received_at,
      url, path, referrer, referrer_host, title,
      screen_width, screen_height, language,
      utm_source, utm_medium, utm_campaign, utm_term, utm_content, props
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const where = 'site_id = ? AND timestamp >= ? AND timestamp < ?';

  return {
    insertEvents(siteId, events) {
      const receivedAt = Date.now();
      db.exec('BEGIN');
      try {
        for (const event of events) insert.run(...rowValues(siteId, event, receivedAt));
        db.exec('COMMIT');
      } catch (error) {
        try {
          db.exec('ROLLBACK');
        } catch {
          /* the original error is the one that matters */
        }
        throw error;
      }
    },

    timeseries(range) {
      const bucket = bucketSql(range.interval);
      const points = db
        .prepare(
          `SELECT ${bucket} AS bucket,
                  COUNT(*) AS pageviews,
                  COUNT(DISTINCT visitor_id) AS visitors
             FROM events
            WHERE ${where} AND type = 'pageview'
            GROUP BY bucket
            ORDER BY bucket ASC`,
        )
        .all(range.siteId, range.from, range.to)
        .map(mapPoint);
      const totalsRow = db
        .prepare(
          `SELECT COUNT(*) AS pageviews, COUNT(DISTINCT visitor_id) AS visitors
             FROM events
            WHERE ${where} AND type = 'pageview'`,
        )
        .get(range.siteId, range.from, range.to) as Row | undefined;
      return {
        points,
        totals: {
          pageviews: num(totalsRow?.pageviews),
          visitors: num(totalsRow?.visitors),
        },
      } satisfies Timeseries;
    },

    topPages(range) {
      return db
        .prepare(
          `SELECT path,
                  COUNT(*) AS pageviews,
                  COUNT(DISTINCT visitor_id) AS visitors
             FROM events
            WHERE ${where} AND type = 'pageview'
            GROUP BY path
            ORDER BY pageviews DESC, path ASC
            LIMIT ?`,
        )
        .all(range.siteId, range.from, range.to, range.limit)
        .map(
          (row): PageStat => ({
            path: text((row as Row).path),
            pageviews: num((row as Row).pageviews),
            visitors: num((row as Row).visitors),
          }),
        );
    },

    topReferrers(range) {
      return db
        .prepare(
          `SELECT referrer_host AS host,
                  COUNT(*) AS visits,
                  COUNT(DISTINCT visitor_id) AS visitors
             FROM events
            WHERE ${where} AND type = 'pageview' AND referrer_host != ''
            GROUP BY referrer_host
            ORDER BY visits DESC, referrer_host ASC
            LIMIT ?`,
        )
        .all(range.siteId, range.from, range.to, range.limit)
        .map(
          (row): ReferrerStat => ({
            host: text((row as Row).host),
            visits: num((row as Row).visits),
            visitors: num((row as Row).visitors),
          }),
        );
    },

    topEvents(range) {
      return db
        .prepare(
          `SELECT name, type,
                  COUNT(*) AS count,
                  COUNT(DISTINCT visitor_id) AS visitors
             FROM events
            WHERE ${where} AND type IN ('event', 'click')
            GROUP BY name, type
            ORDER BY count DESC, name ASC
            LIMIT ?`,
        )
        .all(range.siteId, range.from, range.to, range.limit)
        .map(
          (row): EventStat => ({
            name: text((row as Row).name),
            type: text((row as Row).type) as EventType,
            count: num((row as Row).count),
            visitors: num((row as Row).visitors),
          }),
        );
    },

    close() {
      db.close();
    },
  };
}

function mapPoint(row: unknown): TimeseriesPoint {
  const record = row as Row;
  return {
    bucket: text(record.bucket),
    pageviews: num(record.pageviews),
    visitors: num(record.visitors),
  };
}

function rowValues(siteId: string, event: StoredEvent, receivedAt: number): Array<string | number | null> {
  return [
    siteId,
    event.type,
    event.name,
    event.visitorId,
    event.sessionId,
    event.timestamp,
    receivedAt,
    event.url,
    event.path,
    event.referrer,
    event.referrerHost,
    event.title,
    event.screenWidth,
    event.screenHeight,
    event.language,
    event.utmSource,
    event.utmMedium,
    event.utmCampaign,
    event.utmTerm,
    event.utmContent,
    event.props,
  ];
}
