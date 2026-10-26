// Edición directa sobre la figura: tocar un texto, una barra, un eje o la leyenda abre un editor en el lugar;
// doble clic agrega una nota; las notas se arrastran con el mouse.
import { el, clear, uid } from '../util.js';
import { UNIT_SYSTEMS } from '../charts/core.js';
import { scaledTheme } from '../charts/figure.js';
import { getPalette, paletteColors } from '../palette.js';
import { levelsOf } from '../data/table.js';

let pop = null;
export function closePop() { if (!pop) return; const p0 = pop; pop = null; document.removeEventListener('mousedown', outside, true); try { p0.remove(); } catch (e) { /* ya quitado */ } }
function outside(e) { if (pop && !pop.contains(e.target)) closePop(); }
function openPop(x, y, title, ...children) {
  closePop();
  pop = el('div', { class: 'pop', role: 'dialog', 'aria-label': title }, el('div', { class: 'pop-h' }, el('strong', {}, title), el('button', { type: 'button', class: 'icon ghost', 'aria-label': 'Cerrar', onclick: closePop }, '×')), ...children);
  document.body.appendChild(pop);
  const r = pop.getBoundingClientRect();
  pop.style.left = `${Math.max(8, Math.min(window.innerWidth - r.width - 8, x + 10))}px`;
  pop.style.top = `${Math.max(8, Math.min(window.innerHeight - r.height - 8, y + 10))}px`;
  setTimeout(() => document.addEventListener('mousedown', outside, true), 0);
  const f = pop.querySelector('input[type=text], textarea');
  if (f) setTimeout(() => { f.focus(); f.select && f.select(); }, 20);
  return pop;
}
const row = (...n) => el('div', { class: 'pop-row' }, ...n);
const lab = (t, c) => el('label', { class: 'pop-f' }, el('span', {}, t), c);

function svgPoint(svg, e) {
  const pt = svg.createSVGPoint();
  pt.x = e.clientX; pt.y = e.clientY;
  return pt.matrixTransform(svg.getScreenCTM().inverse());
}
const boxOf = (g) => { const b = (g.getAttribute('data-box') || '0,0,1,1').split(',').map(Number); return { x: b[0], y: b[1], w: b[2], h: b[3] }; };

let drag = null, moved = false, arrowFor = null, curSvg = null, curE = null;
let winBound = false;
function bindWindow() {
  if (winBound) return;
  winBound = true;
  window.addEventListener('mousemove', (e) => {
    if (!drag || !curSvg) return;
    const p = svgPoint(curSvg, e);
    const dx = (p.x - drag.p0.x) / drag.box.w, dy = (p.y - drag.p0.y) / drag.box.h;
    if (Math.abs(dx) + Math.abs(dy) > 0.004) moved = true;
    drag.node.setAttribute('transform', `translate(${p.x - drag.p0.x},${p.y - drag.p0.y})`);
    drag.dx = dx; drag.dy = dy;
  });
  window.addEventListener('mouseup', () => {
    if (!drag) return;
    const d = drag; drag = null;
    if (moved && d.dx != null) { d.a.x = +(d.x0 + d.dx).toFixed(4); d.a.y = +(d.y0 + d.dy).toFixed(4); curE.changed('mover nota'); }
  });
}
export function attachDirect(E, svg) {
  curSvg = svg; curE = E;
  bindWindow();
  const panelOf = (t, e = null) => {
    let g = t.closest('[data-panel]');
    if (!g && e) { const pt = svgPoint(svg, e); g = [...svg.querySelectorAll('[data-panel]')].find((q) => { const b = boxOf(q); return pt.x >= b.x && pt.x <= b.x + b.w && pt.y >= b.y && pt.y <= b.y + b.h; }) || null; }
    if (!g) return null;
    const i = E.fig.panels.findIndex((p) => p.id === g.getAttribute('data-panel'));
    return i >= 0 ? { g, i, p: E.fig.panels[i] } : null;
  };
  const select = (pi) => { if (pi && pi.i !== E.activePanel) { E.activePanel = pi.i; if (E.leftTab !== 'graf') E.leftTab = 'graf'; E.renderLeft(); } };

  svg.addEventListener('mousedown', (e) => {
    const an = e.target.closest('[data-anno]');
    const pi = panelOf(e.target);
    if (!an || !pi) return;
    e.preventDefault();
    const a = (pi.p.annotations || []).find((q) => q.id === an.getAttribute('data-anno'));
    if (!a) return;
    const p0 = svgPoint(svg, e);
    drag = { a, pi, p0, x0: a.x, y0: a.y, box: boxOf(pi.g), node: an };
    moved = false;
  });
  svg.addEventListener('click', (e) => {
    if (moved) { moved = false; return; }
    const pi = panelOf(e.target, e);
    const t = e.target;
    // modo «poné la punta de la flecha»
    if (arrowFor && pi && pi.p === arrowFor.p) {
      const b = boxOf(pi.g), pt = svgPoint(svg, e);
      arrowFor.a.ax = +((pt.x - b.x) / b.w).toFixed(4); arrowFor.a.ay = +((pt.y - b.y) / b.h).toFixed(4);
      arrowFor = null; svg.classList.remove('picking'); E.changed('flecha'); return;
    }
    select(pi);
    const an = t.closest('[data-anno]');
    if (an && pi) return annoPop(E, e, pi.p, an.getAttribute('data-anno'), (a) => { arrowFor = { a, p: pi.p }; svg.classList.add('picking'); E.toast('Tocá en el gráfico dónde apunta la flecha.'); });
    const ed = t.closest('[data-edit]');
    if (ed) return textPop(E, e, ed.getAttribute('data-edit'), pi && pi.p);
    const cat = t.closest('[data-cat]');
    if (cat && pi) return catPop(E, e, pi.p, cat.getAttribute('data-cat'));
    const ax = t.closest('[data-axis]');
    if (ax && pi) return axisPop(E, e, pi.p, ax.getAttribute('data-axis'));
    const lg = t.closest('[data-legend]');
    if (lg && pi) return legendPop(E, e, pi.p);
    closePop();
  });
  svg.addEventListener('dblclick', (e) => {
    const pi = panelOf(e.target, e);
    if (!pi || e.target.closest('[data-anno]')) return;
    const b = boxOf(pi.g), pt = svgPoint(svg, e);
    const a = { id: uid('N'), x: +((pt.x - b.x) / b.w).toFixed(4), y: +((pt.y - b.y) / b.h).toFixed(4), text: 'Nota', size: 1.1 };
    pi.p.annotations = [...(pi.p.annotations || []), a];
    E.changed('nota');
    setTimeout(() => annoPop(E, e, pi.p, a.id), 60);
  });
}

// ---------- editores ----------
function getPath(E, path, panel) {
  const f = E.fig;
  switch (path) {
    case 'fig.title': return f.title || '';
    case 'fig.subtitle': return f.subtitle || '';
    case 'fig.caption.number': return (f.caption && f.caption.number) || '1';
    case 'panel.title': return (panel && panel.title) || '';
    case 'opt.xTitle': return (panel && panel.options && panel.options.xTitle) || '';
    case 'opt.yTitle': return (panel && panel.options && panel.options.yTitle) || '';
    default: return '';
  }
}
function setPath(E, path, panel, v) {
  const f = E.fig;
  if (path === 'fig.title') f.title = v;
  else if (path === 'fig.subtitle') f.subtitle = v;
  else if (path === 'fig.caption.number') f.caption.number = v;
  else if (path === 'panel.title' && panel) panel.title = v;
  else if (path.startsWith('opt.') && panel) { panel.options = panel.options || {}; const k = path.slice(4); if (v === '') delete panel.options[k]; else panel.options[k] = v; }
}
const NAMES = { 'fig.title': 'Título de la figura', 'fig.subtitle': 'Bajada', 'fig.caption.number': 'Número de la figura', 'panel.title': 'Título del panel', 'opt.xTitle': 'Título del eje horizontal', 'opt.yTitle': 'Título del eje vertical' };
function textPop(E, e, path, panel) {
  if (path === 'caption') {
    const c = E.fig.caption;
    const note = el('textarea', { rows: 3 }, c.note || ''), src = el('textarea', { rows: 2 }, c.source || '');
    const auto = el('input', { type: 'checkbox', checked: c.autoNotes !== false });
    const ok = () => { c.note = note.value; c.source = src.value; c.autoNotes = auto.checked; E.changed('epígrafe', { right: true }); closePop(); };
    openPop(e.clientX, e.clientY, 'Nota y fuente', lab('Nota', note), lab('Fuente', src), el('label', { class: 'check' }, auto, el('span', {}, 'Sumar las aclaraciones automáticas')), row(el('button', { type: 'button', class: 'btn small primary', onclick: ok }, 'Aplicar')));
    return;
  }
  const long = path === 'fig.title' || path === 'fig.subtitle';
  const inp = long ? el('textarea', { rows: 2 }, getPath(E, path, panel)) : el('input', { type: 'text', value: getPath(E, path, panel) });
  const ok = () => { setPath(E, path, panel, inp.value.trim()); E.changed('texto', { right: path.startsWith('fig.'), left: !path.startsWith('fig.') }); closePop(); };
  inp.addEventListener('keydown', (k) => { if (k.key === 'Enter' && !k.shiftKey) { k.preventDefault(); ok(); } if (k.key === 'Escape') closePop(); });
  const extra = [];
  if (path.startsWith('fig.')) {
    const sc = el('input', { type: 'range', min: 0.7, max: 2.2, step: 0.05, value: E.fig.fontScale || 1 });
    sc.addEventListener('change', () => { E.fig.fontScale = +sc.value; E.changed('tamaño'); });
    extra.push(lab('Tamaño de toda la tipografía', sc));
  }
  openPop(e.clientX, e.clientY, NAMES[path] || 'Texto', inp, ...extra, row(el('button', { type: 'button', class: 'btn small primary', onclick: ok }, 'Aplicar'), path.startsWith('opt.') ? el('button', { type: 'button', class: 'btn small', onclick: () => { inp.value = ''; ok(); } }, 'Automático') : null));
}
function catPop(E, e, panel, cat) {
  const o = panel.options || (panel.options = {});
  const t = E.tables[panel.tableId];
  const key = panel.enc && (panel.enc.color || (['pie', 'waffle', 'treemap', 'kpi', 'progress', 'radialbar', 'sunburst', 'marimekko'].includes(panel.type) ? panel.enc.x : null));
  const single = !key;
  const { th } = scaledTheme(E.fig);
  const pal = getPalette(o.palette || E.fig.palette || th.palette) || getPalette('okabe');
  let cur = single ? o.color : (o.colors || {})[cat];
  if (!cur && key && t) { const lv = levelsOf(t, key); cur = paletteColors(pal, lv.length)[Math.max(0, lv.indexOf(cat))]; }
  if (!cur) cur = paletteColors(pal, 1)[0];
  const ci = el('input', { type: 'color', value: cur });
  ci.addEventListener('change', () => { if (single) o.color = ci.value; else o.colors = { ...(o.colors || {}), [cat]: ci.value }; E.changed('color', { left: true }); });
  const swatches = el('div', { class: 'pop-sw' }, ...paletteColors(pal, 8).map((c) => el('button', { type: 'button', style: { background: c }, title: c, onclick: () => { ci.value = c; ci.dispatchEvent(new Event('change')); } })));
  const hl = el('button', { type: 'button', class: `btn small ${o.highlight === cat ? 'active' : ''}`, onclick: () => { o.highlight = o.highlight === cat ? undefined : cat; if (!o.highlight) delete o.highlight; E.changed('destacar', { left: true }); closePop(); } }, o.highlight === cat ? 'Dejar de destacar' : 'Destacar (las demás en gris)');
  const hide = el('button', { type: 'button', class: 'btn small', onclick: () => { o.hideLevels = [...new Set([...(o.hideLevels || []), cat])]; E.changed('ocultar', { left: true }); closePop(); } }, 'Ocultar');
  openPop(e.clientX, e.clientY, single ? 'Color de la serie' : `«${cat}»`, lab('Color', ci), swatches, row(hl, single ? null : hide), (o.hideLevels || []).length ? row(el('button', { type: 'button', class: 'btn small ghost', onclick: () => { delete o.hideLevels; E.changed('mostrar', { left: true }); closePop(); } }, `Mostrar las ocultas (${o.hideLevels.length})`)) : null);
}
function axisPop(E, e, panel, axis) {
  const o = panel.options || (panel.options = {});
  const P = axis === 'y' ? 'y' : 'x';
  const num = (k, ph) => { const i = el('input', { type: 'text', inputmode: 'decimal', value: o[k] ?? '', placeholder: ph }); i.addEventListener('change', () => { const v = i.value.trim().replace(',', '.'); if (v === '') delete o[k]; else if (Number.isFinite(+v)) o[k] = +v; E.changed('eje', { left: true }); }); return i; };
  const lg = el('input', { type: 'checkbox', checked: !!o[`${P}Log`] });
  lg.addEventListener('change', () => { o[`${P}Log`] = lg.checked; E.changed('eje', { left: true }); });
  const z = el('input', { type: 'checkbox', checked: !!o[`${P}Zero`] });
  z.addEventListener('change', () => { o[`${P}Zero`] = z.checked; E.changed('eje', { left: true }); });
  const us = el('select', {}, ...UNIT_SYSTEMS.map(([k, l]) => el('option', { value: k, selected: (o[`${P}Units`] || '') === k }, l)));
  us.addEventListener('change', () => { if (us.value) o[`${P}Units`] = us.value; else delete o[`${P}Units`]; E.changed('eje', { left: true }); });
  const tt = el('input', { type: 'text', value: o[`${P}Title`] || '', placeholder: 'automático' });
  tt.addEventListener('change', () => { if (tt.value.trim()) o[`${P}Title`] = tt.value.trim(); else delete o[`${P}Title`]; E.changed('eje', { left: true }); });
  openPop(e.clientX, e.clientY, axis === 'y' ? 'Eje vertical' : 'Eje horizontal', row(lab('Mínimo', num(`${P}Min`, 'auto')), lab('Máximo', num(`${P}Max`, 'auto'))), lab('Título', tt), lab('Unidades', us), el('label', { class: 'check' }, z, el('span', {}, 'Incluir el cero')), el('label', { class: 'check' }, lg, el('span', {}, 'Escala logarítmica')));
}
function legendPop(E, e, panel) {
  const o = panel.options || (panel.options = {});
  const seg = el('div', { class: 'seg' }, ...[['auto', 'Auto'], ['right', 'Derecha'], ['bottom', 'Abajo'], ['top', 'Arriba'], ['none', 'Sin']].map(([k, l]) => el('button', { type: 'button', class: (o.legend || 'auto') === k ? 'on' : '', onclick: () => { o.legend = k; E.changed('leyenda', { left: true }); closePop(); } }, l)));
  const tt = el('input', { type: 'text', value: o.legendTitle || '', placeholder: 'el nombre de la variable' });
  tt.addEventListener('change', () => { if (tt.value.trim()) o.legendTitle = tt.value.trim(); else delete o.legendTitle; E.changed('leyenda'); });
  openPop(e.clientX, e.clientY, 'Leyenda', lab('Posición', seg), lab('Título', tt), el('p', { class: 'pop-hint' }, 'Tocá un color de la leyenda para cambiarlo, destacarlo u ocultarlo.'));
}
function annoPop(E, e, panel, id, startArrow) {
  const a = (panel.annotations || []).find((q) => q.id === id);
  if (!a) return;
  const ta = el('textarea', { rows: 3 }, a.text || '');
  ta.addEventListener('input', () => { a.text = ta.value; });
  ta.addEventListener('change', () => E.changed('nota'));
  const sz = el('input', { type: 'range', min: 0.7, max: 3, step: 0.1, value: a.size || 1.1 });
  sz.addEventListener('change', () => { a.size = +sz.value; E.changed('nota'); });
  const col = el('input', { type: 'color', value: a.color || '#1c2329' });
  col.addEventListener('change', () => { a.color = col.value; E.changed('nota'); });
  const tog = (k, label) => { const c = el('input', { type: 'checkbox', checked: !!a[k] }); c.addEventListener('change', () => { a[k] = c.checked; E.changed('nota'); }); return el('label', { class: 'check' }, c, el('span', {}, label)); };
  openPop(e.clientX, e.clientY, 'Nota', ta, row(lab('Tamaño', sz), lab('Color', col)), row(tog('bold', 'Negrita'), tog('italic', 'Cursiva'), tog('serif', 'Serif')),
    row(startArrow ? el('button', { type: 'button', class: 'btn small', onclick: () => { closePop(); startArrow(a); } }, a.ax != null ? 'Mover la flecha' : 'Agregar flecha') : null,
      a.ax != null ? el('button', { type: 'button', class: 'btn small', onclick: () => { delete a.ax; delete a.ay; E.changed('nota'); closePop(); } }, 'Quitar flecha') : null,
      el('button', { type: 'button', class: 'btn small danger', onclick: () => { panel.annotations = panel.annotations.filter((q) => q.id !== id); E.changed('nota'); closePop(); } }, 'Borrar')),
    el('p', { class: 'pop-hint' }, 'Arrastrá la nota para moverla. Enter hace un renglón nuevo.'));
}
export { clear };
