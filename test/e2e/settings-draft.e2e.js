// Pull-up bar, timed holds, leave and resume, local-only mode with backup import, dark theme.
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { collectErrors, launchBrowser, newMobileContext, shot, startServer } from './helpers.js';

describe('settings, draft and backup', () => {
  let server, browser;
  const errors = [];
  let backup;

  before(async () => {
    server = await startServer();
    browser = await launchBrowser();
  });
  after(async () => {
    await browser?.close();
    await server?.stop();
  });

  async function newPage({ nodb = false, dark = false } = {}) {
    const ctx = await newMobileContext(browser, { colorScheme: dark ? 'dark' : 'light' });
    if (nodb) {
      // no server state: the app falls back to localStorage
      await ctx.route('**/api/state', (r) => r.fulfill({ status: 404, body: 'not found' }));
    }
    const pg = await ctx.newPage();
    // the 404 is the faked missing /api/state
    collectErrors(pg, errors, ['status of 404']);
    await pg.goto(server.url);
    await pg.waitForTimeout(500);
    return { ctx, pg };
  }

  it('1) with bar: pull-up, timed hold, skip, leave and continue', async () => {
    const { ctx, pg } = await newPage();
    const ok = (cond, name) => assert.ok(cond, name);
    const text = (sel) => pg.innerText(sel);
    const count = (sel) => pg.locator(sel).count();

    await pg.click('[data-act=tab][data-tab=settings]');
    await pg.click('[data-act=toggle-bar]');
    ok(
      (await pg.getAttribute('[data-act=toggle-bar]', 'aria-checked')) === 'true',
      'bar toggle switches on'
    );
    await pg.click('[data-act=tab][data-tab=today]');
    ok((await text('#app')).includes('Scapular pulls'), 'pull-up shows up with the bar');
    await pg.click('[data-act=start]');
    await pg.click('[data-act=w-begin]');
    ok((await text('.w-name')).includes('Scapular pulls'), 'first exercise is pull-up');
    await pg.click('[data-act=w-skip]');
    ok((await text('.w-name')).includes('Squat'), 'skipping goes to the squat');
    // open "How to" in the workout
    await pg.click('[data-act=w-info]');
    await pg.waitForTimeout(100);
    ok((await text('#sheet')).includes('How to'), 'sheet opens in workout');
    // switch level mid-workout (no set done yet)
    await pg.click('.ladder button >> nth=2');
    await pg.waitForTimeout(100);
    await pg.click('.sheet [data-act=sheet-close] >> nth=-1');
    ok((await text('.w-name')).includes('Split'), 'level switch in workout');
    ok((await text('.w-body')).includes('per side'), 'per side shows up');
    await pg.click('[data-act=w-log][data-hit="1"]'); // right side
    await pg.click('[data-act=w-log][data-hit="1"]'); // left side, which finishes the set
    // after logging, the level is locked
    await pg.click('[data-act=w-rest-skip]');
    await pg.click('[data-act=w-skip]'); // skip the next one (dip hold?) -> see which it is
    // leave and continue later
    await pg.click('[data-act=w-exit]');
    await pg.waitForTimeout(100);
    const sheet = await text('#sheet');
    ok(
      sheet.includes('Save and finish') && sheet.includes('continue later'),
      'leave menu shows options'
    );
    await pg.click('[data-act=w-leave]');
    await pg.waitForTimeout(100);
    ok((await text('#app')).includes('Continue workout'), 'back on Today with draft');
    await shot(pg, '10-draft');
    await pg.click('[data-act=resume]');
    await pg.waitForTimeout(100);
    ok((await count('.overlay')) === 1, 'resume returns to workout');
    // timed hold
    for (let i = 0; i < 40; i++) {
      if (await count('#holdTime')) break; // a hold starts its own timer on arrival
      if (await count('[data-act=w-log][data-hit="1"]'))
        await pg.click('[data-act=w-log][data-hit="1"]');
      if (await count('[data-act=w-rest-skip]')) await pg.click('[data-act=w-rest-skip]');
    }
    ok((await count('#holdTime')) === 1, 'reached a hold');
    await shot(pg, '11-hold');
    await pg.waitForTimeout(5300); // 3 s lead-in plus about 2 s of hold
    ok(/^\d+ s/.test(await text('#holdTime')), 'timer counts');
    await pg.click('[data-act=w-log][data-hit="0"]'); // "Stop, missed" logs the set and moves on
    await pg.waitForTimeout(100);
    ok(
      (await count('[data-act=w-rest-skip]')) === 1 || (await count('#holdTime')) === 1,
      'moves on after a missed hold'
    );
    // finish by saving
    await pg.click('[data-act=w-exit]');
    await pg.click('[data-act=w-finish]');
    await pg.waitForTimeout(200);
    ok((await text('.overlay')).includes('Workout complete'), 'summary shows on save');
    await shot(pg, '12-partial-summary', { fullPage: true });
    await pg.click('[data-act=w-close]');
    ok((await count('[data-act=resume]')) === 0, 'draft is gone after finishing');
    // progress: tapping a bar changes the caption
    await pg.click('[data-act=tab][data-tab=progress]');
    await pg.click('.gcard .bar >> nth=0', { force: true });
    ok(
      (await pg.locator('.gcard .chart-cap').first().innerText()) !== '',
      'tapping a bar shows caption'
    );
    await pg.click('[data-act=prog-tab][data-p=history]');
    ok((await count('details.sess')) === 1, 'history lists the workout');
    await pg.click('details.sess summary');
    await shot(pg, '13-history', { fullPage: true });
    // backup: export -> import in another context
    await pg.click('[data-act=tab][data-tab=settings]');
    backup = await pg.inputValue('#bk');
    ok(backup.includes('"sessions":[{'), 'backup has sessions');
    await ctx.close();
  });

  it('2) no server state (api/state 404): localStorage and backup import', async () => {
    assert.ok(backup, 'scenario 1 must run first');
    const { ctx, pg } = await newPage({ nodb: true });
    const ok = (cond, name) => assert.ok(cond, name);
    const count = (sel) => pg.locator(sel).count();
    const openHistory = async () => {
      await pg.click('[data-act=tab][data-tab=progress]');
      await pg.click('[data-act=prog-tab][data-p=history]');
    };

    await pg.click('[data-act=tab][data-tab=settings]');
    ok((await pg.innerText('.page-head')).includes('in this browser'), 'local mode notice');
    await pg.fill('#bk', backup);
    await pg.click('[data-act=import-bk]');
    await pg.waitForTimeout(100);
    await openHistory();
    ok((await count('details.sess')) === 1, 'import restores history');
    await pg.reload();
    await pg.waitForTimeout(400);
    await openHistory();
    ok((await count('details.sess')) === 1, 'local mode persists after reload');
    await pg.click('[data-act=tab][data-tab=settings]');
    await pg.fill('#bk', 'junk');
    await pg.click('[data-act=import-bk]');
    ok((await pg.innerText('#toast')).includes('Invalid'), 'invalid backup warns');
    await pg.click('[data-act=reset-ask]');
    await pg.click('[data-act=reset-do]');
    await pg.waitForTimeout(100);
    await openHistory();
    ok((await count('details.sess')) === 0, 'clear all resets');
    await ctx.close();
  });

  it('3) dark theme', async () => {
    const { ctx, pg } = await newPage({ dark: true });
    await shot(pg, '14-dark');
    await pg.click('[data-act=start]');
    await pg.click('[data-act=w-begin]');
    await shot(pg, '15-dark-set');
    await ctx.close();
  });

  it('no console or page errors', () => {
    assert.deepEqual(errors, []);
  });
});
