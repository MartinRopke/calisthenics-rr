# 0002 Modern JavaScript replaces ES5

Status: accepted

## Context

The code started in ES5 style (`var`, `function`) because it was first bundled into one file and shipped to old targets. The only runtimes now are current Safari on iPhone and current Chrome or Safari on Mac.

## Decision

Write modern JavaScript: `const` and `let`, arrow functions, template strings, native ES modules. ESLint enforces `no-var` and `prefer-const`. Older files are migrated one at a time, when touched.

## Consequences

- Shorter, safer code with block scoping.
- No transpiler is needed, because the target browsers support the syntax.
- Some ES5 code may remain until its file is migrated.
