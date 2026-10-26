// Codificadores de imagen (heredados de Mapas-Tesis): PNG con resolución, JPEG, TIFF con Deflate, PDF de una página.
import { zlibSync } from 'fflate';

// Conversión a escala de grises (luminancia Rec. 709), para tesis impresas en blanco y negro
export function toGray(canvas) {
  const x = canvas.getContext('2d');
  const step = 2048;
  for (let y0 = 0; y0 < canvas.height; y0 += step) {
    const h = Math.min(step, canvas.height - y0);
    const d = x.getImageData(0, y0, canvas.width, h);
    const a = d.data;
    for (let i = 0; i < a.length; i += 4) {
      const v = Math.round(0.2126 * a[i] + 0.7152 * a[i + 1] + 0.0722 * a[i + 2]);
      a[i] = v; a[i + 1] = v; a[i + 2] = v;
    }
    x.putImageData(d, 0, y0);
  }
  canvas._gray = true;
}

// ---------- codificadores ----------
function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

export async function canvasToPng(canvas, dpi) {
  const blob = await new Promise((r) => canvas.toBlob(r, 'image/png'));
  const bytes = new Uint8Array(await blob.arrayBuffer());
  // inserta pHYs tras IHDR (8 + 25 bytes)
  const ppm = Math.round(dpi / 0.0254);
  const chunk = new Uint8Array(21);
  const dv = new DataView(chunk.buffer);
  dv.setUint32(0, 9);
  chunk.set([0x70, 0x48, 0x59, 0x73], 4); // pHYs
  dv.setUint32(8, ppm); dv.setUint32(12, ppm); chunk[16] = 1;
  dv.setUint32(17, crc32(chunk.subarray(4, 17)));
  const out = new Uint8Array(bytes.length + 21);
  out.set(bytes.subarray(0, 33), 0);
  out.set(chunk, 33);
  out.set(bytes.subarray(33), 54);
  return new Blob([out], { type: 'image/png' });
}

export async function canvasToJpeg(canvas, dpi, quality = 0.92) {
  const flat = flatten(canvas);
  const blob = await new Promise((r) => flat.toBlob(r, 'image/jpeg', quality));
  const bytes = new Uint8Array(await blob.arrayBuffer());
  // JFIF APP0: densidad en ppp
  if (bytes[2] === 0xff && bytes[3] === 0xe0 && String.fromCharCode(...bytes.subarray(6, 10)) === 'JFIF') {
    bytes[13] = 1;
    bytes[14] = (dpi >> 8) & 255; bytes[15] = dpi & 255;
    bytes[16] = (dpi >> 8) & 255; bytes[17] = dpi & 255;
  }
  return new Blob([bytes], { type: 'image/jpeg' });
}

function flatten(canvas, bg = '#ffffff') {
  const c = document.createElement('canvas');
  c.width = canvas.width; c.height = canvas.height;
  const x = c.getContext('2d');
  x.fillStyle = bg; x.fillRect(0, 0, c.width, c.height);
  x.drawImage(canvas, 0, 0);
  return c;
}

function rgbBytes(canvas) {
  const { width: W, height: H } = canvas;
  const data = canvas.getContext('2d').getImageData(0, 0, W, H).data;
  const rgb = new Uint8Array(W * H * 3);
  for (let i = 0, j = 0; i < data.length; i += 4, j += 3) {
    const a = data[i + 3] / 255;
    rgb[j] = data[i] * a + 255 * (1 - a);
    rgb[j + 1] = data[i + 1] * a + 255 * (1 - a);
    rgb[j + 2] = data[i + 2] * a + 255 * (1 - a);
  }
  return rgb;
}

// TIFF RGB 8 bits con compresión Deflate (Adobe), resolución en ppp
export function canvasToTiff(canvas, dpi) {
  const W = canvas.width, H = canvas.height;
  const gray = !!canvas._gray;
  let raw = rgbBytes(canvas);
  if (gray) { const g = new Uint8Array(W * H); for (let i = 0, j = 0; i < g.length; i++, j += 3) g[i] = raw[j]; raw = g; }
  const comp = zlibSync(raw, { level: 6 });
  const software = 'Estadisticas-Tesis\0';
  const entries = [
    [256, 4, [W]], [257, 4, [H]], [258, 3, gray ? [8] : [8, 8, 8]], [259, 3, [8]], [262, 3, [gray ? 1 : 2]], [273, 4, [0]],
    [277, 3, [gray ? 1 : 3]], [278, 4, [H]], [279, 4, [comp.length]], [282, 5, [dpi]], [283, 5, [dpi]], [284, 3, [1]], [296, 3, [2]], [305, 2, software],
  ].sort((a, b) => a[0] - b[0]);
  const ifdSize = 2 + entries.length * 12 + 4;
  const extraStart = 8 + ifdSize;
  let extra = [];
  let extraLen = 0;
  const typeSize = { 2: 1, 3: 2, 4: 4, 5: 8 };
  for (const e of entries) {
    const n = e[1] === 2 ? e[2].length : e[2].length;
    const len = typeSize[e[1]] * n;
    e.count = n;
    if (len > 4) { e.offset = extraStart + extraLen; extraLen += len + (len % 2); extra.push(e); }
  }
  const dataOffset = extraStart + extraLen;
  entries.find((e) => e[0] === 273)[2] = [dataOffset];
  const buf = new Uint8Array(dataOffset + comp.length);
  const dv = new DataView(buf.buffer);
  buf.set([0x4d, 0x4d, 0x00, 0x2a]);
  dv.setUint32(4, 8);
  let p = 8;
  dv.setUint16(p, entries.length); p += 2;
  const writeVal = (type, vals, at) => {
    if (type === 2) { for (let i = 0; i < vals.length; i++) buf[at + i] = vals.charCodeAt(i); return; }
    vals.forEach((v, i) => {
      if (type === 3) dv.setUint16(at + i * 2, v);
      else if (type === 4) dv.setUint32(at + i * 4, v);
      else if (type === 5) { dv.setUint32(at + i * 8, Math.round(v * 100)); dv.setUint32(at + i * 8 + 4, 100); }
    });
  };
  for (const e of entries) {
    dv.setUint16(p, e[0]); dv.setUint16(p + 2, e[1]); dv.setUint32(p + 4, e.count);
    if (e.offset) { dv.setUint32(p + 8, e.offset); writeVal(e[1], e[2], e.offset); } else writeVal(e[1], e[2], p + 8);
    p += 12;
  }
  dv.setUint32(p, 0);
  buf.set(comp, dataOffset);
  return new Blob([buf], { type: 'image/tiff' });
}

// PDF de una página con la imagen embebida (JPEG o Flate sin pérdida), tamaño de página exacto en mm
export async function canvasToPdf(canvas, pageMM, title, { lossless = true, quality = 0.92 } = {}) {
  const W = canvas.width, H = canvas.height;
  const wPt = (pageMM.w / 25.4) * 72, hPt = (pageMM.h / 25.4) * 72;
  let imgBytes, filter;
  if (lossless) { imgBytes = zlibSync(rgbBytes(canvas), { level: 6 }); filter = '/FlateDecode'; }
  else {
    const blob = await new Promise((r) => flatten(canvas).toBlob(r, 'image/jpeg', quality));
    imgBytes = new Uint8Array(await blob.arrayBuffer()); filter = '/DCTDecode';
  }
  const enc = new TextEncoder();
  const chunks = [];
  const offsets = [];
  let pos = 0;
  const push = (x) => { const b = typeof x === 'string' ? enc.encode(x) : x; chunks.push(b); pos += b.length; };
  const obj = (n, body) => { offsets[n] = pos; push(`${n} 0 obj\n`); body(); push('\nendobj\n'); };
  const pdfStr = (t) => {
    const str = String(t);
    if (/^[\x20-\x7e]*$/.test(str)) return `(${str.replace(/[\\()]/g, (m) => '\\' + m)})`;
    let hex = 'FEFF';
    for (const ch of str) {
      const cp = ch.codePointAt(0);
      if (cp > 0xffff) { const v = cp - 0x10000; hex += (0xd800 + (v >> 10)).toString(16).padStart(4, '0') + (0xdc00 + (v & 0x3ff)).toString(16).padStart(4, '0'); }
      else hex += cp.toString(16).padStart(4, '0');
    }
    return `<${hex.toUpperCase()}>`;
  };
  const now = new Date();
  const d = `D:${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}00`;
  push('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
  obj(1, () => push('<< /Type /Catalog /Pages 2 0 R >>'));
  obj(2, () => push('<< /Type /Pages /Kids [3 0 R] /Count 1 >>'));
  obj(3, () => push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${wPt.toFixed(3)} ${hPt.toFixed(3)}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`));
  obj(4, () => { push(`<< /Type /XObject /Subtype /Image /Width ${W} /Height ${H} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter ${filter} /Length ${imgBytes.length} >>\nstream\n`); push(imgBytes); push('\nendstream'); });
  const content = `q ${wPt.toFixed(3)} 0 0 ${hPt.toFixed(3)} 0 0 cm /Im0 Do Q`;
  obj(5, () => push(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`));
  obj(6, () => push(`<< /Title ${pdfStr(title || 'Figura')} /Creator (Estadisticas-Tesis) /Producer (Estadisticas-Tesis) /CreationDate (${d}) >>`));
  const xref = pos;
  push(`xref\n0 7\n0000000000 65535 f \n`);
  for (let i = 1; i <= 6; i++) push(`${String(offsets[i]).padStart(10, '0')} 00000 n \n`);
  push(`trailer\n<< /Size 7 /Root 1 0 R /Info 6 0 R >>\nstartxref\n${xref}\n%%EOF`);
  return new Blob(chunks, { type: 'application/pdf' });
}
