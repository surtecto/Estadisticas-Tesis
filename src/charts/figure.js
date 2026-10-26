// Composición de la figura: hoja del destino, título y epígrafe (APA, clásico o periodístico), grilla de paneles
// con letras A, B, C…, paneles múltiples por una variable (facetas) con escalas compartidas, notas automáticas.
import { svgEl, mixHex, toGrayHex, simulateCVD, hexToRgb, rgbToHex } from '../util.js';
import { getTheme } from './themes.js';
import { getMedia, mediaScale, minLinePt } from '../figure/media.js';
import { filteredRows, levelsOf, colIndex, getCol, isNum } from '../data/table.js';
import { paletteColors, getPalette, getRamp, rampColor } from '../palette.js';
import { d3, text, textWidth, wrapText, measureLegend, drawLegend, colorScale, levelsIn } from './core.js';
import * as XY from './render-xy.js';
import * as OT from './render-other.js';
import { getType } from './types.js';
import * as MO from './render-more.js';

const PT = 72 / 25.4;
export const RENDERERS = {
  bar: XY.bar, dot: XY.dot, meanci: XY.meanci, hist: XY.hist, density: XY.density, box: XY.box, violin: XY.violin, qq: XY.qq,
  scatter: XY.scatter, line: XY.line, area: XY.area, slope: XY.slope, pyramid: XY.pyramid, coef: XY.coef, biplot: XY.biplot,
  range: MO.range, gantt: MO.range, timeline: MO.timeline, waterfall: MO.waterfall, funnel: MO.funnel, bullet: MO.bullet, sankey: MO.sankeyChart, sunburst: MO.sunburst, marimekko: MO.marimekko,
  parallel: MO.parallel, rose: MO.rose, radialbar: MO.radialbar, calendar: MO.calendar, beeswarm: MO.beeswarm, ecdf: MO.ecdf, hexbin: MO.hexbin, bump: MO.bump, gauge: MO.gauge, progress: MO.progress, table: MO.tableChart,
  pie: OT.pie, waffle: OT.waffle, treemap: OT.treemap, heatmap: OT.heatmap, corr: OT.corr, radar: OT.radar, kpi: OT.kpi, map: OT.map,
};

export function scaledTheme(fig) {
  const th0 = getTheme(fig.style);
  const m = getMedia(fig.media.profileId);
  const s = mediaScale(m) * (fig.fontScale || 1);
  const th = JSON.parse(JSON.stringify(th0));
  for (const k of Object.keys(th.sizes)) th.sizes[k] = +(th.sizes[k] * s).toFixed(2);
  if (fig.font) th.font = fig.font;
  if (fig.fontTitle) th.fontTitle = fig.fontTitle;
  th.paletteId = fig.palette || th.palette;
  th.ramp = fig.ramp || th.ramp;
  return { th, s, m };
}

export function renderFigure(fig, env) {
  const { tables, project = null, gray = false, sim = null, comma = true, screen = true } = env;
  const { th, s, m } = scaledTheme(fig);
  const W = (fig.page?.w || m.page.w) * PT, H = (fig.page?.h || m.page.h) * PT;
  const svg = svgEl('svg', { xmlns: 'http://www.w3.org/2000/svg', viewBox: `0 0 ${W.toFixed(2)} ${H.toFixed(2)}`, width: `${(W / PT).toFixed(2)}mm`, height: `${(H / PT).toFixed(2)}mm`, 'font-family': th.font });
  const defs = svgEl('defs', {}, svg);
  const c = { ink: th.ink, muted: th.muted, grid: th.grid, axis: th.axis, bg: th.bg };
  if (gray) for (const k of Object.keys(c)) c[k] = toGrayHex(c[k]);
  svgEl('rect', { x: 0, y: 0, width: W, height: H, fill: c.bg }, svg);
  const notes = [], warnings = [];
  const pad = 2.2 * PT * Math.max(1, s * 0.8);
  let y = pad;
  const innerW = W - pad * 2;
  const capMode = fig.caption?.mode || 'apa';
  const root = svgEl('g', {}, svg);
  // ---- encabezado
  const titleTxt = fig.title || '';
  if (capMode === 'apa' && fig.caption?.inside !== false) {
    text(root, pad, y + th.sizes.caption, `Figura ${fig.caption?.number || 1}`, { size: th.sizes.caption, fill: c.ink, family: th.fontTitle, weight: 700, edit: 'fig.caption.number' });
    y += th.sizes.caption * 1.5;
    if (titleTxt) { const ls = wrapText(titleTxt, th.sizes.caption, innerW, th.fontTitle, 400, 3); ls.forEach((l, i) => text(root, pad, y + th.sizes.caption + i * th.sizes.caption * 1.25, l, { size: th.sizes.caption, fill: c.ink, family: th.fontTitle, italic: true, edit: 'fig.title' })); y += ls.length * th.sizes.caption * 1.25 + th.sizes.caption * 0.7; }
  } else if (capMode === 'titulo' && titleTxt) {
    const ls = wrapText(titleTxt, th.sizes.title, innerW, th.fontTitle, th.titleWeight, 3);
    ls.forEach((l, i) => text(root, th.titleAlign === 'center' ? W / 2 : pad, y + th.sizes.title + i * th.sizes.title * 1.15, l, { size: th.sizes.title, fill: c.ink, family: th.fontTitle, weight: th.titleWeight, anchor: th.titleAlign === 'center' ? 'middle' : 'start', edit: 'fig.title' }));
    y += ls.length * th.sizes.title * 1.15 + th.sizes.title * 0.35;
    if (fig.subtitle) { const ss = wrapText(fig.subtitle, th.sizes.subtitle, innerW, th.font, 400, 3); ss.forEach((l, i) => text(root, pad, y + th.sizes.subtitle + i * th.sizes.subtitle * 1.25, l, { size: th.sizes.subtitle, fill: c.muted, family: th.font, edit: 'fig.subtitle' })); y += ss.length * th.sizes.subtitle * 1.25 + th.sizes.subtitle * 0.6; }
  }
  // ---- pie (se mide primero; se dibuja al final con las notas reunidas)
  const footSize = th.sizes.caption * 0.92;
  const footReserve = (lines) => lines * footSize * 1.25 + footSize * 0.6;
  const est = estimateFooter(fig, th, innerW, footSize, capMode);
  const footH = est ? footReserve(est) : 0;
  const area = { x: pad, y, w: innerW, h: H - y - pad - footH };
  // ---- paneles
  const panels = fig.panels || [];
  const cols = Math.max(1, Math.min(panels.reduce((a, p) => a + Math.max(1, p.span || 1), 0) || 1, fig.layout?.cols || 1));
  // ubicación en la grilla teniendo en cuenta los paneles que ocupan varias columnas
  const place = [];
  { let cc = 0, rr = 0; for (const p of panels) { const sp = Math.min(cols, Math.max(1, p.span || 1)); if (cc + sp > cols) { cc = 0; rr++; } place.push({ col: cc, row: rr, span: sp }); cc += sp; if (cc >= cols) { cc = 0; rr++; } } }
  const rowsN = Math.max(1, place.length ? Math.max(...place.map((q) => q.row)) + 1 : 1);
  const gap = (fig.layout?.gap ?? 5) * PT * Math.max(1, s * 0.7);
  const cw = (area.w - gap * (cols - 1)) / cols, ch = (area.h - gap * (rowsN - 1)) / rowsN;
  const letters = panels.length > 1 && fig.layout?.letters !== false;
  const env2 = { tables, project, gray, sim, comma, screen, th, s, m, c, defs, notes, warnings, svg };
  panels.forEach((p, i) => {
    const { col, row, span } = place[i];
    const box = { x: area.x + col * (cw + gap), y: area.y + row * (ch + gap), w: cw * span + gap * (span - 1), h: ch };
    const g = svgEl('g', { 'data-panel': p.id, 'data-box': [box.x, box.y, box.w, box.h].map((v) => v.toFixed(2)).join(',') }, root);
    let top = 0;
    if (letters || p.title) {
      const lt = letters ? String.fromCharCode(65 + i) : '';
      if (lt) text(g, box.x, box.y + th.sizes.letter, lt, { size: th.sizes.letter, fill: c.ink, family: th.fontTitle, weight: 800, edit: 'panel.title' });
      if (p.title) text(g, box.x + (lt ? textWidth(lt, th.sizes.letter, th.fontTitle, 800) + th.sizes.panel * 0.6 : 0), box.y + th.sizes.letter, p.title, { size: th.sizes.panel, fill: c.ink, family: th.fontTitle, weight: 700, edit: 'panel.title' });
      top = th.sizes.letter * 1.45;
    }
    if (th.panelBg && (p.type !== 'kpi')) svgEl('rect', { x: box.x, y: box.y + top, width: box.w, height: box.h - top, fill: gray ? toGrayHex(th.panelBg) : th.panelBg, rx: th.barRadius * 2 }, g);
    const inset = th.panelBg && p.type !== 'kpi' ? th.sizes.tick * 0.9 : 0;
    renderPanel(p, { x: box.x + inset, y: box.y + top + inset, w: box.w - inset * 2, h: box.h - top - inset * 2 }, g, env2, i);
  });
  // ---- pie: nota y fuente
  const autoNotes = fig.caption?.autoNotes !== false ? [...new Set(notes)] : [];
  const foot = footerText(fig, autoNotes, capMode);
  if (foot) {
    let fy = H - pad - footH + footSize;
    const parts = foot;
    for (const part of parts) {
      const ls = wrapText(part.text, footSize, innerW - (part.label ? textWidth(part.label + ' ', footSize, th.font, 400) : 0), th.font, 400, 6);
      ls.forEach((l, i) => {
        if (i === 0 && part.label) {
          text(root, pad, fy, part.label, { size: footSize, fill: c.ink, family: th.font, italic: part.labelItalic, weight: part.labelItalic ? 400 : 700, edit: 'caption' });
          text(root, pad + textWidth(part.label + ' ', footSize, th.font, 700), fy, l, { size: footSize, fill: c.muted, family: th.font, edit: 'caption' });
        } else text(root, pad, fy, l, { size: footSize, fill: c.muted, family: th.font, edit: 'caption' });
        fy += footSize * 1.25;
      });
    }
  }
  if (sim) applySimulation(svg, sim);
  return { svg, notes: autoNotes, warnings, wPt: W, hPt: H, th, scale: s };
}
function footerText(fig, autoNotes, capMode) {
  const cap = fig.caption || {};
  if (cap.inside === false && capMode === 'apa') return null;
  const parts = [];
  const note = [cap.note, ...(cap.autoNotes !== false ? autoNotes : [])].filter(Boolean).join(' ');
  if (capMode === 'apa') {
    const t = [note, cap.source ? `Fuente: ${cap.source}` : ''].filter(Boolean).join(' ').replace(/\s+/g, ' ');
    if (t) parts.push({ label: 'Nota.', labelItalic: true, text: t });
  } else if (capMode === 'clasico') {
    parts.push({ label: `Figura ${cap.number || 1}.`, text: `${fig.title || ''}${note ? ' ' + note : ''}${cap.source ? ` Fuente: ${cap.source}.` : ''}` });
  } else if (capMode === 'titulo' || capMode === 'ninguno') {
    if (cap.source) parts.push({ label: 'Fuente:', text: cap.source });
    if (note && capMode === 'titulo') parts.push({ label: '', text: note });
  }
  return parts.length ? parts : null;
}
function estimateFooter(fig, th, w, size, capMode) {
  // estimación previa con las notas manuales y una reserva para las automáticas
  const parts = footerText(fig, fig.caption?.autoNotes !== false ? ['x'.repeat(Math.min(260, 90 * (fig.panels || []).length))] : [], capMode);
  if (!parts) return 0;
  let n = 0;
  for (const p of parts) n += Math.min(6, wrapText((p.label || '') + ' ' + p.text, size, w, th.font, 400, 6).length);
  return n;
}

// ---------- un panel ----------
function renderPanel(panel, box, g, env, i) {
  g.setAttribute('data-box', [box.x, box.y, box.w, box.h].map((v) => v.toFixed(2)).join(','));
  const table = env.tables[panel.tableId] || null;
  const R = RENDERERS[panel.type];
  const th = env.th;
  const uid = `p${i}${Math.random().toString(36).slice(2, 6)}`;
  const opt = { legend: 'auto', ...(panel.options || {}) };
  const ctx = {
    table, panel, opt, th, c: env.c, g, defs: env.defs, uid, box, panelBox: box, project: env.project, gray: env.gray, comma: env.comma,
    hair: Math.max(0.35 * env.s, minLinePt(env.m) * 0.55), axisW: Math.max(0.5 * env.s, minLinePt(env.m) * 0.8), lineW: Math.max(th.lineW * env.s, minLinePt(env.m) * 1.4),
    pointR: th.pointR * env.s, tickLen: th.sizes.tick * 0.35, pad: th.sizes.tick * 0.5, gapW: th.surfaceGap * env.s,
    notes: env.notes, warnings: env.warnings, env,
  };
  ctx.note = (t) => { if (!env.notes.includes(t)) env.notes.push(t); };
  ctx.warn = (t) => { if (!env.warnings.includes(t)) env.warnings.push(t); };
  ctx.seq = (t) => { const c = rampColor(getRamp(opt.ramp || th.ramp), t); return env.gray ? toGrayHex(c) : c; };
  ctx.colorsN = (n) => paletteColors(getPalette(opt.palette || th.paletteId) || getPalette('okabe'), n).map((x) => (env.gray ? toGrayHex(x) : x));
  ctx.need = (msg) => {
    if (env.screen) {
      svgEl('rect', { x: box.x, y: box.y, width: box.w, height: box.h, fill: 'none', stroke: env.c.grid, 'stroke-dasharray': '4 3', 'stroke-width': 0.6 }, g);
      wrapText(msg, th.sizes.axis, box.w * 0.8, th.font, 400, 4).forEach((l, k) => text(g, box.x + box.w / 2, box.y + box.h / 2 + k * th.sizes.axis * 1.3, l, { size: th.sizes.axis, fill: env.c.muted, family: th.font, anchor: 'middle' }));
    }
    ctx.warn(msg);
    return null;
  };
  if (!table) return ctx.need('Elegí una tabla de datos para este panel.');
  if (!R) return ctx.need(`Tipo de gráfico desconocido: ${panel.type}`);
  ctx.rows = filteredRows(table, panel.filters || []);
  if (!ctx.rows.length) return ctx.need('El filtro no deja ningún caso.');
  const t = getType(panel.type);
  const fk = panel.enc && panel.enc.facet;
  if (t.facet && fk && colIndex(table, fk) >= 0) facetPanel(ctx, R, fk);
  else { try { R(ctx); } catch (e) { console.error(e); ctx.need(`No se pudo dibujar: ${e.message}`); } }
  drawAnnotations(ctx, box);
}

// Notas libres sobre el panel: posición relativa al panel (0–1), texto en uno o varios renglones y flecha opcional
function drawAnnotations(ctx, box) {
  const list = ctx.panel.annotations || [];
  if (!list.length) return;
  const th = ctx.th;
  for (const a of list) {
    const g = svgEl('g', { 'data-anno': a.id }, ctx.g);
    const x = box.x + a.x * box.w, y = box.y + a.y * box.h;
    const size = th.sizes.label * (a.size || 1.1);
    const col = a.color || ctx.c.ink;
    if (a.ax != null && a.ay != null) {
      const ax = box.x + a.ax * box.w, ay = box.y + a.ay * box.h;
      const id = `${ctx.uid}-an`;
      if (!ctx.defs.querySelector(`#${CSS.escape(id)}`)) { const m = svgEl('marker', { id, viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 5, markerHeight: 5, orient: 'auto' }, ctx.defs); svgEl('path', { d: 'M0,0L10,5L0,10z', fill: col }, m); }
      svgEl('path', { d: `M${x},${y + size * 0.3}Q${(x + ax) / 2},${Math.min(y, ay) - size}${ax},${ay}`, fill: 'none', stroke: col, 'stroke-width': ctx.lineW * 0.8, 'marker-end': `url(#${id})` }, g);
    }
    const lines = String(a.text || '').split('\n');
    lines.forEach((l, i) => text(g, x, y + i * size * 1.2, l, { size, fill: col, family: a.serif ? th.fontTitle : th.font, weight: a.bold ? 700 : 400, italic: !!a.italic, anchor: a.anchor || 'start' }));
    if (ctx.env && ctx.env.screen) svgEl('rect', { x: x - 2, y: y - size, width: Math.max(...lines.map((l) => textWidth(l, size, th.font))) + 4, height: lines.length * size * 1.2 + 2, fill: 'transparent', class: 'anno-hit' }, g);
  }
}

function unionDom(doms, k) {
  const v = doms.map((d) => d && d[k]).filter(Boolean);
  if (!v.length) return null;
  if (typeof v[0][0] === 'number') return [Math.min(...v.map((d) => d[0])), Math.max(...v.map((d) => d[1]))];
  return null;
}
function facetPanel(ctx, R, fk) {
  const fe = { key: fk, j: colIndex(ctx.table, fk), col: getCol(ctx.table, fk) };
  const levels = levelsIn(ctx, fe, ctx.rows);
  const sub = levels.map((l) => ctx.rows.filter((r) => String(r[fe.j]) === l));
  const doms = sub.map((rows) => { try { return R({ ...ctx, rows, measure: true, allValues: null }) || {}; } catch (e) { return {}; } });
  const fixed = {};
  if (ctx.opt.facetScales !== 'free') { fixed.y = unionDom(doms, 'y'); fixed.x = unionDom(doms, 'x'); }
  const xl = [...new Set(doms.flatMap((d) => d.xLevels || []))];
  if (xl.length) { const all = levelsOf(ctx.table, ctx.panel.enc.x); fixed.xLevels = all.filter((l) => xl.includes(l)); }
  // leyenda común
  const ce = ctx.panel.enc.color ? { key: ctx.panel.enc.color, j: colIndex(ctx.table, ctx.panel.enc.color), col: getCol(ctx.table, ctx.panel.enc.color) } : null;
  let box = ctx.box;
  if (ce && ce.j >= 0 && !isNum(ce.col)) {
    const cl = levelsIn(ctx, ce, ctx.rows);
    const color = colorScale(ctx, ce.key);
    const shape = ['line', 'area'].includes(ctx.panel.type) ? 'line' : ['scatter', 'dot', 'meanci', 'qq'].includes(ctx.panel.type) ? 'circle' : 'square';
    box = XY.withLegend(ctx, cl.length > 1 ? { type: 'cat', title: ce.col.name, items: cl.map((l) => ({ label: l, color: color(l), shape })) } : null);
  }
  const n = levels.length;
  const cols = ctx.opt.facetCols || Math.max(1, Math.min(n, Math.round(Math.sqrt((n * box.w) / box.h))));
  const rowsN = Math.ceil(n / cols);
  const gap = ctx.th.sizes.tick * 1.2;
  const strip = ctx.th.sizes.panel * 1.5;
  const fw = (box.w - gap * (cols - 1)) / cols, fh = (box.h - gap * (rowsN - 1)) / rowsN;
  levels.forEach((l, k) => {
    const cx = k % cols, cy = Math.floor(k / cols);
    const fb = { x: box.x + cx * (fw + gap), y: box.y + cy * (fh + gap), w: fw, h: fh };
    const g = svgEl('g', {}, ctx.g);
    text(g, fb.x, fb.y + ctx.th.sizes.panel, l, { size: ctx.th.sizes.panel * 0.92, fill: ctx.c.ink, family: ctx.th.font, weight: 700 });
    const inner = { x: fb.x, y: fb.y + strip, w: fb.w, h: fb.h - strip };
    const c2 = { ...ctx, g, box: inner, panelBox: inner, rows: sub[k], fixed, legendHandled: true, noYTitle: cx > 0 && ctx.opt.facetScales !== 'free', noXTitle: cy < rowsN - 1 && k + cols < n, uid: `${ctx.uid}f${k}` };
    try { R(c2); } catch (e) { console.error(e); c2.need(`No se pudo dibujar «${l}»: ${e.message}`); }
  });
}

// ---------- simulación de visión ----------
export function applySimulation(svg, sim) {
  const conv = (hex) => {
    if (!/^#([0-9a-f]{6}|[0-9a-f]{3})$/i.test(hex)) return hex;
    if (sim === 'gray') return toGrayHex(hex);
    if (sim === 'proyector') return mixHex(hex, '#ffffff', 0.28);
    return rgbToHex(simulateCVD(hexToRgb(hex), sim));
  };
  svg.querySelectorAll('[fill],[stroke],stop').forEach((n) => {
    for (const a of ['fill', 'stroke', 'stop-color']) { const v = n.getAttribute(a); if (v && v.startsWith('#')) n.setAttribute(a, conv(v)); }
  });
}
