import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as D from '../../../src/domain/data.js';
import * as L from '../../../src/domain/logic.js';
import { VIDEOS } from '../../../src/domain/videos.js';

// sets: {slot: [reps...]}
const mkW = (state, sets) => {
  const logged = {};
  Object.keys(sets).forEach((s) => {
    const p = L.prescribe(D, state, s);
    logged[s] = { levelId: p.level.id, sets: sets[s], targets: p.targets };
  });
  return { startedAt: 1, logged, warmDone: 4 };
};

describe('starting state', () => {
  it('matches the training plan', () => {
    const s = L.defaultState(D);
    assert.equal(L.currentLevel(D, s, 'pushup').name, 'Diamond push-up');
    assert.equal(L.currentLevel(D, s, 'row').name, 'Incline row');
    assert.equal(L.currentLevel(D, s, 'squat').name, 'Squat');
    assert.equal(L.currentLevel(D, s, 'pullup').name, 'Scapular pulls');
    assert.equal(L.currentLevel(D, s, 'dip').name, 'Parallel bar support hold');
    assert.equal(L.currentLevel(D, s, 'core_ar').name, 'Assisted knee Copenhagen plank');
  });

  it('starts every set at the minimum on the first time at a level', () => {
    const s = L.defaultState(D);
    assert.deepEqual(L.prescribe(D, s, 'pushup').targets, [5, 5, 5]);
    assert.deepEqual(L.prescribe(D, s, 'dip').targets, [10, 10, 10]);
    assert.deepEqual(L.prescribe(D, s, 'core_ae').targets, [10, 10, 10]);
    assert.deepEqual(L.prescribe(D, s, 'core_ex').targets, [8, 8, 8]);
  });
});

describe('target progression', () => {
  it('adds one rep per set when every set hit its target', () => {
    const s = L.defaultState(D);
    L.finishWorkout(D, s, mkW(s, { pushup: [5, 5, 5] }), '2026-11-16', 3000);
    assert.deepEqual(L.prescribe(D, s, 'pushup').targets, [6, 6, 6]);
  });

  it('ignores reps above the target: only hitting it matters', () => {
    const s = L.defaultState(D);
    L.finishWorkout(D, s, mkW(s, { pushup: [7, 6, 5] }), '2026-11-16', 3000); // targets 5,5,5
    assert.deepEqual(L.prescribe(D, s, 'pushup').targets, [6, 6, 6]);
  });

  it('ignores a big hold overshoot (30, 15, 15 against 10, 10, 10)', () => {
    const s = L.defaultState(D);
    L.finishWorkout(D, s, mkW(s, { dip: [30, 15, 15] }), '2026-11-16', 0);
    assert.deepEqual(L.prescribe(D, s, 'dip').targets, [15, 15, 15]);
  });

  it('repeats the same targets when any target was missed', () => {
    const s = L.defaultState(D);
    L.finishWorkout(D, s, mkW(s, { pushup: [5, 5, 5] }), '2026-11-16', 0);
    L.finishWorkout(D, s, mkW(s, { pushup: [6, 5, 4] }), '2026-11-18', 0); // targets 6,6,6, did 6,5,4
    assert.deepEqual(L.prescribe(D, s, 'pushup').targets, [6, 6, 6]);
  });

  it('never lowers a target, even when a set was far below it', () => {
    const s = L.defaultState(D);
    L.finishWorkout(D, s, mkW(s, { dip: [10, 10, 10] }), '2026-11-16', 0);
    L.finishWorkout(D, s, mkW(s, { dip: [15, 15, 15] }), '2026-11-18', 0);
    L.finishWorkout(D, s, mkW(s, { dip: [5, 15, 15] }), '2026-11-20', 0); // targets 20,20,20
    assert.deepEqual(L.prescribe(D, s, 'dip').targets, [20, 20, 20]);
  });

  it('never goes above 8 reps', () => {
    const level = { lo: 5, hi: 8, step: 1 };
    const last = { entry: { sets: [8, 8, 8], targets: [8, 8, 8] } };
    assert.deepEqual(L.targetsFor(level, last), [8, 8, 8]);
  });

  it('does not promote or count as clean when a set is missing', () => {
    const s = L.defaultState(D);
    const r = L.finishWorkout(D, s, mkW(s, { pushup: [8, 8] }), '2026-11-16', 0);
    assert.equal(r.promotions.length, 0);
    assert.deepEqual(L.prescribe(D, s, 'pushup').targets, [5, 5, 5]);
  });

  it('does not create an entry for an exercise with no sets', () => {
    const s = L.defaultState(D);
    const r = L.finishWorkout(D, s, mkW(s, { pushup: [], row: [5, 5, 5] }), '2026-11-16', 0);
    assert.ok(!r.session.entries.pushup);
    assert.ok(r.session.entries.row);
  });
});

describe('set result', () => {
  const reps = { lo: 5, hi: 8, step: 1 };
  const hold = { lo: 10, hi: 30, step: 5 };

  it('records exactly the target when the set was hit', () => {
    assert.equal(L.setResult(reps, 7, true), 7);
    assert.equal(L.setResult(hold, 20, true), 20);
  });

  it('records one step below the target when the set was missed', () => {
    assert.equal(L.setResult(reps, 7, false), 6);
    assert.equal(L.setResult(hold, 20, false), 15);
  });

  it('never records a negative value', () => {
    assert.equal(L.setResult({ lo: 0, hi: 8, step: 1 }, 0, false), 0);
  });

  it('a missed set stops the whole exercise from counting as clean', () => {
    const s = L.defaultState(D);
    const missed = L.setResult(reps, 5, false);
    L.finishWorkout(D, s, mkW(s, { pushup: [5, missed, 5] }), '2026-11-16', 0);
    assert.deepEqual(L.prescribe(D, s, 'pushup').targets, [5, 5, 5]);
  });
});

describe('side switch', () => {
  it('gives 15 seconds to change position between the two sides', () => {
    assert.equal(L.SIDE_SWITCH_SECS, 15);
  });
});

describe('level promotion', () => {
  it('moves up a level at 3x8 and restarts at 3x5', () => {
    const s = L.defaultState(D);
    const r = L.finishWorkout(D, s, mkW(s, { pushup: [8, 8, 8] }), '2026-11-16', 0);
    assert.equal(r.promotions.length, 1);
    assert.equal(L.currentLevel(D, s, 'pushup').name, 'Pseudo planche push-up');
    assert.deepEqual(L.prescribe(D, s, 'pushup').targets, [5, 5, 5]);
    assert.equal(r.session.entries.pushup.promotedTo, 'Pseudo planche push-up');
  });

  it('does not promote past the last step of a ladder', () => {
    const s = L.defaultState(D);
    s.levels.pushup.idx = 4;
    const r = L.finishWorkout(D, s, mkW(s, { pushup: [8, 8, 8] }), '2026-11-16', 0);
    assert.equal(r.promotions.length, 0);
    assert.equal(s.levels.pushup.idx, 4);
  });

  it('progresses holds from 10 s in 5 s steps and promotes at 30 s', () => {
    const s = L.defaultState(D);
    L.finishWorkout(D, s, mkW(s, { dip: [10, 10, 10] }), '2026-11-16', 0);
    assert.deepEqual(L.prescribe(D, s, 'dip').targets, [15, 15, 15]);
    L.finishWorkout(D, s, mkW(s, { dip: [15, 15, 15] }), '2026-11-18', 0);
    L.finishWorkout(D, s, mkW(s, { dip: [20, 20, 20] }), '2026-11-20', 0);
    L.finishWorkout(D, s, mkW(s, { dip: [25, 25, 25] }), '2026-11-23', 0);
    assert.deepEqual(L.prescribe(D, s, 'dip').targets, [30, 30, 30]);
    const r = L.finishWorkout(D, s, mkW(s, { dip: [30, 30, 30] }), '2026-11-25', 0);
    assert.equal(L.currentLevel(D, s, 'dip').name, 'Negative dips');
    assert.equal(r.promotions.length, 1);
  });

  it('uses a rep range of 8 to 12 for core and promotes at 12', () => {
    const s = L.defaultState(D);
    s.levels.core_ex.idx = 0;
    L.finishWorkout(D, s, mkW(s, { core_ex: [12, 12, 12] }), '2026-11-16', 0);
    assert.equal(L.currentLevel(D, s, 'core_ex').name, 'Arch body hold');
  });
});

describe('workout structure', () => {
  it('skips the pull-up without a bar and alternates the three sets', () => {
    const s = L.defaultState(D);
    s.settings.hasDip = true;
    const st = L.buildSteps(D, s);
    assert.ok(!st.some((x) => x.slot === 'pullup'));
    assert.equal(st.length, 3 * 2 + 3 * 2 + 3 * 2 + 3 * 3 - 3); // pairs: 1+2+2 = 5 exercises, core 3
  });

  it('orders a pair as A,B,A,B,A,B when the bar is available', () => {
    const s = L.defaultState(D);
    s.settings.hasBar = true;
    s.settings.hasDip = true;
    const st = L.buildSteps(D, s);
    assert.deepEqual(
      st.slice(0, 6).map((x) => x.slot + x.set),
      ['pullup1', 'squat1', 'pullup2', 'squat2', 'pullup3', 'squat3']
    );
    assert.equal(st.length, 6 * 3 + 9);
    assert.equal(st[st.length - 1].slot, 'core_ex');
  });

  it('rests 90 s after strength and 60 s after core', () => {
    const s = L.defaultState(D);
    assert.equal(L.restSeconds(D, s, 'row'), 90);
    assert.equal(L.restSeconds(D, s, 'core_ae'), 60);
  });

  it('includes the dip only when hasDip is on', () => {
    const s = L.defaultState(D);
    assert.equal(L.isActive(D, s, 'dip'), false);
    s.settings.hasDip = true;
    assert.equal(L.isActive(D, s, 'dip'), true);
  });
});

describe('warm-up', () => {
  it('swaps the shoulder drill for wall slides and back to the guide', () => {
    const s = L.defaultState(D);
    assert.equal(L.warmupItems(D, s)[0].id, 'shoulder');
    s.settings.warmAlt = { shoulder: 'shoulder_wall' };
    const items = L.warmupItems(D, s);
    assert.equal(items[0].name, 'Wall slides');
    assert.equal(items[0].base, 'shoulder');
    assert.equal(items.length, 4);
    s.settings.warmAlt = {};
    assert.equal(L.warmupItems(D, s)[0].id, 'shoulder');
  });

  it('adds extras as levels advance', () => {
    const s = L.defaultState(D);
    assert.equal(L.warmupItems(D, s).length, 4);
    s.settings.hasBar = true;
    s.settings.hasDip = true;
    s.levels.pullup.idx = 2;
    s.levels.dip.idx = 1;
    assert.equal(L.warmupItems(D, s).length, 6);
  });

  it('shows extras with the level and picks the previous level correctly', () => {
    const s = L.defaultState(D);
    s.settings.hasBar = true;
    s.settings.hasDip = true;
    s.levels.squat.idx = 3;
    s.levels.hinge.idx = 3;
    s.levels.pullup.idx = 2;
    s.levels.dip.idx = 1;
    const items = L.warmupItems(D, s),
      names = items.map((x) => x.name);
    assert.equal(items.length, 8);
    assert.ok(names.includes('Split squat') && names.includes('Banded nordic curl negative'));
    assert.ok(items.every((x) => x.how && x.how.length && x.n && x.unit));
  });
});

describe('schedule', () => {
  it('starts the weekly count on Monday', () => {
    const sess = [
      { date: '2026-11-09' },
      { date: '2026-11-11' },
      { date: '2026-11-13' },
      { date: '2026-11-16' },
    ];
    const w = L.weeklyCounts(sess, 3, '2026-11-18');
    assert.deepEqual(
      w.map((x) => x.n),
      [0, 3, 1]
    );
    assert.equal(w[2].start, '2026-11-16');
  });

  it('gives the right hint for the day', () => {
    assert.equal(L.scheduleHint([], '2026-11-16').kind, 'go'); // Monday
    assert.equal(L.scheduleHint([], '2026-11-17').kind, 'off'); // Tuesday
    assert.equal(L.scheduleHint([{ date: '2026-11-16' }], '2026-11-17').kind, 'rest');
    assert.equal(L.scheduleHint([{ date: '2026-11-16' }], '2026-11-16').kind, 'done');
  });

  it('projects the next Monday, Wednesday and Friday with rising targets', () => {
    const s = L.defaultState(D);
    const p = L.projectWorkouts(D, s, '2026-11-16', 3); // Monday with no workout done: today is simulated and left out of the list
    assert.deepEqual(
      p.map((x) => x.date),
      ['2026-11-18', '2026-11-20', '2026-11-23']
    );
    const row = (x) => x.items.find((i) => i.slot === 'row').targets;
    assert.deepEqual(row(p[0]), [6, 6, 6]);
    assert.deepEqual(row(p[1]), [7, 7, 7]);
    assert.equal(s.sessions.length, 0); // does not touch the real state
    const q = L.projectWorkouts(D, s, '2026-11-17', 1); // Tuesday: starts on Wednesday, today is not simulated
    assert.equal(q[0].date, '2026-11-18');
    assert.deepEqual(row(q[0]), [5, 5, 5]);
  });

  it('flags a level up in the projection and restarts at 3x5', () => {
    const s = L.defaultState(D);
    L.finishWorkout(D, s, mkW(s, { pushup: [7, 7, 7] }), '2026-11-14', 0);
    const p = L.projectWorkouts(D, s, '2026-11-16', 2);
    assert.equal(p[0].items.find((i) => i.slot === 'pushup').promotedTo, undefined);
    const pp = L.projectWorkouts(D, s, '2026-11-17', 3);
    const lv = pp.map((x) => x.items.find((i) => i.slot === 'pushup'));
    assert.ok(lv.some((i) => i.promotedTo));
  });
});

describe('content data', () => {
  it('gives every level cues and a valid range', () => {
    Object.keys(D.LADDERS).forEach((s) =>
      Object.values(D.LADDERS[s].paths).forEach((p) =>
        p.levels.forEach((l) => {
          assert.ok(l.cues.length > 0 || D.SLOTS[s].general.length > 0, l.id);
          assert.ok(l.hi > l.lo, l.id);
        })
      )
    );
  });

  it('gives every level and warm-up item a valid video', () => {
    const V = VIDEOS;
    Object.keys(D.LADDERS).forEach((s) =>
      Object.values(D.LADDERS[s].paths).forEach((p) =>
        p.levels.forEach((l) => {
          assert.ok(V[l.id], 'missing video: ' + l.id);
        })
      )
    );
    D.WARMUP.concat(D.WARMUP_EXTRAS.filter((x) => x.q)).forEach((w) =>
      assert.ok(V['w.' + w.id], 'missing video: w.' + w.id)
    );
    D.WARMUP.forEach((w) =>
      (w.alts || []).forEach((x) => assert.ok(V['w.' + x.id], 'missing video: w.' + x.id))
    );
    Object.keys(D.LADDERS).forEach((s) =>
      Object.values(D.LADDERS[s].paths).forEach((p) =>
        p.levels.forEach((l) =>
          l.setup.forEach((o) =>
            assert.ok(o.label && (!o.k || V[o.k]), 'missing setup video: ' + o.k)
          )
        )
      )
    );
    Object.keys(V).forEach((k) =>
      assert.ok(/^[A-Za-z0-9_-]{11}$/.test(V[k].id) && V[k].t && V[k].c, k)
    );
  });
});

describe('week calendar', () => {
  // 2026-11-18 is a Wednesday, so the week runs from Monday 2026-11-16 to Sunday 2026-11-22.
  const TODAY = '2026-11-18';
  const sess = (...dates) => dates.map((date, i) => ({ id: 's' + i, date, entries: {} }));

  it('lists weeks oldest first with the current week last, each with 7 days from Monday', () => {
    const weeks = L.weekCalendar([], 3, TODAY, 3);
    assert.equal(weeks.length, 3);
    assert.equal(weeks[2].start, '2026-11-16');
    assert.equal(weeks[0].start, '2026-11-02');
    assert.deepEqual(
      weeks[2].days.map((d) => d.date),
      [
        '2026-11-16',
        '2026-11-17',
        '2026-11-18',
        '2026-11-19',
        '2026-11-20',
        '2026-11-21',
        '2026-11-22',
      ]
    );
  });

  it('marks the days that had a workout', () => {
    const weeks = L.weekCalendar(sess('2026-11-16', '2026-11-18'), 1, TODAY, 3);
    assert.deepEqual(
      weeks[0].days.map((d) => d.trained),
      [true, false, true, false, false, false, false]
    );
    assert.equal(weeks[0].n, 2);
  });

  it('marks today and the days that have not happened yet', () => {
    const [w] = L.weekCalendar([], 1, TODAY, 3);
    assert.deepEqual(
      w.days.map((d) => d.state),
      ['past', 'past', 'today', 'future', 'future', 'future', 'future']
    );
  });

  it('counts a day once even with two workouts on it', () => {
    const [w] = L.weekCalendar(sess('2026-11-16', '2026-11-16'), 1, TODAY, 3);
    assert.equal(w.n, 1);
  });

  it('meets the goal at 3 workout days in the week', () => {
    const two = L.weekCalendar(sess('2026-11-16', '2026-11-18'), 1, TODAY, 3)[0];
    const three = L.weekCalendar(sess('2026-11-16', '2026-11-18', '2026-11-20'), 1, TODAY, 3)[0];
    assert.equal(two.goalMet, false);
    assert.equal(three.goalMet, true);
  });
});

describe('week streak', () => {
  const week = (goalMet, current = false) => ({ goalMet, current });

  it('counts consecutive weeks that met the goal, ending at the latest week', () => {
    assert.equal(L.weekStreak([week(false), week(true), week(true), week(true)]), 3);
  });

  it('does not break on the current week while it is still unfinished', () => {
    assert.equal(L.weekStreak([week(true), week(true), week(false, true)]), 2);
  });

  it('adds the current week once it meets the goal', () => {
    assert.equal(L.weekStreak([week(true), week(true), week(true, true)]), 3);
  });

  it('stops at the first missed week', () => {
    assert.equal(L.weekStreak([week(true), week(false), week(true)]), 1);
  });

  it('is zero with no weeks met', () => {
    assert.equal(L.weekStreak([week(false), week(false, true)]), 0);
  });
});

describe('projected workouts: what changed', () => {
  const TODAY = '2026-11-18'; // Wednesday: today's workout is planned, the next one is Friday
  const item = (out, slot) => out.find((i) => i.slot === slot);

  it('flags raised targets against the workout before, and keeps the old ones', () => {
    const s = L.defaultState(D);
    const out = L.projectWorkouts(D, s, TODAY, 2);
    const row = item(out[0].items, 'pushup');
    assert.equal(row.change, 'targets');
    assert.deepEqual(row.prev.targets, [5, 5, 5]);
    assert.deepEqual(row.targets, [6, 6, 6]);
  });

  it('flags a new level and names the one it replaces', () => {
    const s = L.defaultState(D);
    L.finishWorkout(D, s, mkW(s, { pushup: [5, 5, 5] }), '2026-11-09', 0);
    L.finishWorkout(D, s, mkW(s, { pushup: [6, 6, 6] }), '2026-11-11', 0);
    L.finishWorkout(D, s, mkW(s, { pushup: [7, 7, 7] }), '2026-11-13', 0); // targets are now 8, 8, 8
    const out = L.projectWorkouts(D, s, TODAY, 2); // today hits 8 and moves up
    const row = item(out[0].items, 'pushup');
    assert.equal(row.change, 'level');
    assert.equal(row.prev.name, 'Diamond push-up');
    assert.deepEqual(row.targets, [5, 5, 5]);
  });

  it('compares each projected workout with the one right before it', () => {
    const s = L.defaultState(D);
    const out = L.projectWorkouts(D, s, TODAY, 3);
    assert.deepEqual(item(out[1].items, 'pushup').prev.targets, [6, 6, 6]);
    assert.deepEqual(item(out[1].items, 'pushup').targets, [7, 7, 7]);
  });

  it('reports no change when nothing differs from the workout before', () => {
    const s = L.defaultState(D);
    s.levels.pushup.idx = 4; // last step of its ladder: it never promotes, so at 8 reps nothing moves
    L.finishWorkout(D, s, mkW(s, { pushup: [5, 5, 5] }), '2026-11-09', 0);
    L.finishWorkout(D, s, mkW(s, { pushup: [6, 6, 6] }), '2026-11-11', 0);
    L.finishWorkout(D, s, mkW(s, { pushup: [7, 7, 7] }), '2026-11-13', 0);
    L.finishWorkout(D, s, mkW(s, { pushup: [8, 8, 8] }), '2026-11-14', 0);
    const out = L.projectWorkouts(D, s, TODAY, 2);
    assert.equal(item(out[0].items, 'pushup').change, null);
  });
});
