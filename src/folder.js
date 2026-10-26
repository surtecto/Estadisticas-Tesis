// Carpeta de proyectos (heredada de Mapas-Tesis): cada proyecto se guarda también como archivo .json en una carpeta elegida
// (por ejemplo dentro de OneDrive o Google Drive para escritorio). Otra computadora que elige la misma carpeta sincronizada
// encuentra los mismos proyectos. Usa la API de acceso al sistema de archivos (Chrome y Edge).
//
// Estructura de la carpeta:
//   <nombre>__<idProyecto>.json   un archivo por proyecto (datos, tablas, figuras, análisis)
//   papelera/                      proyectos eliminados desde alguna computadora
//
// Regla de sincronización (por proyecto, con la marca 'changed' de la última vez que coincidieron):
//   solo cambió acá → se escribe el archivo · solo cambió el archivo → se carga · cambiaron los dos → se conservan las dos versiones.
import { dbAll, dbGet } from './db.js';
import { exportForFolder, applyFolderProject, copyFolderProjectAs, setProjectSync, importProject, FOLDER_FORMAT } from './library.js';
import { uid } from './util.js';

const FILE_RE = /__(P[a-z0-9]+)\.json$/i;
const KV_NAME = 'estadisticas-tesis-carpeta';

// ---------- almacén pequeño para el permiso de la carpeta y el índice de archivos ----------
let kvp = null;
function kv() {
  if (!kvp) {
    kvp = new Promise((resolve, reject) => {
      const r = indexedDB.open(KV_NAME, 1);
      r.onupgradeneeded = () => { if (!r.result.objectStoreNames.contains('kv')) r.result.createObjectStore('kv'); };
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
    kvp.catch(() => { kvp = null; });
  }
  return kvp;
}
async function kvOp(mode, fn) {
  const d = await kv();
  return new Promise((resolve, reject) => {
    const t = d.transaction('kv', mode);
    const req = fn(t.objectStore('kv'));
    t.oncomplete = () => resolve(req && 'result' in req ? req.result : undefined);
    t.onerror = () => reject(t.error);
  });
}
const kvGet = (k) => kvOp('readonly', (s) => s.get(k)).catch(() => undefined);
const kvSet = (k, v) => kvOp('readwrite', (s) => s.put(v, k)).catch(() => undefined);
const kvDel = (k) => kvOp('readwrite', (s) => s.delete(k)).catch(() => undefined);

// ---------- estado ----------
const st = {
  supported: typeof window !== 'undefined' && 'showDirectoryPicker' in window && window.isSecureContext !== false,
  handle: null, perm: 'none', folderId: null, lastSync: null, error: null, busy: false, foreign: [], pending: false,
};
let index = { files: {} };
let lock = Promise.resolve();
const serial = (fn) => { const r = lock.then(fn, fn); lock = r.catch(() => {}); return r; };
const listeners = new Set();
export function onFolderStatus(fn) { listeners.add(fn); return () => listeners.delete(fn); }
function emit() { const s = folderStatus(); listeners.forEach((f) => { try { f(s); } catch (e) { /* noop */ } }); }

export function folderStatus() {
  return {
    supported: st.supported, linked: !!st.handle, name: st.handle ? st.handle.name : '', perm: st.perm, ready: !!st.handle && st.perm === 'granted',
    lastSync: st.lastSync, error: st.error, busy: st.busy, foreign: st.foreign.slice(), pending: st.pending, device: deviceName(), folderId: st.folderId,
  };
}

function defaultDevice() {
  const ua = navigator.userAgent;
  const os = /Windows/.test(ua) ? 'Windows' : /Mac OS/.test(ua) ? 'Mac' : /Linux/.test(ua) ? 'Linux' : 'Computadora';
  const br = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : 'navegador';
  return `${os} · ${br}`;
}
export function deviceName() { try { return localStorage.getItem('estadisticas-tesis:equipo') || defaultDevice(); } catch (e) { return defaultDevice(); } }
export function setDeviceName(n) { try { localStorage.setItem('estadisticas-tesis:equipo', String(n || '').trim()); } catch (e) { /* noop */ } emit(); }

const slug = (t) => String(t || 'proyecto').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48) || 'proyecto';
const safeKey = (k) => String(k).replace(/[^\w.-]+/g, '_').slice(0, 120);

// ---------- conexión ----------
export async function initFolder() {
  if (!st.supported) return folderStatus();
  try {
    st.handle = (await kvGet('handle')) || null;
    st.folderId = (await kvGet('folderId')) || null;
    index = (await kvGet('index')) || { files: {} };
    st.lastSync = (await kvGet('lastSync')) || null;
  } catch (e) { st.handle = null; }
  if (st.handle) {
    try { st.perm = await st.handle.queryPermission({ mode: 'readwrite' }); } catch (e) { st.perm = 'prompt'; }
  }
  emit();
  return folderStatus();
}

// tiene que llamarse desde un clic (el navegador pide el gesto)
export async function chooseFolder() {
  const h = await window.showDirectoryPicker({ id: 'estadisticas-tesis-proyectos', mode: 'readwrite', startIn: 'documents' });
  const perm = await h.requestPermission({ mode: 'readwrite' });
  if (perm !== 'granted') throw new Error('Sin permiso para escribir en esa carpeta.');
  st.handle = h; st.perm = 'granted'; st.error = null;
  st.folderId = uid('C');
  index = { files: {} };
  await kvSet('handle', h); await kvSet('folderId', st.folderId); await kvSet('index', index);
  emit();
  return h;
}

// también desde un clic: el navegador vuelve a preguntar tras cerrarlo (o recuerda si se eligió «permitir en cada visita»)
export async function reconnectFolder() {
  if (!st.handle) return false;
  try { st.perm = await st.handle.requestPermission({ mode: 'readwrite' }); } catch (e) { st.perm = 'prompt'; }
  if (st.perm === 'granted') st.error = null;
  emit();
  return st.perm === 'granted';
}

export async function unlinkFolder() {
  st.handle = null; st.perm = 'none'; st.folderId = null; st.foreign = [];
  await kvDel('handle'); await kvDel('folderId');
  emit();
}

async function ensurePerm() {
  if (!st.handle) return false;
  if (st.perm !== 'granted') { try { st.perm = await st.handle.queryPermission({ mode: 'readwrite' }); } catch (e) { st.perm = 'prompt'; } }
  return st.perm === 'granted';
}

// ---------- archivos ----------
async function writeFile(dir, name, data) {
  const fh = await dir.getFileHandle(name, { create: true });
  const w = await fh.createWritable();
  await w.write(data);
  await w.close();
  return fh;
}
async function listRoot() {
  const out = [];
  for await (const [name, h] of st.handle.entries()) {
    if (h.kind === 'file' && /\.json$/i.test(name) && !/\.crswap$/i.test(name)) out.push({ name, h });
  }
  return out;
}
async function trashIds() {
  const ids = new Set();
  try {
    const t = await st.handle.getDirectoryHandle('papelera');
    for await (const [name] of t.entries()) { const m = name.match(FILE_RE); if (m) ids.add(m[1]); }
  } catch (e) { /* sin papelera */ }
  return ids;
}
async function fileAt(path) {
  const parts = String(path).split('/').filter(Boolean);
  let dir = st.handle;
  for (const p of parts.slice(0, -1)) dir = await dir.getDirectoryHandle(p);
  return dir.getFileHandle(parts[parts.length - 1]);
}
async function readObj(h) {
  const obj = JSON.parse(await (await h.getFile()).text());
  if (!obj || obj.formato !== FOLDER_FORMAT || !obj.proyecto || !obj.proyecto.id) throw new Error('El archivo no es un proyecto de la carpeta.');
  return obj;
}
// cabecera del archivo: se relee solo si cambió su fecha o su tamaño
async function readHead(entry) {
  const file = await entry.h.getFile();
  const c = index.files[entry.name];
  if (c && c.lm === file.lastModified && c.size === file.size && c.changed) return c;
  const obj = JSON.parse(await file.text());
  if (!obj || obj.formato !== FOLDER_FORMAT || !obj.proyecto) throw new Error('formato');
  const head = { lm: file.lastModified, size: file.size, id: obj.proyecto.id, changed: obj.proyecto.changed, equipo: obj.equipo || '', guardado: obj.guardado || '' };
  index.files[entry.name] = head;
  return head;
}

async function writeProject(p, currentName) {
  const obj = await exportForFolder(p.id, deviceName());
  if (!obj) return null;
  const name = `${slug(obj.proyecto.meta && obj.proyecto.meta.name)}__${p.id}.json`;
  const fh = await writeFile(st.handle, name, JSON.stringify(obj));
  const f = await fh.getFile();
  index.files[name] = { lm: f.lastModified, size: f.size, id: p.id, changed: obj.proyecto.changed, equipo: obj.equipo, guardado: obj.guardado };
  const prevName = currentName || (p.sync && p.sync.file);
  if (prevName && prevName !== name) {
    try { await st.handle.removeEntry(prevName); } catch (e) { /* ya no estaba */ }
    delete index.files[prevName];
  }
  await setProjectSync(p.id, { folderId: st.folderId, base: obj.proyecto.changed, file: name, at: obj.guardado });
  return name;
}

const fmtWhen = (iso) => { const d = new Date(iso); return Number.isFinite(d.getTime()) ? d.toLocaleString('es-AR', { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''; };

// Un proyecto: decide qué hacer comparando las dos marcas con la de la última coincidencia
async function syncOne(id, { entry, trash, openId } = {}) {
  const local = await dbGet('proyectos', id);
  if (local && local.sync && local.sync.localOnly) return 'local-only';
  const sync = local && local.sync && local.sync.folderId === st.folderId ? local.sync : null;
  const base = sync ? sync.base : null;
  const lc = local ? (local.changed || local.updated) : null;
  if (!entry) {
    if (!local) return 'none';
    if (sync && trash && trash.has(id)) {
      if (!sync.removed) await setProjectSync(id, { ...sync, removed: true });
      return 'removed';
    }
    if (sync && sync.removed) return 'removed';
    await writeProject(local);
    return 'written';
  }
  const head = await readHead(entry);
  if (!local) {
    const obj = await readObj(entry.h);
    await applyFolderProject(obj);
    await setProjectSync(id, { folderId: st.folderId, base: obj.proyecto.changed, file: entry.name });
    return 'imported';
  }
  if (!base && head.changed === lc) { await setProjectSync(id, { folderId: st.folderId, base: lc, file: entry.name }); return 'same'; }
  const localChanged = !base || lc !== base;
  const fileChanged = !base || head.changed !== base;
  if (!localChanged && !fileChanged) {
    if (sync.file !== entry.name || sync.removed) await setProjectSync(id, { ...sync, file: entry.name, removed: false });
    return 'same';
  }
  if (fileChanged && !localChanged) {
    if (openId === id) return { remoteNewer: true, equipo: head.equipo, guardado: head.guardado };
    const obj = await readObj(entry.h);
    await applyFolderProject(obj);
    await setProjectSync(id, { folderId: st.folderId, base: obj.proyecto.changed, file: entry.name });
    return 'updated';
  }
  if (!fileChanged && localChanged) { await writeProject(local, entry.name); return 'written'; }
  // las dos computadoras cambiaron el proyecto: la versión de la carpeta queda como proyecto aparte y esta pasa a la carpeta
  const obj = await readObj(entry.h);
  const copy = await copyFolderProjectAs(obj, `${(obj.proyecto.meta && obj.proyecto.meta.name) || 'Proyecto'} (versión de ${obj.equipo || 'otra computadora'}, ${fmtWhen(obj.guardado)})`);
  await writeProject(await dbGet('proyectos', id), entry.name);
  return { conflict: copy };
}

async function entriesById() {
  const files = await listRoot();
  const byId = new Map();
  const foreign = [];
  for (const f of files) {
    const m = f.name.match(FILE_RE);
    if (m && !byId.has(m[1])) byId.set(m[1], f); else foreign.push(f.name);
  }
  return { byId, foreign };
}

function fail(e) {
  if (e && (e.name === 'NotAllowedError' || e.name === 'SecurityError')) { st.perm = 'prompt'; st.error = 'Hay que volver a dar permiso a la carpeta.'; }
  else if (e && e.name === 'NotFoundError') st.error = 'No se encuentra la carpeta: ¿se movió o se cambió de nombre?';
  else st.error = (e && e.message) || String(e);
}

// Toda la carpeta contra toda la planoteca de esta computadora
export function syncAll({ openId = null } = {}) {
  return serial(async () => {
    const res = { imported: [], updated: [], written: [], conflicts: [], removed: [], remoteNewer: null, errors: [] };
    if (!(await ensurePerm())) { res.needsPermission = !!st.handle; emit(); return res; }
    st.busy = true; emit();
    try {
      const { byId, foreign } = await entriesById();
      const trash = await trashIds();
      const locals = await dbAll('proyectos');
      const ids = new Set([...byId.keys(), ...locals.map((p) => p.id)]);
      for (const id of ids) {
        try {
          const r = await syncOne(id, { entry: byId.get(id), trash, openId });
          if (r === 'imported') res.imported.push(id);
          else if (r === 'updated') res.updated.push(id);
          else if (r === 'written') res.written.push(id);
          else if (r === 'removed') res.removed.push(id);
          else if (r && r.conflict) res.conflicts.push({ id, copy: r.conflict });
          else if (r && r.remoteNewer) res.remoteNewer = { id, ...r };
        } catch (e) { res.errors.push({ id, message: e.message }); }
      }
      st.foreign = foreign;
      st.lastSync = new Date().toISOString();
      st.error = res.errors.length ? `No se pudieron leer ${res.errors.length} archivo(s) de la carpeta.` : null;
      st.pending = false;
      await kvSet('index', index); await kvSet('lastSync', st.lastSync);
    } catch (e) { fail(e); res.failed = true; }
    st.busy = false; emit();
    return res;
  });
}

// Un solo proyecto (después de guardarlo, o al volver a la pestaña con el proyecto abierto)
export function syncProject(id, { openId = null } = {}) {
  return serial(async () => {
    if (!(await ensurePerm())) { st.pending = !!st.handle; emit(); return { needsPermission: !!st.handle }; }
    st.busy = true; emit();
    let r = null;
    try {
      const { byId } = await entriesById();
      r = await syncOne(id, { entry: byId.get(id), trash: byId.has(id) ? null : await trashIds(), openId });
      st.lastSync = new Date().toISOString(); st.error = null; st.pending = false;
      await kvSet('index', index); await kvSet('lastSync', st.lastSync);
    } catch (e) { fail(e); r = { failed: true }; }
    st.busy = false; emit();
    return r;
  });
}

// El proyecto abierto cambió en otra computadora: cargar esa versión o seguir con la de acá (la otra queda como copia)
export function resolveRemote(id, choice) {
  return serial(async () => {
    const { byId } = await entriesById();
    const entry = byId.get(id);
    if (!entry) return null;
    const obj = await readObj(entry.h);
    if (choice === 'load') {
      await applyFolderProject(obj);
      await setProjectSync(id, { folderId: st.folderId, base: obj.proyecto.changed, file: entry.name });
      return 'loaded';
    }
    const copy = await copyFolderProjectAs(obj, `${(obj.proyecto.meta && obj.proyecto.meta.name) || 'Proyecto'} (versión de ${obj.equipo || 'otra computadora'}, ${fmtWhen(obj.guardado)})`);
    await writeProject(await dbGet('proyectos', id), entry.name);
    return { copy };
  });
}

// Escritura diferida por proyecto: muchos guardados seguidos se vuelven un solo archivo
const timers = new Map();
export function scheduleProjectWrite(id, getOpenId, onResult) {
  if (!st.handle) return;
  clearTimeout(timers.get(id));
  st.pending = true; emit();
  timers.set(id, setTimeout(async () => {
    timers.delete(id);
    const r = await syncProject(id, { openId: getOpenId ? getOpenId() : null });
    if (onResult) onResult(id, r);
  }, 3500));
}
export function flushWrites(getOpenId) {
  const ids = [...timers.keys()];
  ids.forEach((id) => clearTimeout(timers.get(id)));
  timers.clear();
  return Promise.all(ids.map((id) => syncProject(id, { openId: getOpenId ? getOpenId() : null })));
}

// Eliminar en una computadora mueve el archivo a la papelera de la carpeta; las otras lo ven como «quitado»
export function trashProject(p) {
  if (!p || !st.handle || (p.sync && p.sync.localOnly)) return Promise.resolve();
  clearTimeout(timers.get(p.id)); timers.delete(p.id);
  return serial(async () => {
    if (!(await ensurePerm())) return;
    try {
      const { byId } = await entriesById();
      const entry = byId.get(p.id);
      if (!entry) return;
      const t = await st.handle.getDirectoryHandle('papelera', { create: true });
      const f = await entry.h.getFile();
      await writeFile(t, entry.name, await f.text());
      await st.handle.removeEntry(entry.name);
      delete index.files[entry.name];
      await kvSet('index', index);
    } catch (e) { fail(e); emit(); }
  });
}

// Volver a poner en la carpeta un proyecto que otra computadora quitó (sale de la papelera)
export function restoreToFolder(id) {
  return serial(async () => {
    if (!(await ensurePerm())) return false;
    const p = await dbGet('proyectos', id);
    if (!p) return false;
    try {
      const t = await st.handle.getDirectoryHandle('papelera');
      for await (const [name] of t.entries()) { const m = name.match(FILE_RE); if (m && m[1] === id) await t.removeEntry(name); }
    } catch (e) { /* sin papelera */ }
    await setProjectSync(id, null);
    await writeProject(await dbGet('proyectos', id));
    return true;
  });
}

// Dejar un proyecto solo en esta computadora, o volver a guardarlo en la carpeta
export async function setLocalOnly(id, on) {
  const p = await dbGet('proyectos', id);
  if (!p) return;
  if (on) await setProjectSync(id, { localOnly: true });
  else { await setProjectSync(id, null); await syncProject(id); }
}
export async function markAllLocalOnly() {
  const all = await dbAll('proyectos');
  for (const p of all) if (!p.sync || p.sync.folderId !== st.folderId) await setProjectSync(p.id, { localOnly: true });
}

// Archivos .json de la carpeta que no son proyectos de la carpeta (exportados a mano, copias de conflicto de OneDrive):
// se importan como proyecto aparte y el archivo suelto pasa a la papelera
export function importForeign(name) {
  return serial(async () => {
    if (!(await ensurePerm())) throw new Error('Sin permiso para la carpeta.');
    const h = await st.handle.getFileHandle(name);
    const text = await (await h.getFile()).text();
    const obj = JSON.parse(text);
    let p;
    if (obj && obj.formato === FOLDER_FORMAT && obj.proyecto) {
        p = await copyFolderProjectAs(obj, `${(obj.proyecto.meta && obj.proyecto.meta.name) || 'Proyecto'} (de ${name.replace(/\.json$/i, '')})`);
    } else {
      p = await importProject(obj, name.replace(/(\.estadisticas)?\.json$/i, ''));
    }
    const t = await st.handle.getDirectoryHandle('papelera', { create: true });
    await writeFile(t, name, text);
    await st.handle.removeEntry(name);
    st.foreign = st.foreign.filter((x) => x !== name);
    emit();
    return p;
  });
}
export async function folderCounts() {
  if (!(await ensurePerm())) return null;
  try { const { byId } = await entriesById(); return { projects: byId.size }; } catch (e) { return null; }
}
