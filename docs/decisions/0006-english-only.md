# 0006 English-only repository

Status: accepted

## Context

Code, docs and commits were mixed Portuguese and English. The app interface was already English at the owner's request. Mixed languages make code harder to search and to hand to tools.

## Decision

Everything in the repository is English: code, comments, identifiers, commit messages, docs, ADRs and visible app text. Personal notes for the assistant live in the unversioned `CLAUDE.local.md`. Prose uses hyphens only in compound words, never dashes to separate sentences.

## Consequences

- One language to search and review.
- Older Portuguese leftovers are translated when found.
- Training content keeps the guide's English exercise names.
