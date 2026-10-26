import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
const b = await chromium.launch(); const p = await b.newPage();
p.on('pageerror', e => console.log('PAGEERROR', e.message));
p.on('console', m => { if (m.type() === 'error') console.log('console', m.text()); });
await p.goto('http://localhost:8765/tests/dig.html');
for (const f of process.argv.slice(2)) {
  const t0 = Date.now();
  const r = await p.evaluate((u) => window.dig(u), f);
  console.log('==', f, Date.now() - t0, 'ms');
  console.log(JSON.stringify({ ...r, rows: undefined }, null, 0));
  for (const row of r.rows) console.log('  ', JSON.stringify(row));
}
await b.close();
