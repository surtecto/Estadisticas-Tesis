// Más tipos de gráfico: rangos (alcances, intervalos, Gantt), línea de tiempo, cascada, embudo, bala, Sankey, sunburst,
// Marimekko, coordenadas paralelas, rosa polar, barras radiales, calendario, enjambre, distribución acumulada,
// densidad 2D (hexágonos), ranking, medidor, barras de progreso y tabla con barras.
import { sankey as d3sankey, sankeyLinkHorizontal } from 'd3-sankey';
import { svgEl, mixHex } from '../util.js';
import * as S from '../stats/engine.js';
import { getCol, isNum, levelsOf, aggregate, dateToTime } from '../data/table.js';
import {
  d3, text, textWidth, wrapText, fitText, enc, groupAgg, levelsIn, niceLinear, layoutPlot, drawGridY, drawGridX, axisLeft, axisBottom,
  colorScale, singleColor, fillFor, glowFilter, makeFormat, readableOn, tickFmt, unitFormat,
} from './core.js';
import { withLegend, catLegend, tip, fmtV, yAxisTitle, xAxisTitle } from './render-xy.js';

// orden de aparición en la tabla para categorías sin orden propio (etapas, procesos)
function appearance(ctx, e) {
  if (e.col.type === 'ord' || (e.col.levels && e.col.levelsCustom)) return levelsIn(ctx, e, ctx.rows);
  const seen = []; const s0 = new Set();
  for (const r of ctx.rows) { const v = r[e.j]; if (v != null && !s0.has(String(v))) { s0.add(String(v)); seen.push(String(v)); } }
  const hidden = (ctx.opt.hideLevels || []).map(String);
  return seen.filter((l) => !hidden.includes(l));
}
const yearish = (vals) => vals.length && vals.every((v) => Number.isInteger(v) && v >= 1000 && v <= 2200);
const NUM = (v) => (v == null || v === '' ? null : Number.isFinite(+v) ? +v : null);
const PAL = (ctx, n) => ctx.colorsN(n);
function timeOrNum(e, v) { if (v == null) return null; if (e.col.type === 'date') { const t = dateToTime(v); return Number.isFinite(t) ? t : null; } return NUM(v); }
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
function arrowHead(ctx, color) {
  const id = `${ctx.uid}-ah-${String(color).replace(/[^\w]/g, '')}`;
  if (!ctx.defs.querySelector(`#${CSS.escape(id)}`)) {
    const m = svgEl('marker', { id, viewBox: '0 0 10 10', refX: 8, refY: 5, markerWidth: 4.5, markerHeight: 4.5, orient: 'auto' }, ctx.defs);
    svgEl('path', { d: 'M0,0L10,5L0,10z', fill: color }, m);
  }
  return `url(#${id})`;
}

// ======================= RANGOS (alcances, intervalos, Gantt) =======================
// Una fila por caso: desde «Inicio» hasta «Fin» (tramo habitual) y, si hay, hasta «Extensión» (segundo tramo).
// «Forma»: «abierto» dibuja una flecha hasta el borde; «difuso», una línea de trazos con flecha.
export function range(ctx) {
  const el = enc(ctx, 'label'), es = enc(ctx, 'start'), ee = enc(ctx, 'end'), ex2 = enc(ctx, 'end2'), en = enc(ctx, 'note'), esh = enc(ctx, 'shape'), ec = enc(ctx, 'color');
  if (!el || !es || !ee) return ctx.need('Elegí el rótulo de cada fila, el inicio y el fin.');
  const o = ctx.opt;
  const isDate = es.col.type === 'date';
  let rows = ctx.rows.map((r) => ({ l: r[el.j] == null ? '' : String(r[el.j]), a: timeOrNum(es, r[es.j]), b: timeOrNum(ee, r[ee.j]) ?? timeOrNum(es, r[es.j]), c: ex2 ? timeOrNum(ex2, r[ex2.j]) : null, note: en ? r[en.j] : null, shape: esh && r[esh.j] != null ? String(r[esh.j]).toLowerCase() : '', col: ec ? r[ec.j] : null })).filter((d) => d.a != null && d.b != null);
  if (!rows.length) return ctx.need('No hay filas con inicio y fin numéricos.');
  if (o.sort === 'asc') rows.sort((p, q) => p.a - q.a); else if (o.sort === 'desc') rows.sort((p, q) => (q.c ?? q.b) - (p.c ?? p.b));
  const vals = rows.flatMap((d) => [d.a, d.b, d.c]).filter((v) => v != null);
  const lo = Math.min(...vals), hi = Math.max(...vals);
  if (ctx.measure) return {};
  const auto = !isDate && lo > 0 && hi / lo >= 500;
  const useLog = o.xLog == null || o.xLog === '' ? auto : o.xLog === true || o.xLog === 'true';
  const pal = PAL(ctx, 3);
  const cA = o.colorA || pal[0], cB = o.colorB || (ctx.th.id === 'ensayo' ? '#e8672e' : pal[1]);
  const color = ec ? colorScale(ctx, ec.key) : null;
  const items = [];
  if (ec) items.push(...levelsIn(ctx, ec, ctx.rows).map((l) => ({ label: l, color: color(l) })));
  else { items.push({ label: o.labelA || ee.name, color: cA }); if (ex2) items.push({ label: o.labelB || ex2.name, color: cB }); }
  const box = withLegend(ctx, items.length > 1 || o.legend === 'force' ? { type: 'cat', title: ec ? ec.name : '', items } : null);
  const g = ctx.g, th = ctx.th, fs = th.sizes;
  const labSize = fs.axis * (o.labelScale || 1.12);
  const labFont = th.id === 'ensayo' || th.fontTitle !== th.font ? th.fontTitle : th.font;
  const labW = Math.min(box.w * 0.34, Math.max(...rows.map((d) => textWidth(d.l, labSize, labFont))) + labSize * 0.9);
  const zones = Array.isArray(o.zones) ? o.zones.filter((z) => Number.isFinite(+z.at)) : [];
  const topZ = zones.length ? fs.tick * 2 : ctx.pad;
  const xTitle = ctx.noXTitle ? '' : o.xTitle != null && o.xTitle !== '' ? o.xTitle : `${es.name.replace(/^(inicio|desde)\s*/i, '')}`;
  const bottom = fs.tick * 2.4 + (xTitle ? fs.axis * 1.6 : 0);
  const inner = { x: box.x + labW, y: box.y + topZ, w: box.w - labW - fs.tick * 1.5, h: box.h - topZ - bottom };
  let sx;
  if (isDate) sx = d3.scaleUtc().domain([new Date(o.xMin ? dateToTime(o.xMin) : lo), new Date(o.xMax ? dateToTime(o.xMax) : hi)]).nice();
  else sx = niceLinear([lo, hi], 6, { log: useLog, min: o.xMin, max: o.xMax, zero: !useLog && o.xZero });
  const ticks = sx.ticks(Math.max(3, Math.round(inner.w / (fs.tick * 8))));
  sx = sx.copy().range([inner.x, inner.x + inner.w]);
  const X = (v) => sx(isDate ? new Date(v) : v);
  // franjas de referencia
  if (zones.length) {
    const zs = zones.map((z) => ({ at: +z.at, label: z.label || '' })).sort((p, q) => p.at - q.at);
    const dom = sx.domain().map((d) => +d);
    const edges = [dom[0], ...zs.map((z) => z.at), dom[1]];
    const labels = [o.zoneFirst || '', ...zs.map((z) => z.label)];
    zs.forEach((z) => { const xx = X(z.at); if (xx > inner.x && xx < inner.x + inner.w) svgEl('line', { x1: xx, x2: xx, y1: inner.y - topZ + fs.tick * 0.2, y2: inner.y + inner.h, stroke: ctx.c.grid, 'stroke-width': ctx.hair * 1.2 }, g); });
    for (let i = 0; i < edges.length - 1; i++) {
      if (!labels[i]) continue;
      const a = X(Math.max(edges[i], dom[0])), b = X(Math.min(edges[i + 1], dom[1]));
      if (b - a < fs.tick) continue;
      text(g, (a + b) / 2, box.y + fs.tick * 1.05, fitText(labels[i], fs.tick * 0.95, b - a, 'IBM Plex Mono'), { size: fs.tick * 0.95, fill: ctx.c.muted, family: 'IBM Plex Mono', anchor: 'middle' });
    }
  }
  const band = d3.scaleBand().domain(rows.map((d, i) => String(i))).range([inner.y, inner.y + inner.h]).paddingInner(0.25).paddingOuter(0.15);
  const bh = Math.min(band.bandwidth() * (o.barHeight || 0.42), fs.label * 2.6);
  const fmtX0 = isDate ? (v) => { const d = new Date(v); return `${d.getUTCDate()} ${MESES[d.getUTCMonth()]} ${d.getUTCFullYear()}`; } : (unitFormat(o.xUnits, ctx.comma) || makeFormat({ comma: ctx.comma }));
  const fmtX = !isDate && !o.xUnits && yearish(vals) ? (v) => String(Math.round(v)) : fmtX0;
  rows.forEach((d, i) => {
    const yc = band(String(i)) + band.bandwidth() / 2 + (d.note ? band.bandwidth() * 0.12 : 0);
    const y0 = yc - bh / 2;
    text(g, inner.x - labSize * 0.7, yc, d.l, { size: labSize, fill: ctx.c.ink, family: labFont, anchor: 'end', baseline: 'central' });
    const colA = ec ? color(d.col) : cA;
    const a = X(Math.min(d.a, d.b)), b = X(Math.max(d.a, d.b));
    if (d.a === d.b && d.c == null) { const s2 = bh * 0.62; tip(svgEl('path', { d: `M${a},${yc - s2}L${a + s2},${yc}L${a},${yc + s2}L${a - s2},${yc}Z`, fill: colA }, g), `<b>${d.l}</b><br>${fmtX(d.a)}`); if (d.note) text(g, a + s2 + fs.label * 0.5, yc, String(d.note), { size: fs.label * 1.05, fill: ctx.c.muted, family: th.font, baseline: 'central' }); return; }
    tip(svgEl('rect', { x: a, y: y0, width: Math.max(ctx.hair, b - a), height: bh, fill: fillFor(ctx, colA, 0, 'h'), rx: ctx.th.barRadius, 'data-cat': ec ? String(d.col) : null }, g), `<b>${d.l}</b><br>${fmtX(d.a)} – ${fmtX(d.b)}`);
    let end = b;
    if (d.c != null && d.c > d.b) {
      const c2 = X(d.c);
      tip(svgEl('rect', { x: b, y: y0, width: Math.max(ctx.hair, c2 - b), height: bh, fill: fillFor(ctx, ec ? mixHex(colA, ctx.c.bg, 0.45) : cB, 1, 'h'), rx: ctx.th.barRadius }, g), `<b>${d.l}</b><br>extensión hasta ${fmtX(d.c)}`);
      end = c2;
    }
    const xr = inner.x + inner.w + fs.tick * 0.8;
    if (/abiert|flecha|→|sigue|\+/.test(d.shape)) svgEl('line', { x1: end + 1, x2: xr, y1: yc, y2: yc, stroke: ex2 ? cB : colA, 'stroke-width': ctx.lineW * 1.1, 'marker-end': arrowHead(ctx, ex2 ? cB : colA) }, g);
    else if (/difus|punte|trazo|radia/.test(d.shape)) svgEl('line', { x1: end + bh * 0.6, x2: xr, y1: yc, y2: yc, stroke: ex2 ? cB : colA, 'stroke-width': ctx.lineW * 1.1, 'stroke-dasharray': `${ctx.lineW * 3} ${ctx.lineW * 2.2}`, 'marker-end': arrowHead(ctx, ex2 ? cB : colA) }, g);
    if (d.note) {
      const nt = String(d.note), w = textWidth(nt, fs.label * 1.05, th.font);
      const mode = o.noteMode || 'auto';
      if (mode === 'inside' && w < (b - a) - fs.label * 1.2) text(g, a + fs.label * 0.6, yc, nt, { size: fs.label * 1.05, fill: readableOn(colA), family: th.font, baseline: 'central' });
      else if (mode === 'right' || (mode === 'auto' && end + w + fs.label < inner.x + inner.w && !/abiert|difus|flecha/.test(d.shape) && w < inner.w * 0.45)) text(g, end + fs.label * 0.7, yc, nt, { size: fs.label * 1.05, fill: ctx.c.muted, family: th.font, baseline: 'central' });
      else text(g, a, y0 - fs.label * 0.55, fitText(nt, fs.label * 1.05, inner.x + inner.w - a, th.font), { size: fs.label * 1.05, fill: ctx.c.muted, family: th.font });
    }
  });
  // eje
  svgEl('line', { x1: inner.x, x2: inner.x + inner.w, y1: inner.y + inner.h, y2: inner.y + inner.h, stroke: ctx.c.axis, 'stroke-width': ctx.axisW }, g);
  if (useLog && !isDate) { const [d0, d1] = sx.domain(); for (let e = Math.floor(Math.log10(d0)); e <= Math.ceil(Math.log10(d1)); e++) for (let m = 2; m <= 9; m++) { const v = m * 10 ** e; if (v > d0 && v < d1) svgEl('line', { x1: X(v), x2: X(v), y1: inner.y + inner.h, y2: inner.y + inner.h + ctx.tickLen * 0.6, stroke: ctx.c.axis, 'stroke-width': ctx.hair }, g); } }
  const tf = isDate ? null : !o.xUnits && yearish(vals) ? (v) => String(Math.round(v)) : tickFmt(ctx, 'x');
  ticks.forEach((v) => { const xx = sx(v); svgEl('line', { x1: xx, x2: xx, y1: inner.y + inner.h, y2: inner.y + inner.h + ctx.tickLen, stroke: ctx.c.axis, 'stroke-width': ctx.axisW }, g); text(g, xx, inner.y + inner.h + ctx.tickLen + fs.tick * 1.1, isDate ? `${MESES[v.getUTCMonth()]} ${v.getUTCFullYear()}` : tf(v, null), { size: fs.tick, fill: ctx.c.muted, family: th.font, anchor: 'middle' }).setAttribute('data-axis', 'x'); });
  const xt = o.xTitle != null && o.xTitle !== '' ? o.xTitle : `${xTitle}${useLog ? ' (escala logarítmica)' : ''}`;
  if (xTitle) text(g, inner.x + inner.w / 2, box.y + box.h - fs.axis * 0.3, xt, { size: fs.axis, fill: ctx.c.ink, family: th.font, anchor: 'middle' }).setAttribute('data-edit', 'opt.xTitle');
  if (useLog) ctx.note('Eje en escala logarítmica: cada marca multiplica por diez.');
}

// ======================= LÍNEA DE TIEMPO =======================
export function timeline(ctx) {
  const el = enc(ctx, 'label'), es = enc(ctx, 'start'), ee = enc(ctx, 'end'), ec = enc(ctx, 'color');
  if (!el || !es) return ctx.need('Elegí el nombre del hito y su fecha o año.');
  const ev = ctx.rows.map((r) => ({ l: String(r[el.j] ?? ''), a: timeOrNum(es, r[es.j]), b: ee ? timeOrNum(ee, r[ee.j]) : null, c: ec ? String(r[ec.j] ?? '') : '' })).filter((d) => d.a != null).sort((p, q) => p.a - q.a);
  if (!ev.length) return ctx.need('No hay fechas o años válidos.');
  if (ctx.measure) return {};
  const lanes = ec ? levelsIn(ctx, ec, ctx.rows) : [''];
  const color = colorScale(ctx, ec ? ec.key : null);
  const box = withLegend(ctx, ec ? catLegend(ctx, ec.name, lanes, color, 'circle') : null);
  const g = ctx.g, fs = ctx.th.sizes;
  const isDate = es.col.type === 'date';
  const lo = Math.min(...ev.map((d) => d.a)), hi = Math.max(...ev.map((d) => d.b ?? d.a));
  const laneW = ec ? Math.max(...lanes.map((l) => textWidth(l, fs.tick, ctx.th.font))) + fs.tick : 0;
  const inner = { x: box.x + laneW + fs.label, y: box.y + ctx.pad, w: box.w - laneW - fs.label * 2, h: box.h - fs.tick * 2.6 - ctx.pad };
  let sx = isDate ? d3.scaleUtc().domain([new Date(lo), new Date(hi)]).nice() : d3.scaleLinear().domain([lo, hi]).nice();
  const ticks = sx.ticks(Math.max(3, Math.round(inner.w / (fs.tick * 7))));
  sx = sx.copy().range([inner.x, inner.x + inner.w]);
  const X = (v) => sx(isDate ? new Date(v) : v);
  const lh = inner.h / lanes.length;
  const fy0 = makeFormat({ comma: ctx.comma, compact: false });
  const fy = yearish(ev.map((d) => d.a)) ? (v) => String(Math.round(v)) : fy0;
  lanes.forEach((ln, li) => {
    const yc = inner.y + lh * (li + 0.5);
    svgEl('line', { x1: inner.x, x2: inner.x + inner.w, y1: yc, y2: yc, stroke: ctx.c.grid, 'stroke-width': ctx.hair * 2 }, g);
    if (ec) text(g, box.x, yc, ln, { size: fs.tick, fill: ctx.c.ink, family: ctx.th.font, baseline: 'central', weight: 600 });
    const items = ev.filter((d) => !ec || d.c === ln);
    const placed = [];
    items.forEach((d, k) => {
      const col = ec ? color(d.c) : singleColor(ctx);
      const x0 = X(d.a);
      if (d.b != null && d.b > d.a) tip(svgEl('rect', { x: x0, y: yc - fs.label * 0.45, width: X(d.b) - x0, height: fs.label * 0.9, fill: col, 'fill-opacity': 0.75, rx: fs.label * 0.2 }, g), `<b>${d.l}</b>`);
      else tip(svgEl('circle', { cx: x0, cy: yc, r: ctx.pointR * 1.3, fill: col, stroke: ctx.c.bg, 'stroke-width': ctx.gapW }, g), `<b>${d.l}</b>`);
      // rótulos alternados arriba y abajo, con línea guía
      const up = k % 2 === 0;
      const maxW = Math.min(fs.label * 16, inner.w * 0.3);
      const lines = wrapText(d.l, fs.label, maxW, ctx.th.font, 400, 3);
      const lvl = placed.filter((p) => p.up === up && Math.abs(p.x - x0) < maxW).length % 3;
      const off = (lh * 0.12 + lvl * fs.label * 1.15 * (lines.length + 0.3)) * (up ? -1 : 1);
      const ty = yc + off + (up ? -fs.label * 0.3 : fs.label * 1.1);
      svgEl('line', { x1: x0, x2: x0, y1: yc, y2: yc + off, stroke: ctx.c.muted, 'stroke-width': ctx.hair }, g);
      const yr = isDate ? new Date(d.a).getUTCFullYear() : fy(d.a);
      lines.forEach((l, q) => text(g, x0 + 2, up ? ty - (lines.length - 1 - q) * fs.label * 1.15 : ty + q * fs.label * 1.15, l, { size: fs.label, fill: ctx.c.ink, family: ctx.th.font }));
      text(g, x0 + 2, up ? ty - lines.length * fs.label * 1.15 : ty + lines.length * fs.label * 1.15, String(yr), { size: fs.label * 0.9, fill: ctx.c.muted, family: ctx.th.font, weight: 700 });
      placed.push({ x: x0, up });
    });
  });
  svgEl('line', { x1: inner.x, x2: inner.x + inner.w, y1: inner.y + inner.h, y2: inner.y + inner.h, stroke: ctx.c.axis, 'stroke-width': ctx.axisW }, g);
  ticks.forEach((v) => { const xx = sx(v); text(g, xx, inner.y + inner.h + fs.tick * 1.3, isDate ? String(v.getUTCFullYear()) : fy(v), { size: fs.tick, fill: ctx.c.muted, family: ctx.th.font, anchor: 'middle' }); svgEl('line', { x1: xx, x2: xx, y1: inner.y + inner.h, y2: inner.y + inner.h + ctx.tickLen, stroke: ctx.c.axis, 'stroke-width': ctx.axisW }, g); });
}

// ======================= CASCADA =======================
export function waterfall(ctx) {
  const ex = enc(ctx, 'x'), ey = enc(ctx, 'y');
  if (!ex || !ey) return ctx.need('Elegí las etapas y el valor de cada cambio.');
  const o = ctx.opt;
  const lv = appearance(ctx, ex);
  const data = groupAgg(ctx.rows, [(r) => (r[ex.j] == null ? null : String(r[ex.j]))], (r) => r[ey.j], 'sum');
  const steps = lv.map((l) => ({ l, v: (data.find((d) => d.keys[0] === l) || {}).value || 0 }));
  let acc = +o.startValue || 0;
  const bars = steps.map((s) => { const a = acc; acc += s.v; return { ...s, a, b: acc }; });
  if (o.total !== false) bars.push({ l: o.totalLabel || 'Total', v: acc, a: 0, b: acc, total: true });
  if (ctx.measure) return {};
  const pal = PAL(ctx, 3);
  const cUp = o.colorUp || '#2f8f5b', cDown = o.colorDown || '#d55e00', cTot = ctx.c.muted;
  const box = withLegend(ctx, { type: 'cat', title: '', items: [{ label: 'Aumento', color: cUp }, { label: 'Disminución', color: cDown }, ...(o.total !== false ? [{ label: o.totalLabel || 'Total', color: cTot }] : [])] });
  const g = ctx.g;
  const vals = bars.flatMap((b) => [b.a, b.b]);
  const sy0 = niceLinear([Math.min(0, ...vals), Math.max(...vals)], 5, { zero: true, min: o.yMin, max: o.yMax });
  const yt = sy0.ticks(5);
  const yTitle = yAxisTitle(ctx, ey, 'sum');
  const L = layoutPlot(ctx, box, { xBand: true, xLabels: bars.map((b) => b.l), yTicks: yt, yTitle, xTitle: xAxisTitle(ctx, ex) });
  const inner = L.inner;
  const bx = d3.scaleBand().domain(bars.map((b) => b.l)).range([inner.x, inner.x + inner.w]).padding(0.25);
  const sy = sy0.copy().range([inner.y + inner.h, inner.y]);
  drawGridY(ctx, g, sy, inner, yt);
  const f = fmtV(ctx);
  bars.forEach((b, i) => {
    const col = b.total ? cTot : b.v >= 0 ? cUp : cDown;
    const y1 = sy(Math.max(b.a, b.b)), y2 = sy(Math.min(b.a, b.b));
    tip(svgEl('rect', { x: bx(b.l), y: y1, width: bx.bandwidth(), height: Math.max(ctx.hair, y2 - y1), fill: fillFor(ctx, col, 0), rx: ctx.th.barRadius }, g), `<b>${b.l}</b><br>${b.total ? '' : b.v >= 0 ? '+' : ''}${f(b.v)}`);
    if (i < bars.length - 1 && !bars[i + 1].total) svgEl('line', { x1: bx(b.l) + bx.bandwidth(), x2: bx(bars[i + 1].l), y1: sy(b.b), y2: sy(b.b), stroke: ctx.c.muted, 'stroke-width': ctx.hair, 'stroke-dasharray': '2 2' }, g);
    if (o.showValues !== false) text(g, bx(b.l) + bx.bandwidth() / 2, y1 - 2.5, `${!b.total && b.v > 0 ? '+' : ''}${f(b.v)}`, { size: ctx.th.sizes.label, fill: ctx.c.ink, family: ctx.th.font, anchor: 'middle' });
  });
  svgEl('line', { x1: inner.x, x2: inner.x + inner.w, y1: sy(0), y2: sy(0), stroke: ctx.c.axis, 'stroke-width': ctx.axisW }, g);
  axisLeft(ctx, g, sy, inner, { ticks: yt, title: yTitle });
  axisBottom({ ...ctx, th: { ...ctx.th, axisLineX: false } }, g, bx, inner, { band: true, rot: L.xRot, lines: L.xLines, title: xAxisTitle(ctx, ex) });
}

// ======================= EMBUDO =======================
export function funnel(ctx) {
  const ex = enc(ctx, 'x'), ey = enc(ctx, 'y');
  if (!ex) return ctx.need('Elegí las etapas.');
  const lv = appearance(ctx, ex);
  const data = groupAgg(ctx.rows, [(r) => (r[ex.j] == null ? null : String(r[ex.j]))], ey ? (r) => r[ey.j] : null, ey ? ctx.panel.agg || 'sum' : 'count');
  const st = lv.map((l) => ({ l, v: (data.find((d) => d.keys[0] === l) || {}).value || 0 }));
  if (ctx.measure) return {};
  const box = withLegend(ctx, null);
  const g = ctx.g, fs = ctx.th.sizes;
  const mx = Math.max(...st.map((s) => s.v)) || 1;
  const lw = Math.min(box.w * 0.3, Math.max(...st.map((s) => textWidth(s.l, fs.tick, ctx.th.font))) + fs.tick);
  const cx = box.x + lw + (box.w - lw) / 2, W = box.w - lw - fs.tick;
  const bh = box.h / st.length;
  const f = fmtV(ctx), pf = makeFormat({ comma: ctx.comma, decimals: 0 });
  const col = singleColor(ctx);
  st.forEach((s, i) => {
    const w = (s.v / mx) * W, y = box.y + i * bh;
    const nx = st[i + 1] ? (st[i + 1].v / mx) * W : w * 0.85;
    const shape = ctx.opt.funnelShape === 'bars' ? `M${cx - w / 2},${y + bh * 0.08}h${w}v${bh * 0.84}h${-w}z` : `M${cx - w / 2},${y + bh * 0.04}L${cx + w / 2},${y + bh * 0.04}L${cx + nx / 2},${y + bh * 0.96}L${cx - nx / 2},${y + bh * 0.96}Z`;
    const c = mixHex(col, ctx.c.bg, (i / Math.max(1, st.length)) * 0.45);
    tip(svgEl('path', { d: shape, fill: fillFor(ctx, c, 0), filter: glowFilter(ctx) }, g), `<b>${s.l}</b><br>${f(s.v)} · ${pf((s.v / st[0].v) * 100)} % del inicio`);
    text(g, box.x + lw - fs.tick * 0.6, y + bh / 2, s.l, { size: fs.tick, fill: ctx.c.ink, family: ctx.th.font, anchor: 'end', baseline: 'central' });
    const lab = `${f(s.v)}${i ? ` · ${pf((s.v / st[0].v) * 100)} %` : ''}`;
    text(g, cx, y + bh / 2, lab, { size: fs.label, fill: textWidth(lab, fs.label, ctx.th.font) < nx * 0.9 ? readableOn(c) : ctx.c.ink, family: ctx.th.font, anchor: 'middle', baseline: 'central', weight: 700 });
  });
}

// ======================= BALA =======================
export function bullet(ctx) {
  const ex = enc(ctx, 'x'), ey = enc(ctx, 'y'), et = enc(ctx, 'target');
  if (!ex || !ey) return ctx.need('Elegí las filas y el valor.');
  const o = ctx.opt;
  const lv = levelsIn(ctx, ex, ctx.rows);
  const agg = ctx.panel.agg || 'sum';
  const dv = groupAgg(ctx.rows, [(r) => (r[ex.j] == null ? null : String(r[ex.j]))], (r) => r[ey.j], agg);
  const dt = et ? groupAgg(ctx.rows, [(r) => (r[ex.j] == null ? null : String(r[ex.j]))], (r) => r[et.j], 'mean') : [];
  const rows = lv.map((l) => ({ l, v: (dv.find((d) => d.keys[0] === l) || {}).value, t: (dt.find((d) => d.keys[0] === l) || {}).value }));
  if (ctx.measure) return {};
  const box = withLegend(ctx, et ? { type: 'cat', title: '', items: [{ label: ey.name, color: singleColor(ctx) }, { label: et.name, color: ctx.c.ink, shape: 'line' }] } : null);
  const g = ctx.g, fs = ctx.th.sizes;
  const mx = +o.xMax || Math.max(...rows.flatMap((r) => [r.v || 0, r.t || 0])) * 1.08;
  const bands = String(o.bands || '0.5, 0.75, 1').split(/[;,]\s*/).map(Number).filter(Number.isFinite).map((b) => (b <= 1 ? b * mx : b));
  const nt = Math.max(3, Math.round(box.w / (fs.tick * 8)));
  const sx0 = d3.scaleLinear().domain([0, mx]).nice(nt);
  const xt = sx0.ticks(nt);
  const L = layoutPlot(ctx, box, { yBand: true, yLabels: lv, xTicks: xt, xTitle: xAxisTitle(ctx, ey) });
  const inner = L.inner;
  const sx = sx0.copy().range([inner.x, inner.x + inner.w]);
  const by = d3.scaleBand().domain(lv).range([inner.y, inner.y + inner.h]).padding(0.3);
  const f = fmtV(ctx);
  rows.forEach((r) => {
    const y = by(r.l), h = by.bandwidth();
    bands.slice().sort((a, b) => b - a).forEach((b, k) => svgEl('rect', { x: inner.x, y, width: sx(Math.min(b, sx0.domain()[1])) - inner.x, height: h, fill: mixHex(ctx.c.grid, ctx.c.muted, 0.12 * (bands.length - 1 - k)) }, g));
    if (r.v != null) tip(svgEl('rect', { x: inner.x, y: y + h * 0.33, width: sx(r.v) - inner.x, height: h * 0.34, fill: singleColor(ctx) }, g), `<b>${r.l}</b><br>${f(r.v)}${r.t != null ? ` · meta ${f(r.t)}` : ''}`);
    if (r.t != null) svgEl('line', { x1: sx(r.t), x2: sx(r.t), y1: y + h * 0.15, y2: y + h * 0.85, stroke: ctx.c.ink, 'stroke-width': ctx.lineW * 1.6 }, g);
  });
  axisLeft({ ...ctx, th: { ...ctx.th, axisLineY: false } }, g, by, inner, { band: true });
  axisBottom(ctx, g, sx, inner, { ticks: xt, title: xAxisTitle(ctx, ey) });
}

// ======================= SANKEY / ALUVIAL =======================
export function sankeyChart(ctx) {
  const es = enc(ctx, 'source'), et = enc(ctx, 'target'), ev = enc(ctx, 'y');
  const vars = (ctx.panel.enc.vars || []).map((k) => ({ key: k, j: ctx.table.columns.findIndex((c) => c.key === k), col: getCol(ctx.table, k) })).filter((x) => x.j >= 0);
  const steps = vars.length >= 2 ? vars : es && et ? [es, et] : null;
  if (!steps) return ctx.need('Elegí origen y destino (o dos o más etapas).');
  if (ctx.measure) return {};
  const nodes = [], idx = new Map();
  const node = (si, l) => { const k = `${si}\u0001${l}`; if (!idx.has(k)) { idx.set(k, nodes.length); nodes.push({ name: l, step: si }); } return idx.get(k); };
  const links = new Map();
  for (const r of ctx.rows) {
    const w = ev ? +r[ev.j] || 0 : 1;
    if (!w) continue;
    for (let i = 0; i < steps.length - 1; i++) {
      const a = r[steps[i].j], b = r[steps[i + 1].j];
      if (a == null || b == null) continue;
      const s = node(i, String(a)), t = node(i + 1, String(b));
      const k = `${s}-${t}`;
      links.set(k, (links.get(k) || 0) + w);
    }
  }
  if (!links.size) return ctx.need('No hay flujos para dibujar.');
  const box = withLegend(ctx, null);
  const g = ctx.g, fs = ctx.th.sizes;
  const labPad = Math.min(box.w * 0.22, Math.max(...nodes.map((n) => textWidth(n.name, fs.label, ctx.th.font))) + fs.label);
  const sk = d3sankey().nodeWidth(Math.max(4, fs.tick * 0.9)).nodePadding(fs.label * 0.9).extent([[box.x + (steps.length > 2 ? 0 : 0), box.y + fs.tick * (vars.length ? 1.6 : 0.3)], [box.x + box.w - labPad, box.y + box.h - 2]]);
  const graph = sk({ nodes: nodes.map((n) => ({ ...n })), links: [...links].map(([k, v]) => { const [s, t] = k.split('-').map(Number); return { source: s, target: t, value: v }; }) });
  const first = steps[0];
  const color = colorScale(ctx, first.key);
  const nodeCol = (n) => (n.step === 0 ? color(n.name) : ctx.c.muted);
  const rootOf = (n) => { let x = n; while (x.targetLinks && x.targetLinks.length && x.step > 0) x = x.targetLinks.slice().sort((a, b) => b.value - a.value)[0].source; return x; };
  const f = fmtV(ctx);
  for (const l of graph.links) tip(svgEl('path', { d: sankeyLinkHorizontal()(l), fill: 'none', stroke: color(l.source.step === 0 ? l.source.name : rootOf(l.source).name), 'stroke-opacity': 0.38, 'stroke-width': Math.max(1, l.width) }, g), `${l.source.name} → ${l.target.name}<br>${f(l.value)}`);
  for (const n of graph.nodes) {
    svgEl('rect', { x: n.x0, y: n.y0, width: n.x1 - n.x0, height: Math.max(1, n.y1 - n.y0), fill: nodeCol(n) }, g);
    const right = n.x0 < box.x + box.w / 2 || n.step < steps.length - 1;
    if (n.y1 - n.y0 > fs.label * 0.6) text(g, right ? n.x1 + 3 : n.x0 - 3, (n.y0 + n.y1) / 2, `${n.name} (${f(n.value)})`, { size: fs.label, fill: ctx.c.ink, family: ctx.th.font, anchor: right ? 'start' : 'end', baseline: 'central' });
  }
  if (vars.length) steps.forEach((s, i) => { const xs = graph.nodes.filter((n) => n.step === i); if (xs.length) text(g, xs[0].x0, box.y + fs.tick, s.col.name, { size: fs.tick, fill: ctx.c.muted, family: ctx.th.font, weight: 700 }); });
}

// ======================= SUNBURST =======================
export function sunburst(ctx) {
  const vars = (ctx.panel.enc.vars || []).map((k) => ({ key: k, j: ctx.table.columns.findIndex((c) => c.key === k), col: getCol(ctx.table, k) })).filter((x) => x.j >= 0);
  const ev = enc(ctx, 'y');
  if (!vars.length) return ctx.need('Elegí los niveles de la jerarquía (de afuera hacia adentro: el primero es el centro).');
  if (ctx.measure) return {};
  const root = { name: 'Total', children: [] };
  for (const r of ctx.rows) {
    let node = root;
    for (const v of vars) {
      const l = r[v.j] == null ? '(sin dato)' : String(r[v.j]);
      node.children = node.children || [];
      let ch = node.children.find((c) => c.name === l);
      if (!ch) { ch = { name: l }; node.children.push(ch); }
      node = ch;
    }
    node.value = (node.value || 0) + (ev ? +r[ev.j] || 0 : 1);
  }
  const color = colorScale(ctx, vars[0].key);
  const box = withLegend(ctx, catLegend(ctx, vars[0].col.name, levelsIn(ctx, { ...vars[0] }, ctx.rows), color));
  const g = ctx.g, fs = ctx.th.sizes;
  const R = Math.min(box.w, box.h) / 2 - 2;
  const h = d3.hierarchy(root).sum((d) => (d.children ? 0 : d.value || 0)).sort((a, b) => b.value - a.value);
  d3.partition().size([2 * Math.PI, R])(h);
  const cx = box.x + box.w / 2, cy = box.y + box.h / 2;
  const gg = svgEl('g', { transform: `translate(${cx},${cy})` }, g);
  const arc = d3.arc().startAngle((d) => d.x0).endAngle((d) => d.x1).padAngle(0.004).innerRadius((d) => d.y0).outerRadius((d) => d.y1 - 1);
  const tot = h.value;
  const f = makeFormat({ comma: ctx.comma, decimals: 1 });
  h.descendants().filter((d) => d.depth > 0).forEach((d) => {
    let top = d; while (top.depth > 1) top = top.parent;
    const col = mixHex(color(top.data.name), ctx.c.bg, (d.depth - 1) * 0.22);
    tip(svgEl('path', { d: arc(d), fill: col, stroke: ctx.c.bg, 'stroke-width': ctx.gapW * 0.6, 'data-cat': d.depth === 1 ? d.data.name : null }, gg), `<b>${d.ancestors().reverse().slice(1).map((x) => x.data.name).join(' › ')}</b><br>${f((d.value / tot) * 100)} %`);
    const ang = ((d.x0 + d.x1) / 2) * (180 / Math.PI), r = (d.y0 + d.y1) / 2;
    const arcLen = (d.x1 - d.x0) * r;
    if (arcLen > fs.label * 1.4 && d.y1 - d.y0 > textWidth(d.data.name, fs.label * 0.9, ctx.th.font) * 0.4) {
      const t = text(gg, 0, 0, fitText(d.data.name, fs.label * 0.9, d.y1 - d.y0 - 4, ctx.th.font), { size: fs.label * 0.9, fill: readableOn(col), family: ctx.th.font, anchor: 'middle', baseline: 'central' });
      t.setAttribute('transform', `rotate(${ang - 90}) translate(${r},0) rotate(${ang < 180 ? 0 : 180})`);
    }
  });
}

// ======================= MARIMEKKO =======================
export function marimekko(ctx) {
  const ex = enc(ctx, 'x'), ec = enc(ctx, 'color'), ey = enc(ctx, 'y');
  if (!ex || !ec) return ctx.need('Elegí las columnas (ancho) y los segmentos (alto).');
  if (ctx.measure) return {};
  const xl = levelsIn(ctx, ex, ctx.rows), cl = levelsIn(ctx, ec, ctx.rows);
  const data = groupAgg(ctx.rows, [(r) => (r[ex.j] == null ? null : String(r[ex.j])), (r) => (r[ec.j] == null ? null : String(r[ec.j]))], ey ? (r) => r[ey.j] : null, ey ? 'sum' : 'count');
  const get = (a, b) => (data.find((d) => d.keys[0] === a && d.keys[1] === b) || {}).value || 0;
  const colT = xl.map((x) => cl.reduce((s, c) => s + get(x, c), 0));
  const T = colT.reduce((a, b) => a + b, 0);
  const color = colorScale(ctx, ec.key);
  const box = withLegend(ctx, catLegend(ctx, ec.name, cl, color));
  const g = ctx.g, fs = ctx.th.sizes;
  const inner = { x: box.x + fs.tick * 3, y: box.y + ctx.pad, w: box.w - fs.tick * 3, h: box.h - fs.tick * 3.5 };
  const pf = makeFormat({ comma: ctx.comma, decimals: 0 });
  let x = inner.x;
  xl.forEach((xv, i) => {
    const w = (colT[i] / T) * inner.w;
    let y = inner.y + inner.h;
    cl.forEach((c, k) => {
      const share = colT[i] ? get(xv, c) / colT[i] : 0;
      const h = share * inner.h;
      y -= h;
      if (h <= 0) return;
      tip(svgEl('rect', { x: x + ctx.gapW / 2, y: y + ctx.gapW / 2, width: Math.max(0, w - ctx.gapW), height: Math.max(0, h - ctx.gapW), fill: fillFor(ctx, color(c), k), 'data-cat': c }, g), `<b>${xv} · ${c}</b><br>${pf(share * 100)} % de la columna`);
      if (w > fs.label * 3 && h > fs.label * 1.4) text(g, x + w / 2, y + h / 2, `${pf(share * 100)} %`, { size: fs.label, fill: readableOn(color(c)), family: ctx.th.font, anchor: 'middle', baseline: 'central' });
    });
    text(g, x + w / 2, inner.y + inner.h + fs.tick * 1.2, fitText(xv, fs.tick, w, ctx.th.font), { size: fs.tick, fill: ctx.c.ink, family: ctx.th.font, anchor: 'middle' });
    text(g, x + w / 2, inner.y + inner.h + fs.tick * 2.4, `${pf((colT[i] / T) * 100)} %`, { size: fs.tick * 0.9, fill: ctx.c.muted, family: ctx.th.font, anchor: 'middle' });
    x += w;
  });
  [0, 25, 50, 75, 100].forEach((v) => text(g, inner.x - fs.tick * 0.4, inner.y + inner.h - (v / 100) * inner.h, `${v} %`, { size: fs.tick, fill: ctx.c.muted, family: ctx.th.font, anchor: 'end', baseline: 'central' }));
  ctx.note('Ancho de cada columna: su parte del total; alto de cada segmento: su parte dentro de la columna.');
}

// ======================= COORDENADAS PARALELAS =======================
export function parallel(ctx) {
  const vars = (ctx.panel.enc.vars || []).filter((k) => isNum(getCol(ctx.table, k)));
  if (vars.length < 2) return ctx.need('Elegí dos o más variables numéricas.');
  if (ctx.measure) return {};
  const ec = enc(ctx, 'color');
  const js = vars.map((k) => ctx.table.columns.findIndex((c) => c.key === k));
  const rows = ctx.rows.filter((r) => js.every((j) => r[j] != null));
  const cl = ec ? levelsIn(ctx, ec, rows) : ['__'];
  const color = colorScale(ctx, ec ? ec.key : null);
  const box = withLegend(ctx, ec ? catLegend(ctx, ec.name, cl, color, 'line') : null);
  const g = ctx.g, fs = ctx.th.sizes;
  const names = vars.map((k) => getCol(ctx.table, k).name);
  const inner = { x: box.x + fs.tick * 2, y: box.y + fs.tick * 2.6, w: box.w - fs.tick * 4, h: box.h - fs.tick * 4.2 };
  const px = d3.scalePoint().domain(names).range([inner.x, inner.x + inner.w]);
  const ys = js.map((j) => d3.scaleLinear().domain(d3.extent(rows, (r) => r[j])).nice().range([inner.y + inner.h, inner.y]));
  const op = Math.max(0.08, Math.min(0.6, 30 / rows.length));
  const line = d3.line();
  rows.forEach((r) => svgEl('path', { d: line(js.map((j, i) => [px(names[i]), ys[i](r[j])])), fill: 'none', stroke: ec ? color(r[ec.j]) : singleColor(ctx), 'stroke-opacity': op, 'stroke-width': ctx.lineW * 0.7 }, g));
  const f = makeFormat({ comma: ctx.comma });
  names.forEach((n, i) => {
    const x = px(n);
    svgEl('line', { x1: x, x2: x, y1: inner.y, y2: inner.y + inner.h, stroke: ctx.c.axis, 'stroke-width': ctx.axisW }, g);
    const d = ys[i].domain();
    text(g, x + 2, inner.y - 2, f(d[1]), { size: fs.tick * 0.9, fill: ctx.c.muted, family: ctx.th.font });
    text(g, x + 2, inner.y + inner.h + fs.tick, f(d[0]), { size: fs.tick * 0.9, fill: ctx.c.muted, family: ctx.th.font });
    wrapText(n, fs.tick, px.step() * 0.95 || inner.w, ctx.th.font, 600, 2).forEach((l, q) => text(g, x, box.y + fs.tick * (1 + q * 1.1), l, { size: fs.tick, fill: ctx.c.ink, family: ctx.th.font, anchor: i === 0 ? 'start' : i === names.length - 1 ? 'end' : 'middle', weight: 600 }));
  });
}

// ======================= ROSA POLAR Y BARRAS RADIALES =======================
export function rose(ctx) {
  const ex = enc(ctx, 'x'), ey = enc(ctx, 'y'), ec = enc(ctx, 'color');
  if (!ex) return ctx.need('Elegí los sectores (por ejemplo, meses o rumbos).');
  if (ctx.measure) return {};
  const xl = levelsIn(ctx, ex, ctx.rows), cl = ec ? levelsIn(ctx, ec, ctx.rows) : ['__'];
  const agg = ey ? ctx.panel.agg || 'sum' : 'count';
  const data = groupAgg(ctx.rows, [(r) => (r[ex.j] == null ? null : String(r[ex.j])), (r) => (ec ? String(r[ec.j]) : '__')], ey ? (r) => r[ey.j] : null, agg);
  const get = (a, b) => (data.find((d) => d.keys[0] === a && d.keys[1] === b) || {}).value || 0;
  const tot = xl.map((x) => cl.reduce((s, c) => s + get(x, c), 0));
  const color = colorScale(ctx, ec ? ec.key : null);
  const box = withLegend(ctx, ec ? catLegend(ctx, ec.name, cl, color) : null);
  const g = ctx.g, fs = ctx.th.sizes;
  const R = Math.min(box.w, box.h) / 2 - fs.tick * 2;
  const cx = box.x + box.w / 2, cy = box.y + box.h / 2;
  const mx = Math.max(...tot) || 1;
  const rS = (v) => Math.sqrt(v / mx) * R; // área proporcional
  const step = (2 * Math.PI) / xl.length;
  const gg = svgEl('g', { transform: `translate(${cx},${cy})` }, g);
  [0.25, 0.5, 0.75, 1].forEach((t) => svgEl('circle', { r: rS(t * mx), fill: 'none', stroke: ctx.c.grid, 'stroke-width': ctx.hair }, gg));
  const f = fmtV(ctx);
  xl.forEach((x, i) => {
    let acc = 0;
    cl.forEach((c, k) => {
      const v = get(x, c); if (!v) return;
      const a = d3.arc().innerRadius(rS(acc)).outerRadius(rS(acc + v)).startAngle(i * step + 0.01).endAngle((i + 1) * step - 0.01);
      tip(svgEl('path', { d: a(), fill: fillFor(ctx, ec ? color(c) : singleColor(ctx), k), stroke: ctx.c.bg, 'stroke-width': ctx.gapW * 0.6, 'data-cat': ec ? c : null }, gg), `<b>${x}</b>${ec ? ` · ${c}` : ''}<br>${f(v)}`);
      acc += v;
    });
    const ang = (i + 0.5) * step;
    text(gg, Math.sin(ang) * (R + fs.tick * 1.1), -Math.cos(ang) * (R + fs.tick * 1.1), x, { size: fs.tick, fill: ctx.c.muted, family: ctx.th.font, anchor: 'middle', baseline: 'central' });
  });
  ctx.note('Rosa polar: el área de cada sector (no su radio) es proporcional al valor.');
}
export function radialbar(ctx) {
  const ex = enc(ctx, 'x'), ey = enc(ctx, 'y');
  if (!ex) return ctx.need('Elegí las categorías.');
  if (ctx.measure) return {};
  const xl = levelsIn(ctx, ex, ctx.rows);
  const agg = ey ? ctx.panel.agg || 'sum' : 'count';
  const data = groupAgg(ctx.rows, [(r) => (r[ex.j] == null ? null : String(r[ex.j]))], ey ? (r) => r[ey.j] : null, agg);
  const it = xl.map((l) => ({ l, v: (data.find((d) => d.keys[0] === l) || {}).value || 0 }));
  const tot = it.reduce((a, b) => a + b.v, 0);
  const max = +ctx.opt.radialMax || (ctx.opt.radialShare !== false && !ey ? tot : Math.max(...it.map((d) => d.v)) * 1.05);
  const color = colorScale(ctx, ex.key);
  const box = withLegend(ctx, null);
  const g = ctx.g, fs = ctx.th.sizes;
  const R = Math.min(box.w, box.h) / 2 - 2;
  const cx = box.x + box.w / 2, cy = box.y + box.h / 2;
  const gg = svgEl('g', { transform: `translate(${cx},${cy})` }, g);
  const r0 = R * 0.28, ring = (R - r0) / it.length;
  const w = ring * 0.72;
  const f = fmtV(ctx), pf = makeFormat({ comma: ctx.comma, decimals: 0 });
  it.forEach((d, i) => {
    const ri = R - i * ring - w;
    svgEl('path', { d: d3.arc().innerRadius(ri).outerRadius(ri + w).startAngle(0).endAngle(Math.PI * 1.5).cornerRadius(w / 2)(), fill: ctx.th.dark ? mixHex(ctx.c.bg, '#ffffff', 0.08) : ctx.c.grid }, gg);
    const end = Math.PI * 1.5 * Math.min(1, d.v / max);
    tip(svgEl('path', { d: d3.arc().innerRadius(ri).outerRadius(ri + w).startAngle(0).endAngle(Math.max(0.001, end)).cornerRadius(w / 2)(), fill: fillFor(ctx, color(d.l), 0), filter: glowFilter(ctx), 'data-cat': d.l }, gg), `<b>${d.l}</b><br>${f(d.v)}`);
    const lab = `${d.l} · ${max === tot ? `${pf((d.v / tot) * 100)} %` : f(d.v)}`;
    text(gg, -4, -(ri + w / 2), fitText(lab, Math.min(fs.label, w * 0.75), R, ctx.th.font), { size: Math.min(fs.label, w * 0.75), fill: ctx.c.ink, family: ctx.th.font, anchor: 'end', baseline: 'central', weight: 600 });
  });
}

// ======================= CALENDARIO =======================
export function calendar(ctx) {
  const ex = enc(ctx, 'x'), ey = enc(ctx, 'y');
  if (!ex || ex.col.type !== 'date') return ctx.need('Elegí una columna de fechas.');
  if (ctx.measure) return {};
  const agg = ey ? ctx.panel.agg || 'mean' : 'count';
  const data = groupAgg(ctx.rows, [(r) => (r[ex.j] ? String(r[ex.j]).slice(0, 10) : null)], ey ? (r) => r[ey.j] : null, agg);
  const byDay = new Map(data.map((d) => [d.keys[0], d.value]));
  const vals = [...byDay.values()].filter(Number.isFinite);
  const lo = Math.min(...vals), hi = Math.max(...vals);
  const f = fmtV(ctx);
  const box = withLegend(ctx, { type: 'ramp', title: ey ? ey.name : 'Casos', stops: [0, 0.25, 0.5, 0.75, 1].map((t) => ctx.seq(t)), labels: [f(lo), f((lo + hi) / 2), f(hi)] });
  const g = ctx.g, fs = ctx.th.sizes;
  const years = [...new Set([...byDay.keys()].map((k) => +k.slice(0, 4)))].sort();
  const left = fs.tick * 3.2;
  const cell = Math.min((box.w - left) / 53, (box.h - fs.tick * 1.5) / (years.length * 8));
  years.forEach((y, yi) => {
    const y0 = box.y + fs.tick * 1.4 + yi * cell * 8;
    text(g, box.x, y0 + cell * 3.5, String(y), { size: fs.tick, fill: ctx.c.ink, family: ctx.th.font, weight: 700, baseline: 'central' });
    const start = Date.UTC(y, 0, 1);
    const off = (new Date(start).getUTCDay() + 6) % 7;
    for (let d = 0; d < 366; d++) {
      const t = new Date(start + d * 86400000);
      if (t.getUTCFullYear() !== y) break;
      const key = t.toISOString().slice(0, 10);
      const wk = Math.floor((d + off) / 7), dow = (t.getUTCDay() + 6) % 7;
      const v = byDay.get(key);
      tip(svgEl('rect', { x: box.x + left + wk * cell, y: y0 + dow * cell, width: cell * 0.9, height: cell * 0.9, rx: cell * 0.15, fill: v == null ? ctx.c.grid : ctx.seq((v - lo) / (hi - lo || 1)) }, g), `${t.getUTCDate()} ${MESES[t.getUTCMonth()]} ${y}<br>${v == null ? 'sin dato' : f(v)}`);
      if (t.getUTCDate() === 1 && yi === 0) text(g, box.x + left + wk * cell, y0 - fs.tick * 0.35, MESES[t.getUTCMonth()], { size: fs.tick * 0.9, fill: ctx.c.muted, family: ctx.th.font });
    }
    ['l', 'm', 'v'].forEach((dn, k) => text(g, box.x + left - 2, y0 + [0, 2, 4][k] * cell + cell * 0.45, dn, { size: fs.tick * 0.8, fill: ctx.c.muted, family: ctx.th.font, anchor: 'end', baseline: 'central' }));
  });
}

// ======================= ENJAMBRE =======================
export function beeswarm(ctx) {
  const ex = enc(ctx, 'x'), ec = enc(ctx, 'color'), eg = enc(ctx, 'group'), el = enc(ctx, 'label');
  if (!ex || !isNum(ex.col)) return ctx.need('Elegí la variable numérica.');
  const pts = ctx.rows.filter((r) => r[ex.j] != null && Number.isFinite(+r[ex.j])).map((r) => ({ v: +r[ex.j], c: ec ? r[ec.j] : null, g: eg ? String(r[eg.j]) : '', l: el ? r[el.j] : null }));
  const dom = [Math.min(...pts.map((p) => p.v)), Math.max(...pts.map((p) => p.v))];
  if (ctx.measure) return { x: dom };
  const o = ctx.opt;
  const lanes = eg ? levelsIn(ctx, eg, ctx.rows) : [''];
  const cl = ec ? levelsIn(ctx, ec, ctx.rows) : [];
  const color = colorScale(ctx, ec ? ec.key : null);
  const box = withLegend(ctx, ec ? catLegend(ctx, ec.name, cl, color, 'circle') : null);
  const g = ctx.g;
  const sx0 = niceLinear(ctx.fixed?.x || dom, 6, { min: o.xMin, max: o.xMax, log: o.xLog });
  const xt = sx0.ticks(Math.max(3, Math.round(box.w / (ctx.th.sizes.tick * 7))));
  const L = layoutPlot(ctx, box, eg ? { yBand: true, yLabels: lanes, xTicks: xt, xTitle: xAxisTitle(ctx, ex) } : { xTicks: xt, xTitle: xAxisTitle(ctx, ex) });
  const inner = L.inner;
  const sx = sx0.copy().range([inner.x, inner.x + inner.w]);
  const by = d3.scaleBand().domain(lanes).range([inner.y, inner.y + inner.h]).padding(0.08);
  drawGridX({ ...ctx, th: { ...ctx.th, gridX: true } }, g, sx, inner, xt);
  const r = Math.max(ctx.pointR * 0.55, Math.min(ctx.pointR * 1.4, Math.sqrt((inner.w * by.bandwidth()) / (Math.max(1, pts.length / lanes.length) * 14))));
  const d = r * 2.05;
  for (const ln of lanes) {
    const mid = by(ln) + by.bandwidth() / 2;
    const lp = pts.filter((p) => p.g === ln).map((p) => ({ ...p, x: sx(p.v) })).sort((a, b) => a.x - b.x);
    const placed = [];
    for (const p of lp) {
      let best = 0;
      for (let k = 0; k < 400; k++) {
        const off = k === 0 ? 0 : (k % 2 ? 1 : -1) * Math.ceil(k / 2) * d * 0.55;
        if (Math.abs(off) > by.bandwidth() / 2) { best = off; break; }
        if (!placed.some((q) => Math.abs(q.x - p.x) < d && Math.abs(q.y - (mid + off)) < d)) { best = off; break; }
      }
      p.y = mid + best;
      placed.push(p);
      tip(svgEl('circle', { cx: p.x, cy: p.y, r, fill: ec ? color(p.c) : singleColor(ctx), 'fill-opacity': 0.85, stroke: ctx.c.bg, 'stroke-width': ctx.gapW * 0.5 }, g), `${p.l != null ? `<b>${p.l}</b><br>` : ''}${fmtV(ctx)(p.v)}`);
    }
  }
  if (eg) axisLeft({ ...ctx, th: { ...ctx.th, axisLineY: false } }, g, by, inner, { band: true });
  axisBottom(ctx, g, sx, inner, { ticks: xt, title: xAxisTitle(ctx, ex) });
}

// ======================= DISTRIBUCIÓN ACUMULADA =======================
export function ecdf(ctx) {
  const ey = enc(ctx, 'y'), ec = enc(ctx, 'color');
  if (!ey || !isNum(ey.col)) return ctx.need('Elegí una variable numérica.');
  const cl = ec ? levelsIn(ctx, ec, ctx.rows) : ['__'];
  const ser = cl.map((c) => ({ c, v: ctx.rows.filter((r) => (!ec || String(r[ec.j]) === c) && r[ey.j] != null).map((r) => +r[ey.j]).sort((a, b) => a - b) })).filter((s) => s.v.length);
  const all = ser.flatMap((s) => s.v);
  const dom = [Math.min(...all), Math.max(...all)];
  if (ctx.measure) return { x: dom, y: [0, 100] };
  const color = colorScale(ctx, ec ? ec.key : null);
  const box = withLegend(ctx, ec ? catLegend(ctx, ec.name, cl, color, 'line') : null);
  const g = ctx.g;
  const sx0 = niceLinear(ctx.fixed?.x || dom, 6, { min: ctx.opt.xMin, max: ctx.opt.xMax, log: ctx.opt.xLog });
  const xt = sx0.ticks(6), yt = [0, 25, 50, 75, 100];
  const yTitle = ctx.noYTitle ? '' : 'Porcentaje acumulado de casos';
  const L = layoutPlot(ctx, box, { yTicks: yt, xTicks: xt, yLabels: yt.map((v) => `${v} %`), yTitle, xTitle: xAxisTitle(ctx, ey) });
  const inner = L.inner;
  const sx = sx0.copy().range([inner.x, inner.x + inner.w]), sy = d3.scaleLinear().domain([0, 100]).range([inner.y + inner.h, inner.y]);
  drawGridY(ctx, g, sy, inner, yt);
  ser.forEach((s) => {
    const n = s.v.length;
    const pts = [[s.v[0], 0], ...s.v.map((v, i) => [v, ((i + 1) / n) * 100])];
    svgEl('path', { d: d3.line().curve(d3.curveStepAfter).x((p) => sx(p[0])).y((p) => sy(p[1]))(pts), fill: 'none', stroke: ec ? color(s.c) : singleColor(ctx), 'stroke-width': ctx.lineW }, g);
  });
  [25, 50, 75].forEach((q) => svgEl('line', { x1: inner.x, x2: inner.x + inner.w, y1: sy(q), y2: sy(q), stroke: ctx.c.grid, 'stroke-width': ctx.hair, 'stroke-dasharray': '2 2' }, g));
  axisLeft(ctx, g, sy, inner, { ticks: yt, labels: yt.map((v) => `${v} %`), title: yTitle });
  axisBottom(ctx, g, sx, inner, { ticks: xt, title: xAxisTitle(ctx, ey) });
  ctx.note('Distribución acumulada: para cada valor, qué porcentaje de casos queda por debajo. La mediana es donde la curva cruza el 50 %.');
}

// ======================= DENSIDAD 2D (hexágonos) =======================
export function hexbin(ctx) {
  const ex = enc(ctx, 'x'), ey = enc(ctx, 'y');
  if (!ex || !ey) return ctx.need('Elegí las dos variables numéricas.');
  const pts = ctx.rows.filter((r) => Number.isFinite(+r[ex.j]) && Number.isFinite(+r[ey.j]) && r[ex.j] != null && r[ey.j] != null).map((r) => [+r[ex.j], +r[ey.j]]);
  const xd = d3.extent(pts, (p) => p[0]), yd = d3.extent(pts, (p) => p[1]);
  if (ctx.measure) return { x: xd, y: yd };
  const o = ctx.opt;
  const sx0 = niceLinear(xd, 6, { log: o.xLog }), sy0 = niceLinear(yd, 5, { log: o.yLog });
  const xt = sx0.ticks(6), yt = sy0.ticks(5);
  const box0 = ctx.box;
  const yTitle = ctx.noYTitle ? '' : `${ey.name}${ey.col.unit ? ` (${ey.col.unit})` : ''}`;
  const tmpL = layoutPlot(ctx, { ...box0, w: box0.w * 0.82 }, { yTicks: yt, xTicks: xt, yTitle, xTitle: xAxisTitle(ctx, ex) });
  const sx = sx0.copy().range([tmpL.inner.x, tmpL.inner.x + tmpL.inner.w]), sy = sy0.copy().range([tmpL.inner.y + tmpL.inner.h, tmpL.inner.y]);
  const rad = Math.max(3, Math.min(tmpL.inner.w, tmpL.inner.h) / (+o.hexSize || 18));
  const dx = rad * Math.sqrt(3), dy = rad * 1.5;
  const bins = new Map();
  for (const p of pts) {
    const px = sx(p[0]), py = sy(p[1]);
    let j = Math.round(py / dy), i = Math.round(px / dx - (j & 1) / 2);
    const key = `${i},${j}`;
    bins.set(key, (bins.get(key) || 0) + 1);
  }
  const mx = Math.max(...bins.values());
  const box = withLegend(ctx, { type: 'ramp', title: 'Casos', stops: [0, 0.25, 0.5, 0.75, 1].map((t) => ctx.seq(t)), labels: ['1', String(Math.round(mx / 2)), String(mx)] });
  const L = layoutPlot(ctx, box, { yTicks: yt, xTicks: xt, yTitle, xTitle: xAxisTitle(ctx, ex) });
  const inner = L.inner;
  const sx2 = sx0.copy().range([inner.x, inner.x + inner.w]), sy2 = sy0.copy().range([inner.y + inner.h, inner.y]);
  const g = ctx.g;
  bins.clear();
  for (const p of pts) {
    const px = sx2(p[0]), py = sy2(p[1]);
    const j = Math.round(py / dy), i = Math.round(px / dx - (j & 1) / 2);
    const key = `${i},${j}`;
    bins.set(key, (bins.get(key) || 0) + 1);
  }
  const hex = (cx, cy) => d3.range(6).map((k) => { const a = (Math.PI / 3) * k + Math.PI / 6; return `${k ? 'L' : 'M'}${cx + rad * Math.cos(a)},${cy + rad * Math.sin(a)}`; }).join('') + 'Z';
  for (const [k, n] of bins) {
    const [i, j] = k.split(',').map(Number);
    const cx = (i + (j & 1) / 2) * dx, cy = j * dy;
    tip(svgEl('path', { d: hex(cx, cy), fill: ctx.seq(0.12 + 0.88 * (n / mx)), stroke: ctx.c.bg, 'stroke-width': ctx.hair }, g), `${n} casos`);
  }
  axisLeft(ctx, g, sy2, inner, { ticks: yt, title: yTitle });
  axisBottom(ctx, g, sx2, inner, { ticks: xt, title: xAxisTitle(ctx, ex) });
}

// ======================= RANKING (BUMP) =======================
export function bump(ctx) {
  const ex = enc(ctx, 'x'), ey = enc(ctx, 'y'), ec = enc(ctx, 'color');
  if (!ex || !ey || !ec) return ctx.need('Elegí el tiempo, el valor y las series que se ordenan.');
  if (ctx.measure) return {};
  const xs = ex.col.type === 'num' ? [...new Set(ctx.rows.map((r) => r[ex.j]).filter((v) => v != null))].sort((a, b) => a - b).map(String) : levelsIn(ctx, ex, ctx.rows);
  const cl = levelsIn(ctx, ec, ctx.rows);
  const data = groupAgg(ctx.rows, [(r) => (r[ex.j] == null ? null : String(r[ex.j])), (r) => String(r[ec.j])], (r) => r[ey.j], ctx.panel.agg || 'sum');
  const rank = {};
  xs.forEach((x) => { const v = cl.map((c) => [c, (data.find((d) => d.keys[0] === x && d.keys[1] === c) || {}).value]).filter((p) => p[1] != null).sort((a, b) => (ctx.opt.rankAsc ? a[1] - b[1] : b[1] - a[1])); v.forEach(([c], i) => { rank[`${x}|${c}`] = i + 1; }); });
  const color = colorScale(ctx, ec.key);
  const box = withLegend(ctx, null);
  const g = ctx.g, fs = ctx.th.sizes;
  const lw = Math.min(box.w * 0.22, Math.max(...cl.map((c) => textWidth(c, fs.label, ctx.th.font))) + fs.label);
  const inner = { x: box.x + lw, y: box.y + fs.tick * 2.6, w: box.w - lw * 2, h: box.h - fs.tick * 3.2 };
  const px = d3.scalePoint().domain(xs).range([inner.x, inner.x + inner.w]);
  const py = d3.scalePoint().domain(d3.range(1, cl.length + 1)).range([inner.y, inner.y + inner.h]);
  xs.forEach((x) => text(g, px(x), box.y + fs.tick, x, { size: fs.tick, fill: ctx.c.muted, family: ctx.th.font, anchor: 'middle' }));
  cl.forEach((c) => {
    const pts = xs.map((x) => [x, rank[`${x}|${c}`]]).filter((p) => p[1]);
    if (!pts.length) return;
    const col = color(c);
    const dim = ctx.opt.highlight && ctx.opt.highlight !== c;
    svgEl('path', { d: d3.line().curve(d3.curveMonotoneX)(pts.map((p) => [px(p[0]), py(p[1])])), fill: 'none', stroke: dim ? ctx.c.grid : col, 'stroke-width': ctx.lineW * (dim ? 1 : 2) }, g);
    pts.forEach((p) => { svgEl('circle', { cx: px(p[0]), cy: py(p[1]), r: fs.label * 0.62, fill: dim ? ctx.c.grid : col }, g); text(g, px(p[0]), py(p[1]), String(p[1]), { size: fs.label * 0.7, fill: readableOn(dim ? ctx.c.grid : col), family: ctx.th.font, anchor: 'middle', baseline: 'central', weight: 700 }); });
    text(g, px(pts[0][0]) - fs.label, py(pts[0][1]), c, { size: fs.label, fill: ctx.c.ink, family: ctx.th.font, anchor: 'end', baseline: 'central' });
    const last = pts[pts.length - 1];
    text(g, px(last[0]) + fs.label, py(last[1]), c, { size: fs.label, fill: ctx.c.ink, family: ctx.th.font, baseline: 'central' });
  });
  ctx.note(`Posición de cada serie en cada momento (1 = ${ctx.opt.rankAsc ? 'menor' : 'mayor'} valor).`);
}

// ======================= MEDIDOR =======================
export function gauge(ctx) {
  const ey = enc(ctx, 'y');
  if (!ey) return ctx.need('Elegí la variable.');
  if (ctx.measure) return {};
  const o = ctx.opt;
  const v = aggregate(ctx.rows.map((r) => r[ey.j]), ctx.panel.agg || 'mean');
  const min = +o.gMin || 0, max = +o.gMax || (Math.max(...ctx.rows.map((r) => +r[ey.j] || 0)) || 1);
  const box = withLegend(ctx, null);
  const g = ctx.g, fs = ctx.th.sizes;
  const bigS = Math.min(fs.big, box.h * 0.16);
  const R = Math.max(10, Math.min(box.w / 2 - 4, box.h - bigS * 2.4 - fs.label * 2));
  const cx = box.x + box.w / 2, cy = box.y + 4 + R;
  const gg = svgEl('g', { transform: `translate(${cx},${cy})` }, g);
  const ang = (x) => -Math.PI / 2 + Math.PI * Math.max(0, Math.min(1, (x - min) / (max - min)));
  const w = R * 0.22;
  const bands = String(o.bands || '').split(/[;,]\s*/).map(Number).filter(Number.isFinite);
  if (bands.length) {
    const b = [min, ...bands, max];
    const sem = ['#2f7d4f', '#d9a21b', '#b3261e'];
    for (let i = 0; i < b.length - 1; i++) svgEl('path', { d: d3.arc().innerRadius(R - w).outerRadius(R).startAngle(ang(b[i])).endAngle(ang(b[i + 1]))(), fill: mixHex(sem[Math.min(2, i)], ctx.c.bg, 0.25) }, gg);
  } else {
    svgEl('path', { d: d3.arc().innerRadius(R - w).outerRadius(R).startAngle(-Math.PI / 2).endAngle(Math.PI / 2).cornerRadius(w / 2)(), fill: ctx.th.dark ? mixHex(ctx.c.bg, '#ffffff', 0.1) : ctx.c.grid }, gg);
    svgEl('path', { d: d3.arc().innerRadius(R - w).outerRadius(R).startAngle(-Math.PI / 2).endAngle(ang(v)).cornerRadius(w / 2)(), fill: fillFor(ctx, singleColor(ctx), 0, 'h'), filter: glowFilter(ctx) }, gg);
  }
  const a = ang(v);
  svgEl('line', { x1: 0, y1: 0, x2: Math.sin(a) * (R - w * 1.2), y2: -Math.cos(a) * (R - w * 1.2), stroke: ctx.c.ink, 'stroke-width': ctx.lineW * 1.6, 'stroke-linecap': 'round' }, gg);
  svgEl('circle', { r: w * 0.25, fill: ctx.c.ink }, gg);
  if (o.target != null && o.target !== '') { const t = ang(+o.target); svgEl('line', { x1: Math.sin(t) * (R - w - 2), y1: -Math.cos(t) * (R - w - 2), x2: Math.sin(t) * (R + 3), y2: -Math.cos(t) * (R + 3), stroke: ctx.c.ink, 'stroke-width': ctx.lineW * 1.4 }, gg); }
  const f = fmtV(ctx);
  text(gg, 0, bigS * 1.25, `${f(v)}${ey.col.unit ? ` ${ey.col.unit}` : ''}`, { size: bigS, fill: ctx.c.ink, family: ctx.th.fontTitle, anchor: 'middle', weight: 800 });
  text(gg, -R + w / 2, fs.tick * 1.3, f(min), { size: fs.tick, fill: ctx.c.muted, family: ctx.th.font, anchor: 'middle' });
  text(gg, R - w / 2, fs.tick * 1.3, f(max), { size: fs.tick, fill: ctx.c.muted, family: ctx.th.font, anchor: 'middle' });
  text(gg, 0, bigS * 1.25 + fs.label * 1.6, yAxisTitle(ctx, ey, ctx.panel.agg || 'mean'), { size: fs.label, fill: ctx.c.muted, family: ctx.th.font, anchor: 'middle' });
}

// ======================= BARRAS DE PROGRESO =======================
export function progress(ctx) {
  const ex = enc(ctx, 'x'), ey = enc(ctx, 'y');
  if (!ex) return ctx.need('Elegí las categorías.');
  if (ctx.measure) return {};
  const o = ctx.opt;
  const lv = levelsIn(ctx, ex, ctx.rows);
  const agg = ey ? ctx.panel.agg || 'sum' : 'count';
  const data = groupAgg(ctx.rows, [(r) => (r[ex.j] == null ? null : String(r[ex.j]))], ey ? (r) => r[ey.j] : null, agg);
  let it = lv.map((l) => ({ l, v: (data.find((d) => d.keys[0] === l) || {}).value || 0 }));
  if (o.sort === 'desc') it.sort((a, b) => b.v - a.v);
  const tot = it.reduce((a, b) => a + b.v, 0);
  const asPct = o.progressMode !== 'value' && (!ey || o.progressMode === 'pct' || (ey.col.unit === '%'));
  const max = +o.progressMax || (asPct ? (ey && ey.col.unit === '%' ? 100 : tot) : Math.max(...it.map((d) => d.v)));
  const color = colorScale(ctx, ex.key);
  const box = withLegend(ctx, null);
  const g = ctx.g, fs = ctx.th.sizes;
  const lw = Math.min(box.w * 0.34, Math.max(...it.map((d) => textWidth(ctx.th.upperLabels ? d.l.toUpperCase() : d.l, fs.label * 1.05, ctx.th.font, 700))) + fs.label);
  const vw = textWidth('100 %', fs.label * 1.1, ctx.th.font, 800) + fs.label;
  const rowH = box.h / it.length;
  const bh = Math.min(rowH * 0.48, fs.label * 2.2);
  const f = fmtV(ctx), pf = makeFormat({ comma: ctx.comma, decimals: 0 });
  it.forEach((d, i) => {
    const yc = box.y + rowH * (i + 0.5);
    const col = o.progressColor === 'single' ? singleColor(ctx) : color(d.l);
    text(g, box.x, yc, d.l, { size: fs.label * 1.05, fill: ctx.c.ink, family: ctx.th.font, baseline: 'central', weight: 700, upper: ctx.th.upperLabels });
    const x0 = box.x + lw, w = box.w - lw - vw;
    svgEl('rect', { x: x0, y: yc - bh / 2, width: w, height: bh, rx: bh / 2, fill: ctx.th.dark ? mixHex(ctx.c.bg, '#ffffff', 0.08) : ctx.c.grid }, g);
    tip(svgEl('rect', { x: x0, y: yc - bh / 2, width: Math.max(bh, w * Math.min(1, d.v / max)), height: bh, rx: bh / 2, fill: fillFor(ctx, col, 0, 'h'), filter: glowFilter(ctx), 'data-cat': d.l }, g), `<b>${d.l}</b><br>${f(d.v)}`);
    text(g, box.x + box.w, yc, asPct ? `${pf((d.v / max) * 100)} %` : f(d.v), { size: fs.label * 1.1, fill: ctx.c.ink, family: ctx.th.fontTitle, anchor: 'end', baseline: 'central', weight: 800 });
  });
}

// ======================= TABLA CON BARRAS =======================
export function tableChart(ctx) {
  const ex = enc(ctx, 'x');
  const vars = (ctx.panel.enc.vars || []).filter((k) => isNum(getCol(ctx.table, k)));
  if (!ex || !vars.length) return ctx.need('Elegí la columna de las filas y una o más variables numéricas.');
  if (ctx.measure) return {};
  const agg = ctx.panel.agg || 'sum';
  const lv = levelsIn(ctx, ex, ctx.rows);
  const js = vars.map((k) => ctx.table.columns.findIndex((c) => c.key === k));
  const vals = lv.map((l) => js.map((j) => aggregate(ctx.rows.filter((r) => String(r[ex.j]) === l).map((r) => r[j]), agg)));
  if (ctx.opt.sort === 'desc') { const ord = lv.map((l, i) => i).sort((a, b) => (vals[b][0] ?? -Infinity) - (vals[a][0] ?? -Infinity)); ord.forEach(() => {}); lv.splice(0, lv.length, ...ord.map((i) => lv[i])); vals.splice(0, vals.length, ...ord.map((i) => vals[i])); }
  const box = withLegend(ctx, null);
  const g = ctx.g, fs = ctx.th.sizes;
  const names = vars.map((k) => getCol(ctx.table, k).name);
  const lw = Math.min(box.w * 0.3, Math.max(textWidth(ex.name, fs.tick, ctx.th.font, 700), ...lv.map((l) => textWidth(l, fs.tick, ctx.th.font))) + fs.tick);
  const cw = (box.w - lw) / vars.length;
  const head = fs.tick * 2.6;
  const rh = Math.min(fs.tick * 2, (box.h - head) / lv.length);
  const f = fmtV(ctx);
  text(g, box.x, box.y + head - fs.tick * 0.6, ex.name, { size: fs.tick, fill: ctx.c.ink, family: ctx.th.font, weight: 700 });
  names.forEach((n, k) => wrapText(n, fs.tick, cw - fs.tick, ctx.th.font, 700, 2).forEach((l, q, arr) => text(g, box.x + lw + k * cw + cw - fs.tick * 0.5, box.y + head - fs.tick * 0.6 - (arr.length - 1 - q) * fs.tick * 1.1, l, { size: fs.tick, fill: ctx.c.ink, family: ctx.th.font, weight: 700, anchor: 'end' })));
  svgEl('line', { x1: box.x, x2: box.x + box.w, y1: box.y + head, y2: box.y + head, stroke: ctx.c.ink, 'stroke-width': ctx.axisW }, g);
  const maxes = js.map((_, k) => Math.max(...vals.map((r) => Math.abs(r[k] || 0))) || 1);
  const pal = PAL(ctx, vars.length);
  lv.forEach((l, i) => {
    const y = box.y + head + i * rh;
    if (i % 2) svgEl('rect', { x: box.x, y, width: box.w, height: rh, fill: ctx.th.dark ? mixHex(ctx.c.bg, '#ffffff', 0.04) : mixHex(ctx.c.grid, ctx.c.bg, 0.5) }, g);
    text(g, box.x + fs.tick * 0.2, y + rh / 2, fitText(l, fs.tick, lw - fs.tick * 0.5, ctx.th.font), { size: fs.tick, fill: ctx.c.ink, family: ctx.th.font, baseline: 'central' });
    vals[i].forEach((v, k) => {
      const x0 = box.x + lw + k * cw;
      if (v != null) svgEl('rect', { x: x0 + fs.tick * 0.3, y: y + rh * 0.2, width: (cw - fs.tick * 0.8) * (Math.abs(v) / maxes[k]), height: rh * 0.6, fill: mixHex(pal[k], ctx.c.bg, 0.55) }, g);
      text(g, x0 + cw - fs.tick * 0.5, y + rh / 2, v == null ? '—' : f(v), { size: fs.tick, fill: ctx.c.ink, family: ctx.th.font, anchor: 'end', baseline: 'central' });
    });
  });
  svgEl('line', { x1: box.x, x2: box.x + box.w, y1: box.y + head + lv.length * rh, y2: box.y + head + lv.length * rh, stroke: ctx.c.ink, 'stroke-width': ctx.axisW }, g);
}
