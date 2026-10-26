// Lector de gráficos: a partir de un JPG, PNG o captura de pantalla reconstruye el gráfico estadístico.
// No copia la apariencia sino lo que el gráfico afirma: el tipo (rangos, barras horizontales o verticales,
// apiladas o agrupadas, líneas), el eje con su escala (lineal o logarítmica) y sus unidades, el eje o las franjas
// de arriba, los rótulos de cada fila, las notas, la leyenda y los valores medidos sobre la escala.
// Trabaja con dos lecturas: la geometría de los píxeles de color (marcas) y los textos leídos con OCR.
import { rgbToLab, rgbToHex } from '../util.js';
import { ocrWords } from './ocr.js';

const median = (a) => { if (!a.length) return 0; const s = a.slice().sort((p, q) => p - q); return s[Math.floor(s.length / 2)]; };
const mode = (a) => { const m = new Map(); for (const v of a) m.set(v, (m.get(v) || 0) + 1); let best = null, n = -1; for (const [k, c] of m) if (c > n) { best = k; n = c; } return best; };

async function loadImage(src) {
  return new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => rej(new Error('No se pudo leer la imagen.')); im.src = src; });
}

import { parseValue, UNITS } from '../data/units.js';
export { parseValue };

// ---------- escala: píxel → valor ----------
function regress(xs, ys) {
  const n = xs.length, mx = xs.reduce((a, b) => a + b, 0) / n, my = ys.reduce((a, b) => a + b, 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) { sxy += (xs[i] - mx) * (ys[i] - my); sxx += (xs[i] - mx) ** 2; syy += (ys[i] - my) ** 2; }
  const b = sxx ? sxy / sxx : 0, a = my - b * mx;
  const r2 = syy ? (sxy * sxy) / (sxx * syy) : 0;
  return { a, b, r2 };
}
export function fitScale(pts) {
  let P = pts.slice();
  const fit = (Q) => {
    const xs = Q.map((p) => p.p), lin = regress(xs, Q.map((p) => p.v));
    const canLog = Q.every((p) => p.v > 0);
    const lg = canLog ? regress(xs, Q.map((p) => Math.log10(p.v))) : null;
    // la escala logarítmica se reconoce porque valores que se multiplican quedan a igual distancia
    const useLog = lg && lg.r2 > lin.r2 + 0.003 && Math.max(...Q.map((p) => p.v)) / Math.min(...Q.map((p) => p.v)) > 20;
    return useLog ? { log: true, ...lg } : { log: false, ...lin };
  };
  let f = fit(P);
  while (P.length > 3 && f.r2 < 0.9995) {
    // descarta la etiqueta peor leída y vuelve a ajustar
    const res = P.map((p) => Math.abs((f.log ? Math.log10(p.v) : p.v) - (f.a + f.b * p.p)));
    const worst = res.indexOf(Math.max(...res));
    const Q = P.filter((_, i) => i !== worst);
    const g = fit(Q);
    if (g.r2 <= f.r2) break;
    P = Q; f = g;
  }
  const toV = (px) => (f.log ? 10 ** (f.a + f.b * px) : f.a + f.b * px);
  const toP = (v) => ((f.log ? Math.log10(v) : v) - f.a) / f.b;
  return { ...f, toV, toP, ticks: P };
}
// redondeo a lo que el ojo puede leer en el gráfico: 2 cifras significativas y, si cae cerca, la marca del eje
function niceVal(v, sc) {
  if (!Number.isFinite(v)) return null;
  for (const t of sc.ticks) {
    if (sc.log ? Math.abs(Math.log10(Math.abs(v) || 1e-12) - Math.log10(t.v)) < 0.035 : Math.abs(v - t.v) < Math.abs(sc.b) * 2.5) return +t.v.toPrecision(6);
  }
  if (sc.log) { const e = Math.floor(Math.log10(Math.abs(v))); const s = 10 ** (e - 1); return +(Math.round(v / s) * s).toPrecision(2); }
  const span = Math.abs(sc.b) * 1.2; // lo que mide un píxel
  const e = Math.ceil(Math.log10(span || 1)); const s = 10 ** e;
  return +(Math.round(v / s) * s).toFixed(Math.max(0, -e));
}

// ---------- textos: palabras → líneas → frases ----------
function groupLines(words) {
  const ws = words.slice().sort((a, b) => (a.y0 + a.y1) / 2 - (b.y0 + b.y1) / 2);
  const lines = [];
  for (const w of ws) {
    const yc = (w.y0 + w.y1) / 2, h = w.y1 - w.y0;
    const ln = lines.find((l) => Math.abs(l.yc - yc) < Math.max(3, Math.min(l.h, h) * 0.55));
    if (ln) { ln.words.push(w); ln.yc = (ln.yc * (ln.words.length - 1) + yc) / ln.words.length; ln.h = Math.max(ln.h, h); } else lines.push({ yc, h, words: [w] });
  }
  for (const l of lines) l.words.sort((a, b) => a.x0 - b.x0);
  return lines.sort((a, b) => a.yc - b.yc);
}
// una frase: palabras de una línea separadas por menos de un espacio grande
function phrases(lines, gapK = 1.1) {
  const out = [];
  for (const l of lines) {
    let cur = null;
    for (const w of l.words) {
      const h = Math.max(6, l.h);
      if (cur && w.x0 - cur.x1 <= h * gapK) { cur.words.push(w); cur.x1 = Math.max(cur.x1, w.x1); cur.y0 = Math.min(cur.y0, w.y0); cur.y1 = Math.max(cur.y1, w.y1); }
      else { if (cur) out.push(cur); cur = { words: [w], x0: w.x0, x1: w.x1, y0: w.y0, y1: w.y1, line: l }; }
    }
    if (cur) out.push(cur);
  }
  for (const p of out) { p.text = cleanText(p.words.map((w) => w.t).join(' ')); p.xc = (p.x0 + p.x1) / 2; p.yc = (p.y0 + p.y1) / 2; }
  return out;
}
function cleanText(s) {
  return s.replace(/^[-–—·•]+\s*/, '').replace(/\s*[-–—·•]+$/, '').replace(/\s+[-–—]\s+/g, ' · ').replace(/\s+[•·]\s+/g, ' · ').replace(/\.\.\./g, '…').replace(/\s+([,.;:)])/g, '$1').replace(/\(\s+/g, '(').trim();
}

// ---------- píxeles ----------
function prepare(img) {
  const maxSide = 2000;
  const sc = Math.min(1, maxSide / Math.max(img.width, img.height));
  const W = Math.round(img.width * sc), H = Math.round(img.height * sc);
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d', { willReadFrequently: true });
  x.drawImage(img, 0, 0, W, H);
  const d = x.getImageData(0, 0, W, H).data;
  const L = new Float32Array(W * H), A = new Float32Array(W * H), B = new Float32Array(W * H);
  for (let k = 0; k < W * H; k++) { const l = rgbToLab([d[k * 4], d[k * 4 + 1], d[k * 4 + 2]]); L[k] = l[0]; A[k] = l[1]; B[k] = l[2]; }
  return { canvas: c, W, H, d, L, A, B, scale: sc };
}
function background(P) {
  const { W, H, d } = P;
  const counts = new Map();
  for (let j = 0; j < H; j += 2) for (let i = 0; i < W; i += 2) { const k = (j * W + i) * 4; const key = ((d[k] >> 3) << 10) | ((d[k + 1] >> 3) << 5) | (d[k + 2] >> 3); counts.set(key, (counts.get(key) || 0) + 1); }
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
  const rgb = [((top >> 10) & 31) * 8 + 4, ((top >> 5) & 31) * 8 + 4, (top & 31) * 8 + 4];
  const lab = rgbToLab(rgb);
  return { rgb, lab, hex: rgbToHex(rgb), dark: lab[0] < 45 };
}

// Colores de las marcas: k-medias en Lab sobre píxeles con croma, fusionando tonos casi iguales
function markColors(P, bg) {
  const { W, H, L, A, B } = P;
  const pts = [];
  for (let k = 0; k < W * H; k += 3) {
    const ch = Math.hypot(A[k], B[k]);
    if (ch < 24) continue;
    if (Math.hypot(L[k] - bg.lab[0], A[k] - bg.lab[1], B[k] - bg.lab[2]) < 18) continue;
    pts.push([L[k], A[k], B[k]]);
  }
  if (pts.length < 30) return [];
  const K = Math.min(8, Math.max(2, Math.round(pts.length / 400)));
  const cs = [pts[0]];
  while (cs.length < K) { let best = null, bd = -1; for (let i = 0; i < pts.length; i += 7) { const p = pts[i]; const m = Math.min(...cs.map((c) => (p[0] - c[0]) ** 2 + (p[1] - c[1]) ** 2 + (p[2] - c[2]) ** 2)); if (m > bd) { bd = m; best = p; } } if (bd < 200) break; cs.push(best.slice()); }
  const asg = new Int32Array(pts.length);
  for (let it = 0; it < 12; it++) {
    const acc = cs.map(() => [0, 0, 0, 0]);
    for (let i = 0; i < pts.length; i++) { let b = 0, bd = Infinity; for (let j = 0; j < cs.length; j++) { const c = cs[j]; const dd = (pts[i][0] - c[0]) ** 2 + (pts[i][1] - c[1]) ** 2 + (pts[i][2] - c[2]) ** 2; if (dd < bd) { bd = dd; b = j; } } asg[i] = b; const a = acc[b]; a[0] += pts[i][0]; a[1] += pts[i][1]; a[2] += pts[i][2]; a[3]++; }
    acc.forEach((a, j) => { if (a[3]) cs[j] = [a[0] / a[3], a[1] / a[3], a[2] / a[3]]; });
  }
  const n = cs.map((_, j) => 0); for (let i = 0; i < pts.length; i++) n[asg[i]]++;
  let cl = cs.map((c, j) => ({ lab: c, n: n[j] })).filter((c) => c.n > pts.length * 0.01);
  // los bordes con antialias producen tonos intermedios: se fusionan los cercanos y gana el más poblado
  cl.sort((a, b) => b.n - a.n);
  const out = [];
  for (const c of cl) { const m = out.find((o) => Math.hypot(o.lab[0] - c.lab[0], o.lab[1] - c.lab[1], o.lab[2] - c.lab[2]) < 22); if (m) m.n += c.n; else out.push({ ...c }); }
  return out.map((c, i) => ({ ...c, id: i + 1, hex: labHex(c.lab) }));
}
function labHex([L, a, b]) {
  // Lab D65 → sRGB
  let y = (L + 16) / 116, x = a / 500 + y, z = y - b / 200;
  const f = (t) => (t ** 3 > 0.008856 ? t ** 3 : (t - 16 / 116) / 7.787);
  x = 0.95047 * f(x); y = f(y); z = 1.08883 * f(z);
  const g = (c) => { c = c > 0.0031308 ? 1.055 * c ** (1 / 2.4) - 0.055 : 12.92 * c; return Math.max(0, Math.min(255, Math.round(c * 255))); };
  return rgbToHex([g(3.2406 * x - 1.5372 * y - 0.4986 * z), g(-0.9689 * x + 1.8758 * y + 0.0415 * z), g(0.0557 * x - 0.204 * y + 1.057 * z)]);
}
function labelMap(P, bg, colors) {
  const { W, H, L, A, B } = P;
  const lab = new Uint8Array(W * H);
  for (let k = 0; k < W * H; k++) {
    if (Math.hypot(A[k], B[k]) < 18) continue;
    let b = 0, bd = 26 * 26;
    for (const c of colors) { const dd = (L[k] - c.lab[0]) ** 2 + (A[k] - c.lab[1]) ** 2 + (B[k] - c.lab[2]) ** 2; if (dd < bd) { bd = dd; b = c.id; } }
    lab[k] = b;
  }
  return lab;
}
function components(P, lab) {
  const { W, H } = P;
  const seen = new Uint8Array(W * H), comps = [];
  const stack = new Int32Array(W * H);
  for (let k = 0; k < W * H; k++) {
    if (!lab[k] || seen[k]) continue;
    const id = lab[k]; let sp = 0; stack[sp++] = k; seen[k] = 1;
    let n = 0, x0 = W, x1 = 0, y0 = H, y1 = 0;
    while (sp) {
      const q = stack[--sp]; const x = q % W, y = (q - x) / W; n++;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      if (x > 0 && !seen[q - 1] && lab[q - 1] === id) { seen[q - 1] = 1; stack[sp++] = q - 1; }
      if (x < W - 1 && !seen[q + 1] && lab[q + 1] === id) { seen[q + 1] = 1; stack[sp++] = q + 1; }
      if (y > 0 && !seen[q - W] && lab[q - W] === id) { seen[q - W] = 1; stack[sp++] = q - W; }
      if (y < H - 1 && !seen[q + W] && lab[q + W] === id) { seen[q + W] = 1; stack[sp++] = q + W; }
    }
    const w = x1 - x0 + 1, h = y1 - y0 + 1;
    if (n < 4) continue;
    comps.push({ color: id, n, x0, x1: x1 + 1, y0, y1: y1 + 1, w, h, fill: n / (w * h), xc: (x0 + x1 + 1) / 2, yc: (y0 + y1 + 1) / 2 });
  }
  return comps;
}
// líneas finas y poco saturadas de punta a punta (grilla o límites de franjas)
function guideLines(P, bg, lab, region, vertical) {
  const { W, L, A, B } = P;
  const out = [];
  const [a0, a1] = vertical ? [region.x0, region.x1] : [region.y0, region.y1];
  const [b0, b1] = vertical ? [region.y0, region.y1] : [region.x0, region.x1];
  for (let s = Math.max(1, Math.floor(a0)); s < Math.min(vertical ? P.W - 1 : P.H - 1, Math.ceil(a1)); s++) {
    let hit = 0, free = 0;
    for (let t = Math.floor(b0); t < Math.ceil(b1); t++) {
      const k = vertical ? t * W + s : s * W + t;
      if (lab[k]) continue;
      free++;
      const dL = Math.abs(L[k] - bg.lab[0]);
      if (Math.hypot(A[k], B[k]) < 16 && dL > 2.5 && dL < 70) {
        // fina: los vecinos a 2 px son fondo o marca
        const k1 = vertical ? k - 2 : k - 2 * W, k2 = vertical ? k + 2 : k + 2 * W;
        const near = (q) => lab[q] || Math.abs(L[q] - bg.lab[0]) < dL * 0.6;
        if (near(k1) || near(k2)) hit++;
      }
    }
    if (free > (b1 - b0) * 0.25 && hit > free * 0.55) {
      const last = out[out.length - 1];
      if (last && s - last.at1 <= 1) { last.at1 = s; } else out.push({ at0: s, at1: s });
    }
  }
  return out.map((l) => (l.at0 + l.at1) / 2);
}

// Imagen para el OCR: las marcas de color se pintan del color del fondo y el texto claro que hay dentro de una barra
// se pinta oscuro; así se lee «hasta el horizonte del suelo» escrito en blanco sobre azul y las barras no producen letras fantasma.
function ocrCanvas(P, bg, lab, comps, colors) {
  const { W, H, d, L } = P;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d');
  const im = x.createImageData(W, H);
  im.data.set(d);
  // luminosidad de la barra que cubre cada píxel (0 = ninguna)
  const barL = new Float32Array(W * H);
  for (const r of comps) {
    if (!(r.fill >= 0.5 && r.w >= 6 && r.h >= 6)) continue;
    const col = colors.find((q) => q.id === r.color);
    const lb = col ? col.lab[0] : 50;
    for (let j = r.y0; j < r.y1; j++) barL.fill(lb, j * W + r.x0, j * W + r.x1);
  }
  const ink = bg.dark ? 235 : 25;
  for (let k = 0; k < W * H; k++) {
    const q = k * 4;
    const lb = barL[k];
    if (lb) {
      // dentro de una barra: lo más claro que la barra es texto (o su antialias); lo demás, fondo
      const t = Math.max(0, Math.min(1, (L[k] - lb - 5) / Math.max(8, 78 - lb - 5)));
      for (let ch = 0; ch < 3; ch++) im.data[q + ch] = Math.round(bg.rgb[ch] * (1 - t) + ink * t);
      continue;
    }
    if (lab[k] || Math.hypot(P.A[k], P.B[k]) > 12) { im.data[q] = bg.rgb[0]; im.data[q + 1] = bg.rgb[1]; im.data[q + 2] = bg.rgb[2]; }
  }
  x.putImageData(im, 0, 0);
  return c;
}

// rótulos en serie (E0, E1, E2…): el OCR confunde 1 con l, 5 con S, 2 con ?; se reparan por la secuencia
function repairSeries(labels) {
  const m = labels.map((t) => String(t || '').match(/^([A-Za-zÁÉÍÓÚ]{1,3})\s?([0-9A-Za-z?!|]{1,2})$/));
  const pref = mode(m.filter(Boolean).map((x) => x[1]));
  if (!pref || m.filter((x) => x && x[1] === pref).length < Math.max(2, labels.filter(Boolean).length * 0.5)) return { labels, pref: null };
  const digit = (s) => { const t = s.replace(/[lI|!]/g, '1').replace(/[Oo]/g, '0').replace(/[Ss]/g, '5').replace(/[Zz]/g, '2'); return /^\d+$/.test(t) ? +t : null; };
  const nums = m.map((x) => (x && x[1] === pref ? digit(x[2]) : null));
  // índice esperado por posición: el primero conocido marca el arranque
  const k0 = nums.findIndex((v) => v != null);
  const start = k0 >= 0 ? nums[k0] - k0 : 0;
  const out = labels.map((t, i) => { const e = start + i; if (!String(t || '').trim()) return e >= 0 ? `${pref}${e}` : t; if (!m[i] || m[i][1] !== pref) return t; return `${pref}${nums[i] === e ? nums[i] : e}`; });
  return { labels: out, pref, start };
}

async function looseGlyphs(P, bg, lab, words) {
  const { W, H, L, A, B } = P;
  const ink = new Uint8Array(W * H);
  for (let k = 0; k < W * H; k++) if (!lab[k] && Math.abs(L[k] - bg.lab[0]) > 30 && Math.hypot(A[k], B[k]) < 25) ink[k] = 1;
  // componentes de tinta (8 vecinos)
  const seen = new Uint8Array(W * H), cs = [], st = new Int32Array(W * H);
  for (let k = 0; k < W * H; k++) {
    if (!ink[k] || seen[k]) continue;
    let sp = 0; st[sp++] = k; seen[k] = 1; let x0 = W, x1 = 0, y0 = H, y1 = 0, n = 0;
    while (sp) { const q = st[--sp]; const x = q % W, y = (q - x) / W; n++; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue; const r = yy * W + xx; if (ink[r] && !seen[r]) { seen[r] = 1; st[sp++] = r; } } }
    const h = y1 - y0 + 1, w = x1 - x0 + 1;
    if (h >= 5 && h <= 40 && w <= h * 2.5 && n >= 6) cs.push({ x0, x1: x1 + 1, y0, y1: y1 + 1, h });
  }
  // une letras vecinas de una misma línea
  cs.sort((a, b) => a.x0 - b.x0);
  const blobs = [];
  for (const c of cs) {
    const b = blobs.find((o) => Math.abs((o.y0 + o.y1) / 2 - (c.y0 + c.y1) / 2) < Math.max(o.h, c.h) * 0.5 && c.x0 - o.x1 < Math.max(o.h, c.h) * 0.45 && c.x0 >= o.x0);
    if (b) { b.x1 = Math.max(b.x1, c.x1); b.y0 = Math.min(b.y0, c.y0); b.y1 = Math.max(b.y1, c.y1); b.h = b.y1 - b.y0; } else blobs.push({ ...c });
  }
  const covered = (b) => words.some((w) => w.x0 - 3 <= b.x1 && w.x1 + 3 >= b.x0 && w.y0 - 3 <= b.y1 && w.y1 + 3 >= b.y0);
  const nearMark = (b) => { for (let j = Math.max(0, b.y0 - 3); j < Math.min(H, b.y1 + 3); j++) for (let i = Math.max(0, b.x0 - 3); i < Math.min(W, b.x1 + 3); i++) if (lab[j * W + i]) return true; return false; };
  const todo = blobs.filter((b) => !covered(b) && b.x1 - b.x0 < b.h * 6 && !nearMark(b)).slice(0, 40);
  const out = [];
  for (const b of todo) {
    const S = Math.max(2, Math.round(40 / b.h)), pad = 12;
    const bw = b.x1 - b.x0, bh = b.y1 - b.y0;
    const cc = document.createElement('canvas'); cc.width = bw * S + pad * 2; cc.height = bh * S + pad * 2;
    const cx = cc.getContext('2d'); cx.fillStyle = '#fff'; cx.fillRect(0, 0, cc.width, cc.height);
    const tmp = document.createElement('canvas'); tmp.width = bw; tmp.height = bh;
    const tx = tmp.getContext('2d'); const id = tx.createImageData(bw, bh);
    for (let j = 0; j < bh; j++) for (let i = 0; i < bw; i++) { const k = (b.y0 + j) * W + b.x0 + i; const t = Math.max(0, Math.min(1, Math.abs(L[k] - bg.lab[0]) / 60)); const v = Math.round(255 * (1 - t)); const q = (j * bw + i) * 4; id.data[q] = v; id.data[q + 1] = v; id.data[q + 2] = v; id.data[q + 3] = 255; }
    tx.putImageData(id, 0, 0); cx.imageSmoothingQuality = 'high'; cx.drawImage(tmp, pad, pad, bw * S, bh * S);
    const ws = await ocrWords(cc, S, null, bw < bh * 1.3 ? '10' : '8');
    const best = ws.filter((w) => w.c >= 70 && /^[\p{L}\p{N}][\p{L}\p{N}.,%]*$/u.test(w.t)).sort((a, c) => c.c - a.c)[0];
    if (best) out.push({ t: best.t, c: best.c, x0: b.x0, x1: b.x1, y0: b.y0, y1: b.y1 });
  }
  return out;
}

// ---------- lectura principal ----------
export async function digitizeImage(src, { onProgress = () => {} } = {}) {
  const warnings = [];
  onProgress({ step: 'Leyendo la imagen', p: 0.02 });
  const img = await loadImage(src);
  const P = prepare(img);
  const { W, H } = P;
  const bg = background(P);
  onProgress({ step: 'Buscando las marcas de color', p: 0.08 });
  const colors = markColors(P, bg);
  const lab = labelMap(P, bg, colors);
  const comps = components(P, lab);
  // OCR sobre la imagen ampliada (el texto chico de una captura necesita unos 30 px de alto)
  onProgress({ step: 'Leyendo los textos (OCR)', p: 0.15 });
  const s = Math.max(1, Math.min(3, 2400 / W));
  const big = document.createElement('canvas'); big.width = Math.round(W * s); big.height = Math.round(H * s);
  const oc = ocrCanvas(P, bg, lab, comps, colors);
  const bx = big.getContext('2d'); bx.imageSmoothingQuality = 'high'; bx.drawImage(oc, 0, 0, big.width, big.height);
  let words = await ocrWords(big, s, (m) => { if (m && m.status === 'recognizing text') onProgress({ step: 'Leyendo los textos (OCR)', p: 0.2 + 0.7 * (m.progress || 0) }); else if (m && m.status) onProgress({ step: m.status.startsWith('loading') ? 'Cargando el lector de textos' : 'Preparando el lector de textos', p: 0.15 }); });
  onProgress({ step: 'Interpretando', p: 0.93 });
  // las «palabras» que en realidad son marcas (cuadraditos de leyenda, barras) se descartan
  const rects = comps.filter((c) => c.fill >= 0.6 && c.w >= 3 && c.h >= 3 && c.n >= 30);
  const insideMark = (w) => rects.some((r) => { const ix = Math.max(0, Math.min(r.x1, w.x1) - Math.max(r.x0, w.x0)), iy = Math.max(0, Math.min(r.y1, w.y1) - Math.max(r.y0, w.y0)); const a = (w.x1 - w.x0) * (w.y1 - w.y0); return a > 0 && (ix * iy) / a > 0.6 && !/[a-záéíóúñ]{3,}/i.test(w.t); });
  words = words.filter((w) => w.c >= 40 && w.y1 - w.y0 < H * 0.12 && !insideMark(w) && (/[\p{L}\p{N}%°$]/u.test(w.t) || /^[-–—·•]$/.test(w.t)));
  // tercera lectura: grupos de letras sueltas que el OCR general no tomó (una letra, un «0» en el eje)
  onProgress({ step: 'Buscando rótulos sueltos', p: 0.88 });
  try { words.push(...(await looseGlyphs(P, bg, lab, words))); } catch (e) { /* sin tercera lectura */ }
  // segunda lectura, más fina, del texto escrito dentro de las barras
  onProgress({ step: 'Leyendo el texto dentro de las barras', p: 0.9 });
  for (const r of rects) {
    if (r.n < 200 || r.h < 8) continue;
    const col = colors.find((q) => q.id === r.color); if (!col) continue;
    const lb = col.lab[0];
    let light = 0;
    for (let j = r.y0 + 2; j < r.y1 - 2; j++) for (let i = r.x0 + 2; i < r.x1 - 2; i++) if (P.L[j * W + i] > lb + 15) light++;
    if (light < Math.max(15, r.w * r.h * 0.006)) continue;
    const S = Math.max(3, Math.round(48 / r.h));
    const cw = r.w, chh = r.h;
    const cc = document.createElement('canvas'); cc.width = cw * S + 40; cc.height = chh * S + 40;
    const cx = cc.getContext('2d'); cx.fillStyle = '#fff'; cx.fillRect(0, 0, cc.width, cc.height);
    const tmp = document.createElement('canvas'); tmp.width = cw; tmp.height = chh;
    const tx = tmp.getContext('2d'); const id = tx.createImageData(cw, chh);
    for (let j = 0; j < chh; j++) for (let i = 0; i < cw; i++) { const k = (r.y0 + j) * W + r.x0 + i; const edge = i < 2 || j < 2 || i >= cw - 2 || j >= chh - 2; const t = edge ? 0 : Math.max(0, Math.min(1, (P.L[k] - lb - 5) / Math.max(8, 75 - lb))); const v = Math.round(255 * (1 - t)); const q = (j * cw + i) * 4; id.data[q] = v; id.data[q + 1] = v; id.data[q + 2] = v; id.data[q + 3] = 255; }
    tx.putImageData(id, 0, 0);
    cx.imageSmoothingQuality = 'high'; cx.drawImage(tmp, 20, 20, cw * S, chh * S);
    try {
      const ws = await ocrWords(cc, S, null, '7');
      const inside0 = ws.filter((w) => w.c >= 45 && /[\p{L}]{2,}|\d/u.test(w.t));
      const avgC = inside0.length ? inside0.reduce((a2, w) => a2 + w.c, 0) / inside0.length : 0;
      const inside = (avgC >= 70 ? inside0 : []).map((w) => ({ ...w, x0: w.x0 - 20 / S + r.x0, x1: w.x1 - 20 / S + r.x0, y0: w.y0 - 20 / S + r.y0, y1: w.y1 - 20 / S + r.y0 }));
      if (inside.length) {
        words = words.filter((w) => !(w.x0 >= r.x0 - 2 && w.x1 <= r.x1 + 2 && w.y0 >= r.y0 - 2 && w.y1 <= r.y1 + 2));
        words.push(...inside);
      }
    } catch (e) { /* sin segunda lectura */ }
  }
  const lines = groupLines(words);
  const phr = phrases(lines);
  const res = interpret({ P, bg, colors, comps, rects, lab, phr, lines, warnings });
  res.image = { w: W, h: H, scale: P.scale };
  res.words = words; res.background = bg.hex; res.warnings = warnings;
  onProgress({ step: 'Listo', p: 1 });
  return res;
}

function interpret(C) {
  const { rects, comps } = C;
  const big = rects.filter((r) => r.n >= 60 && r.w >= 5 && r.h >= 5);
  // trazos de línea: finos o con caja grande y poco relleno (una poligonal en diagonal)
  const thin = comps.filter((c) => (Math.min(c.w, c.h) <= 4 && Math.max(c.w, c.h) >= 12) || (c.fill < 0.3 && Math.max(c.w, c.h) >= 30));
  const thinN = thin.reduce((a, c) => a + c.n, 0), barN = big.reduce((a, c) => a + c.n, 0);
  if (big.length >= 2) {
    const hs = big.map((r) => r.h), ws = big.map((r) => r.w);
    const mad = (a) => { const m = median(a); return median(a.map((v) => Math.abs(v - m))) / (m || 1); };
    const horizontal = mad(hs) < mad(ws);
    if (barN > thinN * 0.5) return horizontal ? readHorizontal(C, big) : readVertical(C, big);
  }
  if (thin.length) return readLines(C, thin);
  C.warnings.push('No se encontraron barras ni líneas de color: la tabla queda vacía para completarla a mano.');
  return emptySpec();
}
function emptySpec() { return { type: 'bar', columns: ['Categoría', 'Valor'], rows: [], enc: { x: 'Categoría', y: 'Valor' }, options: {}, overlay: {} }; }

// eje numérico: la línea de textos con más números en fila
function findAxisLine(phr, { below = null, above = null, vertical = false, near = null } = {}) {
  if (vertical) {
    // números alineados a la derecha a la izquierda del área de dibujo
    const nums = phr.map((p) => ({ p, v: parseValue(p.text) })).filter((o) => o.v && (near == null || o.p.x1 <= near + 4));
    const groups = [];
    for (const o of nums) { const g = groups.find((gg) => Math.abs(gg.x1 - o.p.x1) < Math.max(8, o.p.y1 - o.p.y0)); if (g) g.items.push(o); else groups.push({ x1: o.p.x1, items: [o] }); }
    const g = groups.filter((gg) => gg.items.length >= 2).sort((a, b) => b.items.length - a.items.length)[0];
    return g ? g.items.map((o) => ({ ph: o.p, val: o.v, pos: o.p.yc })) : null;
  }
  const byLine = new Map();
  for (const p of phr) { const v = parseValue(p.text); if (!v) continue; if (below != null && p.yc < below) continue; if (above != null && p.yc > above) continue; if (!byLine.has(p.line)) byLine.set(p.line, []); byLine.get(p.line).push({ ph: p, val: v, pos: p.xc }); }
  const cand = [...byLine.values()].filter((a) => a.length >= 2).sort((a, b) => b.length - a.length || a[0].ph.yc - b[0].ph.yc);
  return cand[0] || null;
}
function axisFrom(items, warnings, label) {
  if (!items || items.length < 2) return null;
  const units = items.map((o) => o.val.unit).filter(Boolean);
  const metric = units.length >= items.length / 2 && units.every((u) => UNITS[u] != null);
  const pts = items.map((o) => ({ p: o.pos, v: metric ? (o.val.meters ?? o.val.v) : o.val.v, label: o.ph.text }));
  const sc = fitScale(pts);
  if (sc.r2 < 0.98) warnings.push(`El eje ${label} se leyó con dudas (ajuste ${sc.r2.toFixed(3)}): revisá los valores.`);
  sc.units = metric ? 'metros' : (units[0] === '%' ? '%' : '');
  sc.items = items;
  return sc;
}
const textBetween = (phr, y0, y1, x0 = -Infinity, x1 = Infinity) => phr.filter((p) => p.yc > y0 && p.yc < y1 && p.xc > x0 && p.xc < x1);

// leyenda: cuadraditos de color con su texto a la derecha
function readLegend(C, swatches) {
  const map = {};
  for (const sw of swatches) {
    const same = C.phr.filter((p) => Math.abs(p.yc - sw.yc) < Math.max(6, sw.h) && p.x0 >= sw.x1 - 2 && p.x0 - sw.x1 < 40);
    if (!same.length) continue;
    const first = same.sort((a, b) => a.x0 - b.x0)[0];
    const nextSw = swatches.filter((o) => o !== sw && Math.abs(o.yc - sw.yc) < sw.h && o.x0 > sw.x1).sort((a, b) => a.x0 - b.x0)[0];
    const parts = C.phr.filter((p) => Math.abs(p.yc - sw.yc) < Math.max(6, sw.h) && p.x0 >= first.x0 && (!nextSw || p.x1 <= nextSw.x0 + 2)).sort((a, b) => a.x0 - b.x0);
    map[sw.color] = { text: cleanText(parts.map((p) => p.text).join(' ')), used: parts };
  }
  return map;
}

// ---------- barras horizontales y rangos ----------
function readHorizontal(C, big) {
  const { phr, colors, warnings } = C;
  const t = median(big.map((r) => r.h));
  const isBar = (r) => Math.abs(r.h - t) <= Math.max(2, t * 0.35);
  let bars = big.filter(isBar);
  // filas por altura
  const rows = [];
  for (const r of bars.sort((a, b) => a.yc - b.yc)) { const row = rows.find((o) => Math.abs(o.yc - r.yc) < t * 0.6); if (row) row.segs.push(r); else rows.push({ yc: r.yc, segs: [r] }); }
  // eje de abajo: números debajo de casi todas las filas
  const lowY = Math.max(...rows.map((r) => Math.max(...r.segs.map((s) => s.y1))));
  let axisItems = findAxisLine(phr, { below: lowY - 2 });
  // leyenda: cuadraditos más bajos que el eje
  const axisY = axisItems ? Math.max(...axisItems.map((o) => o.ph.y1)) : lowY + t;
  const swatches = C.rects.filter((r) => r.yc > axisY && r.w < t * 3 && r.h <= t * 1.5);
  const legendRows = new Set(rows.filter((r) => r.segs.every((sg) => sg.yc > axisY)));
  const dataRows = rows.filter((r) => !legendRows.has(r));
  const sc = axisFrom(axisItems, warnings, 'de abajo');
  if (!sc) warnings.push('No se leyeron los números del eje horizontal: los valores salen en píxeles; corregí el eje.');
  const toV = sc ? sc.toV : (x) => x;
  const nice = (v) => (sc ? niceVal(v, sc) : Math.round(v));
  // cadenas: tramo habitual + tramo de extensión pegado
  const chains = dataRows.map((r) => {
    const segs = r.segs.sort((a, b) => a.x0 - b.x0);
    const ch = [segs[0]];
    for (const s2 of segs.slice(1)) { const last = ch[ch.length - 1]; if (s2.x0 - last.x1 <= Math.max(3, t * 0.3)) ch.push(s2); }
    const y0 = Math.min(...ch.map((c) => c.y0)), y1 = Math.max(...ch.map((c) => c.y1));
    return { row: r, ch, x0: ch[0].x0, x1: ch[ch.length - 1].x1, y0, y1, yc: (y0 + y1) / 2 };
  });
  const colorA = mode(chains.map((c) => c.ch[0].color));
  const colorB = mode(chains.filter((c) => c.ch[1]).map((c) => c.ch[1].color));
  const plotLeft = Math.min(...chains.map((c) => c.x0));
  // continuaciones: se recorre la fila a la derecha del final buscando trazos del color de las barras
  // (una línea punteada = «difuso»; una línea llena con punta = «abierto»)
  const markLabs = [colorA, colorB].filter(Boolean).map((id) => (colors.find((q) => q.id === id) || {}).lab).filter(Boolean);
  const isMarkish = (k) => markLabs.some((m) => Math.hypot(C.P.L[k] - m[0], C.P.A[k] - m[1], C.P.B[k] - m[2]) < 42) && Math.hypot(C.P.A[k], C.P.B[k]) > 14;
  for (const c of chains) {
    const yc = Math.round(c.yc), runs = [];
    let cur = null, gap = 0;
    for (let x = c.x1 + 2; x < C.P.W; x++) {
      let hit = false;
      for (let dy = -2; dy <= 2 && !hit; dy++) { const y = yc + dy; if (y >= 0 && y < C.P.H && isMarkish(y * C.P.W + x)) hit = true; }
      if (hit) { if (cur && gap <= 1) cur.x1 = x; else { cur = { x0: x, x1: x }; runs.push(cur); } gap = 0; }
      else { gap++; if (runs.length && gap > Math.max(30, t * 2.5)) break; }
    }
    const len = runs.reduce((a2, r) => a2 + r.x1 - r.x0 + 1, 0);
    if (!runs.length || len < t * 0.8) continue;
    // ¿es otra barra de la misma fila (no una continuación)? se descarta si es tan alta como una barra
    const bigRun = runs.find((r) => r.x1 - r.x0 > t && bars.some((bb) => bb.x0 <= r.x0 + 2 && bb.x1 >= r.x1 - 2 && Math.abs(bb.yc - c.yc) < t * 0.5));
    if (bigRun) continue;
    c.shape = runs.filter((r) => r.x1 - r.x0 >= 2).length >= 4 ? 'difuso' : 'abierto';
    c.contTo = runs[runs.length - 1].x1;
  }
  // rótulos a la izquierda
  const labels = phr.filter((p) => p.x1 < plotLeft - 2);
  for (const c of chains) {
    const mine = labels.filter((p) => Math.abs(p.yc - c.yc) < t * 0.9);
    c.label = mine.sort((a, b) => a.yc - b.yc || a.x0 - b.x0).map((p) => p.text).join(' ');
    c.usedLabels = mine;
  }
  // franjas o eje de arriba
  const topY = Math.min(...chains.map((c) => c.y0));
  const legend = readLegend(C, swatches);
  const usedPh = new Set([...(axisItems || []).map((o) => o.ph), ...chains.flatMap((c) => c.usedLabels), ...Object.values(legend).flatMap((l) => l.used)]);
  const topCands = phr.filter((p) => !usedPh.has(p) && p.y1 < topY - t * 0.2 && p.x0 >= plotLeft - t);
  // la línea de arriba más cercana a las barras
  let top = null;
  if (topCands.length) { const yl = Math.max(...topCands.map((p) => p.yc)); top = topCands.filter((p) => Math.abs(p.yc - yl) < t * 0.6); }
  const axisR = sc ? Math.max(...sc.items.map((o) => o.ph.x1)) : C.P.W;
  const vlines = guideLines(C.P, C.bg, C.lab, { x0: plotLeft + 2, x1: axisR, y0: topY, y1: axisY - (axisItems ? (axisItems[0].ph.y1 - axisItems[0].ph.y0) * 1.2 : 0) }, true);
  const options = {}, overlay = { vlines, bars, chains, axis: sc ? sc.items : [], top: top || [], swatches };
  if (top && top.length) {
    top.forEach((p) => usedPh.add(p));
    const nums = top.map((p) => parseValue(p.text));
    if (nums.filter(Boolean).length >= 2 && sc) {
      // eje superior con valores propios
      options.topTicks = top.map((p) => ({ at: nice(toV(p.xc)), label: p.text }));
    } else if (vlines.length && sc) {
      const xs = vlines.slice().sort((a, b) => a - b);
      const zones = xs.map((x) => ({ at: nice(toV(x)), label: '' }));
      const slots = new Array(xs.length + 1).fill('');
      for (const p of top) { const i = xs.filter((x) => x < p.xc).length; slots[i] = slots[i] ? `${slots[i]} ${p.text}` : p.text; }
      // reparar la serie contando también las franjas sin rótulo leído
      const filled = slots.map((t, i) => ({ t, i }));
      const firstUsed = slots.findIndex(Boolean);
      const rep = repairSeries(slots.slice(firstUsed >= 0 && slots[0] === '' && xs[0] - plotLeft < t * 2 ? 1 : 0));
      if (rep.pref) {
        const off = slots.length - rep.labels.length;
        const lastUsed = slots.length - 1 - slots.slice().reverse().findIndex(Boolean);
        rep.labels.forEach((v, j) => { const i = j + off; if (/^[A-Za-zÁÉÍÓÚ]{1,3}\d+$/.test(v) && (slots[i] || i < lastUsed || i <= lastUsed)) slots[i] = slots[i] && !/^[A-Za-zÁÉÍÓÚ]{1,3}\s?[0-9A-Za-z?!|]{1,2}$/.test(slots[i]) ? slots[i] : v; });
      }
      void filled;
      options.zoneFirst = slots[0] || '';
      slots.slice(1).forEach((v, i) => { zones[i].label = v; });
      options.zones = zones;
    } else if (sc) options.topTicks = top.map((p) => ({ at: nice(toV(p.xc)), label: p.text }));
  }
  // notas: dentro, a la derecha o encima de cada barra
  const plotPh = phr.filter((p) => (p.text.match(/[\p{L}\p{N}]/gu) || []).length >= 3 && !usedPh.has(p) && p.yc > topY - t * 1.8 && p.yc < axisY - 2 && p.x1 > plotLeft);
  for (const p of plotPh) {
    let best = null, bd = Infinity;
    for (const c of chains) {
      const dy = p.yc - c.yc;
      let d = Infinity, pos = null;
      if (Math.abs(dy) < t * 0.6) { d = Math.abs(dy); pos = p.x0 >= c.x1 - 2 ? 'right' : 'inside'; }
      else if (p.yc < c.y0 && c.y0 - p.yc < t * 1.9 && p.x1 > c.x0 - t && p.x0 < Math.max(c.x1, c.contTo || 0) + t * 4) { d = c.y0 - p.yc + t * 0.3; pos = 'above'; }
      if (d < bd) { bd = d; best = { c, pos }; }
    }
    if (best) (best.c.notes = best.c.notes || []).push({ p, pos: best.pos });
  }
  for (const c of chains) if (c.notes) { c.notes.sort((a, b) => (a.pos === 'inside' ? 0 : 1) - (b.pos === 'inside' ? 0 : 1) || (Math.abs(a.p.yc - b.p.yc) < t * 0.3 ? a.p.x0 - b.p.x0 : a.p.yc - b.p.yc)); c.note = c.notes.map((n) => n.p.text).join(' · '); }
  // título del eje: la línea que sigue a los números
  if (axisItems) {
    const below = phr.filter((p) => !usedPh.has(p) && p.yc > axisY && !swatches.some((sw) => Math.abs(sw.yc - p.yc) < sw.h)).sort((a, b) => a.yc - b.yc);
    if (below.length && below[0].yc - axisY < (axisItems[0].ph.y1 - axisItems[0].ph.y0) * 3.5) { const ln = below.filter((p) => p.line === below[0].line); options.xTitle = ln.map((p) => p.text).join(' '); }
  }
  // ¿rangos o barras desde una base común?
  const starts = chains.map((c) => c.x0);
  const floating = Math.max(...starts) - Math.min(...starts) > t * 0.8 || chains.some((c) => c.shape);
  const hasB = chains.some((c) => c.ch.length > 1);
  const legA = legend[colorA] && legend[colorA].text, legB = colorB && legend[colorB] && legend[colorB].text;
  const colorHex = (id) => (colors.find((c) => c.id === id) || {}).hex;
  if (sc && sc.log) options.xLog = 'true'; else if (sc) options.xLog = 'false';
  if (sc && sc.units) options.xUnits = sc.units;
  if (sc) { const vs = sc.ticks.map((p) => p.v); options.xMin = Math.min(...vs); options.xMax = Math.max(...vs); }
  options.colorA = colorHex(colorA); if (colorB) options.colorB = colorHex(colorB);
  const groupColors = new Set(chains.map((c) => c.ch[0].color));
  if (floating) {
    const byGroup = groupColors.size > 1 && !hasB;
    const cols = ['Rótulo', 'Inicio', 'Fin', ...(hasB ? ['Extensión hasta'] : []), 'Nota', 'Final', ...(byGroup ? ['Grupo'] : [])];
    const rowsOut = chains.map((c) => {
      const a = nice(toV(c.ch[0].x0)), b = nice(toV(c.ch[0].x1)), e2 = c.ch[1] ? nice(toV(c.ch[c.ch.length - 1].x1)) : null;
      const r = [c.label || '', a, b];
      if (hasB) r.push(e2);
      r.push(c.note || '', c.shape || '');
      if (byGroup) r.push((legend[c.ch[0].color] && legend[c.ch[0].color].text) || `Grupo ${c.ch[0].color}`);
      return r;
    });
    if (legA) options.labelA = legA; if (legB) options.labelB = legB;
    if (legA || legB) options.legend = 'bottom';
    if (options.xLog === 'true' && options.xMax) options.xMax = Math.max(options.xMax, ...rowsOut.flatMap((r) => [r[2], hasB ? r[3] : null]).filter((v) => v != null));
    return { type: 'range', columns: cols, rows: rowsOut, enc: { label: 'Rótulo', start: 'Inicio', end: 'Fin', ...(hasB ? { end2: 'Extensión hasta' } : {}), note: 'Nota', shape: 'Final', ...(byGroup ? { color: 'Grupo' } : {}) }, options, overlay, kindText: `Rangos (barras flotantes${hasB ? ' con extensión' : ''})` };
  }
  // barras horizontales desde una base: simples o apiladas por color
  return barsTable(C, chains.map((c) => ({ label: c.label, segs: c.ch, note: c.note })), { horizontal: true, toV, nice, legend, colorHex, options, overlay });
}

function barsTable(C, groups, { horizontal, toV, nice, legend, colorHex, options, overlay, grouped = false }) {
  const colorIds = [...new Set(groups.flatMap((g) => g.segs.map((s) => s.color)))];
  const sName = (id) => (legend[id] && legend[id].text) || (colorIds.length > 1 ? `Serie ${colorIds.indexOf(id) + 1}` : 'Valor');
  options.orientation = horizontal ? 'h' : 'v';
  delete options.xMin; delete options.xMax; delete options.xLog; delete options.colorA; delete options.colorB;
  options.showValues = false;
  if (colorIds.length <= 1 && groups.every((g) => g.segs.length === 1)) {
    const rows = groups.map((g) => { const s = g.segs[0]; return [g.label || '', horizontal ? nice(toV(s.x1 + 0.5) - toV(s.x0)) : nice(toV(s.y0 - 0.5) - toV(s.y1))]; });
    // con eje que no arranca en cero, el valor es la punta de la barra
    if (horizontal ? Math.abs(toV(groups[0].segs[0].x0)) > Math.abs(toV(groups[0].segs[0].x1)) * 0.02 : false) rows.forEach((r, i) => { r[1] = nice(toV(groups[i].segs[0].x1)); });
    options.color = colorHex(colorIds[0]);
    return { type: 'bar', columns: ['Categoría', 'Valor'], rows, enc: { x: 'Categoría', y: 'Valor' }, options, overlay, kindText: horizontal ? 'Barras horizontales' : 'Barras (columnas)' };
  }
  const rows = [];
  for (const g of groups) for (const s of g.segs) rows.push([g.label || '', sName(s.color), horizontal ? nice(toV(s.x1 + 0.5) - toV(s.x0)) : nice(toV(s.y0 - 0.5) - toV(s.y1))]);
  const stacked = !grouped && groups.some((g) => g.segs.length > 1);
  options.stack = stacked ? 'stack' : 'group';
  options.colors = Object.fromEntries(colorIds.map((id) => [sName(id), colorHex(id)]));
  options.legend = 'bottom';
  return { type: 'bar', columns: ['Categoría', 'Serie', 'Valor'], rows, enc: { x: 'Categoría', y: 'Valor', color: 'Serie' }, options, overlay, kindText: `Barras ${horizontal ? 'horizontales ' : ''}${stacked ? 'apiladas' : 'agrupadas'}` };
}

// ---------- columnas (barras verticales) ----------
function readVertical(C, big) {
  const { phr, warnings, colors } = C;
  const w = median(big.map((r) => r.w));
  const bars = big.filter((r) => Math.abs(r.w - w) <= Math.max(2, w * 0.35));
  const cols = [];
  for (const r of bars.sort((a, b) => a.xc - b.xc)) { const c = cols.find((o) => Math.abs(o.xc - r.xc) < w * 0.5); if (c) c.segs.push(r); else cols.push({ xc: r.xc, segs: [r] }); }
  const plotLeft = Math.min(...bars.map((b) => b.x0));
  const items = findAxisLine(phr, { vertical: true, near: plotLeft });
  const sc = axisFrom(items, warnings, 'vertical');
  if (!sc) warnings.push('No se leyeron los números del eje vertical: los valores salen en píxeles; corregí el eje.');
  const toV = sc ? sc.toV : (y) => -y;
  const nice = (v) => (sc ? niceVal(v, sc) : Math.round(v));
  const base = Math.max(...bars.map((b) => b.y1));
  const swatches = C.rects.filter((r) => !bars.includes(r) && r.w < w * 1.2 && r.h < w * 1.2 && r.h <= 20);
  const legend = readLegend(C, swatches);
  // grupos: columnas muy juntas forman un grupo (barras agrupadas)
  const sorted = cols.sort((a, b) => a.xc - b.xc);
  const gaps = sorted.slice(1).map((c, i) => c.segs[0].x0 - sorted[i].segs[0].x1);
  const small = gaps.filter((g) => g < w * 0.3).length;
  const groupedMode = small > 0 && small < gaps.length;
  const groups = [];
  sorted.forEach((c, i) => { if (groupedMode && i > 0 && gaps[i - 1] < w * 0.3) groups[groups.length - 1].cols.push(c); else groups.push({ cols: [c] }); });
  const usedPh = new Set([...(items || []).map((o) => o.ph), ...Object.values(legend).flatMap((l) => l.used)]);
  const below = phr.filter((p) => !usedPh.has(p) && p.y0 >= base - 3);
  const firstLineY = below.length ? Math.min(...below.map((p) => p.yc)) : null;
  for (const g of groups) {
    const x0 = Math.min(...g.cols.map((c) => Math.min(...c.segs.map((s) => s.x0)))), x1 = Math.max(...g.cols.map((c) => Math.max(...c.segs.map((s) => s.x1))));
    const mine = below.filter((p) => p.xc > x0 - w * 0.6 && p.xc < x1 + w * 0.6 && Math.abs(p.yc - firstLineY) < 30);
    g.label = mine.sort((a, b) => a.yc - b.yc || a.x0 - b.x0).map((p) => p.text).join(' ');
    mine.forEach((p) => usedPh.add(p));
  }
  const rest = below.filter((p) => !usedPh.has(p)).sort((a, b) => a.yc - b.yc);
  const options = { yTitle: '' }, overlay = { bars, axis: sc ? sc.items : [], swatches };
  if (rest.length) options.xTitle = rest.filter((p) => p.line === rest[0].line).map((p) => p.text).join(' ');
  const colorHex = (id) => (colors.find((c) => c.id === id) || {}).hex;
  if (sc && sc.units) options.yUnits = sc.units;
  if (groupedMode) {
    const flat = groups.map((g) => ({ label: g.label, segs: g.cols.map((c) => c.segs.sort((a, b) => b.y1 - a.y1)[0]) }));
    return barsTable(C, flat, { horizontal: false, toV, nice, legend, colorHex, options, overlay, grouped: true });
  }
  return barsTable(C, groups.map((g) => ({ label: g.label, segs: g.cols[0].segs.sort((a, b) => b.y1 - a.y1) })), { horizontal: false, toV, nice, legend, colorHex, options, overlay });
}

// ---------- líneas ----------
function readLines(C, thin) {
  const { P, lab, phr, warnings, colors } = C;
  const byColor = new Map();
  for (const t of thin) byColor.set(t.color, (byColor.get(t.color) || 0) + t.n);
  const series = [...byColor.entries()].filter(([, n]) => n > 40).map(([id]) => id);
  const x0 = Math.min(...thin.map((t) => t.x0)), x1 = Math.max(...thin.map((t) => t.x1));
  const y1 = Math.max(...thin.map((t) => t.y1));
  const xItems = findAxisLine(phr, { below: y1 - 2 });
  const yItems = findAxisLine(phr, { vertical: true, near: x0 });
  const sx = axisFrom(xItems, warnings, 'horizontal'), sy = axisFrom(yItems, warnings, 'vertical');
  if (!sy) warnings.push('No se leyeron los números del eje vertical.');
  const toY = sy ? sy.toV : (y) => -y;
  const niceY = (v) => (sy ? niceVal(v, sy) : Math.round(v));
  // leyenda de líneas: un trazo corto horizontal con su texto a la derecha
  const legSw = C.comps.filter((c) => c.h <= 5 && c.w >= 10 && c.w <= 70 && c.fill > 0.5 && phr.some((p) => Math.abs(p.yc - c.yc) < 8 && p.x0 >= c.x1 - 2 && p.x0 - c.x1 < 20));
  const legend = readLegend(C, legSw);
  const inLeg = (x, y) => legSw.some((c) => x >= c.x0 - 3 && x <= c.x1 + 3 && y >= c.y0 - 4 && y <= c.y1 + 4);
  const sers = thin.filter((t) => !legSw.includes(t));
  const ext = new Map();
  for (const t of sers) { const e = ext.get(t.color) || [Infinity, -Infinity]; ext.set(t.color, [Math.min(e[0], t.x0), Math.max(e[1], t.x1)]); }
  // posiciones a muestrear: las marcas del eje horizontal y los puntos medios, o los rótulos si son categorías
  let xs;
  if (sx) {
    const vs = sx.ticks.map((t) => t.v).sort((a, b) => a - b);
    const step = vs.length > 1 ? (vs[vs.length - 1] - vs[0]) / (vs.length - 1) : 1;
    const half = Number.isInteger(step) && step % 2 === 0 ? step / 2 : step / 2;
    const lo = sx.toV(x0), hi = sx.toV(x1 - 1);
    const first = vs[0] - Math.floor((vs[0] - lo) / half) * half;
    xs = [];
    for (let v = first; v <= hi + 1e-9 && xs.length < 200; v += half) { const vv = Number.isInteger(step) ? Math.round(v) : +v.toPrecision(6); xs.push({ v: vv, px: sx.toP(vv) }); }
  } else { const below = phr.filter((p) => p.y0 > y1 - 2); const ly = below.length ? Math.min(...below.map((p) => p.yc)) : null; xs = below.filter((p) => Math.abs(p.yc - ly) < 8).map((p) => ({ v: p.text, px: p.xc })); }
  const rows = [];
  const name = (id) => (legend[id] && legend[id].text) || (series.length > 1 ? `Serie ${series.indexOf(id) + 1}` : 'Valor');
  for (const id of series) for (const x of xs) {
    const px = Math.round(x.px); if (px < 1 || px >= P.W - 1) continue;
    const e = ext.get(id); if (e && (px < e[0] - 1 || px > e[1] + 1)) continue;
    const ys = [];
    for (let dx = -1; dx <= 1; dx++) for (let y = 0; y < P.H; y++) if (lab[y * P.W + px + dx] === id && !inLeg(px + dx, y)) ys.push(y);
    if (!ys.length) continue;
    rows.push([x.v, name(id), niceY(toY(median(ys)))]);
  }
  // donde dos líneas se cruzan una tapa a la otra: el punto faltante se interpola entre sus vecinos y se avisa
  if (typeof xs[0]?.v === 'number') {
    let filled = 0;
    for (const id of series) {
      const nm = name(id);
      const mine = rows.filter((r) => r[1] === nm);
      for (let k = 1; k < xs.length - 1; k++) {
        if (mine.some((r) => r[0] === xs[k].v)) continue;
        const a = mine.filter((r) => r[0] < xs[k].v).pop(), b = mine.find((r) => r[0] > xs[k].v);
        if (!a || !b) continue;
        const v = a[2] + ((b[2] - a[2]) * (xs[k].v - a[0])) / (b[0] - a[0]);
        rows.push([xs[k].v, nm, niceY(v)]); filled++;
      }
    }
    if (filled) { rows.sort((p, q) => series.map(name).indexOf(p[1]) - series.map(name).indexOf(q[1]) || p[0] - q[0]); warnings.push(`${filled} valor${filled > 1 ? 'es' : ''} interpolado${filled > 1 ? 's' : ''} donde una línea tapa a otra: revisalos.`); }
  }
  const options = { legend: series.length > 1 ? 'auto' : 'none' };
  if (sy && sy.units) options.yUnits = sy.units;
  options.colors = Object.fromEntries(series.map((id) => [name(id), (colors.find((c) => c.id === id) || {}).hex]));
  const xName = rows.length && rows.every((r) => Number.isInteger(r[0]) && r[0] > 1500 && r[0] < 2200) ? 'Año' : 'X';
  return { type: 'line', columns: [xName, 'Serie', 'Valor'], rows, enc: { x: xName, y: 'Valor', ...(series.length > 1 ? { color: 'Serie' } : {}) }, options, overlay: { axis: [...(sx ? sx.items : []), ...(sy ? sy.items : [])] }, kindText: `Líneas (${series.length} serie${series.length > 1 ? 's' : ''})` };
}
