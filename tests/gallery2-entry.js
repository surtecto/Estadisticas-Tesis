import { SAMPLES } from '../src/data/samples.js';
import { renderFigure } from '../src/charts/figure.js';
import { buildTable } from '../src/data/table.js';
const T = {}; for (const s of SAMPLES) { const t = s.build(); t.id = s.id; T[s.id] = t; }
T.ev = buildTable([['Hito', 'Año', 'Fin', 'Tipo'], ['Fundación del pueblo', 1830, null, 'Poblamiento'], ['Llegada del ferrocarril', 1880, null, 'Infraestructura'], ['Mensuras', 1825, 1925, 'Catastro'], ['Censo provincial', 1881, null, 'Poblamiento'], ['Ruta 7 pavimentada', 1950, null, 'Infraestructura'], ['Loteos', 1960, 1990, 'Catastro']], { name: 'ev' }); T.ev.id = 'ev';
T.fl = buildTable([['Etapa', 'Cambio'], ['Población 2010', 23027], ['Nacimientos', 4200], ['Defunciones', -2600], ['Migración neta', 1900]], { name: 'fl' }); T.fl.id = 'fl';
const k = (tid, n) => T[tid].columns.find((c) => c.name.startsWith(n)).key;
const P = (type, tableId, enc, options = {}, extra = {}) => ({ id: type + Math.random(), type, tableId, enc, options: { legend: 'auto', ...options }, filters: [], agg: 'sum', ...extra });
const pg = (n) => k('pinguinos', n), gm = (n) => k('gapminder', n);
const y05 = [{ col: gm('Año'), op: 'eq', val: '2005' }];
const specs = [
  ['timeline', [P('timeline', 'ev', { label: k('ev', 'Hito'), start: k('ev', 'Año'), end: k('ev', 'Fin'), color: k('ev', 'Tipo') })]],
  ['waterfall', [P('waterfall', 'fl', { x: k('fl', 'Etapa'), y: k('fl', 'Cambio') }, { totalLabel: 'Población estimada' })]],
  ['funnel', [P('funnel', 'clima', { x: k('clima', 'Tiempo') }, {}, { agg: 'count' })]],
  ['bullet', [P('bullet', 'pinguinos', { x: pg('Especie'), y: pg('Masa'), target: pg('Largo de la aleta') }, {}, { agg: 'mean' })]],
  ['sankey', [P('sankey', 'pinguinos', { vars: [pg('Isla'), pg('Especie'), pg('Sexo')] })]],
  ['sunburst', [P('sunburst', 'gapminder', { vars: [gm('Región'), gm('País')], y: gm('Población') }, {}, { filters: y05 })]],
  ['marimekko', [P('marimekko', 'pinguinos', { x: pg('Isla'), color: pg('Especie') })]],
  ['parallel', [P('parallel', 'pinguinos', { vars: ['Largo del pico', 'Alto del pico', 'Largo de la aleta', 'Masa'].map(pg), color: pg('Especie') })]],
  ['rose', [P('rose', 'clima', { x: k('clima', 'Mes'), y: k('clima', 'Precipitación') }, {}, { agg: 'sum' })]],
  ['radialbar', [P('radialbar', 'pinguinos', { x: pg('Especie') }, {}, { agg: 'count' })]],
  ['calendar', [P('calendar', 'clima', { x: k('clima', 'Fecha'), y: k('clima', 'Temperatura máxima') }, {}, { agg: 'mean', filters: [{ col: k('clima', 'Año'), op: 'in', vals: ['2014', '2015'] }] })]],
  ['beeswarm', [P('beeswarm', 'pinguinos', { x: pg('Masa'), group: pg('Especie'), color: pg('Sexo') })]],
  ['ecdf', [P('ecdf', 'pinguinos', { y: pg('Masa'), color: pg('Especie') })]],
  ['hexbin', [P('hexbin', 'clima', { x: k('clima', 'Temperatura mínima'), y: k('clima', 'Temperatura máxima') })]],
  ['bump', [P('bump', 'gapminder', { x: gm('Año'), y: gm('Esperanza'), color: gm('País') }, {}, { filters: [{ col: gm('País'), op: 'in', vals: ['Argentina', 'Brazil', 'Chile', 'Mexico', 'Peru', 'Bolivia'] }] })]],
  ['gauge', [P('gauge', 'pinguinos', { y: pg('Masa') }, { gMin: 2500, gMax: 6500, target: 4500 }, { agg: 'mean' })]],
  ['progress', [P('progress', 'gapminder', { x: gm('Región') }, {}, { agg: 'count', filters: y05 })]],
  ['table', [P('table', 'pinguinos', { x: pg('Especie'), vars: ['Largo del pico', 'Largo de la aleta', 'Masa'].map(pg) }, {}, { agg: 'mean' })]],
  ['stream', [P('area', 'clima', { x: k('clima', 'Año'), y: k('clima', 'Precipitación'), color: k('clima', 'Tiempo') }, { stackArea: 'stream' }, { agg: 'count' })]],
  ['gantt', [P('gantt', 'ev', { label: k('ev', 'Hito'), start: k('ev', 'Año'), end: k('ev', 'Fin'), color: k('ev', 'Tipo') })]],
];
for (const [name, panels] of specs) {
  const fig = { media: { profileId: 'tesis-a4' }, style: ['progress', 'radialbar', 'gauge'].includes(name) ? 'info-azul' : name === 'sunburst' ? 'neon' : 'tesis', title: `Prueba ${name}`, caption: { mode: 'apa', number: 1, source: 'prueba' }, layout: { cols: 1 }, panels };
  const div = document.createElement('div'); div.className = 'fig'; div.id = 'fig-' + name;
  try { const r = renderFigure(fig, { tables: T, screen: true }); div.appendChild(r.svg); const p = document.createElement('pre'); p.textContent = r.warnings.map((w) => '⚠ ' + w).join('\n'); div.appendChild(p); }
  catch (e) { div.textContent = name + ': ' + e.stack; }
  document.body.appendChild(div);
}
document.body.dataset.done = '1';
