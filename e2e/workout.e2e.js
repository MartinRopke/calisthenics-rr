// Full workout against a real server: warmup, every set, summary, persistence on the server.
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { collectErrors, launchBrowser, newMobileContext, shot, startServer } from './helpers.js';

describe('full workout', () => {
  let server, browser;
  before(async () => {
    server = await startServer();
    browser = await launchBrowser();
  });
  after(async () => {
    await browser?.close();
    await server?.stop();
  });

  it('runs a whole workout and keeps the history on the server', async () => {
    const errors = [];
    const ctx = await newMobileContext(browser);
    const page = await ctx.newPage();
    collectErrors(page, errors);
    const text = (sel) => page.locator(sel).innerText();
    const count = (sel) => page.locator(sel).count();

    await page.goto(server.url);
    await page.waitForTimeout(600);
    await shot(page, '01-today', { fullPage: true });

    // exercise sheet
    await page.click('[data-act=open-ex][data-slot=pushup]');
    await page.waitForTimeout(200);
    await shot(page, '02-sheet');
    await page.click('.sheet [data-act=sheet-close] >> nth=-1');

    // settings
    await page.click('[data-act=tab][data-tab=settings]');
    await shot(page, '03-settings', { fullPage: true });
    await page.click('[data-act=tab][data-tab=today]');

    // workout
    await page.click('[data-act=start]');
    await page.waitForTimeout(200);
    await shot(page, '04-warmup');
    assert.equal(await count('.vid-box iframe'), 1); // warmup video
    await shot(page, '04-warmup');
    for (let i = 0; i < 3; i++) await page.click('[data-act=w-warm-next]');
    assert.ok((await text('.w-name')).includes('Deadbugs'));
    await page.waitForTimeout(1200); // next-ing onto a timed item starts its timer by itself, with a 3, 2, 1 lead-in
    assert.ok(['3', '2', '1'].includes(await text('#warmTime')));
    await page.waitForTimeout(3300);
    assert.ok(['30 s', '29 s', '28 s'].includes(await text('#warmTime')));
    await shot(page, '04b-warmup-timer');
    await page.click('[data-act=w-warm-back]');
    assert.ok((await text('.w-name')).includes('GMB'));
    await page.click('[data-act=w-warm-skip]');
    await page.click('[data-act=w-warm-next]');
    await page.waitForTimeout(200);
    await shot(page, '05-set');

    let steps = 0;
    let shotRest = false;
    for (;;) {
      // If there are still sets
      if ((await count('[data-act=w-log]')) === 0 && (await count('[data-act=w-hold-stop]')) === 0)
        break;
      const name = await text('.w-name');
      // diamond push-up: raise to 8 on all sets to test promotion
      if (name.startsWith('Diamond push-up')) {
        for (let i = 0; i < 3; i++) await page.click('[data-act=w-val][data-d="1"]');
      }
      // a hold starts its own timer on arrival, so stop it first to get the Set done button
      if (await count('[data-act=w-hold-stop]')) await page.click('[data-act=w-hold-stop]');
      await page.click('[data-act=w-log]');
      steps++;
      if (await count('#restTime')) {
        if (!shotRest) {
          assert.equal(await count('.next-up .vid-box iframe'), 1); // next exercise video
          await shot(page, '06-rest');
          shotRest = true;
          const src = await page.locator('.next-up iframe').getAttribute('src');
          assert.ok(src.includes('youtube-nocookie.com/embed/'), src);
          await page.waitForTimeout(1300); // the timer keeps going and the player stays
          assert.equal(await count('.next-up iframe'), 1);
          await shot(page, '06b-rest-video');
        }
        await page.click('[data-act=w-rest-skip]');
      }
      await page.waitForTimeout(30);
      if (steps > 60) break;
    }
    await page.waitForTimeout(200);
    await shot(page, '07-summary', { fullPage: true });
    console.log('sets logged:', steps);
    console.log('summary:', (await text('.w-body')).replace(/\n/g, ' | ').slice(0, 400));
    await page.click('[data-act=w-close]');
    await page.waitForTimeout(200);
    await shot(page, '08-today-after', { fullPage: true });
    await page.click('[data-act=tab][data-tab=progress]');
    await shot(page, '09-progress', { fullPage: true });

    const saved = await page.evaluate(() => fetch('/api/state').then((r) => r.json()));
    console.log('keys saved by the server:', Object.keys(saved).sort());
    assert.ok(Object.keys(saved).length > 0, 'server saved no state');
    // reload: does data persist (server file only)?
    await page.evaluate(() => localStorage.removeItem('treinoRR.v1'));
    await page.reload();
    await page.waitForTimeout(600);
    await page.click('[data-act=tab][data-tab=progress]');
    console.log(
      'after reload (server only):',
      (await page.innerText('#app')).replace(/\n/g, ' | ').slice(0, 200)
    );
    await page.click('[data-act=tab][data-tab=today]');
    console.log(
      'push-up level now:',
      await text('[data-act=open-ex][data-slot=pushup] .ex-name'),
      '|',
      await text('[data-act=open-ex][data-slot=pushup] .ex-target')
    );
    await ctx.close();
    assert.deepEqual(errors, []);
  });
});
