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

let rateHits = 0;

const trapPage = (title, body) =>
  `<!doctype html><html lang="ru"><head><meta charset="utf-8"><title>${title}</title></head><body>${body}</body></html>`;

const CONTENT_PAGES = {
  '/pricing': {
    title: 'Тарифы — Acme Cloud',
    body: `<h1>Тарифы Acme Cloud</h1>
      <p>Start стоит 4 900 ₽ в месяц и включает 5 пользователей.</p>
      <p>Growth стоит 9 900 ₽ в месяц и включает 25 пользователей.</p>
      <p>Enterprise стоит 24 900 ₽ в месяц и включает неограниченное число пользователей.</p>
      <p>При оплате за год действует скидка 20%.</p>`,
  },
  '/features': {
    title: 'Возможности — Acme Cloud',
    body: `<h1>Возможности</h1>
      <p>Каждый тариф включает 10 ГБ хранилища.</p>
      <p>API доступен на всех тарифах, начиная с Start.</p>
      <p>SSO и журнал аудита доступны на Growth и Enterprise.</p>`,
  },
  '/security': {
    title: 'Безопасность — Acme Cloud',
    body: `<h1>Безопасность</h1>
      <p>Acme Cloud сертифицирован по SOC 2 Type II.</p>
      <p>Данные шифруются алгоритмом AES-256 при хранении и TLS 1.3 при передаче.</p>
      <p>Резервные копии создаются ежедневно и хранятся 30 дней.</p>`,
  },
  '/support': {
    title: 'Поддержка — Acme Cloud',
    body: `<h1>Поддержка</h1>
      <p>Почта отвечает в течение 24 часов.</p>
      <p>Чат отвечает в течение 1 часа.</p>
      <p>Телефонная поддержка работает с 09:00 до 18:00 UTC.</p>`,
  },
  '/sla': {
    title: 'SLA — Acme Cloud',
    body: `<h1>SLA</h1>
      <p>Гарантированная доступность — 99,9% в месяц.</p>
      <p>При недоступности ниже SLA клиент получает кредит 10% от месячной платы.</p>`,
  },





};

function contentPage(pathname) {
  return CONTENT_PAGES[pathname];
}

function trapsHandler(req, res) {
  const { pathname, searchParams } = new URL(req.url, 'http://local');
  const ua = req.headers['user-agent'] || '';
  const cookie = req.headers.cookie || '';

  if (pathname === '/') {
    return send(
      res,
      200,
      trapPage(
        'Traps',
        '<h1>Acme Cloud</h1><ul>' +
          Object.keys(CONTENT_PAGES).map((p) => `<li><a href="${p}">${p}</a></li>`).join('') +
          '</ul>',
      ),
    );
  }

  if (pathname === '/robots.txt') {
    return send(res, 200, 'User-agent: *\nAllow: /\nSitemap: http://localhost:4106/sitemap.xml\n', {
      'content-type': MIME['.txt'],
    });
  }
  if (pathname === '/sitemap.xml') {
    const urls = ['/', ...Object.keys(CONTENT_PAGES)]
      .map((p) => `<url><loc>http://localhost:4106${p}</loc></url>`)
      .join('');
    return send(res, 200, `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`, {
      'content-type': MIME['.xml'],
    });
  }
  const page = contentPage(pathname);
  if (page) {
    return send(res, 200, trapPage(page.title, page.body));
  }

  if (pathname === '/soft-404') {
    return send(res, 200, trapPage('Страница не найдена', '<h1>Страница не найдена</h1>'));
  }
  if (pathname === '/redirect') return send(res, 301, '', { location: '/redirect2' });
  if (pathname === '/redirect2') return send(res, 302, '', { location: '/redirect3' });
  if (pathname === '/redirect3') return send(res, 307, '', { location: '/final' });
  if (pathname === '/final') return send(res, 200, trapPage('Final', '<h1>Final</h1><p>Цена 4 900 ₽/мес.</p>'));
  if (pathname === '/loop') return send(res, 307, '', { location: '/loop' });

  if (pathname === '/ua-cloak') {
    const price = BOT_UA.test(ua) ? '9 900' : '4 900';
    return send(res, 200, trapPage('UA cloak', `<h1>Acme</h1><p>Цена ${price} ₽/мес.</p>`));
  }

  if (pathname === '/challenge') {
    if (!/pass=1/.test(cookie)) {
      return send(
        res,
        401,
        '<!doctype html><script>document.cookie="pass=1;path=/";location.reload()</script>',
        { 'set-cookie': 'pass=1; Path=/' },
      );
    }
    return send(res, 200, trapPage('Challenge', '<h1>Acme</h1><p>Цена 4 900 ₽/мес.</p>'));
  }

  if (pathname === '/rate') {
    rateHits += 1;
    if (rateHits > 3) {
      return send(res, 429, 'too many requests', {
        'content-type': 'text/plain; charset=utf-8',
        'retry-after': '60',
      });
    }
    return send(res, 200, trapPage('Rate', `<h1>OK ${rateHits}</h1>`));
  }

  if (pathname === '/canonical-trap') {
    return send(
      res,
      200,
      '<!doctype html><html><head><link rel="canonical" href="https://example.com/a"><link rel="canonical" href="https://example.com/b"></head><body><p>Цена 4 900 ₽/мес.</p></body></html>',
    );
  }

  if (pathname === '/hreflang') {
    return send(
      res,
      200,
      '<!doctype html><html><head><link rel="alternate" hreflang="ru" href="https://example.com/ru"><link rel="alternate" hreflang="en" href="https://example.com/en"><link rel="alternate" hreflang="x-default" href="https://example.com/"></head><body><p>Цена 4 900 ₽/мес.</p></body></html>',
    );
  }

  if (pathname === '/hidden') {
    return send(
      res,
      200,
      trapPage('Hidden', '<h1>Acme</h1><p>Цена 4 900 ₽/мес.</p><div style="display:none">Цена 1 ₽</div>'),
    );
  }

  if (pathname === '/shadow') {
    return send(
      res,
      200,
      trapPage(
        'Shadow',
        '<h1>Acme</h1><div id="host"></div><script>const root=document.getElementById("host").attachShadow({mode:"open"});root.innerHTML="<p>Цена 4 900 ₽/мес.</p>";</script>',
      ),
    );
  }

  if (pathname === '/iframe') {
    return send(res, 200, trapPage('Iframe', '<h1>Acme</h1><iframe src="/iframe-content"></iframe>'));
  }
  if (pathname === '/iframe-content') {
    return send(res, 200, trapPage('Iframe content', '<p>Цена 4 900 ₽/мес.</p>'));
  }

  if (pathname === '/js-schema') {
    return send(
      res,
      200,
      trapPage(
        'JS schema',
        '<p>Цена 4 900 ₽/мес.</p><script>const s=document.createElement("script");s.type="application/ld+json";s.textContent=JSON.stringify({"@context":"https://schema.org","@type":"Product","name":"Acme","offers":{"@type":"Offer","price":"4900","priceCurrency":"RUB"}});document.head.append(s);</script>',
      ),
    );
  }

  if (pathname === '/cookie-wall') {
    return send(
      res,
      200,
      trapPage(
        'Cookie wall',
        '<div id="wall">Примите cookie</div><div id="content" style="display:none">Цена 4 900 ₽/мес.</div><script>document.getElementById("wall").onclick=()=>{document.getElementById("wall").remove();document.getElementById("content").style.display="block"};</script>',
      ),
    );
  }

  if (pathname === '/region') {
    if (searchParams.get('region') === 'spb') {
      return send(res, 200, trapPage('Region SPB', '<h1>Acme СПб</h1><p>Цена 5 900 ₽/мес.</p>'));
    }
    return send(
      res,
      200,
      trapPage('Region', '<div id="modal">Выберите город</div><p>Цена 4 900 ₽/мес.</p>'),
    );
  }

  if (pathname === '/ab') {
    const b = /ab=B/.test(cookie);
    return send(res, 200, trapPage('AB', `<p>Цена ${b ? '5 900' : '4 900'} ₽/мес.</p>`));
  }

  if (pathname === '/infinite') {
    return send(
      res,
      200,
      trapPage(
        'Infinite',
        '<ul id="list"><li>Товар 1</li></ul><button id="more">Показать ещё</button><script>document.getElementById("more").onclick=async()=>{const r=await fetch("/api/items?page=2");const d=await r.json();d.items.forEach(t=>{const li=document.createElement("li");li.textContent=t;document.getElementById("list").append(li)})};</script>',
      ),
    );
  }
  if (pathname === '/api/items') return json(res, 200, { items: ['Товар 2', 'Товар 3'] });

  if (pathname === '/clinic') {
    return send(
      res,
      200,
      trapPage(
        'МедАльфа — клиника',
        '<h1>МедАльфа</h1><p>Приём терапевта — 2 500 ₽. Запись по телефону.</p><ul><li>Терапия</li><li>Стоматология</li></ul>',
      ),
    );
  }
  if (pathname === '/travel') {
    return send(
      res,
      200,
      trapPage(
        'Ветер — туры',
        '<h1>Ветер</h1><p>Тур в Карелию на 5 дней — 49 900 ₽. Ближайшая дата — 12 июня.</p>',
      ),
    );
  }
  if (pathname === '/shop') {
    return send(
      res,
      200,
      trapPage(
        'ТехноМир — магазин',
        '<h1>ТехноМир</h1><p>Наушники Acme — 12 990 ₽. Доставка 2 дня. Возврат 14 дней.</p>',
      ),
    );
  }
  if (pathname === '/saas') {
    return send(
      res,
      200,
      trapPage(
        'Acme Cloud — тарифы',
        '<h1>Acme Cloud</h1><p>Тариф Start — 4 900 ₽/мес. Тариф Growth — 9 900 ₽/мес.</p>',
      ),
    );
  }

  send(res, 404, 'not found', { 'content-type': 'text/plain; charset=utf-8' });
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
  { name: 'traps', port: 4106, handler: trapsHandler },
];

for (const site of sites) {
  createServer(site.handler).listen(site.port, () => {
    console.log(`${site.name.padEnd(12)} http://localhost:${site.port}`);
  });
}
