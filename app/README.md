# waypost-analytics

Privacy-friendly browser SDK for [Waypost](https://github.com/paulohenz/waypost): self-hosted pageviews, custom events, and clicks.

[![npm](https://img.shields.io/npm/v/waypost-analytics)](https://www.npmjs.com/package/waypost-analytics)
[![MIT license](https://img.shields.io/github/license/paulohenz/waypost)](https://github.com/paulohenz/waypost/blob/main/LICENSE)
[![CI](https://img.shields.io/github/actions/workflow/status/paulohenz/waypost/ci.yml?branch=main&label=CI)](https://github.com/paulohenz/waypost/actions/workflows/ci.yml)

`waypost-analytics@0.1.1` is published on npm by [plsh](https://www.npmjs.com/~plsh). The script is about 4 KB gzipped (about 10 KB minified), has no runtime dependencies, and posts to a collector you host. The matching Node collector lives in the [Waypost repository](https://github.com/paulohenz/waypost) under `backend/`. The Portuguese project guide is the [repository README](https://github.com/paulohenz/waypost#readme).

Any endpoint that accepts the JSON batch described below works with this SDK.

## Why

- Measurements stay on a server you run, with no third-party analytics account.
- The SDK works without cookies.
- Do Not Track and Global Privacy Control turn collection off.
- The script-tag build is about 4 KB gzipped and ships with no runtime dependencies.

## Quick start

### Install

```bash
npm install waypost-analytics
```

| Build | File | Use |
| --- | --- | --- |
| ESM | `dist/index.js` | `import { init, track } from 'waypost-analytics'` |
| CommonJS | `dist/index.cjs` | `require('waypost-analytics')` |
| Script tag | `dist/waypost.js` | `<script src=".../waypost.js">` |
| Types | `dist/index.d.ts` | TypeScript |

### `init`

```ts
import { init, track } from 'waypost-analytics';

init({
  endpoint: 'https://analytics.example.com/collect',
  siteId: 'demo',
  autoClicks: true,
});

track('newsletter', { origem: 'footer' });
```

`init` records a pageview immediately. `track` queues a custom event under the name you pass. CommonJS callers use `require('waypost-analytics')`.

### Script tag

Host `dist/waypost.js` yourself, or load the published file. The package `unpkg` and `jsdelivr` fields point at that build:

```html
<script
  src="https://unpkg.com/waypost-analytics@0.1.1/dist/waypost.js"
  data-endpoint="https://analytics.example.com/collect"
  data-site="demo"
  data-auto-clicks="true"
  defer
></script>
```

jsDelivr serves the same file at `https://cdn.jsdelivr.net/npm/waypost-analytics@0.1.1/dist/waypost.js`. With `data-endpoint` and `data-site`, the script calls `init` on its own. After it loads, `window.waypost` exposes `init`, `track`, `flush`, and `shutdown`.

| Attribute | Default | Meaning |
| --- | --- | --- |
| `data-endpoint` | — | Collect URL. Without it, the script does not start on its own. |
| `data-site` | — | Site id. Without it, the script does not start on its own. |
| `data-token` | — | Shared secret, sent as JSON `token`. |
| `data-auto-pageviews` | `true` | `false` skips automatic pageviews. |
| `data-auto-clicks` | `false` | `true` captures `[data-track]` and links. |
| `data-respect-dnt` | `true` | `false` ignores Do Not Track and Global Privacy Control. |
| `data-debug` | `false` | Log queue activity with `console.debug`. |
| `data-batch-size` | `10` | Flush after this many events (1–20). |
| `data-flush-interval` | `5000` | Flush interval in milliseconds. |

Boolean attributes accept `true`/`false`, `1`/`0`, `on`/`off`, and `yes`/`no`. The script tag does not set `sessionTimeout` or the object form of `autoClicks`; those belong to the module API.

## API

The module exports `init`, `track`, `flush`, and `shutdown`, plus the types `AnalyticsEvent`, `AutoClickOptions`, `EventType`, `InitResult`, `Primitive`, `UtmParams`, and `WaypostOptions`.

### `init(options): { enabled: boolean }`

Starts tracking. Calling it again flushes the previous queue, replaces listeners, and opens a new queue. Visitor and session ids stay in storage. With automatic pageviews, the current URL is queued again.

`enabled` is `false` when Do Not Track or Global Privacy Control is on and `respectDoNotTrack` is left at its default. Nothing is stored and nothing is sent.

`init` throws outside a browser, when `endpoint` is empty, and when `siteId` is not in the format below.

| Option | Default | Description |
| --- | --- | --- |
| `endpoint` | — | Absolute or relative URL of the collect `POST`. |
| `siteId` | — | 1–64 characters. Starts with a letter or digit; the rest may include letters, digits, `_`, and `-`. |
| `token` | — | Optional shared secret, placed in the JSON body. `sendBeacon` cannot set headers. |
| `autoPageviews` | `true` | Pageview on init and on SPA navigations. |
| `autoClicks` | `false` | `true` captures `[data-track]` and `<a href>`. An object can change that: `{ attribute: 'data-analytics', links: false }`. |
| `respectDoNotTrack` | `true` | Honor `navigator.doNotTrack` and `navigator.globalPrivacyControl`. |
| `batchSize` | `10` | Flush when the queue reaches this size. Clamped to 1–20. |
| `flushInterval` | `5000` | Also flush on this interval, in milliseconds. Clamped to 0–120000. |
| `sessionTimeout` | `1800000` | Inactivity before a new session id, in milliseconds. Minimum 1 second, maximum 24 hours. |
| `debug` | `false` | `console.debug` with the prefix `[waypost]`. |

### `track(eventName, props?)`

Queues a custom event (`type: "event"`). `props` keeps up to 25 JSON primitives (`string`, finite `number`, `boolean`, `null`). Strings are clipped to 200 characters and keys to 40. Nested objects, arrays, and non-finite numbers are dropped. A blank name is ignored. The name is trimmed and clipped to 120 characters.

Calls made before `init` are kept (up to 20) and sent once tracking starts. They are discarded when `init` finds that the visitor has opted out.

### `flush()`

Sends the queued batch immediately.

### `shutdown()`

Flushes, removes listeners, and forgets in-memory state. `localStorage` and `sessionStorage` are left as they are.

### Payload

Events are batched into one JSON body and posted as `text/plain;charset=UTF-8`, so the browser treats the `POST` as a [CORS-safelisted](https://developer.mozilla.org/docs/Web/HTTP/CORS) simple request. The collector parses JSON regardless of content type.

```json
{
  "siteId": "demo",
  "token": "local-token",
  "events": [
    {
      "type": "pageview",
      "name": "pageview",
      "visitorId": "6f1c1a2e-3b4d-4e5f-8a90-1b2c3d4e5f60",
      "sessionId": "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d",
      "timestamp": 1792346400000,
      "url": "https://example.com/notebooks?utm_source=news&utm_medium=email",
      "path": "/notebooks",
      "referrer": "https://news.example/story",
      "title": "Notebooks",
      "screenWidth": 1440,
      "screenHeight": 900,
      "language": "en-US",
      "utm": { "source": "news", "medium": "email" }
    }
  ]
}
```

`timestamp` is Unix epoch milliseconds. `1792346400000` is `2026-10-18T18:00:00.000Z`. The `token` field is present only when `init` was given one.

`type` is `pageview`, `event`, or `click`. A click uses the `data-track` value as `name`, or `click` for a plain link, and puts `tag`, `text`, `href`, and `id` in `props`.

`utm_source`, `utm_medium`, `utm_campaign`, `utm_term`, and `utm_content` are the session's attribution. The first set present on a URL is stored and reused for later events in that same tab. A later URL with different `utm_*` parameters leaves the stored set in place. Other query parameters, such as `gclid`, are ignored. A new session clears that attribution and reads the URL again.

The queue also flushes when the page becomes hidden (`visibilitychange`) or on `pagehide`. Delivery uses `navigator.sendBeacon`. When beacon is missing, throws, or returns `false`, the SDK uses `fetch` with `keepalive`, `mode: 'cors'`, and `credentials: 'omit'`. A network failure stays inside the SDK.

The SDK clips values before sending: URL and referrer to 2048 characters, path to 1024, title to 300, language to 35, and each UTM value to 200.

## Automatic tracking and clicks

With the default `autoPageviews`, the first pageview is recorded on `init`. Later pageviews follow `history.pushState`, `history.replaceState`, `popstate`, and `hashchange`. `path` is `pathname` plus the hash; an empty hash or a bare `#` is omitted. The same URL, including search and hash, is not recorded twice when the second change lands within 50 ms. The event `name` is `pageview`.

`autoClicks` is off until you turn it on. When it is `true` or an object:

- an element with `data-track="signup"` records a click named `signup` (the attribute name follows `attribute`);
- an `<a href>` without that attribute records a click named `click`, unless `links` is `false`;
- the listener uses `closest`, so a `<span>` inside a marked button counts as that button;
- when the marked element sits inside a link, the event stays on the marked element and `href` comes from the link;
- a button with no `data-track` that is not a link is ignored;
- the listener runs in the capture phase, so `preventDefault` in your own handler still leaves a record.

```html
<button id="cta" data-track="signup">Create account</button>
<a id="out" href="https://example.com/pricing">Pricing</a>
```

The button is sent as `type: "click"`, `name: "signup"`, and `props` with `tag: "button"`, `text: "Create account"`, and `id: "cta"`. The link is sent as `name: "click"`, `tag: "a"`, and the absolute `href`. Text is the element's content with whitespace collapsed, clipped to 80 characters.

The attribute name starts with a letter, `_`, or `:`, and continues with letters, digits, `_`, `.`, `:`, or `-`. Anything else makes `init` throw `TypeError`.

## Privacy

- The SDK does not write cookies and does not read `document.cookie`.
- The visitor id is a UUID in `localStorage` under `waypost_vid`. It stays on the device until that key is removed.
- The session id lives in `sessionStorage` under `waypost_sid`, as JSON `{ "id", "ts" }`, one per tab. Each event refreshes `ts`. After 30 minutes without an event (or the configured `sessionTimeout`), the next hit mints a new id.
- `waypost_utm`, also in `sessionStorage`, holds the session's stored UTM parameters. Rotating the session removes the key.
- When storage is blocked, ids exist only in memory for the current page.
- A Do Not Track value of `1` or `yes` (from `navigator.doNotTrack`, `navigator.msDoNotTrack`, or `window.doNotTrack`) and Global Privacy Control (`navigator.globalPrivacyControl === true`) disable tracking before any id is written. `init` returns `{ enabled: false }`.
- `respectDoNotTrack: false` keeps tracking while those signals are on.
- The payload has no IP address. The Waypost collector does not read or store one either.
- The `fetch` fallback sends `credentials: 'omit'`. `sendBeacon` may attach cookies the browser already has for the collector origin. A host used only for the collector keeps the site's own cookies off that request.

## Running the collector

The collector is not part of this npm package. Clone [paulohenz/waypost](https://github.com/paulohenz/waypost) and use Node.js 22 or newer. It stores events with the built-in `node:sqlite` module. On Node 22 the process prints `ExperimentalWarning: SQLite is an experimental feature`. The file it writes is ordinary SQLite.

```bash
git clone https://github.com/paulohenz/waypost.git
cd waypost
npm ci
npm run dev
```

`npm run dev` builds the SDK and serves the collector with reload. The log prints `http://127.0.0.1:3921` when `HOST` is `0.0.0.0` or `::`. The example page at that origin loads `/waypost.js`, measures the site `demo`, and reads that site's stats.

`npm start` builds everything and runs the collector under `node`, without watch. npm runs that process with `backend/` as the working directory, so the default database file is `backend/data/waypost.sqlite`. The collector reads `app/dist/waypost.js` on every `/waypost.js` request.

| Variable | Default | Use |
| --- | --- | --- |
| `PORT` | `3921` | HTTP port, from 1 to 65535. An invalid port stops the process. |
| `HOST` | `0.0.0.0` | Bind address. `0.0.0.0` listens on all IPv4 interfaces; the log prints `127.0.0.1` as the URL to open on the machine itself. |
| `DATABASE_PATH` | `data/waypost.sqlite` | SQLite file, relative to the working directory. `:memory:` keeps data for the life of the process. |
| `INGEST_TOKEN` | empty | When set, `POST /collect` requires the same `token` in the JSON body. |
| `DATABASE_URL` | — | A `postgres://` or `postgresql://` value stops the process at startup. This repository does not include a Postgres driver. |

The parent directory of the SQLite file is created on startup. File databases set `PRAGMA journal_mode = WAL`, so `*.sqlite-wal` and `*.sqlite-shm` appear beside the file. Storage goes through the `AnalyticsStore` interface in `backend/src/types.ts`. The included implementation is `createSqliteStore`.

### `POST /collect`

JSON body, as `text/plain` or `application/json`. At most 20 events and 64 KB. CORS answers with `Access-Control-Allow-Origin: *`, methods `GET`, `POST`, and `OPTIONS`, and the `Content-Type` header.

```bash
curl -i -X POST http://127.0.0.1:3921/collect \
  -H 'Content-Type: text/plain;charset=UTF-8' \
  -d '{"siteId":"demo","events":[{"type":"pageview","name":"pageview","visitorId":"6f1c1a2e-3b4d-4e5f-8a90-1b2c3d4e5f60","sessionId":"a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d","timestamp":1792346400000,"url":"https://example.com/notebooks","path":"/notebooks","referrer":"https://news.example/story","title":"Notebooks","screenWidth":1440,"screenHeight":900,"language":"en-US","utm":{"source":"news","medium":"email"}}]}'
```

Success:

```http
HTTP/1.1 204 No Content
access-control-allow-origin: *
```

The 204 body is empty. A timestamp outside the window — the last 30 days through 15 minutes ahead of the server clock — returns 400. The sample uses `2026-10-18T18:00:00.000Z`; on a distant date, put `Date.now()` in `timestamp`.

An empty batch:

```bash
curl -s -X POST http://127.0.0.1:3921/collect \
  -H 'Content-Type: text/plain' \
  -d '{"siteId":"demo","events":[]}'
```

```json
{ "error": "invalid_payload", "message": "events must be a non-empty array" }
```

| Status | `error` | When |
| --- | --- | --- |
| 204 | — | Batch stored. |
| 400 | `invalid_json` | Body is not JSON. Message: `Body must be JSON.` |
| 400 | `invalid_payload` | `siteId`, events, or fields are out of format. |
| 401 | `unauthorized` | `INGEST_TOKEN` is set and `token` is missing or different. Message: `Invalid ingest token.` |
| 405 | `method_not_allowed` | `GET /collect`. Message: `Use POST /collect.` |
| 413 | `payload_too_large` | Body larger than 64 KB. Message: `Request body is too large.` |
| 500 | `store_failed` | The write failed. The response omits the internal error. |

Each event needs `type` (`pageview`, `event`, or `click`), `name` (1–120 characters, no control characters), `visitorId` and `sessionId` (8–80 characters of letters, digits, `_`, and `-`), and a numeric `timestamp`. The SDK sends UUIDs. `props` accepts at most 25 keys, each up to 40 characters, with a string, finite number, boolean, or `null` (strings up to 200). The collector rejects the whole batch when `props` falls outside that; the SDK already clips and drops before sending. Unknown event fields are ignored. A referrer host is counted in stats only when it belongs to another site. The same origin and an unparseable referrer stay out of the ranking, while the raw referrer is still stored.

### `GET /health`

```bash
curl -s http://127.0.0.1:3921/health
```

```json
{ "ok": true }
```

`GET /` serves `example/index.html` when that file is found. `GET /waypost.js` serves the SDK build, or 503 when `app/dist/waypost.js` is missing. Unknown paths return 404 with `{ "error": "not_found", "message": "Not found." }`.

## Stats API

These routes take a `siteId` and a time range. With `from` and `to` omitted, the range is the last 30 days, ending at request time. `from` and `to` accept `YYYY-MM-DD` or an ISO-8601 timestamp. A date with no time is a UTC day: `from` starts at midnight, and `to` includes that whole day (the exclusive end is the next midnight). The range needs `from` earlier than `to` and a span of at most 366 days. `interval` is `hour` or `day` (default `day`). `limit` runs from 1 to 100 (default 10).

In the response, `from` and `to` are milliseconds. Day buckets use `YYYY-MM-DD`. Hour buckets use `YYYY-MM-DDTHH:00:00Z`. Buckets with no pageviews are left out of the list.

For `from=2026-10-01&to=2026-10-18`, after one pageview, one `signup` click, and one `newsletter` event on site `demo`:

`GET /stats/timeseries?siteId=demo&from=2026-10-01&to=2026-10-18&interval=day`

```json
{
  "siteId": "demo",
  "interval": "day",
  "from": 1790812800000,
  "to": 1792368000000,
  "points": [
    { "bucket": "2026-10-18", "pageviews": 1, "visitors": 1 }
  ],
  "totals": { "pageviews": 1, "visitors": 1 }
}
```

`totals.visitors` is the distinct count across the whole range. Summing `visitors` across buckets can run higher, because the same person appears on more than one day or hour. `pageviews` add up. With `interval=hour`, the bucket for this sample is `2026-10-18T18:00:00Z`.

`GET /stats/pages?siteId=demo&from=2026-10-01&to=2026-10-18&limit=10`

```json
{
  "siteId": "demo",
  "pages": [
    { "path": "/notebooks", "pageviews": 1, "visitors": 1 }
  ]
}
```

Only `pageview` events are included, ordered by pageviews and then by path.

`GET /stats/referrers?siteId=demo&from=2026-10-01&to=2026-10-18`

```json
{
  "siteId": "demo",
  "referrers": [
    { "host": "news.example", "visits": 1, "visitors": 1 }
  ]
}
```

`visits` is the number of pageviews with that external host.

`GET /stats/events?siteId=demo&from=2026-10-01&to=2026-10-18`

```json
{
  "siteId": "demo",
  "events": [
    { "name": "signup", "type": "click", "count": 1, "visitors": 1 },
    { "name": "newsletter", "type": "event", "count": 1, "visitors": 1 }
  ]
}
```

Pageviews are left out of this list. Each site is isolated by `siteId`.

A query with no `siteId`:

```json
{
  "error": "invalid_query",
  "message": "siteId is required and must match the collect format"
}
```

## Deploy

`npm ci` at the repository root installs the workspaces. `npm start` builds the SDK and the collector and listens on `PORT` / `HOST`. The process speaks HTTP. TLS belongs on the reverse proxy in front of it.

`/stats/*` answers any client that can reach the port. `INGEST_TOKEN` applies only to `POST /collect`, and the value travels in the JSON body because the beacon cannot send an authorization header. The example page at `/` also calls `/stats/*` from the browser, for the site `demo`.

The collector does not store an IP address. A proxy in front of it may keep its own access log; that log is outside Waypost's SQLite file.

## Contributing

Issues and pull requests go to [paulohenz/waypost](https://github.com/paulohenz/waypost/issues). See [CONTRIBUTING.md](https://github.com/paulohenz/waypost/blob/main/CONTRIBUTING.md).

[CI](https://github.com/paulohenz/waypost/actions/workflows/ci.yml) runs `npm ci`, `npm run typecheck`, `npm test`, and `npm run build` on Node 22 for every push and pull request. Release notes for this package are in [CHANGELOG.md](./CHANGELOG.md).

## License

[MIT](./LICENSE) © Paulo Henz
