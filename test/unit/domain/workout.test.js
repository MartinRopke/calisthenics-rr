import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as L from '../../../src/domain/logic.js';
import { start, advance, readout, WORKOUT_VERSION } from '../../../src/domain/workout.js';

const T0 = new Date('2026-11-16T10:00:00').getTime(); // a Monday
const sec = (n) => n * 1000;

// Default state: 4 warmup items (the last, Dead bug, has a 30 s timer), 7 active exercises and 21 steps.
// Steps: squat, hinge (pair 2), row and pushup (pair 3), then the core trio. Plank is a hold,
// the Copenhagen plank a hold per side.
const fresh = () => L.defaultState();

// Sends events in order, carrying the clock. Returns the last result plus every sound played.
const run = (w, events, now = T0) => {
  let r = { workout: w, sounds: [], finished: undefined };
  const sounds = [];
  for (const e of events) {
    const ev = typeof e === 'string' ? { type: e } : e;
    r = advance(r.workout, ev, ev.at ?? now);
    sounds.push(...r.sounds);
    if (r.finished) break;
  }
  return { ...r, all: sounds };
};
const step = (w) => w.steps[w.i];
// A workout in its first set, the squat.
const inFirstSet = (state = fresh()) => advance(start(state, T0), { type: 'begin' }, T0).workout;

describe('starting a workout', () => {
  it('carries its warmup list, steps in workout order, levels, targets and rest times', () => {
    const s = fresh();
    const w = start(s, T0);
    assert.equal(w.v, WORKOUT_VERSION);
    assert.equal(w.startedAt, T0);
    assert.equal(w.phase, 'warmup');
    assert.deepEqual(
      w.warmup.map((x) => x.id),
      L.warmupItems(s).map((x) => x.id)
    );
    assert.deepEqual(w.steps.map((x) => x.slot + x.set).slice(0, 7), [
      'squat1',
      'squat2',
      'squat3',
      'hinge1',
      'hinge2',
      'hinge3',
      'row1',
    ]);
    assert.equal(w.steps.length, 21);
    assert.equal(w.logged.squat.level.name, 'Squat');
    assert.deepEqual(w.logged.squat.targets, [5, 5, 5]);
    assert.deepEqual(w.logged.squat.sets, []);
    assert.equal(w.logged.squat.rest, 90);
    assert.equal(w.logged.core_ex.rest, 60);
    assert.equal(w.logged.pullup, undefined);
  });

  it('does not depend on the state once started', () => {
    const s = fresh();
    const w = start(s, T0);
    s.settings.restMain = 300;
    s.levels.squat.idx = 5;
    assert.equal(w.logged.squat.rest, 90);
    assert.equal(w.logged.squat.level.name, 'Squat');
  });

  it('begin goes to the first set', () => {
    const w = inFirstSet();
    assert.equal(w.phase, 'set');
    assert.equal(step(w).slot, 'squat');
    assert.equal(step(w).set, 1);
  });
});

describe('logging sets and resting', () => {
  it('a hit stores the target, chimes and starts the rest from the settings', () => {
    const r = advance(inFirstSet(), { type: 'hit' }, T0);
    assert.deepEqual(r.workout.logged.squat.sets, [5]);
    assert.deepEqual(r.sounds, ['chime']);
    assert.equal(r.workout.phase, 'rest');
    const ro = readout(r.workout, T0 + sec(30));
    assert.equal(ro.phase, 'rest');
    assert.equal(ro.remaining, 60);
    assert.equal(ro.total, 90);
  });

  it('a miss stores one step below the target', () => {
    const r = advance(inFirstSet(), { type: 'miss' }, T0);
    assert.deepEqual(r.workout.logged.squat.sets, [4]);
  });

  it('a unilateral set counts after both sides and keeps the lower side', () => {
    const s = fresh();
    s.levels.squat.idx = 2; // Split squat, per side
    let r = advance(inFirstSet(s), { type: 'hit' }, T0);
    assert.equal(r.workout.phase, 'set');
    assert.equal(r.workout.side, 1);
    assert.deepEqual(r.workout.logged.squat.sets, []);
    assert.deepEqual(r.sounds, ['chime']);
    r = advance(r.workout, { type: 'miss' }, T0);
    assert.deepEqual(r.workout.logged.squat.sets, [4]);
    assert.equal(r.workout.phase, 'rest');
    r = run(inFirstSet(s), ['miss', 'hit']);
    assert.deepEqual(r.workout.logged.squat.sets, [4]);
  });

  it('a rest that runs out plays go and moves to the next set', () => {
    const w = advance(inFirstSet(), { type: 'hit' }, T0).workout;
    const r = advance(w, { type: 'tick' }, T0 + sec(90));
    assert.deepEqual(r.sounds, ['go']);
    assert.equal(r.workout.phase, 'set');
    assert.equal(step(r.workout).set, 2);
  });

  it('a rest that has not run out changes nothing', () => {
    const w = advance(inFirstSet(), { type: 'hit' }, T0).workout;
    const r = advance(w, { type: 'tick' }, T0 + sec(10));
    assert.equal(r.workout.phase, 'rest');
    assert.deepEqual(r.sounds, []);
  });

  it('+15 s adds to the rest and its total', () => {
    const w = run(inFirstSet(), ['hit', 'restAdd']).workout;
    const ro = readout(w, T0);
    assert.equal(ro.remaining, 105);
    assert.equal(ro.total, 105);
    assert.equal(advance(w, { type: 'tick' }, T0 + sec(100)).workout.phase, 'rest');
  });

  it('skipping the rest goes to the next set', () => {
    const r = run(inFirstSet(), ['hit', 'restSkip']);
    assert.equal(r.workout.phase, 'set');
    assert.equal(step(r.workout).set, 2);
  });

  it('readout names the next step during rest, past skipped exercises', () => {
    let w = run(inFirstSet(), ['hit', 'restSkip', 'hit', 'restSkip', 'hit']).workout; // squat 3 done
    assert.equal(w.steps[readout(w, T0).next].slot, 'hinge');
    w = run(inFirstSet(), ['skip', 'skip', 'hit']).workout; // squat and hinge skipped, row 1 done
    assert.equal(w.steps[readout(w, T0).next].slot, 'pushup');
  });
});

describe('skipping and going back', () => {
  it('skip leaves out every set of the exercise for today', () => {
    const r = run(inFirstSet(), ['skip']);
    assert.equal(step(r.workout).slot, 'hinge');
    assert.deepEqual(r.workout.skipped, ['squat']);
  });

  it('back from a rest returns to the set just logged and forgets its result', () => {
    const r = run(inFirstSet(), ['hit', 'back']);
    assert.equal(r.workout.phase, 'set');
    assert.equal(step(r.workout).set, 1);
    assert.deepEqual(r.workout.logged.squat.sets, []);
  });

  it('back from a set returns to the previous set', () => {
    const r = run(inFirstSet(), ['hit', 'restSkip', 'back']);
    assert.equal(step(r.workout).set, 1);
    assert.deepEqual(r.workout.logged.squat.sets, []);
  });

  it('back skips over exercises skipped today', () => {
    const w = run(inFirstSet(), [
      'hit',
      'restSkip',
      'hit',
      'restSkip',
      'hit',
      'restSkip',
      'skip',
    ]).workout;
    assert.equal(step(w).slot, 'row');
    const r = advance(w, { type: 'back' }, T0);
    assert.equal(step(r.workout).slot, 'squat');
    assert.equal(step(r.workout).set, 3);
  });

  it('back before the first set returns to the last warmup item', () => {
    const r = run(inFirstSet(), ['back']);
    assert.equal(r.workout.phase, 'warmup');
    assert.equal(r.workout.warmI, r.workout.warmup.length - 1);
  });
});

describe('finishing', () => {
  const doAll = (w) => {
    let r = { workout: w };
    while (r.workout.phase !== 'summary') {
      const ev = r.workout.phase === 'rest' ? 'restSkip' : 'hit';
      r = advance(r.workout, { type: ev }, T0 + sec(1800));
      if (r.finished) return r;
      // holds start on their own: log them straight away
    }
    return r;
  };

  it('the last set finishes the workout with the session', () => {
    const r = doAll(inFirstSet());
    assert.equal(r.workout.phase, 'summary');
    assert.equal(r.finished.session.date, '2026-11-16');
    assert.equal(r.finished.session.durationSec, 1800);
    assert.equal(Object.keys(r.finished.session.entries).length, 7);
    assert.deepEqual(r.finished.promotions, []);
  });

  it('skipping the last remaining exercise finishes', () => {
    let w = inFirstSet();
    for (let k = 0; k < 6; k++) w = advance(w, { type: 'skip' }, T0).workout;
    assert.equal(step(w).slot, 'core_ex');
    const r = advance(w, { type: 'skip' }, T0);
    assert.ok(r.finished);
    assert.equal(r.finished.session, null);
  });

  it('finish with no set logged saves no session', () => {
    const r = advance(start(fresh(), T0), { type: 'finish' }, T0 + sec(60));
    assert.equal(r.finished.session, null);
    assert.equal(r.finished.durationSec, 60);
  });

  it('finish saves what was done so far', () => {
    const r = run(inFirstSet(), ['hit', 'finish']);
    assert.deepEqual(r.finished.session.entries.squat.sets, [5]);
  });

  it('counts the warmup items done', () => {
    const r = run(start(fresh(), T0), [
      'warmNext',
      'warmSkip',
      'warmNext',
      'begin',
      'hit',
      'finish',
    ]);
    assert.equal(r.finished.session.warmup, 2);
  });

  it('reaching the top of a level on all three sets promotes it', () => {
    const s = fresh();
    for (const date of ['2026-11-04', '2026-11-06', '2026-11-09']) {
      const p = L.prescribe(s, 'squat');
      const logged = { squat: { levelId: p.level.id, sets: p.targets, targets: p.targets } };
      Object.assign(s, L.applyFinish(s, L.finishWorkout(s, { startedAt: 1, logged }, date, 0)));
    }
    const w = inFirstSet(s);
    assert.deepEqual(w.logged.squat.targets, [8, 8, 8]);
    const r = run(w, ['hit', 'restSkip', 'hit', 'restSkip', 'hit', 'finish']);
    assert.deepEqual(
      r.finished.promotions.map((p) => p.slot),
      ['squat']
    );
    assert.equal(r.finished.levels.squat.idx, s.levels.squat.idx + 1);
  });
});

describe('progress', () => {
  it('counts one unit per warmup item and per set', () => {
    let w = start(fresh(), T0);
    assert.deepEqual(readout(w, T0).progress, { done: 0, total: 25 });
    w = run(w, ['warmNext', 'warmNext']).workout;
    assert.deepEqual(readout(w, T0).progress, { done: 2, total: 25 });
    w = run(w, ['begin']).workout;
    assert.deepEqual(readout(w, T0).progress, { done: 4, total: 25 });
    w = run(w, ['hit']).workout;
    assert.deepEqual(readout(w, T0).progress, { done: 5, total: 25 });
    w = run(w, ['finish']).workout;
    assert.deepEqual(readout(w, T0).progress, { done: 25, total: 25 });
  });
});

// A workout at the plank (10 s hold), reached by skipping the four strength exercises at T0.
const atPlank = () => run(inFirstSet(), ['skip', 'skip', 'skip', 'skip']).workout;
// Ticks every 250 ms from `from` to `to` (ms after T0), like the timer loop. Returns the last result and all sounds.
const tickRange = (w, from, to) => {
  let r = { workout: w, sounds: [] };
  const all = [];
  for (let t = from; t <= to; t += 250) {
    r = advance(r.workout, { type: 'tick' }, T0 + t);
    all.push(...r.sounds.map((x) => [t, x]));
    if (r.finished) break;
  }
  return { ...r, all };
};
const roundTrip = (w) => JSON.parse(JSON.stringify(w));

describe('holds', () => {
  it('start on their own after a 3, 2, 1 countdown', () => {
    const w = atPlank();
    assert.equal(step(w).slot, 'core_ae');
    let ro = readout(w, T0 + 500);
    assert.equal(ro.countdown, 3);
    assert.equal(ro.total, 10);
    ro = readout(w, T0 + sec(3) + 500);
    assert.equal(ro.countdown, 0);
    assert.equal(ro.remaining, 9.5);
  });

  it('play tick on 3, 2, 1, go at the start, tick on the last 3 s and log themselves as a hit', () => {
    const r = tickRange(atPlank(), 0, sec(13));
    assert.deepEqual(r.all, [
      [0, 'tick'],
      [1000, 'tick'],
      [2000, 'tick'],
      [3000, 'go'],
      [10000, 'tick'],
      [11000, 'tick'],
      [12000, 'tick'],
      [13000, 'chime'],
    ]);
    assert.deepEqual(r.workout.logged.core_ae.sets, [10]);
    assert.equal(r.workout.phase, 'rest');
  });

  it('tick on the last 3 s of a long hold only once each', () => {
    const s = fresh();
    s.sessions.push({
      id: 'x',
      date: '2026-11-13',
      entries: { core_ae: { levelId: 'core_ae.plank', sets: [25, 25, 25], targets: [25, 25, 25] } },
    });
    const r = tickRange(
      run(inFirstSet(s), ['skip', 'skip', 'skip', 'skip']).workout,
      sec(3),
      sec(33)
    );
    assert.deepEqual(r.all, [
      [3000, 'go'],
      [30000, 'tick'],
      [31000, 'tick'],
      [32000, 'tick'],
      [33000, 'chime'],
    ]);
  });

  it('a hold after a rest starts at once: the rest already counted 3, 2, 1', () => {
    const w = run(atPlank(), ['hit']).workout; // plank 1 done, rest 60 s, then the Copenhagen plank
    const r = tickRange(w, sec(57), sec(61));
    assert.deepEqual(r.all, [
      [57000, 'tick'],
      [58000, 'tick'],
      [59000, 'tick'],
      [60000, 'go'],
    ]);
    assert.equal(readout(r.workout, T0 + sec(61)).countdown, 0);
  });

  it('a hold per side gives the switch time before the second side', () => {
    let w = run(atPlank(), ['hit', 'restSkip']).workout; // Copenhagen plank, right side
    assert.equal(step(w).slot, 'core_ar');
    w = advance(w, { type: 'hit' }, T0).workout;
    assert.equal(w.side, 1);
    assert.equal(readout(w, T0).countdown, 15);
    const r = tickRange(w, sec(12), sec(25));
    assert.deepEqual(
      r.all.map((x) => x[1]),
      ['tick', 'tick', 'tick', 'go', 'tick', 'tick', 'tick', 'chime']
    );
    assert.deepEqual(r.workout.logged.core_ar.sets, [10]);
  });

  it('Start timer on a hold counts 3, 2, 1 again', () => {
    const w = run(atPlank(), ['back', 'skip']).workout; // back to pushup 3, skip it: plank again
    const r = advance(w, { type: 'holdStart' }, T0 + sec(30));
    assert.equal(readout(r.workout, T0 + sec(30)).countdown, 3);
  });

  it('a cue never plays twice for the same second, even after a draft round trip', () => {
    const w = atPlank();
    const a = advance(w, { type: 'tick' }, T0 + 100);
    assert.deepEqual(a.sounds, ['tick']);
    const b = advance(roundTrip(a.workout), { type: 'tick' }, T0 + 400);
    assert.deepEqual(b.sounds, []);
  });
});

describe('warmup', () => {
  // Dead bug is the 4th item, with a 30 s timer.
  const atDeadBug = () => run(start(fresh(), T0), ['warmNext', 'warmNext', 'warmNext']).workout;

  it('Done marks the item, chimes and moves on', () => {
    const r = advance(start(fresh(), T0), { type: 'warmNext' }, T0);
    assert.deepEqual(r.sounds, ['chime']);
    assert.equal(r.workout.warmI, 1);
  });

  it('a timed item reached with Done starts its timer after a 3, 2, 1', () => {
    const w = atDeadBug();
    assert.equal(w.warmup[w.warmI].secs, 30);
    const ro = readout(w, T0 + 500);
    assert.equal(ro.countdown, 3);
    assert.equal(ro.total, 30);
  });

  it('a timed item counts down with beeps and moves on by itself', () => {
    const r = tickRange(atDeadBug(), 0, sec(33));
    assert.deepEqual(
      r.all.map((x) => x[1]),
      ['tick', 'tick', 'tick', 'go', 'tick', 'tick', 'tick', 'chime']
    );
    assert.equal(r.workout.phase, 'set');
    assert.equal(step(r.workout).slot, 'squat');
  });

  it('skip onto a timed item starts its timer, back does not', () => {
    let w = run(start(fresh(), T0), ['warmSkip', 'warmSkip', 'warmSkip']).workout;
    assert.equal(readout(w, T0).countdown, 3);
    w = advance(w, { type: 'warmBack' }, T0).workout;
    assert.equal(w.warmI, 2);
    assert.equal(readout(w, T0).remaining, null);
    w = advance(w, { type: 'warmTimer' }, T0).workout;
    assert.equal(readout(w, T0).remaining, null, 'an item without a time has no timer');
  });

  it('Start timer starts the timer of a timed item', () => {
    const w = run(start(fresh(), T0), [
      'warmSkip',
      'warmSkip',
      'warmSkip',
      'warmBack',
      'warmSkip',
    ]).workout;
    const r = advance(w, { type: 'warmTimer' }, T0 + sec(60));
    assert.equal(readout(r.workout, T0 + sec(60)).countdown, 3);
  });

  it('the adjust is refused during the countdown', () => {
    const w = atDeadBug();
    const r = advance(w, { type: 'warmAdjust', d: 20 }, T0 + sec(1));
    assert.equal(readout(r.workout, T0 + sec(1)).total, 30);
  });

  it('the adjust changes the goal after the countdown, never below what has passed', () => {
    const w = atDeadBug();
    let r = advance(w, { type: 'warmAdjust', d: 20 }, T0 + sec(5));
    assert.equal(readout(r.workout, T0 + sec(5)).total, 50);
    assert.equal(readout(r.workout, T0 + sec(5)).remaining, 48);
    r = advance(w, { type: 'warmAdjust', d: -20 }, T0 + sec(25)); // 22 s passed: 10 s would be below
    assert.equal(readout(r.workout, T0 + sec(25)).total, 30);
    r = advance(w, { type: 'warmAdjust', d: -20 }, T0 + sec(8)); // 5 s passed: 10 s is fine
    assert.equal(readout(r.workout, T0 + sec(8)).total, 10);
  });

  it('a swap replaces the warmup list and keeps the position', () => {
    const s = fresh();
    const w = start(s, T0);
    s.settings.warmAlt = { shoulder: 'shoulder_wall' };
    const r = advance(w, { type: 'warmSwap', warmup: L.warmupItems(s) }, T0);
    assert.equal(r.workout.warmup[0].id, 'shoulder_wall');
    assert.equal(r.workout.warmI, 0);
  });
});

describe('pause', () => {
  it('freezes the rest and keeps the time left on resume', () => {
    const w = run(inFirstSet(), ['hit']).workout; // rest 90 s from T0
    const p = advance(w, { type: 'pause' }, T0 + sec(65)).workout; // 25 s left
    assert.equal(readout(p, T0 + sec(500)).remaining, 25);
    assert.equal(advance(p, { type: 'tick' }, T0 + sec(500)).workout.phase, 'rest');
    const r = advance(p, { type: 'pause' }, T0 + sec(500)).workout;
    assert.equal(r.pausedAt, null);
    assert.equal(readout(r, T0 + sec(500)).remaining, 25);
    assert.equal(advance(r, { type: 'tick' }, T0 + sec(525)).workout.phase, 'set');
  });

  it('freezes a hold still in its countdown', () => {
    const w = advance(atPlank(), { type: 'pause' }, T0 + sec(1)).workout;
    const r = advance(w, { type: 'pause' }, T0 + sec(11)).workout;
    assert.equal(readout(r, T0 + sec(11)).countdown, 2);
  });

  it('freezes a warmup timer', () => {
    const w = run(start(fresh(), T0), ['warmNext', 'warmNext', 'warmNext']).workout; // Dead bug, 3 + 30 s
    const p = advance(w, { type: 'pause' }, T0 + sec(13)).workout; // 20 s left
    assert.equal(readout(p, T0 + sec(99)).remaining, 20);
    const r = advance(p, { type: 'pause' }, T0 + sec(99)).workout;
    assert.equal(readout(r, T0 + sec(99)).remaining, 20);
  });

  it('leaves idle timers alone', () => {
    const w = inFirstSet();
    const r = run(w, [
      { type: 'pause', at: T0 },
      { type: 'pause', at: T0 + sec(9) },
    ]).workout;
    assert.equal(r.restEnd, 0);
    assert.equal(r.holdStart, null);
  });

  it('a logged set or a move ends the pause', () => {
    const w = advance(inFirstSet(), { type: 'pause' }, T0).workout;
    assert.equal(advance(w, { type: 'hit' }, T0).workout.pausedAt, null);
  });
});

describe('changing a level during the workout', () => {
  const prescriptionAt = (idx) => {
    const s = fresh();
    s.levels.squat.idx = idx;
    const p = L.prescribe(s, 'squat');
    return {
      type: 'changeLevel',
      slot: 'squat',
      idx,
      prescription: { level: p.level, targets: p.targets },
    };
  };

  it('on the current exercise gives that level and its targets right away', () => {
    const w = run(inFirstSet(), [prescriptionAt(2)]).workout;
    assert.equal(w.logged.squat.level.name, 'Split squat');
    assert.deepEqual(w.logged.squat.targets, [5, 5, 5]);
    assert.equal(w.levels.squat.idx, 2);
    assert.equal(w.value, 5);
    assert.equal(w.logged.squat.rest, 90);
  });

  it('on another exercise resets its sets and targets', () => {
    const s = fresh();
    const w = run(inFirstSet(s), ['hit', 'restSkip', 'hit', 'restSkip', 'hit', 'restSkip']).workout;
    assert.equal(step(w).slot, 'hinge');
    const r = advance(w, prescriptionAt(2), T0).workout;
    assert.deepEqual(r.logged.squat.sets, []);
    assert.equal(step(r).slot, 'hinge');
    const f = advance(r, { type: 'finish' }, T0).finished;
    assert.equal(f.session, null);
    assert.equal(f.levels.squat.idx, 2);
  });
});

describe('resuming a draft', () => {
  it('a rest that ran out while away moves to the next set on the first tick', () => {
    const w = roundTrip(run(inFirstSet(), ['hit']).workout);
    const r = advance(w, { type: 'tick' }, T0 + sec(3600));
    assert.equal(r.workout.phase, 'set');
    assert.equal(step(r.workout).set, 2);
  });

  it('a rest that ran out before the last set lands on that set', () => {
    let w = inFirstSet();
    for (let k = 0; k < 6; k++) w = advance(w, { type: 'skip' }, T0).workout;
    w = run(w, ['hit', 'restSkip', 'hit']).workout; // core_ex 1 and 2 done
    assert.equal(w.phase, 'rest');
    const r = advance(roundTrip(w), { type: 'tick' }, T0 + sec(3600));
    assert.equal(step(r.workout).set, 3);
  });
});
