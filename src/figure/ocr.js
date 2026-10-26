// Lectura de textos en imágenes (OCR) con Tesseract, todo en el navegador: el motor y el modelo de español
// viajan con la app (vendor/ocr), así que funciona sin conexión una vez cargada y la imagen no sale de la computadora.
import Tesseract from 'tesseract.js';

let workerP = null;
let progressFn = null;
function base() { return new URL('vendor/ocr/', document.baseURI).href; }

export function getOcrWorker() {
  if (!workerP) {
    const b = base();
    workerP = Tesseract.createWorker('spa', 1, {
      workerPath: `${b}worker.min.js`, corePath: b, langPath: b.replace(/\/$/, ''), gzip: true,
      logger: (m) => { if (progressFn) try { progressFn(m); } catch (e) { /* noop */ } },
    }).catch((e) => { workerP = null; throw e; });
  }
  return workerP;
}

// Devuelve palabras con su caja en píxeles de la imagen original: [{ t, c, x0, y0, x1, y1 }]
export async function ocrWords(canvas, scale = 1, onProgress = null, psm = '11') {
  progressFn = onProgress;
  const w = await getOcrWorker();
  await w.setParameters({ tessedit_pageseg_mode: psm, preserve_interword_spaces: '1' });
  const r = await w.recognize(canvas, {}, { blocks: true });
  progressFn = null;
  const out = [];
  for (const b of r.data.blocks || []) for (const p of b.paragraphs || []) for (const l of p.lines || []) for (const wd of l.words || []) {
    const t = String(wd.text || '').trim();
    if (!t) continue;
    out.push({ t, c: wd.confidence, x0: wd.bbox.x0 / scale, y0: wd.bbox.y0 / scale, x1: wd.bbox.x1 / scale, y1: wd.bbox.y1 / scale });
  }
  return out;
}
