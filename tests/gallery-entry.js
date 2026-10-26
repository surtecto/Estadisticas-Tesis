import { SAMPLES } from '../src/data/samples.js';
import { renderFigure } from '../src/charts/figure.js';
const T = {}; for (const s of SAMPLES) { const t = s.build(); t.id = s.id; T[s.id] = t; }
const k = (tid, n) => T[tid].columns.find((c) => c.name.startsWith(n)).key;
window.TABLES = T;
const P = (type, tableId, enc, options = {}, extra = {}) => ({ id: type + Math.random(), type, tableId, enc, options: { legend: 'auto', ...options }, filters: [], agg: 'sum', ...extra });
const specs = [
  ['bar', [P('bar', 'pinguinos', { x: k('pinguinos', 'Isla'), color: k('pinguinos', 'Especie') }, { stack: 'stack', showValues: true })]],
  ['bar-mean', [P('bar', 'pinguinos', { x: k('pinguinos', 'Especie'), y: k('pinguinos', 'Masa'), color: k('pinguinos', 'Sexo') }, { errorBars: 'ci', showValues: true }, { agg: 'mean' })]],
  ['dot', [P('dot', 'gapminder', { x: k('gapminder', 'Región'), y: k('gapminder', 'Esperanza'), color: k('gapminder', 'Año') }, { sort: 'desc' }, { agg: 'mean', filters: [{ col: k('gapminder', 'Año'), op: 'in', vals: ['1955', '2005'] }] })]],
  ['meanci', [P('meanci', 'pinguinos', { x: k('pinguinos', 'Especie'), y: k('pinguinos', 'Masa'), color: k('pinguinos', 'Sexo') }, { points: true })]],
  ['hist', [P('hist', 'pinguinos', { y: k('pinguinos', 'Largo del pico'), color: k('pinguinos', 'Especie') }, { overlay: 'density' })]],
  ['density', [P('density', 'pinguinos', { y: k('pinguinos', 'Largo de la aleta'), color: k('pinguinos', 'Especie') }, { ridge: true })]],
  ['box', [P('box', 'pinguinos', { x: k('pinguinos', 'Especie'), y: k('pinguinos', 'Masa'), color: k('pinguinos', 'Especie') }, { points: true, annotate: 'brackets', meanMark: true })]],
  ['violin-facet', [P('violin', 'pinguinos', { x: k('pinguinos', 'Sexo'), y: k('pinguinos', 'Largo del pico'), facet: k('pinguinos', 'Especie') }, { points: true })]],
  ['qq', [P('qq', 'pinguinos', { y: k('pinguinos', 'Masa') }, {})]],
  ['scatter', [P('scatter', 'pinguinos', { x: k('pinguinos', 'Largo de la aleta'), y: k('pinguinos', 'Masa'), color: k('pinguinos', 'Especie') }, { trend: 'linear', annotate: 'stats' })]],
  ['bubble', [P('scatter', 'gapminder', { x: k('gapminder', 'Fecundidad'), y: k('gapminder', 'Esperanza'), color: k('gapminder', 'Región'), size: k('gapminder', 'Población'), label: k('gapminder', 'País') }, {}, { filters: [{ col: k('gapminder', 'Año'), op: 'eq', val: '2005' }] })]],
  ['heatmap', [P('heatmap', 'clima', { x: k('clima', 'Mes'), y: k('clima', 'Año'), size: k('clima', 'Temperatura máxima') }, {}, { agg: 'mean' })]],
  ['corr', [P('corr', 'pinguinos', { vars: ['Largo del pico', 'Alto del pico', 'Largo de la aleta', 'Masa'].map((n) => k('pinguinos', n)) }, {})]],
  ['biplot', [P('biplot', 'pinguinos', { vars: ['Largo del pico', 'Alto del pico', 'Largo de la aleta', 'Masa'].map((n) => k('pinguinos', n)), color: k('pinguinos', 'Especie') }, {})]],
  ['coef', [P('coef', 'pinguinos', { y: k('pinguinos', 'Masa'), xs: [k('pinguinos', 'Largo de la aleta'), k('pinguinos', 'Especie'), k('pinguinos', 'Sexo')] }, { coefStd: true })]],
  ['line', [P('line', 'gapminder', { x: k('gapminder', 'Año'), y: k('gapminder', 'Esperanza'), color: k('gapminder', 'País') }, { highlight: 'Argentina' }, { agg: 'mean', filters: [{ col: k('gapminder', 'País'), op: 'in', vals: ['Argentina', 'Brazil', 'Chile', 'Mexico', 'Peru'] }] })]],
  ['area', [P('area', 'clima', { x: k('clima', 'Año'), y: k('clima', 'Precipitación'), color: k('clima', 'Tiempo') }, { stackArea: 'percent' }, { agg: 'count' })]],
  ['slope', [P('slope', 'gapminder', { label: k('gapminder', 'País'), y: k('gapminder', 'Fecundidad'), y2: k('gapminder', 'Fecundidad') }, {})]],
  ['pie', [P('pie', 'pinguinos', { x: k('pinguinos', 'Especie') }, { donut: true })]],
  ['waffle', [P('waffle', 'pinguinos', { x: k('pinguinos', 'Isla') }, { waffleIcon: 'persona' })]],
  ['treemap', [P('treemap', 'gapminder', { x: k('gapminder', 'País'), color: k('gapminder', 'Región'), y: k('gapminder', 'Población') }, {}, { filters: [{ col: k('gapminder', 'Año'), op: 'eq', val: '2005' }] })]],
  ['pyramid', [P('pyramid', 'poblacion', { y: k('poblacion', 'Edad'), color: k('poblacion', 'Sexo'), x: k('poblacion', 'Personas') }, { pyrPct: true }, { filters: [{ col: k('poblacion', 'Censo'), op: 'eq', val: '2000' }] })]],
  ['radar', [P('radar', 'pinguinos', { vars: ['Largo del pico', 'Alto del pico', 'Largo de la aleta', 'Masa'].map((n) => k('pinguinos', n)), color: k('pinguinos', 'Especie') }, {})]],
  ['kpi', [P('kpi', 'pinguinos', { x: k('pinguinos', 'Especie') }, {})]],
  ['map', [P('map', 'partidos', { geo: k('partidos', 'Partido'), y: k('partidos', 'Superficie') }, { geoLevel: 'dep-ba', classes: 5 })]],
];
const styles = { bar: 'periodistico', kpi: 'info-azul', pie: 'neon', waffle: 'info-azul', line: 'tesis', map: 'pampa', box: 'tesis', 'bar-mean': 'byn', density: 'humanidades', scatter: 'revista', radar: 'neon', heatmap: 'minimo' };
for (const [name, panels] of specs) {
  const fig = { media: { profileId: 'tesis-a4' }, style: styles[name] || 'tesis', title: `Prueba ${name}`, subtitle: 'Bajada de prueba', caption: { mode: name === 'bar' || name === 'kpi' ? 'titulo' : 'apa', number: 1, source: 'vega-datasets', note: '' }, layout: { cols: 1 }, panels };
  const div = document.createElement('div'); div.className = 'fig'; div.id = 'fig-' + name;
  try { const r = renderFigure(fig, { tables: T, screen: true }); div.appendChild(r.svg); const p = document.createElement('pre'); p.textContent = [...r.warnings.map((w) => '⚠ ' + w), ...r.notes].join('\n'); div.appendChild(p); }
  catch (e) { div.textContent = name + ': ' + e.stack; }
  document.body.appendChild(div);
}
document.body.dataset.done = '1';
