// Pestaña Tesis: el proyecto, la legibilidad de la figura para su destino, la paleta frente al daltonismo y la
// impresión en grises, las preguntas a la figura y la ficha metodológica para el capítulo de métodos.
import { el } from '../util.js';
import { legibility, paletteCheck, questions, methodsNote } from '../figure/critique.js';
import { WORK_KINDS } from '../library.js';
import { getMedia } from '../figure/media.js';

export function renderThesisPanel(E, b) {
  const m = E.project.meta;
  b.appendChild(el('div', { class: 'proj-card' },
    el('div', { class: 'proj-card-head' }, el('span', { class: 'pc-kind' }, (WORK_KINDS.find((k) => k[0] === m.kind) || [, ''])[1])),
    el('strong', { class: 'proj-card-name' }, m.name || 'Proyecto'),
    m.title ? el('span', { class: 'proj-card-title' }, m.title) : null,
    el('span', { class: 'proj-card-meta' }, [m.author, m.institution, m.year].filter(Boolean).join(' · ') || 'Sin autoría cargada (Proyecto → Datos del proyecto)')));
  // legibilidad
  const md = getMedia(E.fig.media.profileId);
  const L = legibility(E.fig);
  const bad = L.filter((x) => !x.ok);
  const list = el('ul', { class: 'checks' }, ...L.map((x) => el('li', { class: x.ok ? 'ok' : 'bad' }, el('span', { class: 'ck' }, x.ok ? '✓' : '!'), el('span', {}, x.label), el('span', { class: 'ck-v' }, `${x.value}${x.ok ? '' : ` (mín. ${x.need})`}`))));
  const fix = bad.find((x) => x.fix);
  b.append(el('h3', { class: 'panel-h first' }, `Legibilidad para «${md.name}»`), list);
  if (fix) b.appendChild(el('div', { class: 'btn-row' }, el('button', { type: 'button', class: 'btn small primary', onclick: () => { Object.assign(E.fig, fix.fix); E.changed('legibilidad', { left: true, right: true }); } }, 'Agrandar la tipografía al mínimo del destino')));
  if (md.notes) b.appendChild(el('p', { class: 'note' }, md.notes));
  // paleta
  const pc = paletteCheck(E.fig, E.tables);
  if (pc) {
    const row = (label, d, need) => el('li', { class: d >= need ? 'ok' : 'bad' }, el('span', { class: 'ck' }, d >= need ? '✓' : '!'), el('span', {}, label), el('span', { class: 'ck-v' }, `ΔE ${d.toFixed(0)}`));
    b.append(el('h3', { class: 'panel-h' }, `Colores (${pc.n} categorías)`),
      el('div', { class: 'swatches' }, ...pc.colors.map((c) => el('span', { style: { background: c }, title: c }))),
      el('ul', { class: 'checks' }, ...pc.cvd.map((d) => row(d.label, d.minDeltaE ?? 0, d.type === 'normal' ? 15 : 8)), el('li', { class: (pc.gray.minDeltaL ?? 0) >= 12 ? 'ok' : 'bad' }, el('span', { class: 'ck' }, (pc.gray.minDeltaL ?? 0) >= 12 ? '✓' : '!'), el('span', {}, 'Impresión en grises'), el('span', { class: 'ck-v' }, `ΔL ${(pc.gray.minDeltaL ?? 0).toFixed(0)}`))),
      el('p', { class: 'note' }, 'Diferencia mínima entre dos colores de la paleta (ΔE: 8 o más se distingue con daltonismo; 15 con visión típica; ΔL: 12 o más en una fotocopia). Si no alcanza, cambiá la paleta o activá las tramas del estilo «Blanco y negro».'));
  }
  // preguntas
  const qs = questions(E.fig, E.tables, E.project);
  b.append(el('h3', { class: 'panel-h' }, 'Preguntas a la figura'),
    el('ul', { class: 'qlist' }, ...qs.map((q) => el('li', { class: `q-${q.level}` }, q.text))));
  // ficha
  const note = methodsNote(E.fig, E.tables, E.project);
  const ta = el('textarea', { rows: 6, readonly: true }, note);
  b.append(el('h3', { class: 'panel-h' }, 'Ficha metodológica'), el('p', { class: 'note' }, 'Para el capítulo de métodos o el anexo: datos, casos y herramienta.'), ta,
    el('div', { class: 'btn-row' }, el('button', { type: 'button', class: 'btn small', onclick: () => { try { navigator.clipboard.writeText(ta.value); E.toast('Copiado.'); } catch (e) { ta.select(); } } }, 'Copiar')));
}
