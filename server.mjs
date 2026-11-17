// Servidor local, sem dependências: serve a pasta src/ em http://localhost:8000
// e guarda o histórico em data/treino.json (a pasta data/ fica fora do git).
import { createServer } from 'node:http';
import {
  readFileSync,
  writeFileSync,
  renameSync,
  copyFileSync,
  mkdirSync,
  existsSync,
  statSync,
} from 'node:fs';
import { dirname, extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { networkInterfaces } from 'node:os';

const root = dirname(fileURLToPath(import.meta.url));
const dataDir = process.env.DATA_DIR ? resolve(process.env.DATA_DIR) : join(root, 'data');
const dataFile = join(dataDir, 'treino.json');
const port = Number(process.env.PORT) || 8000;
// Listens on all interfaces by default so the iPhone can reach it over Wi-Fi.
// Use HOST=127.0.0.1 for local-only access.
const host = process.env.HOST || '0.0.0.0';

// Only src/ is served. Everything else (data/, package.json, tests, node_modules) is a 404.
const srcDir = join(root, 'src');
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
};

// Maps a URL path to a file inside src/, or returns null when there is none to serve.
function staticFile(urlPath) {
  let rel;
  try {
    rel = decodeURIComponent(urlPath);
  } catch {
    return null;
  }
  if (rel.includes('\0') || rel.includes('\\')) return null;
  if (rel.endsWith('/')) rel += 'index.html';
  const file = resolve(srcDir, '.' + rel);
  if (!file.startsWith(srcDir + sep)) return null;
  if (file.endsWith('.test.js')) return null;
  const type = TYPES[extname(file)];
  if (!type || !existsSync(file) || !statSync(file).isFile()) return null;
  return [file, type];
}

const send = (res, code, type, body) => {
  res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(body);
};

createServer((req, res) => {
  const path = req.url.split('?')[0];
  if (path === '/api/state' && req.method === 'GET') {
    return send(res, 200, 'application/json', existsSync(dataFile) ? readFileSync(dataFile) : '{}');
  }
  if (path === '/api/state' && req.method === 'PUT') {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > 5e6) req.destroy();
      else chunks.push(c);
    });
    req.on('end', () => {
      try {
        const body = Buffer.concat(chunks).toString('utf8');
        const obj = JSON.parse(body);
        if (!obj || typeof obj !== 'object' || !Array.isArray(obj.sessions))
          throw new Error('formato inválido');
        mkdirSync(dataDir, { recursive: true });
        if (existsSync(dataFile)) copyFileSync(dataFile, join(dataDir, 'treino.bak.json'));
        writeFileSync(dataFile + '.tmp', body);
        renameSync(dataFile + '.tmp', dataFile);
        send(res, 200, 'application/json', '{"ok":true}');
      } catch {
        send(res, 400, 'application/json', '{"ok":false}');
      }
    });
    return;
  }
  if (req.method === 'GET' || req.method === 'HEAD') {
    const found = staticFile(path);
    if (found) return send(res, 200, found[1], req.method === 'HEAD' ? '' : readFileSync(found[0]));
  }
  send(res, 404, 'text/plain', 'Não encontrado');
}).listen(port, host, () => {
  console.log('Treino RR running (data in data/treino.json)');
  console.log('  Local:   http://localhost:' + port);
  if (host === '127.0.0.1' || host === 'localhost')
    return console.log('  Local-only mode (HOST=' + host + ')');
  let found = false;
  Object.values(networkInterfaces()).forEach((list) =>
    (list || []).forEach((a) => {
      if (a.family === 'IPv4' && !a.internal) {
        found = true;
        console.log('  Network: http://' + a.address + ':' + port);
      }
    })
  );
  if (!found) console.log('  Network: no LAN address found');
});
