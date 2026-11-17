# 0001 Functional core and storage adapter

Status: accepted

## Context

The app has real rules (progression, targets, schedule) and a lot of plumbing (screens, timer, storage). Mixing them made the rules hard to test and storage hard to change. Storage will change: today `localStorage` plus `/api/state`, later maybe backup files or sync.

## Decision

Use Gary Bernhardt's "Functional Core, Imperative Shell" together with ports and adapters:

- `src/domain/data.js` and `src/domain/videos.js` are plain data.
- `src/domain/logic.js` is the pure functional core. No DOM, no storage, no clock reads.
- `src/storage/storage.js` is the storage adapter. It owns the persisted shape and `schemaVersion`.
- `src/ui/views.js` builds HTML as pure functions.
- `src/app.js` is the imperative shell: events, timer, guided workout.

Dependencies point inward. `domain/` imports nothing from the shell.

## Consequences

- Rules are tested in Node with plain inputs and outputs.
- Storage can be swapped or extended without touching the rules.
- MVC and Clean Architecture were rejected: for one user and nine exercises, their extra layers (controllers, use cases, entities, presenters) add files without adding safety.
- The shell stays imperative on purpose. It is covered only by a small Playwright e2e.
