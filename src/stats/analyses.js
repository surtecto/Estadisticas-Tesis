// Análisis disponibles en la pestaña Estadística. Cada uno toma una tabla y sus parámetros y devuelve bloques
// (tablas con formato APA, texto de resultados para la tesis, avisos de supuestos y preguntas críticas)
// y una propuesta de gráfico.
import * as S from './engine.js';
import { num, num1, pval, pcell, df, ci, sep, magnitude, stars } from './report.js';
import { ADJUST } from './dist.js';
import { colIndex, getCol, levelsOf, filteredRows, isNum, isCat } from '../data/table.js';

// ---------- acceso a datos ----------
function rowsOf(table, params) { return filteredRows(table, params.filters || []); }
function vec(table, rows, key) { const j = colIndex(table, key); return rows.map((r) => r[j]); }
function pairs(table, rows, keys) {
  const js = keys.map((k) => colIndex(table, k));
  return rows.filter((r) => js.every((j) => r[j] != null && (typeof r[j] !== 'number' || Number.isFinite(r[j])))).map((r) => js.map((j) => r[j]));
}
function groupsOf(table, rows, yKey, gKey, only = null) {
  const yj = colIndex(table, yKey), gj = colIndex(table, gKey);
  let levels = levelsOf(table, gKey);
  if (only && only.length) levels = levels.filter((l) => only.includes(l));
  const groups = levels.map((l) => rows.filter((r) => r[gj] != null && String(r[gj]) === l && r[yj] != null && Number.isFinite(r[yj])).map((r) => r[yj]));
  const keep = groups.map((g) => g.length > 0);
  return { levels: levels.filter((_, i) => keep[i]), groups: groups.filter((_, i) => keep[i]) };
}
const nameOf = (table, key) => (getCol(table, key) || {}).name || key;
const unitOf = (table, key) => { const c = getCol(table, key); return c && c.unit ? ` (${c.unit})` : ''; };

function block(type, o) { return { type, ...o }; }
const T = (caption, head, rows, note) => block('table', { caption, head, rows, note });
const P = (text) => block('text', { text });
const APA = (text) => block('apa', { text });
const W = (text) => block('warn', { text });
const Q = (items) => block('questions', { items });

// ---------- normalidad resumida ----------
function normalityRow(label, x) {
  const sw = S.shapiroWilk(x);
  return [label, String(x.length), Number.isFinite(sw.W) ? num(sw.W, 3) : '—', Number.isFinite(sw.p) ? pcell(sw.p) : '—', sw.error ? sw.error : sw.p < 0.05 ? 'se aparta de la normal' : 'compatible con normal'];
}
function normalityNote(groups) {
  const tests = groups.map((g) => (g.length >= 3 && g.length <= 5000 ? S.shapiroWilk(g) : null));
  const bad = tests.filter((t) => t && t.p < 0.05).length;
  const small = groups.some((g) => g.length < 30);
  return { bad, small, anyLarge: groups.every((g) => g.length >= 30) };
}

export const ANALYSES = [
  // ===================== describir =====================
  {
    id: 'desc', group: 'Describir', name: 'Estadísticos descriptivos',
    desc: 'Centro, dispersión, forma y atípicos de una o varias variables numéricas, en total o por grupo.',
    params: [{ key: 'vars', label: 'Variables numéricas', kind: 'numMulti' }, { key: 'by', label: 'Por grupo (opcional)', kind: 'cat', optional: true }],
    run(t, p) {
      const rows = rowsOf(t, p);
      const out = [];
      const head = ['Variable', 'Grupo', 'n', 'Media', 'DE', 'EE', 'IC 95 %', 'Mediana', 'RIC', 'Mín.', 'Máx.', 'Asimetría', 'Curtosis', 'Atípicos'];
      const body = [];
      const norm = [];
      for (const v of p.vars || []) {
        const sets = p.by ? groupsOf(t, rows, v, p.by) : { levels: ['Total'], groups: [vec(t, rows, v).filter((x) => x != null && Number.isFinite(x))] };
        sets.groups.forEach((g, i) => {
          const d = S.describe(g);
          body.push([nameOf(t, v) + unitOf(t, v), sets.levels[i], String(d.n), num(d.mean), num(d.sd), num(d.se), d.n > 1 ? ci(d.ciLow, d.ciHigh) : '—', num(d.median), num(d.iqr), num(d.min), num(d.max), num(d.skew), num(d.kurt), String(d.outliers ? d.outliers.length : 0)]);
          if (g.length >= 3) norm.push(normalityRow(`${nameOf(t, v)} · ${sets.levels[i]}`, g));
        });
      }
      out.push(T('Tabla. Estadísticos descriptivos', head, body, 'DE = desvío estándar; EE = error estándar de la media; RIC = rango intercuartil (cuartiles tipo 7, como R y Excel). Asimetría y curtosis con el ajuste muestral de SPSS y Excel (curtosis en exceso: 0 en la normal). Atípicos según las vallas de Tukey (1,5 RIC).'));
      if (norm.length) out.push(T('Tabla. Prueba de normalidad de Shapiro–Wilk', ['Variable y grupo', 'n', 'W', 'p', 'Lectura'], norm, 'Con muestras grandes la prueba detecta desvíos mínimos sin importancia práctica: conviene mirarla junto con el histograma o el gráfico Q-Q.'));
      const first = (p.vars || [])[0];
      if (first) {
        const d = S.describe(vec(t, rows, first).filter((x) => x != null));
        if (Math.abs(d.skew) > 1) out.push(W(`«${nameOf(t, first)}» es marcadamente asimétrica (asimetría ${num(d.skew)}): la mediana y el RIC la describen mejor que la media y el DE.`));
      }
      out.push(Q(['¿La media representa a alguien concreto en estos datos, o es un promedio de situaciones muy distintas?', '¿Los atípicos son errores de carga, casos extremos reales o el centro de lo que interesa estudiar?', '¿Qué casos faltan (datos perdidos) y por qué faltan? Lo que no se registró también tiene una geografía.']));
      return { title: 'Estadísticos descriptivos', blocks: out, chart: first ? { type: p.by ? 'box' : 'hist', enc: { y: first, x: p.by || null, color: p.by || null } } : null };
    },
  },
  {
    id: 'freq', group: 'Describir', name: 'Frecuencias de una variable categórica',
    desc: 'Cantidades, porcentajes, porcentaje acumulado e intervalo de confianza de cada categoría (Wilson); bondad de ajuste opcional.',
    params: [{ key: 'v', label: 'Variable categórica', kind: 'cat' }, { key: 'weight', label: 'Ponderar por (opcional)', kind: 'num', optional: true }, { key: 'gof', label: 'Probar si las categorías son equiprobables', kind: 'bool' }],
    run(t, p) {
      const rows = rowsOf(t, p);
      const j = colIndex(t, p.v), wj = p.weight ? colIndex(t, p.weight) : -1;
      const levels = levelsOf(t, p.v);
      const counts = levels.map((l) => rows.filter((r) => r[j] != null && String(r[j]) === l).reduce((a, r) => a + (wj >= 0 ? r[wj] || 0 : 1), 0));
      const missing = rows.filter((r) => r[j] == null).length;
      const N = counts.reduce((a, b) => a + b, 0);
      let cum = 0;
      const body = levels.map((l, i) => { cum += counts[i]; const [lo, hi] = S.wilsonCI(counts[i], N); return [l, num(counts[i], wj >= 0 ? 1 : 0), num((counts[i] / N) * 100, 1), num((cum / N) * 100, 1), `${num(lo * 100, 1)}–${num(hi * 100, 1)}`]; });
      body.push(['Total', num(N, wj >= 0 ? 1 : 0), '100,0', '', '']);
      const out = [T(`Tabla. Distribución de frecuencias de ${nameOf(t, p.v)}`, ['Categoría', 'Frecuencia', '%', '% acumulado', 'IC 95 % (Wilson)'], body, missing ? `${missing} casos sin dato no se incluyen en los porcentajes.` : '')];
      if (p.gof && levels.length > 1) {
        const g = S.chiSquareGOF(counts);
        out.push(APA(`La distribución de ${nameOf(t, p.v)} ${g.p < 0.05 ? 'difiere' : 'no difiere'} de una distribución uniforme, χ²(${g.df}, N = ${N}) = ${num(g.chi2)}, ${pval(g.p)}, w = ${num1(g.w)}.`));
      }
      if (levels.length > 7) out.push(W(`${levels.length} categorías: en un gráfico conviene agrupar las menores en «Otras» u ordenar las barras por frecuencia.`));
      out.push(Q(['¿Quién definió estas categorías y qué quedó fuera de ellas (la categoría «Otros» suele esconder lo más interesante)?', '¿El porcentaje se calcula sobre el total de casos o sobre los que respondieron?']));
      return { title: 'Frecuencias', blocks: out, chart: { type: 'bar', enc: { x: p.v }, agg: 'count', options: { sort: 'desc' } } };
    },
  },
  // ===================== relacionar categorías =====================
  {
    id: 'crosstab', group: 'Relacionar', name: 'Tabla de contingencia (χ²)',
    desc: 'Asociación entre dos variables categóricas: frecuencias, porcentajes, χ² de Pearson, razón de verosimilitudes, prueba exacta de Fisher (2 × 2), V de Cramér y residuos ajustados.',
    params: [{ key: 'row', label: 'Filas', kind: 'cat' }, { key: 'col', label: 'Columnas', kind: 'cat' }, { key: 'pctBy', label: 'Porcentajes por', kind: 'select', options: [['row', 'fila'], ['col', 'columna'], ['total', 'total']], def: 'row' }],
    run(t, p) {
      const rows = rowsOf(t, p);
      const rj = colIndex(t, p.row), cj = colIndex(t, p.col);
      const rl = levelsOf(t, p.row), cl = levelsOf(t, p.col);
      const m = rl.map((a) => cl.map((b) => rows.filter((r) => String(r[rj]) === a && String(r[cj]) === b).length));
      const keepR = m.map((r) => r.some((v) => v > 0)), keepC = cl.map((_, k) => m.some((r) => r[k] > 0));
      const RL = rl.filter((_, i) => keepR[i]), CL = cl.filter((_, k) => keepC[k]);
      const M = m.filter((_, i) => keepR[i]).map((r) => r.filter((_, k) => keepC[k]));
      if (RL.length < 2 || CL.length < 2) return { title: 'Tabla de contingencia', blocks: [W('Hacen falta al menos dos categorías con casos en cada variable.')] };
      const res = S.chiSquareIndependence(M);
      const by = p.pctBy || 'row';
      const body = RL.map((a, i) => [a, ...CL.map((_, k) => {
        const den = by === 'row' ? res.rowSums[i] : by === 'col' ? res.colSums[k] : res.N;
        const z = res.adjRes[i][k];
        return `${M[i][k]} (${num((M[i][k] / den) * 100, 1)} %)${Math.abs(z) > 1.96 ? (z > 0 ? ' ▲' : ' ▼') : ''}`;
      }), String(res.rowSums[i])]);
      body.push(['Total', ...res.colSums.map(String), String(res.N)]);
      const out = [T(`Tabla. ${nameOf(t, p.row)} según ${nameOf(t, p.col)}`, [`${nameOf(t, p.row)} \\ ${nameOf(t, p.col)}`, ...CL, 'Total'], body, `Frecuencias y porcentaje por ${by === 'row' ? 'fila' : by === 'col' ? 'columna' : 'total'}. ▲ / ▼: residuo ajustado mayor que 1,96 en valor absoluto (más / menos casos que los esperados si no hubiera asociación).`)];
      const stats = [['χ² de Pearson', num(res.chi2), String(res.df), pcell(res.p)], ['Razón de verosimilitudes G²', num(res.G2), String(res.df), pcell(res.pG2)]];
      if (RL.length === 2 && CL.length === 2) {
        const y = S.chiSquareIndependence(M, { yates: true });
        const f = S.fisherExact2x2(M);
        stats.push(['χ² con corrección de Yates', num(y.chi2), '1', pcell(y.p)], ['Prueba exacta de Fisher (bilateral)', '', '', pcell(f.p)]);
        stats.push([`Razón de odds (IC 95 %)`, `${num(f.or)} ${ci(f.orLow, f.orHigh)}`, '', '']);
      }
      out.push(T('Tabla. Pruebas de independencia', ['Prueba', 'Valor', 'gl', 'p'], stats, `V de Cramér = ${num1(res.cramerV, 3)} (asociación ${magnitude('V', res.cramerV)}).`));
      if (res.lowExpectedShare > 0.2) out.push(W(`${res.lowExpected} celdas (${num(res.lowExpectedShare * 100, 0)} %) tienen frecuencia esperada menor que 5 (mínima ${num(res.minExpected)}): la aproximación χ² no es confiable. ${RL.length === 2 && CL.length === 2 ? 'Informá la prueba exacta de Fisher.' : 'Conviene agrupar categorías.'}`));
      out.push(APA(`Se encontró una asociación ${res.p < 0.05 ? 'estadísticamente significativa' : 'no significativa'} entre ${nameOf(t, p.row)} y ${nameOf(t, p.col)}, χ²(${res.df}, N = ${res.N}) = ${num(res.chi2)}, ${pval(res.p)}, V de Cramér = ${num1(res.cramerV)}.`));
      out.push(Q(['¿Una de las variables puede pensarse como causa de la otra, o ambas dependen de una tercera (lugar, época, quién relevó)?', '¿La asociación se sostiene dentro de cada subgrupo o aparece solo al juntarlos (paradoja de Simpson)?']));
      return { title: 'Tabla de contingencia', blocks: out, chart: { type: 'bar', enc: { x: p.row, color: p.col }, agg: 'count', options: { stack: 'percent', orientation: 'h' } } };
    },
  },
  // ===================== comparar grupos =====================
  {
    id: 'compare2', group: 'Comparar', name: 'Comparar dos grupos independientes',
    desc: 'Revisa los supuestos (normalidad y varianzas) y compara con t de Student, t de Welch y U de Mann–Whitney, con tamaños de efecto.',
    params: [{ key: 'y', label: 'Variable numérica', kind: 'num' }, { key: 'g', label: 'Grupos', kind: 'cat' }, { key: 'only', label: 'Grupos a comparar (si hay más de dos)', kind: 'levels', of: 'g', max: 2 }],
    run(t, p) {
      const rows = rowsOf(t, p);
      const { levels, groups } = groupsOf(t, rows, p.y, p.g, p.only);
      if (groups.length !== 2) return { title: 'Dos grupos', blocks: [W(`Se encontraron ${groups.length} grupos con datos. Elegí exactamente dos o usá «Comparar tres o más grupos».`)] };
      const [a, b] = groups;
      const da = S.describe(a), db = S.describe(b);
      const out = [T('Tabla. Descriptivos por grupo', ['Grupo', 'n', 'Media', 'DE', 'Mediana', 'RIC'], [[levels[0], String(da.n), num(da.mean), num(da.sd), num(da.median), num(da.iqr)], [levels[1], String(db.n), num(db.mean), num(db.sd), num(db.median), num(db.iqr)]])];
      const nr = [normalityRow(levels[0], a), normalityRow(levels[1], b)];
      const lev = S.levene([a, b]);
      out.push(T('Tabla. Supuestos', ['Grupo', 'n', 'W', 'p', 'Lectura'], [...nr, ['Levene (mediana)', '', `F(${lev.df1}, ${lev.df2}) = ${num(lev.F)}`, pcell(lev.p), lev.p < 0.05 ? 'varianzas distintas' : 'varianzas compatibles']]));
      const st = S.tTestIndependent(a, b, { welch: false });
      const we = S.tTestIndependent(a, b, { welch: true });
      const mw = S.mannWhitney(a, b);
      out.push(T('Tabla. Pruebas', ['Prueba', 'Estadístico', 'gl', 'p', 'Diferencia (IC 95 %)', 'Efecto'], [
        ['t de Student', `t = ${num(st.t)}`, df(st.df), pcell(st.p), `${num(st.diff)} ${ci(st.ciLow, st.ciHigh)}`, `d = ${num(st.d)}`],
        ['t de Welch', `t = ${num(we.t)}`, df(we.df), pcell(we.p), `${num(we.diff)} ${ci(we.ciLow, we.ciHigh)}`, `g = ${num(we.g)}`],
        ['U de Mann–Whitney', `U = ${num(mw.U, 1)}`, '', pcell(mw.p), `Me: ${num(mw.md1)} vs ${num(mw.md2)}`, `r = ${num1(mw.r)}`],
      ], `Diferencia = ${levels[0]} − ${levels[1]}. d de Cohen con DE combinado; g de Hedges corregido por muestra chica; r = |z|/√N. Mann–Whitney: ${mw.method}.`));
      const nn = normalityNote(groups);
      let rec, txt;
      if (nn.bad && !nn.anyLarge) {
        rec = 'mw';
        txt = `Se compararon ${nameOf(t, p.y)} entre ${levels[0]} y ${levels[1]} con la prueba U de Mann–Whitney, porque al menos un grupo se aparta de la distribución normal y las muestras son chicas. ${nameOf(t, p.y)} ${mw.p < 0.05 ? 'difirió' : 'no difirió'} entre grupos (Me = ${num(mw.md1)} y ${num(mw.md2)}), U = ${num(mw.U, 1)}, z = ${num(mw.z)}, ${pval(mw.p)}, r = ${num1(mw.r)}.`;
      } else {
        rec = 'welch';
        txt = `Se compararon las medias de ${nameOf(t, p.y)} entre ${levels[0]} (M = ${num(da.mean)}, DE = ${num(da.sd)}) y ${levels[1]} (M = ${num(db.mean)}, DE = ${num(db.sd)}) con la prueba t de Welch, que no supone varianzas iguales. La diferencia ${we.p < 0.05 ? 'fue' : 'no fue'} estadísticamente significativa, t(${df(we.df)}) = ${num(we.t)}, ${pval(we.p)}, diferencia de medias = ${num(we.diff)}, IC 95 % ${ci(we.ciLow, we.ciHigh)}, g de Hedges = ${num(we.g)} (efecto ${magnitude('d', we.g)}).`;
      }
      out.push(P(rec === 'mw' ? 'Recomendación: informar Mann–Whitney (supuesto de normalidad comprometido con muestras chicas).' : `Recomendación: informar t de Welch${nn.bad ? ' (hay desvíos de la normal, pero con 30 casos o más por grupo la prueba t es robusta)' : ''}. Welch es preferible a Student por defecto: rinde igual cuando las varianzas son iguales y protege cuando no lo son.`));
      out.push(APA(txt));
      out.push(Q(['¿Los grupos se formaron al azar o ya existían? Si ya existían, la diferencia describe pero no explica.', '¿La diferencia observada importa en términos sustantivos (unidades reales, no solo p)?', `Con n = ${da.n + db.n}, ¿qué tamaño de diferencia podría haberse detectado? Un resultado no significativo no prueba que los grupos sean iguales.`]));
      return { title: 'Dos grupos independientes', blocks: out, chart: { type: 'box', enc: { x: p.g, y: p.y, color: p.g }, options: { points: true, annotate: 'brackets' }, filters: p.only && p.only.length === 2 ? [{ col: p.g, op: 'in', vals: p.only }] : [] } };
    },
  },
  {
    id: 'paired', group: 'Comparar', name: 'Comparar dos mediciones pareadas',
    desc: 'Antes y después, o dos mediciones del mismo caso: t para muestras relacionadas y Wilcoxon de rangos con signo.',
    params: [{ key: 'a', label: 'Primera medición', kind: 'num' }, { key: 'b', label: 'Segunda medición', kind: 'num' }],
    run(t, p) {
      const rows = rowsOf(t, p);
      const pr = pairs(t, rows, [p.a, p.b]);
      const a = pr.map((x) => x[0]), b = pr.map((x) => x[1]);
      if (pr.length < 3) return { title: 'Pareadas', blocks: [W('Hacen falta al menos 3 casos con las dos mediciones.')] };
      const tt = S.tTestPaired(a, b), wi = S.wilcoxonSigned(a, b);
      const diff = a.map((v, i) => v - b[i]);
      const out = [T('Tabla. Mediciones pareadas', ['Prueba', 'Estadístico', 'gl', 'p', 'Diferencia media (IC 95 %)', 'Efecto'], [
        ['t para muestras relacionadas', `t = ${num(tt.t)}`, df(tt.df), pcell(tt.p), `${num(tt.diff)} ${ci(tt.ciLow, tt.ciHigh)}`, `dz = ${num(tt.dz)}`],
        ['Wilcoxon de rangos con signo', `V = ${num(wi.V, 1)}`, '', pcell(wi.p), `Me dif. = ${num(S.median(diff))}`, `r = ${num1(wi.r)}`],
      ], `n = ${pr.length} pares. Diferencia = ${nameOf(t, p.a)} − ${nameOf(t, p.b)}.${wi.zeros ? ` ${wi.zeros} pares con diferencia cero se excluyen de Wilcoxon.` : ''}`)];
      out.push(T('Tabla. Normalidad de las diferencias', ['Serie', 'n', 'W', 'p', 'Lectura'], [normalityRow('Diferencias', diff)]));
      const sw = S.shapiroWilk(diff);
      out.push(APA(sw.p < 0.05 && pr.length < 30
        ? `La prueba de Wilcoxon de rangos con signo ${wi.p < 0.05 ? 'mostró' : 'no mostró'} una diferencia significativa entre ${nameOf(t, p.a)} y ${nameOf(t, p.b)}, V = ${num(wi.V, 1)}, z = ${num(wi.z)}, ${pval(wi.p)}, r = ${num1(wi.r)}.`
        : `${nameOf(t, p.a)} (M = ${num(tt.m1)}) y ${nameOf(t, p.b)} (M = ${num(tt.m2)}) ${tt.p < 0.05 ? 'difirieron' : 'no difirieron'} significativamente, t(${tt.df}) = ${num(tt.t)}, ${pval(tt.p)}, diferencia media = ${num(tt.diff)}, IC 95 % ${ci(tt.ciLow, tt.ciHigh)}, dz = ${num(tt.dz)}.`));
      out.push(Q(['¿Qué más cambió entre las dos mediciones además de lo que se quiere evaluar (estación, instrumento, observador)?', '¿Hay efecto de regresión a la media: los casos extremos en la primera medición tienden a moderarse en la segunda?']));
      return { title: 'Mediciones pareadas', blocks: out, chart: { type: 'slope', enc: { y: p.a, y2: p.b } } };
    },
  },
  {
    id: 'onesample', group: 'Comparar', name: 'Comparar con un valor de referencia',
    desc: 'Si la media (o la mediana) difiere de un valor teórico, normativo o histórico.',
    params: [{ key: 'y', label: 'Variable numérica', kind: 'num' }, { key: 'mu', label: 'Valor de referencia', kind: 'number', def: 0 }],
    run(t, p) {
      const rows = rowsOf(t, p);
      const x = vec(t, rows, p.y).filter((v) => v != null && Number.isFinite(v));
      const mu = +p.mu || 0;
      const tt = S.tTestOneSample(x, mu), wi = S.wilcoxonSigned(x, null, { mu });
      const out = [T('Tabla. Comparación con el valor de referencia', ['Prueba', 'Estadístico', 'gl', 'p', 'Diferencia (IC 95 %)', 'Efecto'], [
        ['t para una muestra', `t = ${num(tt.t)}`, df(tt.df), pcell(tt.p), `${num(tt.diff)} ${ci(tt.ciLow, tt.ciHigh)}`, `d = ${num(tt.d)}`],
        ['Wilcoxon (mediana)', `V = ${num(wi.V, 1)}`, '', pcell(wi.p), `Me = ${num(S.median(x))}`, `r = ${num1(wi.r)}`],
      ], `Valor de referencia = ${num(mu)}; n = ${x.length}.`), T('Tabla. Normalidad', ['Serie', 'n', 'W', 'p', 'Lectura'], [normalityRow(nameOf(t, p.y), x)])];
      out.push(APA(`La media de ${nameOf(t, p.y)} (M = ${num(tt.mean)}, DE = ${num(S.sd(x))}) ${tt.p < 0.05 ? 'difirió' : 'no difirió'} del valor de referencia ${num(mu)}, t(${tt.df}) = ${num(tt.t)}, ${pval(tt.p)}, d = ${num(tt.d)}.`));
      out.push(Q(['¿De dónde sale el valor de referencia y qué supuestos trae (otra época, otra región, otro método)?']));
      return { title: 'Una muestra', blocks: out, chart: { type: 'hist', enc: { y: p.y }, options: { refLine: mu } } };
    },
  },
  {
    id: 'compareK', group: 'Comparar', name: 'Comparar tres o más grupos',
    desc: 'ANOVA de un factor, ANOVA de Welch y Kruskal–Wallis, con comparaciones posteriores (Tukey, Games–Howell, Dunn).',
    params: [{ key: 'y', label: 'Variable numérica', kind: 'num' }, { key: 'g', label: 'Grupos', kind: 'cat' }, { key: 'adjust', label: 'Corrección para Dunn', kind: 'select', options: ADJUST, def: 'holm' }],
    run(t, p) {
      const rows = rowsOf(t, p);
      const { levels, groups } = groupsOf(t, rows, p.y, p.g);
      if (groups.length < 2) return { title: 'Varios grupos', blocks: [W('Hacen falta al menos dos grupos con datos.')] };
      if (groups.some((g) => g.length < 2)) return { title: 'Varios grupos', blocks: [W('Cada grupo necesita al menos dos casos.')] };
      const an = S.anovaOneWay(groups), we = S.welchAnova(groups), kw = S.kruskalWallis(groups), lev = S.levene(groups);
      const out = [T('Tabla. Descriptivos por grupo', ['Grupo', 'n', 'Media', 'DE', 'Mediana', 'Rango medio'], levels.map((l, i) => [l, String(groups[i].length), num(an.means[i]), num(an.sds[i]), num(S.median(groups[i])), num(kw.meanRanks[i], 1)]))];
      out.push(T('Tabla. Supuestos', ['Grupo', 'n', 'W', 'p', 'Lectura'], [...levels.map((l, i) => normalityRow(l, groups[i])), ['Levene (mediana)', '', `F(${lev.df1}, ${lev.df2}) = ${num(lev.F)}`, pcell(lev.p), lev.p < 0.05 ? 'varianzas distintas' : 'varianzas compatibles']]));
      out.push(T('Tabla. ANOVA de un factor', ['Fuente', 'SC', 'gl', 'MC', 'F', 'p'], [
        ['Entre grupos', num(an.ssb), String(an.dfB), num(an.msb), num(an.F), pcell(an.p)],
        ['Dentro de grupos', num(an.ssw), String(an.dfW), num(an.msw), '', ''],
        ['Total', num(an.sst), String(an.N - 1), '', '', ''],
      ], `η² = ${num1(an.eta2, 3)}; ω² = ${num1(an.omega2, 3)}. ANOVA de Welch: F(${an.dfB}, ${num(we.df2)}) = ${num(we.F)}, ${pval(we.p)}. Kruskal–Wallis: H(${kw.df}) = ${num(kw.H)}, ${pval(kw.p)}, ε² = ${num1(kw.epsilon2, 3)}.`));
      const nn = normalityNote(groups);
      const hetero = lev.p < 0.05;
      const nonpar = nn.bad && !nn.anyLarge;
      let post;
      if (nonpar) {
        const dn = S.dunn(groups, levels, p.adjust || 'holm');
        post = T(`Tabla. Comparaciones de Dunn (corrección ${(ADJUST.find((x) => x[0] === (p.adjust || 'holm')) || [])[1]})`, ['Comparación', 'z', 'p', 'p ajustado', ''], dn.map((d) => [`${d.a} − ${d.b}`, num(d.z), pcell(d.p), pcell(d.pAdj), stars(d.pAdj)]));
      } else if (hetero) {
        const gh = S.gamesHowell(groups, levels);
        post = T('Tabla. Comparaciones de Games–Howell (varianzas distintas)', ['Comparación', 'Diferencia', 'IC 95 %', 'gl', 'p ajustado', ''], gh.map((d) => [`${d.a} − ${d.b}`, num(d.diff), ci(d.ciLow, d.ciHigh), num(d.df, 1), pcell(d.pAdj), stars(d.pAdj)]));
      } else {
        const tk = S.tukeyHSD(groups, levels);
        post = T('Tabla. Comparaciones de Tukey (DHS)', ['Comparación', 'Diferencia', 'IC 95 %', 'q', 'p ajustado', ''], tk.map((d) => [`${d.a} − ${d.b}`, num(d.diff), ci(d.ciLow, d.ciHigh), num(d.q), pcell(d.pAdj), stars(d.pAdj)]));
      }
      out.push(P(nonpar ? 'Recomendación: Kruskal–Wallis con comparaciones de Dunn (hay grupos que se apartan de la normal con muestras chicas).' : hetero ? 'Recomendación: ANOVA de Welch con comparaciones de Games–Howell (las varianzas difieren entre grupos).' : 'Recomendación: ANOVA de un factor con comparaciones de Tukey (supuestos razonables).'));
      out.push(post);
      out.push(APA(nonpar
        ? `La prueba de Kruskal–Wallis indicó que ${nameOf(t, p.y)} ${kw.p < 0.05 ? 'difiere' : 'no difiere'} entre los grupos de ${nameOf(t, p.g)}, H(${kw.df}) = ${num(kw.H)}, ${pval(kw.p)}, ε² = ${num1(kw.epsilon2)}.`
        : hetero
          ? `El ANOVA de Welch indicó que la media de ${nameOf(t, p.y)} ${we.p < 0.05 ? 'difiere' : 'no difiere'} entre los grupos de ${nameOf(t, p.g)}, F(${an.dfB}, ${num(we.df2)}) = ${num(we.F)}, ${pval(we.p)}, η² = ${num1(an.eta2)}.`
          : `El ANOVA de un factor indicó que la media de ${nameOf(t, p.y)} ${an.p < 0.05 ? 'difiere' : 'no difiere'} entre los grupos de ${nameOf(t, p.g)}, F(${an.dfB}, ${an.dfW}) = ${num(an.F)}, ${pval(an.p)}, η² = ${num1(an.eta2)} (efecto ${magnitude('eta2', an.eta2)}).`));
      out.push(Q(['¿Las diferencias entre grupos responden a la categoría o a algo que viaja con ella (tamaño, antigüedad, ubicación)?', `Se hicieron ${(groups.length * (groups.length - 1)) / 2} comparaciones de a pares: ¿se mira el patrón completo o solo los asteriscos?`]));
      return { title: 'Tres o más grupos', blocks: out, chart: { type: 'violin', enc: { x: p.g, y: p.y, color: p.g }, options: { points: true, annotate: 'brackets' } } };
    },
  },
  {
    id: 'anova2', group: 'Comparar', name: 'ANOVA factorial (dos factores)',
    desc: 'Efectos principales de dos factores y su interacción (sumas de cuadrados tipo III, como SPSS).',
    params: [{ key: 'y', label: 'Variable numérica', kind: 'num' }, { key: 'a', label: 'Factor A', kind: 'cat' }, { key: 'b', label: 'Factor B', kind: 'cat' }],
    run(t, p) {
      const rows = rowsOf(t, p);
      const pr = pairs(t, rows, [p.y, p.a, p.b]);
      const res = S.anovaFactorial(pr.map((x) => x[0]), [
        { name: nameOf(t, p.a), values: pr.map((x) => String(x[1])), levels: levelsOf(t, p.a).filter((l) => pr.some((x) => String(x[1]) === l)) },
        { name: nameOf(t, p.b), values: pr.map((x) => String(x[2])), levels: levelsOf(t, p.b).filter((l) => pr.some((x) => String(x[2]) === l)) },
      ]);
      if (res.error) return { title: 'ANOVA factorial', blocks: [W(res.error)] };
      const out = [T('Tabla. ANOVA factorial (SC tipo III)', ['Fuente', 'SC', 'gl', 'MC', 'F', 'p', 'η² parcial'], res.rows.map((r) => [r.term, num(r.ss), String(r.df), num(r.ms), r.F != null ? num(r.F) : '', r.p != null ? pcell(r.p) : '', r.partialEta2 != null ? num1(r.partialEta2, 3) : '']), `n = ${res.n}; R² = ${num1(res.r2, 3)} (ajustado ${num1(res.adjR2, 3)}).`)];
      const inter = res.rows[2];
      out.push(APA(`Se encontró ${inter.p < 0.05 ? 'una interacción significativa' : 'que la interacción no fue significativa'} entre ${res.rows[0].term} y ${res.rows[1].term}, F(${inter.df}, ${res.rows[3].df}) = ${num(inter.F)}, ${pval(inter.p)}, η²p = ${num1(inter.partialEta2)}. El efecto principal de ${res.rows[0].term} fue F(${res.rows[0].df}, ${res.rows[3].df}) = ${num(res.rows[0].F)}, ${pval(res.rows[0].p)}, y el de ${res.rows[1].term}, F(${res.rows[1].df}, ${res.rows[3].df}) = ${num(res.rows[1].F)}, ${pval(res.rows[1].p)}.`));
      if (inter.p < 0.05) out.push(W('Con interacción significativa, los efectos principales se interpretan con cuidado: el efecto de un factor depende del nivel del otro. Miralo en el gráfico de medias.'));
      out.push(Q(['¿Hay casos en todas las combinaciones de los dos factores, o algunas celdas están casi vacías?']));
      return { title: 'ANOVA factorial', blocks: out, chart: { type: 'meanci', enc: { x: p.a, y: p.y, color: p.b } } };
    },
  },
  {
    id: 'friedman', group: 'Comparar', name: 'Tres o más mediciones del mismo caso (Friedman)',
    desc: 'Prueba no paramétrica para medidas repetidas, con W de Kendall como tamaño de efecto.',
    params: [{ key: 'vars', label: 'Mediciones (columnas)', kind: 'numMulti' }],
    run(t, p) {
      const rows = rowsOf(t, p);
      const pr = pairs(t, rows, p.vars || []);
      if ((p.vars || []).length < 3 || pr.length < 3) return { title: 'Friedman', blocks: [W('Elegí al menos tres columnas y casos completos.')] };
      const f = S.friedman((p.vars || []).map((_, j) => pr.map((r) => r[j])));
      return { title: 'Friedman', blocks: [
        T('Tabla. Rangos medios', ['Medición', 'Mediana', 'Rango medio'], p.vars.map((v, j) => [nameOf(t, v), num(S.median(pr.map((r) => r[j]))), num(f.meanRanks[j], 2)]), `n = ${f.n} casos completos.`),
        APA(`La prueba de Friedman ${f.p < 0.05 ? 'mostró' : 'no mostró'} diferencias entre las mediciones, χ²F(${f.df}) = ${num(f.chi2)}, ${pval(f.p)}, W de Kendall = ${num1(f.W)}.`),
      ], chart: null };
    },
  },
  // ===================== relaciones entre numéricas =====================
  {
    id: 'corr', group: 'Relacionar', name: 'Correlación',
    desc: 'Matriz de correlaciones de Pearson, Spearman o Kendall, con IC 95 % y p.',
    params: [{ key: 'vars', label: 'Variables numéricas', kind: 'numMulti' }, { key: 'method', label: 'Coeficiente', kind: 'select', options: [['pearson', 'Pearson (lineal)'], ['spearman', 'Spearman (monótona, por rangos)'], ['kendall', 'Kendall τ-b']], def: 'pearson' }, { key: 'adjust', label: 'Corrección por comparaciones múltiples', kind: 'select', options: ADJUST, def: 'none' }],
    run(t, p) {
      const rows = rowsOf(t, p);
      const vs = p.vars || [];
      if (vs.length < 2) return { title: 'Correlación', blocks: [W('Elegí al menos dos variables numéricas.')] };
      const m = p.method || 'pearson';
      const res = [];
      for (let i = 0; i < vs.length; i++) for (let j = i + 1; j < vs.length; j++) {
        const pr = pairs(t, rows, [vs[i], vs[j]]);
        const x = pr.map((q) => q[0]), y = pr.map((q) => q[1]);
        const r = m === 'pearson' ? S.pearson(x, y) : m === 'spearman' ? S.spearman(x, y) : S.kendall(x, y);
        res.push({ i, j, r: r.r ?? r.rho ?? r.tau, p: r.p, n: pr.length, lo: r.ciLow, hi: r.ciHigh });
      }
      const adj = S.adjustP(res.map((r) => r.p), p.adjust || 'none');
      res.forEach((r, k) => { r.pAdj = adj[k]; });
      const sym = m === 'pearson' ? 'r' : m === 'spearman' ? 'ρ' : 'τ';
      const head = ['Variable', ...vs.map((_, i) => String(i + 1))];
      const body = vs.map((v, i) => [`${i + 1}. ${nameOf(t, v)}`, ...vs.map((_, j) => {
        if (j === i) return '—';
        if (j > i) return '';
        const r = res.find((q) => q.i === j && q.j === i);
        return `${num1(r.r)}${r.pAdj < 0.001 ? '***' : r.pAdj < 0.01 ? '**' : r.pAdj < 0.05 ? '*' : ''}`;
      })]);
      const out = [T(`Tabla. Correlaciones (${sym})`, head, body, `* p < ,05; ** p < ,01; *** p < ,001${(p.adjust || 'none') !== 'none' ? ' (p ajustados)' : ''}. Casos completos por par.`)];
      out.push(T('Tabla. Detalle por par', ['Par', sym, 'IC 95 %', 'n', 'p', 'p ajustado'], res.map((r) => [`${nameOf(t, vs[r.i])} – ${nameOf(t, vs[r.j])}`, num1(r.r, 3), r.lo != null ? ci(r.lo, r.hi) : '—', String(r.n), pcell(r.p), pcell(r.pAdj)])));
      const top = res.slice().sort((a, b) => Math.abs(b.r) - Math.abs(a.r))[0];
      out.push(APA(`La correlación más fuerte se dio entre ${nameOf(t, vs[top.i])} y ${nameOf(t, vs[top.j])}, ${sym}(${top.n - 2}) = ${num1(top.r)}, ${pval(top.p)}${top.lo != null ? `, IC 95 % ${ci(top.lo, top.hi)}` : ''} (asociación ${magnitude('r', top.r)}).`));
      if (m === 'pearson') out.push(P('Pearson mide solo la relación lineal y es sensible a atípicos: compará con Spearman y mirá el diagrama de dispersión antes de interpretar.'));
      out.push(Q(['Correlación no es causalidad: ¿qué tercera variable podría mover a las dos a la vez (tamaño de la unidad, distancia, época)?', '¿Las unidades son comparables o se mezclan totales con tasas? Correlacionar totales de jurisdicciones de distinto tamaño suele medir solo el tamaño.']));
      return { title: 'Correlación', blocks: out, chart: vs.length === 2 ? { type: 'scatter', enc: { x: vs[0], y: vs[1] }, options: { trend: 'linear', band: true, annotate: 'stats' } } : { type: 'corr', enc: { vars: vs }, options: { method: m } } };
    },
  },
  {
    id: 'reg', group: 'Modelar', name: 'Regresión lineal (simple o múltiple)',
    desc: 'Coeficientes, IC 95 %, β estandarizados, R², F, VIF, Durbin–Watson y diagnóstico de residuos. Admite predictores categóricos (variables indicadoras).',
    params: [{ key: 'y', label: 'Variable dependiente', kind: 'num' }, { key: 'xs', label: 'Predictores', kind: 'anyMulti' }],
    run(t, p) {
      const rows = rowsOf(t, p);
      const xs = (p.xs || []).filter((k) => k !== p.y);
      if (!xs.length) return { title: 'Regresión', blocks: [W('Elegí al menos un predictor.')] };
      const pr = pairs(t, rows, [p.y, ...xs]);
      const names = [];
      const enc = [];
      xs.forEach((k, j) => {
        const c = getCol(t, k);
        if (isNum(c)) { names.push(c.name); enc.push((r) => [r[j + 1]]); }
        else {
          const lev = levelsOf(t, k).filter((l) => pr.some((r) => String(r[j + 1]) === l));
          lev.slice(1).forEach((l) => names.push(`${c.name}: ${l}`));
          enc.push((r) => lev.slice(1).map((l) => (String(r[j + 1]) === l ? 1 : 0)));
          names._ref = names._ref || []; names._ref.push(`${c.name}: referencia «${lev[0]}»`);
        }
      });
      const X = pr.map((r) => enc.flatMap((f) => f(r)));
      const y = pr.map((r) => r[0]);
      if (pr.length <= X[0].length + 1) return { title: 'Regresión', blocks: [W('Hay menos casos completos que parámetros a estimar.')] };
      const fit = S.ols(X, y, names);
      if (fit.error) return { title: 'Regresión', blocks: [W(fit.error)] };
      const out = [T(`Tabla. Regresión lineal de ${nameOf(t, p.y)}`, ['Predictor', 'B', 'EE', 'IC 95 %', 'β', 't', 'p', ...(fit.vif ? ['VIF'] : [])], fit.coefs.map((c, i) => [c.name, num(c.b, 3), num(c.se, 3), ci(c.ciLow, c.ciHigh, 3), c.beta != null ? num(c.beta, 3) : '', num(c.t), pcell(c.p), ...(fit.vif ? [i ? num(fit.vif[i - 1]) : ''] : [])]), `n = ${fit.n}. R² = ${num1(fit.r2, 3)}; R² ajustado = ${num1(fit.adjR2, 3)}; F(${fit.dfModel}, ${fit.dfResid}) = ${num(fit.F)}, ${pval(fit.pF)}; error estándar de la estimación = ${num(fit.sigma)}; AIC = ${num(fit.aic, 1)}.${names._ref ? ' Categorías de referencia: ' + names._ref.join('; ') + '.' : ''}`)];
      const swr = S.shapiroWilk(fit.resid.length > 5000 ? fit.resid.slice(0, 5000) : fit.resid);
      const big = fit.cook.filter((c) => c > 4 / fit.n).length;
      out.push(T('Tabla. Diagnóstico del modelo', ['Supuesto', 'Indicador', 'Lectura'], [
        ['Normalidad de los residuos', `Shapiro–Wilk W = ${num(swr.W, 3)}, ${pval(swr.p)}`, swr.p < 0.05 ? (fit.n >= 100 ? 'se aparta, pero con n grande los IC siguen siendo aproximadamente válidos' : 'se aparta: revisar transformaciones o atípicos') : 'compatible'],
        ['Independencia de los residuos', `Durbin–Watson = ${num(fit.dw)}`, fit.dw < 1.5 || fit.dw > 2.5 ? 'posible autocorrelación (datos ordenados en el tiempo o el espacio)' : 'sin indicios de autocorrelación'],
        ['Colinealidad', fit.vif ? `VIF máximo = ${num(Math.max(...fit.vif))}` : 'un solo predictor', fit.vif && Math.max(...fit.vif) > 5 ? 'predictores muy relacionados entre sí: los coeficientes son inestables' : 'aceptable'],
        ['Casos influyentes', `${big} con distancia de Cook > 4/n`, big ? 'revisar si un puñado de casos sostiene el resultado' : 'ninguno marcado'],
      ]));
      const sig = fit.coefs.slice(1).filter((c) => c.p < 0.05);
      out.push(APA(`El modelo ${fit.pF < 0.05 ? 'resultó significativo' : 'no resultó significativo'}, F(${fit.dfModel}, ${fit.dfResid}) = ${num(fit.F)}, ${pval(fit.pF)}, y explicó el ${num(fit.r2 * 100, 1)} % de la variabilidad de ${nameOf(t, p.y)} (R² ajustado = ${num1(fit.adjR2)}).${sig.length ? ' ' + sig.map((c) => `${c.name} se asoció ${c.b > 0 ? 'positivamente' : 'negativamente'} (B = ${num(c.b, 3)}, IC 95 % ${ci(c.ciLow, c.ciHigh, 3)}, ${pval(c.p)})`).join('; ') + '.' : ''}`));
      out.push(Q(['Un coeficiente es una asociación condicionada a los otros predictores, no un efecto causal: ¿qué variables relevantes quedaron afuera del modelo?', '¿El modelo se usaría para explicar o para predecir? Para predecir, ¿se validó con datos que no se usaron para ajustarlo?', '¿La relación es lineal en todo el rango o cambia en los extremos (umbrales, saturación)?']));
      const chart = xs.length === 1 && isNum(getCol(t, xs[0])) ? { type: 'scatter', enc: { x: xs[0], y: p.y }, options: { trend: 'linear', band: true, annotate: 'stats' } } : { type: 'coef', enc: { y: p.y, xs }, options: {} };
      return { title: 'Regresión lineal', blocks: out, chart, fit, residuals: fit.resid };
    },
  },
  {
    id: 'logit', group: 'Modelar', name: 'Regresión logística binaria',
    desc: 'Probabilidad de un resultado sí/no según predictores: razones de odds con IC 95 %, prueba de razón de verosimilitudes, R² de McFadden y Nagelkerke y tabla de clasificación.',
    params: [{ key: 'y', label: 'Resultado (categórica con dos valores)', kind: 'cat' }, { key: 'event', label: 'Categoría que cuenta como «evento»', kind: 'level', of: 'y' }, { key: 'xs', label: 'Predictores', kind: 'anyMulti' }],
    run(t, p) {
      const rows = rowsOf(t, p);
      const xs = (p.xs || []).filter((k) => k !== p.y);
      const pr = pairs(t, rows, [p.y, ...xs]);
      const lev = levelsOf(t, p.y).filter((l) => pr.some((r) => String(r[0]) === l));
      if (lev.length !== 2) return { title: 'Logística', blocks: [W(`El resultado tiene ${lev.length} categorías con datos; hacen falta exactamente dos (filtrá o recodificá).`)] };
      const ev = p.event && lev.includes(p.event) ? p.event : lev[1];
      const names = [], enc = [];
      xs.forEach((k, j) => {
        const c = getCol(t, k);
        if (isNum(c)) { names.push(c.name); enc.push((r) => [r[j + 1]]); }
        else { const L = levelsOf(t, k).filter((l) => pr.some((r) => String(r[j + 1]) === l)); L.slice(1).forEach((l) => names.push(`${c.name}: ${l}`)); enc.push((r) => L.slice(1).map((l) => (String(r[j + 1]) === l ? 1 : 0))); }
      });
      if (!names.length) return { title: 'Logística', blocks: [W('Elegí al menos un predictor.')] };
      const fit = S.logistic(pr.map((r) => enc.flatMap((f) => f(r))), pr.map((r) => (String(r[0]) === ev ? 1 : 0)), names);
      if (fit.error) return { title: 'Logística', blocks: [W(fit.error)] };
      const out = [T(`Tabla. Regresión logística: probabilidad de «${ev}»`, ['Predictor', 'B', 'EE', 'z', 'p', 'OR', 'IC 95 % de OR'], fit.coefs.map((c) => [c.name, num(c.b, 3), num(c.se, 3), num(c.z), pcell(c.p), num(c.or, 3), ci(c.orLow, c.orHigh, 3)]), `n = ${fit.n}. χ² del modelo (razón de verosimilitudes) = ${num(fit.LR)}, gl = ${fit.dfLR}, ${pval(fit.pLR)}. R² de McFadden = ${num1(fit.mcfadden, 3)}; R² de Nagelkerke = ${num1(fit.nagelkerke, 3)}. Clasificación con punto de corte 0,5: ${num(fit.accuracy * 100, 1)} % correcta (sensibilidad ${num(fit.sensitivity * 100, 1)} %, especificidad ${num(fit.specificity * 100, 1)} %). OR de un predictor numérico: cambio por cada unidad.`)];
      if (!fit.converged) out.push(W('El ajuste no convergió: puede haber separación completa (un predictor anticipa perfectamente el resultado).'));
      const sig = fit.coefs.slice(1).filter((c) => c.p < 0.05);
      out.push(APA(`El modelo logístico ${fit.pLR < 0.05 ? 'fue significativo' : 'no fue significativo'}, χ²(${fit.dfLR}) = ${num(fit.LR)}, ${pval(fit.pLR)}, R² de Nagelkerke = ${num1(fit.nagelkerke)}.${sig.length ? ' ' + sig.map((c) => `${c.name} se asoció con odds ${c.or > 1 ? 'mayores' : 'menores'} de «${ev}» (OR = ${num(c.or)}, IC 95 % ${ci(c.orLow, c.orHigh)})`).join('; ') + '.' : ''}`));
      out.push(Q(['Una razón de odds no es una razón de probabilidades: cuando el evento es frecuente, la OR exagera el cambio de riesgo.', `¿Hay suficientes eventos? Regla práctica: al menos 10 casos de «${ev}» por predictor (hay ${pr.filter((r) => String(r[0]) === ev).length} eventos y ${names.length} predictores).`]));
      return { title: 'Regresión logística', blocks: out, chart: { type: 'coef', enc: { y: p.y, xs }, options: { logistic: true, event: ev } } };
    },
  },
  {
    id: 'pca', group: 'Modelar', name: 'Componentes principales',
    desc: 'Resume varias variables numéricas en pocos ejes: autovalores, varianza explicada, cargas, KMO y esfericidad de Bartlett.',
    params: [{ key: 'vars', label: 'Variables numéricas (3 o más)', kind: 'numMulti' }, { key: 'label', label: 'Rótulo de los casos (opcional)', kind: 'any', optional: true }],
    run(t, p) {
      const rows = rowsOf(t, p);
      const vs = p.vars || [];
      const pr = pairs(t, rows, vs);
      if (vs.length < 2 || pr.length < vs.length + 2) return { title: 'Componentes principales', blocks: [W('Elegí al menos dos variables y más casos completos que variables.')] };
      const r = S.pca(vs.map((_, j) => pr.map((q) => q[j])), vs.map((v) => nameOf(t, v)));
      const kKeep = Math.max(1, r.values.filter((v) => v >= 1).length);
      const out = [T('Tabla. Autovalores y varianza explicada', ['Componente', 'Autovalor', '% de varianza', '% acumulado'], r.values.map((v, i) => [`CP${i + 1}`, num(v, 3), num(r.share[i] * 100, 1), num(r.cum[i] * 100, 1)]), `Matriz de correlaciones (variables estandarizadas). Criterio de Kaiser: ${kKeep} componente${kKeep > 1 ? 's' : ''} con autovalor ≥ 1.`)];
      out.push(T('Tabla. Cargas (correlación de cada variable con cada componente)', ['Variable', ...r.values.slice(0, Math.min(4, vs.length)).map((_, i) => `CP${i + 1}`)], vs.map((v, j) => [nameOf(t, v), ...r.loadings.slice(0, Math.min(4, vs.length)).map((L) => { const x = L[j]; return `${num1(x)}${Math.abs(x) >= 0.6 ? ' ●' : ''}`; })]), '● carga de 0,60 o más en valor absoluto.'));
      out.push(P(`KMO = ${r.kmo != null ? num1(r.kmo, 3) : '—'} (${r.kmo == null ? 'no calculable' : r.kmo >= 0.8 ? 'meritorio' : r.kmo >= 0.7 ? 'aceptable' : r.kmo >= 0.6 ? 'mediocre' : 'insuficiente'}); esfericidad de Bartlett χ²(${r.bartlett.df}) = ${num(r.bartlett.chi2)}, ${pval(r.bartlett.p)}.`));
      out.push(Q(['Los componentes son construcciones estadísticas: ¿el nombre que les ponés surge de las cargas o de lo que esperabas encontrar?', '¿Las variables tienen el mismo sentido (más = mejor) o hay que invertir alguna antes de interpretar?']));
      return { title: 'Componentes principales', blocks: out, chart: { type: 'biplot', enc: { vars: vs, label: p.label || null }, options: {} } };
    },
  },
  {
    id: 'kmeans', group: 'Modelar', name: 'Conglomerados (k medias)',
    desc: 'Agrupa los casos por semejanza en varias variables numéricas estandarizadas; informa tamaños, centros y la proporción de variabilidad entre grupos.',
    params: [{ key: 'vars', label: 'Variables numéricas', kind: 'numMulti' }, { key: 'k', label: 'Cantidad de grupos', kind: 'number', def: 3 }],
    run(t, p) {
      const rows = rowsOf(t, p);
      const vs = p.vars || [];
      const pr = pairs(t, rows, vs);
      const k = Math.max(2, Math.min(12, Math.round(+p.k || 3)));
      if (vs.length < 1 || pr.length < k * 2) return { title: 'Conglomerados', blocks: [W('Hacen falta más casos completos.')] };
      const ms = vs.map((_, j) => S.mean(pr.map((q) => q[j]))), ss = vs.map((_, j) => S.sd(pr.map((q) => q[j])));
      const Z = pr.map((q) => q.map((v, j) => (v - ms[j]) / ss[j]));
      const res = S.kmeans(Z, k);
      const elbow = [];
      for (let kk = 1; kk <= Math.min(8, pr.length - 1); kk++) elbow.push(kk === 1 ? 0 : S.kmeans(Z, kk).betweenShare);
      const out = [T('Tabla. Centros de los conglomerados (en unidades originales)', ['Grupo', 'n', ...vs.map((v) => nameOf(t, v))], res.centers.map((c, j) => [`G${j + 1}`, String(res.sizes[j]), ...c.map((z, q) => num(z * ss[q] + ms[q]))]), `Variables estandarizadas antes de agrupar. Variabilidad entre grupos: ${num(res.betweenShare * 100, 1)} % del total. Con 1 a ${elbow.length} grupos: ${elbow.map((e) => num(e * 100, 0) + ' %').join(' · ')} (buscar el «codo»).`)];
      out.push(Q(['k medias siempre encuentra k grupos, existan o no: ¿los grupos tienen sentido fuera de la estadística?', '¿Cambian mucho los grupos si se quita una variable o se cambia k? Si cambian, la tipología es frágil.']));
      return { title: 'Conglomerados', blocks: out, chart: vs.length >= 2 ? { type: 'scatter', enc: { x: vs[0], y: vs[1] }, options: {} } : null, clusters: { assign: res.assign, rowsUsed: pr.length } };
    },
  },
  {
    id: 'growth', group: 'Series', name: 'Crecimiento entre períodos (censos, series)',
    desc: 'Variación absoluta y relativa, tasa media anual geométrica y tasa de crecimiento exponencial por mil (la que usa INDEC entre censos).',
    params: [{ key: 'time', label: 'Tiempo (año o fecha)', kind: 'any' }, { key: 'v', label: 'Valor', kind: 'num' }, { key: 'g', label: 'Serie (opcional)', kind: 'cat', optional: true }],
    run(t, p) {
      const rows = rowsOf(t, p);
      const tj = colIndex(t, p.time), vj = colIndex(t, p.v), gj = p.g ? colIndex(t, p.g) : -1;
      const tc = getCol(t, p.time);
      const tnum = (x) => (tc.type === 'date' ? +String(x).slice(0, 4) + (+String(x).slice(5, 7) - 1) / 12 : +x);
      const series = gj >= 0 ? levelsOf(t, p.g) : ['Total'];
      const body = [];
      for (const s of series) {
        const pts = rows.filter((r) => (gj < 0 || String(r[gj]) === s) && r[tj] != null && r[vj] != null).map((r) => [tnum(r[tj]), r[vj], r[tj]]).sort((a, b) => a[0] - b[0]);
        const gr = S.growth(pts.map((q) => q[0]), pts.map((q) => q[1]));
        gr.forEach((g, i) => body.push([s, `${pts[i][2]}–${pts[i + 1][2]}`, num(pts[i][1], 0), num(pts[i + 1][1], 0), num(g.abs, 0), g.pct != null ? num(g.pct, 1) : '—', g.annualGeom != null ? num(g.annualGeom, 2) : '—', g.expPerMil != null ? num(g.expPerMil, 1) : '—']));
      }
      return { title: 'Crecimiento', blocks: [
        T(`Tabla. Variación de ${nameOf(t, p.v)}`, ['Serie', 'Período', 'Inicial', 'Final', 'Variación absoluta', 'Variación %', 'Tasa media anual (%)', 'Tasa exponencial (‰ anual)'], body, 'Tasa media anual geométrica: (Pf/Pi)^(1/t) − 1. Tasa de crecimiento exponencial: ln(Pf/Pi)/t × 1000 (convención de INDEC para períodos intercensales).'),
        Q(['¿Los límites de las unidades fueron los mismos en todos los períodos? Un cambio de jurisdicción o de definición de «urbano» crea crecimientos que no existieron.', '¿Los relevamientos tienen la misma cobertura y la misma fecha de referencia?']),
      ], chart: { type: 'line', enc: { x: p.time, y: p.v, color: p.g || null }, options: { points: true } } };
    },
  },
];
export const getAnalysis = (id) => ANALYSES.find((a) => a.id === id);

// ---------- asistente: qué prueba usar ----------
export function suggestAnalysis(table, keys) {
  const cols = keys.map((k) => getCol(table, k)).filter(Boolean);
  const nums = cols.filter(isNum), cats = cols.filter(isCat);
  if (nums.length === 1 && !cats.length) return { id: 'desc', params: { vars: [nums[0].key] }, why: 'Una variable numérica: describirla (centro, dispersión, forma).' };
  if (cats.length === 1 && !nums.length) return { id: 'freq', params: { v: cats[0].key }, why: 'Una variable categórica: tabla de frecuencias.' };
  if (cats.length === 2 && !nums.length) return { id: 'crosstab', params: { row: cats[0].key, col: cats[1].key }, why: 'Dos categóricas: tabla de contingencia y χ².' };
  if (nums.length === 1 && cats.length === 1) {
    const L = levelsOf(table, cats[0].key).length;
    return L === 2 ? { id: 'compare2', params: { y: nums[0].key, g: cats[0].key }, why: 'Numérica según dos grupos: t de Welch o Mann–Whitney.' } : { id: 'compareK', params: { y: nums[0].key, g: cats[0].key }, why: `Numérica según ${L} grupos: ANOVA o Kruskal–Wallis.` };
  }
  if (nums.length === 1 && cats.length === 2) return { id: 'anova2', params: { y: nums[0].key, a: cats[0].key, b: cats[1].key }, why: 'Numérica según dos factores: ANOVA factorial.' };
  if (nums.length === 2 && !cats.length) return { id: 'corr', params: { vars: nums.map((c) => c.key), method: 'pearson' }, why: 'Dos numéricas: correlación y dispersión.' };
  if (nums.length > 2) return { id: 'corr', params: { vars: nums.map((c) => c.key), method: 'pearson' }, why: 'Varias numéricas: matriz de correlaciones (o componentes principales).' };
  return { id: 'desc', params: { vars: nums.map((c) => c.key) }, why: 'Empezar por describir.' };
}
