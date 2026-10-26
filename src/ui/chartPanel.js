// Pestaña Gráfico: paneles de la lámina, tipo de gráfico, variables de cada canal, agregación, filtros y opciones.
import { el, clear } from '../util.js';
import { CHART_TYPES, TYPE_GROUPS, TYPE_ICONS, getType, defaultPanel } from '../charts/types.js';
import { AGGS, FILTER_OPS, levelsOf, getCol, isNum, isCat, typeName } from '../data/table.js';
import { RAMPS, PALETTES, paletteColors, getPalette } from '../palette.js';
import { PROVINCES } from '../charts/geo.js';
import { UNIT_SYSTEMS } from '../charts/core.js';
import { scaledTheme } from '../charts/figure.js';

const LETTER = (i) => String.fromCharCode(65 + i);
const ico = (paths, n) => el('span', { class: 'ty-ico', 'aria-hidden': 'true', html: `<svg viewBox="0 0 24 24" width="${n}" height="${n}" fill="currentColor" stroke="currentColor" stroke-width="1.4">${paths || ''}</svg>` });

export function renderChartPanel(E, b) {
  const fig = E.fig;
  if (!E.tableOrder.length) {
    b.append(el('p', { class: 'note' }, 'Primero agregá una tabla de datos.'), el('button', { type: 'button', class: 'btn primary', onclick: () => E.setLeftTab('datos') }, 'Ir a Datos'));
    return;
  }
  // ---- paneles
  const strip = el('div', { class: 'panel-strip' });
  fig.panels.forEach((p, i) => strip.appendChild(el('button', { type: 'button', class: `pchip ${i === E.activePanel ? 'on' : ''}`, title: getType(p.type).name, onclick: () => { E.activePanel = i; E.renderLeft(); E.renderBoard(); } }, el('b', {}, LETTER(i)), ico(TYPE_ICONS[p.type], 15))));
  strip.appendChild(el('button', { type: 'button', class: 'pchip add', title: 'Agregar un panel a la lámina', onclick: () => addPanel(E) }, '+ Panel'));
  b.appendChild(el('div', { class: 'field' }, el('label', {}, fig.panels.length > 1 ? 'Paneles de la lámina' : 'Panel'), strip));
  if (!fig.panels.length) { addPanel(E, true); return; }
  const p = fig.panels[E.activePanel] || fig.panels[0];
  if (fig.panels.length > 1) {
    const cols = el('select', {}, ...[1, 2, 3, 4].map((n) => el('option', { value: n, selected: (fig.layout.cols || 1) === n }, `${n} columna${n > 1 ? 's' : ''}`)));
    cols.addEventListener('change', () => { fig.layout.cols = +cols.value; E.changed('columnas'); });
    const span = el('select', {}, ...[1, 2, 3, 4].map((n) => el('option', { value: n, selected: (p.span || 1) === n }, n === 1 ? 'una celda' : `${n} columnas`)));
    span.addEventListener('change', () => { p.span = +span.value; E.changed('ancho'); });
    b.appendChild(el('div', { class: 'field-row' }, el('div', { class: 'field' }, el('label', {}, 'Distribución'), cols), el('div', { class: 'field' }, el('label', {}, `Ancho del panel ${LETTER(E.activePanel)}`), span)));
    b.appendChild(el('div', { class: 'btn-row' },
      el('button', { type: 'button', class: 'btn small', disabled: E.activePanel === 0, onclick: () => movePanel(E, -1) }, '← Antes'),
      el('button', { type: 'button', class: 'btn small', disabled: E.activePanel === fig.panels.length - 1, onclick: () => movePanel(E, 1) }, 'Después →'),
      el('button', { type: 'button', class: 'btn small', onclick: () => { fig.panels.splice(E.activePanel + 1, 0, { ...JSON.parse(JSON.stringify(p)), id: `P${Math.random().toString(36).slice(2, 8)}` }); E.activePanel++; E.changed('duplicar', { left: true }); } }, 'Duplicar'),
      el('button', { type: 'button', class: 'btn small danger', onclick: () => { fig.panels.splice(E.activePanel, 1); E.activePanel = Math.max(0, E.activePanel - 1); E.changed('quitar', { left: true }); } }, 'Quitar')));
  }
  // ---- tabla
  const tsel = el('select', {}, ...E.tableOrder.map((id) => el('option', { value: id, selected: id === p.tableId }, E.tables[id].name)));
  tsel.addEventListener('change', () => { p.tableId = tsel.value; p.enc = {}; p.filters = []; E.changed('tabla', { left: true }); });
  if (!p.tableId || !E.tables[p.tableId]) { p.tableId = E.tableOrder[0]; }
  const t = E.tables[p.tableId];
  b.appendChild(el('div', { class: 'field' }, el('label', {}, 'Tabla'), tsel));
  // ---- tipo
  const gal = el('div', { class: 'type-gallery' });
  for (const g of TYPE_GROUPS) {
    gal.appendChild(el('div', { class: 'tg-h' }, g));
    const row = el('div', { class: 'tg-row' });
    for (const ty of CHART_TYPES.filter((x) => x.group === g)) {
      row.appendChild(el('button', { type: 'button', class: `tg-btn ${p.type === ty.id ? 'on' : ''}`, title: `${ty.name}: ${ty.desc}`, 'aria-pressed': String(p.type === ty.id), onclick: () => setType(E, p, ty.id) },
        ico(TYPE_ICONS[ty.id], 22), el('span', {}, ty.name)));
    }
    gal.appendChild(row);
  }
  const ty = getType(p.type);
  b.appendChild(el('details', { class: 'type-det', open: !p.enc || !Object.keys(p.enc).length }, el('summary', {}, el('span', {}, 'Tipo: '), el('strong', {}, ty.name)), el('p', { class: 'note' }, ty.desc), gal));
  // ---- variables
  b.appendChild(el('h3', { class: 'panel-h first' }, 'Variables'));
  for (const [k, label, kind, optional] of ty.enc) b.appendChild(encField(E, p, t, k, label, kind, optional));
  const sug = suggestTypes(t, p);
  if (sug.length) b.appendChild(el('div', { class: 'sugg' }, el('span', {}, 'También sirve: '), ...sug.map((s) => el('button', { type: 'button', class: 'chip', onclick: () => setType(E, p, s) }, getType(s).name))));
  // ---- agregación
  if (ty.opts.includes('agg') && p.enc && p.enc.y || (ty.opts.includes('agg') && p.type === 'kpi')) {
    const a = el('select', {}, ...AGGS.filter(([k]) => p.type === 'bar' || k !== 'pct').map(([k, l]) => el('option', { value: k, selected: (p.agg || 'sum') === k }, l)));
    a.addEventListener('change', () => { p.agg = a.value; E.changed('agregación', { left: true }); });
    b.appendChild(el('div', { class: 'field' }, el('label', {}, 'Cómo resumir el valor en cada categoría'), a, el('div', { class: 'hint' }, 'Suma para totales (población, superficie); media o mediana para medidas por caso (edad, masa, ingresos).')));
  }
  // ---- filtros
  b.appendChild(filtersBox(E, p, t));
  // ---- opciones
  b.appendChild(el('h3', { class: 'panel-h' }, 'Opciones'));
  const ttl = el('input', { type: 'text', value: p.title || '', placeholder: fig.panels.length > 1 ? 'Título breve del panel (va junto a la letra)' : 'Título del panel (opcional)' });
  ttl.addEventListener('change', () => { p.title = ttl.value.trim(); E.changed('título'); });
  b.appendChild(el('div', { class: 'field' }, el('label', {}, 'Título del panel'), ttl));
  const opts = el('div', { class: 'opts' });
  for (const o of ty.opts) { const c = optControl(E, p, t, o); if (c) opts.appendChild(c); }
  if (ty.facet && p.enc && p.enc.facet) opts.appendChild(optSelect(E, p, 'facetScales', 'Escalas de los paneles múltiples', [['', 'Compartidas (para comparar)'], ['free', 'Libres (cada uno con la suya)']]));
  b.appendChild(opts);
  b.appendChild(colorsBox(E, p, t));
}

function setType(E, p, id) {
  const old = getType(p.type), ny = getType(id);
  p.type = id;
  // conserva las variables compatibles
  const keep = {};
  const oldEnc = { ...(p.enc || {}) };
  for (const [k, , kind] of ny.enc) if (p.enc && p.enc[k] != null) keep[k] = p.enc[k];
  if (!keep.y && p.enc && p.enc.x && ['hist', 'density', 'qq'].includes(id)) keep.y = p.enc.x;
  // completa los canales obligatorios con las variables que ya estaban elegidas, según su tipo
  const t0 = E.tables[p.tableId];
  const prevCols = Object.values(p.enc || {}).flatMap((v) => (Array.isArray(v) ? v : [v])).filter((v) => typeof v === 'string').map((v) => getCol(t0, v)).filter(Boolean);
  const used = new Set(Object.values(keep).filter((v) => typeof v === 'string'));
  for (const [kk, , kind, optional] of ny.enc) {
    if (keep[kk] != null || optional || kind.endsWith('Multi')) continue;
    const c = prevCols.find((c2) => !used.has(c2.key) && (kind === 'num' ? isNum(c2) : kind === 'cat' ? isCat(c2) : true));
    if (c) { keep[kk] = c.key; used.add(c.key); }
  }
  if (['corr', 'radar', 'biplot'].includes(id) && !keep.vars) { const t = E.tables[p.tableId]; keep.vars = t.columns.filter((c) => c.type === 'num').slice(0, 5).map((c) => c.key); }
  p.enc = keep;
  if (id === 'dot' || id === 'meanci') p.agg = 'mean';
  E.changed('tipo', { left: true });
}
function addPanel(E, silent = false) {
  const prev = E.fig.panels[E.activePanel];
  const tid = (prev && prev.tableId) || E.activeTable || E.tableOrder[0];
  const t = E.tables[tid];
  const p = defaultPanel(t, 'bar');
  // propone variables razonables para empezar
  const cat = t.columns.find((c) => isCat(c) && levelsOf(t, c.key).length <= 12);
  const num = t.columns.find((c) => isNum(c));
  if (cat) p.enc.x = cat.key;
  if (!cat && num) { p.type = 'hist'; p.enc.y = num.key; }
  E.fig.panels.push(p);
  E.activePanel = E.fig.panels.length - 1;
  if (E.fig.panels.length > 1 && (E.fig.layout.cols || 1) === 1) E.fig.layout.cols = 2;
  if (E.fig.panels.length > 1 && E.fig.caption.mode === 'apa') E.fig.layout.letters = true;
  E.changed('panel', { left: true, right: !silent });
}
function movePanel(E, d) {
  const a = E.fig.panels, i = E.activePanel, j = i + d;
  if (j < 0 || j >= a.length) return;
  [a[i], a[j]] = [a[j], a[i]];
  E.activePanel = j;
  E.changed('orden', { left: true });
}

// ---------- variables ----------
function acceptable(c, kind) {
  if (kind === 'num' || kind === 'numMulti') return c.type === 'num';
  if (kind === 'cat') return c.type !== 'text' || true;
  return true;
}
function encField(E, p, t, k, label, kind, optional) {
  p.enc = p.enc || {};
  if (kind === 'numMulti' || kind === 'anyMulti') {
    const box = el('div', { class: 'chips multi' });
    const cur = new Set(p.enc[k] || []);
    for (const c of t.columns.filter((c2) => kind === 'anyMulti' || c2.type === 'num')) {
      const i = el('input', { type: 'checkbox', checked: cur.has(c.key) });
      i.addEventListener('change', () => { const s = new Set(p.enc[k] || []); if (i.checked) s.add(c.key); else s.delete(c.key); p.enc[k] = t.columns.map((x) => x.key).filter((x) => s.has(x)); E.changed('variables'); });
      box.appendChild(el('label', { class: 'chip' }, i, c.name));
    }
    return el('div', { class: 'field' }, el('label', {}, label), box);
  }
  if (k === 'event' ) return null;
  const s = el('select', {}, el('option', { value: '' }, optional ? '— ninguna —' : '— elegir —'));
  const groups = { num: [], cat: [], other: [] };
  for (const c of t.columns) {
    if ((kind === 'num') && c.type !== 'num') continue;
    const o = el('option', { value: c.key, selected: p.enc[k] === c.key }, `${c.name}`);
    (c.type === 'num' ? groups.num : c.type === 'cat' || c.type === 'ord' ? groups.cat : groups.other).push(o);
  }
  if (groups.cat.length) s.appendChild(el('optgroup', { label: 'Categóricas' }, ...groups.cat));
  if (groups.num.length) s.appendChild(el('optgroup', { label: 'Numéricas' }, ...groups.num));
  if (groups.other.length) s.appendChild(el('optgroup', { label: 'Fechas, textos y códigos' }, ...groups.other));
  s.addEventListener('change', () => { if (s.value) p.enc[k] = s.value; else delete p.enc[k]; if (k === 'y' && !s.value && p.agg !== 'count') p.agg = 'count'; else if (k === 'y' && s.value && p.agg === 'count') p.agg = p.type === 'bar' && isNum(getCol(t, s.value)) ? 'sum' : 'mean'; E.changed('variable', { left: true }); });
  const c = getCol(t, p.enc[k]);
  let hint = null;
  if (c && k === 'color' && isCat(c) && levelsOf(t, c.key).length > 8) hint = `${levelsOf(t, c.key).length} categorías: más de ocho colores no se distinguen.`;
  if (c && (k === 'x' || k === 'facet') && isNum(c) && ['bar', 'box', 'violin', 'meanci', 'dot', 'pie'].includes(p.type) && levelsOf(t, c.key).length > 25) hint = 'Es numérica con muchos valores: ¿agruparla en clases (Datos → Transformar)?';
  return el('div', { class: 'field' }, el('label', {}, label), s, hint ? el('div', { class: 'hint warn' }, hint) : null);
}
function suggestTypes(t, p) {
  const e = p.enc || {};
  const c = (k) => getCol(t, e[k]);
  const x = c('x'), y = c('y'), col = c('color');
  const out = [];
  if (x && y && isCat(x) && isNum(y)) out.push('box', 'violin', 'meanci', 'dot');
  if (x && y && isNum(x) && isNum(y)) out.push('scatter', 'line');
  if (x && !y && isCat(x)) out.push('bar', 'pie', 'waffle', 'treemap');
  if (y && !x && isNum(y)) out.push('hist', 'density', 'box', 'qq');
  if (x && col && isCat(x) && isCat(col) && !y) out.push('heatmap', 'bar');
  if (x && (x.type === 'date' || /^(año|anio|year|fecha|periodo|período)/i.test(x.name))) out.push('line', 'area');
  return [...new Set(out)].filter((id) => id !== p.type).slice(0, 5);
}

// ---------- filtros ----------
function filtersBox(E, p, t) {
  p.filters = p.filters || [];
  const box = el('div', { class: 'filters' });
  p.filters.forEach((f, i) => {
    const cs = el('select', {}, ...t.columns.map((c) => el('option', { value: c.key, selected: c.key === f.col }, c.name)));
    const col = getCol(t, f.col) || t.columns[0];
    const ops = FILTER_OPS.filter(([k]) => (isNum(col) ? !['contains'].includes(k) : !['gt', 'ge', 'lt', 'le', 'between'].includes(k)));
    const os = el('select', {}, ...ops.map(([k, l]) => el('option', { value: k, selected: k === f.op }, l)));
    cs.addEventListener('change', () => { f.col = cs.value; f.vals = []; f.val = ''; E.changed('filtro', { left: true }); });
    os.addEventListener('change', () => { f.op = os.value; E.changed('filtro', { left: true }); });
    let val = null;
    if (f.op === 'in' || f.op === 'nin') {
      const lv = levelsOf(t, f.col);
      val = el('div', { class: 'chips small' }, ...lv.slice(0, 60).map((l) => { const i2 = el('input', { type: 'checkbox', checked: (f.vals || []).includes(l) }); i2.addEventListener('change', () => { const s = new Set(f.vals || []); if (i2.checked) s.add(l); else s.delete(l); f.vals = lv.filter((x) => s.has(x)); E.changed('filtro'); }); return el('label', { class: 'chip' }, i2, l); }));
    } else if (!['null', 'notnull'].includes(f.op)) {
      const lv = !isNum(col) ? levelsOf(t, f.col) : null;
      const inp = lv && f.op !== 'contains' ? el('select', {}, el('option', { value: '' }, '—'), ...lv.map((l) => el('option', { value: l, selected: String(f.val) === l }, l))) : el('input', { type: 'text', value: f.val ?? '', placeholder: 'valor' });
      inp.addEventListener('change', () => { f.val = inp.value; E.changed('filtro'); });
      val = el('div', { class: 'f-val' }, inp);
      if (f.op === 'between') { const i2 = el('input', { type: 'text', value: f.val2 ?? '', placeholder: 'hasta' }); i2.addEventListener('change', () => { f.val2 = i2.value; E.changed('filtro'); }); val.appendChild(i2); }
    }
    box.appendChild(el('div', { class: 'filter' }, el('div', { class: 'f-top' }, cs, os, el('button', { type: 'button', class: 'icon ghost', title: 'Quitar el filtro', onclick: () => { p.filters.splice(i, 1); E.changed('filtro', { left: true }); } }, '×')), val));
  });
  const t0 = t.columns.find((c) => isCat(c)) || t.columns[0];
  box.appendChild(el('button', { type: 'button', class: 'btn small', onclick: () => { p.filters.push({ col: t0.key, op: isCat(t0) ? 'in' : 'gt', vals: [], val: '' }); E.changed('filtro', { left: true }); } }, '+ Filtrar casos'));
  const n = p.filters.length;
  return el('details', { class: 'sec', open: n > 0 }, el('summary', {}, `Filtros${n ? ` (${n})` : ''}`), box);
}

// ---------- opciones ----------
function optSelect(E, p, key, label, options, { left = false, hint = null } = {}) {
  const o = p.options || (p.options = {});
  const s = el('select', {}, ...options.map(([v, l]) => el('option', { value: v, selected: String(o[key] ?? '') === String(v) }, l)));
  s.addEventListener('change', () => { if (s.value === '') delete o[key]; else o[key] = /^-?\d+(\.\d+)?$/.test(s.value) && !['highlight'].includes(key) ? +s.value : s.value; E.changed(key, { left }); });
  return el('div', { class: 'field' }, el('label', {}, label), s, hint ? el('div', { class: 'hint' }, hint) : null);
}
function optCheck(E, p, key, label, def = false) {
  const o = p.options || (p.options = {});
  const i = el('input', { type: 'checkbox', checked: o[key] ?? def });
  i.addEventListener('change', () => { o[key] = i.checked; E.changed(key); });
  return el('label', { class: 'check' }, i, el('span', {}, label));
}
function optNum(E, p, key, label, { placeholder = 'automático', step = 'any' } = {}) {
  const o = p.options || (p.options = {});
  const i = el('input', { type: 'text', inputmode: 'decimal', value: o[key] ?? '', placeholder });
  i.addEventListener('change', () => { const v = i.value.trim().replace(',', '.'); if (v === '') delete o[key]; else if (Number.isFinite(+v)) o[key] = +v; else { i.value = o[key] ?? ''; return; } E.changed(key); });
  return el('div', { class: 'field' }, el('label', {}, label), i);
}
function optText(E, p, key, label, placeholder = '') {
  const o = p.options || (p.options = {});
  const i = el('input', { type: 'text', value: o[key] ?? '', placeholder });
  i.addEventListener('change', () => { if (i.value.trim() === '') delete o[key]; else o[key] = i.value; E.changed(key); });
  return el('div', { class: 'field' }, el('label', {}, label), i);
}
const two = (...n) => el('div', { class: 'field-row' }, ...n);
function levelOpts(t, key) { return key && getCol(t, key) ? levelsOf(t, key).slice(0, 80).map((l) => [l, l]) : []; }

function optControl(E, p, t, id) {
  const e = p.enc || {};
  switch (id) {
    case 'agg': return null;
    case 'orientation': return optSelect(E, p, 'orientation', 'Orientación', [['', 'Vertical'], ['h', 'Horizontal (nombres largos o muchas categorías)']]);
    case 'stack': return e.color ? optSelect(E, p, 'stack', 'Subgrupos', [['group', 'Agrupados (lado a lado)'], ['stack', 'Apilados'], ['percent', 'Apilados al 100 %']]) : null;
    case 'sort': return optSelect(E, p, 'sort', 'Orden de las categorías', [['', 'El de la tabla'], ['desc', 'De mayor a menor'], ['asc', 'De menor a mayor']]);
    case 'showValues': return optCheck(E, p, 'showValues', 'Mostrar los valores', p.type === 'pie' || p.type === 'treemap' || p.type === 'kpi');
    case 'errorBars': return (p.type === 'meanci' || p.agg === 'mean') ? optSelect(E, p, 'errorBars', 'Barras de error', [['', p.type === 'meanci' ? 'IC 95 %' : 'Ninguna'], ['ci', 'Intervalo de confianza del 95 %'], ['se', 'Error estándar'], ['sd', 'Desvío estándar']], { hint: 'Decí siempre en el epígrafe qué muestran: no es lo mismo un IC que un DE.' }) : null;
    case 'highlight': { const k = p.type === 'line' || p.type === 'scatter' || p.type === 'box' && e.color ? e.color || e.x : e.x || e.color; const lv = levelOpts(t, k); return lv.length ? optSelect(E, p, 'highlight', 'Destacar una categoría (las demás en gris)', [['', '— ninguna —'], ...lv]) : null; }
    case 'yAxis': return el('details', { class: 'sec' }, el('summary', {}, 'Eje vertical y línea de referencia'), two(optNum(E, p, 'yMin', 'Mínimo'), optNum(E, p, 'yMax', 'Máximo')), optText(E, p, 'yTitle', 'Título del eje', 'automático'), two(optNum(E, p, 'refLine', 'Línea de referencia en'), optText(E, p, 'refLabel', 'Rótulo de la línea', 'p. ej. media provincial')), optSelect(E, p, 'yUnits', 'Unidades', UNIT_SYSTEMS), optCheck(E, p, 'yZero', 'Incluir el cero'), optCheck(E, p, 'yLog', 'Escala logarítmica'), optNum(E, p, 'yDecimals', 'Decimales en el eje'));
    case 'xAxis': return el('details', { class: 'sec' }, el('summary', {}, 'Eje horizontal'), two(optNum(E, p, 'xMin', 'Mínimo'), optNum(E, p, 'xMax', 'Máximo')), optText(E, p, 'xTitle', 'Título del eje', 'automático'), optSelect(E, p, 'xUnits', 'Unidades', UNIT_SYSTEMS), optCheck(E, p, 'xZero', 'Incluir el cero'), optCheck(E, p, 'xLog', 'Escala logarítmica'));
    case 'legend': return optSelect(E, p, 'legend', 'Leyenda', [['auto', 'Automática'], ['right', 'A la derecha'], ['bottom', 'Abajo'], ['top', 'Arriba'], ['none', 'Sin leyenda (rótulos directos)']]);
    case 'lollipop': return optCheck(E, p, 'lollipop', 'Piruleta (línea desde el cero)');
    case 'connect': return e.color ? optCheck(E, p, 'connect', 'Unir las medias de cada subgrupo (gráfico de interacción)', true) : null;
    case 'points': return optCheck(E, p, 'points', p.type === 'line' ? 'Marcar los puntos' : 'Mostrar los casos (puntos)', p.type === 'line');
    case 'meanMark': return optCheck(E, p, 'meanMark', 'Marcar la media (rombo)');
    case 'annotate': return p.type === 'scatter' ? optSelect(E, p, 'annotate', 'Anotación', [['', 'Ninguna'], ['stats', 'Ecuación, R², r y p']]) : optSelect(E, p, 'annotate', 'Comparaciones entre grupos', [['', 'Ninguna'], ['brackets', 'Corchetes con significación (Holm)']]);
    case 'bins': return el('div', {}, two(optSelect(E, p, 'binMethod', 'Intervalos', [['sturges', 'Regla de Sturges'], ['fd', 'Freedman–Diaconis'], ['scott', 'Scott'], ['n', 'Cantidad elegida']]), optNum(E, p, 'bins', 'Cantidad')));
    case 'histY': return optSelect(E, p, 'histY', 'Eje vertical', [['count', 'Cantidad de casos'], ['pct', 'Porcentaje'], ['density', 'Densidad']]);
    case 'overlay': return optSelect(E, p, 'overlay', 'Superponer', [['', 'Nada'], ['density', 'Curva de densidad'], ['normal', 'Curva normal teórica'], ['both', 'Las dos'], ...(e.color ? [['overlap', 'Grupos superpuestos (en vez de apilados)']] : [])]);
    case 'refLine': return two(optNum(E, p, 'refLine', 'Línea de referencia en'), optText(E, p, 'refLabel', 'Rótulo'));
    case 'ridge': return e.color ? optCheck(E, p, 'ridge', 'En crestas (una curva por grupo, escalonadas)') : null;
    case 'trend': return el('div', {}, optSelect(E, p, 'trend', 'Tendencia', [['', 'Ninguna'], ['linear', 'Recta (mínimos cuadrados)'], ['poly2', 'Curva de 2.º grado'], ['poly3', 'Curva de 3.er grado'], ['log', 'Logarítmica'], ['exp', 'Exponencial'], ['loess', 'Suavizado LOESS']]), (p.options || {}).trend ? optCheck(E, p, 'band', 'Banda del IC 95 %', true) : null, (p.options || {}).trend && e.color ? optSelect(E, p, 'trendBy', 'Ajuste', [['', 'Uno por grupo'], ['all', 'Uno para todos los casos']]) : null);
    case 'jitter': return optCheck(E, p, 'jitter', 'Separar puntos superpuestos (dispersión aleatoria leve)');
    case 'labelSome': return e.label ? optSelect(E, p, 'labelSome', 'Rótulos de los casos', [['', 'Los más extremos'], ['all', 'Todos'], ['none', 'Ninguno']]) : null;
    case 'cellValues': return optCheck(E, p, 'cellValues', 'Valores en las celdas', true);
    case 'heatPct': return optSelect(E, p, 'heatPct', 'Mostrar', [['', 'El valor'], ['row', '% de cada fila'], ['total', '% del total']]);
    case 'ramp': return optSelect(E, p, 'ramp', 'Rampa de color', [['', 'La del estilo'], ...RAMPS.map((r) => [r.id, r.name])]);
    case 'corrMethod': return optSelect(E, p, 'corrMethod', 'Coeficiente', [['pearson', 'Pearson'], ['spearman', 'Spearman'], ['kendall', 'Kendall']]);
    case 'triangle': return optCheck(E, p, 'triangle', 'Solo el triángulo inferior', true);
    case 'coefStd': return optCheck(E, p, 'coefStd', 'Coeficientes estandarizados (comparables entre predictores)');
    case 'logistic': { const c = getCol(t, e.y); return c && !isNum(c) ? optSelect(E, p, 'event', 'Categoría «evento»', levelOpts(t, e.y)) : null; }
    case 'smooth': return optCheck(E, p, 'smooth', 'Línea suavizada (monótona)');
    case 'endLabels': return e.color ? optCheck(E, p, 'endLabels', 'Nombres al final de cada línea', true) : null;
    case 'index100': return optCheck(E, p, 'index100', 'Índice: cada serie = 100 en su primer dato');
    case 'band': return p.agg === 'mean' ? optCheck(E, p, 'band', 'Banda del IC 95 % de la media') : null;
    case 'stackArea': return optSelect(E, p, 'stackArea', 'Áreas', [['stack', 'Apiladas'], ['percent', 'Al 100 %'], ['stream', 'Corriente (streamgraph, centrada)']]);
    case 'donut': return optSelect(E, p, 'donut', 'Forma', [['', 'Torta'], ['thick', 'Dona'], ['thin', 'Dona fina']]);
    case 'maxSlices': return optNum(E, p, 'maxSlices', 'Máximo de partes (el resto va a «Otras»)', { placeholder: '6' });
    case 'waffleIcon': return optSelect(E, p, 'waffleIcon', 'Casillas', [['', 'Cuadrados'], ['circulo', 'Círculos'], ['persona', 'Personas'], ['casa', 'Viviendas'], ['arbol', 'Árboles']]);
    case 'pyrPct': return optCheck(E, p, 'pyrPct', 'En porcentaje de la población total');
    case 'radarNorm': return optCheck(E, p, 'radarNorm', 'Normalizar cada variable a 0–1', true);
    case 'kpiShape': return optSelect(E, p, 'kpiShape', 'Forma', [['ring', 'Anillo'], ['bar', 'Cifra con barra']]);
    case 'kpiMax': return (p.enc && p.enc.vars && p.enc.vars.length) ? optNum(E, p, 'kpiMax', 'Valor que completa el anillo', { placeholder: 'el máximo' }) : null;
    case 'geoLevel': return el('div', {}, optSelect(E, p, 'geoLevel', 'Cartografía', [['dep-ba', 'Partidos de la provincia de Buenos Aires'], ['prov', 'Provincias de la Argentina'], ['dep', 'Departamentos de toda la Argentina'], ...PROVINCES().filter((x) => x !== 'BUENOS AIRES').map((pv) => [`dep-${pv}`, `Departamentos de ${pv.charAt(0) + pv.slice(1).toLowerCase()}`]), ...(E.project.geo ? [['custom', `Propia: ${E.project.geo.name}`]] : [])], { left: true }), el('div', { class: 'btn-row' }, el('button', { type: 'button', class: 'btn small', onclick: () => loadCustomGeo(E, p) }, E.project.geo ? 'Cambiar la cartografía propia…' : 'Usar una cartografía propia (GeoJSON)…')));
    case 'mapMode': return optSelect(E, p, 'mapMode', 'Representación', [['classes', 'Coroplético por clases'], ['continuous', 'Coroplético continuo'], ['symbols', 'Círculos proporcionales']]);
    case 'classes': return (p.options || {}).mapMode && p.options.mapMode !== 'classes' ? null : two(optSelect(E, p, 'breakMethod', 'Cortes', [['jenks', 'Naturales (Jenks)'], ['quantile', 'Cuantiles'], ['equal', 'Iguales'], ['sd', 'Desvío estándar']]), optSelect(E, p, 'classes', 'Clases', [3, 4, 5, 6, 7].map((n) => [n, String(n)])));
    case 'rate': return e.size ? optSelect(E, p, 'rate', 'Tasa: valor / denominador ×', [['', 'sin tasa (sumar)'], [1, '1 (proporción)'], [100, '100 (%)'], [1000, '1.000 (‰)'], [10000, '10.000'], [100000, '100.000']]) : null;
    case 'mapLabels': return optSelect(E, p, 'mapLabels', 'Nombres en el mapa', [['', 'Ninguno'], [3, 'Los 3 de mayor valor'], [5, 'Los 5 de mayor valor'], [10, 'Los 10 de mayor valor']]);
    case 'step': return optCheck(E, p, 'step', 'En escalones (valores que cambian de golpe)');
    case 'rangeAxis': return el('details', { class: 'sec', open: true }, el('summary', {}, 'Eje'),
      optSelect(E, p, 'xLog', 'Escala', [['', 'Automática (logarítmica si va de cm a km)'], ['true', 'Logarítmica'], ['false', 'Lineal']]),
      optSelect(E, p, 'xUnits', 'Unidades de los valores', UNIT_SYSTEMS),
      two(optNum(E, p, 'xMin', 'Mínimo'), optNum(E, p, 'xMax', 'Máximo')), optText(E, p, 'xTitle', 'Título del eje', 'automático'));
    case 'zones': return zonesEditor(E, p);
    case 'noteMode': return (p.enc || {}).note ? optSelect(E, p, 'noteMode', 'Notas', [['', 'Automático (arriba o al costado)'], ['above', 'Siempre arriba de la barra'], ['right', 'Al final de la barra'], ['inside', 'Dentro de la barra']]) : null;
    case 'rangeColors': return el('details', { class: 'sec' }, el('summary', {}, 'Colores y leyenda de los tramos'), two(optColor(E, p, 'colorA', 'Tramo habitual'), optColor(E, p, 'colorB', 'Extensión')), two(optText(E, p, 'labelA', 'Leyenda del tramo habitual', 'nombre de la columna'), optText(E, p, 'labelB', 'Leyenda de la extensión', 'nombre de la columna')), optNum(E, p, 'barHeight', 'Alto de las barras (0,2 a 0,8 de la fila)', { placeholder: '0,42' }));
    case 'waterfall': return el('div', {}, optCheck(E, p, 'total', 'Barra final con el total', true), two(optText(E, p, 'totalLabel', 'Rótulo del total', 'Total'), optNum(E, p, 'startValue', 'Valor inicial', { placeholder: '0' })));
    case 'funnelShape': return optSelect(E, p, 'funnelShape', 'Forma', [['', 'Embudo (trapecios)'], ['bars', 'Barras centradas']]);
    case 'bullet': return optText(E, p, 'bands', 'Franjas de referencia (fracciones del máximo o valores)', '0,5; 0,75; 1');
    case 'progress': return el('div', {}, optSelect(E, p, 'progressMode', 'Mostrar', [['', 'Automático'], ['pct', 'Porcentaje'], ['value', 'Valor']]), optNum(E, p, 'progressMax', 'Valor que completa la barra', { placeholder: 'el total o 100 %' }), optSelect(E, p, 'progressColor', 'Color', [['', 'Uno por categoría'], ['single', 'Uno solo']]));
    case 'radial': return optNum(E, p, 'radialMax', 'Valor que completa tres cuartos de vuelta', { placeholder: 'el total o el máximo' });
    case 'gauge': return el('div', {}, two(optNum(E, p, 'gMin', 'Mínimo', { placeholder: '0' }), optNum(E, p, 'gMax', 'Máximo', { placeholder: 'el mayor dato' })), optNum(E, p, 'target', 'Meta'), optText(E, p, 'bands', 'Cortes de las franjas verde, amarilla y roja', 'p. ej. 50; 80'));
    case 'hexbin': return optNum(E, p, 'hexSize', 'Cantidad de hexágonos a lo ancho', { placeholder: '18' });
    case 'bumpOrder': return optCheck(E, p, 'rankAsc', 'El puesto 1 es el menor valor');
    default: return null;
  }
}
function optColor(E, p, key, label) {
  const o = p.options || (p.options = {});
  const i = el('input', { type: 'color', value: o[key] || '#2a78d6' });
  i.addEventListener('change', () => { o[key] = i.value; E.changed(key); });
  return el('div', { class: 'field' }, el('label', {}, label), i);
}
// Franjas de referencia: «valor = rótulo» por renglón (p. ej. 1 = E1 · 1000 = E2)
function zonesEditor(E, p) {
  const o = p.options || (p.options = {});
  const ta = el('textarea', { rows: 5, placeholder: '3 = E1\n5000 = E2\n15000 = E3\n…' });
  ta.value = (o.zones || []).map((z) => `${String(z.at).replace('.', ',')} = ${z.label}`).join('\n');
  ta.addEventListener('change', () => {
    o.zones = ta.value.split(/\n/).map((l) => { const m = l.match(/^\s*([-\d.,e]+)\s*[=:]\s*(.*)$/i); return m ? { at: parseFloat(m[1].replace(/\./g, (x, i, str) => (str.includes(',') ? '' : x)).replace(',', '.')), label: m[2].trim() } : null; }).filter((z) => z && Number.isFinite(z.at));
    E.changed('franjas');
  });
  const first = el('input', { type: 'text', value: o.zoneFirst || '', placeholder: 'p. ej. E0' });
  first.addEventListener('change', () => { o.zoneFirst = first.value; E.changed('franjas'); });
  const parse = (txt) => txt.split(/\n/).map((l) => { const m = l.match(/^\s*([-\d.,e]+)\s*[=:]\s*(.*)$/i); return m ? { at: parseFloat(m[1].replace(/\./g, (x, i, str) => (str.includes(',') ? '' : x)).replace(',', '.')), label: m[2].trim() } : null; }).filter((z) => z && Number.isFinite(z.at));
  const tt = el('textarea', { rows: 4, placeholder: '0,01 = 1 cm\n1 = 1 m\n1000 = 1 km' });
  tt.value = (o.topTicks || []).map((z) => `${String(z.at).replace('.', ',')} = ${z.label}`).join('\n');
  tt.addEventListener('change', () => { o.topTicks = parse(tt.value); E.changed('eje de arriba'); });
  const ttl = el('input', { type: 'text', value: o.xTopTitle || '', placeholder: 'opcional' });
  ttl.addEventListener('change', () => { o.xTopTitle = ttl.value; E.changed('eje de arriba'); });
  return el('details', { class: 'sec', open: !!((o.zones && o.zones.length) || (o.topTicks && o.topTicks.length)) }, el('summary', {}, 'Eje de arriba: franjas o marcas'), el('div', { class: 'field' }, el('label', {}, 'Rótulo antes del primer corte'), first), el('div', { class: 'field' }, el('label', {}, 'Franjas: «valor = rótulo de la franja que empieza ahí»'), ta),
    el('div', { class: 'field' }, el('label', {}, 'O marcas sueltas: «valor = rótulo» en ese punto'), tt), el('div', { class: 'field' }, el('label', {}, 'Título del eje de arriba'), ttl), el('p', { class: 'hint' }, 'Los valores van en la unidad del eje de abajo; con metros: 1 = 1 m; 1000 = 1 km.'));
}

function colorsBox(E, p, t) {
  const k = (p.enc && (p.enc.color || (['pie', 'waffle', 'treemap', 'kpi'].includes(p.type) ? p.enc.x : null))) || null;
  const c = getCol(t, k);
  if (!c || isNum(c)) return el('div');
  const lv = levelsOf(t, k);
  const { th } = scaledTheme(E.fig);
  const pal = getPalette((p.options && p.options.palette) || E.fig.palette || th.palette) || getPalette('okabe');
  const base = paletteColors(pal, lv.length);
  p.options = p.options || {};
  const cols = p.options.colors || {};
  const hidden = new Set(p.options.hideLevels || []);
  const list = el('div', { class: 'lv-colors' });
  lv.slice(0, 40).forEach((l, i) => {
    const ci = el('input', { type: 'color', value: cols[l] || base[i % base.length] });
    ci.addEventListener('change', () => { p.options.colors = { ...(p.options.colors || {}), [l]: ci.value }; E.changed('color'); });
    const hi = el('input', { type: 'checkbox', checked: !hidden.has(l), title: 'Mostrar' });
    hi.addEventListener('change', () => { const s = new Set(p.options.hideLevels || []); if (hi.checked) s.delete(l); else s.add(l); p.options.hideLevels = [...s]; E.changed('ocultar'); });
    list.appendChild(el('label', { class: 'lvc' }, hi, ci, el('span', {}, l)));
  });
  const ps = el('select', {}, el('option', { value: '' }, 'La de la figura'), ...PALETTES.map((x) => el('option', { value: x.id, selected: p.options.palette === x.id }, x.name)));
  ps.addEventListener('change', () => { if (ps.value) p.options.palette = ps.value; else delete p.options.palette; delete p.options.colors; E.changed('paleta', { left: true }); });
  return el('details', { class: 'sec' }, el('summary', {}, `Colores de «${c.name}»`), el('div', { class: 'field' }, el('label', {}, 'Paleta de este panel'), ps), list,
    el('div', { class: 'btn-row' }, el('button', { type: 'button', class: 'btn small', onclick: () => { delete p.options.colors; delete p.options.hideLevels; E.changed('colores', { left: true }); } }, 'Volver a la paleta')),
    el('p', { class: 'hint' }, 'El color sigue a la categoría: si un filtro deja algunas afuera, las demás conservan el suyo. Destildá para ocultar una categoría.'));
}

async function loadCustomGeo(E, p) {
  const { pickFile } = await import('./importer.js');
  const f = await pickFile('.geojson,.json');
  if (!f) return;
  try {
    const fc = JSON.parse(await f.text());
    if (!fc || fc.type !== 'FeatureCollection' || !fc.features.length) throw new Error('No es un GeoJSON con objetos (FeatureCollection).');
    const fields = Object.keys(fc.features[0].properties || {});
    const nameField = fields.find((k) => /nombre|name|nam|partido|depto|departamento|fna/i.test(k)) || fields[0];
    E.project.geo = { name: f.name.replace(/\.[^.]+$/, ''), source: f.name, nameField, fc, updated: Date.now() };
    await E.saveProject();
    p.options.geoLevel = 'custom';
    E.toast(`Cartografía «${E.project.geo.name}»: ${fc.features.length} unidades, nombres en el campo «${nameField}». Debe estar en coordenadas geográficas (WGS84 o POSGAR 2007 en grados).`);
    E.changed('cartografía', { left: true });
  } catch (e) { E.toast(`No se pudo leer: ${e.message}`, 'error'); }
}
export { typeName };
