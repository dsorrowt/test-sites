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
