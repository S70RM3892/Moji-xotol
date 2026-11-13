import { type Slot, generateBoard } from './core/generator';
import { type Puzzle, type SlotState, judgeSlot, makePuzzle, slotCells } from './core/puzzle';
import { MODE_LABEL, type Mode, TIER_LABEL, WORD_MAP, makeRng } from './core/words';

const LEVELS = [
  { label: 'やさしい', reveal: 0.5 },
  { label: 'ふつう', reveal: 0.3 },
  { label: 'むずかしい', reveal: 0.12 },
];
/** 層ごとの基礎点 × 文字数 */
const TIER_POINTS = [10, 15, 20];

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const boardEl = $('board');
const handEl = $('hand');
const cluesEl = $('clues');
const statusEl = $('status');

function load<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v === null ? fallback : (JSON.parse(v) as T);
  } catch {
    return fallback;
  }
}
function save(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* 保存できなくても遊べる */
  }
}

let mode = load<Mode>('mode', 'kyote');
let level = load<number>('level', 1);
let score = load<number>('score', 0);
let cleared = load<number>('cleared', 0);

let validWords: Set<string> | null = null;
const isValid = (w: string) => (validWords ? validWords.has(w) : WORD_MAP.has(w));
const isTarget = (w: string) => WORD_MAP.has(w);

// ?seed=数値 を付けると同じ盤面を再現できる
const seedParam = Number(new URLSearchParams(location.search).get('seed'));
const rng = makeRng(seedParam || (Date.now() ^ (Math.random() * 2 ** 32)) >>> 0);
let puzzle: Puzzle;
let cells: string[][]; // 現在の盤面
let hand: (string | null)[]; // null = 盤面に置いた
let from: (number | null)[][]; // 置いたマス → 手札の位置
let selected: number | null = null;
let focusSlot: Slot | null = null;
let finished = false;
let revealed = false;

function newPuzzle(): void {
  const { board } = generateBoard({ mode, size: 10, wordCount: 6 }, rng);
  // 番号順（上→下、左→右）に並べる
  board.slots.sort((a, b) => a.row - b.row || a.col - b.col);
  puzzle = makePuzzle(board, LEVELS[level].reveal, rng);
  resetPlacement();
}

function resetPlacement(): void {
  const { board, fixed } = puzzle;
  cells = board.solution.map((row, r) => row.map((ch, c) => (fixed[r][c] ? ch : '')));
  from = board.solution.map((row) => row.map(() => null));
  hand = [...puzzle.hand];
  selected = null;
  focusSlot = null;
  finished = false;
  revealed = false;
  statusEl.textContent = '和訳を見て、手札の文字で単語を完成させろ';
  render();
}

function states(): SlotState[] {
  return puzzle.board.slots.map((s) => judgeSlot(s, cells, isValid, isTarget));
}

function place(r: number, c: number): void {
  if (finished || puzzle.fixed[r][c] || !puzzle.board.solution[r][c]) return;
  if (cells[r][c]) {
    // 置いた文字を手札に戻す
    hand[from[r][c]!] = cells[r][c];
    cells[r][c] = '';
    from[r][c] = null;
  } else if (selected !== null) {
    cells[r][c] = hand[selected]!;
    from[r][c] = selected;
    hand[selected] = null;
    selected = null;
  } else {
    // 手札を選んでいないときは、そのマスを通る語の和訳を出す（縦横は交互）
    const through = puzzle.board.slots.filter((s) => slotCells(s).some(([r2, c2]) => r2 === r && c2 === c));
    focusSlot = through[(through.indexOf(focusSlot!) + 1) % through.length];
    statusEl.textContent = `${focusSlot.dir === 'across' ? '→' : '↓'} ${focusSlot.word.gloss}（${focusSlot.word.text.length}字）`;
    render();
    return;
  }
  check();
  render();
}

function check(): void {
  const st = states();
  if (st.some((s) => s === 'open' || s === 'invalid')) {
    if (st.includes('invalid')) statusEl.textContent = '赤い並びは単語になっていない';
    return;
  }
  finished = true;
  let gained = 0;
  puzzle.board.slots.forEach((slot, i) => {
    const text = slotCells(slot).map(([r, c]) => cells[r][c]).join('');
    const w = WORD_MAP.get(text);
    gained += w && st[i] === 'target' ? TIER_POINTS[w.tier] * text.length : 2 * text.length;
  });
  score += gained;
  cleared += 1;
  save('score', score);
  save('cleared', cleared);
  statusEl.textContent = `クリア！ +${gained}点。下の一覧で意味を確認してから次へ`;
}

function giveUp(): void {
  if (finished) return;
  finished = true;
  revealed = true;
  cells = puzzle.board.solution.map((row) => [...row]);
  hand = hand.map(() => null);
  statusEl.textContent = '答えを表示した（得点なし）。綴りと意味を声に出して確認しろ';
  render();
}

function render(): void {
  $('score').textContent = String(score);
  $('cleared').textContent = String(cleared);
  const { board, fixed } = puzzle;
  const st = states();

  // マスごとの状態: 悪い判定を優先して色を付ける
  const mark = new Map<string, SlotState>();
  const rank: Record<SlotState, number> = { open: 0, target: 1, valid: 2, invalid: 3 };
  board.slots.forEach((slot, i) => {
    for (const [r, c] of slotCells(slot)) {
      const k = `${r},${c}`;
      const cur = mark.get(k);
      if (!cur || rank[st[i]] > rank[cur]) mark.set(k, st[i]);
    }
  });
  const hl = new Set(focusSlot ? slotCells(focusSlot).map(([r, c]) => `${r},${c}`) : []);
  const nums = new Map<string, number>();
  board.slots.forEach((s, i) => {
    const k = `${s.row},${s.col}`;
    if (!nums.has(k)) nums.set(k, i + 1);
  });

  boardEl.style.setProperty('--size', String(board.size));
  boardEl.replaceChildren();
  for (let r = 0; r < board.size; r++) {
    for (let c = 0; c < board.size; c++) {
      const el = document.createElement('div');
      const k = `${r},${c}`;
      if (!board.solution[r][c]) {
        el.className = 'cell void';
      } else {
        const m = mark.get(k);
        const cls = ['cell', fixed[r][c] ? 'fixed' : cells[r][c] ? 'placed' : 'blank'];
        if (m === 'target') cls.push('ok');
        if (m === 'valid') cls.push('alt');
        if (m === 'invalid') cls.push('bad');
        if (hl.has(k)) cls.push('hl');
        el.className = cls.join(' ');
        el.textContent = cells[r][c];
        const n = nums.get(k);
        if (n) {
          const num = document.createElement('span');
          num.className = 'num';
          num.textContent = String(n);
          el.append(num);
        }
        if (!fixed[r][c]) {
          el.tabIndex = 0;
          el.setAttribute('role', 'button');
          el.setAttribute('aria-label', `${r + 1}行${c + 1}列 ${cells[r][c] || '空き'}`);
          el.onclick = () => place(r, c);
          el.onkeydown = (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              place(r, c);
            }
          };
        }
      }
      boardEl.append(el);
    }
  }

  handEl.replaceChildren();
  hand.forEach((ch, i) => {
    if (ch === null) return;
    const b = document.createElement('button');
    b.className = i === selected ? 'tile sel' : 'tile';
    b.textContent = ch;
    b.setAttribute('aria-pressed', String(i === selected));
    b.onclick = () => {
      selected = selected === i ? null : i;
      render();
    };
    handEl.append(b);
  });

  cluesEl.replaceChildren();
  board.slots.forEach((slot, i) => {
    const li = document.createElement('li');
    if (slot === focusSlot) li.classList.add('hl');
    const tag = document.createElement('span');
    tag.className = 'tag';
    tag.textContent = `${nums.get(`${slot.row},${slot.col}`)}${slot.dir === 'across' ? '→' : '↓'}`;
    const tier = document.createElement('span');
    tier.className = 'tier';
    tier.textContent = TIER_LABEL[slot.word.tier];
    const gloss = document.createElement('span');
    gloss.textContent = `${slot.word.gloss}（${slot.word.text.length}字）`;
    li.append(tag, tier, gloss);
    if (finished || st[i] === 'target') {
      const ans = document.createElement('span');
      ans.className = 'ans';
      ans.textContent = slot.word.text;
      if (revealed) li.classList.add('missed');
      li.append(ans);
    }
    li.onclick = () => {
      focusSlot = focusSlot === slot ? null : slot;
      render();
    };
    cluesEl.append(li);
  });
}

function segment<T>(el: HTMLElement, items: { label: string; value: T }[], get: () => T, set: (v: T) => void): void {
  const draw = () => {
    el.replaceChildren(
      ...items.map(({ label, value }) => {
        const b = document.createElement('button');
        b.textContent = label;
        b.setAttribute('aria-pressed', String(get() === value));
        b.onclick = () => {
          set(value);
          draw();
          newPuzzle();
        };
        return b;
      }),
    );
  };
  draw();
}

segment(
  $('modes'),
  (Object.keys(MODE_LABEL) as Mode[]).map((m) => ({ label: MODE_LABEL[m], value: m })),
  () => mode,
  (m) => save('mode', (mode = m)),
);
segment(
  $('levels'),
  LEVELS.map((l, i) => ({ label: l.label, value: i })),
  () => level,
  (l) => save('level', (level = l)),
);
$('reset').onclick = () => {
  if (!finished) resetPlacement();
};
$('giveup').onclick = giveUp;
$('next').onclick = newPuzzle;

// 判定辞書は大きいので後から読み込む。届くまでは出題辞書だけで判定する
fetch(`${import.meta.env.BASE_URL}valid.txt`)
  .then((r) => (r.ok ? r.text() : Promise.reject(new Error(String(r.status)))))
  .then((t) => {
    validWords = new Set(t.split('\n'));
    render();
  })
  .catch(() => {
    statusEl.textContent = '判定辞書を読み込めなかった。別解の判定は出題語だけになる';
  });

newPuzzle();
