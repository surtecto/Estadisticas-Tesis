// Gráficos con ejes: barras, puntos, medias con intervalos, histogramas, densidades, cajas, violines, Q-Q,
// dispersión, líneas, áreas, pendientes, pirámide, coeficientes y biplot.
import { svgEl, mixHex } from '../util.js';
import * as S from '../stats/engine.js';
import { pnorm, qnorm } from '../stats/dist.js';
import { num1, pcell } from '../stats/report.js';
import { levelsOf, getCol, isNum } from '../data/table.js';
import {
  d3, text, textWidth, enc, valOf, groupAgg, levelsIn, niceLinear, layoutPlot, drawGridY, drawGridX, axisLeft, axisBottom,
  colorScale, singleColor, fillFor, glowFilter, makeFormat, timeValue, measureLegend, drawLegend, wrapText,
} from './core.js';

// ---------- leyenda: reserva lugar y la dibuja ----------
export function withLegend(ctx, lg) {
  ctx.legendObj = lg;
  if (!lg || ctx.legendHandled || ctx.opt.legend === 'none') return ctx.box;
  const b = ctx.box;
  const maxLab = lg.items ? Math.max(0, ...lg.items.map((i) => textWidth(i.label, ctx.th.sizes.legend, ctx.th.font))) : 0;
  let pos = ctx.opt.legend && ctx.opt.legend !== 'auto' ? ctx.opt.legend : (b.w > b.h * 1.15 && maxLab < b.w * 0.22 && (!lg.items || lg.items.length <= 10) ? 'right' : 'bottom');
  if (lg.type === 'ramp' && ctx.opt.legend === 'auto') pos = b.w > b.h * 1.2 ? 'right' : 'bottom';
  ctx.legendPos = pos;
  const m = measureLegend(ctx, lg, pos === 'right' ? b.w : b.w);
  const gap = ctx.th.sizes.legend * 0.9;
  let nb;
  if (pos === 'right') { drawLegend(ctx, ctx.g, lg, { x: b.x + b.w - m.w, y: b.y + ctx.pad, w: m.w, h: m.h }); nb = { ...b, w: b.w - m.w - gap }; }
  else if (pos === 'top') { drawLegend(ctx, ctx.g, lg, { x: b.x, y: b.y, w: b.w, h: m.h }); nb = { ...b, y: b.y + m.h + gap * 0.5, h: b.h - m.h - gap * 0.5 }; }
  else { drawLegend(ctx, ctx.g, lg, { x: b.x, y: b.y + b.h - m.h, w: b.w, h: m.h }); nb = { ...b, h: b.h - m.h - gap * 0.6 }; }
  ctx.panelBox = nb;
  return nb;
}
export const catLegend = (ctx, title, levels, color, shape) => (levels.length > 1 || ctx.opt.legend === 'force' ? { type: 'cat', title, items: levels.map((l, i) => ({ label: l, color: color(l), fill: fillFor(ctx, color(l), i), shape })) } : null);
export const tip = (el, html) => { el.setAttribute('data-tip', html); return el; };
export const fmtV = (ctx) => makeFormat({ comma: ctx.comma, decimals: ctx.opt.valueDecimals ?? null });
export function yAxisTitle(ctx, e, agg) {
  if (ctx.opt.yTitle != null && ctx.opt.yTitle !== '') return ctx.opt.yTitle;
  if (ctx.noYTitle) return '';
  if (!e) return 'Cantidad de casos';
  const unit = e.col.unit ? ` (${e.col.unit})` : '';
  const a = { mean: 'Media de ', median: 'Mediana de ', sum: '', count: 'Casos', max: 'Máximo de ', min: 'Mínimo de ', sd: 'DE de ', pct: '% de ', first: '' }[agg || 'sum'] ?? '';
  return agg === 'count' ? 'Cantidad de casos' : `${a}${a ? e.name.charAt(0).toLowerCase() + e.name.slice(1) : e.name}${unit}`;
}
export const xAxisTitle = (ctx, e) => (ctx.opt.xTitle != null && ctx.opt.xTitle !== '' ? ctx.opt.xTitle : ctx.noXTitle || !e ? '' : `${e.name}${e.col.unit ? ` (${e.col.unit})` : ''}`);
function refLines(ctx, g, sy, inner, horizontal = false, sx = null) {
  const v = ctx.opt.refLine;
  if (v == null || v === '' || !Number.isFinite(+v)) return;
  const s = horizontal ? sx : sy;
  const p = s(+v);
  if (!Number.isFinite(p)) return;
  const st = { stroke: ctx.c.ink, 'stroke-width': ctx.hair * 1.6, 'stroke-dasharray': `${ctx.lineW * 2} ${ctx.lineW * 1.5}` };
  if (horizontal) svgEl('line', { x1: p, x2: p, y1: inner.y, y2: inner.y + inner.h, ...st }, g);
  else svgEl('line', { x1: inner.x, x2: inner.x + inner.w, y1: p, y2: p, ...st }, g);
  if (ctx.opt.refLabel) text(g, horizontal ? p + 3 : inner.x + inner.w, horizontal ? inner.y + ctx.th.sizes.label : p - 2.5, ctx.opt.refLabel, { size: ctx.th.sizes.label, fill: ctx.c.ink, family: ctx.th.font, anchor: horizontal ? 'start' : 'end', italic: true });
}
function yScale(ctx, dom, inner, { zero = false } = {}) {
  const o = ctx.opt;
  const s = niceLinear(ctx.fixed && ctx.fixed.y ? ctx.fixed.y : dom, Math.max(3, Math.round(inner.h / (ctx.th.sizes.tick * 4.2))), { zero: zero || o.yZero, min: o.yMin, max: o.yMax, log: o.yLog });
  return s;
}
function ticksOf(s, n) { return s.ticks ? s.ticks(n) : s.domain(); }
// rótulo de valor solo si entra (afuera de la barra en caso contrario)
function valueLabel(ctx, g, x, y, str, { anchor = 'middle', inside = false, fill = null, baseline = 'alphabetic' } = {}) {
  return text(g, x, y, str, { size: ctx.th.sizes.label, fill: fill || ctx.c.ink, family: ctx.th.font, anchor, baseline, weight: ctx.th.id === 'info-azul' || ctx.th.id === 'neon' ? 700 : 400 });
}

// ======================= BARRAS =======================
export function bar(ctx) {
  const ex = enc(ctx, 'x'), ey = enc(ctx, 'y'), ec = enc(ctx, 'color');
  if (!ex) return ctx.need('Elegí la variable de categorías (eje).');
  const o = ctx.opt;
  const agg = ey ? ctx.panel.agg || 'sum' : 'count';
  const rows = ctx.rows;
  let xl = ctx.fixed?.xLevels || levelsIn(ctx, ex, rows);
  const cl = ec ? (ctx.fixed?.cLevels || levelsIn(ctx, ec, rows)) : ['__'];
  const data = groupAgg(rows, [(r) => (r[ex.j] == null ? null : String(r[ex.j])), (r) => (ec ? (r[ec.j] == null ? null : String(r[ec.j])) : '__')], ey ? (r) => r[ey.j] : null, agg === 'pct' ? 'sum' : agg);
  const get = (a, b) => data.find((d) => d.keys[0] === a && d.keys[1] === b);
  let stack = ec ? o.stack || 'group' : 'none';
  const totals = Object.fromEntries(xl.map((x) => [x, cl.reduce((s, c) => s + ((get(x, c) || {}).value || 0), 0)]));
  const grand = Object.values(totals).reduce((a, b) => a + b, 0);
  const val = (x, c) => {
    const d = get(x, c); if (!d || d.value == null) return null;
    if (stack === 'percent') return totals[x] ? (d.value / totals[x]) * 100 : null;
    if (agg === 'pct') return grand ? (d.value / grand) * 100 : null;
    return d.value;
  };
  if (o.sort && o.sort !== 'none' && !ctx.fixed?.xLevels) {
    const key = (x) => (stack !== 'group' && ec ? totals[x] : val(x, cl[0]) ?? -Infinity);
    xl = xl.slice().sort((a, b) => (o.sort === 'desc' ? key(b) - key(a) : key(a) - key(b)));
  }
  const horiz = o.orientation === 'h';
  // barras de error (solo medias sin apilar)
  const err = (x, c) => {
    if (!ey || agg !== 'mean' || stack !== 'group' && ec || !o.errorBars || o.errorBars === 'none') return null;
    const d = get(x, c); if (!d) return null;
    const v = d.vals.filter((q) => q != null && Number.isFinite(q));
    if (v.length < 2) return null;
    const ds = S.describe(v);
    return o.errorBars === 'sd' ? [ds.mean - ds.sd, ds.mean + ds.sd] : o.errorBars === 'se' ? [ds.mean - ds.se, ds.mean + ds.se] : [ds.ciLow, ds.ciHigh];
  };
  let lo = 0, hi = 0;
  for (const x of xl) {
    if (stack === 'stack' || stack === 'percent') { let pos = 0, neg = 0; for (const c of cl) { const v = val(x, c) || 0; if (v >= 0) pos += v; else neg += v; } hi = Math.max(hi, pos); lo = Math.min(lo, neg); }
    else for (const c of cl) { const v = val(x, c); if (v != null) { hi = Math.max(hi, v); lo = Math.min(lo, v); } const e = err(x, c); if (e) { hi = Math.max(hi, e[1]); lo = Math.min(lo, e[0]); } }
  }
  if (stack === 'percent') { hi = 100; lo = 0; }
  if (ctx.measure) return { y: [lo, hi], xLevels: xl, cLevels: cl };
  const color = colorScale(ctx, ec ? ec.key : null);
  const base = singleColor(ctx);
  const colOf = (c, x) => (ec ? color(c) : o.highlight ? (x === o.highlight ? base : mixHex(base, ctx.th.dark ? ctx.th.bg : '#ffffff', 0.6)) : base);
  const box = withLegend(ctx, ec ? catLegend(ctx, ec.name, cl, color) : null);
  const g = ctx.g;
  const vTitle = stack === 'percent' ? (o.yTitle || 'Porcentaje') : agg === 'pct' ? (o.yTitle || '% del total') : yAxisTitle(ctx, ey, agg);
  const nT = Math.max(3, Math.round((horiz ? box.w : box.h) / (ctx.th.sizes.tick * (horiz ? 7 : 4.2))));
  const sv0 = niceLinear(ctx.fixed?.y || [lo, hi], nT, { zero: true, min: o.yMin, max: o.yMax, log: false });
  const vt = sv0.ticks(nT);
  const pctAxis = stack === 'percent' || agg === 'pct';
  const vf = makeFormat({ comma: ctx.comma, pct: pctAxis, decimals: o.yDecimals ?? (pctAxis ? 0 : null) });
  const L = horiz
    ? layoutPlot(ctx, box, { yBand: true, yLabels: xl, xTicks: vt, xLabels: vt.map((v) => vf(v, vt[1] - vt[0])), yTitle: xAxisTitle(ctx, ex), xTitle: vTitle })
    : layoutPlot(ctx, box, { xBand: true, xLabels: xl, yTicks: vt, yLabels: vt.map((v) => vf(v, vt[1] - vt[0])), yTitle: vTitle, xTitle: xAxisTitle(ctx, ex) });
  const inner = L.inner;
  const band = d3.scaleBand().domain(xl).range(horiz ? [inner.y, inner.y + inner.h] : [inner.x, inner.x + inner.w]).paddingInner(ctx.th.barGap).paddingOuter(ctx.th.barGap / 2);
  const sv = sv0.copy().range(horiz ? [inner.x, inner.x + inner.w] : [inner.y + inner.h, inner.y]);
  if (horiz) drawGridX({ ...ctx, th: { ...ctx.th, gridX: ctx.th.gridY } }, g, sv, inner, vt); else drawGridY(ctx, g, sv, inner, vt);
  const sub = d3.scaleBand().domain(cl).range([0, band.bandwidth()]).paddingInner(cl.length > 1 && stack === 'group' ? 0.08 : 0);
  const rad = ctx.th.barRadius;
  const fmt = fmtV(ctx);
  const gb = svgEl('g', { filter: glowFilter(ctx) }, g);
  const drawBar = (x, c, v0, v1, i, ci2) => {
    const a = sv(Math.min(v0, v1)), b = sv(Math.max(v0, v1));
    const pos = band(x) + (stack === 'group' ? sub(c) : 0), th = stack === 'group' ? sub.bandwidth() : band.bandwidth();
    const len = Math.abs(b - a);
    const gapAdj = ec && stack !== 'group' ? ctx.gapW : 0;
    const r = Math.min(rad, th / 2, len / 2);
    const fill = fillFor(ctx, colOf(c, x), ci2, horiz ? 'h' : 'v');
    let el;
    const dc = String(ec ? c : x);
    if (horiz) el = svgEl('rect', { x: a, y: pos, width: Math.max(0, len - gapAdj), height: th, fill, rx: r, 'data-cat': dc }, gb);
    else el = svgEl('rect', { x: pos, y: Math.min(a, b) + gapAdj, width: th, height: Math.max(0, len - gapAdj), fill, rx: r, 'data-cat': dc }, gb);
    if (ctx.th.patterns && ci2 > 0) el.setAttribute('stroke', colOf(c, x)), el.setAttribute('stroke-width', ctx.hair);
    tip(el, `<b>${x}</b>${ec ? ` · ${c}` : ''}<br>${fmt(v1 - v0)}${pctAxis ? ' %' : ''}`);
    return { pos, th, a, b, len };
  };
  for (const x of xl) {
    let pos = 0, neg = 0;
    cl.forEach((c, ci2) => {
      const v = val(x, c); if (v == null) return;
      if (stack === 'stack' || stack === 'percent') {
        const v0 = v >= 0 ? pos : neg, v1 = v0 + v;
        if (v >= 0) pos = v1; else neg = v1;
        const r = drawBar(x, c, v0, v1, 0, ci2);
        if (o.showValues && r.len > ctx.th.sizes.label * (horiz ? 2.4 : 1.4)) {
          const fill = ctx.th.patterns && ci2 > 0 ? ctx.c.ink : readable(colOf(c, x));
          if (horiz) valueLabel(ctx, g, (r.a + r.b) / 2, r.pos + r.th / 2, fmt(v) + (pctAxis ? ' %' : ''), { fill, baseline: 'central' });
          else valueLabel(ctx, g, r.pos + r.th / 2, (r.a + r.b) / 2, fmt(v) + (pctAxis ? ' %' : ''), { fill, baseline: 'central' });
        }
      } else {
        const r = drawBar(x, c, 0, v, 0, ci2);
        const e = err(x, c);
        if (e) {
          const m = r.pos + r.th / 2, w = Math.min(r.th * 0.35, ctx.th.sizes.tick);
          const p0 = sv(e[0]), p1 = sv(e[1]);
          const st = { stroke: ctx.c.ink, 'stroke-width': ctx.lineW * 0.8 };
          if (horiz) { svgEl('line', { x1: p0, x2: p1, y1: m, y2: m, ...st }, g); svgEl('line', { x1: p0, x2: p0, y1: m - w / 2, y2: m + w / 2, ...st }, g); svgEl('line', { x1: p1, x2: p1, y1: m - w / 2, y2: m + w / 2, ...st }, g); }
          else { svgEl('line', { y1: p0, y2: p1, x1: m, x2: m, ...st }, g); svgEl('line', { y1: p0, y2: p0, x1: m - w / 2, x2: m + w / 2, ...st }, g); svgEl('line', { y1: p1, y2: p1, x1: m - w / 2, x2: m + w / 2, ...st }, g); }
        }
        if (o.showValues) {
          const s = fmt(v) + (pctAxis ? ' %' : '');
          const tw = textWidth(s, ctx.th.sizes.label, ctx.th.font);
          const end = e ? sv(v >= 0 ? e[1] : e[0]) : sv(v);
          if (horiz) valueLabel(ctx, g, end + (v >= 0 ? 2.5 : -2.5), r.pos + r.th / 2, s, { anchor: v >= 0 ? 'start' : 'end', baseline: 'central' });
          else if (tw <= r.th * 1.6 || cl.length === 1) valueLabel(ctx, g, r.pos + r.th / 2, end + (v >= 0 ? -2.5 : ctx.th.sizes.label + 1.5), s);
        }
      }
    });
  }
  // línea de base
  const z = sv(0);
  if (horiz) svgEl('line', { x1: z, x2: z, y1: inner.y, y2: inner.y + inner.h, stroke: ctx.c.axis, 'stroke-width': ctx.axisW }, g);
  else svgEl('line', { x1: inner.x, x2: inner.x + inner.w, y1: z, y2: z, stroke: ctx.c.axis, 'stroke-width': ctx.axisW }, g);
  if (horiz) { axisLeft(ctx, g, band, inner, { band: true, title: xAxisTitle(ctx, ex) }); axisBottom({ ...ctx, th: { ...ctx.th, axisLineX: false } }, g, sv, inner, { ticks: vt, title: vTitle, fmt: vf }); }
  else { axisLeft(ctx, g, sv, inner, { ticks: vt, title: vTitle, fmt: vf }); axisBottom({ ...ctx, th: { ...ctx.th, axisLineX: false } }, g, band, inner, { band: true, rot: L.xRot, lines: L.xLines, title: xAxisTitle(ctx, ex) }); }
  refLines(ctx, g, sv, inner, horiz, sv);
  if (agg === 'mean' && !o.errorBars && ey) ctx.note('Barras de medias sin intervalos: conviene mostrar la dispersión (IC 95 %) o usar cajas o puntos.');
  if (!ey && agg !== 'count') ctx.note('Sin variable de valor: se cuentan los casos.');
}
const readable = (hex) => { const [r, g, b] = [1, 3, 5].map((i) => parseInt(String(hex).slice(i, i + 2), 16)); return 0.299 * r + 0.587 * g + 0.114 * b > 150 ? '#111111' : '#ffffff'; };

// ======================= PUNTOS (CLEVELAND) =======================
export function dot(ctx) {
  const ex = enc(ctx, 'x'), ey = enc(ctx, 'y'), ec = enc(ctx, 'color');
  if (!ex) return ctx.need('Elegí la variable de categorías.');
  const o = ctx.opt, agg = ey ? ctx.panel.agg || 'mean' : 'count';
  let xl = ctx.fixed?.xLevels || levelsIn(ctx, ex, ctx.rows);
  const cl = ec ? levelsIn(ctx, ec, ctx.rows) : ['__'];
  const data = groupAgg(ctx.rows, [(r) => (r[ex.j] == null ? null : String(r[ex.j])), (r) => (ec ? (r[ec.j] == null ? null : String(r[ec.j])) : '__')], ey ? (r) => r[ey.j] : null, agg);
  const get = (a, b) => { const d = data.find((q) => q.keys[0] === a && q.keys[1] === b); return d ? d.value : null; };
  if (o.sort && o.sort !== 'none' && !ctx.fixed?.xLevels) xl = xl.slice().sort((a, b) => (o.sort === 'desc' ? (get(b, cl[cl.length - 1]) ?? -Infinity) - (get(a, cl[cl.length - 1]) ?? -Infinity) : (get(a, cl[cl.length - 1]) ?? Infinity) - (get(b, cl[cl.length - 1]) ?? Infinity)));
  const vals = data.map((d) => d.value).filter(Number.isFinite);
  const dom = [Math.min(...vals, o.lollipop ? 0 : Infinity), Math.max(...vals)];
  if (ctx.measure) return { y: dom, xLevels: xl };
  const color = colorScale(ctx, ec ? ec.key : null);
  const box = withLegend(ctx, ec ? catLegend(ctx, ec.name, cl, color, 'circle') : null);
  const g = ctx.g;
  const nT = Math.max(3, Math.round(box.w / (ctx.th.sizes.tick * 7)));
  const sv0 = niceLinear(ctx.fixed?.y || dom, nT, { zero: !!o.lollipop || o.yZero, min: o.yMin, max: o.yMax, log: o.yLog });
  const vt = sv0.ticks(nT), vf = makeFormat({ comma: ctx.comma });
  const L = layoutPlot(ctx, box, { yBand: true, yLabels: xl, xTicks: vt, yTitle: '', xTitle: yAxisTitle(ctx, ey, agg) });
  const inner = L.inner;
  const band = d3.scaleBand().domain(xl).range([inner.y, inner.y + inner.h]).padding(0.3);
  const sv = sv0.copy().range([inner.x, inner.x + inner.w]);
  drawGridX({ ...ctx, th: { ...ctx.th, gridX: true } }, g, sv, inner, vt);
  const r = ctx.pointR * 1.35;
  const fmt = fmtV(ctx);
  for (const x of xl) {
    const yy = band(x) + band.bandwidth() / 2;
    const pts = cl.map((c) => [c, get(x, c)]).filter((p) => p[1] != null);
    const dim = o.highlight && x !== o.highlight;
    if (pts.length >= 2) { const xs = pts.map((p) => sv(p[1])); svgEl('line', { x1: Math.min(...xs), x2: Math.max(...xs), y1: yy, y2: yy, stroke: ctx.c.muted, 'stroke-width': ctx.lineW * 1.6, opacity: dim ? 0.3 : 0.55 }, g); }
    else if (o.lollipop && pts.length === 1) svgEl('line', { x1: sv(Math.max(sv.domain()[0], 0)), x2: sv(pts[0][1]), y1: yy, y2: yy, stroke: ec ? color(pts[0][0]) : singleColor(ctx), 'stroke-width': ctx.lineW, opacity: dim ? 0.3 : 1 }, g);
    for (const [c, v] of pts) {
      const col = ec ? color(c) : singleColor(ctx);
      tip(svgEl('circle', { cx: sv(v), cy: yy, r, fill: dim ? mixHex(col, ctx.c.bg, 0.6) : col, stroke: ctx.c.bg, 'stroke-width': ctx.gapW, 'data-cat': ec ? c : x }, g), `<b>${x}</b>${ec ? ` · ${c}` : ''}<br>${fmt(v)}`);
      if (o.showValues && (pts.length === 1 || v === Math.max(...pts.map((p) => p[1])))) valueLabel(ctx, g, sv(v) + r + 2.5, yy, fmt(v), { anchor: 'start', baseline: 'central' });
    }
  }
  axisLeft({ ...ctx, th: { ...ctx.th, axisLineY: false } }, g, band, inner, { band: true });
  axisBottom(ctx, g, sv, inner, { ticks: vt, title: yAxisTitle(ctx, ey, agg), fmt: vf });
}

// ======================= MEDIAS CON INTERVALOS =======================
export function meanci(ctx) {
  const ex = enc(ctx, 'x'), ey = enc(ctx, 'y'), ec = enc(ctx, 'color');
  if (!ex || !ey) return ctx.need('Elegí los grupos y la variable numérica.');
  const o = ctx.opt;
  const xl = ctx.fixed?.xLevels || levelsIn(ctx, ex, ctx.rows);
  const cl = ec ? levelsIn(ctx, ec, ctx.rows) : ['__'];
  const kind = o.errorBars && o.errorBars !== 'none' ? o.errorBars : 'ci';
  const stats = [];
  for (const x of xl) for (const c of cl) {
    const v = ctx.rows.filter((r) => String(r[ex.j]) === x && (!ec || String(r[ec.j]) === c)).map((r) => r[ey.j]).filter((q) => q != null && Number.isFinite(q));
    if (!v.length) continue;
    const d = S.describe(v);
    const [lo, hi] = v.length < 2 ? [d.mean, d.mean] : kind === 'sd' ? [d.mean - d.sd, d.mean + d.sd] : kind === 'se' ? [d.mean - d.se, d.mean + d.se] : [d.ciLow, d.ciHigh];
    stats.push({ x, c, m: d.mean, lo, hi, n: d.n, v });
  }
  const all = stats.flatMap((s) => [s.lo, s.hi, ...(o.points ? s.v : [])]);
  const dom = [Math.min(...all), Math.max(...all)];
  if (ctx.measure) return { y: dom, xLevels: xl };
  const color = colorScale(ctx, ec ? ec.key : null);
  const box = withLegend(ctx, ec ? catLegend(ctx, ec.name, cl, color, 'circle') : null);
  const g = ctx.g;
  const yTitle = ctx.noYTitle ? '' : (o.yTitle || `${ey.name}${ey.col.unit ? ` (${ey.col.unit})` : ''}`);
  const sy0 = yScale(ctx, dom, { h: box.h });
  const yt = sy0.ticks(Math.max(3, Math.round(box.h / (ctx.th.sizes.tick * 4.2))));
  const L = layoutPlot(ctx, box, { xBand: true, xLabels: xl, yTicks: yt, yTitle, xTitle: xAxisTitle(ctx, ex) });
  const inner = L.inner;
  const band = d3.scaleBand().domain(xl).range([inner.x, inner.x + inner.w]).padding(0.25);
  const sub = d3.scaleBand().domain(cl).range([0, band.bandwidth()]).padding(cl.length > 1 ? 0.25 : 0);
  const sy = sy0.copy().range([inner.y + inner.h, inner.y]);
  drawGridY(ctx, g, sy, inner, yt);
  const fmt = fmtV(ctx);
  if (o.points) for (const s of stats) { const cx = band(s.x) + sub(s.c) + sub.bandwidth() / 2; const jw = sub.bandwidth() * 0.35; s.v.forEach((v, i) => svgEl('circle', { cx: cx + (((i * 0.618) % 1) - 0.5) * jw, cy: sy(v), r: ctx.pointR * 0.6, fill: ec ? color(s.c) : singleColor(ctx), opacity: 0.25 }, g)); }
  if (ec && o.connect !== false) for (const c of cl) {
    const pts = stats.filter((s) => s.c === c).map((s) => [band(s.x) + sub(s.c) + sub.bandwidth() / 2, sy(s.m)]);
    if (pts.length > 1) svgEl('path', { d: d3.line()(pts), fill: 'none', stroke: color(c), 'stroke-width': ctx.lineW, opacity: 0.8 }, g);
  }
  for (const s of stats) {
    const cx = band(s.x) + sub(s.c) + sub.bandwidth() / 2;
    const col = ec ? color(s.c) : singleColor(ctx);
    const w = Math.min(sub.bandwidth() * 0.3, ctx.th.sizes.tick * 0.8);
    const st = { stroke: col, 'stroke-width': ctx.lineW };
    svgEl('line', { x1: cx, x2: cx, y1: sy(s.lo), y2: sy(s.hi), ...st }, g);
    svgEl('line', { x1: cx - w, x2: cx + w, y1: sy(s.lo), y2: sy(s.lo), ...st }, g);
    svgEl('line', { x1: cx - w, x2: cx + w, y1: sy(s.hi), y2: sy(s.hi), ...st }, g);
    tip(svgEl('circle', { cx, cy: sy(s.m), r: ctx.pointR * 1.3, fill: col, stroke: ctx.c.bg, 'stroke-width': ctx.gapW }, g), `<b>${s.x}</b>${ec ? ` · ${s.c}` : ''}<br>M = ${fmt(s.m)} [${fmt(s.lo)}; ${fmt(s.hi)}]<br>n = ${s.n}`);
  }
  axisLeft(ctx, g, sy, inner, { ticks: yt, title: yTitle });
  axisBottom(ctx, g, band, inner, { band: true, rot: L.xRot, lines: L.xLines, title: xAxisTitle(ctx, ex) });
  ctx.note(`Puntos: medias; barras: ${kind === 'sd' ? '± 1 desvío estándar' : kind === 'se' ? '± 1 error estándar' : 'intervalo de confianza del 95 %'}.`);
}

// ======================= HISTOGRAMA =======================
function binsFor(v, method, n) {
  const s = v.slice().sort((a, b) => a - b), N = s.length;
  const range = s[N - 1] - s[0] || 1;
  if (method === 'n' && n) return Math.max(1, Math.round(n));
  if (method === 'fd') { const iqr = S.quantile(s, 0.75) - S.quantile(s, 0.25); const h = 2 * iqr * N ** (-1 / 3); return h > 0 ? Math.min(100, Math.ceil(range / h)) : Math.ceil(Math.log2(N) + 1); }
  if (method === 'scott') { const h = 3.49 * S.sd(s) * N ** (-1 / 3); return h > 0 ? Math.min(100, Math.ceil(range / h)) : 10; }
  return Math.ceil(Math.log2(N) + 1); // Sturges
}
export function hist(ctx) {
  const ey = enc(ctx, 'y') || enc(ctx, 'x'), ec = enc(ctx, 'color');
  if (!ey || !isNum(ey.col)) return ctx.need('Elegí una variable numérica.');
  const o = ctx.opt;
  const all = ctx.rows.map((r) => r[ey.j]).filter((v) => v != null && Number.isFinite(v));
  if (all.length < 2) return ctx.need('Hacen falta al menos dos valores.');
  const domainAll = ctx.fixed?.x || [Math.min(...all), Math.max(...all)];
  const k = binsFor(ctx.allValues || all, o.binMethod || 'sturges', o.bins);
  const xs0 = d3.scaleLinear().domain(domainAll).nice(k);
  const bin = d3.bin().domain(xs0.domain()).thresholds(xs0.ticks(k));
  const cl = ec ? levelsIn(ctx, ec, ctx.rows) : ['__'];
  const series = cl.map((c) => { const v = ctx.rows.filter((r) => !ec || String(r[ec.j]) === c).map((r) => r[ey.j]).filter((q) => q != null && Number.isFinite(q)); return { c, v, bins: bin(v) }; });
  const mode = o.histY || 'count';
  const width = (b) => b.x1 - b.x0;
  const yv = (b, n) => (mode === 'pct' ? (b.length / n) * 100 : mode === 'density' ? b.length / (n * width(b)) : b.length);
  const stacked = ec && o.overlay !== 'overlap';
  let ymax = 0;
  if (stacked) series[0].bins.forEach((_, i) => { ymax = Math.max(ymax, series.reduce((s, se) => s + yv(se.bins[i], mode === 'count' ? 1 : all.length), 0)); });
  else series.forEach((se) => se.bins.forEach((b) => { ymax = Math.max(ymax, yv(b, se.v.length)); }));
  const curves = [];
  if (o.overlay === 'density' || o.overlay === 'normal' || o.overlay === 'both') {
    for (const se of series) {
      if (se.v.length < 3) continue;
      const scaleF = mode === 'density' ? 1 : mode === 'pct' ? (100 * width(se.bins[0] || { x0: 0, x1: 1 })) : se.v.length * width(se.bins[0] || { x0: 0, x1: 1 });
      const n2 = stacked ? (mode === 'count' ? se.v.length : all.length) : se.v.length;
      const f = mode === 'density' ? 1 : mode === 'pct' ? (100 * width(se.bins[0])) * (se.v.length / n2) : scaleF;
      if (o.overlay !== 'normal') { const kd = S.kde(se.v, { from: xs0.domain()[0], to: xs0.domain()[1], n: 120 }); curves.push({ c: se.c, pts: kd.pts.map(([x, y]) => [x, y * f]), dash: false }); }
      if (o.overlay === 'normal' || o.overlay === 'both') { const m = S.mean(se.v), s = S.sd(se.v); const pts = d3.range(121).map((i) => { const x = xs0.domain()[0] + ((xs0.domain()[1] - xs0.domain()[0]) * i) / 120; return [x, (Math.exp(-0.5 * ((x - m) / s) ** 2) / (s * Math.sqrt(2 * Math.PI))) * f]; }); curves.push({ c: se.c, pts, dash: true }); }
    }
    curves.forEach((cv) => cv.pts.forEach((p) => { ymax = Math.max(ymax, p[1]); }));
  }
  if (ctx.measure) return { y: [0, ymax], x: xs0.domain() };
  const color = colorScale(ctx, ec ? ec.key : null);
  const lgItems = ec ? catLegend(ctx, ec.name, cl, color) : null;
  if (lgItems && curves.some((c) => c.dash)) lgItems.items.push({ label: 'Curva normal', color: ctx.c.ink, shape: 'dash' });
  const box = withLegend(ctx, lgItems);
  const g = ctx.g;
  const yTitle = ctx.noYTitle ? '' : o.yTitle || (mode === 'pct' ? 'Porcentaje de casos' : mode === 'density' ? 'Densidad' : 'Cantidad de casos');
  const sy0 = niceLinear(ctx.fixed?.y || [0, ymax], Math.max(3, Math.round(box.h / (ctx.th.sizes.tick * 4.2))), { zero: true, min: o.yMin, max: o.yMax });
  const yt = sy0.ticks(Math.max(3, Math.round(box.h / (ctx.th.sizes.tick * 4.2))));
  const xt0 = xs0.ticks(Math.max(3, Math.round(box.w / (ctx.th.sizes.tick * 6))));
  const L = layoutPlot(ctx, box, { yTicks: yt, xTicks: xt0, yTitle, xTitle: xAxisTitle(ctx, ey) });
  const inner = L.inner;
  const sx = xs0.copy().range([inner.x, inner.x + inner.w]);
  const sy = sy0.copy().range([inner.y + inner.h, inner.y]);
  drawGridY(ctx, g, sy, inner, yt);
  const gap = ctx.gapW * 0.6;
  if (stacked) {
    series[0].bins.forEach((b0, i) => {
      let acc = 0;
      series.forEach((se, si) => {
        const b = se.bins[i]; const v = yv(b, mode === 'count' ? 1 : all.length);
        if (!v) return;
        const y0 = sy(acc), y1 = sy(acc + v); acc += v;
        tip(svgEl('rect', { x: sx(b.x0) + gap / 2, y: y1, width: Math.max(0, sx(b.x1) - sx(b.x0) - gap), height: Math.max(0, y0 - y1 - (si ? gap : 0)), fill: fillFor(ctx, color(se.c), si) }, g), `${fmtV(ctx)(b.x0)} – ${fmtV(ctx)(b.x1)}${ec ? ` · ${se.c}` : ''}<br>${b.length} casos`);
      });
    });
  } else {
    series.forEach((se, si) => se.bins.forEach((b) => {
      const v = yv(b, se.v.length); if (!v) return;
      tip(svgEl('rect', { x: sx(b.x0) + gap / 2, y: sy(v), width: Math.max(0, sx(b.x1) - sx(b.x0) - gap), height: Math.max(0, sy(0) - sy(v)), fill: ec ? color(se.c) : fillFor(ctx, singleColor(ctx), 0), opacity: ec ? 0.5 : 1 }, g), `${fmtV(ctx)(b.x0)} – ${fmtV(ctx)(b.x1)}<br>${b.length} casos`);
    }));
  }
  for (const cv of curves) svgEl('path', { d: d3.line().x((p) => sx(p[0])).y((p) => sy(p[1]))(cv.pts), fill: 'none', stroke: ec && !cv.dash ? color(cv.c) : ctx.c.ink, 'stroke-width': ctx.lineW, 'stroke-dasharray': cv.dash ? `${ctx.lineW * 2.5} ${ctx.lineW * 1.5}` : null }, g);
  if (o.meanLine) { const m = S.mean(all); svgEl('line', { x1: sx(m), x2: sx(m), y1: inner.y, y2: inner.y + inner.h, stroke: ctx.c.ink, 'stroke-width': ctx.hair * 1.6 }, g); text(g, sx(m) + 2, inner.y + ctx.th.sizes.label, `media ${fmtV(ctx)(m)}`, { size: ctx.th.sizes.label, fill: ctx.c.ink, family: ctx.th.font, italic: true }); }
  refLines(ctx, g, sy, inner, true, sx);
  svgEl('line', { x1: inner.x, x2: inner.x + inner.w, y1: sy(0), y2: sy(0), stroke: ctx.c.axis, 'stroke-width': ctx.axisW }, g);
  axisLeft(ctx, g, sy, inner, { ticks: yt, title: yTitle });
  axisBottom({ ...ctx, th: { ...ctx.th, axisLineX: false } }, g, sx, inner, { ticks: xt0, title: xAxisTitle(ctx, ey) });
  ctx.note(`${series[0].bins.length} intervalos (${{ sturges: 'regla de Sturges', fd: 'regla de Freedman–Diaconis', scott: 'regla de Scott', n: 'cantidad elegida' }[o.binMethod || 'sturges']}). La forma depende del ancho de los intervalos: probá otros.`);
}

// ======================= DENSIDAD =======================
export function density(ctx) {
  const ey = enc(ctx, 'y') || enc(ctx, 'x'), ec = enc(ctx, 'color');
  if (!ey || !isNum(ey.col)) return ctx.need('Elegí una variable numérica.');
  const o = ctx.opt;
  const all = ctx.rows.map((r) => r[ey.j]).filter((v) => v != null && Number.isFinite(v));
  if (all.length < 3) return ctx.need('Hacen falta al menos tres valores.');
  const cl = ec ? levelsIn(ctx, ec, ctx.rows) : ['__'];
  const lo0 = ctx.fixed?.x ? ctx.fixed.x[0] : Math.min(...all), hi0 = ctx.fixed?.x ? ctx.fixed.x[1] : Math.max(...all);
  const pad = (hi0 - lo0) * 0.08;
  const series = cl.map((c) => { const v = ctx.rows.filter((r) => !ec || String(r[ec.j]) === c).map((r) => r[ey.j]).filter((q) => q != null && Number.isFinite(q)); return { c, v, kd: v.length >= 3 ? S.kde(v, { from: lo0 - pad, to: hi0 + pad, n: 140 }) : null }; }).filter((s) => s.kd);
  const ymax = Math.max(...series.flatMap((s) => s.kd.pts.map((p) => p[1])));
  if (ctx.measure) return { x: [lo0, hi0], y: [0, ymax] };
  const color = colorScale(ctx, ec ? ec.key : null);
  const ridge = o.ridge && series.length > 1;
  const box = withLegend(ctx, ec && !ridge ? catLegend(ctx, ec.name, cl, color) : null);
  const g = ctx.g;
  const sx0 = d3.scaleLinear().domain([lo0 - pad, hi0 + pad]).nice();
  const xt = sx0.ticks(Math.max(3, Math.round(box.w / (ctx.th.sizes.tick * 6))));
  if (ridge) {
    const L = layoutPlot(ctx, box, { yBand: true, yLabels: series.map((s) => s.c), xTicks: xt, xTitle: xAxisTitle(ctx, ey) });
    const inner = L.inner;
    const sx = sx0.copy().range([inner.x, inner.x + inner.w]);
    const step0 = inner.h / (series.length + 0.6);
    const band = d3.scaleBand().domain(series.map((s) => s.c)).range([inner.y + step0 * 0.6, inner.y + inner.h]).paddingInner(0);
    const hgt = band.step() * 1.55;
    series.slice().reverse().forEach((s) => {
      const base = band(s.c) + band.bandwidth();
      const sy = (v) => base - (v / ymax) * hgt;
      const col = color(s.c);
      svgEl('path', { d: d3.area().x((p) => sx(p[0])).y0(base).y1((p) => sy(p[1])).curve(d3.curveBasis)(s.kd.pts), fill: fillFor(ctx, col, 0), 'fill-opacity': 0.75, stroke: ctx.c.bg, 'stroke-width': ctx.lineW * 0.8 }, g);
      svgEl('line', { x1: inner.x, x2: inner.x + inner.w, y1: base, y2: base, stroke: ctx.c.grid, 'stroke-width': ctx.hair }, g);
    });
    axisLeft({ ...ctx, th: { ...ctx.th, axisLineY: false } }, g, band, inner, { band: true });
    axisBottom(ctx, g, sx, inner, { ticks: xt, title: xAxisTitle(ctx, ey) });
    return;
  }
  const sy0 = d3.scaleLinear().domain(ctx.fixed?.y || [0, ymax]).nice();
  const yt = sy0.ticks(4);
  const yTitle = ctx.noYTitle ? '' : 'Densidad';
  const L = layoutPlot(ctx, box, { yTicks: yt, xTicks: xt, yTitle, xTitle: xAxisTitle(ctx, ey) });
  const inner = L.inner;
  const sx = sx0.copy().range([inner.x, inner.x + inner.w]);
  const sy = sy0.copy().range([inner.y + inner.h, inner.y]);
  drawGridY(ctx, g, sy, inner, yt);
  series.forEach((s) => {
    const col = ec ? color(s.c) : singleColor(ctx);
    svgEl('path', { d: d3.area().x((p) => sx(p[0])).y0(sy(0)).y1((p) => sy(p[1]))(s.kd.pts), fill: col, 'fill-opacity': ctx.th.areaOpacity }, g);
    svgEl('path', { d: d3.line().x((p) => sx(p[0])).y((p) => sy(p[1]))(s.kd.pts), fill: 'none', stroke: col, 'stroke-width': ctx.lineW, filter: glowFilter(ctx) }, g);
  });
  refLines(ctx, g, sy, inner, true, sx);
  axisLeft(ctx, g, sy, inner, { ticks: yt, title: yTitle });
  axisBottom(ctx, g, sx, inner, { ticks: xt, title: xAxisTitle(ctx, ey) });
  ctx.note(`Densidad por núcleo gaussiano, ancho de banda de Silverman (${fmtV(ctx)(series[0].kd.bw)}).`);
}

// ======================= CAJAS Y VIOLINES =======================
function boxStats(v) { const d = S.describe(v); return d; }
function bracketTests(ctx, groups, labels) {
  // comparaciones de a pares (Welch o Mann–Whitney según normalidad), con corrección de Holm
  const normal = groups.every((g) => g.length < 3 || g.length >= 30 || S.shapiroWilk(g).p >= 0.05);
  const out = [];
  for (let i = 0; i < groups.length; i++) for (let j = i + 1; j < groups.length; j++) {
    if (groups[i].length < 2 || groups[j].length < 2) continue;
    const p = normal ? S.tTestIndependent(groups[i], groups[j]).p : S.mannWhitney(groups[i], groups[j]).p;
    out.push({ i, j, p });
  }
  const adj = S.adjustP(out.map((o) => o.p), 'holm');
  out.forEach((o, k) => { o.pAdj = adj[k]; });
  return { tests: out, method: normal ? 't de Welch' : 'U de Mann–Whitney' };
}
function boxLike(ctx, violin) {
  const ex = enc(ctx, 'x'), ey = enc(ctx, 'y'), ec = enc(ctx, 'color');
  if (!ey || !isNum(ey.col)) return ctx.need('Elegí la variable numérica.');
  const o = ctx.opt;
  const xl = ex ? ctx.fixed?.xLevels || levelsIn(ctx, ex, ctx.rows) : [ey.name];
  const cl = ec && (!ex || ec.key !== ex.key) ? levelsIn(ctx, ec, ctx.rows) : ['__'];
  const groups = [];
  for (const x of xl) for (const c of cl) {
    const v = ctx.rows.filter((r) => (!ex || String(r[ex.j]) === x) && (cl.length === 1 || String(r[ec.j]) === c)).map((r) => r[ey.j]).filter((q) => q != null && Number.isFinite(q));
    if (v.length) groups.push({ x, c, v, d: boxStats(v) });
  }
  const all = groups.flatMap((gq) => gq.v);
  if (!all.length) return ctx.need('No hay valores para dibujar.');
  let lo = Math.min(...all), hi = Math.max(...all);
  const kdes = violin ? groups.map((gq) => (gq.v.length >= 3 ? S.kde(gq.v, { n: 80, from: gq.d.min - (gq.d.max - gq.d.min) * 0.15, to: gq.d.max + (gq.d.max - gq.d.min) * 0.15 }) : null)) : [];
  if (violin) kdes.forEach((k) => { if (k) { lo = Math.min(lo, k.pts[0][0]); hi = Math.max(hi, k.pts[k.pts.length - 1][0]); } });
  const brackets = o.annotate === 'brackets' && cl.length === 1 && groups.length >= 2 && groups.length <= 6 ? bracketTests(ctx, groups.map((gq) => gq.v), groups.map((gq) => gq.x)) : null;
  const shown = brackets ? brackets.tests.filter((t) => t.pAdj < 0.05 || o.allBrackets) : [];
  if (ctx.measure) return { y: [lo, hi], xLevels: xl };
  const color = colorScale(ctx, ec ? ec.key : null);
  const box = withLegend(ctx, cl.length > 1 ? catLegend(ctx, ec.name, cl, color) : null);
  const g = ctx.g;
  const horiz = o.orientation === 'h' && !violin;
  const yTitle = ctx.noYTitle ? '' : o.yTitle || `${ey.name}${ey.col.unit ? ` (${ey.col.unit})` : ''}`;
  const extra = 0;
  const nT = Math.max(3, Math.round((horiz ? box.w : box.h) / (ctx.th.sizes.tick * (horiz ? 7 : 4.2))));
  const sv0 = niceLinear(ctx.fixed?.y ? [ctx.fixed.y[0], ctx.fixed.y[1] + extra] : [lo, hi + extra], nT, { zero: o.yZero, min: o.yMin, max: o.yMax, log: o.yLog });
  const vt = sv0.ticks(nT).filter((v) => v <= hi + (hi - lo) * 0.02 || !shown.length);
  const L = horiz ? layoutPlot(ctx, box, { yBand: true, yLabels: xl, xTicks: vt, xTitle: yTitle, yTitle: ex ? xAxisTitle(ctx, ex) : '' }) : layoutPlot(ctx, box, { xBand: true, xLabels: ex ? xl : [], yTicks: vt, yTitle, xTitle: ex ? xAxisTitle(ctx, ex) : '' });
  const inner = L.inner;
  if (shown.length && !horiz) { const sp = Math.min(inner.h * 0.4, shown.length * ctx.th.sizes.label * 1.9 + ctx.th.sizes.label * 0.6); inner.y += sp; inner.h -= sp; }
  const band = d3.scaleBand().domain(xl).range(horiz ? [inner.y, inner.y + inner.h] : [inner.x, inner.x + inner.w]).padding(0.28);
  const sub = d3.scaleBand().domain(cl).range([0, band.bandwidth()]).padding(cl.length > 1 ? 0.18 : 0);
  const sv = sv0.copy().range(horiz ? [inner.x, inner.x + inner.w] : [inner.y + inner.h, inner.y]);
  if (horiz) drawGridX({ ...ctx, th: { ...ctx.th, gridX: ctx.th.gridY } }, g, sv, inner, vt); else drawGridY(ctx, g, sv, inner, vt);
  const fmt = fmtV(ctx);
  groups.forEach((gq, gi) => {
    const col = cl.length > 1 ? color(gq.c) : ex && ec && ec.key === ex.key ? color(gq.x) : singleColor(ctx);
    const dim = o.highlight && gq.x !== o.highlight;
    const colD = dim ? mixHex(col, ctx.c.bg, 0.6) : col;
    const c0 = band(gq.x) + sub(gq.c), w = sub.bandwidth(), mid = c0 + w / 2;
    const d = gq.d;
    const P = (v) => sv(v);
    const R = (a, b, x0, x1, attrs) => (horiz ? svgEl('rect', { x: Math.min(P(a), P(b)), y: x0, width: Math.abs(P(b) - P(a)), height: x1 - x0, ...attrs }, g) : svgEl('rect', { x: x0, y: Math.min(P(a), P(b)), width: x1 - x0, height: Math.abs(P(b) - P(a)), ...attrs }, g));
    const Ln = (v0, v1, p0, p1, attrs) => (horiz ? svgEl('line', { x1: P(v0), x2: P(v1), y1: p0, y2: p1, ...attrs }, g) : svgEl('line', { y1: P(v0), y2: P(v1), x1: p0, x2: p1, ...attrs }, g));
    if (violin && kdes[gi]) {
      const k = kdes[gi]; const mx = Math.max(...k.pts.map((p) => p[1]));
      const half = w / 2;
      const area = d3.area().y((p) => sv(p[0])).x0((p) => mid - (p[1] / mx) * half).x1((p) => mid + (p[1] / mx) * half).curve(d3.curveBasis);
      svgEl('path', { 'data-cat': cl.length > 1 ? gq.c : gq.x, d: area(k.pts), fill: fillFor(ctx, colD, 0), 'fill-opacity': 0.55, stroke: colD, 'stroke-width': ctx.hair * 1.4 }, g);
      const bw = Math.max(w * 0.12, ctx.lineW * 2.2);
      R(d.q1, d.q3, mid - bw / 2, mid + bw / 2, { fill: ctx.c.ink, opacity: 0.85 });
      Ln(d.whiskerLow, d.whiskerHigh, mid, mid, { stroke: ctx.c.ink, 'stroke-width': ctx.hair * 1.4 });
      tip(svgEl('circle', { cx: mid, cy: sv(d.median), r: bw * 0.42, fill: ctx.c.bg }, g), `<b>${gq.x}</b><br>Me = ${fmt(d.median)} · RIC ${fmt(d.q1)}–${fmt(d.q3)}<br>n = ${d.n}`);
    } else {
      const st = { stroke: ctx.c.ink, 'stroke-width': ctx.lineW * 0.75 };
      Ln(d.whiskerLow, d.q1, mid, mid, st); Ln(d.q3, d.whiskerHigh, mid, mid, st);
      Ln(d.whiskerLow, d.whiskerLow, mid - w * 0.18, mid + w * 0.18, st); Ln(d.whiskerHigh, d.whiskerHigh, mid - w * 0.18, mid + w * 0.18, st);
      tip(R(d.q1, d.q3, c0, c0 + w, { 'data-cat': cl.length > 1 ? gq.c : gq.x, fill: fillFor(ctx, colD, cl.indexOf(gq.c)), 'fill-opacity': o.points ? 0.45 : 0.85, stroke: ctx.c.ink, 'stroke-width': ctx.lineW * 0.75, rx: Math.min(ctx.th.barRadius, w / 6) }), `<b>${gq.x}</b>${cl.length > 1 ? ` · ${gq.c}` : ''}<br>Me = ${fmt(d.median)} · Q1 ${fmt(d.q1)} · Q3 ${fmt(d.q3)}<br>n = ${d.n}`);
      Ln(d.median, d.median, c0, c0 + w, { stroke: ctx.c.ink, 'stroke-width': ctx.lineW * 1.4 });
      if (o.meanMark) { const pm = P(d.mean); const s = ctx.pointR * 1.1; svgEl('path', { d: horiz ? `M${pm},${mid - s}L${pm + s},${mid}L${pm},${mid + s}L${pm - s},${mid}Z` : `M${mid},${pm - s}L${mid + s},${pm}L${mid},${pm + s}L${mid - s},${pm}Z`, fill: ctx.c.bg, stroke: ctx.c.ink, 'stroke-width': ctx.hair * 1.5 }, g); }
      if (!o.points) d.outliers.forEach((v) => { const p = P(v); svgEl('circle', { cx: horiz ? p : mid, cy: horiz ? mid : p, r: ctx.pointR * 0.8, fill: 'none', stroke: ctx.c.ink, 'stroke-width': ctx.hair * 1.4 }, g); });
    }
    if (o.points) {
      // nube de casos con dispersión determinista (no cambia entre redibujos)
      const jw = w * (violin ? 0.5 : 0.7);
      gq.v.forEach((v, i) => { const off = (((i * 0.6180339) % 1) - 0.5) * jw; const p = P(v); svgEl('circle', { cx: horiz ? p : mid + off, cy: horiz ? mid + off : p, r: ctx.pointR * 0.62, fill: colD, opacity: 0.55 }, g); });
    }
  });
  if (shown.length) {
    let level = 0;
    const top = Math.min(sv(hi), sv.range()[1] + ctx.th.sizes.label * 0.6);
    const step = ctx.th.sizes.label * 1.9;
    shown.sort((a, b) => (a.j - a.i) - (b.j - b.i)).forEach((t) => {
      const x1 = band(groups[t.i].x) + band.bandwidth() / 2, x2 = band(groups[t.j].x) + band.bandwidth() / 2;
      const yb = top - ctx.th.sizes.label * 0.8 - level * step; level++;
      svgEl('path', { d: `M${x1},${yb + 3}V${yb}H${x2}V${yb + 3}`, fill: 'none', stroke: ctx.c.ink, 'stroke-width': ctx.hair * 1.4 }, g);
      text(g, (x1 + x2) / 2, yb - 1.5, o.bracketLabel === 'p' ? `p ${pcell(t.pAdj).startsWith('<') ? '' : '= '}${pcell(t.pAdj)}` : S.adjustP ? starsOf(t.pAdj) : '', { size: ctx.th.sizes.label, fill: ctx.c.ink, family: ctx.th.font, anchor: 'middle' });
    });
    ctx.note(`Corchetes: comparaciones de a pares con ${brackets.method} y corrección de Holm (* p < ,05; ** p < ,01; *** p < ,001)${o.allBrackets ? '' : '; se muestran solo las significativas'}.`);
  }
  if (horiz) { axisLeft({ ...ctx, th: { ...ctx.th, axisLineY: false } }, g, band, inner, { band: true, title: ex ? xAxisTitle(ctx, ex) : '' }); axisBottom(ctx, g, sv, inner, { ticks: vt, title: yTitle }); }
  else { axisLeft(ctx, g, sv, inner, { ticks: vt, title: yTitle }); axisBottom(ctx, g, band, inner, { band: true, labels: ex ? null : [''], rot: L.xRot, lines: L.xLines, title: ex ? xAxisTitle(ctx, ex) : '' }); }
  if (!violin) ctx.note('Caja: cuartiles 1 y 3 con la mediana; bigotes hasta 1,5 veces el rango intercuartil.');
}
const starsOf = (p) => (p < 0.001 ? '***' : p < 0.01 ? '**' : p < 0.05 ? '*' : 'ns');
export const box = (ctx) => boxLike(ctx, false);
export const violin = (ctx) => boxLike(ctx, true);

// ======================= Q-Q =======================
export function qq(ctx) {
  const ey = enc(ctx, 'y') || enc(ctx, 'x'), ec = enc(ctx, 'color');
  if (!ey || !isNum(ey.col)) return ctx.need('Elegí una variable numérica.');
  const cl = ec ? levelsIn(ctx, ec, ctx.rows) : ['__'];
  const ser = cl.map((c) => {
    const v = ctx.rows.filter((r) => !ec || String(r[ec.j]) === c).map((r) => r[ey.j]).filter((q) => q != null && Number.isFinite(q)).sort((a, b) => a - b);
    const n = v.length, a = n <= 10 ? 0.375 : 0.5;
    return { c, pts: v.map((y, i) => [qnorm((i + 1 - a) / (n + 1 - 2 * a)), y]), v };
  }).filter((s) => s.v.length >= 3);
  if (!ser.length) return ctx.need('Hacen falta al menos tres valores.');
  const xs = ser.flatMap((s) => s.pts.map((p) => p[0])), ys = ser.flatMap((s) => s.pts.map((p) => p[1]));
  if (ctx.measure) return { y: [Math.min(...ys), Math.max(...ys)], x: [Math.min(...xs), Math.max(...xs)] };
  const color = colorScale(ctx, ec ? ec.key : null);
  const box2 = withLegend(ctx, ec ? catLegend(ctx, ec.name, cl, color, 'circle') : null);
  const g = ctx.g;
  const sy0 = niceLinear(ctx.fixed?.y || [Math.min(...ys), Math.max(...ys)], 5), sx0 = niceLinear(ctx.fixed?.x || [Math.min(...xs), Math.max(...xs)], 5);
  const yt = sy0.ticks(5), xt = sx0.ticks(5);
  const yTitle = ctx.noYTitle ? '' : `Cuantiles observados de ${ey.name.toLowerCase()}`;
  const L = layoutPlot(ctx, box2, { yTicks: yt, xTicks: xt, yTitle, xTitle: ctx.noXTitle ? '' : 'Cuantiles teóricos de la normal' });
  const inner = L.inner;
  const sx = sx0.copy().range([inner.x, inner.x + inner.w]), sy = sy0.copy().range([inner.y + inner.h, inner.y]);
  drawGridY(ctx, g, sy, inner, yt);
  ser.forEach((s) => {
    const q1 = S.quantile(s.v, 0.25), q3 = S.quantile(s.v, 0.75), z1 = qnorm(0.25), z3 = qnorm(0.75);
    const b = (q3 - q1) / (z3 - z1), a = q1 - b * z1;
    const [x0, x1] = sx0.domain();
    const col = ec ? color(s.c) : singleColor(ctx);
    svgEl('line', { x1: sx(x0), x2: sx(x1), y1: sy(a + b * x0), y2: sy(a + b * x1), stroke: ec ? col : ctx.c.ink, 'stroke-width': ctx.lineW * 0.9, 'stroke-dasharray': `${ctx.lineW * 2.5} ${ctx.lineW * 1.5}` }, g);
    s.pts.forEach((p) => svgEl('circle', { cx: sx(p[0]), cy: sy(p[1]), r: ctx.pointR * 0.85, fill: col, opacity: ctx.th.pointOpacity, stroke: ctx.c.bg, 'stroke-width': ctx.gapW * 0.6 }, g));
    if (!ec) { const sw = S.shapiroWilk(s.v); ctx.note(`Recta por los cuartiles. Shapiro–Wilk: W = ${num1(sw.W, 3)}, p ${pcell(sw.p).startsWith('<') ? '' : '= '}${pcell(sw.p)}.`); }
  });
  axisLeft(ctx, g, sy, inner, { ticks: yt, title: yTitle });
  axisBottom(ctx, g, sx, inner, { ticks: xt, title: ctx.noXTitle ? '' : 'Cuantiles teóricos de la normal' });
}

// ======================= DISPERSIÓN =======================
function fitTrend(xs, ys, kind) {
  const n = xs.length;
  if (n < 3) return null;
  if (kind === 'loess') return { kind, f: null, loess: true };
  let X, yy = ys, tx = (x) => x, ty = (y) => y;
  if (kind === 'log') { if (xs.some((x) => x <= 0)) return null; tx = Math.log; }
  if (kind === 'exp') { if (ys.some((y) => y <= 0)) return null; yy = ys.map(Math.log); ty = Math.exp; }
  if (kind === 'poly2') X = xs.map((x) => [x, x * x]);
  else if (kind === 'poly3') X = xs.map((x) => [x, x * x, x ** 3]);
  else X = xs.map((x) => [tx(x)]);
  const fit = S.ols(X, yy, X[0].map((_, i) => `x${i}`));
  if (fit.error) return null;
  const row = (x) => (kind === 'poly2' ? [x, x * x] : kind === 'poly3' ? [x, x * x, x ** 3] : [tx(x)]);
  return { kind, fit, f: (x) => ty(S.predictBand(fit, row(x)).y), band: (x) => { const b = S.predictBand(fit, row(x)); return [ty(b.lo), ty(b.hi)]; } };
}
function eqText(ctx, tr, xs, ys) {
  const f = makeFormat({ comma: ctx.comma });
  const c = tr.fit.coefs;
  const sgn = (v) => (v < 0 ? ' − ' : ' + ');
  let eq;
  const b = (v) => { const a = Math.abs(v); return a >= 100 ? f(a, 1) : a >= 1 ? f(+a.toFixed(2), 0.01) : String(+a.toPrecision(3)).replace('.', ctx.comma ? ',' : '.'); };
  if (tr.kind === 'linear') eq = `y = ${c[0].b < 0 ? '−' : ''}${b(c[0].b)}${sgn(c[1].b)}${b(c[1].b)}x`;
  else if (tr.kind === 'log') eq = `y = ${c[0].b < 0 ? '−' : ''}${b(c[0].b)}${sgn(c[1].b)}${b(c[1].b)} ln x`;
  else if (tr.kind === 'exp') eq = `y = ${b(Math.exp(c[0].b))} e^(${c[1].b < 0 ? '−' : ''}${b(c[1].b)}x)`;
  else eq = `polinomio de grado ${c.length - 1}`;
  const r = S.pearson(xs, ys);
  return [eq, `R² = ${num1(tr.fit.r2, 3)}${tr.kind === 'linear' ? ` · r = ${num1(r.r, 2)} · p ${pcell(r.p).startsWith('<') ? '' : '= '}${pcell(r.p)} · n = ${xs.length}` : ''}`];
}
export function scatter(ctx) {
  const ex = enc(ctx, 'x'), ey = enc(ctx, 'y'), ec = enc(ctx, 'color'), es = enc(ctx, 'size'), el = enc(ctx, 'label');
  if (!ex || !ey) return ctx.need('Elegí las variables de los dos ejes.');
  const o = ctx.opt;
  const pts = ctx.rows.filter((r) => r[ex.j] != null && r[ey.j] != null && Number.isFinite(+r[ex.j]) && Number.isFinite(+r[ey.j])).map((r) => ({ x: +r[ex.j], y: +r[ey.j], c: ec ? r[ec.j] : null, s: es ? r[es.j] : null, l: el ? r[el.j] : null, r }));
  if (!pts.length) return ctx.need('No hay casos con los dos valores.');
  const xd = [Math.min(...pts.map((p) => p.x)), Math.max(...pts.map((p) => p.x))], yd = [Math.min(...pts.map((p) => p.y)), Math.max(...pts.map((p) => p.y))];
  if (ctx.measure) return { x: xd, y: yd };
  const catColor = ec && !isNum(ec.col);
  const cl = catColor ? levelsIn(ctx, ec, ctx.rows) : ['__'];
  const color = colorScale(ctx, catColor ? ec.key : null);
  let numColor = null, lg = null;
  if (ec && !catColor) {
    const cv = pts.map((p) => p.c).filter((v) => v != null);
    const lo = Math.min(...cv), hi = Math.max(...cv);
    const rp = (ctx.opt.ramp || ctx.th.ramp);
    numColor = (v) => (v == null ? ctx.c.muted : ctx.seq((v - lo) / (hi - lo || 1)));
    const f = makeFormat({ comma: ctx.comma });
    lg = { type: 'ramp', title: ec.name, stops: [0, 0.25, 0.5, 0.75, 1].map((t) => ctx.seq(t)), labels: [f(lo), f((lo + hi) / 2), f(hi)], ramp: rp };
  } else if (catColor) lg = catLegend(ctx, ec.name, cl, color, 'circle');
  let sizeF = null;
  if (es) {
    const sv = pts.map((p) => p.s).filter((v) => v != null && v >= 0);
    const mx = Math.max(...sv);
    const rMax = Math.max(ctx.pointR * 4, Math.min(ctx.box.w, ctx.box.h) * 0.07);
    sizeF = (v) => (v == null || v < 0 ? ctx.pointR * 0.6 : Math.sqrt(v / mx) * rMax);
    if (!lg) {
      const f = makeFormat({ comma: ctx.comma });
      const nice = d3.scaleLinear().domain([0, mx]).nice().ticks(3).filter((v) => v > 0).slice(-3);
      lg = { type: 'size', title: es.name, items: nice.map((v) => ({ r: sizeF(v), label: f(v) })) };
    }
  }
  const box2 = withLegend(ctx, lg);
  const g = ctx.g;
  const sx0 = niceLinear(ctx.fixed?.x || xd, Math.max(3, Math.round(box2.w / (ctx.th.sizes.tick * 7))), { zero: o.xZero, min: o.xMin, max: o.xMax, log: o.xLog });
  const sy0 = niceLinear(ctx.fixed?.y || yd, Math.max(3, Math.round(box2.h / (ctx.th.sizes.tick * 4.2))), { zero: o.yZero, min: o.yMin, max: o.yMax, log: o.yLog });
  const xt = sx0.ticks(Math.max(3, Math.round(box2.w / (ctx.th.sizes.tick * 7)))), yt = sy0.ticks(Math.max(3, Math.round(box2.h / (ctx.th.sizes.tick * 4.2))));
  const yTitle = ctx.noYTitle ? '' : o.yTitle || `${ey.name}${ey.col.unit ? ` (${ey.col.unit})` : ''}`;
  const L = layoutPlot(ctx, box2, { yTicks: yt, xTicks: xt, yTitle, xTitle: xAxisTitle(ctx, ex) });
  const inner = L.inner;
  const sx = sx0.copy().range([inner.x, inner.x + inner.w]), sy = sy0.copy().range([inner.y + inner.h, inner.y]);
  ctx.xExtent = xd; ctx.yExtent = yd;
  drawGridY(ctx, g, sy, inner, yt); drawGridX(ctx, g, sx, inner, xt);
  const clip = `${ctx.uid}-clip`;
  const cp = svgEl('clipPath', { id: clip }, ctx.defs); svgEl('rect', { x: inner.x, y: inner.y, width: inner.w, height: inner.h }, cp);
  const gl = svgEl('g', { 'clip-path': `url(#${clip})` }, g);
  // tendencia (por grupo si hay color categórico)
  const trendSets = o.trend && o.trend !== 'none' ? (catColor && o.trendBy !== 'all' ? cl.map((c) => ({ c, p: pts.filter((p) => String(p.c) === c) })) : [{ c: null, p: pts }]) : [];
  const eqs = [];
  for (const ts of trendSets) {
    const xs = ts.p.map((p) => p.x), ys = ts.p.map((p) => p.y);
    const tr = fitTrend(xs, ys, o.trend);
    if (!tr) continue;
    const col = ts.c != null ? color(ts.c) : ctx.c.ink;
    const [a, b] = [Math.min(...xs), Math.max(...xs)];
    const grid = d3.range(80).map((i) => a + ((b - a) * i) / 79);
    if (tr.loess) {
      const order = xs.map((x, i) => [x, ys[i]]).sort((p, q) => p[0] - q[0]);
      const yl = S.loess(order.map((p) => p[0]), order.map((p) => p[1]), o.span || 0.75, grid);
      svgEl('path', { d: d3.line()(grid.map((x, i) => [sx(x), sy(yl[i])])), fill: 'none', stroke: col, 'stroke-width': ctx.lineW * 1.2 }, gl);
      continue;
    }
    if (o.band !== false) svgEl('path', { d: d3.area().x((x) => sx(x)).y0((x) => sy(tr.band(x)[0])).y1((x) => sy(tr.band(x)[1]))(grid), fill: col, 'fill-opacity': 0.13 }, gl);
    svgEl('path', { d: d3.line()(grid.map((x) => [sx(x), sy(tr.f(x))])), fill: 'none', stroke: col, 'stroke-width': ctx.lineW * 1.2 }, gl);
    if (o.annotate === 'stats') eqs.push({ c: ts.c, col, lines: eqText(ctx, tr, xs, ys) });
  }
  const jit = o.jitter ? (ctx.th.sizes.tick * 0.6) : 0;
  const ordered = pts.slice().sort((a, b) => (b.s ?? 0) - (a.s ?? 0));
  const fmt = fmtV(ctx);
  ordered.forEach((p, i) => {
    const col = numColor ? numColor(p.c) : catColor ? color(p.c) : singleColor(ctx);
    const dim = o.highlight && catColor && String(p.c) !== o.highlight;
    const jx = jit ? (((i * 0.618) % 1) - 0.5) * jit : 0, jy = jit ? (((i * 0.382) % 1) - 0.5) * jit : 0;
    tip(svgEl('circle', { cx: sx(p.x) + jx, cy: sy(p.y) + jy, r: sizeF ? sizeF(p.s) : ctx.pointR, fill: col, 'fill-opacity': dim ? 0.15 : sizeF ? 0.6 : ctx.th.pointOpacity, stroke: ctx.c.bg, 'stroke-width': ctx.gapW * 0.7, 'data-cat': catColor ? String(p.c) : null }, gl), `${p.l != null ? `<b>${p.l}</b><br>` : ''}${ex.name}: ${fmt(p.x)}<br>${ey.name}: ${fmt(p.y)}${ec ? `<br>${ec.name}: ${p.c}` : ''}${es ? `<br>${es.name}: ${fmt(p.s)}` : ''}`);
  });
  // rótulos: los extremos, o todos si son pocos
  if (el) {
    const nLab = o.labelSome === 'all' ? pts.length : o.labelSome === 'none' ? 0 : Math.min(pts.length, 8);
    const resid = (p) => Math.abs((p.y - (yd[0] + yd[1]) / 2) / (yd[1] - yd[0] || 1)) + Math.abs((p.x - (xd[0] + xd[1]) / 2) / (xd[1] - xd[0] || 1));
    const pick = pts.length <= nLab ? pts : pts.slice().sort((a, b) => resid(b) - resid(a)).slice(0, nLab);
    const placed = [];
    for (const p of pick) {
      const lx = sx(p.x) + (sizeF ? sizeF(p.s) : ctx.pointR) + 2, ly = sy(p.y) + ctx.th.sizes.label * 0.35;
      const w = textWidth(p.l, ctx.th.sizes.label, ctx.th.font), h = ctx.th.sizes.label;
      if (placed.some((q) => lx < q.x + q.w && lx + w > q.x && ly - h < q.y && ly > q.y - q.h)) continue;
      placed.push({ x: lx, y: ly, w, h });
      text(g, lx, ly, p.l, { size: ctx.th.sizes.label, fill: ctx.c.ink, family: ctx.th.font });
    }
  }
  if (eqs.length) {
    let yy = inner.y + ctx.th.sizes.label * 1.2;
    for (const e of eqs) for (const ln of e.lines) { text(g, inner.x + ctx.th.sizes.label * 0.6, yy, (e.c != null && ln === e.lines[0] ? `${e.c}: ` : '') + ln, { size: ctx.th.sizes.label, fill: e.c != null ? ctx.c.ink : ctx.c.ink, family: ctx.th.font, italic: true }); yy += ctx.th.sizes.label * 1.3; }
  }
  refLines(ctx, g, sy, inner);
  axisLeft(ctx, g, sy, inner, { ticks: yt, title: yTitle });
  axisBottom(ctx, g, sx, inner, { ticks: xt, title: xAxisTitle(ctx, ex) });
  if (o.trend && o.trend !== 'none' && o.trend !== 'loess') ctx.note(`Recta${o.trend === 'linear' ? '' : ' o curva'} de mínimos cuadrados${o.band !== false ? ' con intervalo de confianza del 95 % de la media' : ''}.`);
  if (o.trend === 'loess') ctx.note('Curva suavizada LOESS (local, grado 1).');
}

// ======================= LÍNEAS Y ÁREAS =======================
function seriesData(ctx, ex, ey, ec, agg) {
  const isT = ex.col.type === 'date' || ex.col.type === 'num';
  const keyX = (r) => (r[ex.j] == null ? null : isT ? String(r[ex.j]) : String(r[ex.j]));
  const data = groupAgg(ctx.rows, [keyX, (r) => (ec ? (r[ec.j] == null ? null : String(r[ec.j])) : '__')], ey ? (r) => r[ey.j] : null, ey ? agg : 'count');
  const cl = ec ? levelsIn(ctx, ec, ctx.rows) : ['__'];
  let xs;
  if (isT) xs = [...new Set(data.map((d) => d.keys[0]))].sort((a, b) => (ex.col.type === 'date' ? Date.parse(a) - Date.parse(b) : +a - +b));
  else xs = levelsIn(ctx, ex, ctx.rows);
  return { data, cl, xs, isT };
}
export function line(ctx) { return lineArea(ctx, false); }
export function area(ctx) { return lineArea(ctx, true); }
function lineArea(ctx, isArea) {
  const ex = enc(ctx, 'x'), ey = enc(ctx, 'y'), ec = enc(ctx, 'color');
  if (!ex) return ctx.need('Elegí la variable de tiempo o secuencia.');
  const o = ctx.opt, agg = ey ? ctx.panel.agg || 'sum' : 'count';
  const { data, cl, xs, isT } = seriesData(ctx, ex, ey, ec, agg);
  const get = (x, c) => { const d = data.find((q) => q.keys[0] === x && q.keys[1] === c); return d ? d.value : null; };
  const mode = isArea ? o.stackArea || 'stack' : 'none';
  const tot = Object.fromEntries(xs.map((x) => [x, cl.reduce((s, c) => s + (get(x, c) || 0), 0)]));
  const base100 = o.index100 && !isArea ? Object.fromEntries(cl.map((c) => [c, xs.map((x) => get(x, c)).find((v) => v != null && v !== 0)])) : null;
  const val = (x, c) => { let v = get(x, c); if (v == null) return null; if (mode === 'percent') return tot[x] ? (v / tot[x]) * 100 : 0; if (base100) return base100[c] ? (v / base100[c]) * 100 : null; return v; };
  const xv = (x) => (isT ? (ex.col.type === 'date' ? new Date(Date.parse(x.length <= 10 ? x + 'T00:00:00Z' : x)) : +x) : x);
  let lo = Infinity, hi = -Infinity;
  const stackGen = () => { const sg = d3.stack().keys(cl).value((x, c) => val(x, c) || 0); if (mode === 'stream') sg.offset(d3.stackOffsetWiggle).order(d3.stackOrderInsideOut); return sg; };
  if (isArea && mode === 'stream') { const st0 = stackGen()(xs); lo = d3.min(st0, (l) => d3.min(l, (d) => d[0])); hi = d3.max(st0, (l) => d3.max(l, (d) => d[1])); }
  else if (isArea) xs.forEach((x) => { let s = 0; cl.forEach((c) => { s += val(x, c) || 0; }); hi = Math.max(hi, s); lo = Math.min(lo, 0); });
  else data.forEach((d) => { const v = val(d.keys[0], d.keys[1]); if (v != null) { lo = Math.min(lo, v); hi = Math.max(hi, v); } });
  const bands = {};
  if (o.band && !isArea && ey && agg === 'mean') for (const c of cl) bands[c] = xs.map((x) => { const d = data.find((q) => q.keys[0] === x && q.keys[1] === c); if (!d || d.vals.length < 2) return null; const ds = S.describe(d.vals.filter(Number.isFinite)); lo = Math.min(lo, ds.ciLow); hi = Math.max(hi, ds.ciHigh); return [ds.ciLow, ds.ciHigh]; });
  if (ctx.measure) return { y: [lo, hi] };
  const color = colorScale(ctx, ec ? ec.key : null);
  const endLab = !isArea && ec && o.endLabels !== false && cl.length <= 8;
  const box2 = withLegend(ctx, ec && !(endLab && (ctx.opt.legend || 'auto') === 'auto') ? catLegend(ctx, ec.name, cl, color, isArea ? 'square' : 'line') : null);
  const g = ctx.g;
  // margen derecho para rótulos al final de las líneas
  const labW = endLab ? Math.min(box2.w * 0.28, Math.max(...cl.map((c) => textWidth(c, ctx.th.sizes.label, ctx.th.font))) + ctx.th.sizes.label) : 0;
  const bx = { ...box2, w: box2.w - labW };
  const yTitle = mode === 'percent' ? (o.yTitle || 'Porcentaje') : base100 ? (o.yTitle || 'Índice (primer valor = 100)') : yAxisTitle(ctx, ey, agg);
  const sy0 = niceLinear(ctx.fixed?.y || [lo, hi], Math.max(3, Math.round(bx.h / (ctx.th.sizes.tick * 4.2))), { zero: isArea || o.yZero, min: o.yMin, max: o.yMax, log: o.yLog });
  const yt = sy0.ticks(Math.max(3, Math.round(bx.h / (ctx.th.sizes.tick * 4.2))));
  let sx0, xt = null, xLabels = null;
  if (isT && ex.col.type === 'date') { sx0 = d3.scaleUtc().domain(d3.extent(xs.map(xv))); xt = sx0.ticks(Math.max(3, Math.round(bx.w / (ctx.th.sizes.tick * 8)))); }
  else if (isT) {
    sx0 = d3.scaleLinear().domain(d3.extent(xs.map(xv)));
    const yearish = xs.every((x) => /^\d{4}$/.test(x));
    xt = yearish && xs.length <= 14 ? xs.map(Number) : sx0.ticks(Math.max(3, Math.round(bx.w / (ctx.th.sizes.tick * 7))));
    if (yearish) xLabels = xt.map(String);
  } else { sx0 = d3.scalePoint().domain(xs).padding(0.3); xLabels = xs; }
  const L = layoutPlot(ctx, bx, { yTicks: yt, xTicks: xt || [], xLabels: xLabels || (xt ? null : xs), xBand: !isT, yTitle, xTitle: xAxisTitle(ctx, ex) });
  const inner = L.inner;
  const sx = sx0.copy().range([inner.x, inner.x + inner.w]);
  const sy = sy0.copy().range([inner.y + inner.h, inner.y]);
  drawGridY(ctx, g, sy, inner, yt);
  const X = (x) => sx(xv(x));
  const curve = o.step ? d3.curveStepAfter : o.smooth ? d3.curveMonotoneX : d3.curveLinear;
  const fmt = fmtV(ctx);
  if (isArea) {
    const st = stackGen()(xs);
    st.forEach((layer, i) => {
      const c = cl[i];
      svgEl('path', { 'data-cat': c, d: d3.area().x((d) => X(d.data)).y0((d) => sy(d[0])).y1((d) => sy(d[1])).curve(curve)(layer), fill: fillFor(ctx, color(c), i), 'fill-opacity': ctx.th.patterns ? 1 : 0.88, stroke: ctx.c.bg, 'stroke-width': ctx.gapW }, g);
    });
  } else {
    cl.forEach((c, ci) => {
      const col = color(c);
      const pts = xs.map((x) => [x, val(x, c)]).filter((p) => p[1] != null);
      if (bands[c]) { const bp = xs.map((x, i) => [x, bands[c][i]]).filter((p) => p[1]); svgEl('path', { d: d3.area().x((p) => X(p[0])).y0((p) => sy(p[1][0])).y1((p) => sy(p[1][1])).curve(curve)(bp), fill: col, 'fill-opacity': 0.14 }, g); }
      const dim = o.highlight && ec && c !== o.highlight;
      svgEl('path', { d: d3.line().x((p) => X(p[0])).y((p) => sy(p[1])).curve(curve).defined((p) => p[1] != null)(pts), fill: 'none', stroke: col, 'stroke-width': dim ? ctx.lineW * 0.8 : ctx.lineW * (o.highlight && !dim ? 1.6 : 1), 'stroke-linejoin': 'round', 'stroke-linecap': 'round', 'stroke-dasharray': ctx.th.patterns && ci > 0 ? ['', '5 2', '1.5 1.8', '6 2 1.5 2'][ci % 4] : null, filter: glowFilter(ctx), 'data-cat': ec ? c : null }, g);
      if (o.points !== false && (o.points || pts.length <= 24)) pts.forEach((p) => tip(svgEl('circle', { cx: X(p[0]), cy: sy(p[1]), r: ctx.pointR * 0.95, fill: col, stroke: ctx.c.bg, 'stroke-width': ctx.gapW * 0.8 }, g), `<b>${p[0]}</b>${ec ? ` · ${c}` : ''}<br>${fmt(p[1])}`));
      if (endLab && pts.length) { const last = pts[pts.length - 1]; c && (pts.lastY = sy(last[1])); }
      c && (bands[`__last_${c}`] = pts.length ? [X(pts[pts.length - 1][0]), sy(pts[pts.length - 1][1])] : null);
    });
    if (endLab) {
      // evita superposición de rótulos finales (reparte hacia arriba y hacia abajo)
      const labs = cl.map((c) => ({ c, x: (bands[`__last_${c}`] || [])[0], y0: (bands[`__last_${c}`] || [])[1] })).filter((q) => q.x != null).sort((a, b) => a.y0 - b.y0);
      const h = ctx.th.sizes.label * 1.15;
      labs.forEach((q) => { q.y = q.y0; });
      for (let it = 0; it < 40; it++) {
        let moved = false;
        for (let i = 1; i < labs.length; i++) { const d = labs[i].y - labs[i - 1].y; if (d < h) { const sh = (h - d) / 2; labs[i - 1].y -= sh; labs[i].y += sh; moved = true; } }
        if (!moved) break;
      }
      labs.forEach((q) => { q.p = [q.x, q.y]; if (Math.abs(q.y - q.y0) > 1) svgEl('line', { x1: q.x + ctx.pointR, x2: q.x + ctx.pointR * 2, y1: q.y0, y2: q.y, stroke: ctx.c.grid, 'stroke-width': ctx.hair }, g); });
      labs.forEach((q) => text(g, q.p[0] + ctx.pointR * 2 + 1, q.p[1], q.c, { size: ctx.th.sizes.label, fill: ctx.c.ink, family: ctx.th.font, baseline: 'central', weight: o.highlight === q.c ? 700 : 400 }));
    }
  }
  refLines(ctx, g, sy, inner);
  axisLeft(ctx, g, sy, inner, { ticks: yt, title: yTitle });
  if (isT) axisBottom(ctx, g, sx, inner, { ticks: xt, labels: xLabels, title: xAxisTitle(ctx, ex), time: ex.col.type === 'date' });
  else axisBottom(ctx, g, d3.scaleBand().domain(xs).range([inner.x, inner.x + inner.w]).padding(0.3 / (1 + 0.3)), inner, { band: true, rot: L.xRot, lines: L.xLines, title: xAxisTitle(ctx, ex) });
  if (!isT && ex.col.type === 'cat') ctx.note('El eje horizontal es una categoría sin orden: una línea sugiere una continuidad que quizás no existe (¿barras o puntos?).');
  if (base100) ctx.note('Índice: cada serie vale 100 en su primer dato, para comparar ritmos de cambio en un mismo eje.');
}

// ======================= PENDIENTES =======================
export function slope(ctx) {
  const ey = enc(ctx, 'y'), ey2 = enc(ctx, 'y2'), el = enc(ctx, 'label'), ec = enc(ctx, 'color');
  if (!ey || !ey2) return ctx.need('Elegí las dos mediciones (antes y después).');
  const o = ctx.opt;
  const pts = ctx.rows.filter((r) => r[ey.j] != null && r[ey2.j] != null).map((r, i) => ({ a: +r[ey.j], b: +r[ey2.j], l: el ? String(r[el.j]) : `Caso ${i + 1}`, c: ec ? String(r[ec.j]) : null }));
  if (!pts.length) return ctx.need('No hay casos con las dos mediciones.');
  const vals = pts.flatMap((p) => [p.a, p.b]);
  if (ctx.measure) return { y: [Math.min(...vals), Math.max(...vals)] };
  const color = colorScale(ctx, ec ? ec.key : null);
  const box2 = withLegend(ctx, ec ? catLegend(ctx, ec.name, levelsIn(ctx, ec, ctx.rows), color, 'line') : null);
  const g = ctx.g;
  const labW = Math.min(box2.w * 0.3, Math.max(...pts.map((p) => textWidth(p.l, ctx.th.sizes.label, ctx.th.font))) + textWidth('0000,0', ctx.th.sizes.label, ctx.th.font) + 6);
  const inner = { x: box2.x + labW, y: box2.y + ctx.th.sizes.tick * 2.4, w: box2.w - labW * 2, h: box2.h - ctx.th.sizes.tick * 3 };
  const sy = niceLinear([Math.min(...vals), Math.max(...vals)], 5, { zero: o.yZero, min: o.yMin, max: o.yMax }).range([inner.y + inner.h, inner.y]);
  const xa = inner.x, xb = inner.x + inner.w;
  text(g, xa, inner.y - ctx.th.sizes.tick * 1.3, o.labelA || ey.name, { size: ctx.th.sizes.axis, fill: ctx.c.ink, family: ctx.th.font, anchor: 'middle', weight: 700 });
  text(g, xb, inner.y - ctx.th.sizes.tick * 1.3, o.labelB || ey2.name, { size: ctx.th.sizes.axis, fill: ctx.c.ink, family: ctx.th.font, anchor: 'middle', weight: 700 });
  svgEl('line', { x1: xa, x2: xa, y1: inner.y, y2: inner.y + inner.h, stroke: ctx.c.grid, 'stroke-width': ctx.hair * 2 }, g);
  svgEl('line', { x1: xb, x2: xb, y1: inner.y, y2: inner.y + inner.h, stroke: ctx.c.grid, 'stroke-width': ctx.hair * 2 }, g);
  const fmt = fmtV(ctx);
  const lab = pts.length <= 14 || o.labelSome === 'all';
  const placedA = [], placedB = [];
  const free = (arr, y) => { const h = ctx.th.sizes.label * 1.05; if (arr.some((q) => Math.abs(q - y) < h)) return false; arr.push(y); return true; };
  pts.sort((p, q) => Math.abs(q.b - q.a) - Math.abs(p.b - p.a)).forEach((p) => {
    const up = p.b >= p.a;
    const col = ec ? color(p.c) : up ? singleColor(ctx) : ctx.c.muted;
    const dim = o.highlight && p.l !== o.highlight && p.c !== o.highlight;
    tip(svgEl('line', { x1: xa, x2: xb, y1: sy(p.a), y2: sy(p.b), stroke: dim ? ctx.c.grid : col, 'stroke-width': ctx.lineW * (dim ? 0.8 : 1.2) }, g), `<b>${p.l}</b><br>${fmt(p.a)} → ${fmt(p.b)}`);
    svgEl('circle', { cx: xa, cy: sy(p.a), r: ctx.pointR, fill: dim ? ctx.c.grid : col }, g); svgEl('circle', { cx: xb, cy: sy(p.b), r: ctx.pointR, fill: dim ? ctx.c.grid : col }, g);
    if (lab && !dim) {
      if (free(placedA, sy(p.a))) text(g, xa - ctx.pointR - 2, sy(p.a), `${p.l} ${fmt(p.a)}`, { size: ctx.th.sizes.label, fill: ctx.c.muted, family: ctx.th.font, anchor: 'end', baseline: 'central' });
      if (free(placedB, sy(p.b))) text(g, xb + ctx.pointR + 2, sy(p.b), `${fmt(p.b)} ${p.l}`, { size: ctx.th.sizes.label, fill: ctx.c.muted, family: ctx.th.font, baseline: 'central' });
    }
  });
}

// ======================= PIRÁMIDE =======================
export function pyramid(ctx) {
  const ea = enc(ctx, 'y'), es = enc(ctx, 'color'), ev = enc(ctx, 'x');
  if (!ea || !es) return ctx.need('Elegí los grupos de edad y la variable de sexo.');
  const o = ctx.opt;
  const sexes = levelsIn(ctx, es, ctx.rows).slice(0, 2);
  if (sexes.length < 2) return ctx.need('La variable de sexo necesita dos valores.');
  const ages = ea.col.type === 'num' ? [...new Set(ctx.rows.map((r) => r[ea.j]).filter((v) => v != null))].sort((a, b) => a - b).map(String) : levelsIn(ctx, ea, ctx.rows);
  const data = groupAgg(ctx.rows, [(r) => (r[ea.j] == null ? null : String(r[ea.j])), (r) => (r[es.j] == null ? null : String(r[es.j]))], ev ? (r) => r[ev.j] : null, ev ? 'sum' : 'count');
  const total = data.reduce((s, d) => s + (d.value || 0), 0);
  const get = (a, s) => { const d = data.find((q) => q.keys[0] === a && q.keys[1] === s); const v = d ? d.value : 0; return o.pyrPct ? (v / total) * 100 : v; };
  const mx = Math.max(...ages.flatMap((a) => sexes.map((s) => get(a, s))));
  if (ctx.measure) return { y: [0, mx] };
  const color = colorScale(ctx, es.key);
  const box2 = withLegend(ctx, catLegend(ctx, es.name, sexes, color));
  const g = ctx.g;
  const labW = Math.max(...ages.map((a) => textWidth(ea.col.type === 'num' ? ageLabel(a, ages) : a, ctx.th.sizes.tick, ctx.th.font))) + ctx.th.sizes.tick;
  const inner = { x: box2.x, y: box2.y + ctx.pad, w: box2.w, h: box2.h - ctx.th.sizes.tick * 3.2 - ctx.pad };
  const half = (inner.w - labW) / 2;
  const sxv = d3.scaleLinear().domain([0, mx]).nice().range([0, half]);
  const band = d3.scaleBand().domain(ages.slice().reverse()).range([inner.y, inner.y + inner.h]).padding(0.12);
  const cx = inner.x + half;
  const f = makeFormat({ comma: ctx.comma, pct: o.pyrPct, decimals: o.pyrPct ? 1 : null });
  const ticks = sxv.ticks(3);
  ticks.forEach((t) => {
    [cx - sxv(t), cx + labW + sxv(t)].forEach((xx) => { svgEl('line', { x1: xx, x2: xx, y1: inner.y, y2: inner.y + inner.h, stroke: ctx.c.grid, 'stroke-width': ctx.hair }, g); text(g, xx, inner.y + inner.h + ctx.th.sizes.tick * 1.3, f(t, ticks[1] - ticks[0]), { size: ctx.th.sizes.tick, fill: ctx.c.muted, family: ctx.th.font, anchor: 'middle' }); });
  });
  ages.forEach((a) => {
    const y = band(a), h = band.bandwidth();
    const L = get(a, sexes[0]), R = get(a, sexes[1]);
    tip(svgEl('rect', { x: cx - sxv(L), y, width: sxv(L), height: h, fill: fillFor(ctx, color(sexes[0]), 0, 'h'), rx: Math.min(ctx.th.barRadius, h / 3) }, g), `${a} · ${sexes[0]}: ${f(L)}`);
    tip(svgEl('rect', { x: cx + labW, y, width: sxv(R), height: h, fill: fillFor(ctx, color(sexes[1]), 1, 'h'), rx: Math.min(ctx.th.barRadius, h / 3) }, g), `${a} · ${sexes[1]}: ${f(R)}`);
    text(g, cx + labW / 2, y + h / 2, ea.col.type === 'num' ? ageLabel(a, ages) : a, { size: ctx.th.sizes.tick, fill: ctx.c.muted, family: ctx.th.font, anchor: 'middle', baseline: 'central' });
    if (o.showValues && h > ctx.th.sizes.label) { text(g, cx - sxv(L) - 2, y + h / 2, f(L), { size: ctx.th.sizes.label * 0.9, fill: ctx.c.muted, family: ctx.th.font, anchor: 'end', baseline: 'central' }); text(g, cx + labW + sxv(R) + 2, y + h / 2, f(R), { size: ctx.th.sizes.label * 0.9, fill: ctx.c.muted, family: ctx.th.font, baseline: 'central' }); }
  });
  text(g, inner.x + inner.w / 2, box2.y + box2.h - ctx.th.sizes.axis * 0.3, o.pyrPct ? 'Porcentaje de la población total' : ev ? ev.name : 'Cantidad de personas', { size: ctx.th.sizes.axis, fill: ctx.c.ink, family: ctx.th.font, anchor: 'middle', weight: 600 });
}
function ageLabel(a, ages) { const i = ages.indexOf(a); const nx = ages[i + 1]; return nx != null ? `${a}–${+nx - 1}` : `${a} y más`; }

// ======================= COEFICIENTES =======================
export function coef(ctx) {
  const ey = enc(ctx, 'y');
  const xsKeys = (ctx.panel.enc.xs || []).filter((k) => getCol(ctx.table, k) && k !== ctx.panel.enc.y);
  if (!ey || !xsKeys.length) return ctx.need('Elegí la variable dependiente y los predictores.');
  const o = ctx.opt;
  const js = [ey.j, ...xsKeys.map((k) => ctx.table.columns.findIndex((c) => c.key === k))];
  const rows = ctx.rows.filter((r) => js.every((j) => r[j] != null));
  const names = [], encs = [];
  xsKeys.forEach((k, i) => {
    const c = getCol(ctx.table, k); const j = js[i + 1];
    if (isNum(c)) { names.push(c.name); encs.push((r) => [o.coefStd ? (r[j] - S.mean(rows.map((q) => q[j]))) / S.sd(rows.map((q) => q[j])) : r[j]]); }
    else { const L = levelsOf(ctx.table, k).filter((l) => rows.some((r) => String(r[j]) === l)); L.slice(1).forEach((l) => names.push(`${c.name}: ${l}`)); encs.push((r) => L.slice(1).map((l) => (String(r[j]) === l ? 1 : 0))); }
  });
  const X = rows.map((r) => encs.flatMap((f) => f(r)));
  let items, ref = 0, xTitle;
  const logistic = !isNum(ey.col);
  if (logistic) {
    const L = levelsOf(ctx.table, ey.key).filter((l) => rows.some((r) => String(r[ey.j]) === l));
    const ev = o.event && L.includes(o.event) ? o.event : L[1];
    const fit = S.logistic(X, rows.map((r) => (String(r[ey.j]) === ev ? 1 : 0)), names);
    if (fit.error) return ctx.need(fit.error);
    items = fit.coefs.slice(1).map((c) => ({ name: c.name, v: c.or, lo: c.orLow, hi: c.orHigh, p: c.p }));
    ref = 1; xTitle = `Razón de odds de «${ev}» (IC 95 %, escala logarítmica)`;
  } else {
    const yv = rows.map((r) => r[ey.j]);
    const yy = o.coefStd ? yv.map((v) => (v - S.mean(yv)) / S.sd(yv)) : yv;
    const fit = S.ols(X, yy, names);
    if (fit.error) return ctx.need(fit.error);
    items = fit.coefs.slice(1).map((c) => ({ name: c.name, v: c.b, lo: c.ciLow, hi: c.ciHigh, p: c.p }));
    xTitle = o.coefStd ? 'Coeficiente estandarizado (IC 95 %)' : `Coeficiente B (IC 95 %) sobre ${ey.name}`;
  }
  if (ctx.measure) return {};
  const box2 = withLegend(ctx, null);
  const g = ctx.g;
  const ext = [Math.min(ref, ...items.map((i) => i.lo)), Math.max(ref, ...items.map((i) => i.hi))];
  const sx0 = logistic ? d3.scaleLog().domain([Math.max(1e-3, ext[0]), ext[1]]).nice() : d3.scaleLinear().domain(ext).nice();
  const xt = logistic ? sx0.ticks(4).filter((v, i, a) => a.length < 8 || [0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100].includes(+v.toPrecision(1))) : sx0.ticks(5);
  const L = layoutPlot(ctx, box2, { yBand: true, yLabels: items.map((i) => i.name), xTicks: xt, xTitle });
  const inner = L.inner;
  const sx = sx0.copy().range([inner.x, inner.x + inner.w]);
  const band = d3.scaleBand().domain(items.map((i) => i.name)).range([inner.y, inner.y + inner.h]).padding(0.4);
  drawGridX({ ...ctx, th: { ...ctx.th, gridX: true } }, g, sx, inner, xt);
  svgEl('line', { x1: sx(ref), x2: sx(ref), y1: inner.y, y2: inner.y + inner.h, stroke: ctx.c.ink, 'stroke-width': ctx.hair * 1.6, 'stroke-dasharray': '3 2' }, g);
  const f = makeFormat({ comma: ctx.comma });
  items.forEach((it) => {
    const y = band(it.name) + band.bandwidth() / 2, sig = it.p < 0.05;
    const col = sig ? singleColor(ctx) : ctx.c.muted;
    svgEl('line', { x1: sx(it.lo), x2: sx(it.hi), y1: y, y2: y, stroke: col, 'stroke-width': ctx.lineW * 1.2 }, g);
    tip(svgEl('rect', { x: sx(it.v) - ctx.pointR * 1.2, y: y - ctx.pointR * 1.2, width: ctx.pointR * 2.4, height: ctx.pointR * 2.4, fill: sig ? col : ctx.c.bg, stroke: col, 'stroke-width': ctx.lineW }, g), `<b>${it.name}</b><br>${f(it.v)} [${f(it.lo)}; ${f(it.hi)}]<br>p ${pcell(it.p)}`);
  });
  axisLeft({ ...ctx, th: { ...ctx.th, axisLineY: false } }, g, band, inner, { band: true });
  axisBottom(ctx, g, sx, inner, { ticks: xt, title: xTitle, fmt: logistic ? (v) => f(v) : null });
  ctx.note(`Cuadrados llenos: p < ,05. Línea punteada: sin efecto (${logistic ? 'OR = 1' : 'B = 0'}).`);
}

// ======================= BIPLOT =======================
export function biplot(ctx) {
  const vars = (ctx.panel.enc.vars || []).filter((k) => isNum(getCol(ctx.table, k)));
  if (vars.length < 2) return ctx.need('Elegí al menos dos variables numéricas.');
  const ec = enc(ctx, 'color'), el = enc(ctx, 'label');
  const js = vars.map((k) => ctx.table.columns.findIndex((c) => c.key === k));
  const rows = ctx.rows.filter((r) => js.every((j) => r[j] != null && Number.isFinite(r[j])));
  if (rows.length < vars.length + 2) return ctx.need('Faltan casos completos.');
  const res = S.pca(js.map((j) => rows.map((r) => r[j])), vars.map((k) => getCol(ctx.table, k).name));
  const sc = res.scores.map((s) => [s[0], s[1]]);
  if (ctx.measure) return {};
  const cl = ec ? levelsIn(ctx, ec, rows) : ['__'];
  const color = colorScale(ctx, ec ? ec.key : null);
  const box2 = withLegend(ctx, ec ? catLegend(ctx, ec.name, cl, color, 'circle') : null);
  const g = ctx.g;
  const ext = Math.max(...sc.flatMap((p) => p.map(Math.abs))) * 1.08;
  const s0 = d3.scaleLinear().domain([-ext, ext]).nice();
  const t = s0.ticks(5);
  const xT = `CP1 (${num1(res.share[0] * 100, 1).replace(/^[.,]/, '0$&')} % de la varianza)`, yT = `CP2 (${num1(res.share[1] * 100, 1).replace(/^[.,]/, '0$&')} %)`;
  const L = layoutPlot(ctx, box2, { yTicks: t, xTicks: t, xTitle: xT, yTitle: yT });
  const inner = L.inner;
  const sx = s0.copy().range([inner.x, inner.x + inner.w]), sy = s0.copy().range([inner.y + inner.h, inner.y]);
  drawGridY(ctx, g, sy, inner, t);
  svgEl('line', { x1: sx(0), x2: sx(0), y1: inner.y, y2: inner.y + inner.h, stroke: ctx.c.grid, 'stroke-width': ctx.hair * 1.5 }, g);
  sc.forEach((p, i) => tip(svgEl('circle', { cx: sx(p[0]), cy: sy(p[1]), r: ctx.pointR * 0.9, fill: ec ? color(rows[i][ec.j]) : singleColor(ctx), opacity: 0.7 }, g), el ? String(rows[i][el.j]) : `Caso ${i + 1}`));
  const k = ext * 0.9;
  res.loadings[0].forEach((l0, j) => {
    const l1 = res.loadings[1][j];
    const x2 = sx(l0 * k), y2 = sy(l1 * k);
    const id = `${ctx.uid}-arr`;
    if (!ctx.defs.querySelector(`#${CSS.escape(id)}`)) { const m = svgEl('marker', { id, viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 5, markerHeight: 5, orient: 'auto' }, ctx.defs); svgEl('path', { d: 'M0,0L10,5L0,10z', fill: ctx.c.ink }, m); }
    svgEl('line', { x1: sx(0), y1: sy(0), x2, y2, stroke: ctx.c.ink, 'stroke-width': ctx.lineW, 'marker-end': `url(#${id})` }, g);
    text(g, x2 + (l0 >= 0 ? 2 : -2), y2 + (l1 >= 0 ? -2 : ctx.th.sizes.label), res.names[j], { size: ctx.th.sizes.label, fill: ctx.c.ink, family: ctx.th.font, anchor: l0 >= 0 ? 'start' : 'end', weight: 600 });
  });
  axisLeft(ctx, g, sy, inner, { ticks: t, title: yT });
  axisBottom(ctx, g, sx, inner, { ticks: t, title: xT });
  ctx.note('Flechas: cargas de cada variable (escaladas); puntos: casos en los dos primeros componentes (variables estandarizadas).');
}
