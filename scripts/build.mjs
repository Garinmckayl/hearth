import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { build } from 'esbuild';
await mkdir('dist', { recursive: true });
await cp('public', 'dist', { recursive: true });
await build({ entryPoints: ['public/app.js'], outfile: 'dist/app.js', bundle: true, format: 'iife', target: ['chrome70'], minify: true });
const html = await readFile('dist/index.html', 'utf8');
await writeFile('dist/index.html', html.replace('type="module" src="app.js"', 'defer src="app.js"'));
console.log('Built Hearth into dist/. Static hosting runs in story mode.');
