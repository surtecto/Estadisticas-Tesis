// Motor estadístico: funciones puras sobre vectores numéricos y grupos.
// Los resultados se verificaron contra R / SciPy / statsmodels (tests/stats.test.mjs).
import { pnorm, qnorm, qt, p2t, pFupper, pChiUpper, p2z, ptukey, qtukey, adjustP, jStat } from './dist.js';

const sum = (a) => { let s = 0; for (const v of a) s += v; return s; };
export const mean = (a) => (a.length ? sum(a) / a.length : NaN);
export function variance(a) { const n = a.length; if (n < 2) return NaN; const m = mean(a); let s = 0; for (const v of a) s += (v - m) ** 2; return s / (n - 1); }
export const sd = (a) => Math.sqrt(variance(a));
const sorted = (a) => a.slice().sort((x, y) => x - y);
// cuantil tipo 7 (R, Excel INC); tipo 6 (SPSS, Minitab)
export function quantile(a, p, type = 7) {
  const s = sorted(a), n = s.length;
  if (!n) return NaN;
  if (type === 6) {
    const h = (n + 1) * p;
    if (h <= 1) return s[0];
    if (h >= n) return s[n - 1];
    const lo = Math.floor(h);
    return s[lo - 1] + (h - lo) * (s[lo] - s[lo - 1]);
  }
  const h = (n - 1) * p, lo = Math.floor(h), hi = Math.ceil(h);
  return s[lo] + (h - lo) * (s[hi] - s[lo]);
}
export const median = (a) => quantile(a, 0.5);
export function ranks(a) {
  const idx = a.map((v, i) => [v, i]).sort((x, y) => x[0] - y[0]);
  const r = new Array(a.length);
  const ties = [];
  for (let i = 0; i < idx.length;) {
    let j = i;
    while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++;
    const rk = (i + j + 2) / 2;
    for (let k = i; k <= j; k++) r[idx[k][1]] = rk;
    if (j > i) ties.push(j - i + 1);
    i = j + 1;
  }
  return { r, ties };
}
const tieSum = (ties) => sum(ties.map((t) => t ** 3 - t));

// ---------- descriptivos ----------
export function describe(x, { quantileType = 7, conf = 0.95 } = {}) {
  const v = x.filter((d) => d != null && Number.isFinite(d));
  const n = v.length;
  const out = { n, missing: x.length - n };
  if (!n) return out;
  const s = sorted(v);
  const m = mean(v);
  const sdv = n > 1 ? sd(v) : NaN;
  out.mean = m; out.sd = sdv; out.var = sdv * sdv; out.se = sdv / Math.sqrt(n);
  const tcrit = n > 1 ? qt(1 - (1 - conf) / 2, n - 1) : NaN;
  out.ciLow = m - tcrit * out.se; out.ciHigh = m + tcrit * out.se; out.conf = conf;
  out.min = s[0]; out.max = s[n - 1]; out.range = s[n - 1] - s[0];
  out.q1 = quantile(s, 0.25, quantileType); out.median = quantile(s, 0.5, quantileType); out.q3 = quantile(s, 0.75, quantileType);
  out.iqr = out.q3 - out.q1;
  out.cv = m !== 0 ? sdv / Math.abs(m) : NaN;
  out.sum = sum(v);
  // asimetría y curtosis con el ajuste de SPSS y Excel (G1, G2) y sus errores estándar
  if (n > 2) {
    let m2 = 0, m3 = 0, m4 = 0;
    for (const d of v) { const e = d - m; m2 += e * e; m3 += e ** 3; m4 += e ** 4; }
    m2 /= n; m3 /= n; m4 /= n;
    const g1 = m3 / m2 ** 1.5;
    out.skew = (Math.sqrt(n * (n - 1)) / (n - 2)) * g1;
    out.seSkew = Math.sqrt((6 * n * (n - 1)) / ((n - 2) * (n + 1) * (n + 3)));
    if (n > 3) {
      const g2 = m4 / (m2 * m2) - 3;
      out.kurt = ((n - 1) / ((n - 2) * (n - 3))) * ((n + 1) * g2 + 6);
      out.seKurt = 2 * out.seSkew * Math.sqrt((n * n - 1) / ((n - 3) * (n + 5)));
    }
  }
  const k = Math.floor(n * 0.05);
  out.trimmed = mean(s.slice(k, n - k));
  out.mad = 1.4826 * median(v.map((d) => Math.abs(d - out.median)));
  const counts = new Map();
  for (const d of v) counts.set(d, (counts.get(d) || 0) + 1);
  const maxc = Math.max(...counts.values());
  out.mode = maxc > 1 ? [...counts.entries()].filter((e) => e[1] === maxc).map((e) => e[0]).sort((a, b) => a - b) : [];
  // atípicos por las vallas de Tukey
  const lo = out.q1 - 1.5 * out.iqr, hi = out.q3 + 1.5 * out.iqr;
  out.fenceLow = lo; out.fenceHigh = hi;
  out.outliers = s.filter((d) => d < lo || d > hi);
  out.whiskerLow = s.find((d) => d >= lo); out.whiskerHigh = [...s].reverse().find((d) => d <= hi);
  return out;
}

// ---------- normalidad: Shapiro–Wilk (Royston 1995, como swilk.c de R) ----------
function poly(cc, nord, x) {
  let ret = cc[0];
  if (nord > 1) { let p = x * cc[nord - 1]; for (let j = nord - 2; j > 0; j--) p = (p + cc[j]) * x; ret += p; }
  return ret;
}
export function shapiroWilk(x0) {
  const x = sorted(x0.filter(Number.isFinite));
  const n = x.length;
  if (n < 3) return { W: NaN, p: NaN, n, error: 'Hacen falta al menos 3 casos.' };
  if (n > 5000) return { W: NaN, p: NaN, n, error: 'Shapiro–Wilk admite hasta 5000 casos.' };
  const nn2 = Math.floor(n / 2);
  const a = new Array(nn2 + 1).fill(0);
  const small = 1e-19;
  const g = [-2.273, 0.459];
  const c1 = [0, 0.221157, -0.147981, -2.07119, 4.434685, -2.706056];
  const c2 = [0, 0.042981, -0.293762, -1.752461, 5.682633, -3.582633];
  const c3 = [0.544, -0.39978, 0.025054, -6.714e-4];
  const c4 = [1.3822, -0.77857, 0.062767, -0.0020322];
  const c5 = [-1.5861, -0.31082, -0.083751, 0.0038915];
  const c6 = [-0.4803, -0.082676, 0.0030302];
  const an = n;
  if (n === 3) a[1] = Math.SQRT1_2;
  else {
    const an25 = an + 0.25;
    let summ2 = 0;
    for (let i = 1; i <= nn2; i++) { a[i] = qnorm((i - 0.375) / an25); summ2 += a[i] * a[i]; }
    summ2 *= 2;
    const ssumm2 = Math.sqrt(summ2), rsn = 1 / Math.sqrt(an);
    const a1 = poly(c1, 6, rsn) - a[1] / ssumm2;
    let i1, fac;
    if (n > 5) {
      i1 = 3;
      const a2 = -a[2] / ssumm2 + poly(c2, 6, rsn);
      fac = Math.sqrt((summ2 - 2 * a[1] * a[1] - 2 * a[2] * a[2]) / (1 - 2 * a1 * a1 - 2 * a2 * a2));
      a[2] = a2;
    } else {
      i1 = 2;
      fac = Math.sqrt((summ2 - 2 * a[1] * a[1]) / (1 - 2 * a1 * a1));
    }
    a[1] = a1;
    for (let i = i1; i <= nn2; i++) a[i] /= -fac;
  }
  const range = x[n - 1] - x[0];
  if (range < small) return { W: NaN, p: NaN, n, error: 'Todos los valores son iguales.' };
  let xx = x[0] / range, sx = xx, sa = -a[1];
  for (let i = 1, j = n - 1; i < n; j--) {
    const xi = x[i] / range;
    sx += xi; i++;
    if (i !== j) sa += Math.sign(i - j) * a[Math.min(i, j)];
    xx = xi;
  }
  sa /= n; sx /= n;
  let ssa = 0, ssx = 0, sax = 0;
  for (let i = 0, j = n - 1; i < n; i++, j--) {
    const asa = i !== j ? Math.sign(i - j) * a[1 + Math.min(i, j)] - sa : -sa;
    const xsx = x[i] / range - sx;
    ssa += asa * asa; ssx += xsx * xsx; sax += asa * xsx;
  }
  const ssassx = Math.sqrt(ssa * ssx);
  const w1 = ((ssassx - sax) * (ssassx + sax)) / (ssa * ssx);
  const W = 1 - w1;
  if (n === 3) {
    const pw = Math.max(0, 1.90985931710274 * (Math.asin(Math.sqrt(W)) - 1.0471975511966));
    return { W, p: pw, n };
  }
  let y = Math.log(w1);
  const lx = Math.log(an);
  let m, s;
  if (n <= 11) {
    const gamma = poly(g, 2, an);
    if (y >= gamma) return { W, p: 1e-99, n };
    y = -Math.log(gamma - y);
    m = poly(c3, 4, an); s = Math.exp(poly(c4, 4, an));
  } else {
    m = poly(c5, 4, lx); s = Math.exp(poly(c6, 3, lx));
  }
  return { W, p: 1 - pnorm((y - m) / s), n };
}

// ---------- homogeneidad de varianzas: Levene (centro en la mediana = Brown–Forsythe, como car::leveneTest) ----------
export function levene(groups, center = 'median') {
  const z = groups.map((g) => { const c = center === 'mean' ? mean(g) : median(g); return g.map((v) => Math.abs(v - c)); });
  const r = anovaOneWay(z);
  return { F: r.F, df1: r.dfB, df2: r.dfW, p: r.p, center };
}

// ---------- pruebas t ----------
export function tTestOneSample(x, mu = 0, conf = 0.95) {
  const n = x.length, m = mean(x), s = sd(x), se = s / Math.sqrt(n), df = n - 1;
  const t = (m - mu) / se;
  const tc = qt(1 - (1 - conf) / 2, df);
  return { t, df, p: p2t(t, df), mean: m, mu, diff: m - mu, ciLow: m - mu - tc * se, ciHigh: m - mu + tc * se, d: (m - mu) / s, n };
}
export function tTestIndependent(a, b, { welch = true, conf = 0.95 } = {}) {
  const n1 = a.length, n2 = b.length, m1 = mean(a), m2 = mean(b), v1 = variance(a), v2 = variance(b);
  let se, df;
  if (welch) {
    se = Math.sqrt(v1 / n1 + v2 / n2);
    df = (v1 / n1 + v2 / n2) ** 2 / ((v1 / n1) ** 2 / (n1 - 1) + (v2 / n2) ** 2 / (n2 - 1));
  } else {
    const sp2 = ((n1 - 1) * v1 + (n2 - 1) * v2) / (n1 + n2 - 2);
    se = Math.sqrt(sp2 * (1 / n1 + 1 / n2)); df = n1 + n2 - 2;
  }
  const t = (m1 - m2) / se;
  const tc = qt(1 - (1 - conf) / 2, df);
  const sp = Math.sqrt(((n1 - 1) * v1 + (n2 - 1) * v2) / (n1 + n2 - 2));
  const d = (m1 - m2) / sp;
  const J = 1 - 3 / (4 * (n1 + n2) - 9);
  const seD = Math.sqrt((n1 + n2) / (n1 * n2) + (d * d) / (2 * (n1 + n2)));
  const z = qnorm(1 - (1 - conf) / 2);
  return { t, df, p: p2t(t, df), diff: m1 - m2, ciLow: m1 - m2 - tc * se, ciHigh: m1 - m2 + tc * se, se, welch, m1, m2, sd1: Math.sqrt(v1), sd2: Math.sqrt(v2), n1, n2, d, g: d * J, dCiLow: d - z * seD, dCiHigh: d + z * seD };
}
export function tTestPaired(a, b, conf = 0.95) {
  const d = a.map((v, i) => v - b[i]);
  const r = tTestOneSample(d, 0, conf);
  return { ...r, dz: mean(d) / sd(d), m1: mean(a), m2: mean(b), sdDiff: sd(d) };
}

// ---------- no paramétricas ----------
function exactMWcdf(n1, n2) {
  // f[u] = cantidad de arreglos con estadístico U = u (recursión de Mann y Whitney)
  const memo = new Map();
  const cnt = (u, m, n) => {
    if (u < 0) return 0;
    if (m === 0 || n === 0) return u === 0 ? 1 : 0;
    const k = `${u},${m},${n}`;
    if (memo.has(k)) return memo.get(k);
    const v = cnt(u - n, m - 1, n) + cnt(u, m, n - 1);
    memo.set(k, v);
    return v;
  };
  const max = n1 * n2;
  const f = []; for (let u = 0; u <= max; u++) f.push(cnt(u, n1, n2));
  const tot = sum(f);
  return f.map((c) => c / tot);
}
export function mannWhitney(a, b, { exact = 'auto', correct = true } = {}) {
  const n1 = a.length, n2 = b.length, N = n1 + n2;
  const { r, ties } = ranks([...a, ...b]);
  const R1 = sum(r.slice(0, n1));
  const U1 = R1 - (n1 * (n1 + 1)) / 2;
  const U2 = n1 * n2 - U1;
  const useExact = exact === true || (exact === 'auto' && n1 < 50 && n2 < 50 && !ties.length && n1 * n2 <= 2500);
  let p, z = NaN, method;
  const mu = (n1 * n2) / 2;
  const sigma = Math.sqrt(((n1 * n2) / 12) * (N + 1 - tieSum(ties) / (N * (N - 1))));
  if (useExact) {
    const f = exactMWcdf(n1, n2);
    const q = Math.round(U1);
    const pl = sum(f.slice(0, q + 1)), pu = sum(f.slice(q));
    p = Math.min(1, 2 * Math.min(pl, pu));
    method = 'exacto';
    z = (U1 - mu) / sigma;
  } else {
    const c = correct ? 0.5 * Math.sign(U1 - mu) : 0;
    z = (U1 - mu - c) / sigma;
    p = p2z(z);
    method = correct ? 'aproximación normal con corrección por continuidad' : 'aproximación normal';
  }
  const rbs = 1 - (2 * Math.min(U1, U2)) / (n1 * n2); // correlación biserial por rangos (valor absoluto)
  return { U: U1, U1, U2, W: U1, z, p, method, n1, n2, r: Math.abs(z) / Math.sqrt(N), rankBiserial: (U1 > U2 ? 1 : -1) * rbs, md1: median(a), md2: median(b), ties: ties.length > 0 };
}
export function wilcoxonSigned(a, b = null, { mu = 0, correct = true } = {}) {
  let d = b ? a.map((v, i) => v - b[i]) : a.map((v) => v - mu);
  const zeros = d.filter((v) => v === 0).length;
  d = d.filter((v) => v !== 0);
  const n = d.length;
  const { r, ties } = ranks(d.map(Math.abs));
  const V = sum(r.filter((_, i) => d[i] > 0));
  const mu0 = (n * (n + 1)) / 4;
  const sigma = Math.sqrt((n * (n + 1) * (2 * n + 1)) / 24 - tieSum(ties) / 48);
  let p, z, method;
  if (n < 50 && !ties.length && !zeros) {
    // distribución exacta de V
    const max = (n * (n + 1)) / 2;
    let f = new Array(max + 1).fill(0); f[0] = 1;
    for (let k = 1; k <= n; k++) { const g = f.slice(); for (let s = k; s <= max; s++) g[s] += f[s - k]; f = g; }
    const tot = 2 ** n;
    const q = Math.round(V);
    const pl = sum(f.slice(0, q + 1)) / tot, pu = sum(f.slice(q)) / tot;
    p = Math.min(1, 2 * Math.min(pl, pu)); method = 'exacto';
    z = (V - mu0) / sigma;
  } else {
    const c = correct ? 0.5 * Math.sign(V - mu0) : 0;
    z = (V - mu0 - c) / sigma; p = p2z(z); method = 'aproximación normal';
  }
  const rbc = (2 * V) / ((n * (n + 1)) / 2) - 1; // correlación biserial por rangos de pares
  return { V, z, p, n, zeros, method, r: Math.abs(z) / Math.sqrt(n + zeros), rankBiserial: rbc };
}
export function kruskalWallis(groups) {
  const all = groups.flat();
  const N = all.length, k = groups.length;
  const { r, ties } = ranks(all);
  let off = 0, H0 = 0;
  const meanRanks = [];
  for (const g of groups) { const R = sum(r.slice(off, off + g.length)); meanRanks.push(R / g.length); H0 += (R * R) / g.length; off += g.length; }
  H0 = (12 / (N * (N + 1))) * H0 - 3 * (N + 1);
  const C = 1 - tieSum(ties) / (N ** 3 - N);
  const H = H0 / C;
  const df = k - 1;
  return { H, df, p: pChiUpper(H, df), N, k, meanRanks, epsilon2: H / (N - 1), etaH2: (H - k + 1) / (N - k), tieC: C, ties: tieSum(ties) };
}
export function dunn(groups, labels, method = 'holm') {
  const kw = kruskalWallis(groups);
  const N = kw.N;
  const A = (N * (N + 1)) / 12 - kw.ties / (12 * (N - 1));
  const out = [];
  for (let i = 0; i < groups.length; i++) for (let j = i + 1; j < groups.length; j++) {
    const z = (kw.meanRanks[i] - kw.meanRanks[j]) / Math.sqrt(A * (1 / groups[i].length + 1 / groups[j].length));
    out.push({ a: labels[i], b: labels[j], z, p: p2z(z) });
  }
  const adj = adjustP(out.map((o) => o.p), method);
  out.forEach((o, i) => { o.pAdj = adj[i]; });
  return out;
}
export function friedman(cols) {
  // cols: k vectores de igual largo (mismos sujetos)
  const k = cols.length, n = cols[0].length;
  const R = new Array(k).fill(0);
  let tcorr = 0;
  for (let i = 0; i < n; i++) {
    const { r, ties } = ranks(cols.map((c) => c[i]));
    r.forEach((v, j) => { R[j] += v; });
    tcorr += tieSum(ties);
  }
  const chi = ((12 / (n * k * (k + 1))) * sum(R.map((x) => x * x)) - 3 * n * (k + 1)) / (1 - tcorr / (n * (k ** 3 - k)));
  return { chi2: chi, df: k - 1, p: pChiUpper(chi, k - 1), n, k, meanRanks: R.map((x) => x / n), W: chi / (n * (k - 1)) };
}

// ---------- ANOVA ----------
export function anovaOneWay(groups) {
  const all = groups.flat();
  const N = all.length, k = groups.length, gm = mean(all);
  let ssb = 0, ssw = 0;
  for (const g of groups) { const m = mean(g); ssb += g.length * (m - gm) ** 2; for (const v of g) ssw += (v - m) ** 2; }
  const dfB = k - 1, dfW = N - k, msb = ssb / dfB, msw = ssw / dfW, F = msb / msw;
  const sst = ssb + ssw;
  return { F, dfB, dfW, p: pFupper(F, dfB, dfW), ssb, ssw, sst, msb, msw, eta2: ssb / sst, omega2: Math.max(0, (ssb - dfB * msw) / (sst + msw)), N, k, means: groups.map(mean), ns: groups.map((g) => g.length), sds: groups.map(sd) };
}
export function welchAnova(groups) {
  const k = groups.length;
  const n = groups.map((g) => g.length), m = groups.map(mean), v = groups.map(variance);
  const w = n.map((ni, i) => ni / v[i]);
  const W = sum(w);
  const mw = sum(w.map((wi, i) => wi * m[i])) / W;
  const A = sum(w.map((wi, i) => wi * (m[i] - mw) ** 2)) / (k - 1);
  const tmp = sum(w.map((wi, i) => (1 - wi / W) ** 2 / (n[i] - 1)));
  const B = 1 + ((2 * (k - 2)) / (k * k - 1)) * tmp;
  const F = A / B;
  const df2 = (k * k - 1) / (3 * tmp);
  return { F, df1: k - 1, df2, p: pFupper(F, k - 1, df2) };
}
export function tukeyHSD(groups, labels, conf = 0.95) {
  const a = anovaOneWay(groups);
  const k = groups.length;
  const qc = qtukey(conf, k, a.dfW);
  const out = [];
  for (let i = 0; i < k; i++) for (let j = i + 1; j < k; j++) {
    const diff = a.means[j] - a.means[i];
    const se = Math.sqrt((a.msw / 2) * (1 / a.ns[i] + 1 / a.ns[j]));
    const q = Math.abs(diff) / se;
    out.push({ a: labels[j], b: labels[i], diff, ciLow: diff - qc * se, ciHigh: diff + qc * se, q, pAdj: Math.max(0, 1 - ptukey(q, k, a.dfW)) });
  }
  return out;
}
export function gamesHowell(groups, labels) {
  const k = groups.length;
  const out = [];
  for (let i = 0; i < k; i++) for (let j = i + 1; j < k; j++) {
    const ni = groups[i].length, nj = groups[j].length, vi = variance(groups[i]), vj = variance(groups[j]);
    const diff = mean(groups[j]) - mean(groups[i]);
    const se = Math.sqrt(vi / ni + vj / nj);
    const df = (vi / ni + vj / nj) ** 2 / ((vi / ni) ** 2 / (ni - 1) + (vj / nj) ** 2 / (nj - 1));
    const q = (Math.abs(diff) / se) * Math.SQRT2;
    const qc = qtukey(0.95, k, df);
    out.push({ a: labels[j], b: labels[i], diff, ciLow: diff - (qc * se) / Math.SQRT2, ciHigh: diff + (qc * se) / Math.SQRT2, q, df, pAdj: Math.max(0, 1 - ptukey(q, k, df)) });
  }
  return out;
}
export function pairwiseT(groups, labels, method = 'holm', welch = true) {
  const out = [];
  for (let i = 0; i < groups.length; i++) for (let j = i + 1; j < groups.length; j++) {
    const r = tTestIndependent(groups[j], groups[i], { welch });
    out.push({ a: labels[j], b: labels[i], diff: r.diff, t: r.t, df: r.df, p: r.p, d: r.d });
  }
  const adj = adjustP(out.map((o) => o.p), method);
  out.forEach((o, i) => { o.pAdj = adj[i]; });
  return out;
}

// ---------- tablas de contingencia ----------
export function chiSquareIndependence(table, { yates = false } = {}) {
  // table: matriz r × c de frecuencias observadas
  const r = table.length, c = table[0].length;
  const rs = table.map((row) => sum(row)), cs = table[0].map((_, j) => sum(table.map((row) => row[j])));
  const N = sum(rs);
  const E = table.map((row, i) => row.map((_, j) => (rs[i] * cs[j]) / N));
  let chi = 0;
  const useY = yates && r === 2 && c === 2;
  for (let i = 0; i < r; i++) for (let j = 0; j < c; j++) {
    const e = E[i][j], o = table[i][j];
    const dlt = useY ? Math.max(0, Math.abs(o - e) - 0.5) : o - e;
    if (e > 0) chi += (dlt * dlt) / e;
  }
  const df = (r - 1) * (c - 1);
  const adjRes = table.map((row, i) => row.map((o, j) => (o - E[i][j]) / Math.sqrt(E[i][j] * (1 - rs[i] / N) * (1 - cs[j] / N))));
  const low = E.flat().filter((e) => e < 5).length;
  // razón de verosimilitudes G²
  let G = 0;
  for (let i = 0; i < r; i++) for (let j = 0; j < c; j++) if (table[i][j] > 0) G += 2 * table[i][j] * Math.log(table[i][j] / E[i][j]);
  const V = Math.sqrt(chi / (N * Math.min(r - 1, c - 1)));
  return { chi2: chi, df, p: pChiUpper(chi, df), N, expected: E, adjRes, lowExpected: low, lowExpectedShare: low / (r * c), minExpected: Math.min(...E.flat()), G2: G, pG2: pChiUpper(G, df), cramerV: V, phi: r === 2 && c === 2 ? Math.sqrt(chi / N) : null, yates: useY, rowSums: rs, colSums: cs };
}
function lchoose(n, k) { return jStat.gammaln(n + 1) - jStat.gammaln(k + 1) - jStat.gammaln(n - k + 1); }
export function fisherExact2x2([[a, b], [c, d]]) {
  const r1 = a + b, r2 = c + d, c1 = a + c, N = r1 + r2;
  const lo = Math.max(0, c1 - r2), hi = Math.min(r1, c1);
  const lp = (x) => lchoose(r1, x) + lchoose(r2, c1 - x) - lchoose(N, c1);
  const p0 = lp(a);
  let p = 0;
  for (let x = lo; x <= hi; x++) { const v = lp(x); if (v <= p0 + 1e-7) p += Math.exp(v); }
  const or = (a * d) / (b * c);
  const seLog = Math.sqrt(1 / a + 1 / b + 1 / c + 1 / d);
  return { p: Math.min(1, p), or, orLow: Math.exp(Math.log(or) - 1.959964 * seLog), orHigh: Math.exp(Math.log(or) + 1.959964 * seLog) };
}
export function chiSquareGOF(obs, expectedProps = null) {
  const N = sum(obs), k = obs.length;
  const p = expectedProps ? expectedProps.map((x) => x / sum(expectedProps)) : obs.map(() => 1 / k);
  const E = p.map((pi) => pi * N);
  const chi = sum(obs.map((o, i) => (o - E[i]) ** 2 / E[i]));
  return { chi2: chi, df: k - 1, p: pChiUpper(chi, k - 1), expected: E, N, w: Math.sqrt(chi / N) };
}
export function wilsonCI(x, n, conf = 0.95) {
  const z = qnorm(1 - (1 - conf) / 2), p = x / n;
  const den = 1 + (z * z) / n;
  const c = (p + (z * z) / (2 * n)) / den;
  const h = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / den;
  return [Math.max(0, c - h), Math.min(1, c + h)];
}

// ---------- correlación ----------
export function pearson(x, y, conf = 0.95) {
  const n = x.length, mx = mean(x), my = mean(y);
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) { const a = x[i] - mx, b = y[i] - my; sxy += a * b; sxx += a * a; syy += b * b; }
  const r = sxy / Math.sqrt(sxx * syy);
  const df = n - 2;
  const t = (r * Math.sqrt(df)) / Math.sqrt(Math.max(1e-300, 1 - r * r));
  const z = Math.atanh(r), se = 1 / Math.sqrt(n - 3), zc = qnorm(1 - (1 - conf) / 2);
  return { r, t, df, p: Math.abs(r) >= 1 ? 0 : p2t(t, df), n, ciLow: Math.tanh(z - zc * se), ciHigh: Math.tanh(z + zc * se), r2: r * r };
}
export function spearman(x, y) {
  const rx = ranks(x).r, ry = ranks(y).r;
  const res = pearson(rx, ry);
  return { rho: res.r, t: res.t, df: res.df, p: res.p, n: res.n, ciLow: res.ciLow, ciHigh: res.ciHigh, method: 'aproximación t' };
}
export function kendall(x, y) {
  const n = x.length;
  let C = 0, D = 0, tx = 0, ty = 0;
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
    const a = Math.sign(x[i] - x[j]), b = Math.sign(y[i] - y[j]);
    if (a === 0 && b === 0) continue;
    if (a === 0) tx++; else if (b === 0) ty++; else if (a === b) C++; else D++;
  }
  const n0 = (n * (n - 1)) / 2;
  const tiesX = ranks(x).ties, tiesY = ranks(y).ties;
  const n1 = sum(tiesX.map((t) => (t * (t - 1)) / 2)), n2 = sum(tiesY.map((t) => (t * (t - 1)) / 2));
  const tau = (C - D) / Math.sqrt((n0 - n1) * (n0 - n2));
  const v0 = n * (n - 1) * (2 * n + 5);
  const vt = sum(tiesX.map((t) => t * (t - 1) * (2 * t + 5))), vu = sum(tiesY.map((t) => t * (t - 1) * (2 * t + 5)));
  const v1 = sum(tiesX.map((t) => t * (t - 1))) * sum(tiesY.map((t) => t * (t - 1)));
  const v2 = sum(tiesX.map((t) => t * (t - 1) * (t - 2))) * sum(tiesY.map((t) => t * (t - 1) * (t - 2)));
  const varS = (v0 - vt - vu) / 18 + v1 / (2 * n * (n - 1)) + v2 / (9 * n * (n - 1) * (n - 2));
  const z = (C - D) / Math.sqrt(varS);
  return { tau, z, p: p2z(z), n };
}

// ---------- álgebra lineal mínima ----------
export function matInv(A) {
  const n = A.length;
  const M = A.map((row, i) => [...row, ...Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))]);
  for (let c = 0; c < n; c++) {
    let piv = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[piv][c])) piv = r;
    if (Math.abs(M[piv][c]) < 1e-12) return null;
    [M[c], M[piv]] = [M[piv], M[c]];
    const d = M[c][c];
    for (let j = 0; j < 2 * n; j++) M[c][j] /= d;
    for (let r = 0; r < n; r++) if (r !== c) { const f = M[r][c]; if (f) for (let j = 0; j < 2 * n; j++) M[r][j] -= f * M[c][j]; }
  }
  return M.map((row) => row.slice(n));
}
function xtx(X, w = null) {
  const p = X[0].length, out = Array.from({ length: p }, () => new Array(p).fill(0));
  for (let i = 0; i < X.length; i++) { const wi = w ? w[i] : 1; const r = X[i]; for (let a = 0; a < p; a++) { const v = r[a] * wi; if (!v) continue; for (let b = a; b < p; b++) out[a][b] += v * r[b]; } }
  for (let a = 0; a < p; a++) for (let b = 0; b < a; b++) out[a][b] = out[b][a];
  return out;
}
function xty(X, y, w = null) { const p = X[0].length, out = new Array(p).fill(0); for (let i = 0; i < X.length; i++) for (let a = 0; a < p; a++) out[a] += X[i][a] * y[i] * (w ? w[i] : 1); return out; }
const mv = (M, v) => M.map((row) => sum(row.map((x, j) => x * v[j])));

// ---------- regresión lineal por mínimos cuadrados ----------
// X sin la columna de 1: se agrega la ordenada al origen
export function ols(X0, y, names, { intercept = true, conf = 0.95 } = {}) {
  const X = intercept ? X0.map((r) => [1, ...r]) : X0.map((r) => r.slice());
  const nm = intercept ? ['(Ordenada)', ...names] : names.slice();
  const n = X.length, p = X[0].length;
  const XtXi = matInv(xtx(X));
  if (!XtXi) return { error: 'Los predictores son colineales (una variable es combinación exacta de otras): quitá alguna.' };
  const b = mv(XtXi, xty(X, y));
  const fitted = X.map((r) => sum(r.map((x, j) => x * b[j])));
  const resid = y.map((v, i) => v - fitted[i]);
  const rss = sum(resid.map((e) => e * e));
  const my = mean(y);
  const tss = intercept ? sum(y.map((v) => (v - my) ** 2)) : sum(y.map((v) => v * v));
  const df = n - p;
  const s2 = rss / df;
  const tc = qt(1 - (1 - conf) / 2, df);
  const sdY = sd(y);
  const coefs = b.map((bi, j) => {
    const se = Math.sqrt(s2 * XtXi[j][j]);
    const t = bi / se;
    const col = X.map((r) => r[j]);
    return { name: nm[j], b: bi, se, t, p: p2t(t, df), ciLow: bi - tc * se, ciHigh: bi + tc * se, beta: intercept && j === 0 ? null : (bi * sd(col)) / sdY };
  });
  const r2 = 1 - rss / tss;
  const k = intercept ? p - 1 : p;
  const adjR2 = 1 - ((1 - r2) * (n - (intercept ? 1 : 0))) / df;
  const F = k > 0 ? ((tss - rss) / k) / s2 : NaN;
  // VIF por la inversa de la matriz de correlaciones de los predictores
  let vif = null;
  if (intercept && k >= 2) {
    const cols = names.map((_, j) => X0.map((r) => r[j]));
    const R = cols.map((a) => cols.map((c) => pearson(a, c).r));
    const Ri = matInv(R);
    vif = Ri ? Ri.map((row, i) => row[i]) : null;
  }
  let dw = 0; for (let i = 1; i < n; i++) dw += (resid[i] - resid[i - 1]) ** 2; dw /= rss;
  const ll = (-n / 2) * (Math.log(2 * Math.PI) + Math.log(rss / n) + 1);
  // residuos estandarizados (internamente) y distancia de Cook
  const lev = X.map((r) => sum(mv(XtXi, r).map((v, j) => v * r[j])));
  const stdRes = resid.map((e, i) => e / Math.sqrt(s2 * (1 - lev[i])));
  const cook = stdRes.map((r, i) => ((r * r) / p) * (lev[i] / (1 - lev[i])));
  return { coefs, r2, adjR2, F, dfModel: k, dfResid: df, pF: k > 0 ? pFupper(F, k, df) : NaN, sigma: Math.sqrt(s2), rss, tss, n, p, fitted, resid, stdRes, leverage: lev, cook, vif, dw, aic: -2 * ll + 2 * (p + 1), bic: -2 * ll + Math.log(n) * (p + 1), XtXi };
}
// banda de confianza de la recta (o curva polinómica) en x0
export function predictBand(fit, row, conf = 0.95, prediction = false) {
  const x = [1, ...row];
  const yhat = sum(fit.coefs.map((c, j) => c.b * x[j]));
  const v = sum(mv(fit.XtXi, x).map((a, j) => a * x[j]));
  const se = fit.sigma * Math.sqrt(v + (prediction ? 1 : 0));
  const tc = qt(1 - (1 - conf) / 2, fit.dfResid);
  return { y: yhat, lo: yhat - tc * se, hi: yhat + tc * se };
}

// ---------- regresión logística (IRLS) ----------
export function logistic(X0, y, names, { maxIter = 50 } = {}) {
  const X = X0.map((r) => [1, ...r]);
  const nm = ['(Ordenada)', ...names];
  const n = X.length, p = X[0].length;
  let b = new Array(p).fill(0);
  let conv = false, it = 0, XtWXi = null;
  for (; it < maxIter; it++) {
    const eta = X.map((r) => sum(r.map((x, j) => x * b[j])));
    const mu = eta.map((e) => 1 / (1 + Math.exp(-e)));
    const w = mu.map((m) => Math.max(1e-10, m * (1 - m)));
    const z = eta.map((e, i) => e + (y[i] - mu[i]) / w[i]);
    XtWXi = matInv(xtx(X, w));
    if (!XtWXi) return { error: 'No converge: hay separación perfecta o predictores colineales.' };
    const nb = mv(XtWXi, xty(X, z, w));
    const delta = Math.max(...nb.map((v, j) => Math.abs(v - b[j])));
    b = nb;
    if (delta < 1e-9) { conv = true; break; }
  }
  const eta = X.map((r) => sum(r.map((x, j) => x * b[j])));
  const mu = eta.map((e) => 1 / (1 + Math.exp(-e)));
  const llf = sum(y.map((yi, i) => (yi ? Math.log(Math.max(1e-300, mu[i])) : Math.log(Math.max(1e-300, 1 - mu[i])))));
  const py = mean(y);
  const ll0 = n * (py * Math.log(py) + (1 - py) * Math.log(1 - py));
  const LR = 2 * (llf - ll0);
  const coefs = b.map((bi, j) => {
    const se = Math.sqrt(XtWXi[j][j]); const z = bi / se;
    return { name: nm[j], b: bi, se, z, p: p2z(z), or: Math.exp(bi), orLow: Math.exp(bi - 1.959964 * se), orHigh: Math.exp(bi + 1.959964 * se) };
  });
  const pred = mu.map((m) => (m >= 0.5 ? 1 : 0));
  const tp = sum(pred.map((v, i) => (v && y[i] ? 1 : 0))), tn = sum(pred.map((v, i) => (!v && !y[i] ? 1 : 0)));
  const cs = 1 - Math.exp((2 / n) * (ll0 - llf));
  const nag = cs / (1 - Math.exp((2 / n) * ll0));
  return { coefs, n, ll: llf, ll0, LR, dfLR: p - 1, pLR: pChiUpper(LR, p - 1), aic: -2 * llf + 2 * p, mcfadden: 1 - llf / ll0, coxSnell: cs, nagelkerke: nag, accuracy: (tp + tn) / n, sensitivity: tp / sum(y), specificity: tn / (n - sum(y)), converged: conv, iterations: it + 1, prob: mu };
}

// ---------- ANOVA factorial (tipo III, codificación por efectos) ----------
export function anovaFactorial(y, factors, { interaction = true } = {}) {
  // factors: [{ name, values: [...], levels: [...] }]
  const n = y.length;
  const blocks = factors.map((f) => {
    const L = f.levels;
    return { name: f.name, cols: f.values.map((v) => L.slice(0, -1).map((l) => (v === l ? 1 : v === L[L.length - 1] ? -1 : 0))), df: L.length - 1 };
  });
  const terms = blocks.map((b) => ({ name: b.name, cols: b.cols, df: b.df }));
  if (interaction && blocks.length === 2) {
    const [A, B] = blocks;
    terms.push({ name: `${A.name} × ${B.name}`, cols: A.cols.map((ra, i) => ra.flatMap((a) => B.cols[i].map((b) => a * b))), df: A.df * B.df });
  }
  const build = (skip) => y.map((_, i) => terms.flatMap((t, ti) => (ti === skip ? [] : t.cols[i])));
  const full = ols(build(-1), y, terms.flatMap((t) => t.cols[0].map((_, k) => `${t.name}${k}`)));
  if (full.error) return full;
  const mse = full.rss / full.dfResid;
  const rows = terms.map((t, ti) => {
    const red = ols(build(ti), y, terms.flatMap((tt, k) => (k === ti ? [] : tt.cols[0].map((_, q) => `${tt.name}${q}`))));
    const ss = red.rss - full.rss;
    const F = ss / t.df / mse;
    return { term: t.name, ss, df: t.df, ms: ss / t.df, F, p: pFupper(F, t.df, full.dfResid), partialEta2: ss / (ss + full.rss) };
  });
  rows.push({ term: 'Residuo', ss: full.rss, df: full.dfResid, ms: mse });
  return { rows, n, r2: full.r2, adjR2: full.adjR2 };
}

// ---------- componentes principales ----------
function jacobiEigen(S) {
  const n = S.length;
  const A = S.map((r) => r.slice());
  const V = A.map((_, i) => A.map((__, j) => (i === j ? 1 : 0)));
  for (let sweep = 0; sweep < 100; sweep++) {
    let off = 0;
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) off += A[i][j] ** 2;
    if (off < 1e-20) break;
    for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) {
      if (Math.abs(A[p][q]) < 1e-15) continue;
      const theta = (A[q][q] - A[p][p]) / (2 * A[p][q]);
      const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
      const c = 1 / Math.sqrt(t * t + 1), s = t * c;
      for (let k = 0; k < n; k++) { const akp = A[k][p], akq = A[k][q]; A[k][p] = c * akp - s * akq; A[k][q] = s * akp + c * akq; }
      for (let k = 0; k < n; k++) { const apk = A[p][k], aqk = A[q][k]; A[p][k] = c * apk - s * aqk; A[q][k] = s * apk + c * aqk; }
      for (let k = 0; k < n; k++) { const vkp = V[k][p], vkq = V[k][q]; V[k][p] = c * vkp - s * vkq; V[k][q] = s * vkp + c * vkq; }
    }
  }
  const vals = A.map((r, i) => r[i]);
  const order = vals.map((v, i) => [v, i]).sort((a, b) => b[0] - a[0]);
  return { values: order.map((o) => o[0]), vectors: order.map((o) => V.map((r) => r[o[1]])) };
}
function det(M) {
  const n = M.length; const A = M.map((r) => r.slice()); let d = 1;
  for (let c = 0; c < n; c++) {
    let piv = c; for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[piv][c])) piv = r;
    if (Math.abs(A[piv][c]) < 1e-300) return 0;
    if (piv !== c) { [A[c], A[piv]] = [A[piv], A[c]]; d = -d; }
    d *= A[c][c];
    for (let r = c + 1; r < n; r++) { const f = A[r][c] / A[c][c]; for (let j = c; j < n; j++) A[r][j] -= f * A[c][j]; }
  }
  return d;
}
export function pca(cols, names) {
  const n = cols[0].length, p = cols.length;
  const Z = cols.map((c) => { const m = mean(c), s = sd(c); return c.map((v) => (v - m) / s); });
  const R = Z.map((a) => Z.map((b) => sum(a.map((v, i) => v * b[i])) / (n - 1)));
  const { values, vectors } = jacobiEigen(R);
  // orientación: la carga mayor de cada componente, positiva
  vectors.forEach((v) => { const k = v.reduce((bi, x, i) => (Math.abs(x) > Math.abs(v[bi]) ? i : bi), 0); if (v[k] < 0) v.forEach((x, i) => { v[i] = -x; }); });
  const total = sum(values);
  const loadings = vectors.map((v, k) => v.map((x) => x * Math.sqrt(Math.max(0, values[k]))));
  const scores = Array.from({ length: n }, (_, i) => vectors.map((v) => sum(v.map((x, j) => x * Z[j][i]))));
  const lnDet = Math.log(Math.max(1e-300, det(R)));
  const bart = -(n - 1 - (2 * p + 5) / 6) * lnDet;
  const Ri = matInv(R);
  let kmo = null;
  if (Ri) {
    let r2 = 0, a2 = 0;
    for (let i = 0; i < p; i++) for (let j = 0; j < p; j++) if (i !== j) { r2 += R[i][j] ** 2; a2 += (-Ri[i][j] / Math.sqrt(Ri[i][i] * Ri[j][j])) ** 2; }
    kmo = r2 / (r2 + a2);
  }
  return { values, share: values.map((v) => v / total), cum: values.map((_, i) => sum(values.slice(0, i + 1)) / total), loadings, vectors, scores, names, n, R, bartlett: { chi2: bart, df: (p * (p - 1)) / 2, p: pChiUpper(bart, (p * (p - 1)) / 2) }, kmo };
}

// ---------- k medias (con k-means++ determinista por semilla) ----------
export function kmeans(points, k, { seed = 1, iter = 100 } = {}) {
  let s = seed;
  const rnd = () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
  const d2 = (a, b) => sum(a.map((v, i) => (v - b[i]) ** 2));
  const centers = [points[Math.floor(rnd() * points.length)].slice()];
  while (centers.length < k) {
    const dist = points.map((p) => Math.min(...centers.map((c) => d2(p, c))));
    let r = rnd() * sum(dist), i = 0;
    for (; i < dist.length; i++) { r -= dist[i]; if (r <= 0) break; }
    centers.push(points[Math.min(i, points.length - 1)].slice());
  }
  let assign = new Array(points.length).fill(0);
  for (let it = 0; it < iter; it++) {
    const na = points.map((p) => { let b = 0, bd = Infinity; centers.forEach((c, j) => { const dd = d2(p, c); if (dd < bd) { bd = dd; b = j; } }); return b; });
    const changed = na.some((a, i) => a !== assign[i]);
    assign = na;
    centers.forEach((c, j) => { const mem = points.filter((_, i) => assign[i] === j); if (mem.length) c.forEach((_, q) => { c[q] = mean(mem.map((m) => m[q])); }); });
    if (!changed && it > 0) break;
  }
  const wss = sum(points.map((p, i) => d2(p, centers[assign[i]])));
  const gc = points[0].map((_, q) => mean(points.map((p) => p[q])));
  const tss = sum(points.map((p) => d2(p, gc)));
  return { assign, centers, wss, tss, betweenShare: 1 - wss / tss, sizes: centers.map((_, j) => assign.filter((a) => a === j).length) };
}

// ---------- series de tiempo y crecimiento ----------
export function growth(times, values) {
  const out = [];
  for (let i = 1; i < values.length; i++) {
    const t = times[i] - times[i - 1], a = values[i - 1], b = values[i];
    out.push({ from: times[i - 1], to: times[i], abs: b - a, pct: a ? (b / a - 1) * 100 : null, annualGeom: a > 0 && t > 0 ? ((b / a) ** (1 / t) - 1) * 100 : null, expPerMil: a > 0 && t > 0 ? (Math.log(b / a) / t) * 1000 : null });
  }
  return out;
}
export function movingAverage(v, w = 3, centered = true) {
  const h = Math.floor(w / 2);
  return v.map((_, i) => {
    const lo = centered ? i - h : i - w + 1, hi = centered ? i + (w - 1 - h) : i;
    if (lo < 0 || hi >= v.length) return null;
    const s = v.slice(lo, hi + 1);
    return s.some((x) => x == null) ? null : mean(s);
  });
}
// suavizado LOESS (grado 1, ponderación tricúbica)
export function loess(xs, ys, span = 0.75, at = null) {
  const n = xs.length;
  const q = Math.max(3, Math.floor(span * n));
  const pts = at || xs;
  return pts.map((x0) => {
    const d = xs.map((x) => Math.abs(x - x0));
    const h = sorted(d)[Math.min(n - 1, q - 1)] || 1e-12;
    const w = d.map((di) => { const u = di / (h * 1.0000001); return u < 1 ? (1 - u ** 3) ** 3 : 0; });
    let sw = 0, sx = 0, sy = 0, sxx = 0, sxy = 0;
    for (let i = 0; i < n; i++) { sw += w[i]; sx += w[i] * xs[i]; sy += w[i] * ys[i]; sxx += w[i] * xs[i] ** 2; sxy += w[i] * xs[i] * ys[i]; }
    const den = sw * sxx - sx * sx;
    if (Math.abs(den) < 1e-12) return sy / sw;
    const b = (sw * sxy - sx * sy) / den, a = (sy - b * sx) / sw;
    return a + b * x0;
  });
}
// densidad por núcleo gaussiano con ancho de banda de Silverman (bw.nrd0 de R)
export function kde(x, { bw = null, n = 128, from = null, to = null } = {}) {
  const s = sd(x), iq = quantile(x, 0.75) - quantile(x, 0.25);
  const h = bw || 0.9 * Math.min(s, iq / 1.34 || s) * x.length ** -0.2 || 1;
  const lo = from ?? Math.min(...x) - 3 * h, hi = to ?? Math.max(...x) + 3 * h;
  const pts = [];
  for (let i = 0; i < n; i++) {
    const t = lo + ((hi - lo) * i) / (n - 1);
    let d = 0; for (const v of x) d += Math.exp(-0.5 * ((t - v) / h) ** 2);
    pts.push([t, d / (x.length * h * Math.sqrt(2 * Math.PI))]);
  }
  return { pts, bw: h };
}
// cortes de clases para mapas: Jenks (Fisher), cuantiles, intervalos iguales, desvío estándar
export function breaks(values, k, method = 'jenks') {
  const v = sorted(values.filter(Number.isFinite));
  if (!v.length) return [];
  const lo = v[0], hi = v[v.length - 1];
  if (method === 'equal') return Array.from({ length: k + 1 }, (_, i) => lo + ((hi - lo) * i) / k);
  if (method === 'quantile') return Array.from({ length: k + 1 }, (_, i) => quantile(v, i / k));
  if (method === 'sd') {
    const m = mean(v), s = sd(v);
    const b = [lo];
    for (let i = -Math.floor((k - 1) / 2); b.length < k; i++) { const c = m + (i + (k % 2 ? 0.5 : 0)) * s; if (c > lo && c < hi) b.push(c); else if (b.length < k && c >= hi) break; }
    b.push(hi);
    return [...new Set(b)].sort((a, c) => a - c);
  }
  // Jenks por programación dinámica (Fisher 1958)
  const n = v.length;
  if (k >= n) return [...new Set(v)];
  const mat1 = Array.from({ length: n + 1 }, () => new Array(k + 1).fill(0));
  const mat2 = Array.from({ length: n + 1 }, () => new Array(k + 1).fill(Infinity));
  for (let i = 1; i <= k; i++) { mat1[1][i] = 1; mat2[1][i] = 0; }
  for (let l = 2; l <= n; l++) {
    let s1 = 0, s2 = 0, w = 0, vv = 0;
    for (let m = 1; m <= l; m++) {
      const i3 = l - m + 1, val = v[i3 - 1];
      s2 += val * val; s1 += val; w++;
      vv = s2 - (s1 * s1) / w;
      const i4 = i3 - 1;
      if (i4 !== 0) for (let j = 2; j <= k; j++) if (mat2[l][j] >= vv + mat2[i4][j - 1]) { mat1[l][j] = i3; mat2[l][j] = vv + mat2[i4][j - 1]; }
    }
    mat1[l][1] = 1; mat2[l][1] = vv;
  }
  const out = new Array(k + 1); out[k] = hi; out[0] = lo;
  let kk = n;
  for (let j = k; j >= 2; j--) { const id = mat1[kk][j] - 2; out[j - 1] = v[id]; kk = mat1[kk][j] - 1; }
  return out;
}
export { adjustP, pnorm, qnorm, qt };
