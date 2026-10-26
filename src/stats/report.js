// Formato de resultados: decimales con coma (uso argentino) o punto, estilo APA 7 (sin cero inicial en p, r y otros
// valores que no pueden superar 1), y textos listos para pegar en la tesis.
export const fmtCfg = { comma: true, apaZero: false, pDigits: 3 };
export function setFmt(o) { Object.assign(fmtCfg, o || {}); }

export function num(x, d = 2) {
  if (x == null || !Number.isFinite(x)) return '—';
  let s = Math.abs(x) >= 1e6 ? x.toExponential(2) : x.toFixed(d);
  if (s === '-0' || /^-0[.,]0+$/.test(s)) s = s.slice(1);
  if (fmtCfg.comma) {
    // separador de miles con punto solo en enteros grandes
    const [i, f] = s.split('.');
    const ii = Math.abs(x) >= 10000 && !s.includes('e') ? i.replace(/\B(?=(\d{3})+(?!\d))/g, '.') : i;
    return f != null ? `${ii},${f}` : ii;
  }
  return s;
}
const dropZero = (s) => (fmtCfg.apaZero ? s : s.replace(/^(-?)0([.,])/, '$1$2'));
// valores acotados en ±1 (p, r, ρ, τ, η², V)
export const num1 = (x, d = 2) => dropZero(num(x, d));
export function pval(p, { prefix = true } = {}) {
  if (p == null || !Number.isFinite(p)) return '—';
  const d = fmtCfg.pDigits;
  const lim = 10 ** -d;
  if (p < lim) return `${prefix ? 'p ' : ''}< ${dropZero(num(lim, d))}`;
  return `${prefix ? 'p = ' : ''}${dropZero(num(p, d))}`;
}
export const pcell = (p) => (p == null || !Number.isFinite(p) ? '—' : p < 10 ** -fmtCfg.pDigits ? `< ${dropZero(num(10 ** -fmtCfg.pDigits, fmtCfg.pDigits))}` : dropZero(num(p, fmtCfg.pDigits)));
export const stars = (p) => (p < 0.001 ? '***' : p < 0.01 ? '**' : p < 0.05 ? '*' : 'ns');
export const df = (x) => (Number.isInteger(x) ? String(x) : num(x, 2));
export const ci = (lo, hi, d = 2) => `[${num(lo, d)}${fmtCfg.comma ? '; ' : ', '}${num(hi, d)}]`;
export const sep = () => (fmtCfg.comma ? '; ' : ', ');
export const pct = (x, d = 1) => `${num(x * 100, d)} %`;

// Magnitud del efecto según convenciones (Cohen 1988; Field 2013): se informa y se discute, no se usa como veredicto
export function magnitude(kind, v) {
  const a = Math.abs(v);
  if (!Number.isFinite(a)) return '';
  const cuts = {
    d: [0.2, 0.5, 0.8], r: [0.1, 0.3, 0.5], eta2: [0.01, 0.06, 0.14], V: [0.1, 0.3, 0.5], W: [0.1, 0.3, 0.5], f2: [0.02, 0.15, 0.35],
  }[kind];
  if (!cuts) return '';
  return a < cuts[0] ? 'despreciable' : a < cuts[1] ? 'pequeño' : a < cuts[2] ? 'mediano' : 'grande';
}

// Exportación de bloques de resultados a texto con tabulaciones (pega en Word o Excel como tabla) y a CSV
export function blockToTSV(b) {
  if (b.type !== 'table') return b.text || '';
  return [b.caption || '', b.head.join('\t'), ...b.rows.map((r) => r.map((c) => String(c ?? '')).join('\t')), b.note ? `Nota. ${b.note}` : ''].filter(Boolean).join('\n');
}
export function blockToHTML(b) {
  const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;');
  if (b.type === 'table') {
    return `<p><b>${esc(b.caption)}</b></p><table border="1" cellspacing="0" cellpadding="3" style="border-collapse:collapse;font-size:10pt"><thead><tr>${b.head.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${b.rows.map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>${b.note ? `<p><i>Nota.</i> ${esc(b.note)}</p>` : ''}`;
  }
  return `<p>${esc(b.text)}</p>`;
}
