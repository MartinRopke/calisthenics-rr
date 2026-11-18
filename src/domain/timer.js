/* Pause and resume for the workout timers. Each timer stores an absolute clock time (restEnd, warmEnd, holdStart),
   so pausing only needs to remember when it started; on resume every running timer moves forward by the pause. */
const FIELDS = ['restEnd', 'warmEnd', 'holdStart'];

export function resumeTimers(timers, pausedAt, now) {
  const delta = now - pausedAt;
  const out = { ...timers };
  for (const f of FIELDS) if (out[f]) out[f] += delta;
  return out;
}
