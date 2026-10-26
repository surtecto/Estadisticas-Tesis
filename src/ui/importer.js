// Importar una tabla: archivo (Excel, ODS, CSV, JSON), texto pegado desde una planilla o tabla de ejemplo.
// Permite elegir la hoja, la fila de encabezado (las tablas del INDEC suelen traer títulos arriba y notas abajo)
// y revisar los tipos detectados antes de aceptar.
import { el, clear } from '../util.js';
import { readTableFile, parsePasted, guessHeaderRow, guessFooterRows } from '../data/parse.js';
import { buildTable, TYPES } from '../data/table.js';
import { SAMPLES } from '../data/samples.js';
import { formDialog } from './dialogs.js';

export async function pickFile(accept = '.xlsx,.xls,.xlsm,.ods,.csv,.tsv,.txt,.json') {
  return new Promise((resolve) => {
    const i = el('input', { type: 'file', accept, hidden: true });
    i.addEventListener('change', () => { resolve(i.files[0] || null); i.remove(); });
    document.body.appendChild(i);
    i.click();
  });
}

// Configura la lectura de una matriz cruda (hoja) y devuelve la tabla tipificada
export function sheetConfigurator(src, onChange) {
  const st = { sheet: 0, headerRow: 0, headerRows: 1, footer: 0, name: '' };
  const root = el('div', { class: 'imp' });
  const reset = () => {
    const rows = src.sheets[st.sheet].rows;
    st.headerRow = guessHeaderRow(rows);
    st.footer = guessFooterRows(rows, st.headerRow);
    st.name = src.sheets.length > 1 ? src.sheets[st.sheet].name : (src.file || 'Tabla').replace(/\.[^.]+$/, '');
  };
  reset();
  const draw = () => {
    clear(root);
    const sh = src.sheets[st.sheet];
    const ctl = el('div', { class: 'imp-ctl' });
    if (src.sheets.length > 1) {
      const s = el('select', {}, ...src.sheets.map((x, i) => el('option', { value: i, selected: i === st.sheet }, `${x.name} (${x.rows.length} filas)`)));
      s.addEventListener('change', () => { st.sheet = +s.value; reset(); draw(); });
      ctl.appendChild(el('label', { class: 'wf' }, el('span', { class: 'wf-l' }, 'Hoja'), s));
    }
    const nm = el('input', { type: 'text', value: st.name });
    nm.addEventListener('input', () => { st.name = nm.value; });
    const hr = el('input', { type: 'number', min: 1, max: Math.max(1, sh.rows.length), value: st.headerRow + 1, class: 'num' });
    hr.addEventListener('change', () => { st.headerRow = Math.max(0, (+hr.value || 1) - 1); draw(); });
    const hn = el('select', {}, el('option', { value: 1, selected: st.headerRows === 1 }, 'una fila'), el('option', { value: 2, selected: st.headerRows === 2 }, 'dos filas (se unen)'), el('option', { value: 0, selected: st.headerRows === 0 }, 'sin encabezado'));
    hn.addEventListener('change', () => { st.headerRows = +hn.value; draw(); });
    const ft = el('input', { type: 'number', min: 0, value: st.footer, class: 'num' });
    ft.addEventListener('change', () => { st.footer = Math.max(0, +ft.value || 0); draw(); });
    ctl.append(el('label', { class: 'wf' }, el('span', { class: 'wf-l' }, 'Nombre de la tabla'), nm), el('label', { class: 'wf' }, el('span', { class: 'wf-l' }, 'Fila del encabezado'), hr), el('label', { class: 'wf' }, el('span', { class: 'wf-l' }, 'Encabezado en'), hn), el('label', { class: 'wf' }, el('span', { class: 'wf-l' }, 'Filas de notas al final a descartar'), ft));
    root.appendChild(ctl);
    // vista previa cruda con el encabezado marcado
    const prev = el('table', { class: 'imp-raw' });
    const lim = Math.min(sh.rows.length, Math.max(st.headerRow + 9, 12));
    const width = Math.min(14, Math.max(...sh.rows.slice(0, lim).map((r) => r.length)));
    for (let i = 0; i < lim; i++) {
      const r = sh.rows[i] || [];
      const cls = st.headerRows && i >= st.headerRow && i < st.headerRow + st.headerRows ? 'hdr' : i < st.headerRow ? 'skip' : '';
      prev.appendChild(el('tr', { class: cls }, el('th', {}, String(i + 1)), ...Array.from({ length: width }, (_, j) => el('td', {}, r[j] == null ? '' : String(r[j]).slice(0, 28)))));
    }
    if (st.footer) prev.appendChild(el('tr', { class: 'skip' }, el('th', {}, '…'), el('td', { colspan: width }, `y se descartan las últimas ${st.footer} filas`)));
    root.appendChild(el('div', { class: 'imp-raw-wrap' }, prev));
    let t = null;
    try { t = buildTable(sh.rows, { name: st.name, headerRow: st.headerRow, headerRows: st.headerRows, footer: st.footer, source: { file: src.file, sheet: src.sheets.length > 1 ? sh.name : '' } }); }
    catch (e) { root.appendChild(el('p', { class: 'warn-note' }, e.message)); }
    if (t) {
      const typeName = (k) => (TYPES.find((x) => x[0] === k) || [k, k])[1].split(' (')[0];
      root.appendChild(el('p', { class: 'note' }, `${t.rows.length} filas y ${t.columns.length} columnas. Tipos detectados (se pueden cambiar después en Datos):`));
      root.appendChild(el('div', { class: 'imp-types' }, ...t.columns.map((c) => el('span', { class: `tchip t-${c.type}` }, el('b', {}, c.name), ` ${typeName(c.type)}${c.unit ? ` · ${c.unit}` : ''}`))));
    }
    onChange(t);
  };
  draw();
  return root;
}

// Diálogo completo: devuelve una tabla o null
export async function importDialog({ title = 'Agregar datos', allowSamples = true } = {}) {
  let table = null;
  let src = null;
  const area = el('div', {});
  const pick = el('div', { class: 'imp-pick' });
  const fileBtn = el('button', { type: 'button', class: 'btn primary', onclick: async () => {
    const f = await pickFile();
    if (!f) return;
    try { src = await readTableFile(f); if (!src.sheets.length) throw new Error('El archivo no tiene datos.'); show(); } catch (e) { msg.textContent = `No se pudo leer «${f.name}»: ${e.message}`; msg.hidden = false; }
  } }, 'Elegir archivo…');
  const ta = el('textarea', { rows: 5, placeholder: 'O pegá aquí celdas copiadas de Excel, LibreOffice o Google Sheets (con su encabezado)…' });
  ta.addEventListener('paste', () => setTimeout(() => { const rows = parsePasted(ta.value); if (rows.length > 1) { src = { file: 'Datos pegados', sheets: [{ name: 'Pegado', rows }] }; show(); } }, 30));
  const msg = el('p', { class: 'dlg-msg', hidden: true });
  pick.append(el('div', { class: 'imp-drop' }, fileBtn, el('span', { class: 'note' }, 'Excel (.xlsx, .xls), OpenDocument (.ods), CSV o TSV (detecta coma o punto y coma, y la codificación de Windows), JSON.')), ta, msg);
  if (allowSamples) {
    pick.appendChild(el('h3', { class: 'imp-h' }, 'Tablas de ejemplo, con datos reales'));
    pick.appendChild(el('div', { class: 'examples' }, ...SAMPLES.map((s) => el('button', { type: 'button', class: 'example', onclick: () => { table = s.build(); table.source = { ...table.source, sample: s.id }; show(true); } }, el('strong', {}, s.name), el('span', {}, s.desc)))));
  }
  // arrastrar y soltar
  area.addEventListener('dragover', (e) => { e.preventDefault(); area.classList.add('drag'); });
  area.addEventListener('dragleave', () => area.classList.remove('drag'));
  area.addEventListener('drop', async (e) => { e.preventDefault(); area.classList.remove('drag'); const f = e.dataTransfer.files[0]; if (f) { try { src = await readTableFile(f); show(); } catch (er) { msg.textContent = er.message; msg.hidden = false; } } });
  let chart = null;
  const show = (ready = false) => {
    clear(area);
    if (ready) { area.appendChild(el('p', {}, `Tabla «${table.name}»: ${table.rows.length} filas, ${table.columns.length} columnas.`)); return; }
    if (src && src.chartSpec) {
      area.appendChild(el('div', { class: 'info-note' }, el('p', {}, el('strong', {}, 'Este JSON describe un gráfico completo. '), `${(src.notes || []).join(' ')} Si lo traés como tabla suelta se pierden los ejes; conviene rehacerlo entero.`),
        el('button', { type: 'button', class: 'btn primary small', onclick: () => { chart = { chartSpec: src.chartSpec, notes: src.notes }; const d = document.getElementById('app-dialog'); d.querySelector('.dlg-actions .btn.primary').click(); } }, 'Rehacer el gráfico completo (datos y ejes)')));
      if (src.sheets.length > 1) area.appendChild(el('p', { class: 'note' }, `O elegí abajo una de sus ${src.sheets.length} tablas.`));
    }
    area.appendChild(sheetConfigurator(src, (t) => { table = t; }));
  };
  area.appendChild(pick);
  const ok = await formDialog({ title, body: area, wide: true, ok: 'Agregar la tabla', validate: () => (chart || (table && table.rows.length) ? true : 'Elegí un archivo, pegá datos o una tabla de ejemplo.') });
  if (ok && chart) return chart;
  return ok ? table : null;
}
