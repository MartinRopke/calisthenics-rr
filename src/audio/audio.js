// Audio adapter: keeps one AudioContext alive across screen locks.
// iOS leaves the context "interrupted" (or even "closed") after the screen locks, so anything that is not
// "running" is resumed, and a closed one is replaced. AudioContextClass is injected so tests can fake it.
export function createAudio(AudioContextClass) {
  let ctx = null;
  return {
    ensureRunning() {
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
    },
    get context() {
      return ctx;
    },
  };
}
