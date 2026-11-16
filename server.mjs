// Servidor local, sem dependências: serve o index.html em http://localhost:8000
// e guarda o histórico em data/treino.json (a pasta data/ fica fora do git).
import { createServer } from 'node:http';
import { readFileSync, writeFileSync, renameSync, copyFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const dataDir = join(root, 'data');
const dataFile = join(dataDir, 'treino.json');
const port = Number(process.env.PORT) || 8000;

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
  if ((path === '/' || path === '/index.html') && req.method === 'GET') {
    return send(res, 200, 'text/html; charset=utf-8', readFileSync(join(root, 'index.html')));
  }
  send(res, 404, 'text/plain', 'Não encontrado');
}).listen(port, '127.0.0.1', () => console.log('Treino RR em http://localhost:' + port + ' (dados em data/treino.json)'));
