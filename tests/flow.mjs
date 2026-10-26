import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1500, height: 950 }, acceptDownloads: true });
const p = await ctx.newPage();
const logs = [];
p.on('console', (m) => { if (m.type() === 'error') logs.push('console: ' + m.text()); });
p.on('pageerror', (e) => logs.push('PAGEERROR: ' + e.message + ' ' + (e.stack || '').split('\n')[1]));
const step = async (name, fn) => { try { await fn(); } catch (e) { logs.push(`✗ ${name}: ${e.message.split('\n')[0]}`); } };
await p.goto('http://localhost:8765/index.html'); await p.waitForTimeout(800);
await step('nuevo', async () => { await p.click('.blank-sheet'); await p.fill('.wf input', 'Prueba Giles'); await p.click('text=Seguir: los datos'); });
await step('archivo', async () => {
  const [fc] = await Promise.all([p.waitForEvent('filechooser'), p.click('.choice-file')]);
  await fc.setFiles('/tmp/claude-0/prueba.xlsx'); await p.waitForTimeout(800);
  await p.screenshot({ path: '/tmp/claude-0/f1.png' });
});
await step('figura', async () => { await p.click('text=Seguir: la figura'); await p.waitForTimeout(400); await p.click('text=Crear el proyecto'); await p.waitForTimeout(1500); await p.screenshot({ path: '/tmp/claude-0/f2.png' }); });
// datos: de ancho a largo
await step('melt', async () => { await p.click('.tab >> text=Datos'); await p.click('text=De ancho a largo'); await p.waitForTimeout(300); await p.click('.dlg-actions .btn.primary'); await p.waitForTimeout(800); logs.push('tablas: ' + await p.evaluate(() => Object.values(window.__et.current.tables).map((t) => t.name + ':' + t.rows.length + ':' + t.columns.map((c) => c.name + '/' + c.type).join(',')).join(' | '))); });
await step('graf line', async () => {
  await p.click('.tab >> text=Gráfico'); await p.waitForTimeout(300);
  await p.selectOption('.field:has(> label:text("Tabla")) select', { index: 1 });
  await p.click('.tg-btn:has-text("Líneas")'); await p.waitForTimeout(300);
  const sels = await p.$$('.panel-body .field select');
  await p.selectOption('.field:has(> label:text("Tiempo o secuencia")) select', { label: 'Año' });
  await p.selectOption('.field:has(> label:text("Valor")) select', { label: 'Valor' });
  await p.selectOption('.field:has(> label:text("Series")) select', { label: 'Partido' });
  await p.waitForTimeout(600); await p.screenshot({ path: '/tmp/claude-0/f3.png' });
});
await step('estadística', async () => { await p.click('.tab >> text=Estadística'); await p.selectOption('.field:has(> label:text("Análisis")) select', 'growth'); await p.waitForTimeout(300);
  await p.selectOption('.field:has(> label:text("Tiempo")) select', { label: 'Año' }); await p.selectOption('.field:has(> label:text("Valor")) select', { label: 'Valor' }); await p.selectOption('.field:has(> label:text("Serie")) select', { label: 'Partido' });
  await p.click('text=Calcular'); await p.waitForTimeout(800); await p.screenshot({ path: '/tmp/claude-0/f4.png' }); });
await step('volver figura', async () => { await p.click('.vtab >> text=Figura'); await p.waitForTimeout(500); });
for (const fmt of ['svg', 'png', 'tiff', 'pdf']) await step('export ' + fmt, async () => {
  await p.selectOption('.panel.right select >> nth=-1', fmt);
  const [d] = await Promise.all([p.waitForEvent('download', { timeout: 20000 }), p.click('text=Exportar la figura')]);
  const path = `/tmp/claude-0/out.${fmt}`; await d.saveAs(path); logs.push(`ok export ${fmt}: ${d.suggestedFilename()}`);
});
await step('docx', async () => { await p.click('.topbar .menu-wrap > .btn'); await p.click('text=Informe estadístico en Word'); await p.waitForTimeout(400);
  const [d] = await Promise.all([p.waitForEvent('download', { timeout: 30000 }), p.click('.dlg-actions .btn.primary')]); await d.saveAs('/tmp/claude-0/out.docx'); logs.push('ok docx'); });
await step('home', async () => { await p.click('text=Proyectos'); await p.waitForTimeout(1200); await p.screenshot({ path: '/tmp/claude-0/f5.png' }); });
console.log(logs.join('\n'));
await b.close();
