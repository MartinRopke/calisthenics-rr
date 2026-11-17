# calisthenics-rr

Workout web app for the Recommended Routine (RR) of r/bodyweightfitness. It guides the day's workout, applies progression automatically and keeps the history. Built for one user, on iPhone and Mac.

## Commands

```
npm install        # once, for ESLint, Prettier and Playwright (dev only)
npm start          # local server at http://localhost:8000
npm run home       # same, reachable from the iPhone, Mac stays awake
npm test           # unit and server tests (node:test)
npm run lint       # ESLint
npm run format     # Prettier, rewrites files
npm run format:check
npm run e2e:install # once, downloads Chromium for Playwright (user cache, not the repo)
npm run test:e2e   # Playwright (Node) in test/e2e/, small UI check
npm run guide      # regenerates docs/rr-guide.md from src/domain/data.js
npm run wiki       # saves original guide pages into reference/
```

Opening `src/index.html` from disk does not work, because browsers block ES modules on `file://`. Use `npm start`.

## Progression rule

Starts at 3x5, adds 1 rep per set each workout up to 3x8, then moves to the next level at 3x5. Isometrics go from 10 to 30 s.

## Home use

Use the app on your iPhone while the Mac serves it over the home Wi-Fi.

1. On the Mac, run `npm run home`. The server prints the local URL and the network URLs.
2. On the iPhone, on the same Wi-Fi, open `http://<ip>:8000` (or `http://<mac-name>.local:8000`) in Safari.
3. Tap Share, then Add to Home Screen.

Notes:

- Anyone on the same Wi-Fi can reach the app and read or change the history. Use it only on a network you trust. Set `HOST=127.0.0.1` to go back to local-only access.
- Reserve the Mac's IP address in the router, so the URL does not change.
- The Mac must stay awake. `npm run home` uses `caffeinate` to prevent idle sleep while the server runs.
- YouTube videos over plain http by IP address are untested and may fail with error 153.

## Architecture and conventions

### Layers

| Path                                            | Role                                                                         |
| ----------------------------------------------- | ---------------------------------------------------------------------------- |
| `src/domain/data.js`, `src/domain/videos.js`    | Plain data: exercises, ladders, warmup, videos.                              |
| `src/domain/logic.js`                           | Functional core. Pure functions, every progression rule. No DOM, no storage. |
| `src/storage/storage.js`                        | Storage adapter: `localStorage` and `/api/state`, with a `schemaVersion`.    |
| `src/ui/views.js`                               | Builds HTML strings as pure functions.                                       |
| `src/app.js`, `src/index.html`, `src/style.css` | Imperative shell: events, timer, guided workout. Wires the layers together.  |
| `server.mjs`                                    | Serves `src/` and `/api/state`. Zero dependencies.                           |
| `test/unit/`, `test/server/`, `test/e2e/`       | All tests: unit (mirrors `src/`), server and Playwright (`*.e2e.js`).        |

`src/` holds only what ships to the browser. Tests live in `test/`, and `test/unit/` mirrors the `src/` folders (`*.test.js`).

Dependency rule: dependencies point inward. `app.js` may use everything, `ui/` and `storage/` may use `domain/`, and `domain/` never touches the DOM or storage.

### Code style

- Modern JavaScript: `const` and `let`, arrow functions, native ES modules.
- No bundler and no build step. `src/index.html` loads `src/app.js` as a module.
- English only: code, comments, docs, commits and app text.
- Formatted by Prettier, checked by ESLint. Both are devDependencies only.

### TDD

New logic and every bug fix start with a failing test. Tests use `node:test` with no test dependencies and live in `test/`, mirroring `src/` (for example `test/unit/domain/logic.test.js`). The UI is covered only by the small Playwright e2e.

### Decisions

Each structural decision has an ADR in [docs/decisions](docs/decisions/README.md):

- [0001 Functional core and storage adapter](docs/decisions/0001-functional-core-and-storage-adapter.md)
- [0002 Modern JavaScript replaces ES5](docs/decisions/0002-modern-javascript.md)
- [0003 TDD with node:test](docs/decisions/0003-tdd-with-node-test.md)
- [0004 ESLint and Prettier as devDependencies only](docs/decisions/0004-eslint-and-prettier.md)
- [0005 Native ES modules without a build](docs/decisions/0005-native-es-modules-no-build.md)
- [0006 English-only repository](docs/decisions/0006-english-only.md)
- [0007 Home server on the LAN](docs/decisions/0007-home-server-on-the-lan.md)
- [0008 Source layout under src/](docs/decisions/0008-source-layout.md)
- [0009 End-to-end tests with Playwright for Node](docs/decisions/0009-e2e-with-playwright-node.md)
- [0010 Tests in a top-level test/ folder](docs/decisions/0010-tests-in-test-folder.md)

## Future ideas

The layers are meant to allow these without rewrites:

- JSON backup and export to iCloud Drive through the share sheet.
- PWA install and offline use.
- Sync between devices.
- Tailscale access from outside home.
