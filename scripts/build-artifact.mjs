// dist/ を1枚のHTMLにまとめる（CSS・JS・判定辞書をすべて埋め込む）
// 使い方: npm run build && node scripts/build-artifact.mjs  → artifact/moji-xotol.html
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');
const assets = readdirSync(new URL('dist/assets/', root));
const css = read(`dist/assets/${assets.find((f) => f.endsWith('.css'))}`);
const js = read(`dist/assets/${assets.find((f) => f.endsWith('.js'))}`);
const body = read('index.html').match(/<!-- app:start -->([\s\S]*)<!-- app:end -->/)[1];
const valid = read('public/valid.txt');
const safe = (s) => s.replace(/<\/script/gi, '<\\/script');

const html = `<title>Moji-Xoltol</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;700&display=swap">
<style>${css}</style>
${body}
<script type="text/plain" id="valid-words">${valid}</script>
<script type="module">${safe(js)}</script>
`;
mkdirSync(new URL('artifact/', root), { recursive: true });
writeFileSync(new URL('artifact/moji-xotol.html', root), html);
console.log(`artifact/moji-xotol.html ${(html.length / 1e6).toFixed(2)} MB`);
