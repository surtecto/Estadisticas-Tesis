// Informe estadístico en Word (.docx): portada breve, resultados con tablas en formato APA (solo líneas horizontales),
// textos para la tesis, figuras elegidas a 300 ppp con su epígrafe y la ficha metodológica.
import { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, ImageRun, AlignmentType, WidthType, BorderStyle, HeadingLevel } from 'docx';
import { el, downloadBlob, slug } from '../util.js';
import { formDialog } from './dialogs.js';
import { listFigures } from '../library.js';
import { rasterize } from '../figure/export.js';
import { methodsNote } from '../figure/critique.js';
import { canvasToPng } from '../figure/raster.js';

const FONT = 'Times New Roman';
const run = (text, o = {}) => new TextRun({ text: String(text ?? ''), font: FONT, size: o.size || 24, bold: o.bold, italics: o.italics });
const para = (children, o = {}) => new Paragraph({ children: Array.isArray(children) ? children : [children], spacing: { after: o.after ?? 160, line: o.line ?? 360 }, alignment: o.align, heading: o.heading, keepNext: o.keepNext });
const NONE = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
const LINE = { style: BorderStyle.SINGLE, size: 6, color: '000000' };

function apaTable(b, n) {
  const cell = (text, { head = false, first = false, last = false, left = false } = {}) => new TableCell({
    children: [new Paragraph({ children: [run(text, { size: 20, bold: false })], alignment: left ? AlignmentType.LEFT : AlignmentType.CENTER, spacing: { after: 40, line: 240 } })],
    borders: { top: head ? LINE : NONE, bottom: head || last ? LINE : NONE, left: NONE, right: NONE },
  });
  const rows = [new TableRow({ tableHeader: true, children: b.head.map((h, j) => cell(h, { head: true, left: j === 0 })) })];
  b.rows.forEach((r, i) => rows.push(new TableRow({ children: r.map((c, j) => cell(c, { last: i === b.rows.length - 1, left: j === 0 })) })));
  const cap = String(b.caption || '').replace(/^Tabla\.\s*/, '');
  return [
    para([run(`Tabla ${n}`, { bold: true })], { after: 60, keepNext: true }),
    para([run(cap, { italics: true })], { after: 80, keepNext: true }),
    new Table({ rows, width: { size: 100, type: WidthType.PERCENTAGE } }),
    b.note ? para([run('Nota. ', { italics: true, size: 20 }), run(b.note, { size: 20 })], { after: 240, line: 240 }) : para([run('')], { after: 120 }),
  ];
}

export async function reportDialog(E) {
  const figs = await listFigures(E.projectId);
  const resSel = new Set(E.results.map((r) => r.id));
  const figSel = new Set([E.fig.id]);
  const box = el('div', {});
  box.append(el('p', { class: 'note' }, 'Un documento de Word con los resultados elegidos (tablas APA y textos), las figuras a 300 ppp con su epígrafe y la ficha metodológica. Fuente Times New Roman 12, interlineado 1,5.'));
  box.append(el('h3', { class: 'imp-h' }, 'Resultados'));
  if (!E.results.length) box.append(el('p', { class: 'note' }, 'No hay resultados calculados (pestaña Estadística).'));
  for (const r of E.results) { const i = el('input', { type: 'checkbox', checked: true }); i.addEventListener('change', () => { if (i.checked) resSel.add(r.id); else resSel.delete(r.id); }); box.append(el('label', { class: 'check' }, i, el('span', {}, r.res.title))); }
  box.append(el('h3', { class: 'imp-h' }, 'Figuras'));
  for (const f of figs) { const i = el('input', { type: 'checkbox', checked: figSel.has(f.id) }); i.addEventListener('change', () => { if (i.checked) figSel.add(f.id); else figSel.delete(f.id); }); box.append(el('label', { class: 'check' }, i, el('span', {}, f.id === E.fig.id ? E.fig.name : f.name))); }
  const msg = el('p', { class: 'export-progress' });
  box.append(msg);
  if (!(await formDialog({ title: 'Informe estadístico en Word', body: box, ok: 'Generar el .docx', wide: true }))) return;
  E.toast('Preparando el informe…');
  try {
    const blob = await buildReport(E, E.results.filter((r) => resSel.has(r.id)), figs.filter((f) => figSel.has(f.id)).map((f) => (f.id === E.fig.id ? E.fig : f)));
    downloadBlob(blob, `${slug(E.project.meta.name || 'informe')}-informe-estadistico.docx`);
  } catch (e) { console.error(e); E.toast(`No se pudo generar el informe: ${e.message}`, 'error', 8000); }
}

async function buildReport(E, results, figs) {
  const m = E.project.meta;
  const kids = [];
  kids.push(para([run(m.title || m.name || 'Informe estadístico', { bold: true, size: 28 })], { align: AlignmentType.CENTER, after: 120 }));
  kids.push(para([run([m.author, m.institution, m.year].filter(Boolean).join(' · '), { size: 22 })], { align: AlignmentType.CENTER, after: 360 }));
  let nT = 0, nF = 0;
  if (results.length) kids.push(para([run('Resultados', { bold: true, size: 26 })], { heading: HeadingLevel.HEADING_1, after: 200 }));
  for (const r of results) {
    kids.push(para([run(r.res.title, { bold: true })], { after: 120, keepNext: true }));
    for (const b of r.res.blocks) {
      if (b.type === 'table') { nT++; kids.push(...apaTable(b, nT)); }
      else if (b.type === 'apa' || b.type === 'text') kids.push(para([run(b.text)], { after: 200 }));
      else if (b.type === 'warn') kids.push(para([run(b.text, { italics: true, size: 22 })], { after: 160 }));
    }
  }
  if (figs.length) kids.push(para([run('Figuras', { bold: true, size: 26 })], { heading: HeadingLevel.HEADING_1, after: 200 }));
  for (const f of figs) {
    nF++;
    const { canvas, r } = await rasterize(f, { tables: E.tables, project: E.project, comma: E.project.meta.decimal !== 'dot' }, 300);
    const png = await canvasToPng(canvas, 300);
    const wmm = (r.wPt / 72) * 25.4, hmm = (r.hPt / 72) * 25.4;
    const maxW = 160;
    const k = Math.min(1, maxW / wmm);
    const px = (mm) => Math.round((mm * k / 25.4) * 96);
    const insideCap = f.caption && f.caption.mode === 'apa' && f.caption.inside !== false;
    if (!insideCap) {
      kids.push(para([run(`Figura ${f.caption && f.caption.number ? f.caption.number : nF}`, { bold: true })], { after: 60, keepNext: true }));
      if (f.title) kids.push(para([run(f.title, { italics: true })], { after: 80, keepNext: true }));
    }
    kids.push(new Paragraph({ children: [new ImageRun({ data: new Uint8Array(await png.arrayBuffer()), transformation: { width: px(wmm), height: px(hmm) }, type: 'png' })], spacing: { after: 120 } }));
    if (!insideCap && f.caption && (f.caption.note || f.caption.source)) kids.push(para([run('Nota. ', { italics: true, size: 20 }), run([f.caption.note, f.caption.source ? `Fuente: ${f.caption.source}` : ''].filter(Boolean).join(' '), { size: 20 })], { after: 240, line: 240 }));
  }
  kids.push(para([run('Ficha metodológica', { bold: true, size: 26 })], { heading: HeadingLevel.HEADING_1, after: 200 }));
  kids.push(para([run(methodsNote(E.fig, E.tables, E.project))]));
  const doc = new Document({ creator: m.author || 'Estadísticas-Tesis', title: m.title || m.name || 'Informe', styles: { default: { document: { run: { font: FONT, size: 24 } } } }, sections: [{ properties: { page: { margin: { top: 1418, bottom: 1418, left: 1701, right: 1418 } } }, children: kids }] });
  return Packer.toBlob(doc);
}
