// Utilidades generales de Estadísticas-Tesis (derivadas de Mapas-Tesis)
export const PT_MM = 25.4 / 72; // 1 punto tipográfico en mm
export const CSS_PX_PER_MM = 96 / 25.4;

let _uid = 0;
export function uid(prefix = 'id') {
  _uid += 1;
  return `${prefix}${Date.now().toString(36)}${_uid.toString(36)}`;
}

export function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

export function debounce(fn, ms = 200) {
  let t = null;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

export function rafThrottle(fn) {
  let queued = false;
  return () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => { queued = false; fn(); });
  };
}

export function deepClone(o) { return JSON.parse(JSON.stringify(o)); }

export function getPath(obj, path) {
  return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
}
export function setPath(obj, path, value) {
  const keys = path.split('.');
  let o = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    if (o[keys[i]] == null || typeof o[keys[i]] !== 'object') o[keys[i]] = {};
    o = o[keys[i]];
  }
  o[keys[keys.length - 1]] = value;
}

// ---------- DOM ----------
export function el(tag, attrs = {}, ...children) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(e.style, v);
    else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2), v);
    else if (k === 'html') e.innerHTML = v;
    else if (k === 'dataset') Object.assign(e.dataset, v);
    else if (v === true) e.setAttribute(k, '');
    else e.setAttribute(k, v);
  }
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false) continue;
    e.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c);
  }
  return e;
}

export function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); return node; }

// ---------- Números ----------
const nf = new Intl.NumberFormat('es-AR');
export function fmtInt(n) { return nf.format(Math.round(n)); }
export function fmtNum(n, d = 2) {
  return new Intl.NumberFormat('es-AR', { maximumFractionDigits: d, minimumFractionDigits: 0 }).format(n);
}

// Redondea un denominador de escala a 3 cifras significativas
export function roundScale(n) {
  if (!isFinite(n) || n <= 0) return n;
  const p = Math.pow(10, Math.floor(Math.log10(n)) - 2);
  return Math.round(n / p) * p;
}

export function niceLength(maxMeters) {
  if (!(maxMeters > 0)) return 0;
  const p = Math.pow(10, Math.floor(Math.log10(maxMeters)));
  const steps = [1, 2, 2.5, 5, 10];
  let best = p;
  for (const s of steps) if (s * p <= maxMeters) best = s * p;
  return best;
}

// ---------- Coordenadas ----------
export function formatDMS(value, isLat, opts = {}) {
  const { seconds = true, decimals = 0 } = opts;
  const hemi = isLat ? (value < 0 ? 'S' : 'N') : (value < 0 ? 'O' : 'E');
  let v = Math.abs(value);
  let d = Math.floor(v);
  let mFloat = (v - d) * 60;
  let m = Math.floor(mFloat);
  let s = (mFloat - m) * 60;
  if (!seconds) {
    m = Math.round(mFloat);
    if (m === 60) { d += 1; m = 0; }
    return `${d}°${String(m).padStart(2, '0')}′${hemi}`;
  }
  s = Number(s.toFixed(decimals));
  if (s >= 60) { s = 0; m += 1; }
  if (m >= 60) { m = 0; d += 1; }
  return `${d}°${String(m).padStart(2, '0')}′${s.toFixed(decimals).padStart(decimals ? 3 + decimals : 2, '0')}″${hemi}`;
}

// Formato corto para rótulos de grilla: 62°30′O, 60°S
export function formatGridLabel(value, isLat) {
  const hemi = isLat ? (value < 0 ? 'S' : value > 0 ? 'N' : '') : (value < 0 ? 'O' : value > 0 ? 'E' : '');
  let v = Math.abs(value);
  if (!isLat && Math.abs(v - 180) < 1e-9) return '180°';
  let d = Math.floor(v + 1e-9);
  let m = Math.round((v - d) * 60);
  if (m === 60) { d += 1; m = 0; }
  return m ? `${d}°${String(m).padStart(2, '0')}′${hemi}` : `${d}°${hemi}`;
}

// Interpreta coordenadas: "-64.47, -57.2", "64°28'S 57°12'W", "64 28 30 S, 57 12 O"
export function parseCoordPair(text) {
  if (!text) return null;
  const t = text.trim();
  // Decimal simple: "lat, lon" | "lat; lon" | "lat lon" (admite coma decimal si se separa con ';' o espacio)
  let pair = null;
  if (t.includes(';')) pair = t.split(';');
  else if (/^\s*-?\d+(?:\.\d+)?\s*,\s*-?\d+(?:\.\d+)?\s*$/.test(t)) pair = t.split(',');
  else if (/^\s*-?\d+(?:[.,]\d+)?\s+-?\d+(?:[.,]\d+)?\s*$/.test(t)) pair = t.split(/\s+/);
  if (pair && pair.length === 2 && pair.every((p) => /^\s*-?\d+(?:[.,]\d+)?\s*$/.test(p))) {
    const a = parseFloat(pair[0].trim().replace(',', '.'));
    const b = parseFloat(pair[1].trim().replace(',', '.'));
    // Se asume lat, lon (si el primero excede 90 se invierte)
    if (Math.abs(a) <= 90) return { lat: a, lon: b };
    return { lat: b, lon: a };
  }
  const parts = t.toUpperCase().split(/(?<=[NSEOW])\s*,?\s*/).filter(Boolean);
  if (parts.length >= 2) {
    const v = parts.map(parseDMS).filter((x) => x);
    if (v.length >= 2) {
      const lat = v.find((x) => x.axis === 'lat');
      const lon = v.find((x) => x.axis === 'lon');
      if (lat && lon) return { lat: lat.value, lon: lon.value };
    }
  }
  return null;
}

export function parseDMS(s) {
  if (!s) return null;
  const str = String(s).toUpperCase().trim();
  const hemi = (str.match(/[NSEOW]/) || [])[0];
  const nums = (str.match(/-?\d+(?:[.,]\d+)?/g) || []).map((n) => parseFloat(n.replace(',', '.')));
  if (!nums.length) return null;
  let v = Math.abs(nums[0]) + (nums[1] || 0) / 60 + (nums[2] || 0) / 3600;
  const neg = nums[0] < 0 || hemi === 'S' || hemi === 'O' || hemi === 'W';
  if (neg) v = -v;
  const axis = hemi === 'N' || hemi === 'S' ? 'lat' : hemi ? 'lon' : null;
  return { value: v, axis };
}

export function parseCoordValue(s) {
  if (typeof s === 'number') return s;
  if (s == null) return NaN;
  const str = String(s).trim();
  if (/^-?\d+(?:[.,]\d+)?$/.test(str)) return parseFloat(str.replace(',', '.'));
  const r = parseDMS(str);
  return r ? r.value : NaN;
}

// ---------- Color ----------
export function hexToRgb(hex) {
  let h = String(hex || '#000').replace('#', '').trim();
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h.slice(0, 6), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
export function rgbToHex([r, g, b]) {
  return '#' + [r, g, b].map((v) => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')).join('');
}
export function rgba(hex, a = 1) {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${a})`;
}
function srgbToLin(c) { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
function linToSrgb(c) { const v = c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055; return clamp(v * 255, 0, 255); }
export function rgbToLab([r, g, b]) {
  const R = srgbToLin(r), G = srgbToLin(g), B = srgbToLin(b);
  let x = (R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047;
  let y = (R * 0.2126 + G * 0.7152 + B * 0.0722);
  let z = (R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883;
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  x = f(x); y = f(y); z = f(z);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}
export function deltaE(a, b) {
  const A = rgbToLab(a), B = rgbToLab(b);
  return Math.hypot(A[0] - B[0], A[1] - B[1], A[2] - B[2]);
}
// Simulación de daltonismo (Machado, Oliveira y Fernandes 2009, severidad 1.0)
const CVD = {
  protan: [[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]],
  deutan: [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.011820, 0.042940, 0.968881]],
  tritan: [[1.255528, -0.076749, -0.178779], [-0.078411, 0.930809, 0.147602], [0.004733, 0.691367, 0.303900]],
};
export function simulateCVD(rgb, type) {
  const m = CVD[type];
  if (!m) return rgb;
  const l = rgb.map(srgbToLin);
  return m.map((row) => linToSrgb(row[0] * l[0] + row[1] * l[1] + row[2] * l[2]));
}
export function relLuminance(hex) {
  const [r, g, b] = hexToRgb(hex).map(srgbToLin);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export function contrastRatio(a, b) {
  const la = relLuminance(a), lb = relLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = el('a', { href: url, download: filename });
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 4000);
}

export function readFileAs(file, how = 'text') {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    if (how === 'text') r.readAsText(file);
    else if (how === 'dataurl') r.readAsDataURL(file);
    else r.readAsArrayBuffer(file);
  });
}

export function safeStorage() {
  try {
    const k = '__et_test__';
    window.localStorage.setItem(k, '1');
    window.localStorage.removeItem(k);
    return window.localStorage;
  } catch (e) {
    return null;
  }
}

// Envolvente convexa (monotone chain); puntos [x,y]
export function convexHull(points) {
  const pts = points.map((p, i) => [p[0], p[1], i]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (pts.length < 3) return pts;
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  upper.pop(); lower.pop();
  return lower.concat(upper);
}

export function pointInPolygon(pt, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0], yi = poly[i][1], xj = poly[j][0], yj = poly[j][1];
    if ((yi > pt[1]) !== (yj > pt[1]) && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi + 1e-12) + xi) inside = !inside;
  }
  return inside;
}

// Intersección de un segmento con el borde de un polígono: devuelve t (0..1) más cercano a 'fromStart'
export function segmentPolygonT(a, b, poly) {
  const ts = [];
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const p = poly[j], q = poly[i];
    const r = [b[0] - a[0], b[1] - a[1]], s = [q[0] - p[0], q[1] - p[1]];
    const den = r[0] * s[1] - r[1] * s[0];
    if (Math.abs(den) < 1e-12) continue;
    const t = ((p[0] - a[0]) * s[1] - (p[1] - a[1]) * s[0]) / den;
    const u = ((p[0] - a[0]) * r[1] - (p[1] - a[1]) * r[0]) / den;
    if (t >= 0 && t <= 1 && u >= 0 && u <= 1) ts.push(t);
  }
  return ts;
}

export function polygonCentroid(poly) {
  let x = 0, y = 0;
  for (const p of poly) { x += p[0]; y += p[1]; }
  return [x / poly.length, y / poly.length];
}

export function escapeXml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function fmtFix(n, d = 2) {
  if (n == null || !Number.isFinite(n)) return '—';
  return new Intl.NumberFormat('es-AR', { maximumFractionDigits: d, minimumFractionDigits: d }).format(n);
}
// número compacto para rótulos de ejes: 1,2 mil · 3,4 M
export function fmtCompact(n, d = 1) {
  if (n == null || !Number.isFinite(n)) return '';
  const a = Math.abs(n);
  if (a >= 1e9) return fmtNum(n / 1e9, d) + ' mil M';
  if (a >= 1e6) return fmtNum(n / 1e6, d) + ' M';
  if (a >= 1e4) return fmtNum(n / 1e3, d) + ' mil';
  return fmtNum(n, a < 1 ? 3 : a < 10 ? 2 : a < 100 ? 1 : 0);
}
export const norm = (s) => String(s == null ? '' : s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/\s+/g, ' ').trim();
export const slug = (t) => String(t || 'archivo').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\w]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase().slice(0, 50) || 'archivo';
export function relTime(iso) {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return '';
  const s = (Date.now() - d.getTime()) / 1000;
  if (s < 60) return 'recién';
  if (s < 3600) return `hace ${Math.round(s / 60)} min`;
  if (s < 86400) return `hace ${Math.round(s / 3600)} h`;
  if (s < 86400 * 7) { const n = Math.round(s / 86400); return `hace ${n} ${n === 1 ? 'día' : 'días'}`; }
  return d.toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric' });
}
export function svgEl(tag, attrs = {}, parent = null) {
  const e = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [k, v] of Object.entries(attrs)) if (v != null && v !== false) e.setAttribute(k, v);
  if (parent) parent.appendChild(e);
  return e;
}
export function mixHex(a, b, t) {
  const A = hexToRgb(a), B = hexToRgb(b);
  return rgbToHex(A.map((v, i) => v + (B[i] - v) * t));
}
export function toGrayHex(hex) {
  const [r, g, b] = hexToRgb(hex);
  const L = rgbToLab([r, g, b])[0] / 100;
  // L* → sRGB gris con la misma luminosidad percibida
  const Y = L > 0.08 ? Math.pow((L * 100 + 16) / 116, 3) : (L * 100) / 903.3;
  const v = Y <= 0.0031308 ? 12.92 * Y : 1.055 * Math.pow(Y, 1 / 2.4) - 0.055;
  return rgbToHex([v * 255, v * 255, v * 255]);
}
