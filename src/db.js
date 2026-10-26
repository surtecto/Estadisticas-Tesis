// Base de datos local (IndexedDB) de Estadísticas-Tesis: proyectos, tablas de datos y figuras.
// Todo queda en el navegador de cada computadora: dos computadoras nunca se pisan entre sí,
// y dentro de una misma computadora cada proyecto y cada figura tiene su propio registro.
const NAME = 'estadisticas-tesis';
const VERSION = 1;

let dbp = null;
export function openDB() {
  if (!dbp) {
    dbp = new Promise((resolve, reject) => {
      if (!('indexedDB' in window)) { reject(new Error('Este navegador no permite guardar proyectos (IndexedDB).')); return; }
      const r = indexedDB.open(NAME, VERSION);
      r.onupgradeneeded = () => {
        const d = r.result;
        if (!d.objectStoreNames.contains('proyectos')) d.createObjectStore('proyectos', { keyPath: 'id' });
        for (const st of ['tablas', 'figuras']) {
          if (!d.objectStoreNames.contains(st)) {
            const m = d.createObjectStore(st, { keyPath: 'id' });
            m.createIndex('projectId', 'projectId', { unique: false });
          }
        }
      };
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
      r.onblocked = () => reject(new Error('La base local está abierta en otra pestaña con una versión anterior: cerrala y recargá.'));
    });
    dbp.catch(() => { dbp = null; });
  }
  return dbp;
}

export async function tx(store, mode, fn) {
  const d = await openDB();
  return new Promise((resolve, reject) => {
    const t = d.transaction(store, mode);
    const st = t.objectStore(store);
    let req;
    try { req = fn(st); } catch (err) { reject(err); return; }
    t.oncomplete = () => resolve(req && 'result' in req ? req.result : undefined);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error || new Error('Operación cancelada'));
  });
}

export const dbGet = (store, key) => tx(store, 'readonly', (st) => st.get(key));
export const dbPut = (store, value, key) => tx(store, 'readwrite', (st) => (key === undefined ? st.put(value) : st.put(value, key)));
export const dbDelete = (store, key) => tx(store, 'readwrite', (st) => st.delete(key));
export const dbAll = (store) => tx(store, 'readonly', (st) => st.getAll());
export const dbAllKeys = (store) => tx(store, 'readonly', (st) => st.getAllKeys());
export const dbByIndex = (store, index, value) => tx(store, 'readonly', (st) => st.index(index).getAll(value));

// Espacio usado y pedido de almacenamiento persistente (para que el navegador no borre los proyectos)
export async function storageInfo() {
  const out = { usage: null, quota: null, persisted: null };
  try {
    if (navigator.storage && navigator.storage.estimate) { const e = await navigator.storage.estimate(); out.usage = e.usage; out.quota = e.quota; }
    if (navigator.storage && navigator.storage.persisted) out.persisted = await navigator.storage.persisted();
  } catch (e) { /* noop */ }
  return out;
}
export async function requestPersistence() {
  try { return navigator.storage && navigator.storage.persist ? await navigator.storage.persist() : false; } catch (e) { return false; }
}
