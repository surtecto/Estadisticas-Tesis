// Compila la aplicación: node tools/build.mjs [--dev]
import { build } from 'esbuild';
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const dev = process.argv.includes('--dev');
mkdirSync('assets', { recursive: true });
await build({
  entryPoints: ['src/main.js'], bundle: true, minify: !dev, sourcemap: dev ? 'inline' : false, format: 'iife', target: ['es2020'],
  outfile: 'assets/app.js', logLevel: 'info', legalComments: 'none', loader: { '.json': 'json', '.csv': 'text' },
});
copyFileSync('src/app.css', 'assets/app.css');
const v = createHash('sha1').update(readFileSync('assets/app.js')).update(readFileSync('assets/app.css')).digest('hex').slice(0, 10);
const html = readFileSync('index.html', 'utf8').replace(/assets\/app\.js(\?v=\w+)?/g, `assets/app.js?v=${v}`).replace(/assets\/app\.css(\?v=\w+)?/g, `assets/app.css?v=${v}`);
writeFileSync('index.html', html);
console.log('ok');
