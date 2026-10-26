import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
const b = await chromium.launch(); const p = await b.newPage();
await p.goto('http://localhost:8765/tests/dig.html');
console.log(JSON.stringify(await p.evaluate((u) => window.dig(u), process.argv[2])));
await b.close();
