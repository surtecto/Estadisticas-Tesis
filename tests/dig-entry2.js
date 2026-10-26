import { digitizeImage } from '../src/figure/digitize.js';
window.dig = async (src) => { window.__inside = []; await digitizeImage(src); return window.__inside; };
