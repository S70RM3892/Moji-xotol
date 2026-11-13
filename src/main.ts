import { type Slot, generateBoard } from './core/generator';
import { type Puzzle, type SlotState, judgeSlot, makePuzzle, slotCells } from './core/puzzle';
import { MODE_LABEL, type Mode, TIER_LABEL, WORD_MAP, type Word, makeRng } from './core/words';

const LEVELS = [
  { label: 'やさしい', reveal: 0.5 },
  { label: 'ふつう', reveal: 0.3 },
  { label: 'むずかしい', reveal: 0.12 },
];
/** 層ごとの基礎点 × 文字数 */
const TIER_POINTS = [10, 15, 20];
/** 1面に混ぜる復習語の上限 */
const REVIEW_PER_BOARD = 2;

type Pos = { r: number; c: number };

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const boardEl = $('board');
const handEl = $('hand');
const cluesEl = $('clues');
const clueEl = $('clue');
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
/** ヒントや答え表示に頼った語。次の面以降にまた出す */
const missed = new Set(load<string[]>('missed', []).filter((w) => WORD_MAP.has(w)));

let validWords: Set<string> | null = null;
const isValid = (w: string) => (validWords ? validWords.has(w) : WORD_MAP.has(w));
const isTarget = (w: string) => WORD_MAP.has(w);

// ?seed=数値 を付けると同じ盤面を再現できる
const seedParam = Number(new URLSearchParams(location.search).get('seed'));
const rng = makeRng(seedParam || (Date.now() ^ (Math.random() * 2 ** 32)) >>> 0);

let puzzle: Puzzle;
let started = false;
let cells: string[][]; // 現在の盤面
let hand: (string | null)[]; // null = 盤面に置いた
let from: (number | null)[][]; // 置いたマス → 手札の位置
let hinted: boolean[][]; // ヒントで開けたマス
let locked: boolean[][]; // 正解して確定した語のマス
let helped: Set<Slot>; // ヒントを使った語
let focusSlot: Slot;
let cursor: Pos | null = null;
let finished = false;
let message = '';

const cellsOf = (slot: Slot): Pos[] => slotCells(slot).map(([r, c]) => ({ r, c }));
const textOf = (slot: Slot) => cellsOf(slot).map(({ r, c }) => cells[r][c]).join('');
const through = (r: number, c: number) =>
  puzzle.board.slots.filter((s) => cellsOf(s).some((p) => p.r === r && p.c === c));
const editable = (r: number, c: number) =>
  !!puzzle.board.solution[r][c] && !puzzle.fixed[r][c] && !hinted[r][c] && !locked[r][c];

/** idx より後の最初の空きマス。なければ先頭から探す */
function firstBlank(slot: Slot, idx = -1): Pos | null {
  const list = cellsOf(slot);
  const order = [...list.slice(idx + 1), ...list.slice(0, idx + 1)];
  return order.find(({ r, c }) => !cells[r][c]) ?? null;
}
function nextOpenSlot(): Slot | null {
  const { slots } = puzzle.board;
  const start = slots.indexOf(focusSlot);
  for (let i = 1; i <= slots.length; i++) {
    const s = slots[(start + i) % slots.length];
    if (firstBlank(s)) return s;
  }
  return null;
}

function newPuzzle(): void {
  const include: Word[] = [...missed]
    .map((w) => ({ w, k: rng() }))
    .sort((a, b) => a.k - b.k)
    .slice(0, REVIEW_PER_BOARD)
    .map(({ w }) => WORD_MAP.get(w)!);
  const { board } = generateBoard({ mode, size: 10, wordCount: 5, include }, rng);
  // 番号順（上→下、左→右）に並べる
  board.slots.sort((a, b) => a.row - b.row || a.col - b.col);
  puzzle = makePuzzle(board, LEVELS[level].reveal, rng);

  const sol = board.solution;
  cells = sol.map((row, r) => row.map((ch, c) => (puzzle.fixed[r][c] ? ch : '')));
  from = sol.map((row) => row.map(() => null));
  hinted = sol.map((row) => row.map(() => false));
  locked = sol.map((row) => row.map(() => false));
  hand = [...puzzle.hand];
  helped = new Set();
  finished = false;
  message = '';
  focusSlot = board.slots[0];
  cursor = firstBlank(focusSlot);
  started = true;
  render();
}

function states(): SlotState[] {
  return puzzle.board.slots.map((s) => judgeSlot(s, cells, isValid, isTarget));
}

function relock(): void {
  locked = locked.map((row) => row.map(() => false));
  for (const slot of puzzle.board.slots) {
    // 出題どおりの語だけ確定する。別解は必要な文字を食うことがあるので外せるままにする
    if (textOf(slot) === slot.word.text) for (const { r, c } of cellsOf(slot)) locked[r][c] = true;
  }
}

function takeBack(r: number, c: number): void {
  hand[from[r][c]!] = cells[r][c];
  cells[r][c] = '';
  from[r][c] = null;
}

/** 盤面が変わった後: 判定してカーソルを次の空きへ進める */
function afterChange(): void {
  relock();
  message = '';
  const st = states();
  if (st.every((s) => s === 'target' || s === 'valid')) {
    finish(st);
    return;
  }
  const idx = cursor ? cellsOf(focusSlot).findIndex((p) => p.r === cursor!.r && p.c === cursor!.c) : -1;
  const blank = firstBlank(focusSlot, idx);
  if (blank) {
    cursor = blank;
  } else if (st[puzzle.board.slots.indexOf(focusSlot)] === 'invalid') {
    cursor = null;
    message = '単語になっていない。外したい文字をタップしろ';
  } else {
    const next = nextOpenSlot();
    if (next) {
      focusSlot = next;
      cursor = firstBlank(next);
    } else {
      cursor = null;
      message = '赤い並びが単語になっていない';
    }
  }
  render();
}

function tapCell(r: number, c: number): void {
  if (finished) return;
  const list = through(r, c);
  if (!list.length) return;
  if (cells[r][c] && editable(r, c)) {
    takeBack(r, c);
    if (!list.includes(focusSlot)) focusSlot = list[0];
    cursor = { r, c };
    relock();
    message = '';
    render();
    return;
  }
  const onCursor = cursor?.r === r && cursor?.c === c;
  if (list.includes(focusSlot) && onCursor && list.length > 1) {
    focusSlot = list.find((s) => s !== focusSlot)!; // 同じマスをもう一度 → 縦横を切り替え
  } else if (!list.includes(focusSlot)) {
    focusSlot = list.find((s) => firstBlank(s)) ?? list[0];
  }
  cursor = !cells[r][c] ? { r, c } : firstBlank(focusSlot);
  render();
}

function tapTile(i: number): void {
  if (finished || hand[i] === null) return;
  if (!cursor) {
    const slot = firstBlank(focusSlot) ? focusSlot : nextOpenSlot();
    if (!slot) {
      message = '空きマスがない。外したい文字をタップしろ';
      render();
      return;
    }
    focusSlot = slot;
    cursor = firstBlank(slot);
  }
  const { r, c } = cursor!;
  if (cells[r][c]) takeBack(r, c);
  cells[r][c] = hand[i]!;
  from[r][c] = i;
  hand[i] = null;
  afterChange();
}

function backspace(): void {
  if (finished) return;
  const list = cellsOf(focusSlot);
  let idx = cursor ? list.findIndex((p) => p.r === cursor!.r && p.c === cursor!.c) : list.length - 1;
  if (cursor && !cells[cursor.r][cursor.c]) idx--;
  for (; idx >= 0; idx--) {
    const { r, c } = list[idx];
    if (cells[r][c] && editable(r, c)) {
      takeBack(r, c);
      cursor = { r, c };
      relock();
      message = '';
      render();
      return;
    }
  }
}

function hint(): void {
  if (finished) return;
  const sol = puzzle.board.solution;
  const wrong = ({ r, c }: Pos) => cells[r][c] !== sol[r][c];
  const target =
    (cursor && wrong(cursor) ? cursor : null) ??
    cellsOf(focusSlot).find(wrong) ??
    puzzle.board.slots.flatMap(cellsOf).find(wrong);
  if (!target) return;
  const { r, c } = target;
  if (cells[r][c]) takeBack(r, c);
  const letter = sol[r][c];
  let i = hand.indexOf(letter);
  if (i < 0) {
    // 手札にないなら、間違った場所に置かれている同じ文字を持ってくる
    outer: for (let r2 = 0; r2 < sol.length; r2++) {
      for (let c2 = 0; c2 < sol.length; c2++) {
        if (cells[r2][c2] === letter && sol[r2][c2] !== letter && from[r2][c2] !== null) {
          i = from[r2][c2]!;
          takeBack(r2, c2);
          break outer;
        }
      }
    }
  }
  if (i < 0) return;
  cells[r][c] = letter;
  from[r][c] = i;
  hand[i] = null;
  hinted[r][c] = true;
  const list = through(r, c);
  list.forEach((s) => helped.add(s));
  if (!list.includes(focusSlot)) focusSlot = list[0];
  cursor = { r, c };
  afterChange();
}

function finish(st: SlotState[]): void {
  finished = true;
  cursor = null;
  let gained = 0;
  puzzle.board.slots.forEach((slot, i) => {
    const text = textOf(slot);
    if (helped.has(slot)) {
      missed.add(slot.word.text);
      return;
    }
    if (text === slot.word.text) missed.delete(text);
    const w = WORD_MAP.get(text);
    gained += w && st[i] === 'target' ? TIER_POINTS[w.tier] * text.length : 2 * text.length;
  });
  score += gained;
  cleared += 1;
  save('score', score);
  save('cleared', cleared);
  save('missed', [...missed]);
  message = `クリア！ +${gained}点`;
  render();
}

function giveUp(): void {
  if (finished) return;
  finished = true;
  cursor = null;
  for (const slot of puzzle.board.slots) {
    if (textOf(slot) !== slot.word.text) {
      missed.add(slot.word.text);
      helped.add(slot);
    }
  }
  save('missed', [...missed]);
  cells = puzzle.board.solution.map((row) => [...row]);
  hand = hand.map(() => null);
  message = '答えを表示した。解けなかった語は後の面でまた出る';
  render();
}

function clueText(slot: Slot, num: number): string {
  return `${num}${slot.dir === 'across' ? '→' : '↓'} ${slot.word.gloss}（${slot.word.text.length}字）`;
}

function render(): void {
  $('score').textContent = String(score);
  $('cleared').textContent = String(cleared);
  $('missed').textContent = String(missed.size);
  const { board, fixed } = puzzle;
  const sol = board.solution;
  const st = states();

  // マスごとの状態: 悪い判定を優先して色を付ける
  const mark = new Map<string, SlotState>();
  const rank: Record<SlotState, number> = { open: 0, target: 1, valid: 2, invalid: 3 };
  board.slots.forEach((slot, i) => {
    for (const { r, c } of cellsOf(slot)) {
      const k = `${r},${c}`;
      const cur = mark.get(k);
      if (!cur || rank[st[i]] > rank[cur]) mark.set(k, st[i]);
    }
  });
  const hl = new Set(finished ? [] : cellsOf(focusSlot).map(({ r, c }) => `${r},${c}`));
  const nums = new Map<Slot, number>();
  const numAt = new Map<string, number>();
  for (const s of board.slots) {
    const k = `${s.row},${s.col}`;
    if (!numAt.has(k)) numAt.set(k, numAt.size + 1);
    nums.set(s, numAt.get(k)!);
  }

  // 使っている範囲だけ描く（マスを大きくするため）
  const used = board.slots.flatMap(cellsOf);
  const minR = Math.min(...used.map((p) => p.r));
  const maxR = Math.max(...used.map((p) => p.r));
  const minC = Math.min(...used.map((p) => p.c));
  const maxC = Math.max(...used.map((p) => p.c));
  boardEl.style.setProperty('--cols', String(maxC - minC + 1));
  boardEl.style.setProperty('--rows', String(maxR - minR + 1));
  boardEl.replaceChildren();
  for (let r = minR; r <= maxR; r++) {
    for (let c = minC; c <= maxC; c++) {
      const el = document.createElement('div');
      const k = `${r},${c}`;
      if (!sol[r][c]) {
        el.className = 'cell void';
        boardEl.append(el);
        continue;
      }
      const m = mark.get(k);
      const given = fixed[r][c] || hinted[r][c];
      const cls = ['cell', given ? 'fixed' : cells[r][c] ? 'placed' : 'blank'];
      if (hinted[r][c]) cls.push('hinted');
      if (m === 'target') cls.push('ok');
      if (m === 'valid') cls.push('alt');
      if (m === 'invalid') cls.push('bad');
      if (hl.has(k)) cls.push('hl');
      if (cursor?.r === r && cursor.c === c) cls.push('cur');
      el.className = cls.join(' ');
      el.textContent = cells[r][c];
      const n = numAt.get(k);
      if (n) {
        const num = document.createElement('span');
        num.className = 'num';
        num.textContent = String(n);
        el.append(num);
      }
      if (!finished) {
        el.tabIndex = 0;
        el.setAttribute('role', 'button');
        el.setAttribute('aria-label', `${r + 1}行${c + 1}列 ${cells[r][c] || '空き'}`);
        el.onclick = () => tapCell(r, c);
        el.onkeydown = (e) => {
          if (e.key === ' ') {
            e.preventDefault();
            tapCell(r, c);
          }
        };
      }
      boardEl.append(el);
    }
  }

  clueEl.replaceChildren();
  if (!finished) {
    const tier = document.createElement('span');
    tier.className = 'tier';
    tier.textContent = TIER_LABEL[focusSlot.word.tier];
    clueEl.append(tier, clueText(focusSlot, nums.get(focusSlot)!));
  }
  statusEl.textContent = message;

  handEl.replaceChildren();
  hand.forEach((ch, i) => {
    if (ch === null) return;
    const b = document.createElement('button');
    b.className = 'tile';
    b.textContent = ch;
    b.onclick = () => tapTile(i);
    handEl.append(b);
  });

  $<HTMLButtonElement>('back').disabled = finished;
  $<HTMLButtonElement>('hint').disabled = finished;
  $<HTMLButtonElement>('giveup').disabled = finished;
  $('next').classList.toggle('primary', finished);
  $('next').textContent = finished ? '次の面へ' : 'とばす';

  cluesEl.replaceChildren();
  board.slots.forEach((slot, i) => {
    const li = document.createElement('li');
    if (slot === focusSlot && !finished) li.classList.add('hl');
    const tier = document.createElement('span');
    tier.className = 'tier';
    tier.textContent = TIER_LABEL[slot.word.tier];
    const gloss = document.createElement('span');
    gloss.className = 'gloss';
    gloss.textContent = clueText(slot, nums.get(slot)!);
    li.append(tier, gloss);
    if (finished || st[i] === 'target') {
      const ans = document.createElement('span');
      ans.className = 'ans';
      ans.textContent = slot.word.text;
      if (helped.has(slot)) li.classList.add('missed');
      li.append(ans);
    }
    li.onclick = () => {
      if (finished) return;
      focusSlot = slot;
      cursor = firstBlank(slot);
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
$('back').onclick = backspace;
$('hint').onclick = hint;
$('giveup').onclick = giveUp;
$('next').onclick = newPuzzle;

// キーボード: 文字で手札を置く、Backspace で戻す、クリア後は Enter で次へ
document.addEventListener('keydown', (e) => {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (/^[a-zA-Z]$/.test(e.key)) {
    const i = hand.indexOf(e.key.toLowerCase());
    if (i >= 0) tapTile(i);
  } else if (e.key === 'Backspace') {
    e.preventDefault();
    backspace();
  } else if (e.key === 'Enter' && finished && !(e.target instanceof HTMLButtonElement)) {
    newPuzzle();
  }
});

// 判定辞書: ページに埋め込まれていればそれを使い、なければ後から読み込む
function setValid(text: string): void {
  validWords = new Set(text.split('\n'));
  if (started) render(); // 埋め込みの場合は最初の盤面より先に届く
}
const embedded = document.getElementById('valid-words');
if (embedded?.textContent) {
  setValid(embedded.textContent.trim());
} else {
  fetch(`${import.meta.env.BASE_URL}valid.txt`)
    .then((r) => (r.ok ? r.text() : Promise.reject(new Error(String(r.status)))))
    .then(setValid)
    .catch(() => {
      message = '判定辞書を読み込めなかった。別解の判定は出題語だけになる';
      render();
    });
}

newPuzzle();
