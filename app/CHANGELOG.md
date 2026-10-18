# Changelog

All notable changes to `waypost-analytics` are documented in this file.
The package follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## 0.1.0 — 2026-10-18

- Initial release.
- `init`, `track`, `flush`, and `shutdown` for pageviews, custom events, and optional click capture.
- Anonymous visitor id (`localStorage`) and session id (`sessionStorage`). No cookies.
- Automatic pageviews, including `history.pushState`, `replaceState`, `popstate`, and `hashchange`.
- Batched delivery with `navigator.sendBeacon` and a `fetch` fallback.
- ESM, CommonJS, and script-tag (IIFE) builds, plus TypeScript declarations.
