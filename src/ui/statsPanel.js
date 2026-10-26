// Pestaña Estadística: asistente para elegir la prueba, análisis con sus parámetros y la vista de resultados
// (tablas APA, texto para la tesis, supuestos, preguntas), con copia a Word y paso directo al gráfico.
import { el, clear, uid } from '../util.js';
import { ANALYSES, getAnalysis, suggestAnalysis } from '../stats/analyses.js';
import { levelsOf, getCol, isNum, isCat } from '../data/table.js';
import { blockToTSV, blockToHTML } from '../stats/report.js';
import { defaultPanel, getType } from '../charts/types.js';

const groups = [...new Set(ANALYSES.map((a) => a.group))];

export function renderStatsPanel(E, b) {
  if (!E.tableOrder.length) { b.append(el('p', { class: 'note' }, 'Primero agregá una tabla de datos.'), el('button', { type: 'button', class: 'btn primary', onclick: () => E.setLeftTab('datos') }, 'Ir a Datos')); return; }
  E.statForm = E.statForm || { aid: 'desc', tableId: E.activeTable || E.tableOrder[0], params: {} };
  const F = E.statForm;
  if (!E.tables[F.tableId]) F.tableId = E.tableOrder[0];
  const t = E.tables[F.tableId];
  // ---- asistente
  const asis = el('details', { class: 'sec asis', open: !E.results.length },
    el('summary', {}, '¿Qué prueba uso? Elegí las variables y te digo'));
  const picks = new Set();
  const chips = el('div', { class: 'chips' }, ...t.columns.filter((c) => c.type !== 'text' && c.type !== 'id').map((c) => { const i = el('input', { type: 'checkbox' }); i.addEventListener('change', () => { if (i.checked) picks.add(c.key); else picks.delete(c.key); upd(); }); return el('label', { class: 'chip' }, i, el('span', { class: `tdot t-${c.type}` }), c.name); }));
  const out = el('div', { class: 'asis-out' });
  const upd = () => {
    clear(out);
    if (!picks.size) return;
    const s = suggestAnalysis(t, [...picks]);
    const a = getAnalysis(s.id);
    out.append(el('p', {}, el('strong', {}, a.name), ' — ', s.why), el('button', { type: 'button', class: 'btn small primary', onclick: () => { F.aid = s.id; F.params = { ...s.params }; E.renderLeft(); } }, 'Preparar este análisis'));
  };
  asis.append(el('p', { class: 'note' }, 'Una variable describe; dos o más se comparan o se relacionan. El tipo (número o categoría) decide la prueba.'), chips, out);
  b.appendChild(asis);
  // ---- análisis
  const tsel = el('select', {}, ...E.tableOrder.map((id) => el('option', { value: id, selected: id === F.tableId }, E.tables[id].name)));
  tsel.addEventListener('change', () => { F.tableId = tsel.value; F.params = {}; E.renderLeft(); });
  const asel = el('select', {}, ...groups.map((g) => el('optgroup', { label: g }, ...ANALYSES.filter((a) => a.group === g).map((a) => el('option', { value: a.id, selected: a.id === F.aid }, a.name)))));
  asel.addEventListener('change', () => { F.aid = asel.value; F.params = keepCompatible(F.params, getAnalysis(F.aid)); E.renderLeft(); });
  const A = getAnalysis(F.aid);
  b.append(el('div', { class: 'field' }, el('label', {}, 'Tabla'), tsel), el('div', { class: 'field' }, el('label', {}, 'Análisis'), asel), el('p', { class: 'note' }, A.desc));
  for (const prm of A.params) b.appendChild(paramField(E, t, F, prm));
  b.appendChild(el('div', { class: 'btn-row' }, el('button', { type: 'button', class: 'btn primary', onclick: () => run(E) }, 'Calcular')));
  if (E.results.length) b.appendChild(el('p', { class: 'note' }, `${E.results.length} resultado${E.results.length > 1 ? 's' : ''} en la mesa («Resultados»). Se guardan con el proyecto y se recalculan si cambian los datos.`));
  b.appendChild(el('details', { class: 'sec' }, el('summary', {}, 'Cómo trabaja el motor'), el('div', { class: 'note' },
    el('p', {}, 'Las pruebas están programadas en la aplicación y se verificaron contra SciPy y statsmodels (71 comprobaciones: Shapiro–Wilk, Levene, t de Student y de Welch, Mann–Whitney exacta y aproximada, Wilcoxon, Kruskal–Wallis, ANOVA de uno y dos factores, Tukey, correlaciones, χ², Fisher, regresión lineal y logística, Friedman).'),
    el('p', {}, 'Cuando hay dos caminos (paramétrico o no), se muestran los dos y se recomienda uno según los supuestos, con la razón. La decisión final es tuya y conviene declararla en el capítulo de métodos.'))));
}
function keepCompatible(params, A) { const o = {}; for (const p of A.params) if (params[p.key] != null) o[p.key] = params[p.key]; return o; }

function paramField(E, t, F, prm) {
  const P = F.params;
  const lab = el('label', {}, prm.label);
  let ctl;
  const opt = (c) => el('option', { value: c.key, selected: P[prm.key] === c.key }, c.name);
  switch (prm.kind) {
    case 'num': case 'cat': case 'any': {
      const cols = t.columns.filter((c) => (prm.kind === 'num' ? isNum(c) : prm.kind === 'cat' ? isCat(c) || c.type === 'text' : true));
      ctl = el('select', {}, el('option', { value: '' }, prm.optional ? '— ninguna —' : '— elegir —'), ...cols.map(opt));
      if (!prm.optional && P[prm.key] == null && cols[0]) { P[prm.key] = (prm.kind === 'cat' ? cols.find((c) => levelsOf(t, c.key).length <= 12) || cols[0] : cols[0]).key; ctl.value = P[prm.key]; }
      ctl.addEventListener('change', () => { if (ctl.value) P[prm.key] = ctl.value; else delete P[prm.key]; if (A_hasDependent(F, prm.key)) E.renderLeft(); });
      break;
    }
    case 'numMulti': case 'anyMulti': {
      const cur = new Set(P[prm.key] || []);
      ctl = el('div', { class: 'chips multi' }, ...t.columns.filter((c) => prm.kind === 'anyMulti' ? c.type !== 'text' : isNum(c)).map((c) => { const i = el('input', { type: 'checkbox', checked: cur.has(c.key) }); i.addEventListener('change', () => { const s = new Set(P[prm.key] || []); if (i.checked) s.add(c.key); else s.delete(c.key); P[prm.key] = t.columns.map((x) => x.key).filter((x) => s.has(x)); }); return el('label', { class: 'chip' }, i, c.name); }));
      break;
    }
    case 'levels': case 'level': {
      const of = P[prm.of];
      const lv = of && getCol(t, of) ? levelsOf(t, of) : [];
      if (prm.kind === 'level') { ctl = el('select', {}, el('option', { value: '' }, 'la segunda categoría'), ...lv.map((l) => el('option', { value: l, selected: P[prm.key] === l }, l))); ctl.addEventListener('change', () => { P[prm.key] = ctl.value || undefined; }); }
      else {
        const cur = new Set(P[prm.key] || []);
        ctl = el('div', { class: 'chips small' }, ...lv.slice(0, 40).map((l) => { const i = el('input', { type: 'checkbox', checked: cur.has(l) }); i.addEventListener('change', () => { const s = new Set(P[prm.key] || []); if (i.checked) s.add(l); else s.delete(l); P[prm.key] = lv.filter((x) => s.has(x)); }); return el('label', { class: 'chip' }, i, l); }));
        if (lv.length <= 2) return el('div');
      }
      break;
    }
    case 'select': {
      if (P[prm.key] == null && prm.def != null) P[prm.key] = prm.def;
      ctl = el('select', {}, ...prm.options.map(([v, l]) => el('option', { value: v, selected: String(P[prm.key]) === String(v) }, l)));
      ctl.addEventListener('change', () => { P[prm.key] = ctl.value; });
      break;
    }
    case 'number': {
      if (P[prm.key] == null && prm.def != null) P[prm.key] = prm.def;
      ctl = el('input', { type: 'text', inputmode: 'decimal', value: P[prm.key] ?? '' });
      ctl.addEventListener('change', () => { const v = parseFloat(ctl.value.replace(',', '.')); if (Number.isFinite(v)) P[prm.key] = v; });
      break;
    }
    case 'bool': {
      const i = el('input', { type: 'checkbox', checked: !!P[prm.key] });
      i.addEventListener('change', () => { P[prm.key] = i.checked; });
      return el('label', { class: 'check' }, i, el('span', {}, prm.label));
    }
    default: return el('div');
  }
  return el('div', { class: 'field' }, lab, ctl);
}
const A_hasDependent = (F, key) => getAnalysis(F.aid).params.some((p) => p.of === key);

function run(E) {
  const F = E.statForm;
  const A = getAnalysis(F.aid);
  for (const p of A.params) if (!p.optional && ['num', 'cat', 'any'].includes(p.kind) && !F.params[p.key]) { E.toast(`Falta elegir: ${p.label}.`, 'warn'); return; }
  const rec = { id: uid('A'), aid: F.aid, tableId: F.tableId, params: JSON.parse(JSON.stringify(F.params)), created: new Date().toISOString() };
  const r = compute(E, rec);
  E.results.unshift(r);
  E.project.analyses = [{ ...rec }, ...(E.project.analyses || [])].slice(0, 60);
  E.saveProject();
  E.setView('results');
  E.renderLeft();
}
function compute(E, rec) {
  const t = E.tables[rec.tableId];
  const A = getAnalysis(rec.aid);
  if (!t || !A) return { ...rec, res: { title: A ? A.name : 'Análisis', blocks: [{ type: 'warn', text: 'La tabla de este análisis ya no está en el proyecto.' }] } };
  try { return { ...rec, res: A.run(t, rec.params) }; } catch (e) { console.error(e); return { ...rec, res: { title: A.name, blocks: [{ type: 'warn', text: `No se pudo calcular: ${e.message}` }] } }; }
}
export function rerunSaved(E) {
  E.results = (E.project.analyses || []).map((a) => compute(E, a));
  if (E.renderViewTabs) E.renderViewTabs();
}

// ---------- resultados ----------
export function renderResultsView(E, b) {
  clear(b);
  // recalcula con los datos actuales
  E.results = E.results.map((r) => compute(E, r));
  if (!E.results.length) {
    b.appendChild(el('div', { class: 'empty-board' }, el('p', {}, 'Todavía no hay resultados. En la pestaña Estadística elegí un análisis y tocá «Calcular».'), el('button', { type: 'button', class: 'btn', onclick: () => E.setLeftTab('est') }, 'Ir a Estadística')));
    return;
  }
  const wrap = el('div', { class: 'results' });
  wrap.appendChild(el('div', { class: 'res-top' }, el('span', { class: 'note' }, 'Los resultados se recalculan cuando cambian los datos.'), el('button', { type: 'button', class: 'btn small', onclick: async () => { const { reportDialog } = await import('./report.js'); reportDialog(E); } }, 'Informe en Word (.docx)…')));
  E.results.forEach((r, i) => wrap.appendChild(resultCard(E, r, i)));
  b.appendChild(wrap);
}
function resultCard(E, r, i) {
  const t = E.tables[r.tableId];
  const card = el('article', { class: 'res-card' });
  const A = getAnalysis(r.aid);
  card.appendChild(el('header', {}, el('div', {}, el('h2', {}, r.res.title || A.name), el('span', { class: 'note' }, `${t ? t.name : 'tabla quitada'} · ${new Date(r.created).toLocaleString('es-AR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}`)),
    el('div', { class: 'res-actions' },
      r.res.chart ? el('button', { type: 'button', class: 'btn small primary', title: 'Agrega a la figura un panel con el gráfico que corresponde a este análisis', onclick: () => chartFrom(E, r) }, 'Graficar') : null,
      el('button', { type: 'button', class: 'btn small', onclick: () => copyResult(E, r) }, 'Copiar para Word'),
      el('button', { type: 'button', class: 'icon ghost', title: 'Quitar este resultado', onclick: () => { E.results.splice(i, 1); E.project.analyses = (E.project.analyses || []).filter((a) => a.id !== r.id); E.saveProject(); E.renderBoard(); E.renderViewTabs(); } }, '×'))));
  for (const bl of r.res.blocks) card.appendChild(blockEl(bl));
  return card;
}
function blockEl(bl) {
  if (bl.type === 'table') {
    return el('figure', { class: 'apa-table' }, el('figcaption', {}, bl.caption), el('div', { class: 'tbl-scroll' }, el('table', {}, el('thead', {}, el('tr', {}, ...bl.head.map((h) => el('th', {}, h)))), el('tbody', {}, ...bl.rows.map((row) => el('tr', {}, ...row.map((c, j) => el('td', { class: j && String(c ?? '').length < 26 ? 'n' : j ? 'w' : '' }, String(c ?? '')))))))), bl.note ? el('p', { class: 'tnote' }, el('em', {}, 'Nota. '), bl.note) : null);
  }
  if (bl.type === 'apa') {
    const p = el('p', { class: 'apa-text' }, bl.text);
    return el('div', { class: 'apa-box' }, el('span', { class: 'apa-tag' }, 'Para la tesis'), p, el('button', { type: 'button', class: 'btn small', onclick: () => copyText(bl.text) }, 'Copiar'));
  }
  if (bl.type === 'warn') return el('p', { class: 'warn-note' }, bl.text);
  if (bl.type === 'questions') return el('div', { class: 'questions' }, el('span', { class: 'q-tag' }, 'Preguntas'), el('ul', {}, ...bl.items.map((q) => el('li', {}, q))));
  return el('p', { class: 'res-text' }, bl.text);
}
function copyText(s) { try { navigator.clipboard.writeText(s); window.__et.toast('Copiado.'); } catch (e) { window.__et.toast('No se pudo copiar.', 'warn'); } }
async function copyResult(E, r) {
  const html = `<h3>${r.res.title}</h3>` + r.res.blocks.filter((b) => b.type !== 'questions').map(blockToHTML).join('\n');
  const txt = r.res.blocks.filter((b) => b.type !== 'questions').map(blockToTSV).join('\n\n');
  try {
    if (window.ClipboardItem) await navigator.clipboard.write([new ClipboardItem({ 'text/html': new Blob([html], { type: 'text/html' }), 'text/plain': new Blob([txt], { type: 'text/plain' }) })]);
    else await navigator.clipboard.writeText(txt);
    E.toast('Copiado con formato de tabla: pegalo en Word o en Google Docs.');
  } catch (e) { E.toast('El navegador no dejó copiar.', 'warn'); }
}
function chartFrom(E, r) {
  const c = r.res.chart;
  const t = E.tables[r.tableId];
  const p = defaultPanel(t, c.type);
  p.enc = { ...c.enc };
  for (const k of Object.keys(p.enc)) if (p.enc[k] == null) delete p.enc[k];
  if (c.agg) p.agg = c.agg;
  else if (['meanci', 'dot'].includes(c.type)) p.agg = 'mean';
  p.options = { legend: 'auto', ...(c.options || {}) };
  p.filters = [...(r.params.filters || []), ...(c.filters || [])];
  const fig = E.fig;
  const empty = !fig.panels.length;
  fig.panels.push(p);
  E.activePanel = fig.panels.length - 1;
  if (!empty && (fig.layout.cols || 1) === 1) fig.layout.cols = 2;
  E.leftTab = 'graf';
  E.view = 'figure';
  E.changed('graficar', { left: true, right: true });
  E.renderViewTabs();
  E.toast(`Panel ${String.fromCharCode(64 + fig.panels.length)} agregado: ${getType(c.type).name}.`);
}
