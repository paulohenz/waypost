import { flush, init, shutdown, track } from './index';

export { flush, init, shutdown, track };

function flag(value: string | undefined, fallback: boolean): boolean {
  if (value == null || value === '') return fallback;
  const normalized = value.trim().toLowerCase();
  if (normalized === 'false' || normalized === '0' || normalized === 'off' || normalized === 'no') return false;
  if (normalized === 'true' || normalized === '1' || normalized === 'on' || normalized === 'yes') return true;
  return fallback;
}

function integer(value: string | undefined): number | undefined {
  if (value == null || value === '') return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function autostart(): void {
  if (typeof document === 'undefined') return;
  const current = document.currentScript;
  const el =
    current instanceof HTMLScriptElement
      ? current
      : document.querySelector<HTMLScriptElement>('script[data-endpoint][data-site]');
  if (!el) return;
  const endpoint = el.dataset.endpoint?.trim();
  const siteId = el.dataset.site?.trim();
  if (!endpoint || !siteId) return;
  const batchSize = integer(el.dataset.batchSize);
  const flushInterval = integer(el.dataset.flushInterval);
  init({
    endpoint,
    siteId,
    token: el.dataset.token?.trim() || undefined,
    autoPageviews: flag(el.dataset.autoPageviews, true),
    autoClicks: flag(el.dataset.autoClicks, false),
    respectDoNotTrack: flag(el.dataset.respectDnt, true),
    debug: flag(el.dataset.debug, false),
    ...(batchSize === undefined ? {} : { batchSize }),
    ...(flushInterval === undefined ? {} : { flushInterval }),
  });
}

autostart();
