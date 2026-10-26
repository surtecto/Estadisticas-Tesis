// Lectura de tablas: Excel (xlsx, xls, xlsm), OpenDocument (ods), CSV/TSV/TXT, JSON y texto pegado desde una planilla.
// Devuelve hojas como matrices crudas; la tipificación de columnas está en table.js.
import * as XLSX from 'xlsx';

const MISSING = new Set(['', 'na', 'n/a', 'nan', 'null', '-', '–', '—', '…', '...', 's/d', 'sd', 'ns/nc', 'nsnc', '.', '///', 'x', '#n/a', '#¡valor!', '#value!', '#div/0!']);
export const isMissingToken = (v) => v == null || (typeof v === 'string' && MISSING.has(v.trim().toLowerCase()));

// ---------- CSV ----------
export function detectDelimiter(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim()).slice(0, 30);
  const cands = ['\t', ';', ',', '|'];
  let best = ',', bestScore = -1;
  for (const d of cands) {
    const counts = lines.map((l) => splitCSVLine(l, d).length);
    if (!counts.length) continue;
    const mode = counts.sort((a, b) => a - b)[Math.floor(counts.length / 2)];
    if (mode < 2) continue;
    const consistent = counts.filter((c) => c === mode).length / counts.length;
    const score = consistent * 10 + Math.min(mode, 30) / 30 + (d === '\t' ? 0.5 : 0) + (d === ';' ? 0.2 : 0);
    if (score > bestScore) { bestScore = score; best = d; }
  }
  return best;
}
function splitCSVLine(line, d) {
  const out = []; let cur = ''; let q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) {
      if (ch === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === d) { out.push(cur); cur = ''; } else cur += ch;
  }
  out.push(cur);
  return out;
}
export function parseCSV(text, delimiter) {
  text = String(text).replace(/^﻿/, '');
  const d = delimiter || detectDelimiter(text);
  const rows = []; let row = []; let cur = ''; let q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch;
      continue;
    }
    if (ch === '"' && cur === '') { q = true; continue; }
    if (ch === d) { row.push(cur); cur = ''; continue; }
    if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cur); rows.push(row); row = []; cur = '';
      continue;
    }
    cur += ch;
  }
  if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
  while (rows.length && rows[rows.length - 1].every((c) => String(c).trim() === '')) rows.pop();
  return { rows, delimiter: d };
}

// ---------- Archivos ----------
export async function readTableFile(file) {
  const name = file.name || 'tabla';
  const ext = (name.split('.').pop() || '').toLowerCase();
  if (['csv', 'tsv', 'txt', 'tab', 'dat'].includes(ext)) {
    const buf = await file.arrayBuffer();
    let text = new TextDecoder('utf-8').decode(buf);
    if (text.includes('�')) text = new TextDecoder('windows-1252').decode(buf); // planillas guardadas en Windows en español
    const { rows, delimiter } = parseCSV(text, ext === 'tsv' || ext === 'tab' ? '\t' : null);
    return { file: name, sheets: [{ name: name.replace(/\.[^.]+$/, ''), rows, delimiter }] };
  }
  if (ext === 'json' || ext === 'geojson') {
    const obj = JSON.parse(await file.text());
    return { file: name, sheets: [{ name: name.replace(/\.[^.]+$/, ''), rows: jsonToRows(obj) }] };
  }
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array', cellDates: true, cellNF: false, dense: false });
  const sheets = wb.SheetNames.map((sn) => {
    const ws = wb.Sheets[sn];
    // celdas combinadas: el valor se repite en todo el rango (títulos de grupo en tablas del INDEC)
    if (ws['!merges']) {
      for (const m of ws['!merges']) {
        const top = ws[XLSX.utils.encode_cell(m.s)];
        if (!top) continue;
        for (let r = m.s.r; r <= m.e.r; r++) for (let c = m.s.c; c <= m.e.c; c++) {
          const a = XLSX.utils.encode_cell({ r, c });
          if (!ws[a]) ws[a] = { ...top, _merged: true };
        }
      }
    }
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null, blankrows: false });
    return { name: sn, rows: rows.map((r) => r.map((v) => (v instanceof Date ? isoDate(v) : v))) };
  }).filter((s) => s.rows.length);
  return { file: name, sheets };
}

function isoDate(d) {
  if (!(d instanceof Date) || !Number.isFinite(d.getTime())) return null;
  // SheetJS entrega fechas en hora local; se conserva solo el día salvo que haya hora
  const pad = (n) => String(n).padStart(2, '0');
  const day = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  return d.getHours() || d.getMinutes() ? `${day}T${pad(d.getHours())}:${pad(d.getMinutes())}` : day;
}

export function jsonToRows(obj) {
  let arr = obj;
  if (obj && obj.type === 'FeatureCollection') arr = obj.features.map((f) => f.properties || {});
  else if (obj && !Array.isArray(obj)) {
    const k = Object.keys(obj).find((x) => Array.isArray(obj[x]));
    arr = k ? obj[k] : [obj];
  }
  if (!Array.isArray(arr) || !arr.length) return [];
  if (Array.isArray(arr[0])) return arr;
  const keys = [];
  for (const o of arr.slice(0, 500)) for (const k of Object.keys(o || {})) if (!keys.includes(k)) keys.push(k);
  return [keys, ...arr.map((o) => keys.map((k) => { const v = o[k]; return v != null && typeof v === 'object' ? JSON.stringify(v) : v; }))];
}

export function parsePasted(text) {
  const t = String(text || '').trim();
  if (!t) return [];
  if (/^[[{]/.test(t)) { try { return jsonToRows(JSON.parse(t)); } catch (e) { /* no era JSON */ } }
  return parseCSV(t, t.includes('\t') ? '\t' : null).rows;
}

// Sugiere la fila de encabezado: la primera con mayoría de textos y seguida por filas con datos
export function guessHeaderRow(rows) {
  const lim = Math.min(rows.length, 25);
  const width = Math.max(...rows.slice(0, 60).map((r) => r.filter((v) => v != null && String(v).trim() !== '').length), 1);
  for (let i = 0; i < lim; i++) {
    const r = rows[i] || [];
    const filled = r.filter((v) => v != null && String(v).trim() !== '');
    if (filled.length < Math.max(2, Math.ceil(width * 0.6))) continue;
    // los años (1991, 2001…) cuentan como rótulos: son encabezados habituales en tablas censales
    const yearLike = (v) => /^(1[89]|20)\d\d$/.test(String(v).trim());
    const texts = filled.filter((v) => yearLike(v) || (typeof v === 'string' && !/^-?[\d.,\s%$]+$/.test(v.trim())));
    const next = (rows[i + 1] || []).filter((v) => v != null && String(v).trim() !== '');
    if (texts.length / filled.length >= 0.6 && next.length >= Math.max(2, filled.length * 0.5)) return i;
  }
  return 0;
}

// Filas finales de notas o fuente («Fuente: INDEC…», «Nota: …») que conviene descartar
export function guessFooterRows(rows, headerRow) {
  let n = 0;
  for (let i = rows.length - 1; i > headerRow + 1; i--) {
    const filled = (rows[i] || []).filter((v) => v != null && String(v).trim() !== '');
    if (filled.length <= 1 && filled.every((v) => typeof v === 'string')) n++;
    else break;
  }
  return n;
}
