import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1500, height: 950 } });
const logs = [];
p.on('pageerror', (e) => logs.push('PAGEERROR: ' + e.message));
await p.goto('http://localhost:8765/index.html'); await p.waitForTimeout(800);
await p.click('text=Lámina de tesis'); await p.waitForTimeout(1500);
for (const [img, n] of [['rangos', 1], ['neon', 2]]) {
  await p.waitForTimeout(300);
  const [fc] = await Promise.all([p.waitForEvent('filechooser'), p.click('text=Estilo desde una imagen…')]);
  await fc.setFiles(`/tmp/claude-0/ref/${img}.png`);
  await p.waitForSelector('.isty', { timeout: 15000 }); await p.waitForTimeout(400);
  await p.screenshot({ path: `/tmp/claude-0/is${n}a.png` });
  await p.click('#app-dialog >> text=Guardar y aplicar'); await p.waitForTimeout(1500);
  logs.push(JSON.stringify(await p.evaluate(() => { const s = window.__et.current.project.styles.at(-1); return { ...s, image: undefined, sizes: undefined }; })));
  await p.screenshot({ path: `/tmp/claude-0/is${n}b.png` });
}
console.log(logs.join('\n')); await b.close();
