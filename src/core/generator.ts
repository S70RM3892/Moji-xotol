import { type Mode, type Rng, type Word, sampleWord } from './words';

export type Dir = 'across' | 'down';

export interface Slot {
  word: Word;
  row: number;
  col: number;
  dir: Dir;
}

export interface Board {
  size: number;
  /** 完成形。空きマスは '' */
  solution: string[][];
  slots: Slot[];
}

export interface GenOptions {
  mode: Mode;
  size?: number;
  wordCount?: number;
  /** 1回の試行で引く候補語数 */
  pool?: number;
  maxAttempts?: number;
  /** 必ず候補の先頭に入れる語（復習用） */
  include?: Word[];
}

const ACROSS = 1;
const DOWN = 2;

class Grid {
  letters: string[][];
  dirs: number[][]; // そのマスを通る語の向き(ビット)
  constructor(readonly size: number) {
    this.letters = Array.from({ length: size }, () => Array<string>(size).fill(''));
    this.dirs = Array.from({ length: size }, () => Array<number>(size).fill(0));
  }
  at(r: number, c: number): string {
    return r < 0 || c < 0 || r >= this.size || c >= this.size ? '' : this.letters[r][c];
  }
  /** 置けるなら交差数、置けないなら -1。クロスワードの隣接規則を守る */
  fit(text: string, row: number, col: number, dir: Dir): number {
    const [dr, dc] = dir === 'across' ? [0, 1] : [1, 0];
    const bit = dir === 'across' ? ACROSS : DOWN;
    const endR = row + dr * (text.length - 1);
    const endC = col + dc * (text.length - 1);
    if (row < 0 || col < 0 || endR >= this.size || endC >= this.size) return -1;
    if (this.at(row - dr, col - dc) || this.at(endR + dr, endC + dc)) return -1;
    let crossings = 0;
    for (let i = 0; i < text.length; i++) {
      const r = row + dr * i;
      const c = col + dc * i;
      const cur = this.letters[r][c];
      if (cur) {
        if (cur !== text[i] || this.dirs[r][c] & bit) return -1;
        crossings++;
      } else if (this.at(r - dc, c - dr) || this.at(r + dc, c + dr)) {
        return -1; // 横に別の語が接すると意図しない並びができる
      }
    }
    return crossings;
  }
  place(text: string, row: number, col: number, dir: Dir): void {
    const [dr, dc] = dir === 'across' ? [0, 1] : [1, 0];
    const bit = dir === 'across' ? ACROSS : DOWN;
    for (let i = 0; i < text.length; i++) {
      this.letters[row + dr * i][col + dc * i] = text[i];
      this.dirs[row + dr * i][col + dc * i] |= bit;
    }
  }
}

function attempt(opts: Required<GenOptions>, rng: Rng): Board {
  const { size, wordCount, pool, mode, include } = opts;
  const grid = new Grid(size);
  const slots: Slot[] = [];
  const used = new Set<string>();

  for (let n = 0; n < pool && slots.length < wordCount; n++) {
    const word = n < include.length ? include[n] : sampleWord(mode, rng, size);
    if (word.text.length > size) continue;
    if (used.has(word.text)) continue;
    const text = word.text;

    if (slots.length === 0) {
      const dir: Dir = rng() < 0.5 ? 'across' : 'down';
      const mid = Math.floor(size / 2);
      const start = Math.floor((size - text.length) / 2);
      const [row, col] = dir === 'across' ? [mid, start] : [start, mid];
      grid.place(text, row, col, dir);
      slots.push({ word, row, col, dir });
      used.add(text);
      continue;
    }

    // 既存の文字と交差する位置だけ調べる
    let best: { row: number; col: number; dir: Dir }[] = [];
    let bestScore = 0;
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        const ch = grid.letters[r][c];
        if (!ch) continue;
        for (let i = 0; i < text.length; i++) {
          if (text[i] !== ch) continue;
          for (const dir of ['across', 'down'] as const) {
            const row = dir === 'across' ? r : r - i;
            const col = dir === 'across' ? c - i : c;
            const score = grid.fit(text, row, col, dir);
            if (score < 1 || score < bestScore) continue;
            if (score > bestScore) {
              bestScore = score;
              best = [];
            }
            if (!best.some((b) => b.row === row && b.col === col && b.dir === dir)) {
              best.push({ row, col, dir });
            }
          }
        }
      }
    }
    if (best.length === 0) continue;
    const p = best[Math.floor(rng() * best.length)];
    grid.place(text, p.row, p.col, p.dir);
    slots.push({ word, ...p });
    used.add(text);
  }
  return { size, solution: grid.letters, slots };
}

export interface GenResult {
  board: Board;
  attempts: number;
}

/** 出題語を交差させた完成形を作る。wordCount に届かなければ最も多く置けた盤面を返す */
export function generateBoard(options: GenOptions, rng: Rng): GenResult {
  const opts: Required<GenOptions> = {
    size: 10,
    wordCount: 6,
    pool: 30,
    maxAttempts: 20,
    include: [],
    ...options,
  };
  let best: Board | null = null;
  for (let i = 1; i <= opts.maxAttempts; i++) {
    const board = attempt(opts, rng);
    if (!best || board.slots.length > best.slots.length) best = board;
    if (board.slots.length >= opts.wordCount) return { board, attempts: i };
  }
  return { board: best!, attempts: opts.maxAttempts };
}
