// The 3, 2, 1 countdown beeps must play on the second, even right after chimes from quick taps on "Done".
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { launchBrowser, newMobileContext, startServer } from './helpers.js';

describe('countdown beeps', () => {
  let server, browser;
  before(async () => {
    server = await startServer();
    browser = await launchBrowser();
  });
  after(async () => {
    await browser?.close();
    await server?.stop();
  });

  it('plays every countdown beep on time after three quick taps on Done', async () => {
    const ctx = await newMobileContext(browser);
    const page = await ctx.newPage();
    // Record every oscillator start: when it was asked for and how far ahead of the audio clock it plays.
    await page.addInitScript(() => {
      const Base = window.AudioContext;
      window.__beeps = [];
      window.AudioContext = class extends Base {
        createOscillator() {
          const o = super.createOscillator();
          const start = o.start.bind(o);
          o.start = (at) => {
            window.__beeps.push({
              asked: performance.now(),
              wait: at - this.currentTime,
              freq: o.frequency.value,
            });
            return start(at);
          };
          return o;
        }
      };
    });
    await page.goto(server.url);
    await page.waitForTimeout(700);
    await page.click('[data-act=start]');
    await page.waitForTimeout(300);
    const t0 = await page.evaluate(() => performance.now());
    for (let i = 0; i < 3; i++) await page.click('[data-act=w-warm-next]'); // lands on a timed item: 3, 2, 1
    await page.waitForTimeout(3600);
    const beeps = await page.evaluate(() => window.__beeps);
    const late = beeps.filter((b) => b.asked - t0 > 900 && b.wait > 0.06);
    assert.deepEqual(late, [], 'countdown beeps played late: ' + JSON.stringify(late));
    // "3", "2", "1" are single 660 Hz beeps and "go" is 1175 Hz; chimes start with a 660 Hz tone followed by 880 Hz
    const go = beeps.filter((b) => b.freq === 1175);
    assert.equal(go.length, 1);
    const ticks = beeps.filter(
      (b, i) => b.freq === 660 && !(beeps[i + 1] && beeps[i + 1].freq === 880)
    );
    assert.equal(ticks.length, 3, 'expected the 3, 2 and 1 beeps: ' + JSON.stringify(beeps));
    await ctx.close();
  });
});
