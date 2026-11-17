// Shared setup for the e2e tests: start server.mjs on a free port with a temp data dir,
// launch Chromium, and collect page errors.
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SHOTS = join(ROOT, 'shots');

// Console errors that are noise: blocked network calls in sandboxes and Chromium internals.
const IGNORED_CONSOLE = ['ERR_TUNNEL', 'ERR_NAME', 'ERR_INTERNET', 'compute-pressure'];

function freePort() {
  return new Promise((resolve, reject) => {
    const s = createServer();
    s.on('error', reject);
    s.listen(0, '127.0.0.1', () => {
      const { port } = s.address();
      s.close(() => resolve(port));
    });
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Start a fresh server (empty history, nothing written to data/). Returns { url, stop }. */
export async function startServer() {
  const port = await freePort();
  const dataDir = mkdtempSync(join(tmpdir(), 'rr-e2e-'));
  const proc = spawn('node', ['server.mjs'], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', DATA_DIR: dataDir },
    stdio: 'ignore',
  });
  const url = `http://127.0.0.1:${port}/`;
  let ready = false;
  for (let i = 0; i < 50 && !ready; i++) {
    try {
      const res = await fetch(url);
      await res.arrayBuffer();
      ready = true;
    } catch {
      await sleep(100);
    }
  }
  const stop = async () => {
    const exited = new Promise((r) => proc.once('exit', r));
    proc.kill();
    await exited;
    rmSync(dataDir, { recursive: true, force: true });
  };
  if (!ready) {
    await stop();
    throw new Error('server did not start');
  }
  return { url, stop };
}

export function launchBrowser() {
  return chromium.launch();
}

/** A mobile-sized context (390 x 844, touch). */
export function newMobileContext(browser, options = {}) {
  return browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    ...options,
  });
}

/** Record page errors and console errors on `page` into `errors`. `extraIgnore` lists more text to ignore. */
export function collectErrors(page, errors, extraIgnore = []) {
  const ignored = [...IGNORED_CONSOLE, ...extraIgnore];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e));
  page.on('console', (m) => {
    if (m.type() === 'error' && !ignored.some((s) => m.text().includes(s))) {
      errors.push('console.' + m.type() + ': ' + m.text());
    }
  });
}

/** Save a screenshot as shots/<name>.png. */
export function shot(page, name, options = {}) {
  mkdirSync(SHOTS, { recursive: true });
  return page.screenshot({ path: join(SHOTS, name + '.png'), ...options });
}
