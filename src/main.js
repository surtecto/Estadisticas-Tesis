// Estadísticas-Tesis: gráficos y mapas estadísticos para tesis e investigación (modelo de Mapas-Tesis).
// Rutas: #/ (proyectos de esta computadora), #/nuevo (asistente), #/p/<proyecto>/<figura> (editor).
import { el, clear } from './util.js';
import { renderHome, renderWizard } from './ui/home.js';
import { openEditor, closeEditor } from './ui/editor.js';
import { onProjectChange } from './library.js';
import { initFolder, scheduleProjectWrite, trashProject, onFolderStatus, flushWrites } from './folder.js';

const app = {
  current: null,
  toast(msg, kind = 'info', ms = 4200) {
    const box = document.getElementById('toast');
    const it = el('div', { class: `toast-item ${kind}` }, msg);
    box.appendChild(it);
    setTimeout(() => { it.classList.add('out'); setTimeout(() => it.remove(), 400); }, ms);
  },
  go(hash) { if (location.hash !== hash) location.hash = hash; else route(); },
};
window.__et = app;

onProjectChange((id, kind, extra) => {
  if (kind === 'delete') { trashProject(extra); return; }
  scheduleProjectWrite(id, () => (app.current ? app.current.projectId : null), (pid, r) => {
    if (r && r.remoteNewer && app.onRemoteNewer) app.onRemoteNewer(r);
  });
});
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flushWrites(() => (app.current ? app.current.projectId : null)); });
onFolderStatus((s) => { if (app.onFolderStatus) app.onFolderStatus(s); });

async function route() {
  const h = location.hash || '#/';
  try {
    if (h.startsWith('#/p/')) {
      const [, , pid, fid] = h.split('/');
      await openEditor(app, decodeURIComponent(pid), fid ? decodeURIComponent(fid) : null);
      return;
    }
    await closeEditor(app);
    if (h.startsWith('#/nuevo')) await renderWizard(app);
    else await renderHome(app);
  } catch (e) {
    console.error(e);
    app.toast(`No se pudo abrir: ${e.message}`, 'error', 8000);
    if (h !== '#/') { location.hash = '#/'; }
  }
}
window.addEventListener('hashchange', route);
window.addEventListener('beforeunload', () => { if (app.current && app.current.flush) app.current.flush(); });
(async () => {
  await initFolder().catch(() => null);
  route();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { if (app.current && app.current.redraw) app.current.redraw(); });
})();
export { app, clear };
