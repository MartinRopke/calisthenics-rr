# 0010 Tests in a top-level test/ folder

Status: accepted

## Context

ADR 0003 and ADR 0008 put each unit test next to its module as `*.test.js`. The server serves `src/`, so those tests sat in the folder that ships to the browser. That needed a special 404 rule in `server.mjs` for `*.test.js` and mixed test code into the shipped files.

## Decision

- All tests live in `test/`, and `src/` holds only what ships to the browser.
- `test/unit/` mirrors `src/` (`domain/`, `storage/`, `ui/`) and has one `*.test.js` per module.
- `test/server/` holds `server.test.js`.
- `test/e2e/` holds the Playwright scripts and `helpers.js` (`*.e2e.js`).
- `npm test` runs `test/unit` and `test/server` only. `npm run test:e2e` runs `test/e2e`.
- The `*.test.js` rule is removed from `server.mjs`.

## Consequences

- `src/` has no test code, and the server needs no rule about tests.
- `/test/...` and every other repo file are unreachable, because the server only resolves paths under `src/`. `server.test.js` probes this.
- Trade-off: a `*.test.js` file placed inside `src/` would now be served. The rule is simply that tests never go there.
- Test imports use longer relative paths such as `../../../src/domain/logic.js`.
- Supersedes the colocation sentence in ADR 0003 and ADR 0008.
