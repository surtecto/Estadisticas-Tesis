// Estilos de figura. Los tamaños están en puntos tipográficos para la figura de tesis (A4, 160 mm de ancho);
// el destino los escala (póster, proyector, videollamada). Cada estilo trae tipografías, colores de tinta,
// grilla, paleta y rampa por defecto, y el tratamiento de las marcas.
export const FONTS = {
  'Source Sans 3': "'Source Sans 3', 'Segoe UI', Arial, sans-serif",
  'Source Serif 4': "'Source Serif 4', Georgia, 'Times New Roman', serif",
  'Archivo': "'Archivo', 'Segoe UI', Arial, sans-serif",
  'Roboto Condensed': "'Roboto Condensed', 'Arial Narrow', Arial, sans-serif",
  'Open Sans': "'Open Sans', Arial, sans-serif",
  'Lato': "'Lato', Arial, sans-serif",
  'Merriweather': "'Merriweather', Georgia, serif",
  'EB Garamond': "'EB Garamond', Garamond, Georgia, serif",
  'Noto Sans': "'Noto Sans', Arial, sans-serif",
  'IBM Plex Mono': "'IBM Plex Mono', 'Courier New', monospace",
};
export const fontStack = (f) => FONTS[f] || `'${f}', sans-serif`;

const base = {
  bg: '#ffffff', panelBg: null, ink: '#1c2329', muted: '#5d6872', grid: '#e4e8eb', axis: '#3b454e',
  font: 'Source Sans 3', fontTitle: 'Source Sans 3', titleWeight: 700, titleAlign: 'left',
  sizes: { tick: 7.5, axis: 8.5, legend: 7.5, label: 7, panel: 9.5, letter: 11, title: 12, subtitle: 9, caption: 8.5, big: 26 },
  gridY: true, gridX: false, axisLineX: true, axisLineY: false, ticksOut: true, rangeFrame: false,
  palette: 'okabe', ramp: 'azules', diverging: 'rdbu',
  barRadius: 0, barGap: 0.22, gradient: false, glow: false, lineW: 1.4, pointR: 2.3, pointOpacity: 0.78, areaOpacity: 0.22,
  surfaceGap: 0.6, patterns: false, upperLabels: false, dark: false, legendShape: 'square', directLabels: true,
};
export const THEMES = [
  { ...base, id: 'tesis', name: 'Tesis (APA, sans)', desc: 'Sobrio y legible: grilla horizontal tenue, paleta apta para daltonismo, títulos dentro del epígrafe.' },
  { ...base, id: 'humanidades', name: 'Humanidades (serif, tinta)', desc: 'Para historia, geografía y arquitectura: serif, tinta casi negra, sin colores estridentes.', font: 'Source Serif 4', fontTitle: 'Source Serif 4', ink: '#211d18', muted: '#5f574c', grid: '#e9e3d8', axis: '#3a332a', palette: 'sepia', ramp: 'sepia', lineW: 1.2 },
  { ...base, id: 'revista', name: 'Revista científica (compacto)', desc: 'Al estilo de las revistas de ciencias: 6–7 pt, ejes con líneas, sin grilla, paleta NPG.', font: 'Open Sans', fontTitle: 'Open Sans', sizes: { tick: 6.5, axis: 7, legend: 6.5, label: 6, panel: 8, letter: 10, title: 9, subtitle: 7, caption: 7, big: 20 }, gridY: false, axisLineY: true, palette: 'npg', lineW: 1, pointR: 1.8 },
  { ...base, id: 'minimo', name: 'Mínimo (Tufte)', desc: 'Máxima proporción de tinta-dato: marco de rango en los ejes, sin grilla, rótulos directos.', font: 'Source Serif 4', fontTitle: 'Source Serif 4', gridY: false, axisLineX: true, axisLineY: true, rangeFrame: true, palette: 'tolmuted', ink: '#222', muted: '#666' },
  { ...base, id: 'byn', name: 'Blanco y negro (impresión)', desc: 'Grises de luminosidad bien separada y tramas para distinguir categorías sin color.', palette: 'grises', ramp: 'grises', diverging: 'rdbu', patterns: true, grid: '#e2e2e2', ink: '#111', muted: '#444', axis: '#222' },
  { ...base, id: 'pampa', name: 'Pampa (paisaje)', desc: 'Tierras, pastos y aguas: la paleta del paisaje pampeano, títulos en serif.', fontTitle: 'Source Serif 4', palette: 'pampa', ramp: 'pampa', ink: '#23261f', muted: '#5e6255', grid: '#e7e6dc', axis: '#3d4036' },
  { ...base, id: 'ensayo', name: 'Ensayo (papel y serif)', desc: 'Como tu gráfico de rangos: papel apenas cálido, rótulos en serif, notas grises sobre cada barra, grilla vertical tenue y franjas de referencia en monoespaciada.', font: 'Source Serif 4', fontTitle: 'Source Serif 4', bg: '#fbfaf7', ink: '#1f1f1f', muted: '#5c5a57', grid: '#dddbd6', axis: '#6b6965', palette: 'ensayo', ramp: 'azules', gridY: false, gridX: true, axisLineX: true, legendShape: 'square', lineW: 1.3 },
  { ...base, id: 'periodistico', name: 'Periodístico', desc: 'Título afirmativo arriba a la izquierda, bajada, fuente al pie; barras redondeadas y rótulos directos.', font: 'Archivo', fontTitle: 'Archivo', sizes: { ...base.sizes, title: 14, subtitle: 9.5 }, palette: 'tolbright', barRadius: 1.2, titleWeight: 800 },
  { ...base, id: 'info-azul', name: 'Infografía azul (plana)', desc: 'Como la primera imagen de referencia: azules planos, barras redondeadas, grandes cifras.', font: 'Lato', fontTitle: 'Archivo', palette: 'infoazul', ramp: 'azules', bg: '#ffffff', panelBg: '#f2f6f9', grid: '#dfe7ee', ink: '#0f2a3f', muted: '#5a7184', axis: '#2c4559', barRadius: 2.2, titleWeight: 800, upperLabels: true, legendShape: 'circle', lineW: 1.8, pointR: 2.8 },
  { ...base, id: 'neon', name: 'Neón sobre oscuro', desc: 'Como la segunda imagen de referencia: fondo oscuro, degradés y brillo; para pantalla y redes, no para imprimir.', font: 'Archivo', fontTitle: 'Archivo', palette: 'neon', ramp: 'neon', bg: '#15121f', panelBg: '#1d1a2b', grid: '#2e2a40', ink: '#f3f0ff', muted: '#a9a3c4', axis: '#5c5676', dark: true, gradient: true, glow: true, barRadius: 2.2, titleWeight: 800, upperLabels: true, legendShape: 'circle', lineW: 1.8, pointR: 2.8, pointOpacity: 0.9, areaOpacity: 0.35 },
  { ...base, id: 'proyector', name: 'Proyector (sala oscura)', desc: 'Fondo azul noche, tipografía condensada y gruesa, colores saturados de alto contraste.', font: 'Roboto Condensed', fontTitle: 'Roboto Condensed', palette: 'proyector', ramp: 'viridis', bg: '#0f1d2b', grid: '#22374b', ink: '#f2f6f9', muted: '#b3c3d0', axis: '#6d8296', dark: true, lineW: 2, pointR: 3 },
];
export const getTheme = (id) => THEMES.find((t) => t.id === id) || THEMES[0];
