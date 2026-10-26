// Gráficos sin ejes cartesianos: torta, pictograma, mosaico, mapa de calor, correlaciones, radar, cifras y mapa.
import { svgEl, mixHex, norm } from '../util.js';
import * as S from '../stats/engine.js';
import { num1 } from '../stats/report.js';
import { getCol, isNum, aggregate } from '../data/table.js';
import { getRamp, rampColor } from '../palette.js';
import { d3, text, textWidth, enc, groupAgg, levelsIn, colorScale, singleColor, fillFor, glowFilter, makeFormat, wrapText, readableOn } from './core.js';
import { withLegend } from './render-xy.js';
import { geoFeatures, matchName } from './geo.js';

const tip = (el, html) => { el.setAttribute('data-tip', html); return el; };
function partsOf(ctx, { maxSlices = null } = {}) {
  const ex = enc(ctx, 'x'), ey = enc(ctx, 'y');
  if (!ex) return null;
  const agg = ey ? ctx.panel.agg || 'sum' : 'count';
  const lv = levelsIn(ctx, ex, ctx.rows);
  const data = groupAgg(ctx.rows, [(r) => (r[ex.j] == null ? null : String(r[ex.j]))], ey ? (r) => r[ey.j] : null, agg === 'pct' ? 'sum' : agg);
  let parts = lv.map((l) => ({ l, v: (data.find((d) => d.keys[0] === l) || {}).value || 0 })).filter((p) => p.v > 0);
  if (maxSlices && parts.length > maxSlices) {
    const s = parts.slice().sort((a, b) => b.v - a.v);
    const keep = s.slice(0, maxSlices - 1), rest = s.slice(maxSlices - 1);
    parts = parts.filter((p) => keep.includes(p)).concat([{ l: 'Otras', v: rest.reduce((a, b) => a + b.v, 0), other: true }]);
  }
  const tot = parts.reduce((a, b) => a + b.v, 0);
  return { ex, ey, parts, tot };
}

// ======================= TORTA / DONA =======================
export function pie(ctx) {
  const P = partsOf(ctx, { maxSlices: ctx.opt.maxSlices || 6 });
  if (!P) return ctx.need('Elegí la variable de las partes.');
  if (ctx.measure) return {};
  const o = ctx.opt;
  const color = colorScale(ctx, P.ex.key);
  const col = (p) => (p.other ? ctx.c.muted : color(p.l));
  const box = withLegend(ctx, { type: 'cat', title: P.ex.name, items: P.parts.map((p, i) => ({ label: p.l, color: col(p), fill: fillFor(ctx, col(p), i) })) });
  const g = ctx.g;
  const lab = o.showValues !== false;
  const R = Math.min(box.w, box.h) / 2 - (lab ? ctx.th.sizes.label * 2.2 : ctx.pad);
  const cx = box.x + box.w / 2, cy = box.y + box.h / 2;
  const arcs = d3.pie().sort(null).value((p) => p.v)(P.parts);
  const inner = o.donut ? R * (o.donut === 'thin' ? 0.72 : 0.55) : 0;
  const arc = d3.arc().innerRadius(inner).outerRadius(R).padAngle(ctx.th.id === 'neon' || ctx.th.id === 'info-azul' ? 0.012 : 0.004).cornerRadius(ctx.th.barRadius ? 1.5 : 0);
  const f = makeFormat({ comma: ctx.comma, decimals: 1 });
  const gp = svgEl('g', { transform: `translate(${cx},${cy})`, filter: glowFilter(ctx) }, g);
  arcs.forEach((a, i) => {
    const p = a.data;
    const dim = o.highlight && p.l !== o.highlight;
    tip(svgEl('path', { d: arc(a), fill: dim ? mixHex(col(p), ctx.c.bg, 0.6) : fillFor(ctx, col(p), i), stroke: ctx.c.bg, 'stroke-width': ctx.gapW }, gp), `<b>${p.l}</b><br>${f((p.v / P.tot) * 100)} %`);
    if (lab) {
      const share = p.v / P.tot;
      const mid = (a.startAngle + a.endAngle) / 2;
      const rr = share > 0.06 && !o.donut ? R * 0.62 : R + ctx.th.sizes.label * 0.9;
      const x = Math.sin(mid) * rr, y = -Math.cos(mid) * rr;
      const inside = rr < R;
      text(gp, x, y, `${f(share * 100)} %`, { size: ctx.th.sizes.label, fill: inside ? readableOn(col(p)) : ctx.c.ink, family: ctx.th.font, anchor: inside ? 'middle' : x >= 0 ? 'start' : 'end', baseline: 'central', weight: 600 });
    }
  });
  if (o.donut && o.centerText !== false) {
    text(gp, 0, -ctx.th.sizes.big * 0.05, makeFormat({ comma: ctx.comma })(P.tot), { size: Math.min(ctx.th.sizes.big * 0.8, inner * 0.55), fill: ctx.c.ink, family: ctx.th.fontTitle, anchor: 'middle', baseline: 'central', weight: 800 });
    text(gp, 0, Math.min(ctx.th.sizes.big * 0.8, inner * 0.55) * 0.75, 'total', { size: ctx.th.sizes.label, fill: ctx.c.muted, family: ctx.th.font, anchor: 'middle' });
  }
  if (P.parts.length > 6) ctx.note('Con más de seis partes, la torta ya no se lee: conviene barras ordenadas.');
}

// ======================= PICTOGRAMA (WAFFLE) =======================
const ICONS = {
  persona: 'M-0.26,-0.66a0.26,0.26 0 1,0 0.52,0a0.26,0.26 0 1,0 -0.52,0ZM-0.4,-0.3H0.4A0.1,0.1 0 0 1 0.5,-0.2V0.3H0.29V-0.06H0.25V0.95H0.03V0.4H-0.03V0.95H-0.25V-0.06H-0.29V0.3H-0.5V-0.2A0.1,0.1 0 0 1 -0.4,-0.3Z',
  casa: 'M0,-0.9L0.85,-0.1H0.62V0.85H0.18V0.35H-0.18V0.85H-0.62V-0.1H-0.85Z',
  arbol: 'M0,-0.95C0.55,-0.95 0.8,-0.5 0.6,-0.1C0.85,0.15 0.5,0.5 0.12,0.42V0.95H-0.12V0.42C-0.5,0.5 -0.85,0.15 -0.6,-0.1C-0.8,-0.5 -0.55,-0.95 0,-0.95Z',
};
export function waffle(ctx) {
  const P = partsOf(ctx);
  if (!P) return ctx.need('Elegí la variable de las partes.');
  if (ctx.measure) return {};
  const o = ctx.opt;
  const color = colorScale(ctx, P.ex.key);
  const box = withLegend(ctx, { type: 'cat', title: P.ex.name, items: P.parts.map((p, i) => ({ label: `${p.l} (${makeFormat({ comma: ctx.comma, decimals: 0 })((p.v / P.tot) * 100)} %)`, color: color(p.l), fill: fillFor(ctx, color(p.l), i), shape: o.waffleIcon && o.waffleIcon !== 'cuadro' ? 'circle' : 'square' })) });
  const g = ctx.g;
  // reparto de 100 casillas por el método del resto mayor
  const raw = P.parts.map((p) => (p.v / P.tot) * 100);
  const cells = raw.map(Math.floor);
  let left = 100 - cells.reduce((a, b) => a + b, 0);
  raw.map((r, i) => [r - Math.floor(r), i]).sort((a, b) => b[0] - a[0]).forEach(([, i]) => { if (left > 0) { cells[i]++; left--; } });
  const cols = 10, rowsN = 10;
  const s = Math.min(box.w / cols, box.h / rowsN);
  const x0 = box.x + (box.w - s * cols) / 2, y0 = box.y + (box.h - s * rowsN) / 2;
  let k = 0;
  cells.forEach((n, pi) => {
    for (let q = 0; q < n; q++, k++) {
      const c = k % cols, r = Math.floor(k / cols);
      const x = x0 + c * s, y = y0 + (rowsN - 1 - r) * s;
      const col = color(P.parts[pi].l);
      if (o.waffleIcon && ICONS[o.waffleIcon]) svgEl('path', { d: ICONS[o.waffleIcon], transform: `translate(${x + s / 2},${y + s / 2}) scale(${s * 0.44})`, fill: col }, g);
      else if (o.waffleIcon === 'circulo') svgEl('circle', { cx: x + s / 2, cy: y + s / 2, r: s * 0.4, fill: fillFor(ctx, col, pi) }, g);
      else tip(svgEl('rect', { x: x + s * 0.06, y: y + s * 0.06, width: s * 0.88, height: s * 0.88, rx: ctx.th.barRadius ? s * 0.18 : s * 0.04, fill: fillFor(ctx, col, pi) }, g), `${P.parts[pi].l}: ${n} de 100`);
    }
  });
  ctx.note('Cada casilla representa el 1 % del total (redondeo por el método del resto mayor).');
}

// ======================= MOSAICO =======================
export function treemap(ctx) {
  const ex = enc(ctx, 'x'), ey = enc(ctx, 'y'), ec = enc(ctx, 'color');
  if (!ex) return ctx.need('Elegí la variable de las partes.');
  if (ctx.measure) return {};
  const agg = ey ? ctx.panel.agg || 'sum' : 'count';
  const data = groupAgg(ctx.rows, [(r) => (ec ? (r[ec.j] == null ? null : String(r[ec.j])) : '__'), (r) => (r[ex.j] == null ? null : String(r[ex.j]))], ey ? (r) => r[ey.j] : null, agg).filter((d) => d.value > 0);
  const groups = [...new Set(data.map((d) => d.keys[0]))];
  const root = d3.hierarchy({ children: groups.map((gk) => ({ name: gk, children: data.filter((d) => d.keys[0] === gk).map((d) => ({ name: d.keys[1], value: d.value, g: gk })) })) }).sum((d) => d.value || 0).sort((a, b) => b.value - a.value);
  const color = colorScale(ctx, ec ? ec.key : ex.key);
  const box = withLegend(ctx, ec ? { type: 'cat', title: ec.name, items: groups.map((gk, i) => ({ label: gk, color: color(gk), fill: fillFor(ctx, color(gk), i) })) } : null);
  d3.treemap().size([box.w, box.h]).paddingInner(ctx.gapW * 1.2).paddingOuter(0).round(false)(root);
  const g = ctx.g;
  const tot = root.value;
  const f = makeFormat({ comma: ctx.comma });
  root.leaves().forEach((lf, i) => {
    const col = ec ? color(lf.data.g) : color(lf.data.name);
    const w = lf.x1 - lf.x0, h = lf.y1 - lf.y0;
    tip(svgEl('rect', { x: box.x + lf.x0, y: box.y + lf.y0, width: w, height: h, fill: fillFor(ctx, col, i), rx: Math.min(ctx.th.barRadius, w / 6, h / 6) }, g), `<b>${lf.data.name}</b><br>${f(lf.value)} (${f((lf.value / tot) * 100)} %)`);
    const fs = ctx.th.sizes.label;
    if (w > fs * 3 && h > fs * 1.6) {
      const ink = readableOn(col);
      const lines = wrapText(lf.data.name, fs, w - fs * 0.8, ctx.th.font, 600, Math.max(1, Math.floor((h - fs) / (fs * 1.2)) - (ctx.opt.showValues !== false ? 1 : 0)));
      if (lines.some((l) => textWidth(l, fs, ctx.th.font, 600) > w - fs * 0.6)) return;
      lines.forEach((l, k) => text(g, box.x + lf.x0 + fs * 0.4, box.y + lf.y0 + fs * 1.15 + k * fs * 1.15, l, { size: fs, fill: ink, family: ctx.th.font, weight: 600 }));
      if (ctx.opt.showValues !== false && h > fs * (lines.length + 1.4) * 1.15) text(g, box.x + lf.x0 + fs * 0.4, box.y + lf.y0 + fs * 1.15 * (lines.length + 1), `${f((lf.value / tot) * 100)} %`, { size: fs, fill: ink, family: ctx.th.font });
    }
  });
}

// ======================= MAPA DE CALOR =======================
export function heatmap(ctx) {
  const ex = enc(ctx, 'x'), ey = enc(ctx, 'y'), ev = enc(ctx, 'size');
  if (!ex || !ey) return ctx.need('Elegí las variables de columnas y filas.');
  if (ctx.measure) return {};
  const o = ctx.opt;
  const agg = ev ? ctx.panel.agg || 'mean' : 'count';
  const xl = levelsIn(ctx, ex, ctx.rows), yl = levelsIn(ctx, ey, ctx.rows);
  const data = groupAgg(ctx.rows, [(r) => (r[ex.j] == null ? null : String(r[ex.j])), (r) => (r[ey.j] == null ? null : String(r[ey.j]))], ev ? (r) => r[ev.j] : null, agg);
  const rowTot = Object.fromEntries(yl.map((y) => [y, data.filter((d) => d.keys[1] === y).reduce((s, d) => s + (d.value || 0), 0)]));
  const grand = data.reduce((s, d) => s + (d.value || 0), 0);
  const get = (x, y) => { const d = data.find((q) => q.keys[0] === x && q.keys[1] === y); if (!d || d.value == null) return null; return o.heatPct === 'row' ? (d.value / rowTot[y]) * 100 : o.heatPct === 'total' ? (d.value / grand) * 100 : d.value; };
  const vals = xl.flatMap((x) => yl.map((y) => get(x, y))).filter((v) => v != null);
  const lo = Math.min(...vals), hi = Math.max(...vals);
  const f = makeFormat({ comma: ctx.comma, decimals: o.heatPct ? 1 : null });
  const box = withLegend(ctx, { type: 'ramp', title: o.heatPct ? '%' : ev ? ev.name : 'Casos', stops: [0, 0.25, 0.5, 0.75, 1].map((t) => ctx.seq(t)), labels: [f(lo), f((lo + hi) / 2), f(hi)] });
  const g = ctx.g;
  const fs = ctx.th.sizes.tick;
  const lw = Math.min(box.w * 0.35, Math.max(...yl.map((l) => textWidth(l, fs, ctx.th.font))) + fs);
  const xlab = Math.max(...xl.map((l) => textWidth(l, fs, ctx.th.font)));
  const cellW0 = (box.w - lw) / xl.length;
  const rot = xlab > cellW0 * 0.95;
  const top = rot ? Math.min(box.h * 0.35, xlab * 0.75) + fs : fs * 1.8;
  const inner = { x: box.x + lw, y: box.y + top, w: box.w - lw - (rot ? Math.min(xlab * 0.72, box.w * 0.15) : 0), h: box.h - top };
  const bx = d3.scaleBand().domain(xl).range([inner.x, inner.x + inner.w]), by = d3.scaleBand().domain(yl).range([inner.y, inner.y + inner.h]);
  xl.forEach((x) => {
    const cx = bx(x) + bx.bandwidth() / 2;
    if (rot) text(g, cx, inner.y - fs * 0.5, x, { size: fs, fill: ctx.c.muted, family: ctx.th.font, rotate: -45 });
    else text(g, cx, inner.y - fs * 0.6, x, { size: fs, fill: ctx.c.muted, family: ctx.th.font, anchor: 'middle' });
    yl.forEach((y) => {
      const v = get(x, y);
      const col = v == null ? ctx.c.grid : ctx.seq((v - lo) / (hi - lo || 1));
      tip(svgEl('rect', { x: bx(x) + ctx.gapW / 2, y: by(y) + ctx.gapW / 2, width: bx.bandwidth() - ctx.gapW, height: by.bandwidth() - ctx.gapW, fill: col, rx: ctx.th.barRadius * 0.6 }, g), `<b>${y} · ${x}</b><br>${v == null ? 'sin datos' : f(v)}`);
      if (o.cellValues !== false && v != null && bx.bandwidth() > textWidth(f(v), ctx.th.sizes.label, ctx.th.font) * 1.15 && by.bandwidth() > ctx.th.sizes.label * 1.3) text(g, cx, by(y) + by.bandwidth() / 2, f(v), { size: ctx.th.sizes.label, fill: readableOn(col), family: ctx.th.font, anchor: 'middle', baseline: 'central' });
    });
  });
  yl.forEach((y) => text(g, inner.x - fs * 0.5, by(y) + by.bandwidth() / 2, y, { size: fs, fill: ctx.c.muted, family: ctx.th.font, anchor: 'end', baseline: 'central' }));
}

// ======================= MATRIZ DE CORRELACIONES =======================
export function corr(ctx) {
  const vars = (ctx.panel.enc.vars || []).filter((k) => isNum(getCol(ctx.table, k)));
  if (vars.length < 2) return ctx.need('Elegí al menos dos variables numéricas.');
  if (ctx.measure) return {};
  const o = ctx.opt, m = o.corrMethod || 'pearson';
  const names = vars.map((k) => getCol(ctx.table, k).name);
  const js = vars.map((k) => ctx.table.columns.findIndex((c) => c.key === k));
  const R = vars.map((_, i) => vars.map((__, j) => {
    if (i === j) return { r: 1, p: 0 };
    const pr = ctx.rows.filter((r) => r[js[i]] != null && r[js[j]] != null);
    const x = pr.map((r) => r[js[i]]), y = pr.map((r) => r[js[j]]);
    if (pr.length < 3) return { r: null };
    const res = m === 'spearman' ? S.spearman(x, y) : m === 'kendall' ? S.kendall(x, y) : S.pearson(x, y);
    return { r: res.r ?? res.rho ?? res.tau, p: res.p };
  }));
  const ramp = getRamp(o.ramp && getRamp(o.ramp).diverging ? o.ramp : ctx.th.diverging || 'rdbu');
  const cr = (r) => { const c = rampColor(ramp, (r + 1) / 2); return ctx.gray ? c : c; };
  const box = withLegend(ctx, { type: 'ramp', title: m === 'pearson' ? 'r de Pearson' : m === 'spearman' ? 'ρ de Spearman' : 'τ de Kendall', stops: [-1, -0.5, 0, 0.5, 1].map(cr), labels: ['−1', '0', '1'] });
  const g = ctx.g;
  const fs = ctx.th.sizes.tick;
  const n = vars.length;
  const lw0 = Math.min(box.w * 0.38, Math.max(...names.map((l) => textWidth(l, fs, ctx.th.font))) + fs);
  const s0 = Math.min(box.w - lw0, box.h - fs * 1.5) / n;
  const numbered = names.some((l) => textWidth(l, fs, ctx.th.font) > s0);
  const lw = numbered ? Math.min(box.w * 0.42, Math.max(...names.map((l, i) => textWidth(`${i + 1}. ${l}`, fs, ctx.th.font))) + fs) : lw0;
  const side = Math.min(box.w - lw, box.h - fs * 1.5);
  const s = side / n;
  const x0 = box.x + lw, y0 = box.y + fs * 0.5;
  const tri = o.triangle !== false;
  for (let i = 0; i < n; i++) {
    text(g, x0 - fs * 0.5, y0 + i * s + s / 2, numbered ? `${i + 1}. ${names[i]}` : names[i], { size: fs, fill: ctx.c.muted, family: ctx.th.font, anchor: 'end', baseline: 'central' });
    for (let j = 0; j < n; j++) {
      if (tri && j > i) continue;
      const c = R[i][j];
      const x = x0 + j * s, y = y0 + i * s;
      if (i === j) { svgEl('rect', { x: x + ctx.gapW / 2, y: y + ctx.gapW / 2, width: s - ctx.gapW, height: s - ctx.gapW, fill: ctx.c.grid }, g); continue; }
      const col = c.r == null ? ctx.c.grid : cr(c.r);
      tip(svgEl('rect', { x: x + ctx.gapW / 2, y: y + ctx.gapW / 2, width: s - ctx.gapW, height: s - ctx.gapW, fill: col }, g), `<b>${names[i]} – ${names[j]}</b><br>${num1(c.r, 3)} · p = ${num1(c.p, 4)}`);
      if (o.cellValues !== false && c.r != null && s > ctx.th.sizes.label * 2.2) text(g, x + s / 2, y + s / 2, `${num1(c.r, 2)}${c.p < 0.001 ? '***' : c.p < 0.01 ? '**' : c.p < 0.05 ? '*' : ''}`, { size: Math.min(ctx.th.sizes.label, s * 0.26), fill: readableOn(col), family: ctx.th.font, anchor: 'middle', baseline: 'central' });
    }
  }
  for (let j = 0; j < n; j++) {
    const lab = names[j];
    text(g, x0 + j * s + s / 2, y0 + n * s + fs * 1.1, numbered ? `${j + 1}` : lab, { size: fs, fill: ctx.c.muted, family: ctx.th.font, anchor: 'middle' });
  }
  ctx.note('* p < ,05; ** p < ,01; *** p < ,001 (sin corregir por comparaciones múltiples). Casos completos por par.');
}

// ======================= RADAR =======================
export function radar(ctx) {
  const vars = (ctx.panel.enc.vars || []).filter((k) => isNum(getCol(ctx.table, k)));
  if (vars.length < 3) return ctx.need('Elegí al menos tres variables numéricas.');
  if (ctx.measure) return {};
  const ec = enc(ctx, 'color');
  const cl = ec ? levelsIn(ctx, ec, ctx.rows) : ['Media general'];
  const js = vars.map((k) => ctx.table.columns.findIndex((c) => c.key === k));
  const ranges = js.map((j) => { const v = ctx.rows.map((r) => r[j]).filter((q) => q != null); return [Math.min(...v), Math.max(...v)]; });
  const normz = ctx.opt.radarNorm !== false;
  const prof = cl.map((c) => ({ c, v: js.map((j, k) => { const v = ctx.rows.filter((r) => !ec || String(r[ec.j]) === c).map((r) => r[j]).filter((q) => q != null); const m = S.mean(v); return normz ? (m - ranges[k][0]) / (ranges[k][1] - ranges[k][0] || 1) : m; }) }));
  const color = colorScale(ctx, ec ? ec.key : null);
  const box = withLegend(ctx, ec ? { type: 'cat', title: ec.name, items: cl.map((c) => ({ label: c, color: color(c), shape: 'line' })) } : null);
  const g = ctx.g;
  const names = vars.map((k) => getCol(ctx.table, k).name);
  const lab = Math.max(...names.map((n) => textWidth(n, ctx.th.sizes.tick, ctx.th.font)));
  const R = Math.max(10, Math.min(box.w / 2 - lab - 6, box.h / 2 - ctx.th.sizes.tick * 2));
  const cx = box.x + box.w / 2, cy = box.y + box.h / 2;
  const n = vars.length;
  const ang = (k) => -Math.PI / 2 + (2 * Math.PI * k) / n;
  const maxV = normz ? 1 : Math.max(...prof.flatMap((p) => p.v));
  [0.25, 0.5, 0.75, 1].forEach((t) => svgEl('path', { d: d3.range(n).map((k) => `${k ? 'L' : 'M'}${cx + Math.cos(ang(k)) * R * t},${cy + Math.sin(ang(k)) * R * t}`).join('') + 'Z', fill: 'none', stroke: ctx.c.grid, 'stroke-width': ctx.hair }, g));
  names.forEach((nm, k) => {
    svgEl('line', { x1: cx, y1: cy, x2: cx + Math.cos(ang(k)) * R, y2: cy + Math.sin(ang(k)) * R, stroke: ctx.c.grid, 'stroke-width': ctx.hair }, g);
    const x = cx + Math.cos(ang(k)) * (R + 4), y = cy + Math.sin(ang(k)) * (R + 4);
    text(g, x, y, nm, { size: ctx.th.sizes.tick, fill: ctx.c.muted, family: ctx.th.font, anchor: Math.abs(Math.cos(ang(k))) < 0.2 ? 'middle' : Math.cos(ang(k)) > 0 ? 'start' : 'end', baseline: Math.sin(ang(k)) > 0.5 ? 'hanging' : Math.sin(ang(k)) < -0.5 ? 'auto' : 'central' });
  });
  prof.forEach((p) => {
    const col = ec ? color(p.c) : singleColor(ctx);
    const d = p.v.map((v, k) => `${k ? 'L' : 'M'}${cx + Math.cos(ang(k)) * R * (v / maxV)},${cy + Math.sin(ang(k)) * R * (v / maxV)}`).join('') + 'Z';
    svgEl('path', { d, fill: col, 'fill-opacity': ctx.th.areaOpacity * 0.9, stroke: col, 'stroke-width': ctx.lineW, filter: glowFilter(ctx) }, g);
  });
  if (normz) ctx.note('Cada eje va del mínimo (centro) al máximo (borde) observado de esa variable: la forma compara perfiles, no magnitudes.');
}

// ======================= CIFRAS DESTACADAS =======================
export function kpi(ctx) {
  const o = ctx.opt;
  const vars = (ctx.panel.enc.vars || []).filter((k) => isNum(getCol(ctx.table, k)));
  let items = [];
  const f = makeFormat({ comma: ctx.comma, decimals: o.valueDecimals ?? null });
  if (vars.length) {
    const agg = ctx.panel.agg || 'mean';
    items = vars.map((k) => { const j = ctx.table.columns.findIndex((c) => c.key === k); const c = getCol(ctx.table, k); const v = ctx.rows.map((r) => r[j]).filter((q) => q != null && Number.isFinite(q)); return { l: c.name, v: aggregate(v, agg === 'pct' ? 'sum' : agg), unit: c.unit }; });
  } else {
    const P = partsOf(ctx);
    if (!P) return ctx.need('Elegí una variable de categorías o varias variables numéricas.');
    items = P.parts.map((p) => ({ l: p.l, v: o.kpiShare === false ? p.v : p.v, share: p.v / P.tot }));
  }
  if (ctx.measure) return {};
  const box = ctx.box;
  const g = ctx.g;
  const n = items.length;
  const cols = Math.min(n, Math.max(1, Math.round(Math.sqrt((n * box.w) / box.h))));
  const rowsN = Math.ceil(n / cols);
  const cw = box.w / cols, ch = box.h / rowsN;
  const max = o.kpiMax ? +o.kpiMax : Math.max(...items.map((i) => i.v));
  const color = colorScale(ctx, ctx.panel.enc.x || null);
  const pal = vars.length ? (k) => ctx.colorsN(n)[k] : (k) => color(items[k].l);
  items.forEach((it, k) => {
    const cx0 = box.x + (k % cols) * cw, cy0 = box.y + Math.floor(k / cols) * ch;
    const col = pal(k);
    const pad = Math.min(cw, ch) * 0.08;
    if (ctx.th.panelBg) svgEl('rect', { x: cx0 + pad / 2, y: cy0 + pad / 2, width: cw - pad, height: ch - pad, rx: ctx.th.barRadius * 2, fill: ctx.th.panelBg }, g);
    const share = it.share != null ? it.share : max ? it.v / max : 0;
    const shape = o.kpiShape || 'ring';
    const valStr = it.share != null && o.kpiShow !== 'value' ? `${makeFormat({ comma: ctx.comma, decimals: 0 })(it.share * 100)} %` : `${f(it.v)}${it.unit ? ` ${it.unit}` : ''}`;
    const big = Math.min(ctx.th.sizes.big, ch * 0.24, cw * 0.2);
    if (shape === 'ring') {
      const lbl = ctx.th.sizes.label * 1.1;
      const labLines = wrapText(ctx.th.upperLabels ? String(it.l).toUpperCase() : it.l, lbl, cw * 0.9, ctx.th.font, 600, 2);
      const labH = labLines.length * lbl * 1.25 + lbl * 0.8;
      const R = Math.max(6, Math.min(cw * 0.3, (ch - pad - labH) / 2.5));
      const cx = cx0 + cw / 2, cy = cy0 + pad / 2 + (ch - pad - labH) / 2;
      const sw = Math.max(ctx.lineW * 2, R * 0.16);
      svgEl('circle', { cx, cy, r: R, fill: 'none', stroke: ctx.th.dark ? mixHex(ctx.c.bg, '#ffffff', 0.12) : ctx.c.grid, 'stroke-width': sw }, g);
      const a = d3.arc().innerRadius(R - sw / 2).outerRadius(R + sw / 2).startAngle(0).endAngle(2 * Math.PI * Math.max(0, Math.min(1, share))).cornerRadius(sw / 2);
      svgEl('path', { d: a(), transform: `translate(${cx},${cy})`, fill: fillFor(ctx, col, 0), filter: glowFilter(ctx) }, g);
      text(g, cx, cy, valStr, { size: Math.min(big, R * 0.62), fill: ctx.c.ink, family: ctx.th.fontTitle, anchor: 'middle', baseline: 'central', weight: 800 });
      labLines.forEach((l, q) => text(g, cx, cy + R + sw / 2 + lbl * (1.2 + q * 1.25), l, { size: lbl, fill: ctx.c.muted, family: ctx.th.font, anchor: 'middle', weight: 600 }));
    } else {
      const x = cx0 + pad * 1.2, wv = cw - pad * 2.4;
      text(g, x, cy0 + ch * 0.45, valStr, { size: big, fill: ctx.c.ink, family: ctx.th.fontTitle, weight: 800 });
      wrapText(ctx.th.upperLabels ? String(it.l).toUpperCase() : it.l, ctx.th.sizes.label * 1.1, wv, ctx.th.font, 600, 2).forEach((l, q) => text(g, x, cy0 + ch * 0.45 + ctx.th.sizes.label * (1.6 + q * 1.2), l, { size: ctx.th.sizes.label * 1.1, fill: ctx.c.muted, family: ctx.th.font, weight: 600 }));
      const by = cy0 + ch * 0.78, bh = Math.max(ctx.lineW * 2.5, ch * 0.06);
      svgEl('rect', { x, y: by, width: wv, height: bh, rx: bh / 2, fill: ctx.th.dark ? mixHex(ctx.c.bg, '#ffffff', 0.12) : ctx.c.grid }, g);
      svgEl('rect', { x, y: by, width: wv * Math.max(0, Math.min(1, share)), height: bh, rx: bh / 2, fill: fillFor(ctx, col, 0, 'h'), filter: glowFilter(ctx) }, g);
    }
  });
}

// ======================= MAPA ESTADÍSTICO =======================
export function map(ctx) {
  const eg = enc(ctx, 'geo'), ey = enc(ctx, 'y'), ed = enc(ctx, 'size'), ep = enc(ctx, 'prov');
  if (!eg) return ctx.need('Elegí la columna con los nombres de partidos, departamentos o provincias.');
  if (ctx.measure) return {};
  const o = ctx.opt;
  const level = o.geoLevel || 'dep-ba';
  const G = geoFeatures(level, ctx.project);
  if (!G) return ctx.need('Cargando la cartografía…');
  // valor por unidad (suma; con denominador, tasa)
  const agg = new Map();
  const unmatched = new Set();
  for (const r of ctx.rows) {
    const nm = r[eg.j]; if (nm == null) continue;
    const f = matchName(G, String(nm), ep ? r[ep.j] : null);
    if (!f) { unmatched.add(String(nm)); continue; }
    const a = agg.get(f.id) || { v: 0, d: 0, n: 0 };
    a.v += ey ? +r[ey.j] || 0 : 1; a.d += ed ? +r[ed.j] || 0 : 0; a.n++;
    agg.set(f.id, a);
  }
  const k = +o.rate || 0;
  const val = (a) => (!a ? null : ed && k ? (a.d ? (a.v / a.d) * k : null) : ey && ctx.panel.agg === 'mean' ? a.v / a.n : a.v);
  const values = [...agg.values()].map(val).filter((v) => v != null && Number.isFinite(v));
  if (!values.length) return ctx.need(`Ningún nombre coincidió con la cartografía (${G.label}). Revisá la columna o el nivel.`);
  const fmt = makeFormat({ comma: ctx.comma });
  const mode = o.mapMode || 'classes';
  const nC = Math.max(2, Math.min(9, +o.classes || 5));
  const brk = mode === 'classes' ? S.breaks(values, nC, o.breakMethod || 'jenks') : null;
  const lo = Math.min(...values), hi = Math.max(...values);
  const classOf = (v) => { for (let i = 1; i < brk.length; i++) if (v <= brk[i] + 1e-12) return i - 1; return brk.length - 2; };
  const nCls = brk ? brk.length - 1 : 0;
  const fillOf = (v) => (v == null ? null : mode === 'classes' ? ctx.seq(nCls > 1 ? 0.08 + (0.92 * classOf(v)) / (nCls - 1) : 0.6) : ctx.seq((v - lo) / (hi - lo || 1)));
  const valTitle = ed && k ? `${ey ? ey.name : 'Casos'} cada ${fmt(k)} ${ed.name.toLowerCase()}` : ey ? ey.name : 'Casos';
  let lg;
  if (mode === 'symbols') lg = null;
  else if (mode === 'classes') lg = { type: 'classes', title: valTitle, items: brk.slice(0, -1).map((b, i) => ({ label: `${fmt(b)} – ${fmt(brk[i + 1])}`, color: fillOf((b + brk[i + 1]) / 2) })) };
  else lg = { type: 'ramp', title: valTitle, stops: [0, 0.25, 0.5, 0.75, 1].map((t) => ctx.seq(t)), labels: [fmt(lo), fmt((lo + hi) / 2), fmt(hi)] };
  const rMax = Math.min(ctx.box.w, ctx.box.h) * 0.06;
  const rOf = (v) => Math.sqrt(Math.max(0, v) / hi) * rMax;
  if (mode === 'symbols') {
    const t = d3.scaleLinear().domain([0, hi]).nice().ticks(3).filter((v) => v > 0).slice(-3);
    lg = { type: 'size', title: valTitle, items: t.map((v) => ({ r: rOf(v), label: fmt(v) })) };
  }
  const box = withLegend(ctx, lg);
  const g = ctx.g;
  const shown = G.features;
  const proj = d3.geoTransverseMercator().rotate([-G.lon0, 0]).fitExtent([[box.x + ctx.pad, box.y + ctx.pad], [box.x + box.w - ctx.pad, box.y + box.h - ctx.pad]], { type: 'FeatureCollection', features: shown });
  const path = d3.geoPath(proj);
  const noData = ctx.th.dark ? mixHex(ctx.c.bg, '#ffffff', 0.08) : '#eeeeee';
  for (const f of shown) {
    const a = agg.get(f.id), v = val(a);
    const fill = mode === 'symbols' ? (ctx.th.dark ? mixHex(ctx.c.bg, '#ffffff', 0.06) : '#f3f3f1') : v == null ? noData : fillOf(v);
    tip(svgEl('path', { d: path(f), fill, stroke: ctx.th.dark ? ctx.c.bg : '#ffffff', 'stroke-width': ctx.hair * 1.4, 'stroke-linejoin': 'round' }, g), `<b>${f.name}</b><br>${v == null ? 'sin dato' : fmt(v)}`);
  }
  if (G.outline) svgEl('path', { d: path(G.outline), fill: 'none', stroke: ctx.c.ink, 'stroke-width': ctx.hair * 2 }, g);
  if (mode === 'symbols') {
    const col = singleColor(ctx);
    shown.map((f) => ({ f, v: val(agg.get(f.id)) })).filter((q) => q.v != null).sort((a, b) => b.v - a.v).forEach(({ f, v }) => {
      const [x, y] = path.centroid(f);
      tip(svgEl('circle', { cx: x, cy: y, r: rOf(v), fill: col, 'fill-opacity': 0.6, stroke: ctx.c.bg, 'stroke-width': ctx.hair * 1.5 }, g), `<b>${f.name}</b><br>${fmt(v)}`);
    });
  }
  if (o.mapLabels) {
    const sorted = shown.map((f) => ({ f, v: val(agg.get(f.id)) })).filter((q) => q.v != null).sort((a, b) => b.v - a.v).slice(0, +o.mapLabels || 5);
    sorted.forEach(({ f }) => { const [x, y] = path.centroid(f); const tl = text(g, x, y, titleCase(f.name), { size: ctx.th.sizes.label * 0.9, fill: ctx.c.ink, family: ctx.th.font, anchor: 'middle', baseline: 'central', weight: 600 }); tl.setAttribute('stroke', ctx.c.bg); tl.setAttribute('stroke-width', ctx.th.sizes.label * 0.28); tl.setAttribute('paint-order', 'stroke'); tl.setAttribute('stroke-linejoin', 'round'); });
  }
  if (unmatched.size) ctx.warn(`Sin coincidencia en la cartografía (${unmatched.size}): ${[...unmatched].slice(0, 8).join(', ')}${unmatched.size > 8 ? '…' : ''}.`);
  ctx.note(`${mode === 'classes' ? `${nCls} clases por ${{ jenks: 'cortes naturales (Jenks)', quantile: 'cuantiles', equal: 'intervalos iguales', sd: 'desvío estándar' }[o.breakMethod || 'jenks']}. ` : mode === 'symbols' ? 'Círculos de área proporcional al valor. ' : ''}${ed && k ? '' : ey && !ed && mode !== 'symbols' ? 'Valores absolutos en un coroplético: las unidades grandes o pobladas dominan; conviene una tasa (denominador). ' : ''}Cartografía: ${G.source}.`);
}
const titleCase = (s) => String(s).toLowerCase().replace(/(^|\s|\()(\p{L})/gu, (m, a, b) => a + b.toUpperCase()).replace(/\b(De|Del|La|Las|Los|Y|E)\b/g, (w) => w.toLowerCase());
export { norm };
