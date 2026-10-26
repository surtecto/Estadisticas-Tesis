// «Rehacer un gráfico»: desde una imagen (JPG, PNG, captura) o un JSON, la app interpreta el gráfico completo
// —tipo, ejes de abajo y de arriba, rótulos, notas, leyenda y valores—, lo muestra superpuesto a la imagen para
// controlarlo, deja corregir la tabla y los ejes, y recién entonces crea la tabla y la figura.
import { el, clear, readFileAs, downloadBlob, uid, deltaE, hexToRgb } from '../util.js';
import { formDialog } from './dialogs.js';
import { digitizeImage } from '../figure/digitize.js';
import { interpretJSON, specToJSON } from '../data/chartSpec.js';
import { analyzeImage, themeFromAnalysis, registerProjectStyles } from '../figure/imageStyle.js';
import { buildTable } from '../data/table.js';
import { addTable, createFigure, defaultFigure, createProject, saveProject, getProject, listFigures } from '../library.js';
import { THEMES, getTheme, FONTS } from '../charts/themes.js';
import { PALETTES, paletteColors, getPalette } from '../palette.js';

const TYPE_GROUPS = {
  range: [['range', 'Rangos (barras flotantes)'], ['gantt', 'Cronograma (Gantt)'], ['timeline', 'Línea de tiempo']],
  xy: [['bar', 'Barras'], ['dot', 'Puntos (Cleveland)'], ['line', 'Líneas'], ['area', 'Áreas'], ['pie', 'Torta o dona']],
};
const FONT_CHOICES = ['Source Sans 3', 'Source Serif 4', 'Archivo', 'Lato', 'Open Sans', 'Roboto Condensed', 'Merriweather', 'EB Garamond', 'IBM Plex Mono'];

export async function pickChartSource() {
  const { pickFile } = await import('./importer.js');
  return pickFile('image/*,.json');
}

// Abre el diálogo con un archivo (imagen o JSON) o con un spec ya leído; devuelve { spec, style } o null
export async function interpretDialog({ file = null, spec: given = null, notes: givenNotes = [] } = {}) {
  const body = el('div', { class: 'itp' });
  const prog = el('div', { class: 'itp-prog' }, el('div', { class: 'itp-bar' }, el('i', {})), el('p', { class: 'note' }, 'Preparando…'));
  body.append(prog);
  const S = { spec: given, notes: givenNotes, warnings: [], src: null, overlay: null, image: null, analysis: null, copyStyle: true, font: 'Source Sans 3', baseStyle: '' };
  const isImage = file && /^image\//.test(file.type || '') || (file && /\.(png|jpe?g|webp|gif|bmp|avif)$/i.test(file.name || ''));
  const run = async () => {
    try {
      if (file && isImage) {
        S.src = await readFileAs(file, 'dataurl');
        const setP = (m) => { prog.querySelector('i').style.width = `${Math.round((m.p || 0) * 100)}%`; prog.querySelector('p').textContent = `${m.step}…`; };
        const r = await digitizeImage(S.src, { onProgress: setP });
        S.spec = r; S.overlay = r.overlay; S.image = r.image; S.warnings = r.warnings || [];
        S.analysis = await analyzeImage(S.src).catch(() => null);
        S.title = '';
      } else if (file) {
        const obj = JSON.parse(await readFileAs(file, 'text'));
        const r = interpretJSON(obj);
        if (!r.spec) throw new Error(`No se reconoció un gráfico en el JSON. ${r.notes.join(' ')} Usá «Agregar datos» para traer sus tablas.`);
        S.spec = r.spec; S.notes = r.notes;
        if (r.spec.style) { S.copyStyle = false; }
      }
      if (!S.spec) throw new Error('Nada que interpretar.');
      draw();
    } catch (e) { console.error(e); clear(body); body.append(el('p', { class: 'warn-note' }, `No se pudo interpretar: ${e.message}`)); }
  };
  const draw = () => { clear(body); body.append(view(S, draw)); };
  const p = formDialog({ title: 'Rehacer un gráfico', body, ok: 'Crear la figura', wide: true, validate: () => (S.spec && S.spec.rows && S.spec.rows.length ? true : 'Todavía no hay datos: esperá la lectura o completá la tabla.') });
  document.getElementById('app-dialog').classList.add('xwide');
  run();
  const ok = await p;
  document.getElementById('app-dialog').classList.remove('xwide');
  if (!ok || !S.spec) return null;
  return { spec: S.spec, style: S.copyStyle && S.src ? await styleFor(S) : null, baseStyle: S.baseStyle, title: S.title || '', src: S.src };
}

// ---------- vista del diálogo ----------
function view(S, redraw) {
  const sp = S.spec;
  const o = sp.options || (sp.options = {});
  const isRange = ['range', 'gantt', 'timeline'].includes(sp.type);
  const left = el('div', { class: 'itp-l' });
  if (S.src) {
    const fig = el('div', { class: 'itp-img' }, el('img', { src: S.src, alt: 'Gráfico original' }));
    if (S.overlay && S.image) fig.append(overlaySVG(S));
    left.append(fig, el('p', { class: 'note' }, 'Lo leído, sobre la imagen: barras en recuadro, valores del eje en verde, límites de franja en rojo, textos usados en gris.'));
  }
  const msgs = [...(S.notes || []), ...(S.warnings || [])];
  if (msgs.length) left.append(el('ul', { class: 'note itp-msgs' }, ...msgs.map((m) => el('li', {}, m))));
  // tipo
  const group = isRange ? TYPE_GROUPS.range : TYPE_GROUPS.xy;
  const ts = el('select', {}, ...group.map(([k, l]) => el('option', { value: k, selected: sp.type === k }, l)));
  ts.addEventListener('change', () => { sp.type = ts.value; });
  const right = el('div', { class: 'itp-r' },
    el('div', { class: 'itp-kind' }, el('strong', {}, 'Se leyó: '), el('span', {}, sp.kindText || sp.type)),
    el('div', { class: 'field' }, el('label', {}, 'Tipo de gráfico'), ts),
    field('Título de la figura', S, 'title', 'opcional'));
  // ejes
  const ax = el('details', { class: 'sec', open: true }, el('summary', {}, 'Ejes'));
  if (isRange) {
    const lg = el('select', {}, ...[['true', 'Logarítmica'], ['false', 'Lineal'], ['', 'Automática']].map(([k, l]) => el('option', { value: k, selected: String(o.xLog ?? '') === k }, l)));
    lg.addEventListener('change', () => { o.xLog = lg.value; });
    const un = el('select', {}, ...[['metros', 'Metros (cm, m, km)'], ['', 'Sin unidad'], ['segundos', 'Segundos'], ['pesos', 'Pesos']].map(([k, l]) => el('option', { value: k, selected: (o.xUnits || '') === k }, l)));
    un.addEventListener('change', () => { o.xUnits = un.value; });
    ax.append(two(el('div', { class: 'field' }, el('label', {}, 'Escala de abajo'), lg), el('div', { class: 'field' }, el('label', {}, 'Unidades'), un)),
      two(field('Mínimo', o, 'xMin', 'auto', true), field('Máximo', o, 'xMax', 'auto', true)), field('Título del eje de abajo', o, 'xTitle', ''),
      el('h4', {}, 'Eje de arriba'), field('Rótulo antes del primer corte', o, 'zoneFirst', 'p. ej. E0'),
      pairs('Franjas: «valor = rótulo de la franja que empieza ahí»', o, 'zones'), pairs('O marcas sueltas: «valor = rótulo»', o, 'topTicks'),
      el('h4', {}, 'Leyenda'), two(field('Tramo habitual', o, 'labelA', ''), field('Extensión', o, 'labelB', '')));
  } else {
    ax.append(two(field('Título del eje horizontal', o, 'xTitle', ''), field('Título del eje vertical', o, 'yTitle', '')));
    if (sp.type === 'bar') { const st = el('select', {}, ...[['group', 'Agrupadas'], ['stack', 'Apiladas'], ['pct', 'Al 100 %']].map(([k, l]) => el('option', { value: k, selected: (o.stack || 'group') === k }, l))); st.addEventListener('change', () => { o.stack = st.value; }); const or = el('select', {}, ...[['v', 'Verticales (columnas)'], ['h', 'Horizontales']].map(([k, l]) => el('option', { value: k, selected: (o.orientation || 'v') === k }, l))); or.addEventListener('change', () => { o.orientation = or.value; }); ax.append(two(el('div', { class: 'field' }, el('label', {}, 'Barras'), or), sp.columns.length > 2 ? el('div', { class: 'field' }, el('label', {}, 'Series'), st) : el('span'))); }
  }
  right.append(ax);
  // estilo
  const sty = el('details', { class: 'sec', open: true }, el('summary', {}, 'Estilo'));
  const bs = el('select', {}, el('option', { value: '' }, S.src ? 'El de la imagen (fondo, tinta y colores leídos)' : 'Tesis (APA, sans)'), ...THEMES.filter((t) => !t.custom).map((t) => el('option', { value: t.id, selected: S.baseStyle === t.id }, t.name)));
  bs.addEventListener('change', () => { S.baseStyle = bs.value; S.copyStyle = !bs.value; fsel.disabled = !!bs.value; });
  const fsel = el('select', { disabled: !!S.baseStyle }, ...FONT_CHOICES.map((k) => el('option', { value: k, selected: S.font === k }, k)));
  fsel.addEventListener('change', () => { S.font = fsel.value; });
  sty.append(two(el('div', { class: 'field' }, el('label', {}, 'Estilo'), bs), el('div', { class: 'field' }, el('label', {}, 'Tipografía (no se lee de la imagen)'), fsel)));
  right.append(sty);
  // tabla editable
  right.append(el('details', { class: 'sec', open: true }, el('summary', {}, `Datos leídos (${sp.rows.length} filas): corregí lo que haga falta`), tableEditor(sp, redraw)));
  right.append(el('div', { class: 'btn-row' }, el('button', { type: 'button', class: 'btn small ghost', onclick: () => { const j = specToJSON({ ...sp, title: S.title }); downloadBlob(new Blob([JSON.stringify(j, null, 2)], { type: 'application/json' }), 'grafico-interpretado.json'); } }, 'Guardar la interpretación (.json)')));
  return el('div', { class: 'itp-grid' }, left, right);
}
const two = (a, b) => el('div', { class: 'field-row' }, a, b);
function field(label, obj, key, ph, numeric = false) {
  const i = el('input', { type: 'text', value: obj[key] == null ? '' : (numeric ? String(obj[key]).replace('.', ',') : obj[key]), placeholder: ph });
  i.addEventListener('change', () => { const v = i.value.trim(); if (numeric) { const n = parseFloat(v.replace(/\./g, (x, k, s) => (s.includes(',') ? '' : x)).replace(',', '.')); if (v === '' || !Number.isFinite(n)) delete obj[key]; else obj[key] = n; } else obj[key] = v; });
  return el('div', { class: 'field' }, el('label', {}, label), i);
}
function pairs(label, obj, key) {
  const ta = el('textarea', { rows: 3 });
  ta.value = (obj[key] || []).map((z) => `${String(z.at).replace('.', ',')} = ${z.label}`).join('\n');
  ta.addEventListener('change', () => {
    obj[key] = ta.value.split(/\n/).map((l) => { const m = l.match(/^\s*([-\d.,e]+)\s*[=:]\s*(.*)$/i); return m ? { at: parseFloat(m[1].replace(/\./g, (x, i, s) => (s.includes(',') ? '' : x)).replace(',', '.')), label: m[2].trim() } : null; }).filter((z) => z && Number.isFinite(z.at));
  });
  return el('div', { class: 'field' }, el('label', {}, label), ta);
}
function tableEditor(sp, redraw) {
  const fmt = (v) => (v == null ? '' : typeof v === 'number' ? String(v).replace('.', ',') : String(v));
  const parse = (s, j) => {
    const t = s.trim(); if (t === '') return null;
    const numeric = sp.rows.some((r) => typeof r[j] === 'number');
    if (numeric) { const n = parseFloat(t.replace(/\./g, (x, k, str) => (str.includes(',') ? '' : x)).replace(',', '.')); return Number.isFinite(n) ? n : t; }
    return t;
  };
  const tbl = el('table', { class: 'itp-tbl' });
  const head = el('tr', {}, ...sp.columns.map((c, j) => { const i = el('input', { type: 'text', value: c }); i.addEventListener('change', () => { const old = sp.columns[j]; sp.columns[j] = i.value.trim() || old; for (const k of Object.keys(sp.enc)) if (sp.enc[k] === old) sp.enc[k] = sp.columns[j]; }); return el('th', {}, i); }), el('th', {}));
  tbl.append(el('thead', {}, head));
  const tb = el('tbody', {});
  sp.rows.forEach((r, i) => {
    tb.append(el('tr', {}, ...sp.columns.map((_, j) => { const inp = el('input', { type: 'text', value: fmt(r[j]) }); inp.addEventListener('change', () => { r[j] = parse(inp.value, j); }); return el('td', {}, inp); }),
      el('td', {}, el('button', { type: 'button', class: 'icon ghost', title: 'Quitar fila', onclick: () => { sp.rows.splice(i, 1); redraw(); } }, '×'))));
  });
  tbl.append(tb);
  return el('div', {}, el('div', { class: 'itp-tblwrap' }, tbl), el('button', { type: 'button', class: 'btn small ghost', onclick: () => { sp.rows.push(sp.columns.map(() => null)); redraw(); } }, '+ fila'));
}
function overlaySVG(S) {
  const ns = 'http://www.w3.org/2000/svg';
  const mk = (t, a, txt) => { const n = document.createElementNS(ns, t); for (const k in a) if (a[k] != null) n.setAttribute(k, a[k]); if (txt != null) n.textContent = txt; return n; };
  const { w, h } = S.image;
  const svg = mk('svg', { viewBox: `0 0 ${w} ${h}`, class: 'itp-ov', preserveAspectRatio: 'none' });
  const ov = S.overlay;
  for (const x of ov.vlines || []) svg.append(mk('line', { x1: x, x2: x, y1: 0, y2: h, stroke: '#d1242f', 'stroke-width': 1.5, 'stroke-dasharray': '4 3' }));
  for (const b of ov.bars || []) svg.append(mk('rect', { x: b.x0 - 1, y: b.y0 - 1, width: b.w + 2, height: b.h + 2, fill: 'none', stroke: '#111', 'stroke-width': 1.2 }));
  for (const c of ov.chains || []) for (const n of c.notes || []) svg.append(mk('rect', { x: n.p.x0 - 1, y: n.p.y0 - 1, width: n.p.x1 - n.p.x0 + 2, height: n.p.y1 - n.p.y0 + 2, fill: 'rgba(120,120,120,.15)', stroke: '#777', 'stroke-width': 0.6 }));
  for (const a of ov.axis || []) {
    const p = a.ph;
    svg.append(mk('rect', { x: p.x0 - 1, y: p.y0 - 1, width: p.x1 - p.x0 + 2, height: p.y1 - p.y0 + 2, fill: 'rgba(31,140,64,.18)', stroke: '#1f8c40', 'stroke-width': 1 }));
  }
  for (const p of ov.top || []) svg.append(mk('rect', { x: p.x0 - 1, y: p.y0 - 1, width: p.x1 - p.x0 + 2, height: p.y1 - p.y0 + 2, fill: 'rgba(209,36,47,.12)', stroke: '#d1242f', 'stroke-width': 0.8 }));
  return svg;
}

// ---------- estilo a partir de la imagen ----------
async function styleFor(S) {
  const a = S.analysis || await analyzeImage(S.src);
  const o = S.spec.options || {};
  const st = themeFromAnalysis(a, { name: 'Como la imagen', font: S.font, radius: 0 });
  // la paleta: primero los colores de las marcas leídas, en su orden
  const marks = [o.colorA, o.colorB, ...Object.values(o.colors || {}), o.color].filter(Boolean);
  const cols = [];
  for (const c of [...marks, ...a.palette]) if (cols.every((x) => deltaE(hexToRgb(x), hexToRgb(c)) > 12)) cols.push(c);
  const pool = [...paletteColors(getPalette(a.dark ? 'neon' : 'ensayo'), 8), ...paletteColors(getPalette('okabe'), 8)];
  for (const c of pool) { if (cols.length >= 6) break; if (cols.every((x) => deltaE(hexToRgb(x), hexToRgb(c)) > 28)) cols.push(c); }
  st.paletteColors = cols;
  // lo que el lector entendió del gráfico manda sobre la grilla detectada: las líneas de franja no son grilla
  if (['range', 'gantt', 'timeline'].includes(S.spec.type)) { st.gridY = false; st.gridX = !(o.zones && o.zones.length) && a.gridX; }
  st.gradient = false; st.glow = a.glow && a.dark;
  st.fontTitle = S.font;
  return st;
}

// ---------- crear tabla, figura y estilo ----------
export async function createFromSpec(projectId, project, res, { saveProjectFn } = {}) {
  const { spec } = res;
  let styleId = res.baseStyle || 'tesis';
  if (res.style) {
    const st = res.style;
    st.palette = st.id;
    if (res.src) st.image = await shrinkImage(res.src);
    project.styles = [...(project.styles || []), st];
    registerProjectStyles(project);
    if (saveProjectFn) await saveProjectFn(project); else await saveProject(project);
    styleId = st.id;
  } else if (spec.style && spec.style.id) {
    project.styles = [...(project.styles || []).filter((x) => x.id !== spec.style.id), spec.style];
    registerProjectStyles(project);
    if (saveProjectFn) await saveProjectFn(project); else await saveProject(project);
    styleId = spec.style.id;
  }
  const name = res.title || (spec.kindText ? `Gráfico rehecho: ${spec.kindText}` : 'Gráfico rehecho');
  const t0 = buildTable([spec.columns, ...spec.rows], { name: res.title || 'Datos del gráfico', source: { file: res.src ? 'imagen' : 'JSON', citation: res.src ? 'Valores medidos sobre una imagen del gráfico (aproximados).' : '' } });
  // las categorías quedan en el orden en que aparecen en el gráfico original, no alfabético
  t0.columns.forEach((c, j) => { if (c.type === 'cat' || c.type === 'ord') c.levels = [...new Set(t0.rows.map((r) => r[j]).filter((v) => v != null).map(String))]; });
  const t = await addTable(projectId, t0);
  const key = (nm) => { const c = t.columns.find((x) => x.name === nm) || t.columns.find((x) => x.name.startsWith(nm)); return c ? c.key : null; };
  const enc = {};
  for (const [ch, nm] of Object.entries(spec.enc || {})) { const k = key(nm); if (k) enc[ch] = k; }
  const options = { legend: 'auto', ...(spec.options || {}) };
  if (options.color && !enc.color) { /* color único de la serie */ } else delete options.color;
  const isRange = ['range', 'gantt', 'timeline'].includes(spec.type);
  const nRows = spec.rows.length;
  const fig = await createFigure(projectId, defaultFigure({
    name: name.slice(0, 60), style: styleId, media: { profileId: 'tesis-a4', quality: 'estandar' }, page: { w: 160, h: Math.round(Math.max(70, Math.min(200, isRange ? 30 + nRows * 9 : 100))) }, title: res.title || '',
    caption: { mode: 'apa', number: '1', note: '', source: res.src ? 'Elaboración propia a partir de un gráfico existente (valores medidos sobre la imagen).' : '', autoNotes: false, inside: true }, layout: { cols: 1, gap: 5, letters: false },
    panels: [{ id: uid('P'), tableId: t.id, type: spec.type, enc, options, filters: [], agg: 'sum', title: '', span: 1 }],
  }));
  return { table: t, figure: fig, styleId };
}
async function shrinkImage(src) {
  const im = await new Promise((r, j) => { const i = new Image(); i.onload = () => r(i); i.onerror = j; i.src = src; });
  const sc = Math.min(1, 720 / Math.max(im.width, im.height));
  const c = document.createElement('canvas'); c.width = Math.round(im.width * sc); c.height = Math.round(im.height * sc);
  c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.82);
}

// Desde el editor: agrega la tabla y la figura al proyecto abierto
export async function rebuildInEditor(E, file = null, preset = null) {
  const f = preset ? null : (file || await pickChartSource());
  if (!f && !preset) return;
  const res = await interpretDialog(preset ? { spec: preset.spec, notes: preset.notes } : { file: f });
  if (!res) return;
  try {
    const { table, figure } = await createFromSpec(E.projectId, E.project, res, { saveProjectFn: () => E.saveProject() });
    E.project = await getProject(E.projectId);
    registerProjectStyles(E.project);
    E.tables[table.id] = table; E.tableOrder.push(table.id); E.activeTable = table.id;
    E.figures = await listFigures(E.projectId);
    E.toast('Gráfico rehecho: revisá la figura nueva y ajustá lo que haga falta.');
    E.app.go(`#/p/${E.projectId}/${figure.id}`);
  } catch (e) { console.error(e); E.toast(`No se pudo crear la figura: ${e.message}`, 'error'); }
}
// Desde el inicio: proyecto nuevo con la figura rehecha
export async function rebuildAsProject(app) {
  const f = await pickChartSource();
  if (!f) return;
  const res = await interpretDialog({ file: f });
  if (!res) return;
  try {
    const p = await createProject({ kind: 'tesis-doctoral', name: res.title || `Gráfico rehecho · ${f.name.replace(/\.[^.]+$/, '')}`, title: res.title || '' });
    const { figure } = await createFromSpec(p.id, p, res);
    app.go(`#/p/${p.id}/${figure.id}`);
  } catch (e) { console.error(e); app.toast(`No se pudo crear el proyecto: ${e.message}`, 'error'); }
}
