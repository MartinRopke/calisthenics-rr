/* Sound module: plays the workout's sound cues ('tick', 'go', 'chime') behind one call per sound.
   It keeps one AudioContext alive across screen locks: iOS leaves the context "interrupted" (or even "closed")
   after the screen locks, so anything that is not "running" is resumed, and a closed one is replaced.
   Sounds share one queue so chimes never overlap, but a countdown beep (tick, go) has to be heard exactly when
   the number changes, so it never waits. AudioContextClass and vibrate are injected so tests can fake them. */
const MAX_WAIT = 1.2;
const GAP = 0.04;

/* Each cue: its length in the queue, whether it plays on time, and its tones [freq, start, duration, volume]. */
const CUES = {
  tick: { len: 0.14, onTime: true, tones: [[660, 0, 0.12, 0.25]] },
  go: { len: 0.47, onTime: true, tones: [[1175, 0, 0.45, 0.3]], vibrate: 120 },
  chime: {
    len: 0.56,
    onTime: false,
    tones: [
      [660, 0, 0.14, 0.2],
      [880, 0.12, 0.14, 0.2],
      [1320, 0.24, 0.3, 0.2],
    ],
  },
};

export function createSounds({ AudioContextClass, vibrate } = {}) {
  let ctx = null;
  let busyUntil = 0;

  function wake() {
    if (!AudioContextClass) return null;
    try {
      if (!ctx || ctx.state === 'closed') ctx = new AudioContextClass();
      if (ctx.state !== 'running') {
        const p = ctx.resume();
        if (p && p.catch) p.catch(() => {});
      }
    } catch {
      /* sound is optional: a failure here must never break the workout */
    }
    return ctx;
  }

  function tone(c, at, [freq, t, dur, vol]) {
    const o = c.createOscillator(),
      g = c.createGain(),
      start = at + t;
    o.frequency.value = freq;
    o.connect(g);
    g.connect(c.destination);
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(vol, start + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    o.start(start);
    o.stop(start + dur + 0.02);
  }

  function play(name) {
    const cue = CUES[name];
    if (!cue) return;
    if (cue.vibrate && vibrate) {
      try {
        vibrate(cue.vibrate);
      } catch {
        /* optional feature, ignoring failure is fine */
      }
    }
    try {
      const c = wake();
      if (!c || !c.createOscillator) return;
      const now = c.currentTime;
      let offset = 0;
      if (cue.onTime) busyUntil = Math.max(busyUntil, now + cue.len + GAP);
      else {
        offset = Math.max(0, busyUntil - now);
        if (offset > MAX_WAIT) return; /* too late: discard */
        busyUntil = now + offset + cue.len + GAP;
      }
      for (const t of cue.tones) tone(c, now + offset, t);
    } catch {
      /* optional feature, ignoring failure is fine */
    }
  }

  return { play, wake, state: () => (ctx ? ctx.state : null) };
}
