// Prepara la geometría de departamentos y provincias (IGN SIG 250 vía mgaitan/departamentos_argentina)
import { readFileSync, writeFileSync } from 'node:fs';
import * as tc from 'topojson-client';
import * as ts from 'topojson-simplify';
const topo = JSON.parse(readFileSync('tools/departamentos-argentina.topojson', 'utf8'));
const key = Object.keys(topo.objects)[0];
const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().trim();
const provs = new Set();
for (const g of topo.objects[key].geometries) {
  const p = g.properties; g.properties = { d: p.departamento, p: p.provincia, c: p.cabecera };
  provs.add(p.provincia);
}
console.log([...provs].sort().join(' | '), topo.objects[key].geometries.length);
let t = ts.presimplify(topo);
const w = ts.quantile(t, 0.12);
t = ts.simplify(t, w);
t = ts.filter(t, ts.filterWeight(t, w));
// provincias por fusión
const geoms = t.objects[key].geometries;
const byP = {};
for (const g of geoms) (byP[g.properties.p] ||= []).push(g);
t.objects.provincias = { type: 'GeometryCollection', geometries: Object.entries(byP).map(([p, gs]) => ({ ...tc.mergeArcs(t, gs), properties: { p } })) };
t.objects.departamentos = t.objects[key]; delete t.objects[key];
// cuantiza
if (!t.transform) t = tc.quantize(t, 1e5);
const out = JSON.stringify(t);
writeFileSync('data/argentina.topo.json', out);
console.log('bytes', out.length);
