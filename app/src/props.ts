import type { Primitive } from './types';

const MAX_PROPS = 25;
const MAX_KEY = 40;
const MAX_STRING = 200;

const BLOCKED_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

/** Keep a small plain object of JSON primitives. Invalid entries are dropped. */
export function sanitizeProps(input: unknown): Record<string, Primitive> | undefined {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return undefined;
  const out: Record<string, Primitive> = {};
  let count = 0;
  for (const [rawKey, value] of Object.entries(input as Record<string, unknown>)) {
    if (count >= MAX_PROPS) break;
    const key = rawKey.trim().slice(0, MAX_KEY);
    if (!key || BLOCKED_KEYS.has(key)) continue;
    if (value === null) {
      out[key] = null;
      count += 1;
      continue;
    }
    if (typeof value === 'string') {
      out[key] = value.slice(0, MAX_STRING);
      count += 1;
      continue;
    }
    if (typeof value === 'boolean') {
      out[key] = value;
      count += 1;
      continue;
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
      out[key] = value;
      count += 1;
    }
  }
  return count > 0 ? out : undefined;
}

export function clip(value: string, max: number): string {
  return value.length <= max ? value : value.slice(0, max);
}
