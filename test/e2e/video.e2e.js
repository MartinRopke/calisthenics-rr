// The video box: a YouTube link shows up if the player never loads, and stays hidden if it does.
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { launchBrowser, newMobileContext, startServer } from './helpers.js';

describe('video box', () => {
  let server, browser;
  before(async () => {
    server = await startServer();
    browser = await launchBrowser();
  });
  after(async () => {
    await browser?.close();
    await server?.stop();
  });

  const openWorkout = async (youtube) => {
    const ctx = await newMobileContext(browser);
    const page = await ctx.newPage();
    await page.route(/youtube(-nocookie)?\.com/, youtube);
    await page.goto(server.url);
    await page.click('[data-act=start]');
    return { ctx, page };
  };

  it('shows a link to YouTube when the player never loads', async () => {
    const { ctx, page } = await openWorkout(() => {}); // the request hangs: no load event
    const link = page.locator('.vid-fallback').first();
    assert.equal(await link.isVisible(), false); // not right away
    await page.waitForTimeout(8600);
    assert.equal(await link.isVisible(), true);
    assert.match(await link.getAttribute('href'), /^https:\/\/www\.youtube\.com\/watch\?v=/);
    await ctx.close();
  });

  it('keeps the link hidden when the player loads', async () => {
    const { ctx, page } = await openWorkout((route) =>
      route.fulfill({ contentType: 'text/html', body: '<html><body>player</body></html>' })
    );
    await page.waitForTimeout(8600);
    assert.equal(await page.locator('.vid-fallback').first().isVisible(), false);
    await ctx.close();
  });

  it('asks YouTube for no captions', async () => {
    const { ctx, page } = await openWorkout((route) => route.fulfill({ body: '' }));
    const src = await page.locator('.vid iframe').first().getAttribute('src');
    assert.equal(new URL(src).searchParams.get('cc_load_policy'), '0');
    await ctx.close();
  });

  it('tells the player to unload its captions, since the URL flag is only a default', async () => {
    const player = `<html><body>player<script>
      window.__msgs = [];
      addEventListener('message', (e) => window.__msgs.push(String(e.data)));
    </script></body></html>`;
    const { ctx, page } = await openWorkout((route) =>
      route.fulfill({ contentType: 'text/html', body: player })
    );
    await page.waitForTimeout(2500);
    const frame = page.frames().find((f) => f.url().includes('/embed/'));
    assert.ok(frame, 'the player frame was not found');
    const msgs = (await frame.evaluate(() => window.__msgs)).map((m) => JSON.parse(m));
    assert.ok(
      msgs.some((m) => m.func === 'unloadModule' && m.args[0] === 'captions'),
      'the player never got the unload command: ' + JSON.stringify(msgs)
    );
    await ctx.close();
  });
});
