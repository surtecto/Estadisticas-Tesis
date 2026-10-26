import { digitizeImage } from '../src/figure/digitize.js';
window.dig = async (src) => { const r = await digitizeImage(src, { onProgress: (m) => {} }); const { overlay, words, ...rest } = r; return { ...rest, nwords: words.length, overlayKeys: Object.keys(overlay || {}), vlines: overlay && overlay.vlines }; };
