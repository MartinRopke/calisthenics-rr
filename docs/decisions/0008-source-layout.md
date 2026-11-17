# 0008 Source layout under src/

Status: accepted

## Context

All app files, tests, e2e scripts and configs sat together in the repository root. The layers from ADR 0001 were only visible in the file names. The server kept a per-file allowlist, so every new module needed a server edit, and the list was the only thing keeping repo files such as `package.json` from being served.

## Decision

Put the app in `src/` with one folder per layer: `domain/` (data, videos, logic), `storage/` (adapter) and `ui/` (views), plus `app.js`, `index.html` and `style.css` at the top of `src/`. Each test sits next to its module as `*.test.js`. The Playwright scripts move to `e2e/`. (Superseded by [0010](0010-tests-in-test-folder.md): all tests now live in `test/`.) The server, scripts, docs and configs stay at the root.

`server.mjs` serves files under `src/` only. It resolves each path and refuses anything outside `src/`, answers only GET and HEAD, never lists directories and returns 404 for `*.test.js` (rule removed by [0010](0010-tests-in-test-folder.md)). `server.test.js` checks this.

## Consequences

- The folders mirror ADR 0001, so a wrong-way import is easy to spot.
- A new module under `src/` works without touching the server.
- `package.json`, `data/`, `.git` and the tests cannot be reached over the LAN.
- Imports use relative paths such as `../domain/logic.js`. Moving a file means fixing them.
