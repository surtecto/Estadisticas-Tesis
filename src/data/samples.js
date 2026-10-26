// Tablas de ejemplo con datos reales y su cita (vega-datasets y la cartografía incluida).
import penguins from '../../node_modules/vega-datasets/data/penguins.json';
import gapminder from '../../node_modules/vega-datasets/data/gapminder.json';
import population from '../../node_modules/vega-datasets/data/population.json';
import seattle from '../../node_modules/vega-datasets/data/seattle-weather.csv';
import { buildTable } from './table.js';
import { jsonToRows, parseCSV } from './parse.js';
import { geoFeatures } from '../charts/geo.js';
import { d3 } from '../charts/core.js';

const ES = { Adelie: 'Adelia', Chinstrap: 'Barbijo', Gentoo: 'Papúa', MALE: 'Macho', FEMALE: 'Hembra' };
export const SAMPLES = [
  {
    id: 'pinguinos', name: 'Pingüinos de Palmer (Antártida)', desc: '344 pingüinos de tres especies e islas: pico, aleta, masa y sexo. Para comparar grupos, correlacionar y modelar.',
    source: 'Gorman, K. B., Williams, T. D. y Fraser, W. R. (2014). Palmer Station Antarctica LTER. Paquete palmerpenguins (Horst, Hill y Gorman, 2020).',
    build() {
      const rows = penguins.map((r) => ({ Especie: ES[r.Species] || r.Species, Isla: r.Island, 'Largo del pico (mm)': r['Beak Length (mm)'], 'Alto del pico (mm)': r['Beak Depth (mm)'], 'Largo de la aleta (mm)': r['Flipper Length (mm)'], 'Masa corporal (g)': r['Body Mass (g)'], Sexo: ES[r.Sex] || null }));
      return buildTable(jsonToRows(rows), { name: 'Pingüinos de Palmer', source: { file: 'palmerpenguins', citation: this.source } });
    },
  },
  {
    id: 'gapminder', name: 'Gapminder: esperanza de vida y fecundidad', desc: '63 países cada 5 años (1955–2005): población, esperanza de vida y fecundidad. Para series, burbujas y pendientes.',
    source: 'Fundación Gapminder, vía vega-datasets.',
    build() {
      const CL = ['Asia meridional', 'Europa y Asia central', 'África subsahariana', 'América', 'Asia oriental y Pacífico', 'Medio Oriente y norte de África'];
      const rows = gapminder.map((r) => ({ País: r.country, Año: r.year, Región: CL[r.cluster] || String(r.cluster), Población: r.pop, 'Esperanza de vida (años)': r.life_expect, 'Fecundidad (hijos por mujer)': r.fertility }));
      return buildTable(jsonToRows(rows), { name: 'Gapminder', source: { file: 'gapminder', citation: this.source } });
    },
  },
  {
    id: 'poblacion', name: 'Población por edad y sexo (EE. UU., 1900 y 2000)', desc: 'Grupos quinquenales de edad por sexo en dos censos. Para pirámides de población.',
    source: 'Oficina del Censo de los EE. UU. (IPUMS), vía vega-datasets.',
    build() {
      const rows = population.filter((r) => r.year === 1900 || r.year === 2000).map((r) => ({ Censo: r.year, Edad: r.age, Sexo: r.sex === 1 ? 'Varones' : 'Mujeres', Personas: r.people }));
      return buildTable(jsonToRows(rows), { name: 'Población por edad y sexo', source: { file: 'population', citation: this.source } });
    },
  },
  {
    id: 'clima', name: 'Clima diario de Seattle (2012–2015)', desc: '1461 días: precipitación, temperaturas y tipo de tiempo. Para series de tiempo y estacionalidad.',
    source: 'NOAA, vía vega-datasets.',
    build() {
      const { rows } = parseCSV(seattle, ',');
      const TT = { drizzle: 'llovizna', rain: 'lluvia', sun: 'sol', snow: 'nieve', fog: 'niebla' };
      const head = ['Fecha', 'Precipitación (mm)', 'Temperatura máxima (°C)', 'Temperatura mínima (°C)', 'Viento (m/s)', 'Tiempo', 'Mes', 'Año'];
      const MES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
      const body = rows.slice(1).map((r) => [r[0], r[1], r[2], r[3], r[4], TT[r[5]] || r[5], MES[+r[0].slice(5, 7) - 1], +r[0].slice(0, 4)]);
      const t = buildTable([head, ...body], { name: 'Clima de Seattle', source: { file: 'seattle-weather', citation: this.source } });
      return t;
    },
  },
  {
    id: 'partidos', name: 'Partidos bonaerenses: superficie', desc: 'Superficie de los 134 partidos de la cartografía incluida (km², calculada sobre la geometría simplificada). Para probar el mapa estadístico.',
    source: 'Cálculo propio sobre IGN, SIG 250 (geometría simplificada; valores aproximados).',
    build() {
      const G = geoFeatures('dep-ba');
      const R = 6371.0088;
      const rows = G.features.map((f) => ({ Partido: titleCase(f.name), Cabecera: titleCase(f.properties.c || ''), 'Superficie (km²)': Math.round(d3.geoArea(f) * R * R) }));
      return buildTable(jsonToRows(rows), { name: 'Partidos bonaerenses', source: { file: 'cartografía incluida', citation: this.source } });
    },
  },
];
const titleCase = (s) => String(s).toLowerCase().replace(/(^|\s|\()(\p{L})/gu, (m, a, b) => a + b.toUpperCase()).replace(/\b(De|Del|La|Las|Los|Y|E)\b/g, (w) => w.toLowerCase()).replace(/^(\p{L})/u, (m) => m.toUpperCase());
export const getSample = (id) => SAMPLES.find((s) => s.id === id);
