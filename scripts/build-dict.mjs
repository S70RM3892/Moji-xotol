// 辞書ビルド: data/raw → src/data/words.json（出題辞書）, public/valid.txt（判定辞書）
// 使い方: node scripts/build-dict.mjs
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const RAW = new URL('../data/raw/', import.meta.url);
const read = (f) => readFileSync(new URL(f, RAW), 'utf8').replace(/^﻿/, '');

const MIN_LEN = 4;
const MAX_LEN = 10; // 出題語の上限（喰らうモードは長い語も出せる）
const VALID_MAX = 8; // 判定辞書の上限。刻むモードの盤面が8マスなので、それより長い語は置けない
/** 2文字語は学習者が実際に目にするものだけ（aa や xu のような競技用の語は入れない） */
const TWO = 'ad ah am an as at ax be by do eh go ha he hi if in is it ma me my no of oh on or ow ox pa so to uh um up us we ye yo'.split(' ');
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
    .map((s) => s.replace(/^=.*$/, '').replace(/\s+/g, ''))
    .filter((s) => s && !/[a-zA-Z]{3,}/.test(s));
  // 語義ごとに言い換えを3つまで。同じ訳語が何度も出てくるので、全体で重複を除く
  const seen = new Set();
  const out = [];
  for (const sense of senses) {
    const words = [];
    for (const w of sense.split(/[,;・]/)) {
      const t = w.replace(/^[\s,;]+|[\s,;]+$/g, '');
      if (!t || seen.has(t)) continue;
      seen.add(t);
      if (words.length < 3) words.push(t);
    }
    if (!words.length) continue;
    const next = words.join('、');
    if (out.length && out.join('／').length + next.length > 34) break;
    out.push(next);
    if (out.length >= 3) break;
  }
  return out.join('／').slice(0, 44);
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

// --- 判定辞書: ENABLE（3文字以上） + 厳選2文字語 + 出題語。行は「単語<TAB>短い和訳」 ---
// 実在する英単語なら成立させる。頻出語だけに絞ると、正しい単語が弾かれて窮屈になる。
const valid = new Set(words.map((w) => w[0]).filter((w) => w.length <= VALID_MAX));
for (const w of TWO) valid.add(w);
for (const w of read('enable1.txt').split(/\r?\n/)) {
  if (w.length >= 3 && w.length <= VALID_MAX && /^[a-z]+$/.test(w)) valid.add(w);
}
const target = new Map(words.map((w) => [w[0], w[3]]));
/** 変化形は元の形の和訳を借りる */
function baseOf(w) {
  const tries = [
    [/ies$/, 'y'], [/es$/, ''], [/s$/, ''], [/ied$/, 'y'], [/ed$/, ''], [/ed$/, 'e'], [/d$/, ''],
    [/ing$/, ''], [/ing$/, 'e'], [/(.)\1ing$/, '$1'], [/(.)\1ed$/, '$1'], [/er$/, ''], [/est$/, ''], [/ly$/, ''],
  ];
  for (const [re, to] of tries) {
    const b = w.replace(re, to);
    if (b !== w && b.length >= 2 && (target.has(b) || ej.has(b))) return b;
  }
  return null;
}
const short = (g) => g.split('／')[0].slice(0, 18);
let glossed = 0;
const lines = [...valid].sort().map((w) => {
  if (target.has(w)) return w; // 出題語の和訳は words.json にある
  let g = overrides.get(w) ?? cleanGloss(ej.get(w) ?? '');
  if (!g) {
    const b = baseOf(w);
    if (b) g = `${b} の変化形`;
  }
  if (g) glossed++;
  return g ? `${w}\t${short(g)}` : w;
});
writeFileSync(new URL('../public/valid.txt', import.meta.url), lines.join('\n'));

const byCefr = {};
for (const w of words) byCefr[w[2]] = (byCefr[w[2]] ?? 0) + 1;
console.log('出題語:', words.length, byCefr);
console.log('除外:', stats, '上書き和訳:', overrides.size);
console.log('判定語:', valid.size, '(うち出題語以外で和訳あり', glossed, ')');
