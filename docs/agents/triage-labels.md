# Triage Labels

The skills speak in terms of five canonical triage roles. This repo tracks issues as local markdown files (see `issue-tracker.md`) with two lines near the top of each file:

- `Status:` one of `To do`, `In progress`, `Done`
- `Triage:` the triage role while the ticket is open, or `Resolution:` once it is closed without being done

| Role in mattpocock/skills | In this repo                                | Meaning                                  |
| ------------------------- | ------------------------------------------- | ---------------------------------------- |
| `needs-triage`            | `Status: To do` + `Triage: needs review`    | Maintainer needs to evaluate this issue  |
| `needs-info`              | `Status: To do` + `Triage: waiting on Martin` | Waiting on Martin for more information |
| `ready-for-agent`         | `Status: To do` + `Triage: agent`           | Fully specified, ready for an AFK agent  |
| `ready-for-human`         | `Status: To do` + `Triage: Martin`          | Requires Martin to implement             |
| `wontfix`                 | `Status: Done` + `Resolution: won't fix`    | Will not be actioned                     |

Outside the triage roles:

- Claimed or being worked on: `Status: In progress` (keep the `Triage:` line).
- Implemented: `Status: Done` (remove the `Triage:` line).

When a skill mentions a role (e.g. "apply the AFK-ready triage label"), set the corresponding lines from this table.
