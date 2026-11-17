# 0003 TDD with node:test

Status: accepted

## Context

The progression rules are the heart of the product, and a wrong rule silently gives a bad workout. The repo has no runtime dependencies and wants to keep it that way.

## Decision

- New logic and every bug fix start with a failing test.
- Tests use the built-in `node:test` and `node:assert`. No test framework is installed.
- Tests live next to the module as `*.test.js`.
- The UI is covered only by a small Playwright e2e (`npm run test:e2e`), which is slow and kept minimal.

## Consequences

- `npm test` is fast and needs nothing beyond Node.
- Logic must stay pure to be testable, which supports ADR 0001.
- UI regressions rely on the small e2e and on manual use.
