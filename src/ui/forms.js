// Controles de formulario enlazados al estado
import { el } from '../util.js';

let fieldId = 0;
const nid = () => `f${++fieldId}`;

export function field(label, control, hint) {
  const id = control.id || nid();
  control.id = id;
  return el('div', { class: 'field' },
    el('label', { for: id }, label),
    control,
    hint ? el('div', { class: 'hint' }, hint) : null);
}

export function inlineFields(...nodes) { return el('div', { class: 'field-row' }, ...nodes); }

export function num(obj, key, { min, max, step = 0.1, unit = '', onChange, width } = {}) {
  const inp = el('input', { type: 'number', value: obj[key], min, max, step, class: 'num', style: width ? { width } : null });
  inp.addEventListener('change', () => {
    let v = parseFloat(String(inp.value).replace(',', '.'));
    if (!Number.isFinite(v)) { inp.value = obj[key]; return; }
    if (min != null) v = Math.max(min, v);
    if (max != null) v = Math.min(max, v);
    obj[key] = v; inp.value = v;
    onChange && onChange(v);
  });
  if (!unit) return inp;
  return el('span', { class: 'num-unit' }, inp, el('span', { class: 'unit' }, unit));
}

export function range(obj, key, { min = 0, max = 1, step = 0.01, onChange, onInput, format } = {}) {
  const out = el('output', {}, format ? format(obj[key]) : String(obj[key]));
  const inp = el('input', { type: 'range', min, max, step, value: obj[key] });
  inp.addEventListener('input', () => {
    obj[key] = parseFloat(inp.value);
    out.textContent = format ? format(obj[key]) : String(obj[key]);
    onInput && onInput(obj[key]);
  });
  inp.addEventListener('change', () => onChange && onChange(obj[key]));
  return el('span', { class: 'range' }, inp, out);
}

export function color(obj, key, { onChange, onInput } = {}) {
  const v = normalizeHex(obj[key]);
  const inp = el('input', { type: 'color', value: v, class: 'color' });
  const txt = el('input', { type: 'text', value: v, class: 'hex', maxlength: 7, spellcheck: 'false', 'aria-label': 'Código hexadecimal' });
  inp.addEventListener('input', () => { obj[key] = inp.value; txt.value = inp.value; onInput && onInput(inp.value); });
  inp.addEventListener('change', () => { obj[key] = inp.value; txt.value = inp.value; onChange && onChange(inp.value); });
  txt.addEventListener('change', () => {
    const h = normalizeHex(txt.value);
    if (!/^#[0-9a-f]{6}$/i.test(h)) { txt.value = obj[key]; return; }
    obj[key] = h; inp.value = h; txt.value = h; onChange && onChange(h);
  });
  return el('span', { class: 'color-pair' }, inp, txt);
}

export function normalizeHex(v) {
  let h = String(v || '#000000').trim();
  if (!h.startsWith('#')) h = '#' + h;
  if (/^#[0-9a-f]{3}$/i.test(h)) h = '#' + h.slice(1).split('').map((c) => c + c).join('');
  return h.toLowerCase().slice(0, 7);
}

export function select(obj, key, options, { onChange, numeric = false } = {}) {
  const s = el('select', {});
  for (const opt of options) {
    const [value, label] = Array.isArray(opt) ? opt : [opt, opt];
    const o = el('option', { value: String(value) }, label);
    if (String(obj[key]) === String(value)) o.selected = true;
    s.appendChild(o);
  }
  s.addEventListener('change', () => {
    obj[key] = numeric ? Number(s.value) : s.value;
    onChange && onChange(obj[key]);
  });
  return s;
}

export function check(obj, key, label, { onChange } = {}) {
  const id = nid();
  const inp = el('input', { type: 'checkbox', id, checked: !!obj[key] });
  inp.addEventListener('change', () => { obj[key] = inp.checked; onChange && onChange(inp.checked); });
  return el('label', { class: 'check', for: id }, inp, el('span', {}, label));
}

export function text(obj, key, { onChange, onInput, placeholder, multiline = false, rows = 3 } = {}) {
  const inp = multiline ? el('textarea', { rows, placeholder }) : el('input', { type: 'text', placeholder });
  inp.value = obj[key] == null ? '' : obj[key];
  inp.addEventListener('input', () => { obj[key] = inp.value; onInput && onInput(inp.value); });
  inp.addEventListener('change', () => { obj[key] = inp.value; onChange && onChange(inp.value); });
  return inp;
}

export function button(label, onClick, { kind = '', title, icon } = {}) {
  return el('button', { type: 'button', class: `btn ${kind}`.trim(), title, onclick: onClick }, icon ? el('span', { class: 'ico', 'aria-hidden': 'true' }, icon) : null, label);
}

export function section(title, ...children) {
  return el('section', { class: 'subsection' }, el('h3', {}, title), ...children);
}

export function details(title, open, ...children) {
  const d = el('details', { class: 'disclosure', open: open || false }, el('summary', {}, title), el('div', { class: 'disclosure-body' }, ...children));
  return d;
}
