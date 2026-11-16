/* Pure app logic: levels, targets, progression, workout order and counts.
   Nothing here touches the DOM, so it can be tested in Node. */

function pad2(n) { return n < 10 ? '0' + n : '' + n; }
function isoDate(d) { d = d || new Date(); return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); }
function parseISO(s) { var p = s.split('-'); return new Date(Date.UTC(+p[0], +p[1] - 1, +p[2])); }
function dayDiff(a, b) { return Math.round((parseISO(a) - parseISO(b)) / 86400000); }
function weekStartISO(s) {
  var d = parseISO(s);
  var dow = (d.getUTCDay() + 6) % 7; /* segunda = 0 */
  d.setUTCDate(d.getUTCDate() - dow);
  return d.getUTCFullYear() + '-' + pad2(d.getUTCMonth() + 1) + '-' + pad2(d.getUTCDate());
}

function defaultState(D) {
  var levels = {};
  Object.keys(D.LADDERS).forEach(function (slot) {
    levels[slot] = { path: D.LADDERS[slot].defaultPath, idx: D.START_LEVELS[slot] || 0 };
  });
  return { v: 1, settings: { hasBar: false, hasDip: false, restMain: 90, restCore: 60 }, levels: levels, sessions: [] };
}

function ladderOf(D, state, slot) {
  var L = state.levels[slot];
  var path = D.LADDERS[slot].paths[L.path] || D.LADDERS[slot].paths[D.LADDERS[slot].defaultPath];
  return path.levels;
}
function currentLevel(D, state, slot) {
  var lad = ladderOf(D, state, slot);
  var idx = Math.max(0, Math.min(lad.length - 1, state.levels[slot].idx));
  return lad[idx];
}
function isActive(D, state, slot) {
  if (D.SLOTS[slot].needsBar && !state.settings.hasBar) return false;
  if (D.SLOTS[slot].needsDip && !state.settings.hasDip) return false;
  return true;
}

/* Last session in which this exercise was done at this level, with at least one set. */
function lastEntry(state, slot, levelId) {
  var best = null;
  for (var i = 0; i < state.sessions.length; i++) {
    var e = state.sessions[i].entries && state.sessions[i].entries[slot];
    if (!e || e.levelId !== levelId || !e.sets || !e.sets.length) continue;
    if (!best || state.sessions[i].date >= best.date) best = { date: state.sessions[i].date, entry: e };
  }
  return best;
}

function clamp(x, lo, hi) { return Math.max(lo, Math.min(hi, x)); }

/* Target for each of the 3 sets.
   First time at the level: everything at the minimum. After that: if all targets were hit, each set goes up one step
   (1 rep, or 5 s for holds); otherwise repeat what was done. Never goes past the top of the range. */
function targetsFor(level, last) {
  var n = 3, out = [], i;
  if (!last) { for (i = 0; i < n; i++) out.push(level.lo); return out; }
  var e = last.entry, clean = e.sets.length >= n;
  for (i = 0; i < Math.min(n, e.sets.length); i++) {
    if (e.targets && e.sets[i] < e.targets[i]) clean = false;
  }
  for (i = 0; i < n; i++) {
    var base = i < e.sets.length ? e.sets[i] : (e.targets && e.targets[i] != null ? e.targets[i] : level.lo);
    out.push(clamp(clean ? base + level.step : base, level.lo, level.hi));
  }
  return out;
}

function prescribe(D, state, slot) {
  var level = currentLevel(D, state, slot);
  var last = lastEntry(state, slot, level.id);
  return { slot: slot, level: level, targets: targetsFor(level, last), first: !last, last: last };
}

function mastered(level, sets) {
  if (!sets || sets.length < 3) return false;
  for (var i = 0; i < sets.length; i++) if (sets[i] < level.hi) return false;
  return true;
}

/* Workout steps: the warmup is left out. Each group alternates its exercises, set by set. */
function buildSteps(D, state) {
  var steps = [];
  function group(slots, kind) {
    var act = slots.filter(function (s) { return isActive(D, state, s); });
    for (var set = 1; set <= 3; set++) act.forEach(function (s) { steps.push({ slot: s, set: set, group: kind }); });
  }
  D.PAIRS.forEach(function (p, i) { group(p, 'p' + (i + 1)); });
  group(D.CORE, 'core');
  return steps;
}

function restSeconds(D, state, slot) {
  return D.SLOTS[slot].core ? state.settings.restCore : state.settings.restMain;
}

function warmupItems(D, state) {
  var alt = (state.settings && state.settings.warmAlt) || {};
  var items = D.WARMUP.map(function (w) {
    var a = (w.alts || []).filter(function (x) { return x.id === alt[w.id]; })[0];
    if (!a) return w;
    var y = {}; Object.keys(a).forEach(function (k) { y[k] = a[k]; }); y.base = w.id; y.fromGuide = false;
    return y;
  });
  D.WARMUP_EXTRAS.forEach(function (x) {
    if (!(isActive(D, state, x.slot) && state.levels[x.slot].idx >= x.minIdx)) return;
    if (!x.prevLevel) { items.push(x); return; }
    var p = ladderOf(D, state, x.slot)[state.levels[x.slot].idx - 1];
    if (!p) return;
    var y = {}; Object.keys(x).forEach(function (k) { y[k] = x[k]; });
    y.name = p.name; y.q = p.q; y.how = ['This is the step before today\'s', 'Do it with clean technique, without rushing'];
    items.push(y);
  });
  return items;
}

/* Finishes the workout: builds the session, applies level promotions and returns both.
   W.logged[slot] = { levelId, path, sets, targets }. */
function finishWorkout(D, state, W, date, durationSec) {
  var entries = {}, promotions = [];
  Object.keys(W.logged).forEach(function (slot) {
    var l = W.logged[slot];
    if (!l.sets || !l.sets.length) return;
    var lad = ladderOf(D, state, slot);
    var idx = -1;
    for (var i = 0; i < lad.length; i++) if (lad[i].id === l.levelId) idx = i;
    if (idx < 0) return;
    var level = lad[idx];
    var e = { levelId: level.id, name: level.name, kind: level.kind, perSide: level.perSide, sets: l.sets.slice(), targets: l.targets.slice() };
    if (mastered(level, e.sets) && idx < lad.length - 1) {
      e.promotedTo = lad[idx + 1].name;
      state.levels[slot].idx = idx + 1;
      promotions.push({ slot: slot, from: level.name, to: lad[idx + 1].name });
    }
    entries[slot] = e;
  });
  var session = {
    id: 's' + date + '-' + (W.startedAt || Date.now()),
    date: date, durationSec: durationSec || 0, entries: entries,
    warmup: W.warmDone || 0
  };
  state.sessions.push(session);
  state.sessions.sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : (a.id < b.id ? -1 : 1); });
  return { session: session, promotions: promotions };
}

function weeklyCounts(sessions, nWeeks, todayStr) {
  var start = weekStartISO(todayStr);
  var weeks = [];
  for (var i = nWeeks - 1; i >= 0; i--) {
    var d = parseISO(start); d.setUTCDate(d.getUTCDate() - 7 * i);
    weeks.push({ start: d.getUTCFullYear() + '-' + pad2(d.getUTCMonth() + 1) + '-' + pad2(d.getUTCDate()), n: 0 });
  }
  sessions.forEach(function (s) {
    var ws = weekStartISO(s.date);
    for (var j = 0; j < weeks.length; j++) if (weeks[j].start === ws) weeks[j].n++;
  });
  return weeks;
}

/* Metric series per session for an exercise: total reps or seconds. */
function seriesFor(state, slot) {
  var out = [];
  state.sessions.forEach(function (s) {
    var e = s.entries && s.entries[slot];
    if (!e || !e.sets || !e.sets.length) return;
    var tot = 0; e.sets.forEach(function (x) { tot += x; });
    out.push({ date: s.date, total: tot, sets: e.sets, name: e.name, kind: e.kind, promoted: !!e.promotedTo, promotedTo: e.promotedTo || '' });
  });
  return out;
}

/* Day hint: follows Mon, Wed and Fri, with at least one day between workouts. */
function scheduleHint(sessions, todayStr) {
  var last = null;
  sessions.forEach(function (s) { if (!last || s.date > last) last = s.date; });
  var dow = (parseISO(todayStr).getUTCDay() + 6) % 7; /* seg = 0 */
  var gap = last ? dayDiff(todayStr, last) : null;
  if (gap === 0) return { kind: 'done', text: 'You already trained today.' };
  if (gap === 1) return { kind: 'rest', text: 'You trained yesterday. The guide asks for at least one day between workouts.' };
  if (dow === 0 || dow === 2 || dow === 4) return { kind: 'go', text: 'Today is a full routine day.' };
  return { kind: 'off', text: 'Today is a skill, mobility or rest day. You can still train if you want.' };
}

/* Upcoming workouts (Monday, Wednesday and Friday) if you hit all targets. Simulates on a copy of the state, without touching the real one.
   If today is a workout day and it is not done yet, it is simulated first and does not appear in the list (it is already in "Today's workout"). */
function projectWorkouts(D, state, todayStr, count) {
  var st = JSON.parse(JSON.stringify(state)), out = [], day = todayStr, guard = 0, k = 0;
  var doneToday = st.sessions.some(function (x) { return x.date === todayStr; });
  function dow(d) { return (parseISO(d).getUTCDay() + 6) % 7; }
  function nextDay(d) { var p = parseISO(d); p.setUTCDate(p.getUTCDate() + 1); return p.getUTCFullYear() + '-' + pad2(p.getUTCMonth() + 1) + '-' + pad2(p.getUTCDate()); }
  var todayPlanned = !doneToday && dow(todayStr) % 2 === 0 && dow(todayStr) <= 4;
  while (out.length < count && guard++ < 60) {
    var isFirst = day === todayStr;
    if (!isFirst || todayPlanned) {
      if (dow(day) % 2 === 0 && dow(day) <= 4) {
        var items = [], logged = {}, warm = warmupItems(D, st);
        D.SLOT_ORDER.filter(function (sl) { return isActive(D, st, sl); }).forEach(function (sl) {
          var p = prescribe(D, st, sl);
          logged[sl] = { levelId: p.level.id, sets: p.targets.slice(), targets: p.targets.slice() };
          items.push({ slot: sl, name: p.level.name, kind: p.level.kind, targets: p.targets.slice(), levelId: p.level.id, levelIdx: st.levels[sl].idx });
        });
        var r = finishWorkout(D, st, { startedAt: ++k, logged: logged }, day, 0);
        r.promotions.forEach(function (pr) { items.forEach(function (it) { if (it.slot === pr.slot) it.promotedTo = pr.to; }); });
        if (!isFirst) out.push({ date: day, items: items, warm: warm });
      }
    }
    day = nextDay(day);
  }
  return out;
}

function sessionSummaryText(entry) {
  var unit = entry.kind === 'hold' ? ' s' : '';
  return entry.sets.join(' · ') + unit;
}

if (typeof module !== 'undefined') module.exports = {
  isoDate: isoDate, parseISO: parseISO, dayDiff: dayDiff, weekStartISO: weekStartISO,
  defaultState: defaultState, ladderOf: ladderOf, currentLevel: currentLevel, isActive: isActive,
  lastEntry: lastEntry, targetsFor: targetsFor, prescribe: prescribe, mastered: mastered,
  buildSteps: buildSteps, restSeconds: restSeconds, warmupItems: warmupItems,
  finishWorkout: finishWorkout, weeklyCounts: weeklyCounts, seriesFor: seriesFor,
  scheduleHint: scheduleHint, projectWorkouts: projectWorkouts, sessionSummaryText: sessionSummaryText
};
