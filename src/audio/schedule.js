// Decides when a sound plays. Sounds share one queue so chimes never overlap each other, but a countdown
// beep (3, 2, 1, go) has to be heard exactly when the number changes, so it never waits in the queue.
// Returns { offset, busyUntil } (offset = seconds from now), or null when a queued sound is too late to play.
const MAX_WAIT = 1.2;
const GAP = 0.04;

export function scheduleSfx({ now, busyUntil, len, onTime = false }) {
  if (onTime) return { offset: 0, busyUntil: Math.max(busyUntil, now + len + GAP) };
  const offset = Math.max(0, busyUntil - now);
  if (offset > MAX_WAIT) return null;
  return { offset, busyUntil: now + offset + len + GAP };
}
