/**
 * Deliver a JSON payload. `text/plain` is a CORS-safelisted type, so
 * `sendBeacon` can post it without a preflight. The collector parses JSON
 * regardless of the content type.
 */
export function sendBatch(endpoint: string, body: string): void {
  try {
    const beacon = globalThis.navigator?.sendBeacon;
    if (typeof beacon === 'function') {
      const blob = new Blob([body], { type: 'text/plain;charset=UTF-8' });
      if (beacon.call(navigator, endpoint, blob)) return;
    }
  } catch {
    /* fall through to fetch */
  }

  const fetchFn = globalThis.fetch;
  if (typeof fetchFn !== 'function') return;
  try {
    void fetchFn(endpoint, {
      method: 'POST',
      body,
      headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
      keepalive: true,
      mode: 'cors',
      credentials: 'omit',
    }).catch(() => {
      /* analytics must not surface as an unhandled rejection */
    });
  } catch {
    /* ignore a throwing fetch implementation */
  }
}
