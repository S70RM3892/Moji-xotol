// 盤面のルール: 1文字ずつ置く。置いた文字を含む単語が縦か横にできれば成立する。
// 並び全体が単語である必要はない（ゆるい方式）。1枚で複数できれば連鎖。

export type Grid = string[][];
export type Mask = boolean[][];

export interface Found {
  text: string;
  r: number;
  c: number;
  down: boolean;
}

export interface WordSet {
  has(word: string): boolean;
}

export const emptyGrid = (n: number): Grid => Array.from({ length: n }, () => Array<string>(n).fill(''));
export const emptyMask = (n: number): Mask => Array.from({ length: n }, () => Array<boolean>(n).fill(false));

export function cellsOf(w: Found): [number, number][] {
  return [...w.text].map((_, i) => (w.down ? [w.r + i, w.c] : [w.r, w.c + i]));
}

/** fresh のマスを1つ以上含む、縦横すべての単語（2文字以上の連続部分）を返す */
export function findWords(grid: Grid, fresh: Mask, valid: WordSet): Found[] {
  const n = grid.length;
  const out: Found[] = [];
  for (let d = 0; d < 2; d++) {
    const down = d === 1;
    for (let a = 0; a < n; a++) {
      const ch = (i: number) => (down ? grid[i][a] : grid[a][i]);
      const fr = (i: number) => (down ? fresh[i][a] : fresh[a][i]);
      let s = 0;
      while (s < n) {
        if (!ch(s)) {
          s++;
          continue;
        }
        let e = s;
        while (e < n && ch(e)) e++;
        for (let i = s; i < e - 1; i++) {
          let text = ch(i);
          let hasFresh = fr(i);
          for (let j = i + 1; j < e; j++) {
            text += ch(j);
            hasFresh ||= fr(j);
            if (hasFresh && valid.has(text)) {
              out.push(down ? { text, r: i, c: a, down } : { text, r: a, c: i, down });
            }
          }
        }
        s = e;
      }
    }
  }
  return out;
}
