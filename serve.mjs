import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('.', import.meta.url));
const BOT_UA = /GPTBot|ClaudeBot|PerplexityBot|YandexAdditional|Google-Extended|CCBot/i;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
};

function send(res, status, body, headers = {}) {
  const buf = Buffer.isBuffer(body) ? body : Buffer.from(String(body));
  res.writeHead(status, {
    'content-type': 'text/html; charset=utf-8',
    'content-length': buf.length,
    ...headers,
  });
  res.end(buf);
}

function json(res, status, value) {
  send(res, status, JSON.stringify(value, null, 2), {
    'content-type': 'application/json; charset=utf-8',
  });
}

async function serveStatic(root, req, res) {
  const { pathname } = new URL(req.url, 'http://local');
  let path = decodeURIComponent(pathname);
  if (path === '/') path = '/index.html';
  if (path.endsWith('/')) path += 'index.html';
  if (path.includes('..')) return send(res, 400, 'bad request');

  const candidates = extname(path) ? [path] : [path + '.html', path, join(path, 'index.html')];
  for (const candidate of candidates) {
    const file = join(root, candidate);
    try {
      const data = await readFile(file);
      const ext = extname(file);
      const type = candidate.endsWith('api-catalog')
        ? 'application/linkset+json'
        : MIME[ext] || 'application/octet-stream';
      return send(res, 200, data, { 'content-type': type });
    } catch {
      // try next candidate
    }
  }
  send(res, 404, 'not found', { 'content-type': 'text/plain; charset=utf-8' });
}

const SPA_SHELL = `<!doctype html>
<html lang="ru">
<head><meta charset="utf-8"><title>SPA Demo</title></head>
<body>
  <div id="root">Загрузка…</div>
  <script src="/app.js"></script>
</body>
</html>`;

const SPA_JS = `setTimeout(async () => {
  const r = await fetch('/api/content');
  const d = await r.json();
  document.getElementById('root').innerHTML =
    '<h1>' + d.title + '</h1><p>' + d.body + '</p>';
}, 900);`;

const FACTS = {
  title: 'Acme Cloud',
  body: 'Цена 4 900 ₽/мес. Доставка 1–2 дня. Возврат 14 дней.',
};

function spaHandler(req, res) {
  const { pathname } = new URL(req.url, 'http://local');
  if (pathname === '/') return send(res, 200, SPA_SHELL);
  if (pathname === '/app.js') return send(res, 200, SPA_JS, { 'content-type': MIME['.js'] });
  if (pathname === '/api/content') {
    return setTimeout(() => json(res, 200, FACTS), 900);
  }
  if (pathname === '/robots.txt') {
    return send(res, 200, 'User-agent: *\nAllow: /\n', {
      'content-type': MIME['.txt'],
    });
  }
  send(res, 404, 'not found', { 'content-type': MIME['.txt'] });
}

const SSR_ROUTES = {
  '/': {
    title: 'Acme Cloud — SSR',
    body: `
      <h1>Acme Cloud</h1>
      <p>Цена 4 900 ₽/мес. Доставка 1–2 дня. Возврат 14 дней.</p>
      <ul>
        <li><a href="/pricing">Тарифы</a></li>
        <li><a href="/delivery">Доставка</a></li>
        <li><a href="/returns">Возврат</a></li>
      </ul>`,
  },
  '/pricing': {
    title: 'Тарифы — Acme Cloud',
    body: `
      <h1>Тарифы</h1>
      <table>
        <tr><th>План</th><th>Цена</th></tr>
        <tr><td>Start</td><td>4 900 ₽/мес</td></tr>
        <tr><td>Growth</td><td>9 900 ₽/мес</td></tr>
      </table>`,
  },
  '/delivery': {
    title: 'Доставка — Acme Cloud',
    body: '<h1>Доставка</h1><p>Доставка по Москве — 1–2 дня, 490 ₽.</p>',
  },
  '/returns': {
    title: 'Возврат — Acme Cloud',
    body: '<h1>Возврат</h1><p>Вернуть товар можно в течение 14 дней.</p>',
  },
};

function ssrHandler(req, res) {
  const { pathname } = new URL(req.url, 'http://local');
  if (pathname === '/robots.txt') {
    return send(res, 200, 'User-agent: *\nAllow: /\nSitemap: http://localhost:4103/sitemap.xml\n', {
      'content-type': MIME['.txt'],
    });
  }
  if (pathname === '/sitemap.xml') {
    return send(
      res,
      200,
      '<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>http://localhost:4103/</loc></url></urlset>',
      { 'content-type': MIME['.xml'] },
    );
  }

  const route = SSR_ROUTES[pathname];
  if (!route) return send(res, 404, 'not found', { 'content-type': MIME['.txt'] });

  send(
    res,
    200,
    `<!doctype html><html lang="ru"><head><meta charset="utf-8"><title>${route.title}</title></head><body>${route.body}</body></html>`,
  );
}

const HOSTILE_SHELL = `<!doctype html>
<html lang="ru">
<head><meta charset="utf-8"><title>Hostile Demo</title></head>
<body>
  <div id="root">Загрузка…</div>
  <script src="/app.js"></script>
</body>
</html>`;

const HOSTILE_JS = `setTimeout(async () => {
  const r = await fetch('/content');
  const d = await r.json();
  document.getElementById('root').innerHTML = '<h1>' + d.title + '</h1><p>' + d.body + '</p>';
}, 1500);`;

function hostileHandler(req, res) {
  const { pathname } = new URL(req.url, 'http://local');
  const ua = req.headers['user-agent'] || '';

  if (pathname === '/robots.txt') {
    return send(
      res,
      200,
      [
        'User-agent: GPTBot',
        'Disallow: /',
        '',
        'User-agent: ClaudeBot',
        'Disallow: /',
        '',
        'User-agent: PerplexityBot',
        'Disallow: /',
        '',
        'User-agent: YandexAdditional',
        'Disallow: /',
        '',
        'User-agent: *',
        'Allow: /',
        '',
      ].join('\n'),
      { 'content-type': MIME['.txt'] },
    );
  }

  if (BOT_UA.test(ua)) {
    return send(res, 403, 'forbidden for bots', { 'content-type': MIME['.txt'] });
  }

  if (pathname === '/') return send(res, 200, HOSTILE_SHELL);
  if (pathname === '/app.js') return send(res, 200, HOSTILE_JS, { 'content-type': MIME['.js'] });
  if (pathname === '/content') return setTimeout(() => json(res, 200, FACTS), 1500);

  send(res, 404, 'not found', { 'content-type': MIME['.txt'] });
}

const AGENT_PRODUCTS = [
  { id: 'start', name: 'Start', price: 4900, currency: 'RUB' },
  { id: 'growth', name: 'Growth', price: 9900, currency: 'RUB' },
];

function agentGoodHandler(req, res) {
  const { pathname } = new URL(req.url, 'http://local');
  if (pathname === '/api/products') return json(res, 200, AGENT_PRODUCTS);
  return serveStatic(join(ROOT, 'sites/agent-good'), req, res);
}

const sites = [
  { name: 'static', port: 4101, handler: (req, res) => serveStatic(join(ROOT, 'sites/static'), req, res) },
  { name: 'spa', port: 4102, handler: spaHandler },
  { name: 'ssr', port: 4103, handler: ssrHandler },
  { name: 'hostile', port: 4104, handler: hostileHandler },
  { name: 'agent-good', port: 4105, handler: agentGoodHandler },
];

for (const site of sites) {
  createServer(site.handler).listen(site.port, () => {
    console.log(`${site.name.padEnd(12)} http://localhost:${site.port}`);
  });
}
