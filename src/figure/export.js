// Exportación: SVG vectorial con tipografías incrustadas, PNG / JPEG / TIFF / PDF a la resolución del destino,
// en color o en grises, y tabla de datos del gráfico en CSV.
import { renderFigure } from '../charts/figure.js';
import { getMedia, exportDpi } from './media.js';
import { toGray, canvasToPng, canvasToJpeg, canvasToTiff, canvasToPdf } from './raster.js';
import { slug } from '../util.js';

const fontCache = new Map();
function familiesIn(svg) {
  const fams = new Set();
  svg.querySelectorAll('[font-family]').forEach((n) => { const f = n.getAttribute('font-family').split(',')[0].replace(/['"]/g, '').trim(); if (f) fams.add(f); });
  return [...fams];
}
async function toDataUrl(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(r.status);
  const b = await r.blob();
  return new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = rej; fr.readAsDataURL(b); });
}
// Trae de Google Fonts las caras usadas (latín, latín extendido y griego para χ, η, ρ…) y las incrusta como data: URI
export async function fontFaceCSS(families) {
  const out = [];
  for (const fam of families) {
    if (fontCache.has(fam)) { out.push(fontCache.get(fam)); continue; }
    try {
      const q = fam.replace(/ /g, '+');
      const css = await (await fetch(`https://fonts.googleapis.com/css2?family=${q}:ital,wght@0,400;0,600;0,700;0,800;1,400&display=swap`)).text();
      const blocks = css.match(/@font-face\s*{[^}]+}/g) || [];
      const keep = blocks.filter((b) => /latin|greek/.test(css.slice(Math.max(0, css.indexOf(b) - 30), css.indexOf(b))) || /U\+0000-00FF|U\+0370-03FF|U\+0100-02BA/.test(b));
      let res = '';
      for (const b of keep) {
        const m = b.match(/url\(([^)]+)\)/);
        if (!m) continue;
        const data = await toDataUrl(m[1].replace(/['"]/g, ''));
        res += b.replace(m[1], data) + '\n';
      }
      fontCache.set(fam, res);
      out.push(res);
    } catch (e) { fontCache.set(fam, ''); }
  }
  return out.join('\n');
}

export async function figureSVG(fig, env, { gray = false, embed = true } = {}) {
  const r = renderFigure(fig, { ...env, gray: gray || fig.gray, screen: false });
  const svg = r.svg;
  svg.querySelectorAll('[data-tip]').forEach((n) => n.removeAttribute('data-tip'));
  if (embed) {
    const css = await fontFaceCSS(familiesIn(svg));
    if (css) { const st = document.createElementNS('http://www.w3.org/2000/svg', 'style'); st.textContent = css; svg.insertBefore(st, svg.firstChild); }
  }
  // metadatos para quien abra el archivo
  const t = document.createElementNS('http://www.w3.org/2000/svg', 'title');
  t.textContent = fig.title || fig.name || 'Figura';
  svg.insertBefore(t, svg.firstChild);
  return { svg, r };
}
export function serialize(svg) { return '<?xml version="1.0" encoding="UTF-8"?>\n' + new XMLSerializer().serializeToString(svg); }

export async function rasterize(fig, env, dpi, { gray = false } = {}) {
  const { svg, r } = await figureSVG(fig, env, { gray });
  const wIn = r.wPt / 72, hIn = r.hPt / 72;
  const W = Math.round(wIn * dpi), H = Math.round(hIn * dpi);
  if (W * H > 16384 * 16384 || W > 16384 || H > 16384) throw new Error(`La imagen sería de ${W} × ${H} px: demasiado grande para el navegador. Bajá la resolución.`);
  svg.setAttribute('width', W); svg.setAttribute('height', H);
  const url = URL.createObjectURL(new Blob([serialize(svg)], { type: 'image/svg+xml' }));
  try {
    const img = await new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => rej(new Error('No se pudo convertir la figura en imagen.')); im.src = url; });
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const x = c.getContext('2d');
    x.drawImage(img, 0, 0, W, H);
    if (gray || fig.gray) toGray(c);
    return { canvas: c, r };
  } finally { URL.revokeObjectURL(url); }
}

export const FORMATS = [
  ['svg', 'SVG vectorial (Inkscape, Illustrator, Word)'],
  ['png', 'PNG'],
  ['tiff', 'TIFF sin pérdida (revistas)'],
  ['pdf', 'PDF (imagen sin pérdida a la resolución elegida)'],
  ['jpg', 'JPEG (liviano, para correo o redes)'],
];
export async function exportFigure(fig, env, { format = 'png', dpi = null, gray = false } = {}) {
  const m = getMedia(fig.media.profileId);
  const d = dpi || exportDpi(fig);
  const base = slug(fig.name || fig.title || 'figura');
  if (format === 'svg') {
    const { svg } = await figureSVG(fig, env, { gray });
    return { blob: new Blob([serialize(svg)], { type: 'image/svg+xml' }), name: `${base}.svg` };
  }
  const { canvas, r } = await rasterize(fig, env, d, { gray });
  if (format === 'png') return { blob: await canvasToPng(canvas, d), name: `${base}.png`, px: [canvas.width, canvas.height] };
  if (format === 'jpg') return { blob: await canvasToJpeg(canvas, d), name: `${base}.jpg`, px: [canvas.width, canvas.height] };
  if (format === 'tiff') return { blob: canvasToTiff(canvas, d), name: `${base}.tif`, px: [canvas.width, canvas.height] };
  if (format === 'pdf') return { blob: await canvasToPdf(canvas, { w: (r.wPt / 72) * 25.4, h: (r.hPt / 72) * 25.4 }, fig.title || fig.name, { lossless: true }), name: `${base}.pdf`, px: [canvas.width, canvas.height] };
  throw new Error('Formato desconocido');
}
export { getMedia };
