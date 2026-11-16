// Servidor local, sem dependências: serve o index.html em http://localhost:8000
// e guarda o histórico em data/treino.json (a pasta data/ fica fora do git).
import { createServer } from 'node:http';
import { readFileSync, writeFileSync, renameSync, copyFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { networkInterfaces } from 'node:os';

const root = dirname(fileURLToPath(import.meta.url));
const dataDir = process.env.DATA_DIR ? resolve(process.env.DATA_DIR) : join(root, 'data');
const dataFile = join(dataDir, 'treino.json');
const port = Number(process.env.PORT) || 8000;
// Listens on all interfaces by default so the iPhone can reach it over Wi-Fi.
// Use HOST=127.0.0.1 for local-only access.
const host = process.env.HOST || '0.0.0.0';

// Static files the app needs. Anything else is a 404, so there is no listing and no path traversal.
const STATIC = {
  '/': ['index.html', 'text/html; charset=utf-8'],
  '/index.html': ['index.html', 'text/html; charset=utf-8'],
  '/style.css': ['style.css', 'text/css; charset=utf-8'],
  '/app.js': ['app.js', 'text/javascript; charset=utf-8'],
  '/data.js': ['data.js', 'text/javascript; charset=utf-8'],
  '/videos.js': ['videos.js', 'text/javascript; charset=utf-8'],
  '/logic.js': ['logic.js', 'text/javascript; charset=utf-8'],
  '/views.js': ['views.js', 'text/javascript; charset=utf-8'],
  '/storage.js': ['storage.js', 'text/javascript; charset=utf-8'],
};

const send = (res, code, type, body) => { res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store' }); res.end(body); };

createServer((req, res) => {
  const path = req.url.split('?')[0];
  if (path === '/api/state' && req.method === 'GET') {
    return send(res, 200, 'application/json', existsSync(dataFile) ? readFileSync(dataFile) : '{}');
  }
  if (path === '/api/state' && req.method === 'PUT') {
    const chunks = []; let size = 0;
    req.on('data', (c) => { size += c.length; if (size > 5e6) req.destroy(); else chunks.push(c); });
    req.on('end', () => {
      try {
        const body = Buffer.concat(chunks).toString('utf8');
        const obj = JSON.parse(body);
        if (!obj || typeof obj !== 'object' || !Array.isArray(obj.sessions)) throw new Error('formato inválido');
        mkdirSync(dataDir, { recursive: true });
        if (existsSync(dataFile)) copyFileSync(dataFile, join(dataDir, 'treino.bak.json'));
        writeFileSync(dataFile + '.tmp', body);
        renameSync(dataFile + '.tmp', dataFile);
        send(res, 200, 'application/json', '{"ok":true}');
      } catch (e) { send(res, 400, 'application/json', '{"ok":false}'); }
    });
    return;
  }
  if ((req.method === 'GET' || req.method === 'HEAD') && Object.hasOwn(STATIC, path)) {
    const [file, type] = STATIC[path];
    return send(res, 200, type, readFileSync(join(root, file)));
  }
  send(res, 404, 'text/plain', 'Não encontrado');
}).listen(port, host, () => {
  console.log('Treino RR running (data in data/treino.json)');
  console.log('  Local:   http://localhost:' + port);
  if (host === '127.0.0.1' || host === 'localhost') return console.log('  Local-only mode (HOST=' + host + ')');
  var found = false;
  Object.values(networkInterfaces()).forEach((list) => (list || []).forEach((a) => {
    if (a.family === 'IPv4' && !a.internal) { found = true; console.log('  Network: http://' + a.address + ':' + port); }
  }));
  if (!found) console.log('  Network: no LAN address found');
});
