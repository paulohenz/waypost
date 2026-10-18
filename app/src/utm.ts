import type { UtmParams } from './types';

const FIELDS = [
  ['utm_source', 'source'],
  ['utm_medium', 'medium'],
  ['utm_campaign', 'campaign'],
  ['utm_term', 'term'],
  ['utm_content', 'content'],
] as const;

const MAX = 200;

/** Read `utm_*` query parameters. Unknown keys are ignored. */
export function parseUtm(search: string): UtmParams {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  const utm: UtmParams = {};
  for (const [queryKey, field] of FIELDS) {
    const value = params.get(queryKey)?.trim();
    if (value) utm[field] = value.slice(0, MAX);
  }
  return utm;
}

export function hasUtm(utm: UtmParams): boolean {
  return Object.values(utm).some((value) => typeof value === 'string' && value.length > 0);
}

export function readStoredUtm(raw: string | null): UtmParams {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as UtmParams;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const utm: UtmParams = {};
    for (const [, field] of FIELDS) {
      const value = parsed[field];
      if (typeof value === 'string' && value.trim()) utm[field] = value.slice(0, MAX);
    }
    return utm;
  } catch {
    return {};
  }
}
