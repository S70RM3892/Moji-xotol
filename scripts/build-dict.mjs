// 辞書ビルド: data/raw → src/data/words.json（出題辞書）, public/valid.txt（判定辞書）
// 使い方: node scripts/build-dict.mjs
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const RAW = new URL('../data/raw/', import.meta.url);
const read = (f) => readFileSync(new URL(f, RAW), 'utf8').replace(/^﻿/, '');

const MIN_LEN = 4;
const MAX_LEN = 10;
const CEFR_ORDER = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
// 0=共テ(A1-B1) 1=難関2次(B2) 2=京大(C1-C2)
const TIER = { A1: 0, A2: 0, B1: 0, B2: 1, C1: 2, C2: 2 };
const CONTENT_POS = new Set(['noun', 'adjective', 'verb', 'adverb']);

function parseCsv(text) {
  const [, ...lines] = text.split(/\r?\n/).filter(Boolean);
  return lines.map((l) => {
    const [headword, pos, cefr] = l.split(',');
    return { headword, pos, cefr };
  });
}

// --- 出題語: 見出し語ごとに最も易しいレベルを採用 ---
const entries = new Map(); // word -> {cefr, content}
for (const file of ['cefrj-vocabulary-profile-1.5.csv', 'octanove-vocabulary-profile-c1c2-1.0.csv']) {
  for (const { headword, pos, cefr } of parseCsv(read(file))) {
    if (!(cefr in TIER)) continue;
    const word = headword.split('/')[0].trim();
    if (!/^[a-z]+$/.test(word)) continue; // 大文字始まり(固有名詞)・複合語・記号入りは除外
    const e = entries.get(word) ?? { cefr, content: false };
    if (CEFR_ORDER.indexOf(cefr) < CEFR_ORDER.indexOf(e.cefr)) e.cefr = cefr;
    if (CONTENT_POS.has(pos)) e.content = true;
    entries.set(word, e);
  }
}

// --- 和訳: ejdict-hand を整形。data/gloss-overrides.tsv があれば優先 ---
const ej = new Map();
for (const line of read('ejdict-hand.txt').split('\n')) {
  const tab = line.indexOf('\t');
  if (tab < 0) continue;
  for (const head of line.slice(0, tab).split(',')) {
    const h = head.trim();
    if (!ej.has(h)) ej.set(h, line.slice(tab + 1));
  }
}
function cleanGloss(raw) {
  const senses = raw
    .replace(/《[^》]*》/g, '')
    .replace(/〈[CU]〉/g, '')
    .replace(/[『』]/g, '')
    .replace(/\([^)]*\)/g, '')
    .split(' / ')
    .map((s) => s.replace(/^=.*$/, '').replace(/^[\s,;]+|[\s,;]+$/g, '').replace(/\s+/g, ''))
    .filter((s) => s && !/[a-zA-Z]{3,}/.test(s));
  let out = '';
  for (const s of senses.slice(0, 3)) {
    const next = out ? `${out}／${s}` : s;
    if (next.length > 30 && out) break;
    out = next;
  }
  return out.slice(0, 40);
}
const overrides = new Map();
const ovPath = new URL('../data/gloss-overrides.tsv', import.meta.url);
if (existsSync(ovPath)) {
  for (const line of readFileSync(ovPath, 'utf8').split('\n')) {
    if (!line.trim() || line.startsWith('#')) continue;
    const [w, g] = line.split('\t');
    if (w && g) overrides.set(w.trim(), g.trim());
  }
}

const words = [];
const stats = { noGloss: 0, functionWord: 0, length: 0 };
for (const [word, e] of entries) {
  if (word.length < MIN_LEN || word.length > MAX_LEN) { stats.length++; continue; }
  if (!e.content) { stats.functionWord++; continue; }
  const gloss = overrides.get(word) ?? cleanGloss(ej.get(word) ?? '');
  if (!gloss) { stats.noGloss++; continue; }
  words.push([word, TIER[e.cefr], e.cefr, gloss]);
}
words.sort((a, b) => (a[0] < b[0] ? -1 : 1));
writeFileSync(new URL('../src/data/words.json', import.meta.url), JSON.stringify(words));

// --- 判定辞書: ENABLE(2〜MAX_LEN文字) + 出題語すべて ---
const valid = new Set(words.map((w) => w[0]));
for (const w of read('enable1.txt').split(/\r?\n/)) {
  if (w.length >= 2 && w.length <= MAX_LEN && /^[a-z]+$/.test(w)) valid.add(w);
}
writeFileSync(new URL('../public/valid.txt', import.meta.url), [...valid].sort().join('\n'));

const byCefr = {};
for (const w of words) byCefr[w[2]] = (byCefr[w[2]] ?? 0) + 1;
console.log('出題語:', words.length, byCefr);
console.log('除外:', stats, '上書き和訳:', overrides.size);
console.log('判定語:', valid.size);
