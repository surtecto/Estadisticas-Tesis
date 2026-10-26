// Tablas de datos: tipificación de columnas (número, categoría, ordinal, fecha, texto, identificador),
// lectura de números en formato argentino o inglés, transformaciones y filtros.
import { isMissingToken } from './parse.js';
import { uid } from '../util.js';

export const TYPES = [
  ['num', 'Numérica (cuantitativa)'],
  ['cat', 'Categórica (nominal)'],
  ['ord', 'Ordinal (categorías con orden)'],
  ['date', 'Fecha o período'],
  ['text', 'Texto libre'],
  ['id', 'Identificador o código'],
];
export const typeName = (t) => (TYPES.find((x) => x[0] === t) || [t, t])[1];
export const isNum = (c) => c && c.type === 'num';
export const isCat = (c) => c && (c.type === 'cat' || c.type === 'ord');

// ---------- números ----------
// Detecta, para una columna, si usa coma decimal (1.234,56) o punto decimal (1,234.56)
function decimalStyle(samples) {
  let comma = 0, dot = 0;
  for (const s of samples) {
    const t = s.replace(/[\s$%€]/g, '');
    if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(t) || /^-?\d+,\d+$/.test(t)) comma++;
    else if (/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(t) || /^-?\d+\.\d+$/.test(t)) dot++;
  }
  return comma > dot ? 'comma' : 'dot';
}
export function parseNumber(v, style = 'dot') {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (v == null) return null;
  let t = String(v).trim();
  if (!t || isMissingToken(t)) return null;
  let neg = false;
  if (/^\(.*\)$/.test(t)) { neg = true; t = t.slice(1, -1); } // contables: (1.234) = −1234
  t = t.replace(/[\s $€£%]|ARS|USD|U\$S/gi, '');
  if (style === 'comma') t = t.replace(/\./g, '').replace(',', '.');
  else t = t.replace(/,/g, '');
  if (!/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(t)) return null;
  const n = parseFloat(t);
  return Number.isFinite(n) ? (neg ? -n : n) : null;
}
const DATE_RE = [
  [/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ](\d{1,2}):(\d{2}))?/, (m) => [+m[1], +m[2], +m[3]]],
  [/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/, (m) => [+m[3], +m[2], +m[1]]], // dd/mm/aaaa (uso argentino)
  [/^(\d{4})-(\d{1,2})$/, (m) => [+m[1], +m[2], 1]],
  [/^(\d{1,2})[/-](\d{4})$/, (m) => [+m[2], +m[1], 1]],
];
export function parseDate(v) {
  if (v == null) return null;
  if (typeof v === 'number') {
    if (v > 20000 && v < 80000) { const d = new Date(Date.UTC(1899, 11, 30) + v * 86400000); return d.toISOString().slice(0, 10); } // serial de Excel
    return null;
  }
  const t = String(v).trim();
  for (const [re, f] of DATE_RE) {
    const m = t.match(re);
    if (m) {
      const [y, mo, d] = f(m);
      if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31 && y > 1000 && y < 3000) return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }
  }
  return null;
}
export const dateToTime = (s) => (s ? Date.parse(s.length <= 10 ? s + 'T00:00:00Z' : s + 'Z') : NaN);

const ORDINAL_HINTS = [
  ['muy bajo', 'bajo', 'medio', 'alto', 'muy alto'],
  ['nunca', 'casi nunca', 'a veces', 'casi siempre', 'siempre'],
  ['muy en desacuerdo', 'en desacuerdo', 'ni de acuerdo ni en desacuerdo', 'de acuerdo', 'muy de acuerdo'],
  ['totalmente en desacuerdo', 'en desacuerdo', 'neutral', 'de acuerdo', 'totalmente de acuerdo'],
  ['primario', 'secundario', 'terciario', 'universitario', 'posgrado'],
  ['malo', 'regular', 'bueno', 'muy bueno', 'excelente'],
  ['baja', 'media', 'alta'],
  ['pequeño', 'mediano', 'grande'],
  ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'],
  ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'],
];
function ordinalOrder(levels) {
  const low = levels.map((l) => String(l).toLowerCase().trim());
  for (const h of ORDINAL_HINTS) {
    if (low.every((l) => h.includes(l)) && low.length >= 2) return levels.slice().sort((a, b) => h.indexOf(String(a).toLowerCase().trim()) - h.indexOf(String(b).toLowerCase().trim()));
  }
  // rangos de edad o de clase: «0-4», «5 a 9», «65 y más», «Menos de 10»
  const lead = low.map((l) => { if (/^(menos|hasta)/.test(l)) return -1; const m = l.match(/-?\d+[.,]?\d*/); return m ? parseFloat(m[0].replace(',', '.')) : NaN; });
  if (lead.every(Number.isFinite) && new Set(lead).size === lead.length && levels.length >= 3 && low.some((l) => /\d\s*(-|a|–|y m|o m)/.test(l))) {
    return levels.map((l, i) => [l, lead[i]]).sort((a, b) => a[1] - b[1]).map((x) => x[0]);
  }
  return null;
}

// ---------- tipificación ----------
export function inferColumn(name, values) {
  const present = values.filter((v) => !isMissingToken(v));
  const n = present.length;
  const col = { key: uid('c'), name: String(name || '').trim() || 'columna', type: 'text', unit: '', label: '', levels: null, decimal: 'dot' };
  if (!n) { col.type = 'cat'; col.levels = []; return col; }
  const strs = present.filter((v) => typeof v === 'string').map((v) => v.trim());
  col.decimal = decimalStyle(strs.slice(0, 400));
  const nums = present.map((v) => parseNumber(v, col.decimal));
  const numShare = nums.filter((x) => x != null).length / n;
  const dates = present.map((v) => (typeof v === 'string' ? parseDate(v) : null));
  const dateShare = dates.filter(Boolean).length / n;
  const uniq = new Set(present.map((v) => String(v).trim()));
  const nm = col.name.toLowerCase();
  if (/%|porcentaje|tasa|proporci/.test(nm) || strs.some((s) => /%$/.test(s))) col.unit = '%';
  if (dateShare > 0.85) { col.type = 'date'; return col; }
  if (numShare > 0.9) {
    const isInt = nums.every((x) => x == null || Number.isInteger(x));
    if (/(^|\b)(id|cod|código|codigo|dni|cuit|cp|nro\.? de orden)(\b|$)/.test(nm) && uniq.size === n) { col.type = 'id'; return col; }
    if (isInt && uniq.size <= 7 && n >= 20 && /(escala|likert|nivel|grupo|categor|tipo|clase|sexo|item|ítem|p\d+)/.test(nm)) {
      col.type = 'ord'; col.levels = [...uniq].sort((a, b) => parseFloat(a) - parseFloat(b)); return col;
    }
    col.type = 'num';
    return col;
  }
  if (uniq.size === n && n > 20 && strs.every((s) => s.length > 2) && /(id|cod|código|nombre|name)/.test(nm)) { col.type = 'id'; return col; }
  const avgLen = strs.reduce((a, s) => a + s.length, 0) / Math.max(1, strs.length);
  if (uniq.size > Math.max(40, n * 0.6) && avgLen > 25) { col.type = 'text'; return col; }
  const levels = [...uniq];
  const ord = ordinalOrder(levels);
  if (ord) { col.type = 'ord'; col.levels = ord; return col; }
  col.type = 'cat';
  col.levels = levels.sort((a, b) => a.localeCompare(b, 'es', { numeric: true }));
  return col;
}

function coerce(v, col) {
  if (isMissingToken(v)) return null;
  if (col.missing && col.missing.includes(String(v).trim())) return null;
  switch (col.type) {
    case 'num': return parseNumber(v, col.decimal);
    case 'date': return typeof v === 'string' ? parseDate(v) || v : parseDate(v);
    default: return typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(+v.toFixed(10)) : String(v);
  }
}

// Construye una tabla tipificada a partir de una matriz cruda
export function buildTable(raw, { name = 'Tabla', headerRow = 0, headerRows = 1, footer = 0, source = {} } = {}) {
  const body = raw.slice(headerRow + headerRows, raw.length - footer).filter((r) => r && r.some((v) => v != null && String(v).trim() !== ''));
  const width = Math.max(...raw.slice(headerRow, headerRow + headerRows).map((r) => (r || []).length), ...body.slice(0, 200).map((r) => r.length), 0);
  const names = [];
  for (let c = 0; c < width; c++) {
    const parts = [];
    for (let h = 0; h < headerRows; h++) {
      const v = (raw[headerRow + h] || [])[c];
      if (v != null && String(v).trim() !== '' && !parts.includes(String(v).trim())) parts.push(String(v).trim());
    }
    let nm = parts.join(' · ') || `Columna ${c + 1}`;
    let k = 2; const base = nm;
    while (names.includes(nm)) nm = `${base} (${k++})`;
    names.push(nm);
  }
  // descarta columnas totalmente vacías
  const keep = names.map((_, c) => body.some((r) => r[c] != null && String(r[c]).trim() !== ''));
  const columns = [];
  const idx = [];
  names.forEach((nm, c) => { if (keep[c]) { columns.push(inferColumn(nm, body.map((r) => r[c]))); idx.push(c); } });
  const rows = body.map((r) => idx.map((c, j) => coerce(r[c], columns[j])));
  return { id: uid('T'), name, source: { imported: new Date().toISOString(), ...source }, columns, rows, notes: '' };
}

// Cambia el tipo de una columna y vuelve a convertir sus valores (se conserva el texto original cuando no es número)
export function retypeColumn(table, key, type) {
  const j = table.columns.findIndex((c) => c.key === key);
  if (j < 0) return;
  const col = table.columns[j];
  const vals = table.rows.map((r) => r[j]);
  col.type = type;
  if (type === 'num') { col.decimal = 'dot'; table.rows.forEach((r) => { r[j] = typeof r[j] === 'number' ? r[j] : parseNumber(r[j], decimalStyle(vals.filter((v) => typeof v === 'string'))); }); }
  else if (type === 'date') table.rows.forEach((r) => { r[j] = parseDate(r[j]) || (r[j] == null ? null : String(r[j])); });
  else table.rows.forEach((r) => { r[j] = r[j] == null ? null : typeof r[j] === 'number' ? String(+r[j].toFixed(10)) : String(r[j]); });
  if (type === 'cat' || type === 'ord') col.levels = levelsOf(table, key, true);
  else col.levels = null;
}

export function colIndex(table, key) { return table.columns.findIndex((c) => c.key === key); }
export function getCol(table, key) { return table.columns.find((c) => c.key === key) || null; }
export function colByName(table, name) { return table.columns.find((c) => c.name === name) || null; }

export function levelsOf(table, key, recompute = false) {
  const j = colIndex(table, key);
  if (j < 0) return [];
  const col = table.columns[j];
  const present = [...new Set(table.rows.map((r) => r[j]).filter((v) => v != null).map(String))];
  if (!recompute && col.levels && col.levels.length) {
    const extra = present.filter((v) => !col.levels.includes(v));
    return col.levels.filter((l) => present.includes(l)).concat(extra);
  }
  if (col.type === 'num') return present.map(Number).sort((a, b) => a - b).map(String);
  const ord = col.type === 'ord' ? ordinalOrder(present) : null;
  return ord || present.sort((a, b) => a.localeCompare(b, 'es', { numeric: true }));
}

// ---------- filtros ----------
export const FILTER_OPS = [
  ['eq', 'es igual a'], ['ne', 'es distinto de'], ['in', 'es uno de'], ['nin', 'no es ninguno de'],
  ['gt', 'mayor que'], ['ge', 'mayor o igual que'], ['lt', 'menor que'], ['le', 'menor o igual que'],
  ['between', 'entre'], ['contains', 'contiene'], ['notnull', 'tiene dato'], ['null', 'sin dato'],
];
export function rowFilter(table, filters = []) {
  const fs = (filters || []).filter((f) => f && f.col && f.op).map((f) => ({ ...f, j: colIndex(table, f.col), col: getCol(table, f.col) })).filter((f) => f.j >= 0);
  if (!fs.length) return () => true;
  return (r) => fs.every((f) => {
    const v = r[f.j];
    const isN = f.col.type === 'num';
    const num = (x) => (isN ? parseFloat(String(x).replace(',', '.')) : x);
    switch (f.op) {
      case 'eq': return v != null && String(v) === String(f.val);
      case 'ne': return v == null || String(v) !== String(f.val);
      case 'in': return v != null && (f.vals || []).map(String).includes(String(v));
      case 'nin': return v == null || !(f.vals || []).map(String).includes(String(v));
      case 'gt': return v != null && (isN ? v > num(f.val) : String(v) > String(f.val));
      case 'ge': return v != null && (isN ? v >= num(f.val) : String(v) >= String(f.val));
      case 'lt': return v != null && (isN ? v < num(f.val) : String(v) < String(f.val));
      case 'le': return v != null && (isN ? v <= num(f.val) : String(v) <= String(f.val));
      case 'between': return v != null && v >= num(f.val) && v <= num(f.val2);
      case 'contains': return v != null && String(v).toLowerCase().includes(String(f.val || '').toLowerCase());
      case 'notnull': return v != null;
      case 'null': return v == null;
      default: return true;
    }
  });
}
export function filteredRows(table, filters) { const f = rowFilter(table, filters); return table.rows.filter(f); }

// ---------- transformaciones ----------
// Fórmula por fila: [Nombre de columna] o nombres simples; funciones matemáticas habituales
const FN = {
  log: Math.log, ln: Math.log, log10: Math.log10, log2: Math.log2, exp: Math.exp, sqrt: Math.sqrt, raiz: Math.sqrt, abs: Math.abs,
  round: (x, d = 0) => { const p = 10 ** d; return Math.round(x * p) / p; }, redondear: (x, d = 0) => { const p = 10 ** d; return Math.round(x * p) / p; },
  floor: Math.floor, ceil: Math.ceil, min: Math.min, max: Math.max, pow: Math.pow, si: (c, a, b) => (c ? a : b), if: (c, a, b) => (c ? a : b),
  year: (d) => (d ? +String(d).slice(0, 4) : null), anio: (d) => (d ? +String(d).slice(0, 4) : null), mes: (d) => (d ? +String(d).slice(5, 7) : null),
  texto: (x) => (x == null ? '' : String(x)), num: (x) => parseNumber(x), isnull: (x) => x == null, vacio: (x) => x == null,
};
export function compileFormula(table, expr) {
  const cols = table.columns;
  const names = [];
  let src = String(expr).replace(/\[([^\]]+)\]/g, (_, nm) => {
    const j = cols.findIndex((c) => c.name === nm.trim());
    if (j < 0) throw new Error(`No hay una columna llamada «${nm}».`);
    names.push(j);
    return `__r[${j}]`;
  });
  // nombres simples sin espacios (fuera de los textos entre comillas)
  const parts = src.split(/("[^"]*"|'[^']*')/);
  src = parts.map((seg, i) => (i % 2 ? seg : seg.replace(/\b([A-Za-zÁÉÍÓÚáéíóúÑñ_][\wÁÉÍÓÚáéíóúÑñ]*)\b(?!\s*\()/g, (m) => {
    if (m === '__r' || m === 'true' || m === 'false' || m === 'null') return m;
    const j = cols.findIndex((c) => c.name === m);
    if (j >= 0) return `__r[${j}]`;
    if (m in FN) return m;
    if (m === 'y' || m === 'o' || m === 'and' || m === 'or') return m;
    throw new Error(`«${m}» no es una columna ni una función conocida. Usá [Nombre de la columna] si tiene espacios.`);
  }).replace(/\by\b|\band\b/gi, '&&').replace(/\bo\b|\bor\b/gi, '||').replace(/(?<![=!<>])=(?!=)/g, '=='))).join('');
  if (/[;{}]|=>|\bfunction\b|\bwindow\b|\bdocument\b|\bimport\b/.test(src)) throw new Error('La fórmula tiene símbolos no permitidos.');
  // eslint-disable-next-line no-new-func
  const f = new Function('__r', 'F', `with (F) { return (${src}); }`);
  return (r) => { try { const v = f(r, FN); return typeof v === 'number' && !Number.isFinite(v) ? null : v; } catch (e) { return null; } };
}
export function addFormulaColumn(table, name, expr) {
  const f = compileFormula(table, expr);
  const vals = table.rows.map((r) => f(r));
  const col = inferColumn(name, vals);
  col.formula = expr;
  table.columns.push(col);
  table.rows.forEach((r, i) => { r.push(vals[i] == null ? null : col.type === 'num' ? Number(vals[i]) : String(vals[i])); });
  return col;
}
// Agrupa una variable numérica en intervalos
export function binColumn(table, key, { breaks, labels, name }) {
  const j = colIndex(table, key);
  const b = breaks.slice().sort((x, y) => x - y);
  const lab = labels && labels.length === b.length - 1 ? labels : b.slice(0, -1).map((x, i) => `${fmt(x)}–${fmt(b[i + 1])}`);
  const col = { key: uid('c'), name: name || `${table.columns[j].name} (clases)`, type: 'ord', levels: lab, unit: '', label: '' };
  table.columns.push(col);
  table.rows.forEach((r) => {
    const v = r[j];
    let k = -1;
    if (v != null) for (let i = 0; i < b.length - 1; i++) if (v >= b[i] && (v < b[i + 1] || (i === b.length - 2 && v <= b[i + 1]))) { k = i; break; }
    r.push(k >= 0 ? lab[k] : null);
  });
  return col;
}
const fmt = (x) => (Math.abs(x) >= 1000 ? Math.round(x).toLocaleString('es-AR') : String(+x.toFixed(2)).replace('.', ','));

export function recodeColumn(table, key, map, { name, asNew = true } = {}) {
  const j = colIndex(table, key);
  const src = table.columns[j];
  const out = Object.values(map).filter((v) => v !== '' && v != null);
  const levels = [...new Set(out)];
  if (asNew) {
    const col = { key: uid('c'), name: name || `${src.name} (recodificada)`, type: src.type === 'ord' ? 'ord' : 'cat', levels, unit: '', label: '' };
    table.columns.push(col);
    table.rows.forEach((r) => { const v = r[j]; r.push(v == null ? null : (map[String(v)] ?? String(v)) || null); });
    return col;
  }
  table.rows.forEach((r) => { const v = r[j]; r[j] = v == null ? null : (map[String(v)] ?? String(v)) || null; });
  src.levels = levelsOf(table, key, true);
  return src;
}

// De ancho a largo: las columnas elegidas pasan a ser filas (variable, valor)
export function meltTable(table, idKeys, valueKeys, { varName = 'Variable', valueName = 'Valor' } = {}) {
  const idI = idKeys.map((k) => colIndex(table, k));
  const vI = valueKeys.map((k) => colIndex(table, k));
  const idCols = idI.map((i) => ({ ...table.columns[i], key: uid('c') }));
  const varLevels = vI.map((i) => table.columns[i].name);
  const allNum = vI.every((i) => table.columns[i].type === 'num');
  const vcol = allNum ? { key: uid('c'), name: valueName, type: 'num', unit: table.columns[vI[0]].unit || '', label: '' } : { key: uid('c'), name: valueName, type: 'cat', levels: null, label: '' };
  const varCol = { key: uid('c'), name: varName, type: varLevels.every((l) => /^\d{4}$/.test(l)) ? 'num' : 'ord', levels: varLevels, unit: '', label: '' };
  const rows = [];
  for (const r of table.rows) for (const i of vI) rows.push([...idI.map((k) => r[k]), varCol.type === 'num' ? +table.columns[i].name : table.columns[i].name, r[i]]);
  const t = { id: uid('T'), name: `${table.name} (largo)`, source: { ...table.source, derived: 'melt' }, columns: [...idCols, varCol, vcol], rows, notes: '' };
  if (vcol.type === 'cat') vcol.levels = levelsOf(t, vcol.key, true);
  if (varCol.type === 'num') varCol.levels = null;
  return t;
}
// De largo a ancho
export function pivotTable(table, rowKey, colKey, valKey, agg = 'sum') {
  const ri = colIndex(table, rowKey), ci = colIndex(table, colKey), vi = colIndex(table, valKey);
  const rLev = levelsOf(table, rowKey), cLev = levelsOf(table, colKey);
  const cells = new Map();
  for (const r of table.rows) {
    if (r[ri] == null || r[ci] == null) continue;
    const k = `${r[ri]}\u0001${r[ci]}`;
    if (!cells.has(k)) cells.set(k, []);
    if (r[vi] != null) cells.get(k).push(r[vi]);
  }
  const columns = [{ ...table.columns[ri], key: uid('c') }, ...cLev.map((l) => ({ key: uid('c'), name: String(l), type: 'num', unit: table.columns[vi].unit || '', label: '' }))];
  const rows = rLev.map((rl) => [table.columns[ri].type === 'num' ? +rl : rl, ...cLev.map((cl) => { const v = cells.get(`${rl}\u0001${cl}`); return v && v.length ? aggregate(v, agg) : null; })]);
  return { id: uid('T'), name: `${table.name} (ancho)`, source: { ...table.source, derived: 'pivot' }, columns, rows, notes: '' };
}
export function transposeTable(table) {
  const first = table.columns[0];
  const names = table.rows.map((r, i) => (r[0] == null ? `Fila ${i + 1}` : String(r[0])));
  const raw = [[first.name === 'Columna 1' ? 'Variable' : 'Variable', ...names]];
  for (let j = 1; j < table.columns.length; j++) raw.push([table.columns[j].name, ...table.rows.map((r) => r[j])]);
  const t = buildTable(raw, { name: `${table.name} (traspuesta)`, source: { ...table.source, derived: 'transpose' } });
  return t;
}

// ---------- agregación ----------
export const AGGS = [
  ['count', 'Cantidad de casos'], ['sum', 'Suma'], ['mean', 'Media'], ['median', 'Mediana'], ['min', 'Mínimo'], ['max', 'Máximo'],
  ['sd', 'Desvío estándar'], ['pct', 'Porcentaje del total'], ['first', 'Valor tal cual (sin agregar)'],
];
export function aggregate(vals, how) {
  const v = vals.filter((x) => x != null && Number.isFinite(+x)).map(Number);
  switch (how) {
    case 'count': return vals.length;
    case 'sum': case 'pct': return v.reduce((a, b) => a + b, 0);
    case 'mean': return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
    case 'median': { if (!v.length) return null; const s = v.sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; }
    case 'min': return v.length ? Math.min(...v) : null;
    case 'max': return v.length ? Math.max(...v) : null;
    case 'sd': { if (v.length < 2) return null; const m = v.reduce((a, b) => a + b, 0) / v.length; return Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / (v.length - 1)); }
    case 'first': return v.length ? v[0] : null;
    default: return v.length ? v.reduce((a, b) => a + b, 0) : null;
  }
}

export function columnSummary(table, key) {
  const j = colIndex(table, key);
  const col = table.columns[j];
  const vals = table.rows.map((r) => r[j]);
  const present = vals.filter((v) => v != null);
  const out = { n: present.length, missing: vals.length - present.length, unique: new Set(present.map(String)).size };
  if (col.type === 'num') {
    const s = present.slice().sort((a, b) => a - b);
    out.min = s[0]; out.max = s[s.length - 1];
    out.mean = s.reduce((a, b) => a + b, 0) / (s.length || 1);
    out.median = s.length ? (s.length % 2 ? s[s.length >> 1] : (s[(s.length >> 1) - 1] + s[s.length >> 1]) / 2) : null;
  } else {
    const counts = new Map();
    for (const v of present) counts.set(String(v), (counts.get(String(v)) || 0) + 1);
    out.top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  }
  return out;
}
