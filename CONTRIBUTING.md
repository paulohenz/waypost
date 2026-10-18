# Contributing to Waypost

Waypost is the SDK in `app/` (`waypost-analytics`) and the Node collector in `backend/`. Issues and pull requests go to [paulohenz/waypost](https://github.com/paulohenz/waypost/issues).

## Setup

You need Node.js 22 or newer. The collector uses the built-in `node:sqlite` module.

```bash
npm install
npm test
npm run typecheck
npm run dev
```

`npm run dev` builds the SDK and serves the example page at http://127.0.0.1:3921. After you change the SDK while the server is already running, rebuild it with `npm run build -w waypost-analytics` and reload the page.

## What to change where

- Browser behavior, the public `init` / `track` API, and the script-tag build live in `app/src`. Keep the package free of runtime dependencies.
- The collect endpoint, validation, and stats queries live in `backend/src`. New storage engines should implement `AnalyticsStore` in `backend/src/types.ts` instead of leaking a driver into the HTTP layer.
- The Portuguese project guide is the root `README.md`. The English npm guide is `app/README.md`. Update both when the public API or the local run steps change.

## Tests

Add or adjust a unit test for the behavior you change. SDK tests are in `app/test` (Vitest, happy-dom). Collector tests are in `backend/test`.

Before opening a pull request:

```bash
npm run typecheck
npm test
npm run build
```

GitHub Actions runs those three commands, after `npm ci`, on every push and pull request.

## Pull requests

- Keep the change focused. A bug fix and a new feature belong in separate pull requests.
- Describe the behavior a user would notice, not only the files you touched.
- Do not publish the npm package from a fork or a pull request. Publishing `waypost-analytics` is a maintainer step from `app/` after `npm pack --dry-run`.

## License

By contributing, you agree that your work is licensed under the [MIT License](LICENSE), copyright Paulo Henz.
