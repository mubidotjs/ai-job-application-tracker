import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url));
const config = JSON.parse(readFileSync(resolve(here, 'vercel.json'), 'utf8'));
const types = {
  html: 'text/html; charset=utf-8',
  js: 'text/javascript; charset=utf-8',
  css: 'text/css; charset=utf-8',
  json: 'application/json',
  svg: 'image/svg+xml',
  png: 'image/png',
  xml: 'application/xml',
  txt: 'text/plain',
};
const { allowed } = await import('./audit.mjs');
const headers = Object.fromEntries(config.headers[0].headers.map((h) => [h.key, h.value]));
const server = createServer((req, res) => {
  try {
    const pathname =
      decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname).slice(1) || 'index.html';
    if (!['GET', 'HEAD'].includes(req.method) || !allowed.includes(pathname)) {
      res.writeHead(404, { ...headers, 'Content-Type': types.html });
      return res.end(readFileSync(resolve(here, 'dist/404.html')));
    }
    const data = readFileSync(resolve(here, 'dist', pathname));
    res.writeHead(200, {
      ...headers,
      'Content-Type': types[pathname.split('.').pop()] || 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    res.end(req.method === 'HEAD' ? undefined : data);
  } catch {
    res.writeHead(400, headers);
    res.end('Invalid static request');
  }
});
const port = Number(process.env.PORT || 3102);
server.listen(port, '127.0.0.1', () =>
  console.log(`Rolecraft static showcase: http://127.0.0.1:${port}`),
);
