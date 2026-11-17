import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as D from '../domain/data.js';
import * as L from '../domain/logic.js';
import * as V from './views.js';

const NOW = new Date('2026-03-04T10:00:00'); // a Wednesday
const TODAY = '2026-03-04';

const fresh = () => L.defaultState(D);

// Adds a finished workout: sets is {slot: [reps...]}, using the current prescription for targets.
const addSession = (state, date, sets) => {
  const logged = {};
  Object.keys(sets).forEach((slot) => {
    const p = L.prescribe(D, state, slot);
    logged[slot] = { levelId: p.level.id, sets: sets[slot], targets: p.targets };
  });
  L.finishWorkout(D, state, { startedAt: 1, logged, warmDone: 4 }, date, 1800);
};

const today = (state, o) =>
  V.viewToday(state, { today: TODAY, now: NOW, draft: null, dayIdx: 0, ...o });
const progress = (state, o) => V.viewProgress(state, { today: TODAY, progTab: 'overview', ...o });
const settings = (state, o) => V.viewSettings(state, { syncNote: 'Saved to your account.', ...o });

const assertClean = (html) => {
  assert.ok(!html.includes('undefined'), 'output contains "undefined"');
  assert.ok(!html.includes('NaN'), 'output contains "NaN"');
  assert.ok(!html.includes('[object'), 'output contains "[object"');
};

const count = (html, needle) => html.split(needle).length - 1;

describe('small helpers', () => {
  it('esc escapes HTML special characters', () => {
    assert.equal(V.esc('<a href="x">&\'</a>'), '&lt;a href=&quot;x&quot;&gt;&amp;&#39;&lt;/a&gt;');
  });

  it('shortDate turns ISO into dd/mm', () => {
    assert.equal(V.shortDate('2026-03-04'), '04/03');
  });

  it('equipHtml shows the Needs line only when equip is set', () => {
    assert.equal(V.equipHtml({ equip: '' }), '');
    const html = V.equipHtml({ equip: 'low bar or rings' });
    assert.ok(html.includes('Needs: low bar or rings'));
    assert.ok(html.includes('class="ex-equip"'));
    assert.ok(html.includes(V.ICON_EQUIP));
    assert.ok(V.equipHtml({ equip: '<b>' }).includes('Needs: &lt;b&gt;'));
  });

  it('targetHtml collapses equal targets and lists unequal ones', () => {
    assert.equal(V.targetHtml({ kind: 'reps' }, [5, 5, 5]), '3 × 5<small>reps</small>');
    assert.equal(V.targetHtml({ kind: 'reps' }, [6, 5, 5]), '6 · 5 · 5<small>reps</small>');
    assert.equal(V.targetHtml({ kind: 'hold' }, [10, 10, 10]), '3 × 10<small>s</small>');
    assert.equal(
      V.targetHtml({ kind: 'hold', perSide: true }, [10, 10, 10]),
      '3 × 10<small>s per side</small>'
    );
    assert.equal(
      V.targetHtml({ kind: 'reps', perSide: true }, [5, 5, 5]),
      '3 × 5<small>per side</small>'
    );
  });

  it('levelText and rungsHtml follow the level index', () => {
    const s = fresh();
    const n = L.ladderOf(D, s, 'pushup').length;
    assert.equal(V.levelText(s, 'pushup'), 'Level ' + (s.levels.pushup.idx + 1) + ' of ' + n);
    const rungs = V.rungsHtml(s, 'pushup');
    assert.equal(count(rungs, 'class="rung '), n);
    assert.equal(count(rungs, 'rung cur'), 1);
    assert.equal(count(rungs, 'rung done'), s.levels.pushup.idx);
  });

  it('metaLine adds the slot label only when it differs from the level name', () => {
    const s = fresh();
    const S = D.SLOTS.pushup,
      lvl = L.currentLevel(D, s, 'pushup');
    const meta = V.metaLine(s, S, lvl, 'pushup');
    assert.ok(meta.endsWith(V.levelText(s, 'pushup')));
    assert.equal(meta.includes(' · '), S.label.toLowerCase() !== lvl.name.toLowerCase());
    const same = V.metaLine(s, { label: lvl.name }, lvl, 'pushup');
    assert.equal(same, V.levelText(s, 'pushup'));
  });

  it('stepper builds minus and plus buttons around the value', () => {
    const html = V.stepper('rest-main', 'rm', 90, ' s');
    assert.ok(html.includes('data-act="rest-main" data-d="-1"'));
    assert.ok(html.includes('data-act="rest-main" data-d="1"'));
    assert.ok(html.includes('id="rm">90 s</span>'));
  });

  it('barChart draws one bar per item, a goal line and a caption', () => {
    const html = V.barChart(
      [
        { v: 2, label: '01/03', cap: 'two' },
        { v: 3, label: '08/03', cap: 'three', up: true },
      ],
      { goal: 3, min: 3, valueLabels: true, aria: 'Chart', defaultCap: 'Tap a bar.', h: 100 }
    );
    assert.equal(count(html, 'data-act="bar"'), 2);
    assert.ok(html.includes('class="bar up"'));
    assert.ok(html.includes('goal 3'));
    assert.ok(html.includes('aria-label="Chart"'));
    assert.ok(html.includes('Tap a bar.'));
    assertClean(html);
  });

  it('tabbar marks only the current tab', () => {
    const html = V.tabbar('progress');
    assert.equal(count(html, 'aria-current="page"'), 1);
    assert.ok(html.includes('data-tab="progress" aria-current="page"'));
    ['today', 'progress', 'settings'].forEach((t) =>
      assert.ok(html.includes('data-tab="' + t + '"'))
    );
  });
});

describe('viewToday', () => {
  it('lists the warm-up, three pairs and the core trio', () => {
    const html = today(fresh());
    assertClean(html);
    assert.ok(html.includes('<h1>Today</h1>'));
    assert.ok(html.includes('Wednesday, March 4'));
    assert.ok(html.includes('data-act="start"'));
    assert.ok(html.includes('Warm-up'));
    ['Pair 1 of 3', 'Pair 2 of 3', 'Pair 3 of 3', '>Core<'].forEach((x) =>
      assert.ok(html.includes(x), x)
    );
    assert.ok(html.includes('3 sets, 90 s rest'));
    assert.ok(html.includes('3 sets, 60 s rest'));
    assert.ok(html.includes('Diamond push-up'));
    assert.ok(html.includes('3 × 5<small>reps</small>'));
  });

  it('hides the pull-up unless settings.hasBar is on', () => {
    const s = fresh();
    const off = today(s);
    assert.ok(off.includes('Unlocks when you have the bar'));
    assert.ok(off.includes('class="ex off" data-act="open-ex" data-slot="pullup"'));
    assert.ok(!off.includes('class="ex" data-act="open-ex" data-slot="pullup"'));
    assert.ok(!off.includes('Scapular pulls'));
    s.settings.hasBar = true;
    const on = today(s);
    assert.ok(!on.includes('class="ex off" data-act="open-ex" data-slot="pullup"'));
    assert.ok(on.includes('class="ex" data-act="open-ex" data-slot="pullup"'));
    assert.ok(on.includes('Scapular pulls'));
    assertClean(on);
  });

  it('shows the Needs line only for levels with equip', () => {
    const s = fresh();
    s.settings.hasBar = true;
    s.settings.hasDip = true;
    const html = today(s);
    const withEquip = D.SLOT_ORDER.filter((slot) => L.currentLevel(D, s, slot).equip).length;
    const warmEquip = L.warmupItems(D, s).filter((it) => it.equip).length;
    assert.equal(count(html, 'class="ex-equip"'), withEquip + warmEquip);
    D.SLOT_ORDER.forEach((slot) => {
      const lvl = L.currentLevel(D, s, slot);
      if (lvl.equip) assert.ok(html.includes('Needs: ' + V.esc(lvl.equip)), slot);
    });
    // a level without equip renders no Needs line at all
    const none = D.SLOT_ORDER.map((slot) => L.currentLevel(D, s, slot)).find((l) => !l.equip);
    if (none) assert.equal(V.equipHtml(none), '');
  });

  it('shows the week pips from the sessions this week', () => {
    const s = fresh();
    addSession(s, '2026-03-02', { pushup: [5, 5, 5] });
    const html = today(s);
    assert.ok(html.includes('1 of 3 this week'));
    assert.equal(count(html, 'pip on'), 1);
    assert.ok(html.includes('Last workout: '));
  });

  it('shows the continue button when there is a draft', () => {
    const html = today(fresh(), { draft: { startedAt: Date.now(), steps: [] } });
    assert.ok(html.includes('data-act="resume"'));
    assert.ok(html.includes('data-act="discard-draft"'));
    assert.ok(!html.includes('data-act="start"'));
  });

  it('shows the done card and a repeat button after a workout today', () => {
    const s = fresh();
    addSession(s, TODAY, { pushup: [5, 5, 5], squat: [5, 5, 5] });
    const html = today(s);
    assert.ok(html.includes('Workout done today'));
    assert.ok(html.includes('2 exercises'));
    assert.ok(html.includes('30 min'));
    assert.ok(html.includes('Repeat workout'));
    assert.ok(html.includes('Next workout'));
    assertClean(html);
  });

  it('offers today plus upcoming days, and previews a future day', () => {
    const s = fresh();
    const html = today(s);
    assert.equal(count(html, 'data-act="pick-day"'), 4);
    assert.ok(html.includes('data-act="pick-day" data-i="0" aria-pressed="true"'));
    const preview = today(s, { dayIdx: 1 });
    assertClean(preview);
    assert.ok(preview.includes('data-act="pick-day" data-i="1" aria-pressed="true"'));
    assert.ok(preview.includes('Preview. Targets assume'));
    assert.ok(preview.includes('data-lvl="'));
  });

  it('puts the escaped level names in the exercise rows', () => {
    const s = fresh();
    const html = today(s);
    D.SLOT_ORDER.forEach((slot) => {
      if (!L.isActive(D, s, slot)) return;
      assert.ok(html.includes('data-act="open-ex" data-slot="' + slot + '"'), slot);
      assert.ok(html.includes(V.esc(L.currentLevel(D, s, slot).name)), slot);
    });
  });
});

describe('viewProgress', () => {
  it('shows stats, the weekly chart and a card per exercise', () => {
    const s = fresh();
    const html = progress(s);
    assertClean(html);
    assert.ok(html.includes('<h1>Progress</h1>'));
    assert.ok(html.includes('data-act="prog-tab" data-p="overview" aria-pressed="true"'));
    assert.ok(html.includes('data-act="prog-tab" data-p="history" aria-pressed="false"'));
    assert.ok(html.includes('0</b><span>workouts'));
    assert.ok(html.includes('Workouts per week'));
    assert.ok(html.includes('goal 3'));
    D.SLOT_ORDER.forEach((slot) => assert.ok(html.includes('id="pc-' + slot + '"'), slot));
    assert.ok(html.includes('No records yet.'));
    assert.ok(html.includes('Waiting for the equipment.'));
  });

  it('counts workouts and level ups and draws bars from the history', () => {
    const s = fresh();
    addSession(s, '2026-03-02', { pushup: [5, 5, 5] });
    addSession(s, '2026-03-04', { pushup: [8, 8, 8] });
    const html = progress(s);
    assertClean(html);
    assert.ok(html.includes('2</b><span>workouts'));
    assert.ok(html.includes('1</b><span>level up'));
    assert.ok(html.includes('class="bar up"'));
    assert.ok(html.includes('moved up to '));
    assert.ok(html.includes('04/03'));
  });

  it('history tab lists workouts newest first with a delete button', () => {
    const empty = progress(fresh(), { progTab: 'history' });
    assert.ok(empty.includes('Workouts you finish show up here.'));
    const s = fresh();
    addSession(s, '2026-03-02', { pushup: [5, 5, 5] });
    addSession(s, '2026-03-04', { pushup: [8, 8, 8] });
    const html = progress(s, { progTab: 'history' });
    assertClean(html);
    assert.equal(count(html, '<details class="sess">'), 2);
    assert.ok(html.indexOf('04/03') < html.indexOf('02/03'));
    assert.equal(count(html, 'data-act="sess-del-ask"'), 2);
    assert.ok(html.includes('level up</span>'));
    assert.ok(html.includes('1 exercises') && html.includes('30 min'));
  });
});

describe('viewSettings', () => {
  it('shows the sync note, switches and steppers', () => {
    const s = fresh();
    const html = settings(s);
    assertClean(html);
    assert.ok(html.includes('<h1>Settings</h1><p>Saved to your account.</p>'));
    assert.ok(
      html.includes('aria-checked="false" aria-label="I have a pull-up bar" data-act="toggle-bar"')
    );
    assert.ok(
      html.includes(
        'aria-checked="false" aria-label="I have a safe dip setup" data-act="toggle-dip"'
      )
    );
    assert.ok(html.includes('id="rm">90 s</span>'));
    assert.ok(html.includes('id="rc">60 s</span>'));
    s.settings.hasBar = true;
    assert.ok(settings(s).includes('aria-checked="true" aria-label="I have a pull-up bar"'));
  });

  it('has a path picker for each core exercise with the current one pressed', () => {
    const s = fresh();
    const html = settings(s);
    ['core_ae', 'core_ar', 'core_ex'].forEach((slot) => {
      const paths = D.LADDERS[slot].paths;
      Object.keys(paths).forEach((k) => {
        const pressed = k === s.levels[slot].path;
        assert.ok(
          html.includes(
            'data-act="set-path" data-slot="' +
              slot +
              '" data-path="' +
              k +
              '" aria-pressed="' +
              pressed +
              '"'
          ),
          slot + k
        );
      });
    });
  });

  it('puts an escaped JSON backup in the textarea', () => {
    const s = fresh();
    const html = settings(s);
    const m = html.match(/<textarea id="bk"[^>]*>([\s\S]*?)<\/textarea>/);
    assert.ok(m);
    const json = m[1]
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&');
    const back = JSON.parse(json);
    assert.equal(back.v, 1);
    assert.deepEqual(back.settings, s.settings);
    assert.ok(
      html.includes('data-act="copy-bk"') &&
        html.includes('data-act="import-bk"') &&
        html.includes('data-act="reset-ask"')
    );
  });

  it('escapes the sync note', () => {
    assert.ok(settings(fresh(), { syncNote: '<b>x</b>' }).includes('<p>&lt;b&gt;x&lt;/b&gt;</p>'));
  });
});
