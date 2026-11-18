// Layout regressions on desktop-sized windows: the video card must stay inside its space, and the
// yellow "then: ..." label must not break across lines.
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import * as D from '../../src/domain/data.js';
import * as L from '../../src/domain/logic.js';
import { launchBrowser, startServer } from './helpers.js';

const rect = (page, sel) =>
  page.evaluate((s) => {
    const r = document.querySelector(s)?.getBoundingClientRect();
    return r && { top: r.top, bottom: r.bottom };
  }, sel);

describe('layout on a desktop window', () => {
  let server, browser;
  before(async () => {
    server = await startServer();
    browser = await launchBrowser();
  });
  after(async () => {
    await browser?.close();
    await server?.stop();
  });

  const open = async (viewport) => {
    const ctx = await browser.newContext({ viewport, colorScheme: 'dark' });
    const page = await ctx.newPage();
    await page.goto(server.url);
    await page.waitForTimeout(700); // the screen slides in at first
    return { ctx, page };
  };

  for (const viewport of [
    { width: 577, height: 827 },
    { width: 577, height: 700 },
    { width: 1280, height: 800 },
    { width: 1440, height: 900 },
  ]) {
    it(`keeps the warm-up video clear of the swap chips and the buttons at ${viewport.width}x${viewport.height}`, async () => {
      const { ctx, page } = await open(viewport);
      await page.click('[data-act=start]');
      await page.waitForTimeout(700);
      await page.locator('[data-act=warm-swap]').last().dispatchEvent('click'); // the longest warm-up screen; it may sit behind the video
      await page.waitForTimeout(300);
      const swap = await rect(page, '.swap');
      const box = await rect(page, '.vid-box');
      const links = await rect(page, '.w-links');
      assert.ok(
        box.top >= swap.bottom - 1,
        `video starts at ${box.top}, swap chips end at ${swap.bottom}`
      );
      assert.ok(
        box.bottom <= links.top + 1,
        `video ends at ${box.bottom}, buttons start at ${links.top}`
      );
      await ctx.close();
    });
  }

  it('keeps the set screen video clear of the buttons in a short window', async () => {
    const { ctx, page } = await open({ width: 577, height: 600 });
    await page.click('[data-act=start]');
    await page.click('[data-act=w-begin]');
    await page.waitForTimeout(700);
    const box = await rect(page, '.vid-box');
    const links = await rect(page, '.w-links');
    assert.ok(
      box.bottom <= links.top + 1,
      `video ends at ${box.bottom}, buttons start at ${links.top}`
    );
    await ctx.close();
  });

  for (const viewport of [
    { width: 577, height: 827 },
    { width: 577, height: 650 },
    { width: 1280, height: 800 },
  ]) {
    it(`gives the set and rest videos a tight card with breathing room at ${viewport.width}x${viewport.height}`, async () => {
      const { ctx, page } = await open(viewport);
      const gaps = () =>
        page.evaluate(() => {
          const box = document.querySelector('.vid-box').getBoundingClientRect();
          const cap = document.querySelector('.vid-box .vid-cap').getBoundingClientRect();
          const prev = document.querySelector('.vid-box').previousElementSibling;
          const above = prev ? box.top - prev.getBoundingClientRect().bottom : 99;
          const below = document.querySelector('.w-links')
            ? document.querySelector('.w-links').getBoundingClientRect().top - box.bottom
            : 99;
          return { empty: box.bottom - cap.bottom, above, below };
        });
      await page.click('[data-act=start]');
      await page.click('[data-act=w-begin]');
      await page.waitForTimeout(700);
      const set = await gaps();
      assert.ok(set.empty <= 2, `empty space inside the set video card: ${set.empty}px`);
      assert.ok(set.above >= 8, `set video is ${set.above}px below the controls`);
      assert.ok(set.below >= 8, `set video is ${set.below}px above the buttons`);
      await page.locator('[data-act=w-log][data-hit="1"]').click();
      await page.waitForTimeout(500);
      const rest = await gaps();
      assert.ok(rest.empty <= 2, `empty space inside the rest video card: ${rest.empty}px`);
      assert.ok(rest.above >= 8, `rest video is ${rest.above}px below the chips`);
      assert.ok(rest.below >= 8, `rest video is ${rest.below}px above the buttons`);
      await ctx.close();
    });
  }

  for (const viewport of [
    { width: 577, height: 827 },
    { width: 577, height: 640 },
    { width: 1280, height: 800 },
  ]) {
    it(`fits warm-up, set and rest on one page without scrolling at ${viewport.width}x${viewport.height}`, async () => {
      const { ctx, page } = await open(viewport);
      const check = async (what) => {
        const m = await page.evaluate(() => {
          const b = document.querySelector('.w-body');
          const links = document.querySelector('.w-links').getBoundingClientRect();
          return { scroll: b.scrollHeight - b.clientHeight, bottom: links.bottom };
        });
        assert.ok(m.scroll <= 1, `${what} scrolls by ${m.scroll}px`);
        assert.ok(m.bottom <= viewport.height, `${what} links end below the window: ${m.bottom}`);
      };
      await page.click('[data-act=start]');
      await page.waitForTimeout(600);
      await check('warm-up');
      await page.click('[data-act=w-begin]');
      await page.waitForTimeout(600);
      await check('set');
      await page.locator('[data-act=w-log][data-hit="1"]').click();
      await page.waitForTimeout(500);
      await check('rest');
      await ctx.close();
    });
  }

  it('centers the -20 / +20 labels and does not clip the chips shadow', async () => {
    const { ctx, page } = await open({ width: 577, height: 827 });
    await page.click('[data-act=start]');
    await page.waitForTimeout(600);
    const chips = await page.evaluate(() => {
      const row = document.querySelector('.swap .pathsel');
      const b = row.querySelector('button').getBoundingClientRect();
      return { room: row.getBoundingClientRect().bottom - b.bottom };
    });
    assert.ok(chips.room >= 4, `only ${chips.room}px under the chips, so their shadow is cut`);
    // Hover lifts the chip 2px and grows its shadow to 5px: both must stay inside the scrolling row.
    await page.hover('.swap .pathsel button');
    await page.waitForTimeout(300);
    const lifted = await page.evaluate(() => {
      const row = document.querySelector('.swap .pathsel').getBoundingClientRect();
      const b = document.querySelector('.swap .pathsel button').getBoundingClientRect();
      return { top: b.top - row.top, bottom: row.bottom - (b.bottom + 5) };
    });
    assert.ok(lifted.top >= 0, `hovered chip sticks ${-lifted.top}px out of the top`);
    assert.ok(lifted.bottom >= 0, `hovered chip shadow is cut by ${-lifted.bottom}px`);
    for (let i = 0; i < 3; i++) await page.click('[data-act=w-warm-next]');
    await page.waitForTimeout(400);
    const off = await page.evaluate(() =>
      [...document.querySelectorAll('[data-act=w-warm-adj]')].map((b) => {
        const r = document.createRange();
        r.selectNodeContents(b);
        const t = r.getBoundingClientRect();
        const box = b.getBoundingClientRect();
        return Math.abs(t.left + t.width / 2 - (box.left + box.width / 2));
      })
    );
    assert.equal(off.length, 2);
    for (const o of off) assert.ok(o <= 2, `label is ${o}px off center`);
    await ctx.close();
  });

  it('keeps the yellow "then: ..." label and the "+1 rep" chip in one piece', async () => {
    // Wednesday 2026-03-04: Romanian deadlift targets are 3 x 7 today and 3 x 8 on Friday, when it levels up.
    const s = L.defaultState(D);
    for (const [date, reps] of [
      ['2026-02-25', 5],
      ['2026-02-27', 6],
    ]) {
      const p = L.prescribe(D, s, 'hinge');
      const logged = {
        hinge: { levelId: p.level.id, sets: [reps, reps, reps], targets: p.targets },
      };
      L.finishWorkout(D, s, { startedAt: 1, logged, warmDone: 4 }, date, 0);
    }
    await fetch(server.url + 'api/state', { method: 'PUT', body: JSON.stringify(s) });
    const ctx = await browser.newContext({
      viewport: { width: 500, height: 900 },
      colorScheme: 'dark',
    });
    const page = await ctx.newPage();
    await page.clock.setFixedTime(new Date('2026-03-04T10:00:00'));
    await page.goto(server.url);
    await page.waitForTimeout(700);
    await page.click('[data-act=pick-day][data-i="1"]');
    await page.waitForTimeout(300);
    const pieces = await page.evaluate(() =>
      [...document.querySelectorAll('.up-tag, .chg')].map((e) => ({
        text: e.textContent,
        lines: e.getClientRects().length,
      }))
    );
    assert.ok(
      pieces.some((p) => p.text.startsWith('then:')),
      JSON.stringify(pieces)
    );
    for (const p of pieces) assert.equal(p.lines, 1, `"${p.text}" breaks across lines`);
    await ctx.close();
  });
});
