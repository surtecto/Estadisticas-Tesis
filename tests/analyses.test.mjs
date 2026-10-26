import { readFileSync } from 'node:fs';
import { buildTable } from '../src/data/table.js';
import { jsonToRows } from '../src/data/parse.js';
import { ANALYSES } from '../src/stats/analyses.js';
const raw = jsonToRows(JSON.parse(readFileSync('node_modules/vega-datasets/data/penguins.json')));
const t = buildTable(raw, { name: 'Pingüinos' });
console.log(t.columns.map((c) => `${c.name}:${c.type}`).join(' | '), t.rows.length);
const k = (n) => t.columns.find((c) => c.name.startsWith(n)).key;
const P = {
  desc: { vars: [k('Body'), k('Beak L')], by: k('Species') }, freq: { v: k('Island'), gof: true }, crosstab: { row: k('Species'), col: k('Island') },
  compare2: { y: k('Body'), g: k('Sex') }, paired: { a: k('Beak L'), b: k('Beak D') }, onesample: { y: k('Body'), mu: 4000 }, compareK: { y: k('Beak L'), g: k('Species') },
  anova2: { y: k('Body'), a: k('Species'), b: k('Sex') }, friedman: { vars: [k('Beak L'), k('Beak D'), k('Flipper')] }, corr: { vars: [k('Beak L'), k('Beak D'), k('Flipper'), k('Body')], method: 'spearman', adjust: 'holm' },
  reg: { y: k('Body'), xs: [k('Flipper'), k('Species'), k('Sex')] }, logit: { y: k('Sex'), event: 'MALE', xs: [k('Body'), k('Beak D')] }, pca: { vars: [k('Beak L'), k('Beak D'), k('Flipper'), k('Body')] },
  kmeans: { vars: [k('Beak L'), k('Beak D'), k('Flipper'), k('Body')], k: 3 }, growth: { time: k('Flipper'), v: k('Body') },
};
for (const a of ANALYSES) {
  try {
    const r = a.run(t, P[a.id] || {});
    const apa = r.blocks.find((b) => b.type === 'apa');
    const w = r.blocks.filter((b) => b.type === 'warn').map((b) => b.text);
    console.log('✓', a.id, r.blocks.length, apa ? apa.text.slice(0, 200) : '', w.length ? 'AVISO: ' + w.join(' / ') : '');
  } catch (e) { console.log('✗', a.id, e.stack); }
}
