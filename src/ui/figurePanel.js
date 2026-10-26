// Panel derecho: destino de la figura (tamaño, resolución), estilo, paleta, tipografía, epígrafe, color o grises,
// simulación de visión y exportación.
import { el, clear, downloadBlob, readFileAs, deltaE, hexToRgb } from '../util.js';
import { MEDIA, QUALITIES, getMedia, exportDpi } from '../figure/media.js';
import { THEMES, getTheme, FONTS } from '../charts/themes.js';
import { PALETTES, RAMPS, paletteColors, getPalette, extractPaletteFromImage, getRamp, rampColors } from '../palette.js';
import { exportFigure, FORMATS, figureSVG, serialize } from '../figure/export.js';
import { analyzeImage, themeFromAnalysis, registerProjectStyles } from '../figure/imageStyle.js';
import { formDialog, confirmDialog } from './dialogs.js';

export function renderFigurePanel(E, b) {
  const f = E.fig;
  const m = getMedia(f.media.profileId);
  // ---- destino
  const ms = el('select', {});
  for (const g of [...new Set(MEDIA.map((x) => x.group))]) ms.appendChild(el('optgroup', { label: g }, ...MEDIA.filter((x) => x.group === g).map((x) => el('option', { value: x.id, selected: x.id === m.id }, x.name))));
  ms.addEventListener('change', () => { f.media.profileId = ms.value; f.page = null; f.media.quality = 'estandar'; E.changed('destino', { right: true, left: E.leftTab === 'tesis' }); });
  const pw = f.page ? f.page.w : m.page.w, ph = f.page ? f.page.h : m.page.h;
  const h = el('input', { type: 'number', class: 'num', value: Math.round(ph), min: 30, max: 1200, step: 5 });
  h.addEventListener('change', () => { const v = Math.max(30, Math.min(1200, +h.value || ph)); f.page = { w: pw, h: v }; E.changed('alto', { right: true }); });
  const w = el('input', { type: 'number', class: 'num', value: Math.round(pw), min: 30, max: 1200, step: 5, disabled: m.kind !== 'print' });
  w.addEventListener('change', () => { const v = Math.max(30, Math.min(1200, +w.value || pw)); f.page = { w: v, h: ph }; E.changed('ancho', { right: true }); });
  const q = el('select', {}, ...(QUALITIES[m.kind] || []).map(([k, l]) => el('option', { value: k, selected: f.media.quality === k }, l)));
  q.addEventListener('change', () => { f.media.quality = q.value; E.changed('calidad', { board: false, right: true }); });
  b.append(el('h3', { class: 'panel-h first' }, 'Destino'), el('div', { class: 'field' }, ms),
    el('div', { class: 'field-row' }, el('div', { class: 'field' }, el('label', {}, 'Ancho (mm)'), w), el('div', { class: 'field' }, el('label', {}, 'Alto (mm)'), h)),
    el('div', { class: 'field' }, el('label', {}, 'Calidad de exportación'), q),
    el('p', { class: 'note' }, `${exportDpi(f)} ppp · ${m.kind === 'print' ? `texto de ${m.min.textPt} pt o más` : `rótulos de ${m.min.textPx} px o más`} · ${m.format.toUpperCase()} recomendado`));
  // ---- estilo
  const sty = el('div', { class: 'styles' });
  for (const t of THEMES) {
    const cols = paletteColors(getPalette(t.palette) || getPalette('okabe'), 4);
    sty.appendChild(el('button', { type: 'button', class: `style-card ${f.style === t.id ? 'on' : ''}`, title: t.desc, onclick: () => { f.style = t.id; f.palette = ''; f.ramp = ''; f.font = ''; f.fontTitle = ''; if (t.id === 'periodistico' || t.id === 'info-azul' || t.id === 'neon') f.caption.mode = 'titulo'; E.changed('estilo', { right: true, left: E.leftTab !== 'datos' }); } },
      el('span', { class: 'sc-sw', style: { background: t.bg } }, ...cols.map((c) => el('i', { style: { background: c } }))), el('span', { class: 'sc-name', style: { fontFamily: FONTS[t.font] } }, t.name)));
  }
  const cur = getTheme(f.style);
  b.append(el('h3', { class: 'panel-h' }, 'Estilo'), sty, el('p', { class: 'note' }, cur.desc),
    el('div', { class: 'btn-row' }, el('button', { type: 'button', class: 'btn small', onclick: () => styleFromImage(E) }, 'Estilo desde una imagen…'),
      cur.custom ? el('button', { type: 'button', class: 'btn small', onclick: () => styleFromImage(E, cur) }, 'Editar este estilo…') : null,
      cur.custom ? el('button', { type: 'button', class: 'btn small ghost', onclick: () => removeStyle(E, cur) }, 'Quitar') : null),
    el('p', { class: 'note' }, 'Subí un JPG, PNG o una captura de pantalla de un gráfico que te guste: la app lee el fondo, la tinta, la grilla, la paleta y si hay degradés o brillo, y lo guarda como estilo del proyecto.'));
  // ---- paleta y rampa
  const th = getTheme(f.style);
  const pid = f.palette || th.palette;
  const ps = el('select', {}, ...PALETTES.map((p) => el('option', { value: p.id, selected: p.id === pid }, p.name)));
  ps.addEventListener('change', () => { f.palette = ps.value; E.changed('paleta', { right: true }); });
  const sw = el('div', { class: 'swatches' }, ...paletteColors(getPalette(pid), 8).map((c) => el('span', { style: { background: c }, title: c })));
  const rs = el('select', {}, ...RAMPS.map((r) => el('option', { value: r.id, selected: r.id === (f.ramp || th.ramp) }, r.name)));
  rs.addEventListener('change', () => { f.ramp = rs.value; E.changed('rampa', { right: true }); });
  const rsw = el('div', { class: 'ramp-sw', style: { background: `linear-gradient(90deg, ${getRamp(f.ramp || th.ramp).stops.join(',')})` } });
  b.append(el('h3', { class: 'panel-h' }, 'Colores'), el('div', { class: 'field' }, el('label', {}, 'Paleta para categorías'), ps, sw), el('div', { class: 'field' }, el('label', {}, 'Rampa para cantidades (mapas, calor)'), rs, rsw),
    el('div', { class: 'btn-row' }, el('button', { type: 'button', class: 'btn small', onclick: () => fromImage(E) }, 'Tomar colores de una imagen…')));
  // ---- tipografía
  const fs = el('select', {}, el('option', { value: '' }, `La del estilo (${th.font})`), ...Object.keys(FONTS).map((k) => el('option', { value: k, selected: f.font === k }, k)));
  fs.addEventListener('change', () => { f.font = fs.value; E.changed('tipografía'); });
  const ft = el('select', {}, el('option', { value: '' }, `La del estilo (${th.fontTitle})`), ...Object.keys(FONTS).map((k) => el('option', { value: k, selected: f.fontTitle === k }, k)));
  ft.addEventListener('change', () => { f.fontTitle = ft.value; E.changed('tipografía'); });
  const sc = el('input', { type: 'range', min: 0.7, max: 2.2, step: 0.05, value: f.fontScale || 1 });
  const so = el('output', {}, `${Math.round((f.fontScale || 1) * 100)} %`);
  sc.addEventListener('input', () => { so.textContent = `${Math.round(+sc.value * 100)} %`; });
  sc.addEventListener('change', () => { f.fontScale = +sc.value; E.changed('escala', { left: E.leftTab === 'tesis' }); });
  b.append(el('h3', { class: 'panel-h' }, 'Tipografía'), el('div', { class: 'field-row' }, el('div', { class: 'field' }, el('label', {}, 'Texto'), fs), el('div', { class: 'field' }, el('label', {}, 'Títulos'), ft)), el('div', { class: 'field' }, el('label', {}, 'Tamaño relativo'), el('span', { class: 'range' }, sc, so)));
  // ---- epígrafe
  const cap = f.caption;
  const mode = el('div', { class: 'seg' }, ...[['apa', 'APA'], ['clasico', 'Clásico'], ['titulo', 'Título arriba'], ['ninguno', 'Ninguno']].map(([k, l]) => el('button', { type: 'button', class: cap.mode === k ? 'on' : '', onclick: () => { cap.mode = k; E.changed('epígrafe', { right: true }); } }, l)));
  const inp = (obj, key, ph, multiline = false) => { const i = multiline ? el('textarea', { rows: 2, placeholder: ph }) : el('input', { type: 'text', placeholder: ph }); i.value = obj[key] || ''; i.addEventListener('change', () => { obj[key] = i.value; E.changed('epígrafe'); }); return i; };
  const tbl = Object.values(E.tables)[0];
  b.append(el('h3', { class: 'panel-h' }, 'Título y epígrafe'), mode,
    el('p', { class: 'note' }, cap.mode === 'apa' ? 'APA 7: «Figura N» en negrita y el título en cursiva arriba; «Nota.» con la fuente abajo.' : cap.mode === 'clasico' ? 'Debajo: «Figura N. Título. Fuente: …».' : cap.mode === 'titulo' ? 'Título afirmativo arriba y bajada; la fuente al pie (prensa, pósters, redes).' : 'Solo el gráfico: el epígrafe se escribe en el documento.'),
    cap.mode !== 'ninguno' && cap.mode !== 'titulo' ? el('div', { class: 'field-row' }, el('div', { class: 'field' }, el('label', {}, 'Número'), inp(cap, 'number', '1')), el('div', { class: 'field' }, el('label', {}, ' '), el('label', { class: 'check' }, (() => { const c = el('input', { type: 'checkbox', checked: cap.inside !== false }); c.addEventListener('change', () => { cap.inside = c.checked; E.changed('epígrafe'); }); return c; })(), el('span', {}, 'Dentro de la imagen')))) : null,
    el('div', { class: 'field' }, el('label', {}, 'Título'), inp(f, 'title', cap.mode === 'titulo' ? 'Lo que la figura afirma, en una oración' : 'Qué muestra la figura', true)),
    cap.mode === 'titulo' ? el('div', { class: 'field' }, el('label', {}, 'Bajada'), inp(f, 'subtitle', 'Unidad, lugar y período', true)) : null,
    el('div', { class: 'field' }, el('label', {}, 'Nota'), inp(cap, 'note', 'Aclaraciones: qué miden las barras de error, casos excluidos…', true)),
    el('div', { class: 'field' }, el('label', {}, 'Fuente'), inp(cap, 'source', (tbl && tbl.source && tbl.source.citation) || 'Elaboración propia sobre datos de…', true)),
    el('label', { class: 'check' }, (() => { const c = el('input', { type: 'checkbox', checked: cap.autoNotes !== false }); c.addEventListener('change', () => { cap.autoNotes = c.checked; E.changed('epígrafe'); }); return c; })(), el('span', {}, 'Sumar a la nota las aclaraciones automáticas (qué es la caja, el intervalo, la prueba)')));
  if (tbl && tbl.source && tbl.source.citation && !cap.source) b.appendChild(el('div', { class: 'btn-row' }, el('button', { type: 'button', class: 'btn small', onclick: () => { cap.source = tbl.source.citation; E.changed('fuente', { right: true }); } }, 'Usar la fuente de la tabla')));
  if (f.panels.length > 1) {
    const g = el('input', { type: 'number', class: 'num', min: 0, max: 30, value: f.layout.gap ?? 5 });
    g.addEventListener('change', () => { f.layout.gap = +g.value; E.changed('separación'); });
    const lt = el('input', { type: 'checkbox', checked: f.layout.letters !== false });
    lt.addEventListener('change', () => { f.layout.letters = lt.checked; E.changed('letras'); });
    b.append(el('h3', { class: 'panel-h' }, 'Lámina'), el('div', { class: 'field-row' }, el('div', { class: 'field' }, el('label', {}, 'Separación (mm)'), g), el('div', { class: 'field' }, el('label', {}, ' '), el('label', { class: 'check' }, lt, el('span', {}, 'Letras A, B, C')))));
  }
  // ---- color y simulación
  const gray = el('input', { type: 'checkbox', checked: !!f.gray });
  gray.addEventListener('change', () => { f.gray = gray.checked; E.changed('grises'); });
  const sim = el('select', {}, ...[['', 'Visión típica'], ['gray', 'Fotocopia en grises'], ['proyector', 'Proyector en sala iluminada'], ['deutan', 'Deuteranopía'], ['protan', 'Protanopía'], ['tritan', 'Tritanopía']].map(([k, l]) => el('option', { value: k, selected: (E.sim || '') === k }, l)));
  sim.addEventListener('change', () => { E.sim = sim.value || null; E.renderBoard(); });
  b.append(el('h3', { class: 'panel-h' }, 'Color'), el('label', { class: 'check' }, gray, el('span', {}, 'Figura en escala de grises (también al exportar)')), el('div', { class: 'field' }, el('label', {}, 'Ver la figura como la vería…'), sim), el('p', { class: 'note' }, 'La simulación es solo en pantalla: sirve para revisar que la figura se entienda en cada situación.'));
  // ---- exportar
  E.exp = E.exp || { format: m.format === 'pdf' ? 'pdf' : m.format === 'tiff' ? 'tiff' : 'png' };
  const fmt = el('select', {}, ...FORMATS.map(([k, l]) => el('option', { value: k, selected: E.exp.format === k }, l)));
  fmt.addEventListener('change', () => { E.exp.format = fmt.value; });
  const go = el('button', { type: 'button', class: 'btn primary' }, 'Exportar la figura');
  const msg = el('p', { class: 'export-progress' });
  go.addEventListener('click', async () => {
    go.disabled = true; msg.textContent = 'Preparando…';
    try {
      const r = await exportFigure(f, { tables: E.tables, project: E.project, comma: E.project.meta.decimal !== 'dot' }, { format: E.exp.format });
      downloadBlob(r.blob, r.name);
      msg.textContent = `${r.name}${r.px ? ` · ${r.px[0]} × ${r.px[1]} px` : ''} · ${(r.blob.size / 1048576).toFixed(2)} MB`;
    } catch (e) { console.error(e); msg.textContent = `No se pudo exportar: ${e.message}`; }
    go.disabled = false;
  });
  const copySvg = el('button', { type: 'button', class: 'btn' }, 'Copiar SVG');
  copySvg.addEventListener('click', async () => { try { const { svg } = await figureSVG(f, { tables: E.tables, project: E.project }); await navigator.clipboard.writeText(serialize(svg)); E.toast('SVG copiado: se puede pegar en Inkscape o Illustrator.'); } catch (e) { E.toast('No se pudo copiar.', 'warn'); } });
  b.append(el('h3', { class: 'panel-h' }, 'Exportar'), el('div', { class: 'field' }, fmt), el('div', { class: 'btn-row' }, go, copySvg), msg,
    el('p', { class: 'note' }, 'SVG: vectorial, con las tipografías incrustadas, editable en Inkscape o Illustrator y se inserta en Word. TIFF y PDF: sin pérdida, a la resolución de la calidad elegida.'));
}

async function fromImage(E) {
  const { pickFile } = await import('./importer.js');
  const file = await pickFile('image/*');
  if (!file) return;
  try {
    const url = await readFileAs(file, 'dataurl');
    const groups = await extractPaletteFromImage(url, { k: 9 });
    if (groups.length < 2) { E.toast('No se encontraron colores distinguibles en la imagen.', 'warn'); return; }
    const colors = groups.map((g) => g.color).slice(0, 9);
    const id = `img-${Date.now().toString(36)}`;
    PALETTES.push({ id, name: `De «${file.name}»`, colors });
    E.project.palettes = [...(E.project.palettes || []), { id, name: `De «${file.name}»`, colors }];
    await E.saveProject();
    E.fig.palette = id;
    E.changed('paleta de imagen', { right: true });
    E.toast(`${colors.length} colores tomados de la imagen.`);
  } catch (e) { E.toast(`No se pudo leer la imagen: ${e.message}`, 'error'); }
}

// ---- estilo desde una imagen
const STYLE_FONTS = ['Source Sans 3', 'Source Serif 4', 'Archivo', 'Lato', 'Open Sans', 'Roboto Condensed', 'Merriweather', 'EB Garamond', 'IBM Plex Mono'];
function previewSVG(t) {
  const ns = 'http://www.w3.org/2000/svg';
  const mk = (tag, a) => { const n = document.createElementNS(ns, tag); for (const k in a) n.setAttribute(k, a[k]); return n; };
  const svg = mk('svg', { viewBox: '0 0 320 190', width: '100%' });
  const font = FONTS[t.font] || t.font;
  svg.append(mk('rect', { x: 0, y: 0, width: 320, height: 190, fill: t.bg }));
  if (t.panelBg) svg.append(mk('rect', { x: 34, y: 38, width: 272, height: 120, fill: t.panelBg, rx: 3 }));
  const tt = mk('text', { x: 12, y: 22, fill: t.ink, 'font-family': FONTS[t.fontTitle] || font, 'font-size': 13, 'font-weight': 700 }); tt.textContent = 'Así se vería un gráfico'; svg.append(tt);
  const vals = [0.82, 0.55, 0.68, 0.34, 0.47];
  const cols = (t.paletteColors || []).slice(0, 5);
  const defs = mk('defs', {}); svg.append(defs);
  if (t.gridY) for (let i = 0; i <= 4; i++) svg.append(mk('line', { x1: 34, x2: 306, y1: 158 - i * 30, y2: 158 - i * 30, stroke: t.grid, 'stroke-width': 0.8 }));
  if (t.gridX) for (let i = 0; i <= 5; i++) svg.append(mk('line', { y1: 38, y2: 158, x1: 34 + i * 54.4, x2: 34 + i * 54.4, stroke: t.grid, 'stroke-width': 0.8 }));
  vals.forEach((v, i) => {
    const c = cols[i % Math.max(1, cols.length)] || '#888';
    let fill = c;
    if (t.gradient) { const g = mk('linearGradient', { id: `pg${i}`, x1: 0, x2: 0, y1: 0, y2: 1 }); g.append(mk('stop', { offset: 0, 'stop-color': c }), mk('stop', { offset: 1, 'stop-color': c, 'stop-opacity': 0.35 })); defs.append(g); fill = `url(#pg${i})`; }
    const h = v * 112, x = 48 + i * 52;
    svg.append(mk('rect', { x, y: 158 - h, width: 34, height: h, fill, rx: t.barRadius ? 4 : 0 }));
    const lb = mk('text', { x: x + 17, y: 172, fill: t.muted, 'font-family': font, 'font-size': 9, 'text-anchor': 'middle' }); lb.textContent = ['Norte', 'Sur', 'Este', 'Oeste', 'Centro'][i]; svg.append(lb);
  });
  svg.append(mk('line', { x1: 34, x2: 306, y1: 158, y2: 158, stroke: t.axis, 'stroke-width': 1 }));
  const nt = mk('text', { x: 12, y: 186, fill: t.muted, 'font-family': font, 'font-size': 8 }); nt.textContent = 'Fuente: elaboración propia.'; svg.append(nt);
  return svg;
}

async function styleFromImage(E, editing = null) {
  let a, src = null, fileName = '';
  if (editing) {
    a = { bg: editing.bg, ink: editing.ink, muted: editing.muted, grid: editing.grid, dark: editing.dark, palette: editing.paletteColors || [], gridX: editing.gridX, gridY: editing.gridY, gradient: editing.gradient, glow: editing.glow };
    src = editing.image || null;
  } else {
    const { pickFile } = await import('./importer.js');
    const file = await pickFile('image/*');
    if (!file) return;
    fileName = file.name.replace(/\.[^.]+$/, '');
    try {
      src = await readFileAs(file, 'dataurl');
      E.toast('Leyendo la imagen…');
      a = await analyzeImage(src);
    } catch (e) { E.toast(`No se pudo leer la imagen: ${e.message}`, 'error'); return; }
  }
  // estado editable
  const st = editing ? { ...editing, paletteColors: (editing.paletteColors || []).slice() } : themeFromAnalysis(a, { name: fileName ? `Como «${fileName}»` : 'Estilo propio', font: a.dark ? 'Archivo' : 'Source Sans 3', radius: 0 });
  if (!editing) {
    st.paletteColors = a.palette.slice(0, 8);
    // si la imagen trae pocos colores, se completa con tonos bien distintos para que las categorías no se repitan
    const pool = [...paletteColors(getPalette(a.dark ? 'neon' : 'ensayo'), 8), ...paletteColors(getPalette('okabe'), 8)];
    const far = (c) => st.paletteColors.every((x) => deltaE(hexToRgb(x), hexToRgb(c)) > 28);
    for (const c of pool) { if (st.paletteColors.length >= 6) break; if (far(c)) st.paletteColors.push(c); }
    st.paletteFrom = a.palette.length;
  }
  const prev = el('div', { class: 'isty-prev' });
  const draw = () => { clear(prev); prev.append(previewSVG(st)); };
  const color = (key, label) => { const i = el('input', { type: 'color', value: st[key] }); i.addEventListener('input', () => { st[key] = i.value; if (key === 'muted') st.axis = i.value; draw(); }); return el('label', { class: 'isty-c' }, i, el('span', {}, label)); };
  const palBox = el('div', { class: 'isty-pal' });
  const drawPal = () => {
    clear(palBox);
    st.paletteColors.forEach((c, k) => {
      const i = el('input', { type: 'color', value: c, title: `Color ${k + 1}` });
      i.addEventListener('input', () => { st.paletteColors[k] = i.value; draw(); });
      const x = el('button', { type: 'button', class: 'icon ghost', title: 'Quitar color', onclick: () => { if (st.paletteColors.length > 2) { st.paletteColors.splice(k, 1); drawPal(); draw(); } } }, '×');
      palBox.append(el('span', { class: 'isty-pc' }, i, x));
    });
    if (st.paletteColors.length < 10) palBox.append(el('button', { type: 'button', class: 'btn small ghost', onclick: () => { st.paletteColors.push(st.dark ? '#ffffff' : '#777777'); drawPal(); draw(); } }, '+ color'));
  };
  const chk = (key, label) => { const c = el('input', { type: 'checkbox', checked: !!st[key] }); c.addEventListener('change', () => { st[key] = c.checked; draw(); }); return el('label', { class: 'check' }, c, el('span', {}, label)); };
  const rad = el('input', { type: 'checkbox', checked: !!st.barRadius });
  rad.addEventListener('change', () => { st.barRadius = rad.checked ? 2 : 0; draw(); });
  const fsel = (key) => { const s = el('select', {}, ...STYLE_FONTS.map((k) => el('option', { value: k, selected: st[key] === k }, k))); s.addEventListener('change', () => { st[key] = s.value; draw(); }); return s; };
  const name = el('input', { type: 'text', value: st.name });
  const hints = [];
  if (!editing) {
    hints.push(a.dark ? 'Fondo oscuro: pensado para pantalla; para imprimir conviene la versión clara.' : 'Fondo claro.');
    if (a.gridX && !a.gridY) hints.push('Grilla vertical: la imagen parece de barras horizontales, rangos o puntos; elegí esos tipos de gráfico.');
    else if (a.gridY && !a.gridX) hints.push('Grilla horizontal: típica de columnas, líneas o áreas.');
    else if (!a.gridX && !a.gridY) hints.push('Sin grilla visible: rótulos directos sobre las marcas.');
    if (a.gradient) hints.push('Hay degradés' + (a.glow ? ' y brillo' : '') + '.');
    hints.push('La tipografía no se puede leer con certeza desde una imagen: elegila abajo mirando la vista previa.');
  }
  const body = el('div', { class: 'isty' },
    el('div', { class: 'isty-l' }, src ? el('img', { src, class: 'isty-img', alt: 'Imagen de referencia' }) : null, prev, hints.length ? el('ul', { class: 'note isty-h' }, ...hints.map((h) => el('li', {}, h))) : null),
    el('div', { class: 'isty-r' },
      el('div', { class: 'field' }, el('label', {}, 'Nombre del estilo'), name),
      el('div', { class: 'field' }, el('label', {}, 'Colores de base'), el('div', { class: 'isty-cs' }, color('bg', 'Fondo'), color('ink', 'Tinta'), color('muted', 'Rótulos'), color('grid', 'Grilla'))),
      el('div', { class: 'field' }, el('label', {}, 'Paleta para categorías (por orden de importancia en la imagen)'), palBox, !editing && a.palette.length < st.paletteColors.length ? el('p', { class: 'note' }, `La imagen tiene ${a.palette.length} colores; se agregaron ${st.paletteColors.length - a.palette.length} afines para cuando haya más categorías.`) : null),
      el('div', { class: 'field' }, el('label', {}, 'Grilla y marcas'), chk('gridY', 'Líneas horizontales'), chk('gridX', 'Líneas verticales'), chk('gradient', 'Degradés en barras y áreas'), chk('glow', 'Brillo (pantalla)'), el('label', { class: 'check' }, rad, el('span', {}, 'Barras redondeadas'))),
      el('div', { class: 'field-row' }, el('div', { class: 'field' }, el('label', {}, 'Texto'), fsel('font')), el('div', { class: 'field' }, el('label', {}, 'Títulos'), fsel('fontTitle')))));
  draw(); drawPal();
  const ok = await formDialog({ title: editing ? 'Editar estilo' : 'Estilo desde una imagen', body, ok: editing ? 'Guardar cambios' : 'Guardar y aplicar', wide: true, validate: () => (name.value.trim() ? true : 'Poné un nombre.') });
  if (!ok) return;
  st.name = name.value.trim();
  st.palette = st.id;
  st.dark = (() => { const h = st.bg.replace('#', ''); const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b0 = parseInt(h.slice(4, 6), 16); return (0.2126 * r + 0.7152 * g + 0.0722 * b0) / 255 < 0.4; })();
  if (src && src.length < 400000) st.image = src; // miniatura para volver a editar
  else if (src) st.image = await shrink(src);
  const list = (E.project.styles || []).filter((x) => x.id !== st.id);
  E.project.styles = [...list, st];
  // reemplaza en la sesión
  const ti = THEMES.findIndex((t) => t.id === st.id); if (ti >= 0) THEMES.splice(ti, 1);
  const pi = PALETTES.findIndex((p) => p.id === st.id); if (pi >= 0) PALETTES.splice(pi, 1);
  registerProjectStyles(E.project);
  await E.saveProject();
  E.fig.style = st.id; E.fig.palette = ''; E.fig.ramp = ''; E.fig.font = ''; E.fig.fontTitle = '';
  E.changed('estilo de imagen', { right: true, left: E.leftTab !== 'datos' });
  E.toast(editing ? 'Estilo actualizado.' : `Estilo «${st.name}» guardado en el proyecto y aplicado.`);
}
async function shrink(src) {
  const im = await new Promise((r, j) => { const i = new Image(); i.onload = () => r(i); i.onerror = j; i.src = src; });
  const sc = Math.min(1, 720 / Math.max(im.width, im.height));
  const c = document.createElement('canvas'); c.width = Math.round(im.width * sc); c.height = Math.round(im.height * sc);
  c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.82);
}
async function removeStyle(E, t) {
  const used = E.figures.filter((x) => x.style === t.id && x.id !== E.fig.id).length;
  if (!(await confirmDialog({ title: `¿Quitar «${t.name}»?`, text: used ? `Otras ${used} figuras lo usan: pasarán al estilo Tesis.` : 'La figura pasa al estilo Tesis.', ok: 'Quitar', danger: true }))) return;
  E.project.styles = (E.project.styles || []).filter((x) => x.id !== t.id);
  const ti = THEMES.findIndex((x) => x.id === t.id); if (ti >= 0) THEMES.splice(ti, 1);
  await E.saveProject();
  E.fig.style = 'tesis';
  E.changed('quitar estilo', { right: true });
}
