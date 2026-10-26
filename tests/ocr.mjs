import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
const b = await chromium.launch(); const p = await b.newPage();
p.on('console', m => console.log('console', m.text()));
await p.goto('http://localhost:8765/tests/ocr.html');
const r = await p.evaluate(() => window.run('img/rangos-juan.png', 3), ).catch(e=>console.log(e.message));
const r2 = await p.evaluate(() => window.run('img/rangos-juan.png', 3));
console.log(r2.ms); for (const w of r2.words) console.log(w.join(' | '));
await b.close();
