// Biblioteca de proyectos (modelo de Mapas-Tesis): cada proyecto reúne sus datos fundamentales, sus tablas de datos,
// sus figuras (una o varias, cada una con uno o varios paneles) y sus análisis guardados. Se guarda en IndexedDB.
import { dbGet, dbPut, dbDelete, dbAll, dbByIndex } from './db.js';
import { uid } from './util.js';

export const WORK_KINDS = [
  ['tesis-doctoral', 'Tesis doctoral'], ['tesis-maestria', 'Tesis de maestría'], ['tesina', 'Tesina o trabajo final'],
  ['articulo', 'Artículo científico'], ['ponencia', 'Ponencia o póster'], ['informe', 'Informe técnico'],
  ['plan', 'Plan, ordenanza o proyecto normativo'], ['docencia', 'Material docente'], ['divulgacion', 'Divulgación'], ['otro', 'Otro'],
];
export const LICENSES = [
  ['CC BY 4.0', 'CC BY 4.0 (atribución)'], ['CC BY-SA 4.0', 'CC BY-SA 4.0 (atribución, compartir igual)'], ['CC BY-NC 4.0', 'CC BY-NC 4.0 (sin uso comercial)'],
  ['Todos los derechos reservados', 'Todos los derechos reservados'], ['', 'Sin indicar'],
];
export function defaultMeta(over = {}) {
  return Object.assign({ name: '', kind: 'tesis-doctoral', title: '', author: '', institution: '', director: '', year: String(new Date().getFullYear()), keywords: '', summary: '', license: 'CC BY 4.0', mediaId: 'tesis-a4', styleId: 'tesis', notes: '' }, over);
}
export function defaultFigure(over = {}) {
  return Object.assign({
    name: 'Figura 1', media: { profileId: 'tesis-a4', quality: 'estandar' }, page: null, style: 'tesis', palette: '', ramp: '', font: '', fontTitle: '', fontScale: 1, gray: false,
    title: '', subtitle: '', caption: { mode: 'apa', number: '1', note: '', source: '', autoNotes: true, inside: true }, layout: { cols: 1, gap: 5, letters: true }, panels: [],
  }, over);
}

const now = () => new Date().toISOString();
const clean = (o) => JSON.parse(JSON.stringify(o, (k, v) => (k.startsWith('_') ? undefined : v)));
let changeListener = null;
export function onProjectChange(fn) { changeListener = fn; }
function notify(id, kind = 'change', extra) { try { if (changeListener) changeListener(id, kind, extra); } catch (e) { /* noop */ } }
function stamp(p) { const t = now(); p.updated = t; p.changed = t; return p; }
async function bump(projectId) { const p = await dbGet('proyectos', projectId); if (p) { stamp(p); await dbPut('proyectos', p); notify(projectId); } }

// ---------- proyectos ----------
export async function listProjects() {
  const projects = await dbAll('proyectos');
  const figs = await dbAll('figuras');
  const tabs = await dbAll('tablas');
  const byP = new Map();
  for (const f of figs) { if (!byP.has(f.projectId)) byP.set(f.projectId, []); byP.get(f.projectId).push({ id: f.id, name: f.name, updated: f.updated, thumb: f.thumb || null }); }
  const tCount = new Map();
  for (const t of tabs) tCount.set(t.projectId, (tCount.get(t.projectId) || 0) + 1);
  return projects.map((p) => {
    const fs = byP.get(p.id) || [];
    const order = p.figureIds || [];
    fs.sort((a, b) => (order.indexOf(a.id) + 1 || 1e6) - (order.indexOf(b.id) + 1 || 1e6));
    return { ...p, figures: fs, tableCount: tCount.get(p.id) || 0 };
  }).sort((a, b) => String(b.updated).localeCompare(String(a.updated)));
}
export const getProject = (id) => dbGet('proyectos', id);
export async function createProject(meta) {
  const p = stamp({ id: uid('P'), meta: defaultMeta(meta), created: now(), figureIds: [], tableIds: [], activeFigureId: null, analyses: [] });
  await dbPut('proyectos', p);
  notify(p.id);
  return p;
}
export async function saveProject(p, { content = true } = {}) {
  const cur = await dbGet('proyectos', p.id);
  if (cur && cur.sync) p.sync = cur.sync;
  if (content) stamp(p); else p.updated = now();
  await dbPut('proyectos', clean(p));
  if (content) notify(p.id);
  return p;
}
export async function saveProjectMeta(id, meta) {
  const p = await dbGet('proyectos', id);
  if (!p) return null;
  p.meta = defaultMeta({ ...p.meta, ...meta });
  return saveProject(p);
}
export async function touchProject(id, patch = {}) {
  const p = await dbGet('proyectos', id);
  if (!p) return null;
  Object.assign(p, patch, { updated: now() });
  await dbPut('proyectos', p);
  return p;
}
export async function deleteProject(id) {
  const p = await dbGet('proyectos', id);
  if (p) notify(id, 'delete', p);
  for (const st of ['figuras', 'tablas']) for (const r of await dbByIndex(st, 'projectId', id)) await dbDelete(st, r.id);
  await dbDelete('proyectos', id);
}
export async function duplicateProject(id) {
  const obj = await exportProject(id);
  if (!obj) return null;
  obj.proyecto.meta.name = `${obj.proyecto.meta.name || 'Proyecto'} (copia)`;
  return importProject(obj);
}

// ---------- tablas ----------
export const listTables = async (projectId) => {
  const p = await dbGet('proyectos', projectId);
  const ts = await dbByIndex('tablas', 'projectId', projectId);
  const order = (p && p.tableIds) || [];
  return ts.sort((a, b) => (order.indexOf(a.id) + 1 || 1e6) - (order.indexOf(b.id) + 1 || 1e6));
};
export const getTable = (id) => dbGet('tablas', id);
export async function addTable(projectId, table) {
  const t = clean({ ...table, projectId, updated: now() });
  if (!t.id) t.id = uid('T');
  await dbPut('tablas', t);
  const p = await dbGet('proyectos', projectId);
  if (p) { p.tableIds = [...(p.tableIds || []).filter((x) => x !== t.id), t.id]; stamp(p); await dbPut('proyectos', p); notify(projectId); }
  return t;
}
export async function saveTable(t) { t.updated = now(); await dbPut('tablas', clean(t)); await bump(t.projectId); return t; }
export async function deleteTable(id) {
  const t = await dbGet('tablas', id);
  if (!t) return;
  await dbDelete('tablas', id);
  const p = await dbGet('proyectos', t.projectId);
  if (p) { p.tableIds = (p.tableIds || []).filter((x) => x !== id); stamp(p); await dbPut('proyectos', p); notify(p.id); }
}

// ---------- figuras ----------
export async function listFigures(projectId) {
  const p = await dbGet('proyectos', projectId);
  const fs = await dbByIndex('figuras', 'projectId', projectId);
  const order = (p && p.figureIds) || [];
  return fs.sort((a, b) => (order.indexOf(a.id) + 1 || 1e6) - (order.indexOf(b.id) + 1 || 1e6));
}
export const getFigure = (id) => dbGet('figuras', id);
export async function createFigure(projectId, fig) {
  const f = clean({ ...defaultFigure(), ...fig, id: uid('F'), projectId, updated: now(), thumb: null });
  await dbPut('figuras', f);
  const p = await dbGet('proyectos', projectId);
  if (p) { p.figureIds = [...(p.figureIds || []), f.id]; p.activeFigureId = f.id; stamp(p); await dbPut('proyectos', p); notify(projectId); }
  return f;
}
export async function saveFigure(f, { thumb } = {}) {
  const old = await dbGet('figuras', f.id);
  const rec = clean({ ...f, updated: now() });
  if (thumb !== undefined) rec.thumb = thumb; else if (old) rec.thumb = old.thumb;
  await dbPut('figuras', rec);
  await bump(f.projectId);
  return rec;
}
export async function setFigureThumb(id, thumb) { const f = await dbGet('figuras', id); if (f) { f.thumb = thumb; await dbPut('figuras', f); } }
export async function duplicateFigure(id) {
  const f = await dbGet('figuras', id);
  if (!f) return null;
  const { id: _i, ...rest } = f;
  return createFigure(f.projectId, { ...rest, name: `${f.name} (copia)` });
}
export async function deleteFigure(id) {
  const f = await dbGet('figuras', id);
  if (!f) return;
  await dbDelete('figuras', id);
  const p = await dbGet('proyectos', f.projectId);
  if (p) { p.figureIds = (p.figureIds || []).filter((x) => x !== id); if (p.activeFigureId === id) p.activeFigureId = p.figureIds[0] || null; stamp(p); await dbPut('proyectos', p); notify(p.id); }
}

// ---------- exportar / importar ----------
export const PROJECT_FORMAT = 'estadisticas-tesis-proyecto';
export async function exportProject(id) {
  const p = await dbGet('proyectos', id);
  if (!p) return null;
  return { formato: PROJECT_FORMAT, version: 1, exportado: now(), proyecto: p, tablas: await listTables(id), figuras: await listFigures(id) };
}
export async function importProject(obj, fallbackName = 'Proyecto importado') {
  if (!obj || !obj.proyecto) throw new Error('El archivo no es un proyecto de Estadísticas-Tesis.');
  const fp = obj.proyecto;
  const p = await createProject({ ...defaultMeta(fp.meta), name: (fp.meta && fp.meta.name) || fallbackName });
  const tmap = {};
  for (const t of obj.tablas || []) { const nt = await addTable(p.id, { ...t, id: uid('T') }); tmap[t.id] = nt.id; }
  const figIds = [];
  let active = null;
  for (const f of obj.figuras || []) {
    const nf = { ...f, panels: (f.panels || []).map((pn) => ({ ...pn, tableId: tmap[pn.tableId] || pn.tableId })) };
    delete nf.id;
    const cf = await createFigure(p.id, nf);
    if (f.thumb) await setFigureThumb(cf.id, f.thumb);
    figIds.push(cf.id);
    if (f.id === fp.activeFigureId) active = cf.id;
  }
  const np = await dbGet('proyectos', p.id);
  np.analyses = (fp.analyses || []).map((a) => ({ ...a, tableId: tmap[a.tableId] || a.tableId }));
  np.activeFigureId = active || figIds[0] || null;
  np.geo = fp.geo || null;
  await saveProject(np);
  return np;
}

// ---------- carpeta de proyectos (mismos ids en todas las computadoras) ----------
export const FOLDER_FORMAT = 'estadisticas-tesis-carpeta';
export async function exportForFolder(id, device) {
  const p = await dbGet('proyectos', id);
  if (!p) return null;
  const { sync, ...rest } = p;
  return { formato: FOLDER_FORMAT, version: 1, guardado: now(), equipo: device || '', proyecto: { ...rest, changed: p.changed || p.updated }, tablas: await listTables(id), figuras: await listFigures(id) };
}
export async function applyFolderProject(obj) {
  const fp = obj.proyecto;
  const local = await dbGet('proyectos', fp.id);
  for (const [st, list] of [['tablas', obj.tablas || []], ['figuras', obj.figuras || []]]) {
    const have = local ? await dbByIndex(st, 'projectId', fp.id) : [];
    const keep = new Set(list.map((x) => x.id));
    for (const r of have) if (!keep.has(r.id)) await dbDelete(st, r.id);
    for (const r of list) await dbPut(st, { ...r, projectId: fp.id });
  }
  const p = { ...fp, sync: local ? local.sync : undefined, updated: fp.changed || now(), changed: fp.changed || now() };
  if (local && local.activeFigureId && (p.figureIds || []).includes(local.activeFigureId)) p.activeFigureId = local.activeFigureId;
  await dbPut('proyectos', p);
  return p;
}
export async function copyFolderProjectAs(obj, name) {
  return importProject({ ...obj, proyecto: { ...obj.proyecto, meta: { ...obj.proyecto.meta, name } } });
}
export async function setProjectSync(id, sync) {
  const p = await dbGet('proyectos', id);
  if (!p) return null;
  if (sync == null) delete p.sync; else p.sync = sync;
  await dbPut('proyectos', p);
  return p;
}
