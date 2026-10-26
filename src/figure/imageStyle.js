// Estilo desde una imagen: lee un JPG, PNG o captura de pantalla de un gráfico o tablero y propone un estilo:
// fondo, tinta, rótulos secundarios, grilla (y si es horizontal o vertical), paleta por orden de importancia,
// modo oscuro, degradés y brillo, y una tipografía aproximada.
import { hexToRgb, rgbToHex, rgbToLab, deltaE } from '../util.js';
import { extractPaletteFromImage } from '../palette.js';
import { getTheme, THEMES } from '../charts/themes.js';
import { PALETTES } from '../palette.js';

const lum = ([r, g, b]) => (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
const sat = ([r, g, b]) => { const mx = Math.max(r, g, b), mn = Math.min(r, g, b); return mx === 0 ? 0 : (mx - mn) / mx; };
const q = (v) => Math.round(v / 8) * 8;
const chroma = (p) => { const l = rgbToLab(p); return Math.hypot(l[1], l[2]); };
const hueDeg = (p) => { const l = rgbToLab(p); return (Math.atan2(l[2], l[1]) * 180 / Math.PI + 360) % 360; };

async function loadImage(src) {
  return new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => rej(new Error('No se pudo leer la imagen.')); im.src = src; });
}

export async function analyzeImage(src) {
  const img = await loadImage(src);
  const sc = Math.min(1, 640 / Math.max(img.width, img.height));
  const W = Math.max(1, Math.round(img.width * sc)), H = Math.max(1, Math.round(img.height * sc));
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d', { willReadFrequently: true });
  x.drawImage(img, 0, 0, W, H);
  const d = x.getImageData(0, 0, W, H).data;
  const px = (i, j) => { const k = (j * W + i) * 4; return [d[k], d[k + 1], d[k + 2]]; };
  // L* y croma por píxel, calculados una sola vez
  const LL = new Float32Array(W * H), CC = new Float32Array(W * H);
  for (let k = 0; k < W * H; k++) { const l = rgbToLab([d[k * 4], d[k * 4 + 1], d[k * 4 + 2]]); LL[k] = l[0]; CC[k] = Math.hypot(l[1], l[2]); }
  const Lp = (i, j) => LL[j * W + i], Cp = (i, j) => CC[j * W + i];
  // fondo: color más frecuente (cuantizado) en todo el cuadro, con peso extra para los bordes
  const counts = new Map();
  const add = (p, w) => { const key = `${q(p[0])},${q(p[1])},${q(p[2])}`; counts.set(key, (counts.get(key) || 0) + w); };
  for (let j = 0; j < H; j += 2) for (let i = 0; i < W; i += 2) add(px(i, j), (i < 6 || j < 6 || i > W - 7 || j > H - 7) ? 3 : 1);
  const bgKey = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
  const bgQ = bgKey.split(',').map(Number);
  // promedio real de los píxeles cercanos al color de fondo
  let br = 0, bgc = 0, bb = 0, bn = 0;
  for (let j = 0; j < H; j += 3) for (let i = 0; i < W; i += 3) { const p = px(i, j); if (Math.abs(p[0] - bgQ[0]) < 10 && Math.abs(p[1] - bgQ[1]) < 10 && Math.abs(p[2] - bgQ[2]) < 10) { br += p[0]; bgc += p[1]; bb += p[2]; bn++; } }
  const bg = bn ? [br / bn, bgc / bn, bb / bn] : bgQ;
  const dark = lum(bg) < 0.4;
  const bgLab = rgbToLab(bg);
  // tinta y rótulos: píxeles poco saturados lejos del fondo
  const neutrals = [];
  for (let j = 0; j < H; j += 1) for (let i = 0; i < W; i += 1) {
    const p = px(i, j);
    if (sat(p) > 0.22) continue;
    const dL = Math.abs(Lp(i, j) - bgLab[0]);
    if (dL > 4) neutrals.push({ p, dL });
  }
  const strong = neutrals.filter((n) => n.dL > 45).sort((a, b) => b.dL - a.dL);
  const mid = neutrals.filter((n) => n.dL > 22 && n.dL <= 45);
  const avg = (arr) => (arr.length ? [0, 1, 2].map((k) => arr.reduce((s, n) => s + n.p[k], 0) / arr.length) : null);
  const ink = avg(strong.slice(0, Math.max(30, Math.floor(strong.length * 0.12)))) || (dark ? [240, 240, 240] : [25, 25, 25]);
  const muted = avg(mid) || ink.map((v, k) => v * 0.6 + bg[k] * 0.4);
  // grilla: filas o columnas casi completas de un tono apenas distinto del fondo
  const bgC = chroma(bg);
  const isBg = (i, j) => Math.abs(Lp(i, j) - bgLab[0]) < 2.5 && Cp(i, j) < bgC + 6;
  const faint = (i, j) => { const dL = Math.abs(Lp(i, j) - bgLab[0]); return Cp(i, j) < 14 && dL > 2.5 && dL < 26; };
  // una línea de grilla es fina: a 3 px de cada lado vuelve a estar el fondo (así no se confunde con el borde de una barra)
  let hLines = 0, vLines = 0, gridSamples = [];
  for (let j = 3; j < H - 3; j++) { let n = 0; let sx = -1; for (let i = 0; i < W; i += 2) { if (faint(i, j) && isBg(i, j - 3) && isBg(i, j + 3)) { n++; if (sx < 0 || Math.abs(i - W / 2) < Math.abs(sx - W / 2)) sx = i; } } if (n > W * 0.16) { hLines++; gridSamples.push(px(sx, j)); j += 2; } }
  for (let i = 3; i < W - 3; i++) { let n = 0; let sy = -1; for (let j = 0; j < H; j += 2) { if (faint(i, j) && isBg(i - 3, j) && isBg(i + 3, j)) { n++; if (sy < 0 || Math.abs(j - H / 2) < Math.abs(sy - H / 2)) sy = j; } } if (n > H * 0.16) { vLines++; gridSamples.push(px(i, sy)); i += 2; } }
  const grid = gridSamples.length ? avg(gridSamples.map((p) => ({ p }))) : bg.map((v) => (dark ? v + 22 : v - 22));
  // paleta y degradés
  const groups = await extractPaletteFromImage(src, { k: 10 });
  // los degradés y el antialias dejan variantes oscuras del mismo matiz: se queda la más viva de cada matiz
  const sorted = groups.slice().sort((a, b) => b.share - a.share);
  const merged = [];
  for (const g of sorted) {
    const h = hueDeg(g.rgb), c = chroma(g.rgb), L = rgbToLab(g.rgb)[0];
    const m = merged.find((x) => Math.min(Math.abs(x.h - h), 360 - Math.abs(x.h - h)) < 16);
    const vivid = c + (dark ? L * 0.6 : 0);
    if (m) { m.share += g.share; if (vivid > m.vivid) Object.assign(m, { color: g.color, vivid }); } else merged.push({ h, color: g.color, share: g.share, vivid });
  }
  const byShare = merged.sort((a, b) => b.share - a.share).map((g) => g.color);
  // degradé: el color cambia de a poco pero sostenido y siempre en el mismo sentido (no por ruido de compresión JPEG)
  let smooth = 0, flat = 0;
  const D = 21;
  for (let j = 0; j < H - D; j += 3) for (let i = 0; i < W - D; i += 3) {
    if (Cp(i, j) < 18) continue;
    for (const [di, dj] of [[0, 1], [1, 0]]) {
      const pts = [0, 7, 14, 21].map((t) => [i + di * t, j + dj * t]);
      if (pts.some(([x, y]) => Cp(x, y) < 18)) continue;
      const labs = pts.map(([x, y]) => rgbToLab(px(x, y)));
      const far = Math.hypot(labs[3][0] - labs[0][0], labs[3][1] - labs[0][1], labs[3][2] - labs[0][2]);
      if (far < 2.5) { flat++; continue; }
      if (far > 40) continue;
      const ch = [0, 1, 2].sort((p, q) => Math.abs(labs[3][q] - labs[0][q]) - Math.abs(labs[3][p] - labs[0][p]))[0];
      const sg = Math.sign(labs[3][ch] - labs[0][ch]);
      const steps = [1, 2, 3].map((t) => (labs[t][ch] - labs[t - 1][ch]) * sg);
      if (steps.every((d) => d > 0.25)) smooth++;
    }
  }
  const gradient = smooth > flat * 0.5 && smooth > 150;
  // halo: píxeles saturados de poca luminancia alrededor de colores brillantes sobre fondo oscuro
  const glow = dark && gradient;
  const sansHint = true;
  return {
    bg: rgbToHex(bg), ink: rgbToHex(ink), muted: rgbToHex(muted), grid: rgbToHex(grid), dark, palette: byShare.slice(0, 9),
    gridY: hLines >= 2, gridX: vLines >= 2 && vLines > hLines * 0.6, gradient, glow, sansHint, size: [img.width, img.height],
  };
}

export function themeFromAnalysis(a, { name = 'Estilo propio', font = 'Source Sans 3', fontTitle = null, radius = 0, base = null } = {}) {
  const b = getTheme(base || (a.dark ? 'neon' : 'tesis'));
  const id = `img-${Date.now().toString(36)}`;
  return {
    ...b, id, name, custom: true, desc: 'Estilo tomado de una imagen.',
    bg: a.bg, ink: a.ink, muted: a.muted, grid: a.grid, axis: a.muted, panelBg: null, dark: a.dark,
    gradient: !!a.gradient, glow: !!a.glow, gridY: !!a.gridY, gridX: !!a.gridX, barRadius: radius, font, fontTitle: fontTitle || font,
    palette: id, ramp: a.dark ? 'neon' : 'azules', patterns: false,
  };
}
// Registra en la sesión los estilos y paletas guardados en el proyecto
export function registerProjectStyles(project) {
  for (const st of project.styles || []) {
    if (!THEMES.some((t) => t.id === st.id)) THEMES.push(st);
    if (st.paletteColors && !PALETTES.some((p) => p.id === st.palette)) PALETTES.push({ id: st.palette, name: `De «${st.name}»`, colors: st.paletteColors });
  }
}
