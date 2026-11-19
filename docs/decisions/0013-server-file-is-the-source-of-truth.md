# 0013 The server file is the source of truth for the history

Status: accepted

## Context

On load the app merged the history in the browser (`localStorage`) with the history in `data/treino.json` and kept every session from both. A session deleted in one browser was still in another browser's copy, so the next load there brought it back and saved it to the file again. This gets worse once the app is used from the iPhone over the home server while the Mac browser keeps its own copy.

## Decision

- `src/storage/storage.js` is a history store with a small interface: `load(defaults)`, `save(state)`, `status()`, `onStatus(fn)` and the three draft calls. The file and browser adapters are internal.
- When the file answers on load, it replaces the browser copy. The browser copy wins only while it is marked unsynced, and it is then sent to the file and kept. A file that was never written (no `sessions` array) also takes the browser copy.
- When the file does not answer, the browser copy is used and the status says so. Saves made then mark the browser copy unsynced, so they reach the file on the next load that finds it.
- The unsynced flag lives in its own `localStorage` key (`treinoRR.unsynced`), outside the saved state. The file never contains it and `schemaVersion` does not change. A successful save to the file clears it, a failed one sets it.
- `save` always writes the browser copy first. Saves to the file run one at a time, and when several pile up only the newest is sent next.
- The status is a code (`loading`, `file`, `file-error`, `local`). The Settings view turns it into a sentence.
- Backup import stays additive (`mergeBackup`): sessions are added by id and sorted by date, settings and known levels come from the backup.

## Consequences

- A deleted workout stays deleted in every browser that can reach the file.
- Two browsers that both save while the file is unreachable are not merged: the first one to load against the file again wins, and the other one's unsynced copy then overwrites it. There are no tombstones and no device sync beyond this rule.
- The file is not retried during a session after it was unreachable at load.
