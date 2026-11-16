# 0004 ESLint and Prettier as devDependencies only

Status: accepted

## Context

Consistent style and basic bug checks help, especially when several agents edit the code. The shipped app must still have no external dependencies.

## Decision

Use ESLint (flat config in `eslint.config.mjs`) and Prettier (`.prettierrc`) as `devDependencies` only. Nothing from `node_modules` is served or imported by the app or by the tests. `npm run lint` checks, `npm run format` rewrites, `npm run format:check` verifies.

## Consequences

- The app and `server.mjs` keep zero runtime dependencies.
- Running lint and format needs `npm install` once.
- ESLint handles correctness and Prettier handles formatting, with `eslint-config-prettier` to avoid conflicts.
