# 0005 Native ES modules without a build

Status: accepted

## Context

The app used to be concatenated into one `index.html` by a build step, mainly so GitHub Pages could publish it. The app is now served only from a home server (ADR 0007).

## Decision

Use native ES modules. `src/index.html` is hand-written and loads `src/app.js` with `<script type="module">`. There is no bundler and no build step. GitHub Pages is no longer a target.

## Consequences

- Edit a file and reload. Nothing to rebuild or commit as output.
- Browsers block modules on `file://`, so opening `src/index.html` from disk does not work. Use `npm start` or `npm run home`.
- `server.mjs` serves everything under `src/` (ADR 0008), so a new module needs no server change.
- No minification. The app is small enough that it does not matter.
