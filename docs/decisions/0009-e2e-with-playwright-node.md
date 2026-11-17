# 0009 End-to-end tests with Playwright for Node

Status: accepted

## Context

Unit tests cannot catch broken module imports, 404s on served files or regressions in click handlers. Only a real browser running the app against the real server can. The first e2e scripts used Playwright for Python, which added a second toolchain (pip, a virtual environment) to a project that is otherwise only Node.

## Decision

- E2E tests use the `playwright` library from npm as a devDependency, pinned by `package-lock.json`.
- The runner is the built-in `node:test` with `node:assert/strict`, consistent with ADR 0003. `@playwright/test` is not used.
- Files are named `e2e/*.e2e.js`, so the default `node --test` glob of `npm test` does not pick them up. `npm run test:e2e` runs them one at a time.
- `e2e/helpers.js` starts `server.mjs` on a free port with a temporary `DATA_DIR`, launches Chromium and collects console and page errors.
- The Chromium binary is installed once with `npm run e2e:install`. It lives in the user cache, not in the repo.

## Consequences

- One toolchain: `npm install` plus one browser download.
- `npm test` stays fast and browser-free.
- The e2e takes under a minute, because it waits on real timers. It is kept small.
