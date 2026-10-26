import { interpretJSON } from '../src/data/chartSpec.js';
const j1 = {
  titulo: 'Alcance de los sentidos',
  eje_x_inferior: { escala: 'logarítmica', unidad: 'm', titulo: 'distancia desde el cuerpo (escala logarítmica)', min: 0.01, max: 1000000 },
  eje_x_superior: { zonas: [{ id: 'E0', desde: 0.01, hasta: 2.5 }, { id: 'E1', desde: 2.5, hasta: 5000 }, { id: 'E2', desde: 5000, hasta: 12000 }, { id: 'cielo', desde: 200000, hasta: 1000000 }] },
  leyenda: { a: 'alcance habitual', b: 'extensión: noche' },
  sentidos: [
    { nombre: 'Gusto', habitual: { desde: 0.01, hasta: 0.05 }, nota: 'la boca' },
    { nombre: 'Vista', habitual: { desde: 0.05, hasta: 4500 }, extension: { hasta: 400000 }, nota: 'hasta el horizonte', final: 'flecha' },
  ],
};
const j2 = { x_arriba: [{ rotulo: 'E0', valor: 0.01 }, { rotulo: 'E1', valor: 2.5 }], datos: [{ sentido: 'Tacto', desde: '1 cm', hasta: '70 cm' }, { sentido: 'Oído', desde: '1 m', hasta: '1,2 km', extension: '15 km' }] };
const j3 = [{ provincia: 'Buenos Aires', habitantes: 17.5 }, { provincia: 'Córdoba', habitantes: 3.9 }];
for (const j of [j1, j2, j3]) { const r = interpretJSON(j); console.log(JSON.stringify(r.spec && { type: r.spec.type, rows: r.spec.rows, options: r.spec.options, kind: r.spec.kindText }), r.notes, r.sheets.map((s) => s.name)); }
