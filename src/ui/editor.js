// Editor de un proyecto: barra superior (proyecto, figura, guardado, deshacer), panel izquierdo (Datos, Gráfico,
// Estadística, Tesis), mesa central (figura, tabla o resultados) y panel derecho (destino, estilo, epígrafe, exportación).
import { el, clear, debounce, deepClone, downloadBlob, slug } from '../util.js';
import { getProject, listTables, listFigures, getFigure, saveFigure, createFigure, deleteFigure, duplicateFigure, saveProject, exportProject, setFigureThumb, defaultFigure, saveProjectMeta, WORK_KINDS, LICENSES } from '../library.js';
import { renderFigure } from '../charts/figure.js';
import { folderStatus, syncProject, resolveRemote, reconnectFolder } from '../folder.js';
import { confirmDialog, promptDialog, formDialog } from './dialogs.js';
import { renderDataPanel, renderTableView } from './dataPanel.js';
import { renderChartPanel } from './chartPanel.js';
import { renderStatsPanel, renderResultsView } from './statsPanel.js';
import { renderThesisPanel } from './thesisPanel.js';
import { renderFigurePanel } from './figurePanel.js';
import { brandMark } from './home.js';
import { setFmt } from '../stats/report.js';
import { PALETTES } from '../palette.js';

let E = null; // estado del editor abierto

export async function closeEditor(app) {
  if (!E) return;
  await E.flush();
  E = null; app.current = null;
  document.getElementById('app').hidden = true;
}

export async function openEditor(app, projectId, figureId) {
  if (E && E.projectId === projectId) {
    if (figureId && E.fig && E.fig.id !== figureId) await E.switchFigure(figureId);
    return;
  }
  if (E) await closeEditor(app);
  const project = await getProject(projectId);
  if (!project) throw new Error('El proyecto no existe en esta computadora.');
  for (const pl of project.palettes || []) if (!PALETTES.some((x) => x.id === pl.id)) PALETTES.push(pl);
  const tl = await listTables(projectId);
  let figs = await listFigures(projectId);
  if (!figs.length) { await createFigure(projectId, defaultFigure({ style: project.meta.styleId || 'tesis', media: { profileId: project.meta.mediaId || 'tesis-a4', quality: 'estandar' } })); figs = await listFigures(projectId); }
  const fid = figureId && figs.some((f) => f.id === figureId) ? figureId : project.activeFigureId && figs.some((f) => f.id === project.activeFigureId) ? project.activeFigureId : figs[0].id;
  E = {
    app, projectId, project, tables: Object.fromEntries(tl.map((t) => [t.id, t])), tableOrder: tl.map((t) => t.id), figures: figs, fig: null,
    activePanel: 0, activeTable: tl[0] ? tl[0].id : null, leftTab: 'graf', view: 'figure', sim: null, zoom: 'fit',
    undo: [], redo: [], dirty: false, results: [], lastRender: null,
  };
  app.current = E;
  setFmt({ comma: project.meta.decimal !== 'dot' });
  buildShell();
  await E.switchFigure(fid, { first: true });
  if (!tl.length) { E.leftTab = 'datos'; renderLeft(); }
  // análisis guardados: se recalculan al abrir
  E.results = [];
  if (project.analyses && project.analyses.length) { const { rerunSaved } = await import('./statsPanel.js'); rerunSaved(E); }
  app.onRemoteNewer = (r) => onRemoteNewer(r);
  app.onFolderStatus = () => updateFolderState();
  updateFolderState();
}

// ---------- estructura ----------
function buildShell() {
  const root = document.getElementById('app');
  clear(root);
  document.getElementById('home').hidden = true;
  document.body.classList.remove('on-home');
  root.hidden = false;
  E.$ = {};
  const crumbs = el('nav', { class: 'crumbs', 'aria-label': 'Proyecto y figura' });
  const title = el('input', { id: 'title', class: 'title-input', type: 'text', 'aria-label': 'Nombre de la figura', spellcheck: 'false' });
  title.addEventListener('change', () => { E.fig.name = title.value.trim() || E.fig.name; E.changed('nombre'); renderCrumbs(); });
  const save = el('span', { class: 'save-state', 'aria-live': 'polite' }, 'Guardado');
  const folder = el('button', { type: 'button', class: 'folder-state', hidden: true });
  folder.addEventListener('click', async () => { if (folderStatus().perm !== 'granted') { await reconnectFolder(); } await syncProject(E.projectId, { openId: E.projectId }); updateFolderState(); });
  const undoB = el('button', { type: 'button', class: 'icon', title: 'Deshacer (Ctrl+Z)', 'aria-label': 'Deshacer', onclick: () => doUndo() }, '↶');
  const redoB = el('button', { type: 'button', class: 'icon', title: 'Rehacer (Ctrl+Mayús+Z)', 'aria-label': 'Rehacer', onclick: () => doRedo() }, '↷');
  const projBtn = el('button', { type: 'button', class: 'btn ghost', 'aria-haspopup': 'true' }, 'Proyecto');
  const menu = el('div', { class: 'menu', role: 'menu', hidden: true });
  const item = (label, fn, cls) => el('button', { type: 'button', role: 'menuitem', class: cls, onclick: () => { menu.hidden = true; fn(); } }, label);
  menu.append(
    el('span', { class: 'menu-label' }, 'Se guarda solo en esta computadora mientras trabajás'),
    item('Datos del proyecto…', editMeta),
    item('Nueva figura en blanco', () => newFigure()),
    item('Duplicar esta figura', async () => { const f = await duplicateFigure(E.fig.id); E.figures = await listFigures(E.projectId); E.app.go(`#/p/${E.projectId}/${f.id}`); }),
    item('Eliminar esta figura…', removeFigure, 'danger'),
    el('hr'),
    item('Exportar el proyecto completo (.json)', exportProjectFile),
    item('Informe estadístico en Word (.docx)…', async () => { const { reportDialog } = await import('./report.js'); reportDialog(E); }),
    el('hr'),
    item('Volver a los proyectos', () => E.app.go('#/')),
  );
  projBtn.addEventListener('click', (e) => { e.stopPropagation(); menu.hidden = !menu.hidden; });
  document.addEventListener('click', (e) => { if (!menu.contains(e.target)) menu.hidden = true; });
  const top = el('header', { class: 'topbar' },
    el('a', { class: 'brand', href: '#/', title: 'Volver a los proyectos' }, brandMark(26), el('span', { class: 'wordmark' }, 'Estadísticas-Tesis')),
    crumbs, title, save, folder,
    el('div', { class: 'topbar-tools' }, el('div', { class: 'tb-group', role: 'group', 'aria-label': 'Historial' }, undoB, redoB), el('div', { class: 'menu-wrap' }, projBtn, menu)));
  const tabs = el('div', { class: 'tabs', role: 'tablist' });
  const leftBody = el('div', { class: 'panel-body' });
  const left = el('aside', { class: 'panel left' }, tabs, leftBody);
  const viewTabs = el('div', { class: 'view-tabs', role: 'tablist' });
  const boardBody = el('div', { class: 'board-body' });
  const board = el('main', { class: 'board' }, viewTabs, boardBody);
  const rightBody = el('div', { class: 'panel-body' });
  const right = el('aside', { class: 'panel right' }, el('div', { class: 'tabs' }, el('span', { class: 'tab static' }, 'Figura')), rightBody);
  root.append(top, left, board, right);
  Object.assign(E.$, { crumbs, title, save, folder, tabs, leftBody, viewTabs, boardBody, rightBody, undoB, redoB });
  document.onkeydown = (e) => {
    if (!E) return;
    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) doRedo(); else doUndo(); }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); doRedo(); }
  };
  E.flush = async () => { if (E.dirty) await persist(); };
  E.redraw = () => renderBoard();
  E.switchFigure = switchFigure;
  E.changed = changed;
  E.tableChanged = tableChanged;
  E.renderLeft = renderLeft;
  E.renderRight = renderRight;
  E.renderBoard = renderBoard;
  E.setView = (v) => { E.view = v; renderViewTabs(); renderBoard(); };
  E.setLeftTab = (t) => { E.leftTab = t; renderLeft(); };
  E.saveProject = () => saveProject(E.project);
  E.newFigure = newFigure;
  E.toast = (m, k, ms) => E.app.toast(m, k, ms);
}

async function switchFigure(id, { first = false } = {}) {
  if (!first && E.dirty) await persist();
  E.fig = await getFigure(id);
  if (!E.fig.panels) E.fig.panels = [];
  E.activePanel = Math.min(E.activePanel, Math.max(0, E.fig.panels.length - 1));
  if (!first) E.activePanel = 0;
  E.undo = []; E.redo = [];
  lastSnap = JSON.stringify(E.fig);
  E.project.activeFigureId = id;
  saveProject(E.project, { content: false });
  if (location.hash !== `#/p/${E.projectId}/${id}`) history.replaceState(null, '', `#/p/${E.projectId}/${id}`);
  E.$.title.value = E.fig.name || '';
  renderCrumbs(); renderLeft(); renderViewTabs(); renderBoard(); renderRight();
}

// ---------- cambios, guardado y deshacer ----------
let lastSnap = null, snapTimer = null;
function changed(what = '', { left = false, right = false, board = true, noUndo = false } = {}) {
  if (!noUndo) {
    if (!snapTimer && lastSnap) { E.undo.push(lastSnap); if (E.undo.length > 80) E.undo.shift(); E.redo = []; }
    clearTimeout(snapTimer);
    snapTimer = setTimeout(() => { snapTimer = null; lastSnap = JSON.stringify(E.fig); }, 700);
  }
  E.dirty = true;
  E.$.save.textContent = 'Sin guardar'; E.$.save.classList.add('dirty');
  if (board) renderBoard();
  if (left) renderLeft();
  if (right) renderRight();
  scheduleSave();
}
const scheduleSave = debounce(() => persist(), 900);
async function persist() {
  if (!E) return;
  const fig = E.fig;
  E.dirty = false;
  try {
    await saveFigure(fig);
    E.$.save.textContent = 'Guardado'; E.$.save.classList.remove('dirty');
    makeThumb(fig);
  } catch (e) { E.$.save.textContent = 'Error al guardar'; E.toast(`No se pudo guardar: ${e.message}`, 'error'); }
}
const makeThumb = debounce((fig) => {
  try {
    const svg = E && E.lastRender && E.lastRender.svg;
    if (!svg) return;
    const c = svg.cloneNode(true);
    c.querySelectorAll('[data-tip]').forEach((n) => n.removeAttribute('data-tip'));
    let s = new XMLSerializer().serializeToString(c);
    if (s.length > 450000) return;
    setFigureThumb(fig.id, `data:image/svg+xml;charset=utf-8,${encodeURIComponent(s)}`);
  } catch (e) { /* miniatura opcional */ }
}, 2500);
function doUndo() {
  if (snapTimer) { clearTimeout(snapTimer); snapTimer = null; if (lastSnap) { E.undo.push(lastSnap); } lastSnap = JSON.stringify(E.fig); }
  const s = E.undo.pop();
  if (!s) { E.toast('No hay más cambios para deshacer.'); return; }
  E.redo.push(JSON.stringify(E.fig));
  E.fig = JSON.parse(s); lastSnap = s;
  changed('deshacer', { left: true, right: true, noUndo: true });
}
function doRedo() {
  const s = E.redo.pop();
  if (!s) return;
  E.undo.push(JSON.stringify(E.fig));
  E.fig = JSON.parse(s); lastSnap = s;
  changed('rehacer', { left: true, right: true, noUndo: true });
}
async function tableChanged(t, { left = true } = {}) {
  E.tables[t.id] = t;
  const { saveTable } = await import('../library.js');
  await saveTable(t);
  renderBoard();
  if (left) renderLeft();
}

// ---------- barra ----------
function renderCrumbs() {
  const c = E.$.crumbs; clear(c);
  const n = E.figures.length;
  const menu = el('div', { class: 'menu map-menu', hidden: true });
  for (const f of E.figures) {
    menu.appendChild(el('button', { type: 'button', class: `map-item ${f.id === E.fig.id ? 'on' : ''}`, onclick: () => { menu.hidden = true; E.app.go(`#/p/${E.projectId}/${f.id}`); } },
      f.thumb ? el('img', { src: f.thumb, alt: '' }) : el('span', { class: 'mi-nothumb' }), el('span', { class: 'mi-name' }, f.id === E.fig.id ? E.fig.name : f.name)));
  }
  menu.append(el('hr'), el('button', { type: 'button', onclick: () => { menu.hidden = true; newFigure(); } }, '+ Nueva figura'));
  const fb = el('button', { type: 'button', class: 'crumb-map', onclick: (e) => { e.stopPropagation(); menu.hidden = !menu.hidden; } }, `Figuras `, el('span', { class: 'crumb-count' }, `(${n})`), ' ▾');
  document.addEventListener('click', (e) => { if (!menu.contains(e.target) && e.target !== fb) menu.hidden = true; });
  c.append(el('button', { type: 'button', class: 'crumb-home', onclick: () => E.app.go('#/') }, 'Proyectos'), el('span', { class: 'crumb-sep' }, '/'),
    el('button', { type: 'button', class: 'crumb-project', title: 'Datos del proyecto', onclick: editMeta }, E.project.meta.name || 'Proyecto'), el('span', { class: 'crumb-sep' }, '/'),
    el('span', { class: 'crumb-wrap' }, fb, menu));
}
function updateFolderState() {
  if (!E) return;
  const s = folderStatus();
  const b = E.$.folder;
  if (!s.linked || (E.project.sync && E.project.sync.localOnly)) { b.hidden = true; return; }
  b.hidden = false;
  b.className = `folder-state ${s.perm !== 'granted' ? 'warn' : s.error ? 'bad' : s.busy || s.pending ? 'busy' : 'ok'}`;
  b.textContent = s.perm !== 'granted' ? 'Carpeta: dar permiso' : s.error ? 'Carpeta: error' : s.busy ? 'Carpeta: sincronizando…' : s.pending ? 'Carpeta: por guardar' : 'Carpeta al día';
  b.title = s.error || `Carpeta «${s.name}» · ${s.device}`;
}
async function onRemoteNewer(r) {
  const ok = await confirmDialog({ title: 'Este proyecto cambió en otra computadora', text: `Hay una versión más nueva en la carpeta (${r.equipo || 'otra computadora'}). ¿Cargarla? Si elegís seguir con la de acá, la otra queda como proyecto aparte.`, ok: 'Cargar la versión de la carpeta', cancel: 'Seguir con esta' });
  const res = await resolveRemote(E.projectId, ok ? 'load' : 'keep');
  if (ok && res === 'loaded') { const pid = E.projectId; const fid = E.fig.id; E = null; E = null; window.__et.current = null; await openEditor(window.__et, pid, fid); }
}

// ---------- paneles ----------
const LEFT_TABS = [['datos', 'Datos'], ['graf', 'Gráfico'], ['est', 'Estadística'], ['tesis', 'Tesis']];
function renderLeft() {
  const t = E.$.tabs; clear(t);
  for (const [id, label] of LEFT_TABS) t.appendChild(el('button', { type: 'button', role: 'tab', class: 'tab', 'aria-selected': String(E.leftTab === id), onclick: () => E.setLeftTab(id) }, label));
  const b = E.$.leftBody;
  const st = b.scrollTop;
  clear(b);
  if (E.leftTab === 'datos') renderDataPanel(E, b);
  else if (E.leftTab === 'graf') renderChartPanel(E, b);
  else if (E.leftTab === 'est') renderStatsPanel(E, b);
  else renderThesisPanel(E, b);
  b.scrollTop = st;
}
function renderRight() { const b = E.$.rightBody; const st = b.scrollTop; clear(b); renderFigurePanel(E, b); b.scrollTop = st; }
function renderViewTabs() {
  const v = E.$.viewTabs; clear(v);
  const nRes = E.results.length;
  for (const [id, label] of [['figure', 'Figura'], ['table', 'Tabla de datos'], ['results', `Resultados${nRes ? ` (${nRes})` : ''}`]]) {
    v.appendChild(el('button', { type: 'button', role: 'tab', class: `vtab ${E.view === id ? 'on' : ''}`, 'aria-selected': String(E.view === id), onclick: () => E.setView(id) }, label));
  }
  if (E.view === 'figure') {
    const z = el('div', { class: 'zoom-ctl' },
      el('button', { type: 'button', class: `btn small ${E.zoom === 'fit' ? 'active' : ''}`, onclick: () => { E.zoom = 'fit'; renderViewTabs(); renderBoard(); } }, 'Ajustar'),
      el('button', { type: 'button', class: `btn small ${E.zoom === 1 ? 'active' : ''}`, title: 'Tamaño real en la pantalla (aprox.)', onclick: () => { E.zoom = 1; renderViewTabs(); renderBoard(); } }, '100 %'),
      el('button', { type: 'button', class: `btn small ${E.zoom === 2 ? 'active' : ''}`, onclick: () => { E.zoom = 2; renderViewTabs(); renderBoard(); } }, '200 %'));
    v.appendChild(z);
  }
  E.renderViewTabs = renderViewTabs;
}
function renderBoard() {
  if (!E) return;
  const b = E.$.boardBody;
  if (E.view === 'table') { renderTableView(E, b); return; }
  if (E.view === 'results') { renderResultsView(E, b); return; }
  const st = b.scrollTop;
  clear(b);
  let r;
  try { r = renderFigure(E.fig, { tables: E.tables, project: E.project, gray: E.fig.gray, sim: E.sim, comma: E.project.meta.decimal !== 'dot', screen: true }); }
  catch (e) { console.error(e); b.appendChild(el('p', { class: 'warn-note' }, `No se pudo dibujar la figura: ${e.message}`)); return; }
  E.lastRender = r;
  const paper = el('div', { class: `paper ${E.zoom === 'fit' ? 'fit' : ''}` });
  const wmm = parseFloat(r.svg.getAttribute('width')), hmm = parseFloat(r.svg.getAttribute('height'));
  if (E.zoom !== 'fit') { r.svg.style.width = `${wmm * 3.7795 * E.zoom}px`; r.svg.style.height = `${hmm * 3.7795 * E.zoom}px`; }
  else { r.svg.removeAttribute('width'); r.svg.removeAttribute('height'); paper.style.aspectRatio = `${wmm} / ${hmm}`; paper.style.setProperty('--ar', wmm / hmm); }
  paper.appendChild(r.svg);
  // clic en un panel: lo elige para editar
  r.svg.addEventListener('click', (e) => {
    const g = e.target.closest('[data-panel]');
    if (!g) return;
    const i = E.fig.panels.findIndex((p) => p.id === g.getAttribute('data-panel'));
    if (i >= 0 && i !== E.activePanel) { E.activePanel = i; if (E.leftTab !== 'graf') E.leftTab = 'graf'; renderLeft(); markActive(); }
  });
  const wrap = el('div', { class: 'paper-wrap' }, paper);
  const info = el('div', { class: 'board-info' });
  const m = r.th;
  info.append(el('span', {}, `${wmm.toFixed(0)} × ${hmm.toFixed(0)} mm`), el('span', {}, `${E.fig.panels.length} panel${E.fig.panels.length === 1 ? '' : 'es'}`));
  if (r.warnings.length) info.appendChild(el('span', { class: 'bi-warn', title: r.warnings.join('\n') }, `${r.warnings.length} aviso${r.warnings.length > 1 ? 's' : ''}: ${r.warnings[0]}`));
  b.append(wrap, info);
  attachTips(r.svg);
  markActive();
  b.scrollTop = st;
}
function markActive() {
  const svg = E.lastRender && E.lastRender.svg;
  if (!svg) return;
  svg.querySelectorAll('[data-panel]').forEach((g) => g.classList.toggle('active-panel', E.fig.panels.length > 1 && E.fig.panels[E.activePanel] && g.getAttribute('data-panel') === E.fig.panels[E.activePanel].id));
}
function attachTips(svg) {
  const tip = document.getElementById('tip');
  svg.addEventListener('mousemove', (e) => {
    const n = e.target.closest('[data-tip]');
    if (!n) { tip.hidden = true; return; }
    tip.innerHTML = n.getAttribute('data-tip');
    tip.hidden = false;
    const x = Math.min(window.innerWidth - tip.offsetWidth - 8, e.clientX + 14), y = Math.min(window.innerHeight - tip.offsetHeight - 8, e.clientY + 14);
    tip.style.left = `${x}px`; tip.style.top = `${y}px`;
  });
  svg.addEventListener('mouseleave', () => { tip.hidden = true; });
}

// ---------- acciones ----------
async function newFigure(base = null) {
  if (E.dirty) await persist();
  const n = E.figures.length + 1;
  const f = await createFigure(E.projectId, defaultFigure({ name: `Figura ${n}`, style: E.fig ? E.fig.style : 'tesis', media: E.fig ? { ...E.fig.media } : undefined, caption: { mode: E.fig ? E.fig.caption.mode : 'apa', number: String(n), note: '', source: E.fig && E.fig.caption ? E.fig.caption.source : '', autoNotes: true, inside: true }, ...(base || {}) }));
  E.figures = await listFigures(E.projectId);
  E.app.go(`#/p/${E.projectId}/${f.id}`);
  return f;
}
async function removeFigure() {
  if (E.figures.length < 2) { E.toast('Es la única figura del proyecto: creá otra antes de eliminar esta.', 'warn'); return; }
  if (!(await confirmDialog({ title: `¿Eliminar «${E.fig.name}»?`, text: 'Las tablas de datos del proyecto no se tocan.', ok: 'Eliminar', danger: true }))) return;
  const id = E.fig.id;
  await deleteFigure(id);
  E.figures = await listFigures(E.projectId);
  E.dirty = false;
  E.app.go(`#/p/${E.projectId}/${E.figures[0].id}`);
}
async function exportProjectFile() {
  if (E.dirty) await persist();
  const obj = await exportProject(E.projectId);
  downloadBlob(new Blob([JSON.stringify(obj)], { type: 'application/json' }), `${slug(E.project.meta.name)}.estadisticas.json`);
}
async function editMeta() {
  const m = { ...E.project.meta };
  const inp = (k, label, ph = '') => { const i = el('input', { type: 'text', value: m[k] || '', placeholder: ph }); i.addEventListener('input', () => { m[k] = i.value; }); return el('label', { class: 'wf' }, el('span', { class: 'wf-l' }, label), i); };
  const sel = (k, label, opts) => { const s = el('select', {}, ...opts.map(([v, l]) => el('option', { value: v, selected: String(m[k]) === v }, l))); s.addEventListener('change', () => { m[k] = s.value; }); return el('label', { class: 'wf' }, el('span', { class: 'wf-l' }, label), s); };
  const body = el('div', { class: 'wf-grid' }, inp('name', 'Nombre del proyecto'), sel('kind', 'Tipo de trabajo', WORK_KINDS), el('div', { class: 'span2' }, inp('title', 'Título de la tesis o del trabajo')), inp('author', 'Autoría'), inp('institution', 'Institución'), inp('director', 'Dirección'), inp('year', 'Año'), sel('license', 'Licencia de las figuras', LICENSES), sel('decimal', 'Separador decimal', [['comma', 'Coma (3,14 · uso argentino)'], ['dot', 'Punto (3.14 · revistas en inglés)']]));
  if (!(await formDialog({ title: 'Datos del proyecto', body, wide: true, ok: 'Guardar' }))) return;
  E.project = await saveProjectMeta(E.projectId, m);
  setFmt({ comma: E.project.meta.decimal !== 'dot' });
  renderCrumbs(); renderBoard(); renderLeft();
}
export { deepClone };
