// Destinos de la figura (heredados de Mapas-Tesis): tamaño, resolución, formato y mínimos de legibilidad.
const MM_PER_IN = 25.4;
export const MEDIA = [
  { id: 'tesis-a4', group: 'Impresión', name: 'Tesis impresa A4: ancho de caja', page: { w: 160, h: 110 }, dpi: 300, format: 'pdf', kind: 'print',
    min: { textPt: 7, linePt: 0.25, symbolPt: 4 },
    notes: 'Ancho de la caja de texto de una A4 con márgenes de encuadernación; el alto se ajusta. Texto de al menos 7 pt (el cuerpo de la tesis suele ir en 11–12 pt), líneas de 0,25 pt o más: las más finas desaparecen al imprimir.' },
  { id: 'tesis-a4-media', group: 'Impresión', name: 'Tesis impresa A4: página completa (lámina de varios paneles)', page: { w: 160, h: 230 }, dpi: 300, format: 'pdf', kind: 'print',
    min: { textPt: 7, linePt: 0.25, symbolPt: 4 }, notes: 'Para una lámina de varios gráficos que ocupa la página.' },
  { id: 'revista-1col', group: 'Impresión', name: 'Artículo: una columna (85 mm)', page: { w: 85, h: 70 }, dpi: 600, format: 'tiff', kind: 'print',
    min: { textPt: 6, linePt: 0.25, symbolPt: 3.5 }, notes: 'Las revistas suelen pedir TIFF o PDF a 300–600 ppp y texto de 6–8 pt a tamaño final.' },
  { id: 'revista-2col', group: 'Impresión', name: 'Artículo: dos columnas (180 mm)', page: { w: 180, h: 110 }, dpi: 600, format: 'tiff', kind: 'print',
    min: { textPt: 6, linePt: 0.25, symbolPt: 3.5 } },
  { id: 'lamina-a3', group: 'Impresión', name: 'Lámina A3 apaisada (anexo, plano desplegable)', page: { w: 420, h: 297 }, dpi: 300, format: 'pdf', kind: 'print',
    min: { textPt: 7, linePt: 0.3, symbolPt: 4 } },
  { id: 'poster-a1', group: 'Impresión', name: 'Póster A1 (congreso, defensa)', page: { w: 594, h: 841 }, dpi: 200, format: 'pdf', kind: 'print',
    min: { textPt: 16, linePt: 0.75, symbolPt: 10 }, notes: 'Se lee a 1–2 m: rótulos de 16 pt o más y líneas gruesas.' },
  { id: 'proyector-169', group: 'Presentación', name: 'Proyector 16:9 (1920 × 1080)', page: { w: 338.667, h: 190.5 }, dpi: 144, format: 'png', kind: 'screen', px: [1920, 1080],
    min: { textPx: 30, linePx: 3, symbolPx: 20, patternPx: 10, contrast: 4.5 },
    notes: 'Visto desde el fondo del aula: rótulos de 30 px o más (≈ 2,8 % de la altura), líneas de 3 px, sin pasteles ni tramas finas. Los proyectores lavan el color en salas iluminadas.' },
  { id: 'proyector-43', group: 'Presentación', name: 'Proyector 4:3 de aula (1024 × 768)', page: { w: 254, h: 190.5 }, dpi: 102.4, format: 'png', kind: 'screen', px: [1024, 768],
    min: { textPx: 22, linePx: 2, symbolPx: 14, patternPx: 8, contrast: 4.5 }, notes: 'Muchos proyectores de aula todavía son XGA: preparar la figura a su resolución evita reescalados borrosos.' },
  { id: 'videollamada', group: 'Pantalla', name: 'Pantalla compartida en videollamada', page: { w: 338.667, h: 190.5 }, dpi: 144, format: 'png', kind: 'screen', px: [1920, 1080], stream: 720,
    min: { textPx: 34, linePx: 4, symbolPx: 24, patternPx: 14, contrast: 4.5 },
    notes: 'Zoom, Meet o Teams transmiten a 720p o menos y comprimen: las líneas finas y las tramas se empastan, y el rojo fino se corre (submuestreo de color). Todo más grueso que en el proyector.' },
  { id: 'monitor', group: 'Pantalla', name: 'Monitor: lectura en pantalla completa (1920 × 1080)', page: { w: 338.667, h: 190.5 }, dpi: 144, format: 'png', kind: 'screen', px: [1920, 1080],
    min: { textPx: 16, linePx: 1.5, symbolPx: 12, patternPx: 6, contrast: 4.5 } },
  { id: 'web-1600', group: 'Web', name: 'Web o PDF digital (1600 px de ancho)', page: { w: 203.2, h: 135.5 }, dpi: 200, format: 'png', kind: 'screen', px: [1600, 1067],
    min: { textPx: 24, linePx: 2, symbolPx: 16, patternPx: 8, contrast: 4.5 }, notes: 'Se ve a unos 800 px en un celular: el doble de densidad mantiene la nitidez en pantallas Retina.' },
  { id: 'web-redes', group: 'Web', name: 'Redes sociales (1080 × 1350, vertical)', page: { w: 182.88, h: 228.6 }, dpi: 150, format: 'png', kind: 'screen', px: [1080, 1350],
    min: { textPx: 28, linePx: 3, symbolPx: 20, patternPx: 10, contrast: 4.5 }, notes: 'Se mira en el celular, de pasada: pocos elementos, rótulos grandes.' },
];

export const QUALITIES = {
  print: [['borrador', 'Borrador (150 ppp)', 150], ['estandar', 'Estándar (perfil)', null], ['alta', 'Alta (600 ppp)', 600], ['lineal', 'Dibujo lineal (1200 ppp)', 1200]],
  screen: [['estandar', 'Tamaño del perfil (1×)', 1], ['alta', 'Pantallas densas (2×, Retina/4K)', 2], ['liviana', 'Liviana (0,75×)', 0.75]],
};



export function getMedia(id) { return MEDIA.find((m) => m.id === id) || MEDIA[0]; }
// tamaño mínimo de texto del destino, en puntos tipográficos sobre la hoja
export function minTextPt(m) { return m.kind === 'print' ? m.min.textPt : (m.min.textPx * 72) / m.dpi; }
export function minLinePt(m) { return m.kind === 'print' ? m.min.linePt : (m.min.linePx * 72) / m.dpi; }
export function minSymbolPt(m) { return m.kind === 'print' ? m.min.symbolPt : (m.min.symbolPx * 72) / m.dpi; }
// escala de la tipografía y los trazos respecto de la figura de tesis (7 pt de rótulo mínimo)
export function mediaScale(m) { return Math.max(0.85, minTextPt(m) / 7); }
export function exportDpi(fig) {
  const m = getMedia(fig.media.profileId);
  const q = (QUALITIES[m.kind] || []).find((x) => x[0] === fig.media.quality);
  if (m.kind === 'print') return q && q[2] ? q[2] : m.dpi;
  return Math.round(m.dpi * (q && q[2] ? q[2] : 1) * 100) / 100;
}
