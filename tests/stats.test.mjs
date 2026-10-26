// Verifica el motor estadístico contra SciPy y statsmodels (tests/ref.json, generado con tests/ref.py)
import { readFileSync } from 'node:fs';
import * as S from '../src/stats/engine.js';
import { ptukey, qtukey } from '../src/stats/dist.js';
const R = JSON.parse(readFileSync(new URL('./ref.json', import.meta.url)));
let d = JSON.parse(readFileSync(new URL('../node_modules/vega-datasets/data/penguins.json', import.meta.url)));
d = d.filter((r) => Object.values(r).every((v) => v != null) && ['MALE', 'FEMALE'].includes(r.Sex));
const col = (k, f = () => true) => d.filter(f).map((r) => r[k]);
const BL = 'Beak Length (mm)', BD = 'Beak Depth (mm)', FL = 'Flipper Length (mm)', BM = 'Body Mass (g)';
const a = col(BL, (r) => r.Species === 'Adelie'), c = col(BL, (r) => r.Species === 'Chinstrap'), g = col(BL, (r) => r.Species === 'Gentoo');
let fails = 0, n = 0;
const eq = (name, got, exp, tol = 1e-6) => {
  n++;
  const rel = Math.abs(got - exp) / Math.max(1e-12, Math.abs(exp));
  const ok = Math.abs(got - exp) < tol || rel < tol;
  if (!ok) { fails++; console.log('✗', name, got, 'esperado', exp); }
};
let r = S.shapiroWilk(a); eq('SW W', r.W, R.sw[0], 1e-5); eq('SW p', r.p, R.sw[1], 1e-4);
r = S.shapiroWilk([2.1, 3.4, 1.9, 5.6, 4.4, 3.3, 2.8, 6.1, 3.9, 4.0]); eq('SW10 W', r.W, R.sw_small[0], 1e-5); eq('SW10 p', r.p, R.sw_small[1], 1e-4);
r = S.tTestIndependent(a, c); eq('welch t', r.t, R.welch[0]); eq('welch p', r.p, R.welch[1]);
r = S.tTestIndependent(a, c, { welch: false }); eq('student t', r.t, R.student[0]); eq('student p', r.p, R.student[1]);
r = S.mannWhitney(a, c); eq('MW U', r.U, R.mw[0]); eq('MW p', r.p, R.mw[1], 1e-5);
r = S.mannWhitney([1.1, 2.3, 3.5, 4.2, 5.9], [2.2, 6.1, 7.4, 8.8, 9.3, 3.1]); eq('MW exacto U', r.U, R.mw_exact[0]); eq('MW exacto p', r.p, R.mw_exact[1]);
r = S.wilcoxonSigned(col(BL).slice(0, 30), col(BD).slice(0, 30).map((v) => v * 2.3)); eq('Wilcoxon p', r.p, R.wil[1], 1e-5); eq('Wilcoxon V/min', Math.min(r.V, 465 - r.V), R.wil[0]);
r = S.kruskalWallis([a, c, g]); eq('KW H', r.H, R.kw[0]); eq('KW p', r.p, R.kw[1], 1e-4);
r = S.anovaOneWay([a, c, g]); eq('ANOVA F', r.F, R.anova[0]); eq('ANOVA p', r.p, R.anova[1], 1e-4);
r = S.levene([a, c, g]); eq('Levene F', r.F, R.lev[0]); eq('Levene p', r.p, R.lev[1]);
r = S.tukeyHSD([a, c, g], ['A', 'C', 'G']);
// orden de statsmodels: A-C, A-G, C-G con diff = segundo − primero
const order = [[0], [1], [2]];
r.forEach((x, i) => { eq(`Tukey diff ${i}`, x.diff, R.tukey[i][0]); eq(`Tukey p ${i}`, Math.max(x.pAdj, 0.001), Math.max(R.tukey[i][1], 0.001), 2e-3); eq(`Tukey lo ${i}`, x.ciLow, R.tukey[i][2], 1e-3); });
r = S.pearson(col(BL), col(FL)); eq('Pearson r', r.r, R.pear[0]); eq('Pearson p', r.p + 1e-300, R.pear[1] + 1e-300, 1e-3);
r = S.spearman(col(BL), col(FL)); eq('Spearman', r.rho, R.spear[0]);
r = S.kendall(col(BL), col(FL)); eq('Kendall tau', r.tau, R.kend[0]); eq('Kendall p', r.p + 1e-300, R.kend[1] + 1e-300, 1e-2);
const sp = ['Adelie', 'Chinstrap', 'Gentoo'], isl = ['Biscoe', 'Dream', 'Torgersen'];
const ct = sp.map((s) => isl.map((i) => d.filter((x) => x.Species === s && x.Island === i).length));
r = S.chiSquareIndependence(ct); eq('chi2', r.chi2, R.chi[0]); eq('chi2 p', r.p + 1e-300, R.chi[1] + 1e-300, 1e-3);
r = S.fisherExact2x2([[8, 2], [1, 5]]); eq('Fisher p', r.p, R.fisher[1]);
const X = d.map((x) => [x[FL], x[BL], x.Sex === 'MALE' ? 1 : 0]);
r = S.ols(X, col(BM), ['fl', 'bl', 'male']);
// statsmodels ordena: Intercept, C(sex)[T.MALE], fl, bl
const mapIdx = [0, 3, 1, 2];
mapIdx.forEach((j, i) => { eq(`OLS b${i}`, r.coefs[j].b, R.ols.b[i]); eq(`OLS se${i}`, r.coefs[j].se, R.ols.se[i]); });
eq('OLS R2', r.r2, R.ols.r2); eq('OLS F', r.F, R.ols.f); eq('OLS AIC (convención de R: σ cuenta como parámetro)', r.aic, R.ols.aic + 2, 1e-4); eq('DW', r.dw, R.ols.dw);
r = S.logistic(d.map((x) => [x[BM], x[BD]]), d.map((x) => (x.Sex === 'MALE' ? 1 : 0)), ['bm', 'bd']);
r.coefs.forEach((cf, i) => { eq(`logit b${i}`, cf.b, R.logit.b[i], 1e-5); eq(`logit se${i}`, cf.se, R.logit.se[i], 1e-4); });
eq('logit llf', r.ll, R.logit.llf); eq('McFadden', r.mcfadden, R.logit.pr2);
r = S.anovaFactorial(col(BM), [{ name: 'sp', values: col('Species'), levels: sp }, { name: 'sex', values: col('Sex'), levels: ['FEMALE', 'MALE'] }]);
// statsmodels typ=3: Intercept, sp, sex, sp:sex, Residual
[1, 2, 3].forEach((k, i) => { eq(`ANOVA2 SS ${i}`, r.rows[i].ss, R.anova2[0][k], 1e-5); eq(`ANOVA2 F ${i}`, r.rows[i].F, R.anova2[1][k], 1e-5); });
eq('ANOVA2 SSres', r.rows[3].ss, R.anova2[0][4], 1e-6);
const ds = S.describe(a); eq('asimetría', ds.skew, R.skew[0]); eq('curtosis', ds.kurt, R.skew[1]);
r = S.friedman([col(BL).slice(0, 20), col(BD).slice(0, 20).map((v) => v * 2.2), col(FL).slice(0, 20).map((v) => v / 4.6)]); eq('Friedman', r.chi2, R.fried[0]); eq('Friedman p', r.p, R.fried[1], 1e-4);
eq('ptukey 1', ptukey(3.5, 3, 20), R.ptukey[0], 1e-6); eq('ptukey 2', ptukey(2.1, 5, 60), R.ptukey[1], 1e-6); eq('qtukey', qtukey(0.95, 4, 30), R.ptukey[2], 1e-5);
console.log(fails ? `${fails} de ${n} comprobaciones fallaron` : `Las ${n} comprobaciones coinciden con SciPy y statsmodels`);
process.exit(fails ? 1 : 0);
