/* Views: pure functions, data in and HTML string out. No DOM, no clock, no storage.
   Everything a view needs (state, today, draft, tab, settings note) comes in as arguments.
   Imports data.js and logic.js only. */
import { SLOTS, LADDERS, PAIRS, CORE, SLOT_ORDER } from '../domain/data.js';
import {
  ladderOf,
  currentLevel,
  isActive,
  prescribe,
  warmupItems,
  weeklyCounts,
  weekCalendar,
  weekStreak,
  seriesFor,
  scheduleHint,
  projectWorkouts,
  sessionSummaryText,
} from '../domain/logic.js';

/* Dumbbell icon: Lucide "dumbbell" (ISC license), inlined to avoid external dependencies. */
export const ICON_EQUIP =
  '<svg class="ico" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14.4 14.4 9.6 9.6"/><path d="M18.657 21.485a2 2 0 1 1-2.829-2.828l-1.767 1.768a2 2 0 1 1-2.829-2.829l6.364-6.364a2 2 0 1 1 2.829 2.829l-1.768 1.767a2 2 0 1 1 2.828 2.829z"/><path d="m21.5 21.5-1.4-1.4"/><path d="M3.9 3.9 2.5 2.5"/><path d="M6.404 12.768a2 2 0 1 1-2.829-2.829l1.768-1.767a2 2 0 1 1-2.828-2.829l2.828-2.828a2 2 0 1 1 2.829 2.828l1.767-1.768a2 2 0 1 1 2.829 2.829z"/></svg>';
/* YouTube embed. Captions are off by default (cc_load_policy=0). */
export function videoEmbedUrl(id) {
  return (
    'https://www.youtube-nocookie.com/embed/' +
    id +
    '?rel=0&playsinline=1&modestbranding=1&cc_load_policy=0&iv_load_policy=3&hl=en&enablejsapi=1'
  );
}

/* A message for the YouTube player (postMessage). Used to unload its captions module, because cc_load_policy=0
   is only a default and YouTube still shows captions when the browser or account has them turned on. */
export function videoCommand(func, args) {
  return JSON.stringify({ event: 'command', func: func, args: args, id: 1, channel: 'widget' });
}

/* Plain YouTube page, used when the embedded player does not load. */
export function videoWatchUrl(id) {
  return 'https://www.youtube.com/watch?v=' + id;
}

export function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}
export function shortDate(s) {
  const p = s.split('-');
  return p[2] + '/' + p[1];
}

/* ---------- Small formatters ---------- */
/* Plain-text version of a target, e.g. "3 × 5" or "7 · 6 · 5". */
export function targetText(targets) {
  return targets.every((t) => t === targets[0]) ? '3 × ' + targets[0] : targets.join(' · ');
}

/* The badge and the "was ..." line for an exercise that changed since the workout before. */
export function changeHtml(level, it) {
  if (!it.change || !it.prev) return { tag: '', was: '' };
  if (it.change === 'level')
    return {
      tag: '<span class="chg">New level</span>',
      was: '<div class="chg-was">was: ' + esc(it.prev.name) + '</div>',
    };
  const d = it.targets[0] - it.prev.targets[0];
  const text =
    d > 0 ? '+' + d + (level.kind === 'hold' ? ' s' : d === 1 ? ' rep' : ' reps') : 'Changed';
  return {
    tag: '<span class="chg">' + text + '</span>',
    was: '<div class="chg-was">was ' + targetText(it.prev.targets) + '</div>',
  };
}

export function targetHtml(level, targets) {
  const same = targets.every((t) => {
    return t === targets[0];
  });
  let u = level.kind === 'hold' ? 's' : level.perSide ? 'per side' : 'reps';
  if (level.kind === 'hold' && level.perSide) u = 's per side';
  return same
    ? '3 × ' + targets[0] + '<small>' + u + '</small>'
    : targets.join(' · ') + '<small>' + u + '</small>';
}
export function levelText(state, slot) {
  return 'Level ' + (state.levels[slot].idx + 1) + ' of ' + ladderOf(state, slot).length;
}
export function metaLine(state, S, lvl, slot) {
  const parts = [];
  if (S.label.toLowerCase() !== lvl.name.toLowerCase()) parts.push(S.label);
  parts.push(levelText(state, slot));
  return parts.join(' · ');
}
export function equipHtml(lvl) {
  return lvl.equip
    ? '<div class="ex-equip">' + ICON_EQUIP + ' Needs: ' + esc(lvl.equip) + '</div>'
    : '';
}
export function rungsHtml(state, slot) {
  const lad = ladderOf(state, slot),
    cur = state.levels[slot].idx;
  return (
    '<div class="rungs" aria-hidden="true">' +
    lad
      .map((l, i) => {
        return '<span class="rung ' + (i < cur ? 'done' : i === cur ? 'cur' : '') + '"></span>';
      })
      .join('') +
    '</div>'
  );
}
export function barChart(items, o) {
  /* items: [{v, label, cap, up}] */
  const Wd = 320,
    Ht = o.h || 110,
    padB = 16,
    padT = 16,
    n = items.length;
  const max = Math.max.apply(
    null,
    items
      .map((i) => {
        return i.v;
      })
      .concat([o.min || 1])
  );
  const gap = 8,
    bw = Math.min(34, (Wd - gap * (n + 1)) / n),
    total = n * bw + (n + 1) * gap,
    x0 = (Wd - total) / 2 + gap;
  const plotH = Ht - padB - padT,
    base = Ht - padB;
  let out = '';
  if (o.goal) {
    const gy = base - (plotH * o.goal) / max;
    out +=
      '<line class="goal" x1="0" x2="' +
      Wd +
      '" y1="' +
      gy +
      '" y2="' +
      gy +
      '"/><text x="' +
      Wd +
      '" y="' +
      (gy - 4) +
      '" text-anchor="end">goal ' +
      o.goal +
      '</text>';
  }
  items.forEach((it, i) => {
    const x = x0 + i * (bw + gap),
      h = Math.max(it.v ? 3 : 0, (plotH * it.v) / max),
      y = base - h,
      r = Math.min(4, h);
    const d = h
      ? 'M' +
        x +
        ',' +
        base +
        'V' +
        (y + r) +
        'Q' +
        x +
        ',' +
        y +
        ' ' +
        (x + r) +
        ',' +
        y +
        'H' +
        (x + bw - r) +
        'Q' +
        (x + bw) +
        ',' +
        y +
        ' ' +
        (x + bw) +
        ',' +
        (y + r) +
        'V' +
        base +
        'Z'
      : '';
    out +=
      '<g class="bar' +
      (it.up ? ' up' : '') +
      '" data-act="bar" data-cap="' +
      esc(it.cap || '') +
      '" tabindex="0" role="img" aria-label="' +
      esc(it.cap || '') +
      '">' +
      '<rect x="' +
      (x - gap / 2) +
      '" y="0" width="' +
      (bw + gap) +
      '" height="' +
      Ht +
      '" fill="transparent"/>' +
      (d ? '<path d="' + d + '"/>' : '') +
      (o.valueLabels || i === n - 1
        ? '<text x="' +
          (x + bw / 2) +
          '" y="' +
          (y - 4) +
          '" text-anchor="middle">' +
          it.v +
          '</text>'
        : '') +
      '<text x="' +
      (x + bw / 2) +
      '" y="' +
      (Ht - 2) +
      '" text-anchor="middle">' +
      esc(it.label) +
      '</text></g>';
  });
  out += '<line class="base" x1="0" x2="' + Wd + '" y1="' + base + '" y2="' + base + '"/>';
  return (
    '<div class="chart-box"><svg class="chart" viewBox="0 0 ' +
    Wd +
    ' ' +
    Ht +
    '" role="group" aria-label="' +
    esc(o.aria) +
    '">' +
    out +
    '</svg><p class="chart-cap" aria-live="polite">' +
    esc(o.defaultCap || '') +
    '</p></div>'
  );
}
/* Plan for the days after today: the workout already done today (if any) and the next workouts. */
export function todayProjection(state, today) {
  const doneToday = state.sessions
    .filter((s) => {
      return s.date === today;
    })
    .pop();
  let proj = projectWorkouts(state, today, doneToday ? 4 : 3);
  if (doneToday) proj = proj.slice(1);
  return { doneToday: doneToday, proj: proj };
}

export function viewToday(state, o) {
  const today = o.today,
    hint = scheduleHint(state.sessions, today),
    draft = o.draft;
  let dayIdx = o.dayIdx;
  const wk = weeklyCounts(state.sessions, 1, today)[0].n;
  const dateTxt = new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(o.now);
  const pips = [0, 1, 2]
    .map((i) => {
      return '<span class="pip ' + (i < wk ? 'on' : '') + '"></span>';
    })
    .join('');
  const act = SLOT_ORDER.filter((s) => {
    return isActive(state, s);
  }).length;
  function exRow(slot) {
    const S = SLOTS[slot],
      lvl = currentLevel(state, slot);
    if (!isActive(state, slot)) {
      return (
        '<button class="ex off" data-act="open-ex" data-slot="' +
        slot +
        '"><div class="ex-top"><div><div class="ex-name">' +
        esc(S.label) +
        '</div><div class="ex-meta">Unlocks when you have the bar</div></div></div>' +
        rungsHtml(state, slot) +
        '</button>'
      );
    }
    const p = prescribe(state, slot);
    return (
      '<button class="ex" data-act="open-ex" data-slot="' +
      slot +
      '"><div class="ex-top"><div><div class="ex-name">' +
      esc(lvl.name) +
      '</div><div class="ex-meta">' +
      esc(metaLine(state, S, lvl, slot)) +
      '</div>' +
      equipHtml(lvl) +
      '</div><div class="ex-target num">' +
      targetHtml(lvl, p.targets) +
      '</div></div>' +
      rungsHtml(state, slot) +
      '</button>'
    );
  }
  function group(title, sub, rows) {
    return (
      '<section class="plan-grp"><div class="grp"><h3>' +
      title +
      '</h3><span class="muted small">' +
      sub +
      '</span></div><div class="ex-list">' +
      rows +
      '</div></section>'
    );
  }
  const warm = warmupItems(state);
  const warmRows = warm
    .map((it) => {
      return (
        '<button class="ex" data-act="open-warm" data-id="' +
        it.id +
        '"><div class="ex-name">' +
        esc(it.name) +
        '</div><div class="ex-meta">' +
        esc(it.n + ' ' + it.unit) +
        '</div>' +
        equipHtml(it) +
        '</button>'
      );
    })
    .join('');
  let rows = group('Warm-up', warm.length + ' items', warmRows);
  PAIRS.forEach((pair, i) => {
    rows += group(
      'Pair ' + (i + 1) + ' of 3',
      '3 sets, ' + state.settings.restMain + ' s rest',
      pair.map(exRow).join('')
    );
  });
  rows += group('Core', '3 sets, ' + state.settings.restCore + ' s rest', CORE.map(exRow).join(''));
  let cta;
  const doneToday = todayProjection(state, today).doneToday;
  const last = state.sessions[state.sessions.length - 1];
  const lastTxt = last
    ? '<p class="muted small hero-last">Last workout: ' +
      esc(
        new Intl.DateTimeFormat('en-US', {
          weekday: 'short',
          day: 'numeric',
          month: 'short',
        }).format(new Date(last.date + 'T12:00:00'))
      ) +
      '</p>'
    : '';
  let statusHtml = '<p class="hero-text">' + esc(hint.text) + '</p>';
  if (draft) {
    cta =
      '<div class="btn-row"><button class="btn tape" data-act="resume">Continue workout</button><button class="btn ghost" data-act="discard-draft">Discard</button></div>';
  } else if (doneToday) {
    const dn = Object.keys(doneToday.entries).length;
    statusHtml =
      '<div class="done-card"><span class="done-ico" aria-hidden="true">✓</span><div><b>Workout done today</b><p class="muted">' +
      dn +
      ' exercises' +
      (doneToday.durationSec
        ? ' · ' + Math.max(1, Math.round(doneToday.durationSec / 60)) + ' min'
        : '') +
      '</p></div></div>';
    cta = '<button class="btn ghost" data-act="start">Repeat workout</button>';
  } else {
    cta = '<button class="btn tape" data-act="start">Start workout</button>';
  }
  const proj = todayProjection(state, today).proj;
  if (dayIdx > proj.length) dayIdx = 0;
  const fmtDay = (iso, o) => {
    return new Intl.DateTimeFormat('en-US', o).format(new Date(iso + 'T12:00:00'));
  };
  const dayBtns =
    '<button data-act="pick-day" data-i="0" aria-pressed="' +
    (dayIdx === 0) +
    '">Today</button>' +
    proj
      .map((p, n) => {
        return (
          '<button data-act="pick-day" data-i="' +
          (n + 1) +
          '" aria-pressed="' +
          (dayIdx === n + 1) +
          '">' +
          esc(fmtDay(p.date, { weekday: 'short', day: 'numeric' })) +
          '</button>'
        );
      })
      .join('');
  const daySel = '<div class="daysel" role="group" aria-label="Choose a day">' + dayBtns + '</div>';
  let heading = doneToday ? 'Next workout' : "Today's workout",
    sub =
      'Warm-up and ' +
      act +
      ' exercises, in this order. Tap one for the video or to change its level.';
  if (dayIdx > 0) {
    const pd = proj[dayIdx - 1];
    const byslot = {};
    pd.items.forEach((it) => {
      byslot[it.slot] = it;
    });
    const exPrev = (slot) => {
      const it = byslot[slot];
      if (!it) return exRow(slot);
      const S = SLOTS[slot],
        lvl = ladderOf(state, slot)[it.levelIdx];
      const chg = changeHtml(lvl, it);
      return (
        '<button class="ex' +
        (it.change ? ' changed' : '') +
        '" data-act="open-ex" data-slot="' +
        slot +
        '" data-lvl="' +
        esc(it.levelId) +
        '"><div class="ex-top"><div><div class="ex-name">' +
        esc(it.name) +
        chg.tag +
        (it.promotedTo ? '<span class="up-tag">then: ' + esc(it.promotedTo) + '</span>' : '') +
        '</div><div class="ex-meta">' +
        esc(
          (S.label.toLowerCase() !== it.name.toLowerCase() ? S.label + ' · ' : '') +
            'Level ' +
            (it.levelIdx + 1) +
            ' of ' +
            ladderOf(state, slot).length
        ) +
        '</div>' +
        chg.was +
        equipHtml(lvl) +
        '</div><div class="ex-target num">' +
        targetHtml(lvl, it.targets) +
        '</div></div></button>'
      );
    };
    rows = group(
      'Warm-up',
      pd.warm.length + ' items',
      pd.warm
        .map((it) => {
          return (
            '<button class="ex" data-act="open-warm" data-id="' +
            it.id +
            '"><div class="ex-name">' +
            esc(it.name) +
            '</div><div class="ex-meta">' +
            esc(it.n + ' ' + it.unit) +
            '</div>' +
            equipHtml(it) +
            '</button>'
          );
        })
        .join('')
    );
    PAIRS.forEach((pair, n) => {
      rows += group(
        'Pair ' + (n + 1) + ' of 3',
        '3 sets, ' + state.settings.restMain + ' s rest',
        pair.map(exPrev).join('')
      );
    });
    rows += group(
      'Core',
      '3 sets, ' + state.settings.restCore + ' s rest',
      CORE.map(exPrev).join('')
    );
    heading = fmtDay(pd.date, { weekday: 'long', day: 'numeric', month: 'long' });
    sub =
      'Preview. Targets assume you hit every target in the workouts before. They change if you miss.';
  }
  return (
    '<div class="wrap"><div class="page-head head-row"><div><h1>Today</h1><p class="date">' +
    esc(dateTxt) +
    '</p></div>' +
    '<div class="week" aria-label="' +
    wk +
    ' of 3 workouts this week"><span class="pips" aria-hidden="true">' +
    pips +
    '</span><span class="muted small">' +
    wk +
    ' of 3 this week</span></div></div>' +
    '<div class="hero">' +
    statusHtml +
    cta +
    lastTxt +
    '</div>' +
    daySel +
    '<div class="plan-head"><h2>' +
    esc(heading) +
    '</h2><p class="muted small">' +
    esc(sub) +
    '</p></div>' +
    rows +
    '</div>'
  );
}
const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const WEEK_GOAL = 3;

function calDay(d, i, withLetter) {
  const cls =
    'cal-day' +
    (d.state === 'today' ? ' today' : '') +
    (d.trained ? ' done' : '') +
    (d.state === 'future' ? ' future' : '');
  const what = d.trained
    ? 'workout done'
    : d.state === 'future'
      ? 'not yet'
      : d.state === 'today'
        ? 'no workout yet'
        : 'no workout';
  return (
    '<span class="' +
    cls +
    '" role="img" aria-label="' +
    DOW[i] +
    ' ' +
    shortDate(d.date) +
    ': ' +
    what +
    '">' +
    (withLetter ? '<i class="cal-l">' + DOW[i][0] + '</i>' : '') +
    '<b class="cal-dot">' +
    (d.trained ? '✓' : '') +
    '</b></span>'
  );
}

/* Duolingo-style calendar: this week with its 7 days and the weekly goal, then the earlier weeks, newest first. */
export function weekCalendarHtml(weeks) {
  const cur = weeks[weeks.length - 1],
    met = cur.n >= WEEK_GOAL;
  const goalTxt = met
    ? 'Weekly goal reached'
    : WEEK_GOAL - cur.n + ' more to reach the weekly goal';
  const earlier = weeks
    .slice(0, -1)
    .reverse()
    .map((w) => {
      return (
        '<div class="cal-week' +
        (w.goalMet ? ' met' : '') +
        '"><span class="cal-wk">' +
        shortDate(w.start) +
        '</span><div class="cal-days">' +
        w.days.map((d, i) => calDay(d, i, false)).join('') +
        '</div><span class="cal-goal">' +
        w.n +
        '/' +
        WEEK_GOAL +
        (w.goalMet ? ' ✓' : '') +
        '</span></div>'
      );
    })
    .join('');
  return (
    '<div class="gcard pad"><h3 class="card-title">This week</h3><div class="cal-now">' +
    cur.days.map((d, i) => calDay(d, i, true)).join('') +
    '</div><p class="cal-goal-now' +
    (met ? ' met' : '') +
    '"><b class="num">' +
    cur.n +
    '/' +
    WEEK_GOAL +
    '</b> ' +
    goalTxt +
    '</p></div><div class="gcard pad"><h3 class="card-title">Earlier weeks</h3>' +
    earlier +
    '</div>'
  );
}

export function viewProgress(state, o) {
  const today = o.today,
    progTab = o.progTab,
    weeks = weekCalendar(state.sessions, 8, today, WEEK_GOAL),
    n = state.sessions.length;
  let ups = 0;
  state.sessions.forEach((x) => {
    Object.keys(x.entries).forEach((k) => {
      if (x.entries[k].promotedTo) ups++;
    });
  });
  const tabs = [
    ['overview', 'Overview'],
    ['history', 'History'],
  ]
    .map((t) => {
      return (
        '<button data-act="prog-tab" data-p="' +
        t[0] +
        '" aria-pressed="' +
        (progTab === t[0]) +
        '">' +
        t[1] +
        '</button>'
      );
    })
    .join('');
  let out =
    '<div class="wrap"><div class="page-head"><h1>Progress</h1></div><div class="segsel" role="group" aria-label="Progress sections">' +
    tabs +
    '</div>';

  if (progTab === 'overview') {
    out +=
      '<div class="stats">' +
      '<div class="stat"><b class="num">' +
      n +
      '</b><span>' +
      (n === 1 ? 'workout' : 'workouts') +
      '</span></div>' +
      '<div class="stat"><b class="num">' +
      weekStreak(weeks) +
      '</b><span>week streak</span></div>' +
      '<div class="stat"><b class="num">' +
      ups +
      '</b><span>' +
      (ups === 1 ? 'level up' : 'level ups') +
      '</span></div></div>';
    out += weekCalendarHtml(weeks);
    out +=
      '<h2 class="sec-title">Each exercise</h2><p class="muted small">Each bar is a workout: total reps (seconds on holds). Orange marks the workout where you moved up a level.</p>';
    SLOT_ORDER.forEach((slot) => {
      const S = SLOTS[slot],
        lvl = currentLevel(state, slot),
        ser = seriesFor(state, slot).slice(-12);
      const inactive = !isActive(state, slot);
      out +=
        '<div class="gcard pad" id="pc-' +
        slot +
        '"><div class="pcard-top"><h3>' +
        esc(inactive ? S.label : lvl.name) +
        '</h3><span class="muted small">' +
        (inactive ? '' : levelText(state, slot)) +
        '</span></div>' +
        rungsHtml(state, slot);
      if (!ser.length)
        out +=
          '<p class="empty small" style="padding:10px 0 0">' +
          (inactive
            ? 'Waiting for the equipment.'
            : 'No records yet. Do a workout to see your progress.') +
          '</p>';
      else {
        const items = ser.map((r) => {
          const u = r.kind === 'hold' ? ' s' : ' reps';
          return {
            v: r.total,
            up: r.promoted,
            label: shortDate(r.date),
            cap:
              shortDate(r.date) +
              ' · ' +
              r.name +
              ' · ' +
              r.sets.join(' + ') +
              u +
              (r.promoted ? ' · moved up to ' + r.promotedTo : ''),
          };
        });
        out += barChart(items, {
          aria: 'Total per workout for ' + S.label,
          defaultCap: items[items.length - 1].cap,
          h: 96,
        });
      }
      out += '</div>';
    });
  } else {
    if (!n) out += '<p class="empty">Workouts you finish show up here.</p>';
    else {
      out +=
        '<div class="sess-list">' +
        state.sessions
          .slice()
          .reverse()
          .slice(0, 30)
          .map((x) => {
            const list = SLOT_ORDER.filter((k) => {
              return x.entries[k];
            })
              .map((k) => {
                const e = x.entries[k];
                return (
                  '<li><span>' +
                  esc(e.name) +
                  (e.promotedTo ? '<span class="up-tag">level up</span>' : '') +
                  '</span><span>' +
                  esc(sessionSummaryText(e)) +
                  '</span></li>'
                );
              })
              .join('');
            const c = Object.keys(x.entries).length;
            return (
              '<details class="sess"><summary><span>' +
              shortDate(x.date) +
              '</span><span class="muted">' +
              c +
              ' exercises' +
              (x.durationSec ? ' · ' + Math.max(1, Math.round(x.durationSec / 60)) + ' min' : '') +
              '</span></summary><ul>' +
              list +
              '</ul><button class="btn ghost del-sess" data-act="sess-del-ask" data-id="' +
              esc(x.id) +
              '">Delete this workout</button></details>'
            );
          })
          .join('') +
        '</div>';
    }
  }
  return out + '</div>';
}
export function stepper(act, id, val, unit) {
  return (
    '<div class="stepper"><button data-act="' +
    act +
    '" data-d="-1" aria-label="Decrease">−</button><span class="val num" id="' +
    id +
    '">' +
    val +
    unit +
    '</span><button data-act="' +
    act +
    '" data-d="1" aria-label="Increase">+</button></div>'
  );
}
export function viewSettings(state, o) {
  const st = state.settings;
  const pathRows = ['core_ae', 'core_ar', 'core_ex']
    .map((slot) => {
      const cur = state.levels[slot].path,
        ps = LADDERS[slot].paths;
      return (
        '<div class="set-row" style="display:block"><b>' +
        esc(SLOTS[slot].label) +
        '</b><div class="pathsel" style="margin-top:8px">' +
        Object.keys(ps)
          .map((k) => {
            return (
              '<button data-act="set-path" data-slot="' +
              slot +
              '" data-path="' +
              k +
              '" aria-pressed="' +
              (k === cur) +
              '">' +
              esc(ps[k].label) +
              '</button>'
            );
          })
          .join('') +
        '</div></div>'
      );
    })
    .join('');
  const exp = JSON.stringify({
    v: 1,
    settings: state.settings,
    levels: state.levels,
    sessions: state.sessions,
  });
  return (
    '<div class="wrap"><div class="page-head"><h1>Settings</h1><p>' +
    esc(o.syncNote) +
    '</p></div>' +
    '<div class="set-row"><div><b>I have a pull-up bar</b><p>Adds the pull-up and the full Pair 1 to your workout.</p></div><button class="switch" role="switch" aria-checked="' +
    !!st.hasBar +
    '" aria-label="I have a pull-up bar" data-act="toggle-bar"></button></div>' +
    '<div class="set-row"><div><b>I have a safe dip setup</b><p>Parallel bars, sturdy chairs or a counter corner. Adds the dip to your workout.</p></div><button class="switch" role="switch" aria-checked="' +
    !!st.hasDip +
    '" aria-label="I have a safe dip setup" data-act="toggle-dip"></button></div>' +
    '<div class="set-row"><div><b>Rest for strength</b><p>Between sets of the pairs</p></div>' +
    stepper('rest-main', 'rm', st.restMain, ' s') +
    '</div>' +
    '<div class="set-row"><div><b>Rest for core</b><p>Between sets of the triplet</p></div>' +
    stepper('rest-core', 'rc', st.restCore, ' s') +
    '</div>' +
    '<div class="set-row"><div><b>Sound</b><p>Beeps for the countdown and the end of each set</p></div><button class="btn small ghost" data-act="sound-test">Test sound</button></div>' +
    '<h2 class="sec-title">Core exercises</h2><p class="muted small">The default paths use only your body and a sturdy support. Switch if you have a band, rings or a bar.</p>' +
    pathRows +
    '<h2 class="sec-title">Backup</h2><p class="muted small">Copy the text below and keep it wherever you like. To restore, paste a backup into the box and tap Import.</p>' +
    '<textarea id="bk" aria-label="Backup data" spellcheck="false">' +
    esc(exp) +
    '</textarea>' +
    '<div class="btn-row"><button class="btn small ghost" data-act="copy-bk">Copy</button><button class="btn small ghost" data-act="import-bk">Import</button></div>' +
    '<h2 class="sec-title">Start over</h2><p class="muted small">Deletes your workouts and sets the levels back to the plan\'s starting point.</p>' +
    '<div class="btn-row"><button class="btn small ghost" data-act="reset-ask">Delete everything</button></div></div>'
  );
}
const TAB_ICONS = {
  today:
    '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18M9 16l2 2 4-4"/>',
  progress: '<path d="M5 21v-6M12 21V3M19 21V9"/>',
  settings: '<path d="M21 4h-7M10 4H3M21 12h-9M8 12H3M21 20h-5M12 20H3M14 2v4M8 10v4M16 18v4"/>',
}; /* Lucide icons (ISC license) */
export function tabbar(tab) {
  function t(id, label) {
    return (
      '<button class="tab" data-act="tab" data-tab="' +
      id +
      '"' +
      (tab === id ? ' aria-current="page"' : '') +
      '><svg class="tab-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      TAB_ICONS[id] +
      '</svg><span>' +
      label +
      '</span></button>'
    );
  }
  return (
    '<nav class="tabbar" aria-label="Sections">' +
    t('today', 'Today') +
    t('progress', 'Progress') +
    t('settings', 'Settings') +
    '</nav>'
  );
}
