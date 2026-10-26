// Diálogos propios (nunca los del navegador): confirmar y formularios breves.
import { el, clear } from '../util.js';

function dialogEl() {
  let d = document.getElementById('app-dialog');
  if (!d) {
    d = el('dialog', { id: 'app-dialog', class: 'app-dialog' }, el('div', { class: 'dlg' }, el('h2', { class: 'dlg-title' }), el('div', { class: 'dlg-body' })));
    document.body.append(d);
  }
  return d;
}

// confirmDialog({ title, text, note, ok, cancel, danger }) → Promise<boolean>
export function confirmDialog({ title = '¿Confirmar?', text = '', note = '', ok = 'Aceptar', cancel = 'Cancelar', danger = false } = {}) {
  return formDialog({ title, body: el('div', {}, text ? el('p', {}, text) : null, note ? el('p', { class: 'note' }, note) : null), ok, cancel, danger }).then((r) => !!r);
}

// formDialog({ title, body: Node, ok, cancel, danger, validate: () => true|string, wide }) → Promise<boolean>
export function formDialog({ title, body, ok = 'Aceptar', cancel = 'Cancelar', danger = false, validate, wide = false } = {}) {
  const d = dialogEl();
  d.classList.toggle('wide', !!wide);
  d.querySelector('.dlg-title').textContent = title || '';
  const b = d.querySelector('.dlg-body');
  clear(b);
  const msg = el('p', { class: 'dlg-msg', hidden: true });
  return new Promise((resolve) => {
    let done = false;
    // el aviso de cierre de un diálogo anterior no tiene que cerrar el siguiente (dos diálogos encadenados)
    const onClose = () => { if (!d.open) finish(false); };
    const finish = (v) => { if (done) return; done = true; d.removeEventListener('close', onClose); if (d.open) d.close(); resolve(v); };
    const okBtn = el('button', { type: 'button', class: `btn ${danger ? 'danger' : 'primary'}`, onclick: () => {
      const v = validate ? validate() : true;
      if (v !== true) { msg.textContent = v || 'Revisá los datos.'; msg.hidden = false; return; }
      finish(true);
    } }, ok);
    b.append(body, msg, el('div', { class: 'btn-row end dlg-actions' }, cancel ? el('button', { type: 'button', class: 'btn ghost', onclick: () => finish(false) }, cancel) : null, okBtn));
    d.addEventListener('close', onClose);
    d.onkeydown = (e) => {
      if (e.key === 'Enter' && e.target.tagName === 'INPUT' && e.target.type !== 'checkbox') { e.preventDefault(); okBtn.click(); }
    };
    d.showModal();
    const first = b.querySelector('input:not([type=checkbox]), textarea, select');
    setTimeout(() => (first || okBtn).focus(), 30);
  });
}

// promptDialog({ title, label, value }) → Promise<string|null>
export async function promptDialog({ title, label = 'Nombre', value = '', ok = 'Aceptar', placeholder = '' } = {}) {
  const inp = el('input', { type: 'text', value, placeholder });
  const body = el('label', { class: 'wf' }, el('span', { class: 'wf-l' }, label), inp);
  const r = await formDialog({ title, body, ok, validate: () => (inp.value.trim() ? true : 'Escribí un nombre.') });
  return r ? inp.value.trim() : null;
}
