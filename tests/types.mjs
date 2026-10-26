import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1500, height: 950 } });
const logs = [];
p.on('pageerror', (e) => logs.push('PAGEERROR: ' + e.message + ' ' + (e.stack || '').split('\n').slice(1, 3).join(' ')));
await p.goto('http://localhost:8765/index.html'); await p.waitForTimeout(800);
await p.click('text=Lámina de tesis'); await p.waitForTimeout(1500);
await p.click('.type-det > summary');
const names = await p.$$eval('.tg-btn span', (s) => s.map((x) => x.textContent));
for (const n of names) {
  try { await p.click(`.tg-btn:has-text("${n}")`, { timeout: 3000 }); await p.waitForTimeout(250);
    const w = await p.$eval('.board-info', (x) => x.textContent).catch(() => '');
    logs.push(`${n}: ${w.slice(0, 140)}`);
    if (!(await p.$('.type-det[open]'))) await p.click('.type-det > summary');
  } catch (e) { logs.push(`✗ ${n}: ${e.message.split('\n')[0]}`); }
}
// estilos y simulaciones
const styles = await p.$$('.style-card');
for (let i = 0; i < styles.length; i++) { await p.click(`.style-card >> nth=${i}`); await p.waitForTimeout(250); }
await p.selectOption('.panel.right .field select >> nth=0', 'proyector-169'); await p.waitForTimeout(300);
await p.click('.tab >> text=Tesis'); await p.waitForTimeout(300);
await p.screenshot({ path: '/tmp/claude-0/t1.png' });
console.log(logs.join('\n'));
await b.close();
