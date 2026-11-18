import { createServer } from 'node:http';
import { readFile, realpath } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';

const types = { '.html': 'text/html; charset=utf-8', '.ttf': 'font/ttf',
  '.json': 'application/json', '.pdf': 'application/pdf', '.jpg':'image/jpeg', '.png':'image/png', '.webp':'image/webp',
  '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };

// Only the runner's validated render directory is served, on a random loopback port.
export async function localServer(directory) {
  const root = await realpath(directory);
  const server = createServer(async (req, res) => {
    try {
      if (req.method !== 'GET') { res.writeHead(405); res.end(); return; }
      const path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
      const file = await realpath(resolve(root, '.' + path));
      if (!file.startsWith(root + sep)) throw Error('OUTSIDE_RENDER_ROOT');
      res.writeHead(200, { 'Content-Type': types[extname(file)] || 'application/octet-stream',
        'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' });
      res.end(await readFile(file));
    } catch { res.writeHead(404); res.end('Not found'); }
  });
  await new Promise((done, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', done);
  });
  return { origin: 'http://127.0.0.1:' + server.address().port,
    close: () => new Promise((done, reject) => server.close(e => e ? reject(e) : done())) };
}
