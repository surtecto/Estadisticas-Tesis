// Piezas comunes de los gráficos: medición de texto, ejes, grilla, leyendas, colores que siguen a la categoría,
// tramas para blanco y negro, degradés, formato de números y agregación.
import * as d3 from 'd3';
import { svgEl, hexToRgb, rgbToHex, mixHex, toGrayHex } from '../util.js';
import { paletteColors, getPalette, getRamp, rampColor } from '../palette.js';
import { fontStack } from './themes.js';
import { colIndex, getCol, levelsOf, aggregate, dateToTime } from '../data/table.js';

// ---------- texto ----------
let _cv = null;
export function textWidth(str, size, family = 'Source Sans 3', weight = 400) {
  const s = String(str ?? '');
  if (typeof document === 'undefined') return s.length * size * 0.52;
  if (!_cv) _cv = document.createElement('canvas').getContext('2d');
  _cv.font = `${weight} ${size}px ${fontStack(family)}`;
  return _cv.measureText(s).width;
}
// corta en líneas según un ancho
export function wrapText(str, size, maxW, family, weight = 400, maxLines = 3) {
  const words = String(str ?? '').split(/\s+/).filter(Boolean);
  const lines = [];
  let cur = '';
  for (const w of words) {
    const t = cur ? `${cur} ${w}` : w;
    if (textWidth(t, size, family, weight) <= maxW || !cur) cur = t;
    else { lines.push(cur); cur = w; }
  }
  if (cur) lines.push(cur);
  if (lines.length > maxLines) { const keep = lines.slice(0, maxLines); keep[maxLines - 1] = keep[maxLines - 1].replace(/\s*\S*$/, '') + '…'; return keep; }
  return lines;
}
export function fitText(str, size, maxW, family, weight = 400) {
  let s = String(str ?? '');
  if (textWidth(s, size, family, weight) <= maxW) return s;
  while (s.length > 4 && textWidth(s + '…', size, family, weight) > maxW) s = s.slice(0, -1);
  return s.trimEnd() + '…';
}
export function text(g, x, y, str, { size, fill, family, weight = 400, anchor = 'start', baseline = 'alphabetic', rotate = 0, italic = false, upper = false, cls = null, letterSpacing = null } = {}) {
  const t = svgEl('text', {
    x, y, 'font-size': size, fill, 'font-family': fontStack(family), 'font-weight': weight, 'text-anchor': anchor,
    'dominant-baseline': baseline === 'alphabetic' ? null : baseline, transform: rotate ? `rotate(${rotate} ${x} ${y})` : null, 'font-style': italic ? 'italic' : null, class: cls,
    'letter-spacing': letterSpacing,
  }, g);
  t.textContent = upper ? String(str).toUpperCase() : String(str ?? '');
  return t;
}
export function multiline(g, x, y, lines, opts) {
  const lh = opts.size * (opts.lineHeight || 1.2);
  lines.forEach((l, i) => text(g, x, y + i * lh, l, opts));
  return lines.length * lh;
}

// ---------- números ----------
export function makeFormat({ comma = true, pct = false, decimals = null, compact = true, unit = '' } = {}) {
  const loc = d3.formatLocale({ decimal: comma ? ',' : '.', thousands: comma ? '.' : ',', grouping: [3], currency: ['$', ''], percent: ' %' });
  return (v, step = null) => {
    if (v == null || !Number.isFinite(v)) return '';
    let d = decimals;
    if (d == null) {
      const ref = step != null ? Math.abs(step) : Math.abs(v);
      d = ref === 0 ? 0 : ref >= 10 ? 0 : ref >= 1 ? (Number.isInteger(v) ? 0 : 1) : Math.min(4, Math.ceil(-Math.log10(ref)) + (step != null ? 0 : 1));
    }
    if (pct) return loc.format(`.${Math.max(0, (d ?? 0))}f`)(v) + ' %';
    const a = Math.abs(v);
    if (compact && a >= 1e6) return loc.format(`.${a >= 1e7 ? 0 : 1}f`)(v / 1e6).replace(/[,.]0$/, '') + ' M';
    const f = loc.format(`,.${Math.max(0, d)}f`)(v);
    return unit ? `${f} ${unit}` : f;
  };
}

// ---------- color ----------
export function categoricalColors(th, panel, n) {
  const pid = (panel && panel.options && panel.options.palette) || th.paletteId || th.palette;
  const pal = getPalette(pid) || getPalette('okabe');
  return paletteColors(pal, Math.max(1, n));
}
// la categoría conserva su color aunque un filtro la deje sola (el color sigue a la entidad, no a su posición)
export function colorScale(ctx, key, levelsShown) {
  const all = key ? levelsOf(ctx.table, key) : ['__'];
  const custom = (ctx.panel.options && ctx.panel.options.colors) || {};
  const base = categoricalColors(ctx.th, ctx.panel, all.length);
  const hl = ctx.opt.highlight;
  return (lvl) => {
    const i = all.indexOf(String(lvl));
    let c = custom[String(lvl)] || base[i >= 0 ? i % base.length : 0];
    if (hl && String(lvl) !== hl) c = ctx.th.dark ? mixHex(c, ctx.th.bg, 0.72) : mixHex(toGrayHex(c), '#ffffff', 0.45);
    return ctx.gray ? toGrayHex(c) : c;
  };
}
export function singleColor(ctx) {
  const c = (ctx.opt.color) || categoricalColors(ctx.th, ctx.panel, 1)[0];
  return ctx.gray ? toGrayHex(c) : c;
}
export function seqColor(ctx, t) {
  const r = getRamp((ctx.opt.ramp) || ctx.th.ramp);
  const c = rampColor(r, t);
  return ctx.gray ? toGrayHex(c) : c;
}
// relleno con degradé (estilo neón e infografía) o trama (blanco y negro)
export function fillFor(ctx, color, idx = 0, dir = 'v') {
  if (ctx.th.patterns && idx > 0) return patternFill(ctx, color, idx);
  if (!ctx.th.gradient) return color;
  const id = `${ctx.uid}-gr-${color.replace('#', '')}-${dir}`;
  if (!ctx.defs.querySelector(`#${CSS.escape(id)}`)) {
    const lg = svgEl('linearGradient', { id, x1: 0, y1: dir === 'v' ? 1 : 0, x2: dir === 'v' ? 0 : 1, y2: 0 }, ctx.defs);
    svgEl('stop', { offset: '0%', 'stop-color': mixHex(color, ctx.th.bg, 0.35) }, lg);
    svgEl('stop', { offset: '100%', 'stop-color': color }, lg);
  }
  return `url(#${id})`;
}
const PATTERNS = ['solid', 'diag', 'cross', 'dots', 'horiz', 'vert', 'diag2', 'grid'];
export function patternFill(ctx, color, idx) {
  const kind = PATTERNS[idx % PATTERNS.length];
  if (kind === 'solid') return color;
  const id = `${ctx.uid}-pt-${kind}-${color.replace('#', '')}`;
  if (!ctx.defs.querySelector(`#${CSS.escape(id)}`)) {
    const s = 3.2;
    const p = svgEl('pattern', { id, patternUnits: 'userSpaceOnUse', width: s, height: s, patternTransform: kind === 'diag' ? 'rotate(45)' : kind === 'diag2' ? 'rotate(-45)' : null }, ctx.defs);
    svgEl('rect', { width: s, height: s, fill: mixHex(color, '#ffffff', 0.7) }, p);
    const st = { stroke: color, 'stroke-width': 0.7 };
    if (kind === 'diag' || kind === 'diag2' || kind === 'vert') svgEl('line', { x1: 0, y1: 0, x2: 0, y2: s, ...st }, p);
    if (kind === 'horiz') svgEl('line', { x1: 0, y1: s / 2, x2: s, y2: s / 2, ...st }, p);
    if (kind === 'cross' || kind === 'grid') { svgEl('line', { x1: 0, y1: s / 2, x2: s, y2: s / 2, ...st }, p); svgEl('line', { x1: s / 2, y1: 0, x2: s / 2, y2: s, ...st }, p); }
    if (kind === 'dots') svgEl('circle', { cx: s / 2, cy: s / 2, r: 0.7, fill: color }, p);
  }
  return `url(#${id})`;
}
export function glowFilter(ctx) {
  if (!ctx.th.glow) return null;
  const id = `${ctx.uid}-glow`;
  if (!ctx.defs.querySelector(`#${CSS.escape(id)}`)) {
    const f = svgEl('filter', { id, x: '-30%', y: '-30%', width: '160%', height: '160%' }, ctx.defs);
    svgEl('feGaussianBlur', { stdDeviation: 1.6, result: 'b' }, f);
    const m = svgEl('feMerge', {}, f);
    svgEl('feMergeNode', { in: 'b' }, m); svgEl('feMergeNode', { in: 'SourceGraphic' }, m);
  }
  return `url(#${id})`;
}
export const readableOn = (bg) => { const [r, g, b] = hexToRgb(bg); return 0.299 * r + 0.587 * g + 0.114 * b > 150 ? '#111111' : '#ffffff'; };

// ---------- datos ----------
export function enc(ctx, k) {
  const key = ctx.panel.enc && ctx.panel.enc[k];
  if (!key) return null;
  const j = colIndex(ctx.table, key);
  if (j < 0) return null;
  return { key, j, col: ctx.table.columns[j], name: ctx.table.columns[j].name };
}
export const valOf = (e, r) => (e ? r[e.j] : null);
export function timeValue(e, v) {
  if (v == null) return null;
  if (e.col.type === 'date') return new Date(dateToTime(v));
  return +v;
}
// agrupa filas por claves y agrega el valor
export function groupAgg(rows, keyFns, valFn, how) {
  const m = new Map();
  for (const r of rows) {
    const ks = keyFns.map((f) => f(r));
    if (ks.some((k) => k == null)) continue;
    const id = ks.join('\u0001');
    if (!m.has(id)) m.set(id, { keys: ks, vals: [] });
    m.get(id).vals.push(valFn ? valFn(r) : 1);
  }
  const out = [];
  for (const g of m.values()) out.push({ keys: g.keys, value: how === 'count' ? g.vals.length : aggregate(g.vals, how), vals: g.vals });
  return out;
}
export function levelsIn(ctx, e, rows) {
  const all = levelsOf(ctx.table, e.key);
  const present = new Set(rows.map((r) => r[e.j]).filter((v) => v != null).map(String));
  let lv = all.filter((l) => present.has(l));
  const hidden = (ctx.opt.hideLevels || []).map(String);
  if (hidden.length) lv = lv.filter((l) => !hidden.includes(l));
  return lv;
}

// ---------- ejes ----------
export function niceLinear(domain, n, { zero = false, min = null, max = null, log = false } = {}) {
  let [a, b] = domain;
  if (!Number.isFinite(a) || !Number.isFinite(b)) { a = 0; b = 1; }
  if (zero && !log) { a = Math.min(0, a); b = Math.max(0, b); }
  if (a === b) { a -= Math.abs(a) * 0.1 || 1; b += Math.abs(b) * 0.1 || 1; }
  if (min != null && min !== '' && Number.isFinite(+min)) a = +min;
  if (max != null && max !== '' && Number.isFinite(+max)) b = +max;
  if (log) { a = Math.max(a, 1e-9); const s = d3.scaleLog().domain([a, b]).nice(); return s; }
  const s = d3.scaleLinear().domain([a, b]);
  if (min == null || min === '' || max == null || max === '') s.nice(n);
  return s;
}
function tickFmt(ctx, axis) {
  const o = ctx.opt;
  return makeFormat({ comma: ctx.comma, pct: axis === 'y' ? o.yPct : o.xPct, decimals: axis === 'y' ? (o.yDecimals ?? null) : (o.xDecimals ?? null) });
}
// Calcula el área de dibujo dejando lugar para rótulos y títulos de los ejes
export function layoutPlot(ctx, box, { y, x, yTitle, xTitle, xBand = null, yBand = null, yLabels = null, xLabels = null, yTicks = null, xTicks = null }) {
  const th = ctx.th, fs = th.sizes;
  const tick = fs.tick, tl = ctx.tickLen;
  const yfmt = tickFmt(ctx, 'y'), xfmt = tickFmt(ctx, 'x');
  let left, right = ctx.pad * 0.6, top = ctx.pad * 0.6, bottom;
  const yl = yLabels || (yTicks || []).map((v, i, a) => yfmt(v, a.length > 1 ? a[1] - a[0] : null));
  const ylW = Math.max(0, ...yl.map((s) => textWidth(s, tick, th.font)));
  left = ylW + tl + tick * 0.5 + (yTitle ? fs.axis * 1.5 : 0);
  if (yBand) left = Math.min(left, box.w * 0.42);
  const w0 = box.w - left - right;
  // rótulos del eje x: horizontales, en dos líneas o inclinados
  let xRot = 0, xLines = 1, xlH = tick * 1.25;
  const xl = xLabels || (xTicks || []).map((v, i, a) => xfmt(v, a.length > 1 ? a[1] - a[0] : null));
  if (xBand && xl.length) {
    const slot = w0 / xl.length;
    const maxW = Math.max(...xl.map((s) => textWidth(s, tick, th.font)));
    if (maxW > slot * 0.95) {
      const wrapped = xl.map((s) => wrapText(s, tick, slot * 0.95, th.font, 400, 3));
      const fits = wrapped.every((ls) => ls.every((l) => textWidth(l, tick, th.font) <= slot * 0.98));
      if (fits && Math.max(...wrapped.map((l) => l.length)) <= 3) { xLines = Math.max(...wrapped.map((l) => l.length)); xlH = tick * 1.2 * xLines + tick * 0.1; }
      else { xRot = -40; xlH = Math.min(maxW, box.h * 0.35) * Math.sin(Math.PI * 40 / 180) + tick * 1.2; }
    }
  }
  bottom = (xl.length ? xlH + tl + tick * 0.35 : 0) + (xTitle ? fs.axis * 1.6 : 0);
  if (xRot) left = Math.max(left, Math.min(box.w * 0.3, Math.max(...xl.map((s) => textWidth(s, tick, th.font))) * Math.cos(Math.PI * 40 / 180) * 0.9));
  const inner = { x: box.x + left, y: box.y + top, w: Math.max(10, box.w - left - right), h: Math.max(10, box.h - top - bottom) };
  return { inner, xRot, xLines, yfmt, xfmt };
}
export function drawGridY(ctx, g, sy, inner, ticks) {
  if (!ctx.th.gridY || ctx.opt.grid === false) return;
  for (const v of ticks) { const yy = sy(v); svgEl('line', { x1: inner.x, x2: inner.x + inner.w, y1: yy, y2: yy, stroke: ctx.c.grid, 'stroke-width': ctx.hair }, g); }
}
export function drawGridX(ctx, g, sx, inner, ticks) {
  if (!ctx.th.gridX && !ctx.opt.gridX) return;
  for (const v of ticks) { const xx = sx(v); svgEl('line', { y1: inner.y, y2: inner.y + inner.h, x1: xx, x2: xx, stroke: ctx.c.grid, 'stroke-width': ctx.hair }, g); }
}
export function axisLeft(ctx, g, sy, inner, { ticks = null, labels = null, title = '', band = false, fmt = null }) {
  const th = ctx.th, tick = th.sizes.tick;
  const tl = ctx.tickLen;
  const vals = band ? sy.domain() : ticks;
  const f = fmt || tickFmt(ctx, 'y');
  const xx = inner.x;
  if (th.axisLineY || (th.rangeFrame && !band)) {
    const [a, b] = band ? [inner.y, inner.y + inner.h] : th.rangeFrame && ctx.yExtent ? [sy(ctx.yExtent[0]), sy(ctx.yExtent[1])] : [inner.y, inner.y + inner.h];
    svgEl('line', { x1: xx, x2: xx, y1: a, y2: b, stroke: ctx.c.axis, 'stroke-width': ctx.axisW }, g);
  }
  vals.forEach((v, i) => {
    const yy = band ? sy(v) + sy.bandwidth() / 2 : sy(v);
    if (th.axisLineY && !band) svgEl('line', { x1: xx - tl, x2: xx, y1: yy, y2: yy, stroke: ctx.c.axis, 'stroke-width': ctx.axisW }, g);
    const lab = labels ? labels[i] : band ? v : f(v, vals.length > 1 ? vals[1] - vals[0] : null);
    text(g, xx - tl - tick * 0.35, yy, lab, { size: tick, fill: ctx.c.muted, family: th.font, anchor: 'end', baseline: 'central' });
  });
  if (title) text(g, ctx.panelBox.x + th.sizes.axis * 0.85, inner.y + inner.h / 2, fitText(title, th.sizes.axis, inner.h * 1.04, th.font, 600), { size: th.sizes.axis, fill: ctx.c.ink, family: th.font, anchor: 'middle', baseline: 'central', rotate: -90, weight: 600 });
}
export function axisBottom(ctx, g, sx, inner, { ticks = null, labels = null, title = '', band = false, rot = 0, lines = 1, fmt = null, time = false }) {
  const th = ctx.th, tick = th.sizes.tick, tl = ctx.tickLen;
  const yy = inner.y + inner.h;
  const f = fmt || tickFmt(ctx, 'x');
  if (th.axisLineX) {
    const [a, b] = th.rangeFrame && ctx.xExtent && !band ? [sx(ctx.xExtent[0]), sx(ctx.xExtent[1])] : [inner.x, inner.x + inner.w];
    svgEl('line', { x1: a, x2: b, y1: yy, y2: yy, stroke: ctx.c.axis, 'stroke-width': ctx.axisW }, g);
  }
  let vals = band ? sx.domain() : ticks;
  const tfmt = time ? timeFormat(vals) : null;
  let labs = labels;
  if (!band && !rot && vals.length > 2) {
    const lab0 = vals.map((v, i) => (labels ? labels[i] : time ? tfmt(v) : f(v, vals.length > 1 ? vals[1] - vals[0] : null)));
    const maxW = Math.max(...lab0.map((l) => textWidth(l, tick, th.font)));
    const k = Math.ceil((maxW * 1.25 * vals.length) / Math.max(1, inner.w));
    if (k > 1) { const keep = vals.map((_, i) => i % k === 0); vals = vals.filter((_, i) => keep[i]); labs = lab0.filter((_, i) => keep[i]); }
  }
  vals.forEach((v, i) => {
    const xx = band ? sx(v) + sx.bandwidth() / 2 : sx(v);
    if (!band && th.ticksOut) svgEl('line', { x1: xx, x2: xx, y1: yy, y2: yy + tl, stroke: ctx.c.axis, 'stroke-width': ctx.axisW }, g);
    const lab = labs ? labs[i] : band ? v : time ? tfmt(v) : f(v, vals.length > 1 ? vals[1] - vals[0] : null);
    if (rot) text(g, xx, yy + tl + tick * 0.4, lab, { size: tick, fill: ctx.c.muted, family: th.font, anchor: 'end', baseline: 'hanging', rotate: rot });
    else if (lines > 1) multiline(g, xx, yy + tl + tick, wrapText(lab, tick, (band ? sx.step() : inner.w / vals.length) * 0.95, th.font, 400, lines), { size: tick, fill: ctx.c.muted, family: th.font, anchor: 'middle' });
    else text(g, xx, yy + tl + tick * 1.05, lab, { size: tick, fill: ctx.c.muted, family: th.font, anchor: 'middle' });
  });
  if (title) text(g, inner.x + inner.w / 2, ctx.panelBox.y + ctx.panelBox.h - th.sizes.axis * 0.35, fitText(title, th.sizes.axis, inner.w, th.font, 600), { size: th.sizes.axis, fill: ctx.c.ink, family: th.font, anchor: 'middle', weight: 600 });
}
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
function timeFormat(vals) {
  const sameYear = vals.length > 1 && vals.every((d) => d.getUTCFullYear() === vals[0].getUTCFullYear());
  const allJan = vals.every((d) => d.getUTCMonth() === 0 && d.getUTCDate() === 1);
  return (d) => (allJan ? String(d.getUTCFullYear()) : sameYear ? `${d.getUTCDate() === 1 ? '' : d.getUTCDate() + ' '}${MESES[d.getUTCMonth()]}` : `${MESES[d.getUTCMonth()]} ${d.getUTCFullYear()}`);
}

// ---------- leyendas ----------
// item: { label, color, fill, shape: 'square'|'circle'|'line'|'dash' }
export function measureLegend(ctx, lg, maxW) {
  if (!lg || ctx.opt.legend === 'none') return { w: 0, h: 0 };
  const th = ctx.th, fs = th.sizes.legend;
  const pos = ctx.legendPos;
  const sw = fs * 1.05, gap = fs * 0.45;
  const titleH = lg.title ? th.sizes.legend * 1.45 : 0;
  if (lg.type === 'cat') {
    const iw = lg.items.map((it) => sw + gap + textWidth(it.label, fs, th.font));
    if (pos === 'right') return { w: Math.min(maxW * 0.36, Math.max(...iw, textWidth(lg.title || '', fs, th.font, 600))) + fs * 0.8, h: titleH + lg.items.length * fs * 1.5 };
    // abajo / arriba: en filas
    let rowsN = 1, x = 0;
    for (const w of iw) { if (x + w > maxW && x > 0) { rowsN++; x = 0; } x += w + fs * 1.4; }
    return { w: maxW, h: titleH * 0 + rowsN * fs * 1.55 + fs * 0.5 + (lg.title ? 0 : 0) };
  }
  if (lg.type === 'ramp' || lg.type === 'classes') {
    const labs = lg.type === 'classes' ? lg.items.map((i) => i.label) : lg.labels || [];
    if (pos === 'right') return { w: Math.max(fs * 4, textWidth(lg.title || '', fs, th.font, 700) + fs * 0.4, ...labs.map((l) => textWidth(l, fs, th.font) + fs * 1.8)), h: titleH + (lg.type === 'classes' ? lg.items.length * fs * 1.5 : fs * 9) };
    return { w: maxW, h: titleH + fs * 3.4 };
  }
  if (lg.type === 'size') return pos === 'right' ? { w: fs * 8, h: titleH + fs * 7 } : { w: maxW, h: titleH + fs * 4.5 };
  return { w: 0, h: 0 };
}
export function drawLegend(ctx, g, lg, box) {
  if (!lg || ctx.opt.legend === 'none') return;
  const th = ctx.th, fs = th.sizes.legend, c = ctx.c;
  const pos = ctx.legendPos;
  const sw = fs * 1.05, gap = fs * 0.45;
  let x = box.x, y = box.y;
  if (lg.title) {
    if (pos === 'right') { text(g, x, y + fs, lg.title, { size: fs, fill: c.ink, family: th.font, weight: 700 }); y += fs * 1.45; }
  }
  const swatch = (it, sx, sy) => {
    const shape = it.shape || th.legendShape;
    if (shape === 'line' || shape === 'dash') svgEl('line', { x1: sx, x2: sx + sw, y1: sy + sw / 2, y2: sy + sw / 2, stroke: it.color, 'stroke-width': ctx.lineW * 1.2, 'stroke-dasharray': shape === 'dash' ? `${ctx.lineW * 2.5} ${ctx.lineW * 1.6}` : null, 'stroke-linecap': 'round' }, g);
    else if (shape === 'circle') svgEl('circle', { cx: sx + sw / 2, cy: sy + sw / 2, r: sw * 0.42, fill: it.fill || it.color }, g);
    else svgEl('rect', { x: sx, y: sy + sw * 0.08, width: sw * 0.92, height: sw * 0.92, fill: it.fill || it.color, rx: th.barRadius ? sw * 0.2 : 0, stroke: th.patterns ? it.color : null, 'stroke-width': th.patterns ? ctx.hair : null }, g);
  };
  if (lg.type === 'cat') {
    if (pos === 'right') {
      lg.items.forEach((it, i) => { const yy = y + i * fs * 1.5; swatch(it, x, yy); text(g, x + sw + gap, yy + sw * 0.78, it.label, { size: fs, fill: c.ink, family: th.font }); });
    } else {
      let xx = x, yy = y + fs * 0.25;
      if (lg.title) { text(g, xx, yy + sw * 0.78, lg.title + ':', { size: fs, fill: c.ink, family: th.font, weight: 700 }); xx += textWidth(lg.title + ':', fs, th.font, 700) + fs * 0.8; }
      for (const it of lg.items) {
        const w = sw + gap + textWidth(it.label, fs, th.font);
        if (xx + w > box.x + box.w && xx > box.x) { xx = box.x; yy += fs * 1.55; }
        swatch(it, xx, yy); text(g, xx + sw + gap, yy + sw * 0.78, it.label, { size: fs, fill: c.ink, family: th.font });
        xx += w + fs * 1.4;
      }
    }
    return;
  }
  if (lg.type === 'classes') {
    if (pos === 'right') lg.items.forEach((it, i) => { const yy = y + i * fs * 1.5; swatch({ ...it, shape: 'square' }, x, yy); text(g, x + sw + gap, yy + sw * 0.78, it.label, { size: fs, fill: c.ink, family: th.font }); });
    else {
      if (lg.title) { text(g, x, y + fs, lg.title, { size: fs, fill: c.ink, family: th.font, weight: 700 }); y += fs * 1.4; }
      const n = lg.items.length, cw = Math.min(box.w / n, fs * 9);
      lg.items.forEach((it, i) => { svgEl('rect', { x: x + i * cw, y, width: cw - ctx.gapW, height: fs * 0.9, fill: it.color }, g); text(g, x + i * cw + cw / 2, y + fs * 2, it.label, { size: fs * 0.95, fill: c.muted, family: th.font, anchor: 'middle' }); });
    }
    return;
  }
  if (lg.type === 'ramp') {
    const id = `${ctx.uid}-lg-ramp`;
    const vert = pos === 'right';
    const lgd = svgEl('linearGradient', { id, x1: 0, y1: vert ? 1 : 0, x2: vert ? 0 : 1, y2: 0 }, ctx.defs);
    lg.stops.forEach((s, i) => svgEl('stop', { offset: `${(i / (lg.stops.length - 1)) * 100}%`, 'stop-color': s }, lgd));
    if (vert) {
      const h = fs * 8;
      svgEl('rect', { x, y, width: fs * 0.9, height: h, fill: `url(#${id})` }, g);
      lg.labels.forEach((l, i) => text(g, x + fs * 1.4, y + h - (i / (lg.labels.length - 1)) * h, l, { size: fs, fill: c.muted, family: th.font, baseline: 'central' }));
    } else {
      if (lg.title) { text(g, x, y + fs, lg.title, { size: fs, fill: c.ink, family: th.font, weight: 700 }); y += fs * 1.4; }
      const w = Math.min(box.w, fs * 22);
      svgEl('rect', { x, y, width: w, height: fs * 0.9, fill: `url(#${id})` }, g);
      lg.labels.forEach((l, i) => text(g, x + (i / (lg.labels.length - 1)) * w, y + fs * 2.1, l, { size: fs, fill: c.muted, family: th.font, anchor: i === 0 ? 'start' : i === lg.labels.length - 1 ? 'end' : 'middle' }));
    }
    return;
  }
  if (lg.type === 'size') {
    let xx = x;
    if (pos !== 'right' && lg.title) { text(g, x, y + fs, lg.title, { size: fs, fill: c.ink, family: th.font, weight: 700 }); y += fs * 1.4; }
    const maxR = Math.max(...lg.items.map((it) => it.r));
    lg.items.forEach((it, i) => {
      if (pos === 'right') {
        const cy = y + maxR * 2 - it.r;
        svgEl('circle', { cx: x + maxR, cy, r: it.r, fill: 'none', stroke: c.muted, 'stroke-width': ctx.hair * 1.5 }, g);
        svgEl('line', { x1: x + maxR, x2: x + maxR * 2 + fs * 0.4, y1: cy - it.r, y2: cy - it.r, stroke: c.muted, 'stroke-width': ctx.hair }, g);
        text(g, x + maxR * 2 + fs * 0.6, cy - it.r, it.label, { size: fs * 0.95, fill: c.muted, family: th.font, baseline: 'central' });
      } else {
        svgEl('circle', { cx: xx + it.r, cy: y + maxR, r: it.r, fill: 'none', stroke: c.muted, 'stroke-width': ctx.hair * 1.5 }, g);
        text(g, xx + it.r * 2 + fs * 0.3, y + maxR + fs * 0.35, it.label, { size: fs * 0.95, fill: c.muted, family: th.font });
        xx += it.r * 2 + textWidth(it.label, fs, th.font) + fs * 1.4;
      }
    });
  }
}

export { d3 };
