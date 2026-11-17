import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { request } from 'node:http';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

const freePort = () =>
  new Promise((resolve) => {
    const s = createServer();
    s.listen(0, '127.0.0.1', () => {
      const { port } = s.address();
      s.close(() => resolve(port));
    });
  });

/* Raw request, so paths such as /../x reach the server unnormalized (fetch would clean them up). */
const get = (port, path, method = 'GET') =>
  new Promise((resolve, reject) => {
    const req = request({ host: '127.0.0.1', port, path, method }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () =>
        resolve({
          status: res.statusCode,
          headers: res.headers,
          body: Buffer.concat(chunks).toString(),
        })
      );
    });
    req.on('error', reject);
    req.end();
  });

describe('server', () => {
  let proc;
  let port;
  let dataDir;

  before(async () => {
    port = await freePort();
    dataDir = mkdtempSync(join(tmpdir(), 'rr-server-'));
    proc = spawn('node', ['server.mjs'], {
      cwd: ROOT,
      env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', DATA_DIR: dataDir },
      stdio: ['ignore', 'pipe', 'inherit'],
    });
    await new Promise((resolve) => proc.stdout.once('data', resolve));
  });

  after(() => {
    proc.kill();
    rmSync(dataDir, { recursive: true, force: true });
  });

  const HTML = 'text/html; charset=utf-8';
  const JS = 'text/javascript; charset=utf-8';

  it('serves index.html at / and /index.html', async () => {
    for (const p of ['/', '/index.html']) {
      const r = await get(port, p);
      assert.equal(r.status, 200, p);
      assert.equal(r.headers['content-type'], HTML);
      assert.equal(r.headers['cache-control'], 'no-store');
      assert.match(r.body, /<script type="module" src="app\.js">/);
    }
  });

  it('serves the stylesheet and every module with the right type', async () => {
    const css = await get(port, '/style.css');
    assert.equal(css.status, 200);
    assert.equal(css.headers['content-type'], 'text/css; charset=utf-8');
    for (const p of [
      '/app.js',
      '/domain/data.js',
      '/domain/videos.js',
      '/domain/logic.js',
      '/storage/storage.js',
      '/ui/views.js',
    ]) {
      const r = await get(port, p);
      assert.equal(r.status, 200, p);
      assert.equal(r.headers['content-type'], JS, p);
    }
  });

  it('ignores the query string and answers HEAD without a body', async () => {
    assert.equal((await get(port, '/app.js?v=1')).status, 200);
    const head = await get(port, '/app.js', 'HEAD');
    assert.equal(head.status, 200);
    assert.equal(head.body, '');
  });

  it('rejects methods other than GET and HEAD for files', async () => {
    assert.equal((await get(port, '/app.js', 'POST')).status, 404);
    assert.equal((await get(port, '/app.js', 'DELETE')).status, 404);
  });

  it('returns 404 for traversal attempts', async () => {
    for (const p of [
      '/../package.json',
      '/../server.mjs',
      '/domain/../../package.json',
      '/%2e%2e/package.json',
      '/%2E%2E/%2e%2e/package.json',
      '/domain/%2e%2e/%2e%2e/package.json',
      '/..%2fpackage.json',
      '/..%5cpackage.json',
      '/domain%5c..%5c..%5cpackage.json',
      '/app.js%00.html',
      '/%00',
      '/%',
      '//etc/passwd',
    ]) {
      assert.equal((await get(port, p)).status, 404, p);
    }
  });

  it('keeps tests, repo files and data out of reach', async () => {
    for (const p of [
      '/test/unit/domain/logic.test.js',
      '/test/unit/storage/storage.test.js',
      '/test/unit/ui/views.test.js',
      '/test/server/server.test.js',
      '/test/e2e/helpers.js',
      '/package.json',
      '/server.mjs',
      '/data/treino.json',
      '/src/app.js',
      '/node_modules/',
      '/.git/config',
    ]) {
      assert.equal((await get(port, p)).status, 404, p);
    }
  });

  it('does not list directories', async () => {
    for (const p of ['/domain', '/domain/', '/ui/', '/storage/']) {
      assert.equal((await get(port, p)).status, 404, p);
    }
  });

  it('keeps /api/state working', async () => {
    const empty = await get(port, '/api/state');
    assert.equal(empty.status, 200);
    assert.equal(empty.headers['content-type'], 'application/json');
    assert.equal(empty.body, '{}');
    const put = await new Promise((resolve, reject) => {
      const req = request({ host: '127.0.0.1', port, path: '/api/state', method: 'PUT' }, (res) => {
        res.resume();
        res.on('end', () => resolve(res.statusCode));
      });
      req.on('error', reject);
      req.end(JSON.stringify({ sessions: [] }));
    });
    assert.equal(put, 200);
    assert.deepEqual(JSON.parse((await get(port, '/api/state')).body), { sessions: [] });
  });
});
