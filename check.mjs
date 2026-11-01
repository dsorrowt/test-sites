const NORMAL_UA = 'Mozilla/5.0 (compatible; TestSites/1.0)';
const BOT_UA = 'Mozilla/5.0 (compatible; GPTBot/1.0; +https://openai.com/gptbot)';
const MARKER = '4 900';

const SITES = [
  { name: 'static', base: 'http://localhost:4101', note: 'SSR/static' },
  { name: 'spa', base: 'http://localhost:4102', note: 'client JS' },
  { name: 'ssr', base: 'http://localhost:4103', note: 'server render' },
  { name: 'hostile', base: 'http://localhost:4104', note: 'JS + bot block' },
  { name: 'agent-good', base: 'http://localhost:4105', note: 'agent standards' },
];

async function get(url, ua) {
  const res = await fetch(url, { headers: { 'user-agent': ua }, redirect: 'manual' });
  const text = await res.text();
  return { status: res.status, text };
}

function robotsSummary(text) {
  const lines = text.split('\n').map((l) => l.trim());
  const blocked = [];
  let agent = null;
  for (const line of lines) {
    const ua = line.match(/^User-agent:\s*(.+)$/i);
    if (ua) agent = ua[1];
    const dis = line.match(/^Disallow:\s*(.+)$/i);
    if (dis && dis[1] === '/' && agent && !/^\*$/.test(agent)) blocked.push(agent);
  }
  const signals = lines.find((l) => /^Content-Signal:/i.test(l));
  return { blocked, signals: signals || '—' };
}

console.log('site         normal  bot   marker(raw)  robots');
for (const site of SITES) {
  const [normal, bot, robots] = await Promise.all([
    get(site.base + '/', NORMAL_UA),
    get(site.base + '/', BOT_UA),
    get(site.base + '/robots.txt', NORMAL_UA),
  ]);
  const hasMarker = normal.text.includes(MARKER) ? 'yes' : 'no';
  const summary = robotsSummary(robots.text);
  const blocked = summary.blocked.length ? `blocks ${summary.blocked.join(',')}` : 'allows all';
  console.log(
    `${site.name.padEnd(12)} ${String(normal.status).padEnd(6)} ${String(bot.status).padEnd(5)} ${hasMarker.padEnd(12)} ${blocked}`,
  );
  if (summary.signals !== '—') console.log(`             signal: ${summary.signals}`);
}

console.log('\nagent-good endpoints');
for (const path of [
  '/llms.txt',
  '/openapi.json',
  '/.well-known/mcp/server-card.json',
  '/.well-known/api-catalog',
  '/.well-known/agent-skills/index.json',
  '/api/products',
]) {
  const res = await get('http://localhost:4105' + path, NORMAL_UA);
  console.log(`${String(res.status).padEnd(4)} ${path}`);
}

console.log('\ntraps (4106)');
async function probe(path, opts = {}) {
  const res = await fetch('http://localhost:4106' + path, {
    headers: {
      'user-agent': opts.ua || NORMAL_UA,
      ...(opts.cookie ? { cookie: opts.cookie } : {}),
    },
    redirect: 'manual',
  });
  return {
    status: res.status,
    text: await res.text(),
    location: res.headers.get('location'),
    cookie: res.headers.get('set-cookie'),
  };
}

const soft = await probe('/soft-404');
console.log(`soft-404      ${soft.status} body-not-found=${/не найдена/i.test(soft.text)}`);

const redirect = await probe('/redirect');
console.log(`redirect      ${redirect.status} -> ${redirect.location}`);

const loop = await probe('/loop');
console.log(`loop          ${loop.status} -> ${loop.location}`);

const cloakNormal = await probe('/ua-cloak');
const cloakBot = await probe('/ua-cloak', { ua: BOT_UA });
console.log(
  `ua-cloak      normal=${/4 900/.test(cloakNormal.text)} bot=${/9 900/.test(cloakBot.text)} different=${cloakNormal.text !== cloakBot.text}`,
);

const challenge1 = await probe('/challenge');
const challenge2 = await probe('/challenge', { cookie: 'pass=1' });
console.log(
  `challenge     first=${challenge1.status} cookie=${Boolean(challenge1.cookie)} second=${challenge2.status}`,
);

const rate = [];
for (let i = 0; i < 4; i += 1) rate.push((await probe('/rate')).status);
console.log(`rate          ${rate.join(', ')}`);

const canonical = await probe('/canonical-trap');
console.log(`canonical     count=${(canonical.text.match(/rel="canonical"/g) || []).length}`);

const hidden = await probe('/hidden');
console.log(`hidden        visible=${/4 900/.test(hidden.text)} hidden=${/Цена 1 ₽/.test(hidden.text)}`);

const region = await probe('/region?region=spb');
console.log(`region        spb=${/5 900/.test(region.text)}`);

const ab = await probe('/ab', { cookie: 'ab=B' });
console.log(`ab            variant-B=${/5 900/.test(ab.text)}`);

const shadow = await probe('/shadow');
console.log(`shadow        requires-js=${/attachShadow/.test(shadow.text)}`);

const iframe = await probe('/iframe');
const iframeContent = await probe('/iframe-content');
console.log(
  `iframe        main-has-price=${/4 900/.test(iframe.text)} nested-has-price=${/4 900/.test(iframeContent.text)}`,
);

const items = await probe('/api/items?page=2');
console.log(`infinite-api  ${items.status} items=${(JSON.parse(items.text).items || []).length}`);

for (const path of ['/clinic', '/travel', '/shop', '/saas']) {
  const page = await probe(path);
  console.log(`business      ${String(page.status).padEnd(4)} ${path}`);
}
