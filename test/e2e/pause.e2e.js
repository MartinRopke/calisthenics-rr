// Pause and resume on the rest timer: the clock freezes while paused and continues after.
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { launchBrowser, newMobileContext, startServer } from './helpers.js';

describe('pause button', () => {
  let server, browser;
  before(async () => {
    server = await startServer();
    browser = await launchBrowser();
  });
  after(async () => {
    await browser?.close();
    await server?.stop();
  });

  it('freezes the rest timer while paused and resumes it', async () => {
    const ctx = await newMobileContext(browser);
    const page = await ctx.newPage();
    await page.goto(server.url);
    await page.click('[data-act=start]');
    await page.click('[data-act=w-begin]'); // skip the warm-up
    await page.click('[data-act=w-log][data-hit="1"]');
    const clock = () => page.locator('#restTime').innerText();

    await page.click('[data-act=w-pause]');
    assert.equal(await page.locator('[data-act=w-pause]').innerText(), 'Resume');
    const frozen = await clock();
    await page.waitForTimeout(2300);
    assert.equal(await clock(), frozen);

    await page.click('[data-act=w-pause]');
    assert.equal(await page.locator('[data-act=w-pause]').innerText(), 'Pause');
    await page.waitForTimeout(2300);
    assert.notEqual(await clock(), frozen);
    await ctx.close();
  });
});
