# waypost-analytics

Tiny, privacy-friendly SDK for self-hosted pageviews, custom events, and clicks.

The browser build is about 4 KB gzipped, has **no runtime dependencies**, and talks to a collector you host. A matching Node collector lives next to this package in the [Waypost repository](https://github.com/paulohenz/waypost) (`backend/`). Any endpoint that accepts the JSON batch below will do.

## Install

```bash
npm install waypost-analytics
```

The package ships three builds:

| Build | File | Use |
| --- | --- | --- |
| ESM | `dist/index.js` | `import { init, track } from 'waypost-analytics'` |
| CommonJS | `dist/index.cjs` | `require('waypost-analytics')` |
| Script tag | `dist/waypost.js` | `<script src=".../waypost.js">` |
| Types | `dist/index.d.ts` | TypeScript |

## Usage

```ts
import { init, track } from 'waypost-analytics';

init({
  endpoint: 'https://analytics.example.com/collect',
  siteId: 'marketing',
  autoClicks: true,
});

track('newsletter', { origem: 'rodape' });
```

`init` records a pageview immediately and again when the URL changes through the History API (`pushState`, `replaceState`, `popstate`) or `hashchange`. Call `track` for anything that is not a pageview.

### Script tag

Host `dist/waypost.js` yourself (or serve it from a CDN that can read the `unpkg` / `jsdelivr` entry). The snippet reads `data-*` attributes and starts on its own. After it loads, the global `waypost` exposes `init`, `track`, `flush`, and `shutdown`.

```html
<script
  src="/waypost.js"
  data-endpoint="https://analytics.example.com/collect"
  data-site="marketing"
  data-auto-clicks="true"
  defer
></script>
```

| Attribute | Default | Meaning |
| --- | --- | --- |
| `data-endpoint` | — | Collect URL. Required for auto-start. |
| `data-site` | — | Site id. Required for auto-start. |
| `data-token` | — | Ingest token, sent in the JSON body. |
| `data-auto-pageviews` | `true` | Set `false` to skip automatic pageviews. |
| `data-auto-clicks` | `false` | Set `true` to capture `[data-track]` and links. |
| `data-respect-dnt` | `true` | Set `false` to ignore Do Not Track and GPC. |
| `data-debug` | `false` | Log queue activity with `console.debug`. |
| `data-batch-size` | `10` | Flush after this many events (1–20). |
| `data-flush-interval` | `5000` | Flush interval in milliseconds. |

Boolean attributes accept `true`/`false`, `1`/`0`, `on`/`off`, and `yes`/`no`.

## API

### `init(options): { enabled: boolean }`

Starts tracking. Calling it again flushes the previous queue and replaces listeners. Visitor and session ids stay in storage.

`enabled` is `false` when Do Not Track or Global Privacy Control is on and `respectDoNotTrack` is left at its default. In that case nothing is stored and nothing is sent.

| Option | Default | Description |
| --- | --- | --- |
| `endpoint` | — | Required. Absolute or relative collect URL. |
| `siteId` | — | Required. 1–64 characters: letters, digits, `_`, `-`. |
| `token` | — | Optional shared secret. Placed in the JSON body because `sendBeacon` cannot set headers. |
| `autoPageviews` | `true` | Pageview on init and on SPA navigations. |
| `autoClicks` | `false` | `true` captures `[data-track]` and `<a href>`. An object can change that: `{ attribute: 'data-analytics', links: false }`. |
| `respectDoNotTrack` | `true` | Honor `navigator.doNotTrack` and `navigator.globalPrivacyControl`. |
| `batchSize` | `10` | Flush when the queue reaches this size. Clamped to 1–20. |
| `flushInterval` | `5000` | Also flush on this interval, in milliseconds. |
| `sessionTimeout` | `1800000` | Inactivity before a new session id. Minimum 1 second. |
| `debug` | `false` | `console.debug` the queue. |

Throws if `endpoint` or `siteId` is missing, or if `init` runs outside a browser.

### `track(eventName, props?)`

Queues a custom event. `props` keeps up to 25 JSON primitives (`string`, finite `number`, `boolean`, `null`). Strings are clipped to 200 characters. Nested objects, arrays, and non-finite numbers are dropped.

Calls made before `init` are kept (up to 20) and sent once tracking starts. They are discarded if `init` finds that the visitor has opted out.

### `flush()`

Sends the queued batch immediately.

### `shutdown()`

Flushes, removes listeners, and forgets in-memory state. Storage is left as-is.

## What gets sent

Events are batched into one JSON body and posted as `text/plain` so the request stays a [CORS-safelisted](https://developer.mozilla.org/docs/Web/HTTP/CORS) "simple request" (`sendBeacon` cannot add headers). The collector should `JSON.parse` the body regardless of content type.

```json
{
  "siteId": "marketing",
  "token": "only-when-configured",
  "events": [
    {
      "type": "pageview",
      "name": "pageview",
      "visitorId": "6f1c1a2e-3b4d-4e5f-8a90-1b2c3d4e5f60",
      "sessionId": "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d",
      "timestamp": 1760810400000,
      "url": "https://example.com/pricing?utm_source=news",
      "path": "/pricing",
      "referrer": "https://news.example/story",
      "title": "Pricing",
      "screenWidth": 1440,
      "screenHeight": 900,
      "language": "en-US",
      "utm": { "source": "news", "medium": "email" }
    }
  ]
}
```

`type` is `pageview`, `event`, or `click`. Click events use the `data-track` value as `name`, or `click` for a plain link, and put `tag`, `text`, `href`, and `id` in `props`.

UTM parameters (`utm_source`, `utm_medium`, `utm_campaign`, `utm_term`, `utm_content`) are captured on the first hit of a session and reused for later pageviews in that same tab. A new session starts a new attribution.

The queue also flushes when the page is hidden or unloaded.

## Clicks

Leave `autoClicks` off until you want them. When it is on:

- an element with `data-track="reservar"` records a click named `reservar` (the attribute name is configurable);
- an `<a href>` without that attribute records a click named `click`.

Clicks are observed in the capture phase, so `preventDefault` in your own handlers still leaves a record.

## Privacy

- The SDK does not set cookies and does not read them.
- The visitor id is a random UUID in `localStorage` under `waypost_vid`. It stays on the device.
- The session id lives in `sessionStorage` under `waypost_sid` (one per tab) and rotates after 30 minutes without an event. `waypost_utm` holds that session's first-touch campaign parameters.
- If storage is blocked, ids exist only in memory for the current page.
- With `respectDoNotTrack` (the default), a Do Not Track value of `1` / `yes`, or Global Privacy Control, disables tracking before any id is written.
- The payload has no IP address. A collector should not invent one on the server if you want the same guarantee.
- `sendBeacon` is allowed to attach cookies the browser already has for that origin. Prefer a dedicated host for the collector if the site sets its own cookies.
- Normal delivery uses `fetch` with `credentials: 'omit'` only when `sendBeacon` refuses the payload.

## License

[MIT](./LICENSE) © Paulo Henz
