// Números y unidades escritos como texto («1.000 km», «0,5», «10 cm», «lem» mal leído por OCR).
// ---------- números y unidades leídos por OCR ----------
export const UNITS = { mm: 0.001, cm: 0.01, m: 1, km: 1000 };
export function parseValue(s0) {
  let t = String(s0 || '').trim().replace(/[“”"'’`]/g, '').replace(/\s+/g, ' ');
  // errores típicos del OCR: «l» o «I» por «1», «e» por «c» en «cm», «O» por «0» entre cifras
  t = t.replace(/^[lI|]\s?[ec]m$/i, '1 cm').replace(/^[lI|]\s?km$/i, '1 km').replace(/^[lI|]\s?mm$/i, '1 mm').replace(/^[lI|]\s?m$/i, '1 m');
  t = t.replace(/^[lI|](?=[\d.,])/, '1').replace(/(?<=\d)[oO](?=\d|\b)/g, '0').replace(/^[oO](?=[\d.,])/, '0');
  t = t.replace(/−|–/g, '-');
  const m = t.match(/^(-?\s?\$?\s?[\d][\d.,]*)\s*(mm|cm|km|m|%|años?|hs?|ha|km2|m2|°c?)?\.?$/i);
  if (!m) return null;
  let n = m[1].replace(/[\s$]/g, '');
  if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(n)) n = n.replace(/\./g, '').replace(',', '.');
  else if (/^-?\d+,\d+$/.test(n)) n = n.replace(',', '.');
  else if (/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(n)) n = n.replace(/,/g, '');
  else if (!/^-?\d+(\.\d+)?$/.test(n)) return null;
  const v = +n;
  if (!Number.isFinite(v)) return null;
  const unit = (m[2] || '').toLowerCase();
  return { v, unit, meters: UNITS[unit] != null ? +(v * UNITS[unit]).toPrecision(12) : null };
}

