/* The guided workout as a pure module driven by events (ADR 0012).
   start(state, now) builds a workout that carries everything it needs, so it never reads the live state again.
   advance(workout, event, now) returns { workout, sounds, finished }: the next workout, the sound cues to play
   ('tick', 'go', 'chime') and, only when this event ended the workout, the finished result.
   readout(workout, now) gives the screen its time math and progress.
   Times are absolute clock times in ms (restEnd, warmEnd, holdStart), so a locked screen loses nothing. */
import {
  SIDE_SWITCH_SECS,
  isoDate,
  isActive,
  prescribe,
  restSeconds,
  buildSteps,
  warmupItems,
  setResult,
  finishWorkout,
} from './logic.js';
import { SLOT_ORDER } from './data.js';

/* Drafts saved with another version are not offered for resume. */
export const WORKOUT_VERSION = 2;

const COUNTDOWN_SECS = 3;
const REST_ADD_SECS = 15;

export function start(state, now) {
  const logged = {};
  for (const slot of SLOT_ORDER.filter((s) => isActive(state, s))) {
    const p = prescribe(state, slot);
    logged[slot] = {
      levelId: p.level.id,
      level: p.level,
      sets: [],
      targets: p.targets,
      rest: restSeconds(state, slot),
    };
  }
  return {
    v: WORKOUT_VERSION,
    startedAt: now,
    phase: 'warmup',
    warmup: warmupItems(state),
    warmed: {},
    warmI: 0,
    warmEnd: 0,
    warmTotal: 0,
    steps: buildSteps(state),
    i: 0,
    levels: JSON.parse(JSON.stringify(state.levels)),
    logged,
    skipped: [],
    value: null,
    side: 0,
    right: null,
    restEnd: 0,
    restTotal: 0,
    holdStart: null,
    holdTotal: 0,
    pausedAt: null,
    cue: null,
  };
}

/* ---------- helpers on a workout being changed (w is always a private copy) ---------- */

const clockOf = (w, now) => w.pausedAt || now;
const curStep = (w) => w.steps[w.i];
const target = (w) => {
  const st = curStep(w);
  return w.logged[st.slot].targets[st.set - 1];
};
function nextIndex(w, from) {
  for (let i = from; i < w.steps.length; i++) if (!w.skipped.includes(w.steps[i].slot)) return i;
  return -1;
}

/* Plays a countdown cue once per key: n > 0 is a tick, 0 is go. */
function cue(w, out, key, n) {
  if (w.cue === key) return;
  w.cue = key;
  out.sounds.push(n > 0 ? 'tick' : 'go');
}

function setDefault(w) {
  w.value = target(w);
  w.holdStart = null;
  w.side = 0;
  w.right = null;
}

/* Holds start on their own: lead = seconds of countdown before (0 when the rest just counted 3, 2, 1). */
function autoStartHold(w, now, lead) {
  w.holdTotal = Math.max(1, w.value || 0);
  w.holdStart = now + lead * 1000;
  w.cue = lead ? null : 'h' + w.i + ':go';
}

function goSet(w, out, now, idx, lead = COUNTDOWN_SECS) {
  w.pausedAt = null;
  w.i = idx;
  w.phase = 'set';
  setDefault(w);
  if (w.logged[curStep(w).slot].level.kind === 'hold') autoStartHold(w, now, lead);
}

function finish(w, out, now) {
  const dur = Math.round((now - w.startedAt) / 1000);
  const warmDone = Object.keys(w.warmed).filter((k) => w.warmed[k]).length;
  const r = finishWorkout(
    { levels: w.levels },
    { startedAt: w.startedAt, logged: w.logged, warmDone },
    isoDate(new Date(now)),
    dur
  );
  w.phase = 'summary';
  w.pausedAt = null;
  w.restEnd = 0;
  w.warmEnd = 0;
  w.holdStart = null;
  out.finished = { ...r, durationSec: dur };
}

function goNextSet(w, out, now, lead) {
  const n = nextIndex(w, w.i + 1);
  if (n >= 0) goSet(w, out, now, n, lead);
  else finish(w, out, now);
}

function begin(w, out, now) {
  const n = nextIndex(w, 0);
  if (n < 0) finish(w, out, now);
  else goSet(w, out, now, n);
}

function logSet(w, out, now) {
  w.pausedAt = null;
  const st = curStep(w),
    L = w.logged[st.slot];
  L.sets[st.set - 1] = w.value;
  if (nextIndex(w, w.i + 1) < 0) {
    finish(w, out, now);
    return;
  }
  w.phase = 'rest';
  w.restTotal = L.rest;
  w.restEnd = now + L.rest * 1000;
  w.holdStart = null;
}

function log(w, out, now, hit) {
  const L = w.logged[curStep(w).slot],
    lvl = L.level;
  w.value = setResult(lvl, target(w), hit);
  out.sounds.push('chime');
  if (lvl.perSide) {
    if (!w.side) {
      w.right = w.value;
      w.side = 1;
      w.value = target(w);
      w.holdStart = null;
      if (lvl.kind === 'hold') autoStartHold(w, now, SIDE_SWITCH_SECS);
      return;
    }
    w.value = Math.min(w.right == null ? w.value : w.right, w.value);
  }
  logSet(w, out, now);
}

function back(w) {
  w.pausedAt = null;
  const from = w.phase === 'rest' ? w.i : w.i - 1;
  let p = -1;
  for (let k = from; k >= 0; k--)
    if (!w.skipped.includes(w.steps[k].slot)) {
      p = k;
      break;
    }
  if (p < 0) {
    w.phase = 'warmup';
    w.warmI = Math.max(0, w.warmup.length - 1);
    w.warmEnd = 0;
    w.holdStart = null;
    return;
  }
  const ps = w.steps[p],
    L = w.logged[ps.slot],
    prev = L.sets[ps.set - 1];
  L.sets.length = Math.min(L.sets.length, ps.set - 1);
  w.i = p;
  w.phase = 'set';
  setDefault(w);
  if (prev != null) w.value = prev;
}

function startWarmTimer(w, now, it) {
  w.warmEnd = now + (it.secs + COUNTDOWN_SECS) * 1000;
  w.warmTotal = it.secs;
  w.cue = null;
}

function warmGo(w, out, now, d) {
  w.pausedAt = null;
  const i = w.warmI + d;
  w.warmEnd = 0;
  if (i >= w.warmup.length) {
    begin(w, out, now);
    return;
  }
  w.warmI = Math.max(0, i);
  const nx = w.warmup[w.warmI];
  if (d > 0 && nx && nx.secs) startWarmTimer(w, now, nx);
}

function warmNext(w, out, now) {
  const it = w.warmup[w.warmI];
  if (it) w.warmed[it.id] = true;
  out.sounds.push('chime');
  warmGo(w, out, now, 1);
}

const warmGoal = (w) => w.warmTotal || w.warmup[w.warmI].secs;

/* The time only changes after the 3, 2, 1, and never to a goal below what has already passed. */
function warmAdjust(w, now, d) {
  if (!w.warmEnd) return;
  const g = warmGoal(w),
    el = g - (w.warmEnd - clockOf(w, now)) / 1000;
  if (el < 0) return;
  const ng = Math.max(5, g + d);
  if (ng <= el + 1) return;
  w.warmEnd += (ng - g) * 1000;
  w.warmTotal = ng;
}

function pause(w, now) {
  if (!w.pausedAt) {
    w.pausedAt = now;
    return;
  }
  const delta = now - w.pausedAt;
  if (w.restEnd) w.restEnd += delta;
  if (w.warmEnd) w.warmEnd += delta;
  if (w.holdStart) w.holdStart += delta;
  w.pausedAt = null;
  w.cue = null;
}

function changeLevel(w, ev) {
  const { slot, prescription, idx } = ev;
  w.logged[slot] = {
    ...w.logged[slot],
    levelId: prescription.level.id,
    level: prescription.level,
    sets: [],
    targets: prescription.targets,
  };
  if (w.levels[slot]) w.levels[slot] = { ...w.levels[slot], idx };
  if (w.phase === 'set' && curStep(w).slot === slot) setDefault(w);
}

/* Countdown cues for a timer: before the start (3, 2, 1), the start (go) and the last 3 s of a long timer. */
function timerCues(w, out, prefix, total, elapsed) {
  if (elapsed < 0) {
    if (elapsed >= -COUNTDOWN_SECS) cue(w, out, prefix + Math.ceil(-elapsed), Math.ceil(-elapsed));
  } else if (elapsed < 1) cue(w, out, prefix + 'go', 0);
  else if (total - elapsed <= 3 && total - elapsed > 0 && total > 6)
    cue(w, out, prefix + 'e' + Math.ceil(total - elapsed), 1);
}

function tick(w, out, now) {
  if (w.pausedAt) return;
  if (w.phase === 'rest') {
    const rem = (w.restEnd - now) / 1000;
    if (rem > 0 && rem <= 3) cue(w, out, 'r' + w.i + ':' + Math.ceil(rem), Math.ceil(rem));
    if (rem <= 0) {
      w.cue = null;
      out.sounds.push('go');
      goNextSet(w, out, now, 0);
    }
  } else if (w.phase === 'warmup' && w.warmEnd > 0) {
    const g = warmGoal(w),
      el = g - (w.warmEnd - now) / 1000;
    timerCues(w, out, 'w' + w.warmI + ':', g, el);
    if (el >= g) {
      w.cue = null;
      warmNext(w, out, now);
    }
  } else if (w.phase === 'set' && w.holdStart) {
    const g = w.holdTotal || target(w),
      el = (now - w.holdStart) / 1000;
    timerCues(w, out, 'h' + w.i + ':', g, el);
    if (el >= g) {
      w.cue = null;
      log(w, out, now, true);
    }
  }
}

const HANDLERS = {
  begin: (w, out, now) => begin(w, out, now),
  hit: (w, out, now) => log(w, out, now, true),
  miss: (w, out, now) => log(w, out, now, false),
  skip: (w, out, now) => {
    w.skipped.push(curStep(w).slot);
    goNextSet(w, out, now);
  },
  back: (w) => back(w),
  holdStart: (w, out, now) => {
    w.holdTotal = Math.max(1, w.value || 0);
    w.holdStart = now + COUNTDOWN_SECS * 1000;
    w.cue = null;
  },
  pause: (w, out, now) => pause(w, now),
  restAdd: (w) => {
    w.restEnd += REST_ADD_SECS * 1000;
    w.restTotal += REST_ADD_SECS;
  },
  restSkip: (w, out, now) => goNextSet(w, out, now),
  warmNext: (w, out, now) => warmNext(w, out, now),
  warmSkip: (w, out, now) => warmGo(w, out, now, 1),
  warmBack: (w, out, now) => warmGo(w, out, now, -1),
  warmTimer: (w, out, now) => {
    const it = w.warmup[w.warmI];
    if (it && it.secs) startWarmTimer(w, now, it);
  },
  warmAdjust: (w, out, now, ev) => warmAdjust(w, now, ev.d),
  warmSwap: (w, out, now, ev) => {
    w.warmup = ev.warmup;
    w.warmI = Math.min(w.warmI, w.warmup.length - 1);
  },
  changeLevel: (w, out, now, ev) => changeLevel(w, ev),
  finish: (w, out, now) => finish(w, out, now),
  tick: (w, out, now) => tick(w, out, now),
};

export function advance(workout, event, now) {
  const out = { sounds: [], finished: undefined };
  const h = HANDLERS[event.type];
  if (!h || workout.phase === 'summary') return { workout, ...out };
  const w = JSON.parse(JSON.stringify(workout));
  h(w, out, now, event);
  return { workout: w, sounds: out.sounds, finished: out.finished };
}

/* Everything the screen and the timer loop need to show the clock and the progress bar.
   remaining and total are seconds; countdown is the 3, 2, 1 digit before a timer starts (0 otherwise);
   next is the step index shown during rest (-1 when none is left). */
export function readout(w, now) {
  const clock = clockOf(w, now);
  const wn = w.warmup.length,
    totalUnits = wn + w.steps.length;
  let done;
  if (w.phase === 'summary') done = totalUnits;
  else if (w.phase === 'warmup') done = Math.min(w.warmI, wn);
  else done = wn + w.i + (w.phase === 'rest' ? 1 : 0);
  const out = {
    phase: w.phase,
    remaining: null,
    total: null,
    countdown: 0,
    progress: { done, total: totalUnits },
    next: w.phase === 'rest' ? nextIndex(w, w.i + 1) : -1,
  };
  const timed = (total, elapsed) => {
    out.total = total;
    out.remaining = total - elapsed;
    out.countdown = elapsed < 0 ? Math.ceil(-elapsed) : 0;
  };
  if (w.phase === 'rest') {
    out.total = w.restTotal;
    out.remaining = (w.restEnd - clock) / 1000;
  } else if (w.phase === 'warmup' && w.warmEnd > 0) {
    const g = warmGoal(w);
    timed(g, g - (w.warmEnd - clock) / 1000);
  } else if (w.phase === 'set' && w.holdStart) {
    timed(w.holdTotal || target(w), (clock - w.holdStart) / 1000);
  }
  return out;
}
