// Descripción de un gráfico completo en JSON: datos + tipo + ejes (abajo y arriba) + leyenda + estilo.
// Sirve para tres cosas: guardar lo que el lector de imágenes interpretó, rehacer un gráfico desde un JSON propio
// y leer JSON ajenos (por ejemplo, el que arma otro programa o un asistente) que traen los datos en un arreglo
// y los ejes, las franjas o las marcas de arriba en otros.
import { parseValue } from './units.js';

export const SPEC_FORMAT = 'estadisticas-tesis-grafico';

// spec interno: { type, title, columns, rows, enc: {canal: nombre de columna}, options, kindText, style? }
export function specToJSON(spec) {
  return {
    formato: SPEC_FORMAT, version: 1, tipo: spec.type, titulo: spec.title || '', fuente: spec.source || '',
    columnas: spec.columns, filas: spec.rows, canales: spec.enc, opciones: spec.options || {},
    ...(spec.style ? { estilo: spec.style } : {}),
  };
}

// ---------- utilidades ----------
const isObj = (o) => o && typeof o === 'object' && !Array.isArray(o);
function flatten(o, pre = '', out = {}) {
  for (const [k, v] of Object.entries(o || {})) {
    const key = pre ? `${pre}.${k}` : k;
    if (isObj(v)) flatten(v, key, out); else if (Array.isArray(v)) out[key] = v.every((x) => !isObj(x)) ? v.join(', ') : JSON.stringify(v); else out[key] = v;
  }
  return out;
}
// todos los arreglos de objetos, con la ruta donde están
function arraysIn(o, path = '', out = [], depth = 0) {
  if (depth > 5 || o == null) return out;
  if (Array.isArray(o)) {
    if (o.length && o.every(isObj)) out.push({ path, arr: o });
    else if (o.length && o.every(Array.isArray)) out.push({ path, matrix: o });
    o.forEach((x, i) => { if (isObj(x)) for (const [k, v] of Object.entries(x)) if (Array.isArray(v) || isObj(v)) arraysIn(v, `${path}[${i}].${k}`, out, depth + 1); });
    return out;
  }
  if (isObj(o)) for (const [k, v] of Object.entries(o)) arraysIn(v, path ? `${path}.${k}` : k, out, depth + 1);
  return out;
}
function objectsIn(o, path = '', out = [], depth = 0) {
  if (depth > 4 || !isObj(o)) return out;
  out.push({ path, obj: o });
  for (const [k, v] of Object.entries(o)) if (isObj(v)) objectsIn(v, path ? `${path}.${k}` : k, out, depth + 1);
  return out;
}
// un valor puede venir como número, como texto con unidad («10 cm») o con coma decimal
function num(v) {
  if (typeof v === 'number') return { v, meters: null };
  if (v == null || v === '') return null;
  const p = parseValue(String(v));
  return p ? { v: p.v, meters: p.meters } : null;
}
const NAME = {
  label: /^(nombre|name|sentido|categor|label|r[oó]tulo|item|etiqueta|serie|fila|concepto|variable|clase|grupo|tarea|evento)/i,
  start: /(^|\.)(desde|inicio|start|from|min|m[ií]nimo|comienzo|de|x0|xmin|begin|lo|low|inferior)$/i,
  end: /(^|\.)(hasta|fin|final_?valor|end|to|max|m[aá]ximo|x1|xmax|hi|high|superior|alcance|habitual)$/i,
  end2: /(extensi|ext|max2|end2|ampl|noche|extendid|m[aá]ximo_?ext|hasta2|fin2)/i,
  note: /(nota|note|descrip|coment|texto|detalle|obs)/i,
  shape: /(forma|shape|flecha|abiert|final$|tipo_?final|terminaci)/i,
  value: /(valor|value|cantidad|total|n$|monto|y$|porcentaje|%|tasa)/i,
};
const TOPKEY = /(arriba|superior|top|x2|secundari|zona|franja|escala|banda|rango_?ref|e0)/i;
const AXISKEY = /(eje|axis|escala|scale)/i;

function readAxisObj(o) {
  if (!isObj(o)) return {};
  const f = flatten(o);
  const get = (re) => { const k = Object.keys(f).find((x) => re.test(x.split('.').pop())); return k ? f[k] : undefined; };
  const out = {};
  const sc = get(/^(escala|scale|tipo|type)$/);
  if (sc != null) out.log = /log/i.test(String(sc));
  if (o.log === true || o.logaritmica === true || o.logarítmica === true) out.log = true;
  const u = get(/^(unidad|unidades|unit|units)$/); if (u != null) out.units = String(u);
  const t = get(/^(t[ií]tulo|title|label|r[oó]tulo|nombre)$/); if (t != null && typeof t === 'string') out.title = t;
  const mn = num(get(/^(min|m[ií]nimo|desde|from)$/)), mx = num(get(/^(max|m[aá]ximo|hasta|to)$/));
  if (mn) out.min = mn.meters ?? mn.v; if (mx) out.max = mx.meters ?? mx.v;
  return out;
}

// marcas o franjas de un eje superior: [{valor|desde|at, rotulo|label}]
function readTop(arr) {
  if (!arr || !arr.length) return null;
  const f = arr.map((o) => flatten(o));
  const keys = Object.keys(f[0] || {});
  const labK = keys.find((k) => typeof f[0][k] === 'string' && !num(f[0][k])) || keys.find((k) => /^(id|rotulo|r[oó]tulo|label|nombre|name|zona|clave)$/i.test(k));
  const fromK = keys.find((k) => /^(desde|inicio|from|start|at|en|x|valor|value|pos|posici[oó]n|l[ií]mite|limite|min)$/i.test(k) && num(f[0][k]));
  const toK = keys.find((k) => /^(hasta|fin|to|end|max)$/i.test(k) && num(f[0][k]));
  if (!labK || (!fromK && !toK)) return null;
  const items = f.map((o) => { const a = num(o[fromK]), b = num(o[toK]); return { label: String(o[labK] ?? ''), from: a ? a.meters ?? a.v : null, to: b ? b.meters ?? b.v : null, metric: (a && a.meters != null) || (b && b.meters != null) }; });
  return { items, spans: !!toK || /desde|inicio|from|start/i.test(fromK || '') };
}

// ---------- lectura de un JSON cualquiera ----------
export function interpretJSON(obj) {
  // 1) formato propio
  if (isObj(obj) && obj.formato === SPEC_FORMAT) {
    return { spec: { type: obj.tipo, title: obj.titulo || '', source: obj.fuente || '', columns: obj.columnas, rows: obj.filas, enc: obj.canales || {}, options: obj.opciones || {}, style: obj.estilo || null, kindText: 'Gráfico guardado' }, sheets: [{ name: obj.titulo || 'Datos', rows: [obj.columnas, ...obj.filas] }], notes: [] };
  }
  const notes = [];
  const arrays = arraysIn(obj);
  // todas las tablas, para importarlas aunque no se reconozca un gráfico
  const sheets = arrays.map((a, i) => {
    if (a.matrix) return { name: a.path || `Tabla ${i + 1}`, rows: a.matrix };
    const fl = a.arr.map((o) => flatten(o));
    const keys = []; for (const o of fl.slice(0, 500)) for (const k of Object.keys(o)) if (!keys.includes(k)) keys.push(k);
    return { name: a.path || `Tabla ${i + 1}`, rows: [keys, ...fl.map((o) => keys.map((k) => o[k] ?? null))], flat: fl, keys, path: a.path };
  }).filter((s) => s.rows.length > 1);
  if (!sheets.length) return { spec: null, sheets: [], notes: ['El JSON no trae ningún arreglo de datos.'] };
  // 2) la tabla principal: la que tiene más filas con rótulo y números; las chicas con rótulo + posición pueden ser el eje de arriba
  const scored = sheets.filter((s) => s.flat).map((s) => {
    const k = s.keys; const f0 = s.flat;
    const numK = k.filter((x) => f0.filter((o) => num(o[x])).length >= f0.length * 0.5);
    const strK = k.filter((x) => f0.filter((o) => typeof o[x] === 'string' && !num(o[x])).length >= f0.length * 0.5);
    const top = TOPKEY.test(s.path || '') ? 1000 : 0;
    return { s, numK, strK, score: s.flat.length * (numK.length >= 2 ? 2 : numK.length ? 1 : 0) + (strK.length ? 2 : 0) - top };
  }).sort((a, b) => b.score - a.score);
  const main = scored[0];
  if (!main || !main.numK.length) return { spec: null, sheets, notes };
  sheets.splice(sheets.indexOf(main.s), 1); sheets.unshift(main.s); // la tabla de datos primero
  const K = main.s.keys, F = main.s.flat;
  const findK = (re, pool = K) => pool.find((x) => re.test(x));
  const label = findK(NAME.label, main.strK) || main.strK[0];
  let start = findK(NAME.start, main.numK), end = findK(NAME.end, main.numK.filter((x) => x !== start));
  let end2 = findK(NAME.end2, main.numK.filter((x) => x !== start && x !== end));
  if (end2 && NAME.end2.test(end || '') && !NAME.end2.test(end2)) [end, end2] = [end2, end];
  // con dos pares desde/hasta anidados («habitual.desde», «extension.hasta») el segundo «hasta» es la extensión
  if (!end2) { const hs = main.numK.filter((x) => /(hasta|fin|end|to|max)$/i.test(x)); if (hs.length >= 2) { end = hs[0]; end2 = hs[1]; } }
  const note = findK(NAME.note, main.strK.filter((x) => x !== label));
  const shape = findK(NAME.shape, K.filter((x) => x !== label && x !== note));
  const options = {};
  // ejes: objetos con «eje», «escala» o «axis» en el nombre
  const objs = objectsIn(obj).filter((o) => o.path);
  const bottomObj = objs.find((o) => AXISKEY.test(o.path) && !TOPKEY.test(o.path)) || objs.find((o) => /abajo|inferior|bottom|x$/i.test(o.path));
  const topObj = objs.find((o) => TOPKEY.test(o.path) && AXISKEY.test(o.path)) || objs.find((o) => TOPKEY.test(o.path));
  const bAx = readAxisObj(bottomObj && bottomObj.obj);
  // franjas o marcas de arriba: arreglo chico con rótulo y posición
  let topArr = sheets.filter((s) => s !== main.s && s.flat && s.flat.length <= 30 && !/abajo|inferior|bottom/i.test(s.path || '')).map((s) => ({ s, t: readTop(s.flat) })).filter((o) => o.t);
  topArr.sort((a, b) => (TOPKEY.test(b.s.path || '') ? 1 : 0) - (TOPKEY.test(a.s.path || '') ? 1 : 0));
  const top = topArr[0] ? topArr[0].t : null;
  const toNum = (v) => { const n = num(v); return n ? n.meters ?? n.v : null; };
  const anyMetric = F.some((o) => [start, end, end2].some((k) => k && num(o[k]) && num(o[k]).meters != null)) || (top && top.items.some((i) => i.metric)) || /^(m|metros|cm|km)$/i.test(bAx.units || '');
  // ¿rangos?
  if (label && start && end) {
    const cols = ['Rótulo', 'Inicio', 'Fin', ...(end2 ? ['Extensión hasta'] : []), 'Nota', 'Final'];
    const unitK = (v) => { const n = num(v); if (!n) return null; if (n.meters != null) return n.meters; if (/^(cm)$/i.test(bAx.units || '')) return n.v / 100; if (/^km$/i.test(bAx.units || '')) return n.v * 1000; return n.v; };
    const rows = F.map((o) => [String(o[label] ?? ''), unitK(o[start]), unitK(o[end]), ...(end2 ? [unitK(o[end2])] : []), note ? String(o[note] ?? '') : '', shape ? shapeWord(o[shape]) : '']);
    if (anyMetric) options.xUnits = 'metros';
    const vals = rows.flatMap((r) => [r[1], r[2], end2 ? r[3] : null]).filter((v) => v > 0);
    if (bAx.log != null) options.xLog = bAx.log ? 'true' : 'false'; else if (vals.length && Math.max(...vals) / Math.min(...vals) > 500) options.xLog = 'true';
    if (bAx.title) options.xTitle = bAx.title;
    if (bAx.min != null) options.xMin = bAx.min; if (bAx.max != null) options.xMax = bAx.max;
    if (top) {
      const it = top.items.filter((i) => i.from != null || i.to != null);
      if (top.spans) {
        // franjas: cada una desde su inicio; la que arranca en el mínimo es la primera
        const sorted = it.slice().sort((a, b) => (a.from ?? -Infinity) - (b.from ?? -Infinity));
        const lo = Math.min(...vals, options.xMin ?? Infinity);
        const first = sorted.find((z) => z.from == null || z.from <= lo * 1.0001);
        if (first) options.zoneFirst = first.label;
        options.zones = sorted.filter((z) => z !== first && z.from != null).map((z) => ({ at: z.from, label: z.label }));
        if (!first && sorted.length && sorted[0].to != null && sorted[0].from == null) options.zoneFirst = sorted[0].label;
      } else options.topTicks = it.map((i) => ({ at: i.from ?? i.to, label: i.label }));
      notes.push(`Eje de arriba: ${it.length} ${top.spans ? 'franjas' : 'marcas'} tomadas de «${topArr[0].s.path}».`);
    }
    // leyenda y título si vienen en el JSON
    const legObj = objs.find((o) => /leyenda|legend|series/i.test(o.path));
    if (legObj) { const fl = flatten(legObj.obj); const vs = Object.values(fl).filter((v) => typeof v === 'string'); if (vs[0]) options.labelA = vs[0]; if (vs[1]) options.labelB = vs[1]; options.legend = 'bottom'; }
    notes.unshift(`Datos de «${main.s.path || 'la raíz'}»: ${rows.length} filas con inicio y fin${end2 ? ' y extensión' : ''}.`);
    const title = isObj(obj) ? (obj.titulo || obj.title || obj.nombre || '') : '';
    return { spec: { type: 'range', title: typeof title === 'string' ? title : '', columns: cols, rows, enc: { label: 'Rótulo', start: 'Inicio', end: 'Fin', ...(end2 ? { end2: 'Extensión hasta' } : {}), note: 'Nota', shape: 'Final' }, options, kindText: `Rangos${top ? (top.spans ? ' con franjas arriba' : ' con eje superior') : ''}` }, sheets, notes };
  }
  // barras: rótulo + un valor
  const val = findK(NAME.value, main.numK) || main.numK[0];
  if (label && val) {
    const rows = F.map((o) => [String(o[label] ?? ''), toNum(o[val])]);
    if (bAx.title) options.yTitle = bAx.title;
    notes.unshift(`Datos de «${main.s.path || 'la raíz'}»: ${rows.length} categorías con «${val}».`);
    return { spec: { type: 'bar', title: '', columns: [label, val], rows, enc: { x: label, y: val }, options, kindText: 'Barras' }, sheets, notes };
  }
  return { spec: null, sheets, notes };
}
function shapeWord(v) {
  if (v === true) return 'abierto';
  const s = String(v ?? '').toLowerCase();
  if (/difus|punte|trazo|radia|dash/.test(s)) return 'difuso';
  if (/abiert|flecha|arrow|open|sigue|→|true|s[ií]/.test(s)) return 'abierto';
  return '';
}
