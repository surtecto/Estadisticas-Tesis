// Inicio: la planoteca de esta computadora (proyectos con sus figuras) y el asistente para empezar uno nuevo.
import { el, clear, readFileAs, downloadBlob, fmtNum, relTime, slug } from '../util.js';
import { listProjects, createProject, deleteProject, duplicateProject, exportProject, importProject, addTable, createFigure, defaultFigure, defaultMeta, WORK_KINDS, LICENSES } from '../library.js';
import { storageInfo, requestPersistence } from '../db.js';
import { MEDIA } from '../figure/media.js';
import { THEMES, FONTS } from '../charts/themes.js';
import { confirmDialog, promptDialog } from './dialogs.js';
import { pickFile, sheetConfigurator } from './importer.js';
import { readTableFile, parsePasted } from '../data/parse.js';
import { SAMPLES } from '../data/samples.js';
import { MODELS } from './models.js';
import { folderStatus, chooseFolder, reconnectFolder, unlinkFolder, syncAll, setDeviceName, deviceName, importForeign } from '../folder.js';

export function brandMark(size = 28) {
  return el('span', { class: 'brand-mark', html: `<svg viewBox="0 0 32 32" width="${size}" height="${size}" aria-hidden="true"><path d="M5 26h22" stroke="currentColor" stroke-width="1.3" opacity=".6"/><rect x="7" y="15" width="4" height="11" fill="currentColor" opacity=".9"/><rect x="14" y="9" width="4" height="17" fill="currentColor" opacity=".9"/><rect x="21" y="18" width="4" height="8" fill="currentColor" opacity=".9"/><path d="M5 13c5-5 9 2 13-3s7-4 9-5" fill="none" stroke="#e8501c" stroke-width="1.6"/><circle cx="27" cy="5" r="1.7" fill="#e8501c"/></svg>` });
}
const kindName = (k) => (WORK_KINDS.find((x) => x[0] === k) || [k, ''])[1];
function topBar(tag, tools = []) {
  return el('header', { class: 'home-top' }, el('a', { class: 'brand', href: '#/' }, brandMark(), el('span', { class: 'wordmark' }, 'Estadísticas-Tesis')), tag ? el('span', { class: 'home-tag' }, tag) : null, el('div', { class: 'home-top-tools' }, ...tools));
}
function prepareRoot() {
  const root = document.getElementById('home');
  clear(root); root.hidden = false;
  document.body.classList.add('on-home');
  document.getElementById('app').hidden = true;
  window.scrollTo(0, 0);
  return root;
}

// ---------- inicio ----------
export async function renderHome(app) {
  const root = prepareRoot();
  const [projects, st] = await Promise.all([listProjects().catch((e) => { app.toast(e.message, 'error'); return []; }), storageInfo()]);
  const fs0 = folderStatus();
  if (fs0.ready && !fs0.busy && (!app._lastHomeSync || Date.now() - app._lastHomeSync > 10000)) {
    app._lastHomeSync = Date.now();
    syncAll().then((r) => { if (r.imported.length || r.updated.length || r.conflicts.length) { app.toast(`Carpeta: ${r.imported.length} proyecto(s) nuevo(s), ${r.updated.length} actualizado(s)${r.conflicts.length ? `, ${r.conflicts.length} con dos versiones` : ''}.`); renderHome(app); } });
  }
  const importBtn = el('button', { type: 'button', class: 'btn ghost', onclick: () => importFlow(app) }, 'Importar proyecto');
  root.appendChild(topBar('Gráficos y mapas estadísticos para tesis e investigación', [importBtn]));
  const main = el('div', { class: `home-main ${projects.length ? 'has-projects' : ''}` });
  // columna de inicio
  const start = el('section', { class: 'home-start' },
    el('button', { type: 'button', class: 'blank-sheet', onclick: () => app.go('#/nuevo') }, el('span', { class: 'crop tl' }), el('span', { class: 'crop tr' }), el('span', { class: 'crop bl' }), el('span', { class: 'crop br' }),
      el('span', { class: 'bs-figure', html: sheetDrawing() }),
      el('span', { class: 'bs-title' }, 'Proyecto nuevo'), el('span', { class: 'bs-text' }, 'Los datos del trabajo, una tabla de Excel, CSV u ODS, y la primera figura: el destino, el estilo y el tipo de gráfico que conviene a tus variables.')),
    el('button', { type: 'button', class: 'btn rebuild-btn', onclick: async () => { const { rebuildAsProject } = await import('./interpret.js'); rebuildAsProject(app); } }, el('strong', {}, 'Rehacer un gráfico existente'), el('span', {}, 'Desde una imagen (JPG, PNG, captura de pantalla) o un JSON: la app lee el tipo, los ejes de abajo y de arriba, los rótulos, las notas y los valores, y lo arma de nuevo para editarlo.')),
    el('h2', {}, 'Modelos de ejemplo'), el('p', { class: 'home-note' }, 'Proyectos armados con datos reales para ver qué se puede hacer: se copian a tu planoteca y se pueden modificar.'),
    el('div', { class: 'examples' }, ...MODELS.map((m) => el('button', { type: 'button', class: 'example', onclick: () => openModel(app, m) }, el('strong', {}, m.name), el('span', {}, m.desc)))));
  // planoteca
  const lib = el('section', { class: 'home-library' }, el('div', { class: 'lib-head' }, el('h1', {}, 'Proyectos en esta computadora'), el('span', { class: 'lib-count' }, String(projects.length))));
  const grid = el('div', { class: 'project-grid' });
  if (!projects.length) grid.appendChild(el('div', { class: 'empty-projects' }, el('strong', {}, 'Todavía no hay proyectos.'), el('span', {}, 'Empezá uno nuevo o abrí un modelo de ejemplo. Todo se guarda en este navegador; con una carpeta de proyectos (abajo) se comparte entre computadoras.')));
  for (const p of projects) grid.appendChild(projectSheet(app, p));
  lib.appendChild(grid);
  lib.appendChild(folderBox(app));
  lib.appendChild(el('div', { class: 'home-foot' },
    el('p', {}, `Espacio usado en el navegador: ${st.usage != null ? `${fmtNum(st.usage / 1048576, 1)} MB` : '—'}${st.persisted ? ' · almacenamiento persistente' : ''}.`, st.persisted === false ? el('button', { type: 'button', class: 'btn small ghost', onclick: async () => { const ok = await requestPersistence(); app.toast(ok ? 'El navegador no borrará los proyectos para liberar espacio.' : 'El navegador no aceptó (Chrome lo concede con el uso).'); } }, 'Pedir que no se borren') : null),
    el('p', {}, 'Estadísticas-Tesis deriva de Mapas-Tesis y comparte su modo de trabajo: proyectos por computadora, destinos de la figura y preguntas a la figura. Motor estadístico propio verificado contra SciPy y statsmodels.')));
  main.append(start, lib);
  root.appendChild(main);
}
function sheetDrawing() {
  return `<svg viewBox="0 0 120 70" width="100%" aria-hidden="true"><g fill="none" stroke="#14263a" stroke-width=".8"><path d="M6 62h108M6 62V6"/></g><g fill="#14263a"><rect x="14" y="40" width="9" height="22" opacity=".85"/><rect x="28" y="28" width="9" height="34" opacity=".85"/><rect x="42" y="34" width="9" height="28" opacity=".85"/></g><g fill="#e8501c"><circle cx="66" cy="46" r="1.8"/><circle cx="72" cy="40" r="1.8"/><circle cx="78" cy="42" r="1.8"/><circle cx="84" cy="30" r="1.8"/><circle cx="91" cy="27" r="1.8"/><circle cx="98" cy="20" r="1.8"/><circle cx="105" cy="16" r="1.8"/></g><path d="M62 50L110 12" stroke="#e8501c" stroke-width=".9" stroke-dasharray="2 1.5"/></svg>`;
}
function projectSheet(app, p) {
  const f0 = p.figures[0];
  const sheet = el('article', { class: `project-sheet ${p.figures.length > 1 ? 'multi' : ''}` });
  const menu = el('div', { class: 'menu pc-menu', hidden: true });
  const act = (label, fn, cls) => el('button', { type: 'button', class: cls, onclick: async () => { menu.hidden = true; await fn(); } }, label);
  menu.append(
    act('Abrir', () => app.go(`#/p/${p.id}`)),
    act('Duplicar', async () => { await duplicateProject(p.id); renderHome(app); }),
    act('Exportar (.json)', async () => { const o = await exportProject(p.id); downloadBlob(new Blob([JSON.stringify(o)], { type: 'application/json' }), `${slug(p.meta.name)}.estadisticas.json`); }),
    el('hr'),
    act('Eliminar…', async () => { if (await confirmDialog({ title: `¿Eliminar «${p.meta.name || 'Proyecto'}»?`, text: `Se borran sus ${p.figures.length} figura(s) y ${p.tableCount} tabla(s) de esta computadora.`, note: folderStatus().linked ? 'En la carpeta de proyectos pasa a la papelera.' : 'Si querés conservarlo, exportalo antes.', ok: 'Eliminar', danger: true })) { await deleteProject(p.id); renderHome(app); } }, 'danger'));
  const more = el('button', { type: 'button', class: 'pc-more', 'aria-label': 'Más acciones', onclick: (e) => { e.stopPropagation(); menu.hidden = !menu.hidden; } }, '⋯');
  document.addEventListener('click', (e) => { if (!menu.contains(e.target) && e.target !== more) menu.hidden = true; });
  sheet.append(
    el('button', { type: 'button', class: 'ps-open', onclick: () => app.go(`#/p/${p.id}`) },
      el('span', { class: 'ps-paper' }, f0 && f0.thumb ? el('img', { src: f0.thumb, alt: '' }) : el('span', { class: 'ps-nothumb' }, 'Sin figura todavía')),
      el('span', { class: 'ps-name' }, p.meta.name || 'Proyecto sin nombre'),
      p.meta.title ? el('span', { class: 'ps-title' }, p.meta.title) : null),
    el('dl', { class: 'rotulo' },
      el('div', {}, el('dt', {}, 'Trabajo'), el('dd', {}, kindName(p.meta.kind) || '—')),
      el('div', {}, el('dt', {}, 'Figuras · tablas'), el('dd', {}, `${p.figures.length} · ${p.tableCount}`)),
      el('div', {}, el('dt', {}, 'Autoría'), el('dd', {}, p.meta.author || '—')),
      el('div', {}, el('dt', {}, 'Últimos cambios'), el('dd', {}, relTime(p.updated)))),
    more, menu);
  return sheet;
}
function folderBox(app) {
  const s = folderStatus();
  const box = el('section', { class: 'folder-box' });
  if (!s.supported) { box.append(el('h2', {}, 'Carpeta de proyectos'), el('p', { class: 'home-note' }, 'Para compartir proyectos entre computadoras por OneDrive o Google Drive hace falta Chrome o Edge. Mientras tanto, exportá e importá el proyecto (.json).')); return box; }
  box.appendChild(el('h2', {}, 'Carpeta de proyectos'));
  if (!s.linked) {
    box.append(el('p', { class: 'home-note' }, 'Elegí una carpeta dentro de OneDrive, Google Drive o Dropbox: cada proyecto se guarda ahí como archivo y otra computadora que elija la misma carpeta ve los mismos proyectos.'),
      el('button', { type: 'button', class: 'btn', onclick: async () => { try { await chooseFolder(); await syncAll(); renderHome(app); } catch (e) { if (e.name !== 'AbortError') app.toast(e.message, 'error'); } } }, 'Elegir carpeta…'));
    return box;
  }
  box.append(el('p', { class: 'home-note' }, `«${s.name}» en «${s.device}»${s.lastSync ? ` · revisada ${relTime(s.lastSync)}` : ''}${s.error ? ` · ${s.error}` : ''}`),
    el('div', { class: 'btn-row' },
      s.perm !== 'granted' ? el('button', { type: 'button', class: 'btn primary', onclick: async () => { if (await reconnectFolder()) { await syncAll(); renderHome(app); } } }, 'Dar permiso a la carpeta') : el('button', { type: 'button', class: 'btn', onclick: async () => { await syncAll(); renderHome(app); } }, 'Sincronizar ahora'),
      el('button', { type: 'button', class: 'btn ghost', onclick: async () => { const n = await promptDialog({ title: 'Nombre de esta computadora', value: deviceName() }); if (n) { setDeviceName(n); renderHome(app); } } }, 'Nombre de la computadora'),
      el('button', { type: 'button', class: 'btn ghost', onclick: async () => { if (await confirmDialog({ title: '¿Dejar de usar la carpeta?', text: 'Los proyectos quedan en esta computadora y en la carpeta; solo se deja de sincronizar.' })) { await unlinkFolder(); renderHome(app); } } }, 'Desvincular')));
  if (s.foreign.length) box.appendChild(el('div', { class: 'warn-note' }, `Hay ${s.foreign.length} archivo(s) sueltos en la carpeta: `, ...s.foreign.slice(0, 5).map((n) => el('button', { type: 'button', class: 'btn small', onclick: async () => { try { await importForeign(n); renderHome(app); } catch (e) { app.toast(e.message, 'error'); } } }, `Importar ${n}`))));
  return box;
}
async function importFlow(app) {
  const f = await pickFile('.json');
  if (!f) return;
  try { const p = await importProject(JSON.parse(await readFileAs(f, 'text')), f.name.replace(/(\.estadisticas)?\.json$/i, '')); app.toast(`Proyecto «${p.meta.name}» importado.`); renderHome(app); }
  catch (e) { app.toast(`No se pudo importar: ${e.message}`, 'error'); }
}
async function openModel(app, m) {
  try {
    const p = await m.create();
    app.go(`#/p/${p.id}`);
  } catch (e) { console.error(e); app.toast(`No se pudo abrir el modelo: ${e.message}`, 'error'); }
}

// ---------- asistente de proyecto nuevo ----------
export async function renderWizard(app) {
  const root = prepareRoot();
  const S = { step: 0, meta: defaultMeta({ name: '' }), src: null, table: null, sample: null, mediaId: 'tesis-a4', styleId: 'tesis' };
  root.appendChild(topBar('Proyecto nuevo', [el('button', { type: 'button', class: 'btn ghost', onclick: () => app.go('#/') }, 'Cancelar')]));
  const wrap = el('div', { class: 'wizard' });
  root.appendChild(wrap);
  const steps = ['El trabajo', 'Los datos', 'La primera figura'];
  const draw = () => {
    clear(wrap);
    wrap.appendChild(el('ol', { class: 'wiz-steps' }, ...steps.map((s, i) => el('li', { class: i === S.step ? 'on' : i < S.step ? 'done' : '' }, el('span', { class: 'n' }, String(i + 1)), s))));
    const box = el('section', { class: 'wiz-step' });
    wrap.appendChild(box);
    if (S.step === 0) stepMeta(box);
    else if (S.step === 1) stepData(box);
    else stepFigure(box);
  };
  const wfI = (k, label, ph = '', hint = '') => { const i = el('input', { type: 'text', value: S.meta[k] || '', placeholder: ph }); i.addEventListener('input', () => { S.meta[k] = i.value; }); return el('label', { class: 'wf' }, el('span', { class: 'wf-l' }, label), i, hint ? el('span', { class: 'wf-h' }, hint) : null); };
  const wfS = (k, label, opts) => { const s = el('select', {}, ...opts.map(([v, l]) => el('option', { value: v, selected: S.meta[k] === v }, l))); s.addEventListener('change', () => { S.meta[k] = s.value; }); return el('label', { class: 'wf' }, el('span', { class: 'wf-l' }, label), s); };
  function stepMeta(box) {
    const name = wfI('name', 'Nombre del proyecto', 'p. ej. Censos del Pago Gilense', 'Para reconocerlo en la planoteca.');
    box.append(el('h1', {}, 'El trabajo'), el('p', { class: 'wiz-lead' }, 'Estos datos van a la ficha metodológica y a la autoría de las figuras. Se pueden completar o cambiar después.'),
      el('div', { class: 'wf-grid' }, name, wfS('kind', 'Tipo de trabajo', WORK_KINDS), el('div', { class: 'span2' }, wfI('title', 'Título de la tesis o del trabajo')), wfI('author', 'Autoría'), wfI('institution', 'Institución'), wfI('director', 'Dirección'), wfI('year', 'Año'), wfS('license', 'Licencia de las figuras', LICENSES), wfS('decimal', 'Separador decimal en las figuras', [['comma', 'Coma (3,14 · uso argentino)'], ['dot', 'Punto (3.14 · revistas en inglés)']])),
      el('div', { class: 'wiz-nav' }, el('span'), el('button', { type: 'button', class: 'btn primary big', onclick: () => { if (!S.meta.name.trim()) { name.querySelector('input').classList.add('invalid'); name.querySelector('input').focus(); return; } S.step = 1; draw(); } }, 'Seguir: los datos →')));
  }
  function stepData(box) {
    box.classList.add('wide');
    box.append(el('h1', {}, 'Los datos'), el('p', { class: 'wiz-lead' }, 'Una tabla con una fila por caso (partido, persona, año, parcela…) y una columna por variable. Si viene con títulos arriba o notas abajo, lo resolvés acá.'));
    const area = el('div', {});
    const msg = el('p', { class: 'dlg-msg', hidden: true });
    const showSrc = () => { clear(area); area.appendChild(sheetConfigurator(S.src, (t) => { S.table = t; })); };
    const pickRow = el('div', { class: 'start-choice three' },
      el('button', { type: 'button', class: 'choice choice-file', onclick: async () => { const f = await pickFile(); if (!f) return; try { S.src = await readTableFile(f); S.sample = null; if (!S.meta.name) S.meta.name = f.name.replace(/\.[^.]+$/, ''); showSrc(); } catch (e) { msg.textContent = `No se pudo leer: ${e.message}`; msg.hidden = false; } } }, el('strong', {}, 'Un archivo'), el('span', {}, 'Excel, ODS, CSV o JSON')),
      el('button', { type: 'button', class: 'choice choice-paste', onclick: () => { clear(area); const ta = el('textarea', { rows: 8, class: 'paste-area', placeholder: 'Pegá aquí las celdas copiadas de la planilla, con el encabezado…' }); ta.addEventListener('paste', () => setTimeout(() => { const rows = parsePasted(ta.value); if (rows.length > 1) { S.src = { file: 'Datos pegados', sheets: [{ name: 'Pegado', rows }] }; showSrc(); } }, 30)); area.appendChild(ta); ta.focus(); } }, el('strong', {}, 'Pegar celdas'), el('span', {}, 'Copiadas de Excel o Google Sheets')),
      el('button', { type: 'button', class: 'choice choice-later', onclick: () => { S.table = null; S.src = null; S.step = 2; draw(); } }, el('strong', {}, 'Más tarde'), el('span', {}, 'Empezar sin datos')));
    box.append(pickRow, msg, area);
    box.append(el('h2', {}, 'O una tabla de ejemplo'), el('div', { class: 'examples cols' }, ...SAMPLES.map((s) => el('button', { type: 'button', class: 'example', onclick: () => { S.table = s.build(); S.sample = s; S.src = null; clear(area); area.appendChild(el('p', { class: 'ok-note' }, `«${S.table.name}»: ${S.table.rows.length} filas y ${S.table.columns.length} columnas. ${s.source}`)); } }, el('strong', {}, s.name), el('span', {}, s.desc)))));
    box.append(el('div', { class: 'wiz-nav' }, el('button', { type: 'button', class: 'btn ghost', onclick: () => { S.step = 0; draw(); } }, '← Volver'), el('button', { type: 'button', class: 'btn primary big', onclick: () => { if (!S.table) { msg.textContent = 'Elegí un archivo, pegá celdas o una tabla de ejemplo (o «Más tarde»).'; msg.hidden = false; return; } S.step = 2; draw(); } }, 'Seguir: la figura →')));
  }
  function stepFigure(box) {
    box.classList.add('wide');
    box.append(el('h1', {}, 'La primera figura'), el('p', { class: 'wiz-lead' }, 'Dónde se va a ver decide el tamaño, la resolución y el tamaño mínimo de los textos. El estilo se puede cambiar en cualquier momento.'));
    const ms = el('div', { class: 'media-pick' });
    for (const g of [...new Set(MEDIA.map((x) => x.group))]) {
      ms.appendChild(el('div', { class: 'mp-group' }, el('span', { class: 'mp-h' }, g), ...MEDIA.filter((x) => x.group === g).map((x) => el('button', { type: 'button', class: `mp-item ${S.mediaId === x.id ? 'on' : ''}`, onclick: () => { S.mediaId = x.id; draw(); } }, x.name))));
    }
    const sty = el('div', { class: 'styles wide' }, ...THEMES.map((t) => el('button', { type: 'button', class: `style-card ${S.styleId === t.id ? 'on' : ''}`, title: t.desc, onclick: () => { S.styleId = t.id; draw(); } }, el('span', { class: 'sc-sw', style: { background: t.bg } }), el('span', { class: 'sc-name', style: { fontFamily: FONTS[t.font] } }, t.name))));
    box.append(el('h2', {}, 'Destino'), ms, el('h2', {}, 'Estilo'), sty);
    const go = el('button', { type: 'button', class: 'btn primary big' }, 'Crear el proyecto');
    go.addEventListener('click', async () => {
      go.disabled = true;
      try {
        S.meta.mediaId = S.mediaId; S.meta.styleId = S.styleId;
        const p = await createProject(S.meta);
        let t = null;
        if (S.table) t = await addTable(p.id, S.table);
        const panels = [];
        if (t) {
          const { defaultPanel } = await import('../charts/types.js');
          const { levelsOf, isCat, isNum } = await import('../data/table.js');
          const pn = defaultPanel(t, 'bar');
          const cat = t.columns.find((c) => isCat(c) && levelsOf(t, c.key).length <= 12);
          const num = t.columns.find((c) => isNum(c));
          if (cat) { pn.enc.x = cat.key; pn.agg = 'count'; } else if (num) { pn.type = 'hist'; pn.enc.y = num.key; }
          panels.push(pn);
        }
        await createFigure(p.id, defaultFigure({ name: 'Figura 1', style: S.styleId, media: { profileId: S.mediaId, quality: 'estandar' }, caption: { mode: ['periodistico', 'info-azul', 'neon'].includes(S.styleId) ? 'titulo' : 'apa', number: '1', note: '', source: t && t.source && t.source.citation ? t.source.citation : '', autoNotes: true, inside: true }, panels }));
        app.go(`#/p/${p.id}`);
      } catch (e) { app.toast(e.message, 'error'); go.disabled = false; }
    });
    box.append(el('div', { class: 'wiz-nav' }, el('button', { type: 'button', class: 'btn ghost', onclick: () => { S.step = 1; draw(); } }, '← Volver'), go));
  }
  draw();
}
