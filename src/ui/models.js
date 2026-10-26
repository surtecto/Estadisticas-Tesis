// Modelos de ejemplo: proyectos completos con datos reales, para ver la herramienta funcionando y copiar ideas.
import { createProject, addTable, createFigure, defaultFigure, saveProject, getProject } from '../library.js';
import { getSample } from '../data/samples.js';
import { uid } from '../util.js';
import { buildTable } from '../data/table.js';

const k = (t, prefix) => { const c = t.columns.find((x) => x.name.startsWith(prefix)); if (!c) throw new Error(`Falta la columna ${prefix}`); return c.key; };
const P = (t, type, enc, options = {}, extra = {}) => ({ id: uid('P'), tableId: t.id, type, enc, options: { legend: 'auto', ...options }, filters: [], agg: 'sum', title: '', span: 1, ...extra });
async function finish(id) { const pr = await getProject(id); pr.activeFigureId = (pr.figureIds || [])[0] || null; await saveProject(pr); return pr; }
async function project(meta, sampleIds) {
  const p = await createProject({ kind: 'tesis-doctoral', author: '', ...meta });
  const ts = {};
  for (const id of sampleIds) { const s = getSample(id); const t = await addTable(p.id, s.build()); ts[id] = t; }
  return { p, ts };
}

export const MODELS = [
  {
    name: 'Rangos: alcance de los sentidos',
    desc: 'Tu gráfico de barras de rango rehecho en la app: escala logarítmica de 1 cm a 1.000 km, tramo habitual y extensión, flechas, notas y franjas E0–E5. Valores aproximados leídos de la imagen.',
    async create() {
      const p = await createProject({ kind: 'tesis-doctoral', name: 'Modelo · Alcance de los sentidos', title: 'El paisaje pampeano desde el cuerpo: alcance de cada sentido' });
      const raw = [
        ['Sentido', 'Desde (m)', 'Hasta (m)', 'Extensión hasta (m)', 'Nota', 'Final'],
        ['Cenestesia e interocepción', 0.01, 0.3, null, 'el interior del tronco', ''],
        ['Gusto', 0.01, 0.05, null, 'la boca', ''],
        ['Tacto y presión', 0.01, 0.7, null, 'hasta el alcance de la mano', ''],
        ['Calor y frío en la piel', 0.1, 2.5, null, 'fuego, cuerpo ajeno · el sol, por radiación', 'difuso'],
        ['Cinestesia (alcance del moverse)', 0.7, 22000, 60000, 'del brazo a la jornada a pie · a caballo', ''],
        ['Olfato', 0.1, 300, 5000, 'flor, animal, rastrojo · a sotavento: quema, corral', ''],
        ['Oído', 1, 1200, 15000, 'voz, tractor de día · tren de noche con inversión', ''],
        ['Vista', 0.05, 4500, 400000, 'hasta el horizonte del suelo · silo, tormenta… y las estrellas', 'abierto'],
      ];
      const t0 = buildTable(raw, { name: 'Alcance de los sentidos', source: { file: 'gráfico de Juan', citation: 'Valores aproximados leídos del gráfico del autor.' } });
      const t = await addTable(p.id, t0);
      await createFigure(p.id, defaultFigure({
        name: 'Alcance de los sentidos', style: 'ensayo', media: { profileId: 'tesis-a4', quality: 'estandar' }, page: { w: 160, h: 100 }, title: 'Alcance de cada sentido según la distancia desde el cuerpo',
        caption: { mode: 'apa', number: '1', note: '', source: 'Elaboración propia.', autoNotes: false, inside: true }, layout: { cols: 1, gap: 5, letters: false },
        panels: [P(t, 'range', { label: k(t, 'Sentido'), start: k(t, 'Desde'), end: k(t, 'Hasta'), end2: k(t, 'Extensión'), note: k(t, 'Nota'), shape: k(t, 'Final') },
          { xUnits: 'metros', legend: 'bottom', labelA: 'alcance habitual', labelB: 'extensión: noche, viento a favor, aire claro', xTitle: 'distancia desde el cuerpo (escala logarítmica)', zoneFirst: 'E0', zones: [{ at: 2.5, label: 'E1' }, { at: 5000, label: 'E2' }, { at: 12000, label: 'E3' }, { at: 22000, label: 'E4' }, { at: 40000, label: 'E5' }, { at: 200000, label: 'cielo' }], xMax: 1000000 })],
      }));
      return finish(p.id);
    },
  },
  {
    name: 'Lámina de tesis: pingüinos de Palmer',
    desc: 'Cuatro paneles A–D en una página A4 (dispersión con rectas por grupo, violines con comparaciones, barras apiladas e histograma), estilo APA, y análisis guardados (ANOVA y regresión).',
    async create() {
      const { p, ts } = await project({ name: 'Modelo · Pingüinos de Palmer', title: 'Morfometría de tres especies de pingüinos en el archipiélago Palmer' }, ['pinguinos']);
      const t = ts.pinguinos;
      await createFigure(p.id, defaultFigure({
        name: 'Lámina morfométrica', style: 'tesis', media: { profileId: 'tesis-a4-media', quality: 'estandar' }, title: 'Morfometría de los pingüinos de Palmer según especie, isla y sexo',
        caption: { mode: 'apa', number: '1', note: '', source: 'Gorman, Williams y Fraser (2014), Palmer Station LTER.', autoNotes: true, inside: true }, layout: { cols: 2, gap: 6, letters: true },
        panels: [
          P(t, 'scatter', { x: k(t, 'Largo de la aleta'), y: k(t, 'Masa'), color: k(t, 'Especie') }, { trend: 'linear', band: true }, { title: 'Masa y aleta' }),
          P(t, 'violin', { x: k(t, 'Especie'), y: k(t, 'Largo del pico'), color: k(t, 'Especie') }, { points: true, annotate: 'brackets', legend: 'none' }, { title: 'Largo del pico' }),
          P(t, 'bar', { x: k(t, 'Isla'), color: k(t, 'Especie') }, { stack: 'stack', showValues: true, legend: 'none' }, { title: 'Especies por isla', agg: 'count' }),
          P(t, 'hist', { y: k(t, 'Alto del pico'), color: k(t, 'Especie') }, { overlay: 'overlap', legend: 'none' }, { title: 'Alto del pico' }),
        ],
      }));
      await createFigure(p.id, defaultFigure({
        name: 'Masa por especie y sexo', style: 'revista', media: { profileId: 'revista-1col', quality: 'estandar' }, title: 'Masa corporal media por especie y sexo',
        caption: { mode: 'apa', number: '2', note: '', source: 'Gorman, Williams y Fraser (2014).', autoNotes: true, inside: true },
        panels: [P(t, 'meanci', { x: k(t, 'Especie'), y: k(t, 'Masa'), color: k(t, 'Sexo') }, { points: true, legend: 'bottom' }, { agg: 'mean' })],
      }));
      const pr = await getProject(p.id);
      pr.analyses = [
        { id: uid('A'), aid: 'reg', tableId: t.id, params: { y: k(t, 'Masa'), xs: [k(t, 'Largo de la aleta'), k(t, 'Especie'), k(t, 'Sexo')] }, created: new Date().toISOString() },
        { id: uid('A'), aid: 'compareK', tableId: t.id, params: { y: k(t, 'Largo del pico'), g: k(t, 'Especie'), adjust: 'holm' }, created: new Date().toISOString() },
      ];
      await saveProject(pr);
      return finish(p.id);
    },
  },
  {
    name: 'Infografía: Gapminder',
    desc: 'Estilo infográfico (como tus imágenes de referencia): cifras con anillos, líneas con una serie destacada, burbujas y mosaico; para pantalla y redes, y una versión neón para proyectar.',
    async create() {
      const { p, ts } = await project({ name: 'Modelo · Gapminder', title: 'Esperanza de vida y fecundidad en el mundo, 1955–2005', kind: 'divulgacion' }, ['gapminder']);
      const t = ts.gapminder;
      const y2005 = [{ col: k(t, 'Año'), op: 'eq', val: '2005' }];
      await createFigure(p.id, defaultFigure({
        name: 'Infografía azul', style: 'info-azul', media: { profileId: 'web-1600', quality: 'estandar' }, page: { w: 203.2, h: 250 }, title: 'Medio siglo de vidas más largas', subtitle: 'Esperanza de vida al nacer y fecundidad en 63 países, 1955–2005',
        caption: { mode: 'titulo', number: '1', note: '', source: 'Fundación Gapminder.', autoNotes: false, inside: true }, layout: { cols: 2, gap: 6, letters: false },
        panels: [
          P(t, 'line', { x: k(t, 'Año'), y: k(t, 'Esperanza'), color: k(t, 'País') }, { highlight: 'Argentina', legend: 'none' }, { agg: 'mean', span: 2, title: 'Esperanza de vida (años)', filters: [{ col: k(t, 'País'), op: 'in', vals: ['Argentina', 'Brazil', 'Chile', 'Mexico', 'Peru', 'Bolivia'] }] }),
          P(t, 'scatter', { x: k(t, 'Fecundidad'), y: k(t, 'Esperanza'), color: k(t, 'Región'), size: k(t, 'Población'), label: k(t, 'País') }, { legend: 'none', labelSome: 'none' }, { title: 'Fecundidad y esperanza de vida, 2005', filters: y2005 }),
          P(t, 'treemap', { x: k(t, 'País'), color: k(t, 'Región'), y: k(t, 'Población') }, { legend: 'none' }, { title: 'Población por región, 2005', filters: y2005 }),
          P(t, 'kpi', { x: k(t, 'Región') }, { kpiShape: 'ring' }, { title: 'Países por región', agg: 'count', span: 2, filters: y2005 }),
        ],
      }));
      await createFigure(p.id, defaultFigure({
        name: 'Versión para proyectar', style: 'neon', media: { profileId: 'proyector-169', quality: 'estandar' }, title: 'La fecundidad bajó en todas las regiones', subtitle: 'Hijos por mujer, promedio de los países de cada región',
        caption: { mode: 'titulo', number: '2', note: '', source: 'Fundación Gapminder.', autoNotes: false, inside: true },
        panels: [P(t, 'line', { x: k(t, 'Año'), y: k(t, 'Fecundidad'), color: k(t, 'Región') }, { legend: 'none', smooth: true, yTitle: 'Hijos por mujer' }, { agg: 'mean' })],
      }));
      return finish(p.id);
    },
  },
  {
    name: 'Pirámides de población',
    desc: 'Estructura por edad y sexo en dos censos, lado a lado y en porcentaje para que sean comparables; estilo humanidades.',
    async create() {
      const { p, ts } = await project({ name: 'Modelo · Pirámides', title: 'Transición demográfica en dos censos' }, ['poblacion']);
      const t = ts.poblacion;
      const f = (y) => [{ col: k(t, 'Censo'), op: 'eq', val: String(y) }];
      await createFigure(p.id, defaultFigure({
        name: 'Pirámides 1900 y 2000', style: 'humanidades', media: { profileId: 'tesis-a4', quality: 'estandar' }, title: 'Estructura de la población por edad y sexo, 1900 y 2000',
        caption: { mode: 'apa', number: '1', note: 'Porcentaje de la población total de cada censo.', source: 'Oficina del Censo de los EE. UU. (IPUMS).', autoNotes: false, inside: true }, layout: { cols: 2, gap: 6, letters: true },
        panels: [P(t, 'pyramid', { y: k(t, 'Edad'), color: k(t, 'Sexo'), x: k(t, 'Personas') }, { pyrPct: true, legend: 'bottom' }, { title: '1900', filters: f(1900) }), P(t, 'pyramid', { y: k(t, 'Edad'), color: k(t, 'Sexo'), x: k(t, 'Personas') }, { pyrPct: true, legend: 'bottom' }, { title: '2000', filters: f(2000) })],
      }));
      return finish(p.id);
    },
  },
  {
    name: 'Mapa estadístico: partidos bonaerenses',
    desc: 'Coroplético por clases (Jenks) sobre la cartografía del IGN incluida, estilo pampa, con un histograma de la misma variable al lado.',
    async create() {
      const { p, ts } = await project({ name: 'Modelo · Mapa de partidos', title: 'Superficie de los partidos de la provincia de Buenos Aires' }, ['partidos']);
      const t = ts.partidos;
      await createFigure(p.id, defaultFigure({
        name: 'Superficie por partido', style: 'pampa', media: { profileId: 'tesis-a4-media', quality: 'estandar' }, page: { w: 160, h: 140 }, title: 'Superficie de los partidos de la provincia de Buenos Aires',
        caption: { mode: 'apa', number: '1', note: 'Superficie calculada sobre la geometría simplificada.', source: 'Elaboración propia sobre IGN, SIG 250.', autoNotes: true, inside: true }, layout: { cols: 3, gap: 5, letters: true },
        panels: [P(t, 'map', { geo: k(t, 'Partido'), y: k(t, 'Superficie') }, { geoLevel: 'dep-ba', classes: 5, mapLabels: 3, legend: 'bottom' }, { span: 2 }), P(t, 'hist', { y: k(t, 'Superficie') }, { binMethod: 'fd' })],
      }));
      return finish(p.id);
    },
  },
  {
    name: 'Series y estacionalidad: clima de Seattle',
    desc: 'Mapa de calor mes por año, líneas por año y cajas por tipo de tiempo; estilo mínimo (Tufte).',
    async create() {
      const { p, ts } = await project({ name: 'Modelo · Clima', title: 'Estacionalidad de la temperatura y la lluvia' }, ['clima']);
      const t = ts.clima;
      await createFigure(p.id, defaultFigure({
        name: 'Estacionalidad', style: 'minimo', media: { profileId: 'tesis-a4', quality: 'estandar' }, page: { w: 160, h: 200 }, title: 'Temperatura máxima media por mes y año, y precipitación según el tipo de tiempo',
        caption: { mode: 'apa', number: '1', note: '', source: 'NOAA, vía vega-datasets.', autoNotes: true, inside: true }, layout: { cols: 1, gap: 6, letters: true },
        panels: [
          P(t, 'heatmap', { x: k(t, 'Mes'), y: k(t, 'Año'), size: k(t, 'Temperatura máxima') }, { ramp: 'rojos' }, { agg: 'mean', title: 'Temperatura máxima media (°C)' }),
          P(t, 'line', { x: k(t, 'Mes'), y: k(t, 'Temperatura máxima'), color: k(t, 'Año') }, { band: false }, { agg: 'mean', title: 'Ciclo anual' }),
          P(t, 'box', { x: k(t, 'Tiempo'), y: k(t, 'Temperatura máxima') }, { points: true, orientation: 'h', sort: 'desc' }, { title: 'Según el tipo de tiempo' }),
        ],
      }));
      return finish(p.id);
    },
  },
];
