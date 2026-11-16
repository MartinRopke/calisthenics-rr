# 0007 Home server on the LAN

Status: accepted

## Context

One user, on iPhone and Mac. The history must survive across devices and should not depend on a paid service. YouTube embeds need http on localhost or https.

## Decision

The Mac is the server. `server.mjs` serves the app and `/api/state`, and writes the history to `data/treino.json` (with a backup copy), which git ignores. `npm run home` runs it with `caffeinate` so the Mac stays awake. The iPhone opens it over the same Wi-Fi. It costs nothing.

Tailscale for access outside home is deferred.

## Consequences

- Works only on the home Wi-Fi, and only while the Mac is on.
- Anyone on the same network can read and change the data, so use trusted networks only.
- Embedded videos over plain http by IP may fail (error 153) and are untested.
- Backup and remote access are future work (see the README).
