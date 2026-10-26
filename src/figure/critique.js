// Control de legibilidad según el destino y preguntas a la figura: lo que la imagen afirma, lo que oculta
// y los errores frecuentes de los gráficos estadísticos (ejes truncados, tortas con muchas partes, medias sin dispersión…).
import { getMedia, minTextPt, minLinePt } from './media.js';
import { scaledTheme } from '../charts/figure.js';
import { contrastRatio } from '../util.js';
import { paletteDiagnostics, grayDiagnostics, paletteColors, getPalette } from '../palette.js';
import { getType } from '../charts/types.js';
import { levelsOf, getCol, isNum, filteredRows, colIndex } from '../data/table.js';

export function legibility(fig) {
  const { th, s, m } = scaledTheme(fig);
  const out = [];
  const minT = minTextPt(m), minL = minLinePt(m);
  const small = Math.min(th.sizes.tick, th.sizes.label, th.sizes.legend);
  out.push({ ok: small >= minT - 0.05, label: 'Texto más chico', value: `${small.toFixed(1)} pt`, need: `${minT.toFixed(1)} pt`, fix: small < minT ? { fontScale: +((fig.fontScale || 1) * (minT / small) * 1.02).toFixed(2) } : null });
  const lw = Math.max(th.lineW * s, minL * 1.4);
  out.push({ ok: lw >= minL, label: 'Líneas de datos', value: `${lw.toFixed(2)} pt`, need: `${minL.toFixed(2)} pt` });
  const cr = contrastRatio(th.muted, th.bg), ci = contrastRatio(th.ink, th.bg);
  out.push({ ok: cr >= 4.5, label: 'Contraste de rótulos secundarios', value: `${cr.toFixed(1)}:1`, need: '4,5:1' });
  out.push({ ok: ci >= 7, label: 'Contraste del texto principal', value: `${ci.toFixed(1)}:1`, need: '7:1' });
  if (m.kind === 'print' && th.dark) out.push({ ok: false, label: 'Fondo oscuro en impresión', value: 'consume tinta y empasta', need: 'fondo claro' });
  if (m.kind === 'print' && th.glow) out.push({ ok: false, label: 'Brillos y degradés', value: 'no se reproducen bien en papel', need: 'colores planos' });
  return out;
}

export function paletteCheck(fig, tables) {
  const { th } = scaledTheme(fig);
  let n = 0;
  for (const p of fig.panels || []) {
    const t = tables[p.tableId];
    const ck = p.enc && p.enc.color;
    if (t && ck && getCol(t, ck) && !isNum(getCol(t, ck))) n = Math.max(n, levelsOf(t, ck).length);
  }
  if (n < 2) return null;
  const pal = getPalette((fig.panels[0] && fig.panels[0].options && fig.panels[0].options.palette) || fig.palette || th.palette) || getPalette('okabe');
  const colors = paletteColors(pal, Math.min(n, 12));
  const cvd = paletteDiagnostics(colors);
  const gray = grayDiagnostics(colors);
  return { n, colors, cvd, gray, name: pal.name };
}

// ---------- preguntas a la figura ----------
export function questions(fig, tables, project) {
  const qs = [];
  const add = (level, text) => qs.push({ level, text });
  const m = getMedia(fig.media.profileId);
  for (const [i, p] of (fig.panels || []).entries()) {
    const t = tables[p.tableId];
    if (!t) continue;
    const L = (fig.panels.length > 1 ? `Panel ${String.fromCharCode(65 + i)}: ` : '');
    const o = p.options || {};
    const e = p.enc || {};
    const rows = filteredRows(t, p.filters || []);
    const nCat = (k) => (k && getCol(t, k) ? levelsOf(t, k).length : 0);
    switch (p.type) {
      case 'pie': if (nCat(e.x) > 6) add('warn', `${L}la torta tiene ${nCat(e.x)} partes: el ojo compara mal ángulos; ¿barras ordenadas?`); if (nCat(e.x) === 2) add('info', `${L}con dos partes alcanza con una cifra: ¿hace falta el gráfico?`); break;
      case 'bar':
        if (o.yMin && +o.yMin > 0) add('warn', `${L}el eje de las barras no empieza en cero: el largo de la barra deja de ser proporcional al valor.`);
        if (p.agg === 'mean' && (!o.errorBars || o.errorBars === 'none')) add('warn', `${L}barras de medias sin intervalos: ocultan la dispersión y el tamaño de cada grupo.`);
        if (e.color && nCat(e.color) > 7) add('warn', `${L}${nCat(e.color)} colores para los subgrupos: más de siete no se distinguen; ¿agrupar en «Otros» o usar paneles?`);
        if (nCat(e.x) > 12 && o.orientation !== 'h') add('info', `${L}muchas categorías en el eje horizontal: las barras horizontales dejan leer los nombres.`);
        break;
      case 'line': if (e.x && getCol(t, e.x) && getCol(t, e.x).type === 'cat') add('warn', `${L}una línea une categorías sin orden: sugiere una continuidad que no existe.`); if (e.color && nCat(e.color) > 8 && !o.highlight) add('info', `${L}${nCat(e.color)} series: ¿destacar una y dejar las demás en gris?`); break;
      case 'scatter': if (rows.length > 2000) add('info', `${L}${rows.length} puntos: se superponen; ¿transparencia, muestra o mapa de calor?`); if (o.trend === 'linear') add('info', `${L}la recta resume una tendencia, no prueba una causa; ¿hay curvatura o grupos con pendientes distintas?`); break;
      case 'box': case 'violin': {
        if (e.y && e.x) { const sizes = levelsOf(t, e.x).map((l) => rows.filter((r) => String(r[colIndex(t, e.x)]) === l && r[colIndex(t, e.y)] != null).length); if (sizes.some((n) => n < 10)) add('warn', `${L}hay grupos con menos de 10 casos: la caja aparenta una precisión que no tiene; mostrá los puntos.`); }
        break;
      }
      case 'map': if (!e.size && e.y) add('warn', `${L}coroplético con valores absolutos: los partidos grandes o poblados dominan la lectura; ¿tasa por habitante o por km²?`); add('info', `${L}el límite administrativo no es el fenómeno: ¿la variable se distribuye de forma pareja dentro de cada unidad (falacia ecológica, problema de la unidad espacial modificable)?`); break;
      case 'hist': add('info', `${L}la forma del histograma depende del ancho de los intervalos: probá otra cantidad antes de interpretar picos.`); break;
      case 'radar': add('info', `${L}en el radar el área depende del orden de los ejes: dos órdenes distintos dan dos impresiones distintas.`); break;
      case 'kpi': add('info', `${L}una cifra grande sin comparación (año anterior, otra región, total) no dice si es mucho o poco.`); break;
      default: break;
    }
    if (p.filters && p.filters.length) add('info', `${L}el gráfico usa un subconjunto (${rows.length} de ${t.rows.length} casos): ¿el epígrafe lo dice?`);
  }
  if (!fig.caption || !fig.caption.source) add('warn', 'Falta la fuente de los datos en el epígrafe.');
  if (m.kind === 'print' && fig.style === 'neon') add('warn', 'El estilo neón está pensado para pantalla: en papel se empasta y gasta tinta.');
  add('reflect', '¿Qué afirma esta figura en una oración? Si el título no lo dice, ¿lo dice el texto que la acompaña?');
  add('reflect', '¿Qué casos, lugares o categorías quedaron afuera del gráfico, y quién decidió esas categorías?');
  add('reflect', '¿Quién va a mirar la figura y con cuánto tiempo? Una lámina de tesis se estudia; una diapositiva se mira tres segundos.');
  return qs;
}

// ---------- ficha metodológica ----------
export function methodsNote(fig, tables, project) {
  const used = [...new Set((fig.panels || []).map((p) => p.tableId))].map((id) => tables[id]).filter(Boolean);
  const parts = [];
  for (const t of used) {
    const src = t.source || {};
    parts.push(`Datos: «${t.name}» (${t.rows.length} casos, ${t.columns.length} variables${src.file ? `; archivo ${src.file}${src.sheet ? `, hoja ${src.sheet}` : ''}` : ''})${src.citation ? `. ${src.citation}` : ''}.`);
  }
  parts.push('Gráficos y análisis elaborados con Estadísticas-Tesis (Addesso, 2026), aplicación web de código abierto; las pruebas estadísticas fueron verificadas contra SciPy y statsmodels.');
  return parts.join(' ');
}
