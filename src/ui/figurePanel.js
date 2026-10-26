// Panel derecho: destino de la figura (tamaño, resolución), estilo, paleta, tipografía, epígrafe, color o grises,
// simulación de visión y exportación.
import { el, clear, downloadBlob, readFileAs } from '../util.js';
import { MEDIA, QUALITIES, getMedia, exportDpi } from '../figure/media.js';
import { THEMES, getTheme, FONTS } from '../charts/themes.js';
import { PALETTES, RAMPS, paletteColors, getPalette, extractPaletteFromImage, getRamp, rampColors } from '../palette.js';
import { exportFigure, FORMATS, figureSVG, serialize } from '../figure/export.js';

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
  b.append(el('h3', { class: 'panel-h' }, 'Estilo'), sty, el('p', { class: 'note' }, getTheme(f.style).desc));
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
