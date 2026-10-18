import { createSqliteStore } from './sqlite-store.js';
import type { AnalyticsStore } from './types.js';

export type { AnalyticsStore } from './types.js';

/**
 * Open the store configured for this process.
 *
 * `DATABASE_PATH` selects a SQLite file (default `data/waypost.sqlite`).
 * A `postgres:` or `postgresql:` `DATABASE_URL` is reserved for a future
 * adapter that implements `AnalyticsStore` — the HTTP layer does not care
 * which driver is behind it.
 */
export function openStore(): AnalyticsStore {
  const databaseUrl = process.env.DATABASE_URL?.trim() ?? '';
  if (databaseUrl.startsWith('postgres://') || databaseUrl.startsWith('postgresql://')) {
    throw new Error(
      'Postgres is not bundled. Implement AnalyticsStore (backend/src/types.ts) with a Postgres driver and construct it when DATABASE_URL is set.',
    );
  }
  const filename = process.env.DATABASE_PATH?.trim() || 'data/waypost.sqlite';
  return createSqliteStore(filename);
}
