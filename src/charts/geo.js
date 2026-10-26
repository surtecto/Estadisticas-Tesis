// Cartografía para mapas estadísticos: provincias y departamentos (partidos) de la Argentina, a partir de la base
// SIG 250 del Instituto Geográfico Nacional (versión simplificada para gráficos, vía mgaitan/departamentos_argentina),
// o una cartografía propia en GeoJSON. Unión por nombre, tolerante a abreviaturas y acentos.
import { feature } from 'topojson-client';
import topo from '../../data/argentina.topo.json';
import { norm } from '../util.js';

const ABBR = [[/\bGRAL\.?\s*/g, 'GENERAL '], [/\bCNEL\.?\s*/g, 'CORONEL '], [/\bTTE\.?\s*/g, 'TENIENTE '], [/\bPTE\.?\s*/g, 'PRESIDENTE '], [/\bDR\.?\s*/g, 'DOCTOR '], [/\bALTE\.?\s*/g, 'ALMIRANTE '], [/\bCAP\.?\s*/g, 'CAPITAN '], [/\bSTA\.?\s*/g, 'SANTA '], [/\bSTO\.?\s*/g, 'SANTO '], [/\bS\.\s*/g, 'SAN '], [/\bPDO\.?\s*/g, '']];
const PROV_ALIAS = {
  'CABA': 'CIUDAD AUTONOMA DE BUENOS AIRES', 'CAPITAL FEDERAL': 'CIUDAD AUTONOMA DE BUENOS AIRES', 'CIUDAD DE BUENOS AIRES': 'CIUDAD AUTONOMA DE BUENOS AIRES', 'C.A.B.A.': 'CIUDAD AUTONOMA DE BUENOS AIRES',
  'TIERRA DEL FUEGO, ANTARTIDA E ISLAS DEL ATLANTICO SUR': 'TIERRA DEL FUEGO', 'TIERRA DEL FUEGO ANTARTIDA E ISLAS DEL ATLANTICO SUR': 'TIERRA DEL FUEGO', 'SGO. DEL ESTERO': 'SANTIAGO DEL ESTERO', 'STGO DEL ESTERO': 'SANTIAGO DEL ESTERO', 'PROVINCIA DE BUENOS AIRES': 'BUENOS AIRES', 'PBA': 'BUENOS AIRES',
};
export function geoKey(s) {
  let t = norm(s).replace(/^(PARTIDO|DEPARTAMENTO|DPTO\.?|MUNICIPIO|PROVINCIA)\s+(DE\s+|DEL\s+)?/, '');
  for (const [re, rep] of ABBR) t = t.replace(re, rep);
  t = PROV_ALIAS[t] || t;
  return t.replace(/[.,'"´`]/g, '').replace(/\s+/g, ' ').trim();
}
function lev(a, b) {
  if (Math.abs(a.length - b.length) > 3) return 9;
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}

let base = null;
function loadBase() {
  if (base) return base;
  const deps = feature(topo, topo.objects.departamentos).features.map((f, i) => ({ ...f, id: `d${i}`, name: f.properties.d, prov: f.properties.p }));
  const provs = feature(topo, topo.objects.provincias).features.map((f, i) => ({ ...f, id: `p${i}`, name: f.properties.p, prov: f.properties.p }));
  base = { deps, provs };
  return base;
}
export const PROVINCES = () => loadBase().provs.map((p) => p.name).sort();
const cache = new Map();
export function geoFeatures(level, project = null) {
  const ck = level + (level === 'custom' && project && project.geo ? project.geo.updated : '');
  if (cache.has(ck)) return cache.get(ck);
  let out;
  if (level === 'custom') {
    const gj = project && project.geo;
    if (!gj || !gj.fc) return null;
    const feats = gj.fc.features.map((f, i) => ({ ...f, id: `c${i}`, name: String((f.properties || {})[gj.nameField] ?? `Unidad ${i + 1}`), prov: null }));
    const lon = feats.length ? avgLon(feats) : -60;
    out = { features: feats, label: gj.name || 'cartografía propia', source: gj.source || 'cartografía propia', lon0: lon };
  } else {
    const b = loadBase();
    if (level === 'prov') out = { features: b.provs.filter((p) => !/TIERRA DEL FUEGO/.test(p.name) || true), label: 'provincias', source: 'IGN, SIG 250 (simplificado)', lon0: -64 };
    else if (level === 'dep') out = { features: b.deps, label: 'departamentos de la Argentina', source: 'IGN, SIG 250 (simplificado)', lon0: -64 };
    else {
      const pv = level === 'dep-ba' ? 'BUENOS AIRES' : level.replace(/^dep-/, '');
      const feats = b.deps.filter((d) => d.prov === pv);
      out = { features: feats, label: pv === 'BUENOS AIRES' ? 'partidos de la provincia de Buenos Aires' : `departamentos de ${pv}`, source: 'IGN, SIG 250 (simplificado; 134 partidos, sin Lezama)', lon0: avgLon(feats) };
    }
  }
  out.index = new Map();
  for (const f of out.features) { const k = geoKey(f.name); const arr = out.index.get(k) || []; arr.push(f); out.index.set(k, arr); }
  cache.set(ck, out);
  return out;
}
function avgLon(feats) {
  let s = 0, n = 0;
  for (const f of feats) { const c = firstCoord(f.geometry); if (c) { s += c[0]; n++; } }
  return n ? s / n : -60;
}
function firstCoord(g) { if (!g) return null; let c = g.coordinates; while (Array.isArray(c) && Array.isArray(c[0])) c = c[0]; return Array.isArray(c) && typeof c[0] === 'number' ? c : null; }

const fuzzyCache = new Map();
export function matchName(G, name, prov = null) {
  const k = geoKey(name);
  let arr = G.index.get(k);
  if (!arr) {
    const fk = G.label + '|' + k;
    if (fuzzyCache.has(fk)) arr = fuzzyCache.get(fk);
    else {
      let best = null, bd = 3;
      for (const [kk, a] of G.index) { const d = k.length > 5 ? lev(k, kk) : 9; if (d < bd) { bd = d; best = a; } }
      arr = best; fuzzyCache.set(fk, arr);
    }
  }
  if (!arr) return null;
  if (arr.length > 1 && prov != null) { const pk = geoKey(prov); return arr.find((f) => geoKey(f.prov || '') === pk) || null; }
  return arr[0];
}
