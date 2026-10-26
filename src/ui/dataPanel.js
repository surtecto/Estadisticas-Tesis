// Pestaña Datos: tablas del proyecto, columnas con su tipo, unidad y orden de categorías, transformaciones
// (fórmulas, clases, recodificación, de ancho a largo y al revés, trasponer) y la vista de tabla en la mesa.
import * as XLSX from 'xlsx';
import { el, clear, downloadBlob, slug, fmtNum } from '../util.js';
import { addTable, deleteTable } from '../library.js';
import { compileFormula, TYPES, retypeColumn, columnSummary, levelsOf, addFormulaColumn, binColumn, recodeColumn, meltTable, pivotTable, transposeTable, colIndex, AGGS, getCol } from '../data/table.js';
import { breaks } from '../stats/engine.js';
import { importDialog } from './importer.js';
import { confirmDialog, promptDialog, formDialog } from './dialogs.js';

const curTable = (E) => E.tables[E.activeTable] || E.tables[E.tableOrder[0]] || null;

export function renderDataPanel(E, b) {
  b.append(el('div', { class: 'panel-intro' }, el('p', {}, 'Las tablas del proyecto. Cada panel de una figura usa una tabla; los análisis también.')));
  const list = el('div', { class: 'tbl-list' });
  for (const id of E.tableOrder) {
    const t = E.tables[id];
    if (!t) continue;
    list.appendChild(el('button', { type: 'button', class: `tbl-item ${id === E.activeTable ? 'on' : ''}`, onclick: () => { E.activeTable = id; E.renderLeft(); if (E.view === 'table') E.renderBoard(); } },
      el('strong', {}, t.name), el('span', {}, `${t.rows.length} filas · ${t.columns.length} columnas${t.source && t.source.file ? ` · ${t.source.file}` : ''}`)));
  }
  if (!E.tableOrder.length) list.appendChild(el('p', { class: 'note' }, 'Todavía no hay datos. Agregá una tabla de Excel, CSV u ODS, pegala desde una planilla o probá con una tabla de ejemplo.'));
  b.append(list, el('div', { class: 'btn-row' }, el('button', { type: 'button', class: 'btn primary', onclick: () => addTableFlow(E) }, '+ Agregar datos'), el('button', { type: 'button', class: 'btn', title: 'Lee una imagen (JPG, PNG, captura) o un JSON y rehace el gráfico con sus datos, ejes y rótulos', onclick: async () => { const { rebuildInEditor } = await import('./interpret.js'); rebuildInEditor(E); } }, 'Rehacer un gráfico…')),
    el('p', { class: 'note' }, '«Rehacer un gráfico» lee una imagen o un JSON y reconstruye el tipo, los ejes de abajo y de arriba, los rótulos, las notas y los valores.'));
  const t = curTable(E);
  if (!t) return;
  E.activeTable = t.id;
  // acciones de la tabla
  b.appendChild(el('h3', { class: 'panel-h' }, t.name));
  b.appendChild(el('div', { class: 'btn-row wrap' },
    el('button', { type: 'button', class: 'btn small', onclick: () => E.setView('table') }, 'Ver la tabla'),
    el('button', { type: 'button', class: 'btn small', onclick: async () => { const n = await promptDialog({ title: 'Renombrar la tabla', value: t.name }); if (n) { t.name = n; E.tableChanged(t); } } }, 'Renombrar'),
    el('button', { type: 'button', class: 'btn small', onclick: () => downloadTable(t, 'xlsx') }, 'Descargar .xlsx'),
    el('button', { type: 'button', class: 'btn small', onclick: () => downloadTable(t, 'csv') }, 'CSV'),
    el('button', { type: 'button', class: 'btn small danger', onclick: () => removeTable(E, t) }, 'Quitar')));
  const src = t.source || {};
  const cite = el('textarea', { rows: 2, placeholder: 'Fuente de los datos (para el epígrafe y la ficha metodológica)…' });
  cite.value = src.citation || '';
  cite.addEventListener('change', () => { t.source = { ...src, citation: cite.value.trim() }; E.tableChanged(t, { left: false }); });
  b.appendChild(el('div', { class: 'field' }, el('label', {}, 'Fuente'), cite));
  // columnas
  b.appendChild(el('h3', { class: 'panel-h' }, 'Columnas'));
  for (const c of t.columns) b.appendChild(columnRow(E, t, c));
  // transformaciones
  b.appendChild(el('h3', { class: 'panel-h' }, 'Transformar'));
  b.appendChild(el('div', { class: 'tool-grid' },
    tool('Nueva columna con una fórmula', 'Tasas, porcentajes, diferencias, logaritmos: [Población] / [Superficie (km²)]', () => formulaFlow(E, t)),
    tool('Agrupar un número en clases', 'Edad en grupos quinquenales, ingresos en quintiles, cortes naturales', () => binFlow(E, t)),
    tool('Recodificar categorías', 'Unir categorías, corregir nombres, traducir códigos', () => recodeFlow(E, t)),
    tool('De ancho a largo', 'Columnas de años (1991, 2001, 2010, 2022) → una columna Año y otra Valor', () => meltFlow(E, t)),
    tool('De largo a ancho', 'Una fila por partido con una columna por año', () => pivotFlow(E, t)),
    tool('Trasponer', 'Filas por columnas (tablas que vienen giradas)', async () => { const nt = transposeTable(t); await saveNew(E, nt); })));
}
const tool = (title, desc, fn) => el('button', { type: 'button', class: 'tool', onclick: fn }, el('strong', {}, title), el('span', {}, desc));

function columnRow(E, t, c) {
  const s = columnSummary(t, c.key);
  const typeSel = el('select', { 'aria-label': `Tipo de ${c.name}` }, ...TYPES.map(([k, l]) => el('option', { value: k, selected: c.type === k }, l)));
  typeSel.addEventListener('change', () => { retypeColumn(t, c.key, typeSel.value); E.tableChanged(t); });
  const sum = c.type === 'num' ? `${s.n} datos${s.missing ? ` · ${s.missing} sin dato` : ''} · ${fmtNum(s.min)} a ${fmtNum(s.max)}` : `${s.unique} categorías${s.missing ? ` · ${s.missing} sin dato` : ''}`;
  const det = el('details', { class: 'col-row' });
  det.appendChild(el('summary', {}, el('span', { class: `tdot t-${c.type}` }), el('span', { class: 'col-name' }, c.name), el('span', { class: 'col-sum' }, sum)));
  const body = el('div', { class: 'col-body' });
  const nm = el('input', { type: 'text', value: c.name });
  nm.addEventListener('change', () => { const v = nm.value.trim(); if (v && !t.columns.some((x) => x !== c && x.name === v)) { c.name = v; E.tableChanged(t); } else nm.value = c.name; });
  const un = el('input', { type: 'text', value: c.unit || '', placeholder: 'mm, %, km², hab.' });
  un.addEventListener('change', () => { c.unit = un.value.trim(); E.tableChanged(t); });
  body.append(el('div', { class: 'field-row' }, el('div', { class: 'field' }, el('label', {}, 'Nombre'), nm), el('div', { class: 'field' }, el('label', {}, 'Unidad'), un)), el('div', { class: 'field' }, el('label', {}, 'Tipo'), typeSel));
  if (c.type === 'cat' || c.type === 'ord') {
    const lv = levelsOf(t, c.key);
    if (lv.length <= 40) {
      const ol = el('ol', { class: 'levels' });
      lv.forEach((l, i) => {
        const n = t.rows.filter((r) => String(r[colIndex(t, c.key)]) === l).length;
        ol.appendChild(el('li', {}, el('span', { class: 'lv-name' }, l), el('span', { class: 'lv-n' }, String(n)),
          el('button', { type: 'button', class: 'icon ghost', title: 'Subir', disabled: i === 0, onclick: () => { const a = lv.slice(); [a[i - 1], a[i]] = [a[i], a[i - 1]]; c.levels = a; E.tableChanged(t); } }, '↑'),
          el('button', { type: 'button', class: 'icon ghost', title: 'Bajar', disabled: i === lv.length - 1, onclick: () => { const a = lv.slice(); [a[i + 1], a[i]] = [a[i], a[i + 1]]; c.levels = a; E.tableChanged(t); } }, '↓')));
      });
      body.append(el('div', { class: 'field' }, el('label', {}, 'Orden de las categorías (es el orden de los gráficos y de los colores)'), ol),
        el('div', { class: 'btn-row' }, el('button', { type: 'button', class: 'btn small', onclick: () => { c.levels = lv.slice().sort((a, b) => a.localeCompare(b, 'es', { numeric: true })); E.tableChanged(t); } }, 'A → Z'),
          el('button', { type: 'button', class: 'btn small', onclick: () => { const j = colIndex(t, c.key); const cnt = (l) => t.rows.filter((r) => String(r[j]) === l).length; c.levels = lv.slice().sort((a, b) => cnt(b) - cnt(a)); E.tableChanged(t); } }, 'Por frecuencia'),
          el('button', { type: 'button', class: 'btn small', onclick: () => { c.levels = lv.slice().reverse(); E.tableChanged(t); } }, 'Invertir')));
    } else body.appendChild(el('p', { class: 'note' }, `${lv.length} categorías: demasiadas para ordenar a mano.`));
  }
  if (c.formula) body.appendChild(el('p', { class: 'note' }, `Fórmula: ${c.formula}`));
  const miss = el('input', { type: 'text', value: (c.missing || []).join('; '), placeholder: 'p. ej. 99; 999; -1' });
  miss.addEventListener('change', () => { c.missing = miss.value.split(/[;|]/).map((x) => x.trim()).filter(Boolean); const j = colIndex(t, c.key); t.rows.forEach((r) => { if (r[j] != null && c.missing.includes(String(r[j]))) r[j] = null; }); E.tableChanged(t); });
  body.append(el('div', { class: 'field' }, el('label', {}, 'Códigos que significan «sin dato»'), miss),
    el('div', { class: 'btn-row' }, el('button', { type: 'button', class: 'btn small danger', onclick: async () => {
      if (!(await confirmDialog({ title: `¿Quitar la columna «${c.name}»?`, ok: 'Quitar', danger: true }))) return;
      const j = colIndex(t, c.key); t.columns.splice(j, 1); t.rows.forEach((r) => r.splice(j, 1)); E.tableChanged(t);
    } }, 'Quitar la columna')));
  det.appendChild(body);
  return det;
}

async function addTableFlow(E) {
  const t = await importDialog();
  if (!t) return;
  if (t.chartSpec) { const { rebuildInEditor } = await import('./interpret.js'); return rebuildInEditor(E, null, { spec: t.chartSpec, notes: t.notes || [] }); }
  await saveNew(E, t);
  if (!E.fig.panels.length) { E.leftTab = 'graf'; }
  E.renderLeft();
}
async function saveNew(E, t) {
  const nt = await addTable(E.projectId, t);
  E.tables[nt.id] = nt;
  E.tableOrder.push(nt.id);
  E.activeTable = nt.id;
  E.toast(`Tabla «${nt.name}» agregada (${nt.rows.length} filas).`);
  E.renderLeft();
  return nt;
}
async function removeTable(E, t) {
  const used = E.fig.panels.some((p) => p.tableId === t.id);
  if (!(await confirmDialog({ title: `¿Quitar la tabla «${t.name}»?`, text: used ? 'Hay paneles de esta figura que la usan: quedarán vacíos.' : '', ok: 'Quitar', danger: true }))) return;
  await deleteTable(t.id);
  delete E.tables[t.id];
  E.tableOrder = E.tableOrder.filter((x) => x !== t.id);
  E.activeTable = E.tableOrder[0] || null;
  E.renderLeft(); E.renderBoard();
}
function downloadTable(t, kind) {
  const aoa = [t.columns.map((c) => c.name), ...t.rows];
  if (kind === 'csv') {
    const esc = (v) => (v == null ? '' : /[";\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
    downloadBlob(new Blob(['﻿' + aoa.map((r) => r.map(esc).join(';')).join('\r\n')], { type: 'text/csv' }), `${slug(t.name)}.csv`);
    return;
  }
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, t.name.slice(0, 30).replace(/[\\/?*[\]:]/g, ' '));
  const out = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
  downloadBlob(new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `${slug(t.name)}.xlsx`);
}

// ---------- transformaciones ----------
const colSel = (t, filter, sel = null) => { const s = el('select', {}, ...t.columns.filter(filter).map((c) => el('option', { value: c.key, selected: c.key === sel }, c.name))); return s; };
const wf = (label, ctl, hint) => el('label', { class: 'wf' }, el('span', { class: 'wf-l' }, label), ctl, hint ? el('span', { class: 'wf-h' }, hint) : null);

const normFormula = (x) => String(x).replace(/(\d),(\d)/g, '$1.$2').replace(/\^/g, '**').replace(/;/g, ',');
async function formulaFlow(E, t) {
  const nm = el('input', { type: 'text', placeholder: 'Densidad (hab./km²)' });
  const ex = el('input', { type: 'text', placeholder: '[Población] / [Superficie (km²)]' });
  const chips = el('div', { class: 'chips' }, ...t.columns.map((c) => el('button', { type: 'button', class: 'chip', onclick: () => { ex.value += `[${c.name}]`; ex.focus(); } }, c.name)));
  const prev = el('p', { class: 'note' });
  ex.addEventListener('input', () => { try { const f = compileFormula(t, normFormula(ex.value)); const vals = t.rows.slice(0, 5).map(f); prev.textContent = `Primeros valores: ${vals.map((v) => (v == null ? '—' : typeof v === 'number' ? fmtNum(v, 3) : v)).join(' · ')}`; } catch (e) { prev.textContent = e.message; } });
  const body = el('div', {}, wf('Nombre de la nueva columna', nm), wf('Fórmula', ex, 'Columnas entre corchetes. Operaciones: + − * / y ^ (potencia). Funciones: log, ln, log10, exp, raiz, abs, redondear(x; d), si(condición, a, b), anio(fecha). Ej.: si([Edad] >= 65, "65 y más", "menos de 65")'), chips, prev);
  if (!(await formDialog({ title: 'Nueva columna con una fórmula', body, wide: true, validate: () => (nm.value.trim() && ex.value.trim() ? true : 'Completá el nombre y la fórmula.') }))) return;
  try { addFormulaColumn(t, nm.value.trim(), normFormula(ex.value)); E.tableChanged(t); } catch (e) { E.toast(e.message, 'error'); }
}
async function binFlow(E, t) {
  const nums = t.columns.filter((c) => c.type === 'num');
  if (!nums.length) { E.toast('La tabla no tiene columnas numéricas.', 'warn'); return; }
  const cs = colSel(t, (c) => c.type === 'num');
  const method = el('select', {}, ...[['equal', 'Intervalos iguales'], ['quantile', 'Cuantiles (misma cantidad de casos)'], ['jenks', 'Cortes naturales (Jenks)'], ['manual', 'Cortes propios']].map(([v, l]) => el('option', { value: v }, l)));
  const k = el('input', { type: 'number', value: 5, min: 2, max: 20, class: 'num' });
  const man = el('input', { type: 'text', placeholder: '0; 15; 30; 45; 65; 120' });
  const nm = el('input', { type: 'text', placeholder: 'Edad (grupos)' });
  const body = el('div', { class: 'wf-grid' }, wf('Variable', cs), wf('Método', method), wf('Cantidad de clases', k), wf('Cortes propios (incluye mínimo y máximo)', man), el('div', { class: 'span2' }, wf('Nombre de la nueva columna', nm)));
  if (!(await formDialog({ title: 'Agrupar un número en clases', body, wide: true }))) return;
  const j = colIndex(t, cs.value);
  const vals = t.rows.map((r) => r[j]).filter((v) => v != null && Number.isFinite(v));
  let b = method.value === 'manual' ? man.value.split(/[;\s]+/).map((x) => parseFloat(x.replace(',', '.'))).filter(Number.isFinite) : breaks(vals, Math.max(2, +k.value || 5), method.value);
  b = [...new Set(b)].sort((x, y) => x - y);
  if (b.length < 2) { E.toast('Hacen falta al menos dos cortes.', 'warn'); return; }
  binColumn(t, cs.value, { breaks: b, name: nm.value.trim() || undefined });
  E.tableChanged(t);
}
async function recodeFlow(E, t) {
  const cats = t.columns.filter((c) => c.type === 'cat' || c.type === 'ord' || c.type === 'text');
  if (!cats.length) { E.toast('No hay columnas categóricas.', 'warn'); return; }
  const cs = colSel(t, (c) => cats.includes(c));
  const grid = el('div', { class: 'recode' });
  const map = {};
  const fill = () => {
    clear(grid);
    for (const l of levelsOf(t, cs.value).slice(0, 80)) {
      const i = el('input', { type: 'text', value: l });
      map[l] = l;
      i.addEventListener('input', () => { map[l] = i.value; });
      grid.append(el('span', {}, l), i);
    }
  };
  cs.addEventListener('change', fill); fill();
  const asNew = el('input', { type: 'checkbox', checked: true });
  const body = el('div', {}, wf('Variable', cs), el('p', { class: 'note' }, 'Escribí el nuevo valor de cada categoría; el mismo nombre en varias las une. Vacío = sin dato.'), grid, el('label', { class: 'check' }, asNew, el('span', {}, 'Crear una columna nueva (conservar la original)')));
  if (!(await formDialog({ title: 'Recodificar categorías', body, wide: true }))) return;
  recodeColumn(t, cs.value, map, { asNew: asNew.checked });
  E.tableChanged(t);
}
async function meltFlow(E, t) {
  const ids = el('div', { class: 'chips' }), vals = el('div', { class: 'chips' });
  const ch = (c, on) => { const i = el('input', { type: 'checkbox', value: c.key, checked: on }); return el('label', { class: 'chip' }, i, c.name); };
  const yearCols = t.columns.filter((c) => /^(1[89]|20)\d\d$/.test(c.name.trim()));
  t.columns.forEach((c) => { const isVal = yearCols.length ? yearCols.includes(c) : c.type === 'num'; ids.appendChild(ch(c, !isVal && c.type !== 'num')); vals.appendChild(ch(c, isVal)); });
  const vn = el('input', { type: 'text', value: /^\d{4}$/.test((t.columns.find((c) => c.type === 'num') || {}).name || '') ? 'Año' : 'Variable' });
  const vv = el('input', { type: 'text', value: 'Valor' });
  const body = el('div', {}, wf('Columnas que identifican cada fila (quedan igual)', ids), wf('Columnas que pasan a ser filas', vals), el('div', { class: 'wf-grid' }, wf('Nombre de la columna con los nombres', vn), wf('Nombre de la columna con los valores', vv)));
  if (!(await formDialog({ title: 'De ancho a largo', body, wide: true }))) return;
  const get = (box) => [...box.querySelectorAll('input:checked')].map((i) => i.value);
  const vk = get(vals).filter((k) => !get(ids).includes(k));
  if (!vk.length) { E.toast('Elegí al menos una columna para pasar a filas.', 'warn'); return; }
  await saveNew(E, meltTable(t, get(ids), vk, { varName: vn.value || 'Variable', valueName: vv.value || 'Valor' }));
}
async function pivotFlow(E, t) {
  const r = colSel(t, () => true), c = colSel(t, (x) => x.type !== 'num' || true), v = colSel(t, (x) => x.type === 'num');
  const a = el('select', {}, ...AGGS.filter(([k]) => k !== 'pct').map(([k, l]) => el('option', { value: k, selected: k === 'sum' }, l)));
  const body = el('div', { class: 'wf-grid' }, wf('Una fila por', r), wf('Una columna por', c), wf('Valor', v), wf('Si hay repetidos', a));
  if (!(await formDialog({ title: 'De largo a ancho', body, wide: true }))) return;
  await saveNew(E, pivotTable(t, r.value, c.value, v.value, a.value));
}

// ---------- vista de la tabla en la mesa ----------
export function renderTableView(E, b) {
  clear(b);
  const t = curTable(E);
  if (!t) { b.appendChild(el('div', { class: 'empty-board' }, el('p', {}, 'No hay tablas en el proyecto.'), el('button', { type: 'button', class: 'btn primary', onclick: () => addTableFlow(E) }, '+ Agregar datos'))); return; }
  const lim = 1000;
  const head = el('tr', {}, el('th', { class: 'rn' }, '#'), ...t.columns.map((c) => el('th', {}, el('span', { class: `tdot t-${c.type}` }), c.name, c.unit ? el('small', {}, ` (${c.unit})`) : null)));
  const body = el('tbody');
  t.rows.slice(0, lim).forEach((r, i) => {
    body.appendChild(el('tr', {}, el('td', { class: 'rn' }, String(i + 1)), ...r.map((v, j) => el('td', { class: t.columns[j].type === 'num' ? 'n' : '', 'data-r': i, 'data-c': j }, v == null ? '' : t.columns[j].type === 'num' ? fmtNum(v, 6) : String(v)))));
  });
  body.addEventListener('dblclick', (e) => {
    const td = e.target.closest('td[data-c]');
    if (!td) return;
    const i = +td.dataset.r, j = +td.dataset.c;
    const inp = el('input', { type: 'text', value: t.rows[i][j] == null ? '' : String(t.rows[i][j]) });
    td.textContent = ''; td.appendChild(inp); inp.focus(); inp.select();
    const done = () => {
      const col = t.columns[j];
      const v = inp.value.trim();
      t.rows[i][j] = v === '' ? null : col.type === 'num' ? (Number.isFinite(parseFloat(v.replace(',', '.'))) ? parseFloat(v.replace(/\./g, (m, o, s) => (s.includes(',') ? '' : m)).replace(',', '.')) : t.rows[i][j]) : v;
      E.tableChanged(t, { left: false });
    };
    inp.addEventListener('blur', done, { once: true });
    inp.addEventListener('keydown', (k) => { if (k.key === 'Enter') inp.blur(); if (k.key === 'Escape') { inp.value = t.rows[i][j] == null ? '' : String(t.rows[i][j]); inp.blur(); } });
  });
  b.append(el('div', { class: 'tv-head' }, el('strong', {}, t.name), el('span', { class: 'note' }, `${t.rows.length} filas${t.rows.length > lim ? ` (se muestran ${lim})` : ''} · doble clic en una celda para corregirla`)),
    el('div', { class: 'tv-wrap' }, el('table', { class: 'tv' }, el('thead', {}, head), body)));
}
