/* Pure app logic: levels, targets, progression, workout order and counts.
   Nothing here touches the DOM, so it can be tested in Node. */

/* Countdown before the second side of a one-sided hold, to change position. */
export const SIDE_SWITCH_SECS = 15;

export function pad2(n) {
  return n < 10 ? '0' + n : '' + n;
}
export function isoDate(d) {
  d = d || new Date();
  return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
}
export function parseISO(s) {
  const p = s.split('-');
  return new Date(Date.UTC(+p[0], +p[1] - 1, +p[2]));
}
export function dayDiff(a, b) {
  return Math.round((parseISO(a) - parseISO(b)) / 86400000);
}
export function weekStartISO(s) {
  const d = parseISO(s);
  const dow = (d.getUTCDay() + 6) % 7; /* Monday = 0 */
  d.setUTCDate(d.getUTCDate() - dow);
  return d.getUTCFullYear() + '-' + pad2(d.getUTCMonth() + 1) + '-' + pad2(d.getUTCDate());
}

export function defaultState(D) {
  const levels = {};
  Object.keys(D.LADDERS).forEach(function (slot) {
    levels[slot] = { path: D.LADDERS[slot].defaultPath, idx: D.START_LEVELS[slot] || 0 };
  });
  return {
    v: 1,
    settings: { hasBar: false, hasDip: false, restMain: 90, restCore: 60 },
    levels: levels,
    sessions: [],
  };
}

export function ladderOf(D, state, slot) {
  const L = state.levels[slot];
  const path = D.LADDERS[slot].paths[L.path] || D.LADDERS[slot].paths[D.LADDERS[slot].defaultPath];
  return path.levels;
}
export function currentLevel(D, state, slot) {
  const lad = ladderOf(D, state, slot);
  const idx = Math.max(0, Math.min(lad.length - 1, state.levels[slot].idx));
  return lad[idx];
}
export function isActive(D, state, slot) {
  if (D.SLOTS[slot].needsBar && !state.settings.hasBar) return false;
  if (D.SLOTS[slot].needsDip && !state.settings.hasDip) return false;
  return true;
}

/* Last session in which this exercise was done at this level, with at least one set. */
export function lastEntry(state, slot, levelId) {
  let best = null;
  for (let i = 0; i < state.sessions.length; i++) {
    const e = state.sessions[i].entries && state.sessions[i].entries[slot];
    if (!e || e.levelId !== levelId || !e.sets || !e.sets.length) continue;
    if (!best || state.sessions[i].date >= best.date)
      best = { date: state.sessions[i].date, entry: e };
  }
  return best;
}

export function clamp(x, lo, hi) {
  return Math.max(lo, Math.min(hi, x));
}

/* Target for each of the 3 sets.
   First time at the level: everything at the minimum. After that the next target depends only on the previous
   targets and on whether they were all hit: if so, each goes up one step (1 rep, or 5 s for holds), capped at the
   top of the range; otherwise the same targets repeat. Doing more or less than a target never changes its value.
   Old entries saved without targets fall back to what was done. */
export function targetsFor(level, last) {
  const n = 3,
    out = [];
  let i;
  if (!last) {
    for (i = 0; i < n; i++) out.push(level.lo);
    return out;
  }
  const e = last.entry;
  let clean = e.sets.length >= n;
  for (i = 0; i < Math.min(n, e.sets.length); i++) {
    if (e.targets && e.sets[i] < e.targets[i]) clean = false;
  }
  for (i = 0; i < n; i++) {
    const base =
      e.targets && e.targets[i] != null ? e.targets[i] : i < e.sets.length ? e.sets[i] : level.lo;
    out.push(clamp(clean ? base + level.step : base, level.lo, level.hi));
  }
  return out;
}

/* What to store for one set. The workout only asks "did you hit the target?", so a hit stores the target and a
   miss stores one step below it, which keeps `sets` numeric for the history and for the "all targets hit" check. */
export function setResult(level, target, hit) {
  return hit ? target : Math.max(0, target - level.step);
}

export function prescribe(D, state, slot) {
  const level = currentLevel(D, state, slot);
  const last = lastEntry(state, slot, level.id);
  return { slot: slot, level: level, targets: targetsFor(level, last), first: !last, last: last };
}

export function mastered(level, sets) {
  if (!sets || sets.length < 3) return false;
  for (let i = 0; i < sets.length; i++) if (sets[i] < level.hi) return false;
  return true;
}

/* Workout steps: the warmup is left out. Each group alternates its exercises, set by set. */
export function buildSteps(D, state) {
  const steps = [];
  function group(slots, kind) {
    const act = slots.filter(function (s) {
      return isActive(D, state, s);
    });
    for (let set = 1; set <= 3; set++)
      act.forEach(function (s) {
        steps.push({ slot: s, set: set, group: kind });
      });
  }
  D.PAIRS.forEach(function (p, i) {
    group(p, 'p' + (i + 1));
  });
  group(D.CORE, 'core');
  return steps;
}

export function restSeconds(D, state, slot) {
  return D.SLOTS[slot].core ? state.settings.restCore : state.settings.restMain;
}

export function warmupItems(D, state) {
  const alt = (state.settings && state.settings.warmAlt) || {};
  const items = D.WARMUP.map(function (w) {
    const a = (w.alts || []).filter(function (x) {
      return x.id === alt[w.id];
    })[0];
    if (!a) return w;
    const y = {};
    Object.keys(a).forEach(function (k) {
      y[k] = a[k];
    });
    y.base = w.id;
    y.fromGuide = false;
    return y;
  });
  D.WARMUP_EXTRAS.forEach(function (x) {
    if (!(isActive(D, state, x.slot) && state.levels[x.slot].idx >= x.minIdx)) return;
    if (!x.prevLevel) {
      items.push(x);
      return;
    }
    const p = ladderOf(D, state, x.slot)[state.levels[x.slot].idx - 1];
    if (!p) return;
    const y = {};
    Object.keys(x).forEach(function (k) {
      y[k] = x[k];
    });
    y.name = p.name;
    y.q = p.q;
    y.how = ["This is the step before today's", 'Do it with clean technique, without rushing'];
    items.push(y);
  });
  return items;
}

/* Finishes the workout: builds the session, applies level promotions and returns both.
   W.logged[slot] = { levelId, path, sets, targets }. */
export function finishWorkout(D, state, W, date, durationSec) {
  const entries = {},
    promotions = [];
  Object.keys(W.logged).forEach(function (slot) {
    const l = W.logged[slot];
    if (!l.sets || !l.sets.length) return;
    const lad = ladderOf(D, state, slot);
    let idx = -1;
    for (let i = 0; i < lad.length; i++) if (lad[i].id === l.levelId) idx = i;
    if (idx < 0) return;
    const level = lad[idx];
    const e = {
      levelId: level.id,
      name: level.name,
      kind: level.kind,
      perSide: level.perSide,
      sets: l.sets.slice(),
      targets: l.targets.slice(),
    };
    if (mastered(level, e.sets) && idx < lad.length - 1) {
      e.promotedTo = lad[idx + 1].name;
      state.levels[slot].idx = idx + 1;
      promotions.push({ slot: slot, from: level.name, to: lad[idx + 1].name });
    }
    entries[slot] = e;
  });
  const session = {
    id: 's' + date + '-' + (W.startedAt || Date.now()),
    date: date,
    durationSec: durationSec || 0,
    entries: entries,
    warmup: W.warmDone || 0,
  };
  state.sessions.push(session);
  state.sessions.sort(function (a, b) {
    return a.date < b.date ? -1 : a.date > b.date ? 1 : a.id < b.id ? -1 : 1;
  });
  return { session: session, promotions: promotions };
}

export function weeklyCounts(sessions, nWeeks, todayStr) {
  const start = weekStartISO(todayStr);
  const weeks = [];
  for (let i = nWeeks - 1; i >= 0; i--) {
    const d = parseISO(start);
    d.setUTCDate(d.getUTCDate() - 7 * i);
    weeks.push({
      start: d.getUTCFullYear() + '-' + pad2(d.getUTCMonth() + 1) + '-' + pad2(d.getUTCDate()),
      n: 0,
    });
  }
  sessions.forEach(function (s) {
    const ws = weekStartISO(s.date);
    for (let j = 0; j < weeks.length; j++) if (weeks[j].start === ws) weeks[j].n++;
  });
  return weeks;
}

/* Metric series per session for an exercise: total reps or seconds. */
/* Last `nWeeks` weeks, oldest first, each with its 7 days (Monday to Sunday). A day counts once however many
   workouts it had. `goalMet` is true at `goal` workout days in the week. */
export function weekCalendar(sessions, nWeeks, todayStr, goal) {
  const trained = new Set(sessions.map((s) => s.date));
  const thisWeek = weekStartISO(todayStr);
  return weeklyCounts([], nWeeks, todayStr).map((w) => {
    const days = [];
    for (let i = 0; i < 7; i++) {
      const p = parseISO(w.start);
      p.setUTCDate(p.getUTCDate() + i);
      const date =
        p.getUTCFullYear() + '-' + pad2(p.getUTCMonth() + 1) + '-' + pad2(p.getUTCDate());
      days.push({
        date: date,
        trained: trained.has(date),
        state: date < todayStr ? 'past' : date === todayStr ? 'today' : 'future',
      });
    }
    const n = days.filter((d) => d.trained).length;
    return { start: w.start, days: days, n: n, goalMet: n >= goal, current: w.start === thisWeek };
  });
}

/* Weeks in a row that met the goal, counted back from the latest. The current week never breaks the streak
   while it is unfinished, and adds to it once it meets the goal. */
export function weekStreak(weeks) {
  let streak = 0;
  for (let i = weeks.length - 1; i >= 0; i--) {
    if (weeks[i].goalMet) streak++;
    else if (!weeks[i].current) break;
  }
  return streak;
}

export function seriesFor(state, slot) {
  const out = [];
  state.sessions.forEach(function (s) {
    const e = s.entries && s.entries[slot];
    if (!e || !e.sets || !e.sets.length) return;
    let tot = 0;
    e.sets.forEach(function (x) {
      tot += x;
    });
    out.push({
      date: s.date,
      total: tot,
      sets: e.sets,
      name: e.name,
      kind: e.kind,
      promoted: !!e.promotedTo,
      promotedTo: e.promotedTo || '',
    });
  });
  return out;
}

/* Day hint: follows Mon, Wed and Fri, with at least one day between workouts. */
export function scheduleHint(sessions, todayStr) {
  let last = null;
  sessions.forEach(function (s) {
    if (!last || s.date > last) last = s.date;
  });
  const dow = (parseISO(todayStr).getUTCDay() + 6) % 7; /* seg = 0 */
  const gap = last ? dayDiff(todayStr, last) : null;
  if (gap === 0) return { kind: 'done', text: 'You already trained today.' };
  if (gap === 1)
    return {
      kind: 'rest',
      text: 'You trained yesterday. The guide asks for at least one day between workouts.',
    };
  if (dow === 0 || dow === 2 || dow === 4)
    return { kind: 'go', text: 'Today is a full routine day.' };
  return {
    kind: 'off',
    text: 'Today is a skill, mobility or rest day. You can still train if you want.',
  };
}

/* Upcoming workouts (Monday, Wednesday and Friday) if you hit all targets. Simulates on a copy of the state, without touching the real one.
   If today is a workout day and it is not done yet, it is simulated first and does not appear in the list (it is already in "Today's workout"). */
export function projectWorkouts(D, state, todayStr, count) {
  const st = JSON.parse(JSON.stringify(state)),
    out = [];
  let day = todayStr,
    guard = 0,
    k = 0;
  const doneToday = st.sessions.some(function (x) {
    return x.date === todayStr;
  });
  function dow(d) {
    return (parseISO(d).getUTCDay() + 6) % 7;
  }
  function nextDay(d) {
    const p = parseISO(d);
    p.setUTCDate(p.getUTCDate() + 1);
    return p.getUTCFullYear() + '-' + pad2(p.getUTCMonth() + 1) + '-' + pad2(p.getUTCDate());
  }
  const todayPlanned = !doneToday && dow(todayStr) % 2 === 0 && dow(todayStr) <= 4;
  /* What the workout before looked like, per exercise. Each projected item is compared with it. */
  let before = {};
  D.SLOT_ORDER.filter(function (sl) {
    return isActive(D, st, sl);
  }).forEach(function (sl) {
    const p = prescribe(D, st, sl);
    before[sl] = { levelId: p.level.id, name: p.level.name, targets: p.targets.slice() };
  });
  while (out.length < count && guard++ < 60) {
    const isFirst = day === todayStr;
    if (!isFirst || todayPlanned) {
      if (dow(day) % 2 === 0 && dow(day) <= 4) {
        const items = [],
          logged = {},
          warm = warmupItems(D, st);
        D.SLOT_ORDER.filter(function (sl) {
          return isActive(D, st, sl);
        }).forEach(function (sl) {
          const p = prescribe(D, st, sl);
          logged[sl] = { levelId: p.level.id, sets: p.targets.slice(), targets: p.targets.slice() };
          items.push({
            slot: sl,
            name: p.level.name,
            kind: p.level.kind,
            targets: p.targets.slice(),
            levelId: p.level.id,
            levelIdx: st.levels[sl].idx,
          });
        });
        const now = {};
        items.forEach(function (it) {
          const pv = before[it.slot];
          it.prev = pv ? { name: pv.name, targets: pv.targets.slice() } : null;
          it.change = !pv
            ? null
            : pv.levelId !== it.levelId
              ? 'level'
              : pv.targets.join() !== it.targets.join()
                ? 'targets'
                : null;
          now[it.slot] = { levelId: it.levelId, name: it.name, targets: it.targets.slice() };
        });
        before = now;
        const r = finishWorkout(D, st, { startedAt: ++k, logged: logged }, day, 0);
        r.promotions.forEach(function (pr) {
          items.forEach(function (it) {
            if (it.slot === pr.slot) it.promotedTo = pr.to;
          });
        });
        if (!isFirst) out.push({ date: day, items: items, warm: warm });
      }
    }
    day = nextDay(day);
  }
  return out;
}

export function sessionSummaryText(entry) {
  const unit = entry.kind === 'hold' ? ' s' : '';
  return entry.sets.join(' · ') + unit;
}
