# calisthenics-rr

Workout web app for the Recommended Routine (RR) of r/bodyweightfitness. It guides the day's workout, applies progression automatically and keeps the history. A single user (Martin), used on iPhone and Mac. The whole interface is in English, at Martin's request.

## Commands

- No build step. `src/index.html` is hand-written and loads `src/app.js` as a native ES module.
- `npm start`: local server (`server.mjs`) at http://localhost:8000. It serves only the `src/` folder (a new file there needs no server change) and stores the history in `data/treino.json` (override the folder with `DATA_DIR`), which git ignores.
- `npm run home`: same server, reachable from the iPhone over Wi-Fi, with `caffeinate` (see README).
- `npm test`: unit and server tests in `test/unit` and `test/server` with `node:test` (no browser). Always run before committing.
- `npm run lint` and `npm run format`: ESLint and Prettier (`npm run format:check` only verifies). Run both before committing.
- `npm run guide`: regenerates `docs/rr-guide.md` from `src/domain/data.js`. Run after changing ladders, cues or the warmup.
- `npm run wiki`: guides Martin through saving the original guide pages into `reference/` (outside git). Reddit blocks automatic downloads, so only he can run it.
- `npm run e2e:install`: once, downloads the Chromium binary for Playwright into the user cache (outside the repo).
- `npm run test:e2e`: screen tests in `test/e2e/*.e2e.js` with Playwright for Node and `node:test`. They start `server.mjs` on a free port with a temporary `DATA_DIR` and save screenshots in `shots/`, which git ignores.
- Opening `src/index.html` from disk does not work (browsers block ES modules on `file://`). Use `npm start`.

## Structure

Read README.md "Architecture and conventions" and `docs/decisions/` before structural changes. Record structural decisions as a new ADR in `docs/decisions/`.

- `src/domain/data.js`, `src/domain/videos.js`: plain data. `data.js` has the 9 exercises (`SLOTS`), ladders (`LADDERS`, with alternative paths), workout order (`PAIRS`, `CORE`), `START_LEVELS` and the warmup (`WARMUP`, `WARMUP_EXTRAS`). `videos.js` has one YouTube video per level and per warmup item.
- `src/domain/logic.js`: pure functional core, no DOM, no storage. Every progression rule lives here.
- `src/storage/storage.js`: storage adapter with `schemaVersion`.
- `src/ui/views.js`: pure HTML builders.
- `src/app.js`: imperative shell with events, timer and the guided workout. Clicks go through `data-act` and the `H` object.
- `src/index.html`, `src/style.css`: page and light and dark theme.
- `server.mjs`: serves `src/` and `/api/state`.
- `test/`: all tests, none inside `src/`. `test/unit/` mirrors `src/` (`domain/`, `storage/`, `ui/`), `test/server/` tests `server.mjs`, `test/e2e/` holds the Playwright scripts. ADR 0008 explains the layout and ADR 0010 the test folder.
- Dependencies point inward. `domain/` never touches the DOM or storage.
- With `npm start`, the app uses `/api/state` (history in `data/treino.json`, with a copy in `treino.bak.json`) plus `localStorage` (key `treinoRR.v1`, draft in `treinoRR.draft`). The code still has a path for the Claude artifacts `db`, which can be removed.

## Product rules (do not change without asking)

- Full body 3 times a week (Monday, Wednesday and Friday), with at least one day between workouts.
- Workout order: warmup, three strength pairs (pull-up and squat, dip and hinge, row and push-up) with 3 sets and 90 s of rest, and the core trio (anti-extension, anti-rotation, extension) with 3 sets and 60 s.
- Strength progression: starts at 3x5, adds 1 rep per set each workout up to 3x8, and then moves to the next level at 3x5. Core goes from 8 to 12 reps.
- Isometrics go from 10 to 30 s, in steps of 5 s, and move up a level on reaching 30 s on all 3 sets. The dip page asks for 1 min, and we use 30 s.
- Unilateral exercise: one side plus the other count as one set.
- Target rule (`targetsFor` and `prescribe`): the first time at a level, all sets start at the minimum. If all sets hit the target, each goes up one step, capped at the maximum. Otherwise, repeat the last one.
- Pull-up only enters the workout with `settings.hasBar` on ("I have a pull-up bar" in Settings). Martin does not have the bar yet.
- The warmup has one screen per item, with no choices. The extras come in on their own according to level.
- The starting levels are in `START_LEVELS` and came from Martin's training plan. Changing them changes his workout, so agree first.

## Videos and content

- The key in `src/domain/videos.js` is the level id, or `w.<id>` for the warmup. The test requires a video for every level.
- To replace a video: find the new one on YouTube, check that it allows embedding (the URL `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=ID&format=json` answers 200) and fill in `id`, `t` (title) and `c` (channel).
- The execution cues are paraphrases of the r/bodyweightfitness wiki. Do not copy text, GIFs or images from the wiki into the repository, which is public.
- `docs/rr-guide.md` is the reference for the RR guide in our own words, with the link to each original page. Check it before changing ladders or rules. Do not edit it by hand: it is generated by `npm run guide`.
- `reference/` is the folder where Martin keeps the original pages he saved for personal use. Git ignores this folder. If it exists, you may read it to check details, but never copy its contents into versioned files.

## Conventions

- The repository is English-only: code, comments, commit messages, docs and every visible text of the app. A private, unversioned file `CLAUDE.local.md` holds Martin's personal notes for the assistant and is not part of the repository.
- Modern JavaScript: `const`/`let`, arrow functions, native ES modules. Migrate older `var`/`function` code when touching a file.
- New logic and bug fixes start with a failing test (TDD), in a `*.test.js` under `test/unit/`, mirroring the module's path in `src/`.
- Every visible text of the app (screens, buttons, execution cues, warnings) uses short sentences and imperative verbs on buttons ("Set done", "Skip"). Exercise names follow the guide's name (Pull-up, Hinge, Copenhagen plank).
- An exercise that needs equipment shows "Needs: ..." with a dumbbell icon (Lucide, ISC license, inlined in `src/app.js` as `ICON_EQUIP`) and the options (the level's `equip` field, in `src/domain/data.js`). Without equipment, the field is empty and nothing shows.
- Mobile first (390 px wide), touch targets of at least 44 px.
- No external dependencies besides the Archivo font and the YouTube videos.
- The full plan is in the document "Plano de treino RR" in Claude Docs. If you change ladders or starting levels, tell Martin to update the document.
- Do not use dashes (`--`, em dash, en dash) to separate sentences in prose. Hyphens only in compound words.

## Known pending items

- Visual redesign (colors), requested by Martin.
- No offline mode or PWA install (missing manifest and service worker).
- No backup or export of the history.
- The rest beeps may not play with the screen locked. Time is computed by clock time, so the timer is not lost.
- Never tested on a real iPhone.
