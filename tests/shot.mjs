import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
const [,, file, out, sel] = process.argv;
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1340, height: 900 } });
const logs = [];
p.on('console', (m) => logs.push(m.type() + ': ' + m.text()));
p.on('pageerror', (e) => logs.push('PAGEERROR: ' + e.message));
await p.goto('file://' + process.cwd() + '/' + file);
await p.waitForSelector('body[data-done]', { timeout: 30000 }).catch(() => {});
await p.waitForTimeout(1500);
if (sel) { for (const el of await p.$$(sel)) { const id = await el.getAttribute('id'); await el.screenshot({ path: `${out}/${id}.png` }); } }
else await p.screenshot({ path: out, fullPage: true });
const pre = await p.$$eval('pre', (ps) => ps.map((x) => x.parentElement.id + ' ' + x.textContent.slice(0, 300)));
console.log(logs.slice(0, 20).join('\n')); console.log(pre.join('\n'));
await b.close();
