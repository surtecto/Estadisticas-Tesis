// Distribuciones de probabilidad: t, F, χ², normal (jStat) y rango estudentizado de Tukey (adaptado de ptukey.c de R,
// algoritmo de Copenhaver y Holland, 1988).
import jStatMod from 'jstat';

export const jStat = jStatMod.jStat || jStatMod;

export const pnorm = (z) => jStat.normal.cdf(z, 0, 1);
export const qnorm = (p) => jStat.normal.inv(p, 0, 1);
export const pt = (t, df) => jStat.studentt.cdf(t, df);
export const qt = (p, df) => jStat.studentt.inv(p, df);
export const pf = (f, d1, d2) => jStat.centralF.cdf(f, d1, d2);
export const pchisq = (x, df) => jStat.chisquare.cdf(x, df);
export const lgamma = (x) => jStat.gammaln(x);

// p bilateral de t, cuidando la precisión en la cola
export function p2t(t, df) {
  const a = Math.abs(t);
  if (!Number.isFinite(a)) return 0;
  // P(|T|>a) = I_{df/(df+a²)}(df/2, 1/2)
  return Math.min(1, jStat.ibeta(df / (df + a * a), df / 2, 0.5));
}
export const pFupper = (f, d1, d2) => (f <= 0 ? 1 : Math.min(1, jStat.ibeta(d2 / (d2 + d1 * f), d2 / 2, d1 / 2)));
export const pChiUpper = (x, df) => (x <= 0 ? 1 : Math.max(0, 1 - jStat.lowRegGamma(df / 2, x / 2)));
export const p2z = (z) => 2 * (1 - pnorm(Math.abs(z)));

// ---------- rango estudentizado ----------
const XLEG = [0.981560634246719250690549090149, 0.904117256370474856678465866119, 0.769902674194304687036893833213, 0.587317954286617447296702418941, 0.367831498998180193752691536644, 0.125233408511468915472441369464];
const ALEG = [0.047175336386511827194615961485, 0.106939325995318430960254718194, 0.160078328543346226334652529543, 0.203167426723065921749064455810, 0.233492536538354808760849898925, 0.249147045813402785000562436043];
function wprob(w, rr, cc) {
  const nleg = 12, ihalf = 6, C1 = -30, C2 = -50, C3 = 60, bb = 8, wlar = 3, wincr1 = 2, wincr2 = 3;
  const qsqz = w * 0.5;
  if (qsqz >= bb) return 1.0;
  let prW = 2 * pnorm(qsqz) - 1;
  prW = prW >= Math.exp(C2 / cc) ? Math.pow(prW, cc) : 0;
  const wincr = w > wlar ? wincr1 : wincr2;
  let blb = qsqz;
  const binc = (bb - qsqz) / wincr;
  let bub = blb + binc;
  let einsum = 0;
  const cc1 = cc - 1;
  for (let wi = 1; wi <= wincr; wi++) {
    let elsum = 0;
    const a = 0.5 * (bub + blb), b = 0.5 * (bub - blb);
    for (let jj = 1; jj <= nleg; jj++) {
      let j, xx;
      if (ihalf < jj) { j = nleg - jj + 1; xx = XLEG[j - 1]; } else { j = jj; xx = -XLEG[j - 1]; }
      const c = b * xx, ac = a + c, qexpo = ac * ac;
      if (qexpo > C3) break;
      const pplus = 2 * pnorm(ac), pminus = 2 * pnorm(ac - w);
      let rinsum = pplus * 0.5 - pminus * 0.5;
      if (rinsum >= Math.exp(C1 / cc1)) { rinsum = ALEG[j - 1] * Math.exp(-(0.5 * qexpo)) * Math.pow(rinsum, cc1); elsum += rinsum; }
    }
    elsum *= (2 * b * cc) / Math.sqrt(2 * Math.PI);
    einsum += elsum;
    blb = bub; bub += binc;
  }
  prW += einsum;
  if (prW <= Math.exp(C1 / rr)) return 0;
  prW = Math.pow(prW, rr);
  return prW >= 1 ? 1 : prW;
}
const XLEGQ = [0.989400934991649932596154173450, 0.944575023073232576077988415535, 0.865631202387831743880467897712, 0.755404408355003033895101194847, 0.617876244402643748446671764049, 0.458016777657227386342419442984, 0.281603550779258913230460501460, 0.950125098376374401853193354250e-1];
const ALEGQ = [0.271524594117540948517805724560e-1, 0.622535239386478928628438369944e-1, 0.951585116824927848099251076022e-1, 0.124628971255533872052476282192, 0.149595988816576732081501730547, 0.169156519395002538189312079030, 0.182603415044923588866763667969, 0.189450610455068496285396723208];
// P(Q ≤ q) para nmeans = cc grupos y df grados de libertad
export function ptukey(q, cc, df, rr = 1) {
  if (q <= 0) return 0;
  if (!Number.isFinite(q)) return 1;
  if (df > 25000) return wprob(q, rr, cc);
  const nlegq = 16, ihalfq = 8, eps1 = -30, eps2 = 1e-14;
  const f2 = df * 0.5;
  let f2lf = f2 * Math.log(df) - df * Math.LN2 - lgamma(f2);
  const f21 = f2 - 1, ff4 = df * 0.25;
  const ulen = df <= 100 ? 1 : df <= 800 ? 0.5 : df <= 5000 ? 0.25 : 0.125;
  f2lf += Math.log(ulen);
  let ans = 0, otsum = 0;
  for (let i = 1; i <= 50; i++) {
    otsum = 0;
    const twa1 = (2 * i - 1) * ulen;
    for (let jj = 1; jj <= nlegq; jj++) {
      let j, t1;
      if (ihalfq < jj) { j = jj - ihalfq - 1; t1 = f2lf + f21 * Math.log(twa1 + XLEGQ[j] * ulen) - (XLEGQ[j] * ulen + twa1) * ff4; }
      else { j = jj - 1; t1 = f2lf + f21 * Math.log(twa1 - XLEGQ[j] * ulen) + (XLEGQ[j] * ulen - twa1) * ff4; }
      if (t1 >= eps1) {
        const qsqz = ihalfq < jj ? q * Math.sqrt((XLEGQ[j] * ulen + twa1) * 0.5) : q * Math.sqrt((-(XLEGQ[j] * ulen) + twa1) * 0.5);
        otsum += wprob(qsqz, rr, cc) * ALEGQ[j] * Math.exp(t1);
      }
    }
    if (i * ulen >= 1.0 && otsum <= eps2) break;
    ans += otsum;
  }
  return Math.min(1, ans);
}
export const pTukeyUpper = (q, k, df) => Math.max(0, 1 - ptukey(q, k, df));
// cuantil por bisección (para intervalos de Tukey)
export function qtukey(p, k, df) {
  let lo = 0, hi = 50;
  for (let i = 0; i < 80; i++) { const m = (lo + hi) / 2; if (ptukey(m, k, df) < p) lo = m; else hi = m; }
  return (lo + hi) / 2;
}

// ---------- correcciones por comparaciones múltiples ----------
export function adjustP(ps, method = 'holm') {
  const m = ps.length;
  const idx = ps.map((p, i) => [p, i]);
  const out = new Array(m);
  if (method === 'bonferroni') return ps.map((p) => Math.min(1, p * m));
  if (method === 'holm') {
    idx.sort((a, b) => a[0] - b[0]);
    let run = 0;
    idx.forEach(([p, i], r) => { run = Math.max(run, Math.min(1, (m - r) * p)); out[i] = run; });
    return out;
  }
  if (method === 'bh') {
    idx.sort((a, b) => b[0] - a[0]);
    let run = 1;
    idx.forEach(([p, i], r) => { const rank = m - r; run = Math.min(run, Math.min(1, (p * m) / rank)); out[i] = run; });
    return out;
  }
  return ps.slice();
}
export const ADJUST = [['holm', 'Holm'], ['bonferroni', 'Bonferroni'], ['bh', 'Benjamini–Hochberg (tasa de falsos descubrimientos)'], ['none', 'Sin corrección']];
