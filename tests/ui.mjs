import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
const steps = process.argv.slice(2);
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1500, height: 950 } });
const logs = [];
p.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') logs.push(m.type() + ': ' + m.text()); });
p.on('pageerror', (e) => logs.push('PAGEERROR: ' + e.message + '\n' + e.stack));
await p.goto('http://localhost:8765/index.html');
await p.waitForTimeout(1200);
let n = 0;
for (const s of steps) {
  const [cmd, arg] = s.split('=');
  try {
    if (cmd === 'shot') { await p.screenshot({ path: `/tmp/claude-0/${arg}.png` }); }
    else if (cmd === 'click') { await p.click(`text=${arg}`, { timeout: 5000 }); await p.waitForTimeout(900); }
    else if (cmd === 'css') { await p.click(arg, { timeout: 5000 }); await p.waitForTimeout(900); }
    else if (cmd === 'wait') await p.waitForTimeout(+arg);
    else if (cmd === 'eval') console.log(await p.evaluate(arg));
  } catch (e) { logs.push(`STEP ${s} FAILED: ${e.message.split('\n')[0]}`); }
}
console.log(logs.join('\n') || 'sin errores');
await b.close();
