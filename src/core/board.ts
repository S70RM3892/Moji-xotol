// 盤面のルール: 1文字ずつ置く。置いた文字を含む単語が縦か横にできれば成立する。
// 並び全体が単語である必要はない（ゆるい方式）。1枚で複数できれば連鎖。

export type Grid = string[][];
export type Mask = boolean[][];

export interface Found {
  text: string;
  r: number;
  c: number;
  down: boolean;
  /** 逆向き（右→左、下→上）に読んだ単語 */
  mirrored?: boolean;
}

export interface WordSet {
  has(word: string): boolean;
}

export const emptyGrid = (n: number): Grid => Array.from({ length: n }, () => Array<string>(n).fill(''));
export const emptyMask = (n: number): Mask => Array.from({ length: n }, () => Array<boolean>(n).fill(false));

export function cellsOf(w: Found): [number, number][] {
  return [...w.text].map((_, i) => (w.down ? [w.r + i, w.c] : [w.r, w.c + i]));
}

/**
 * fresh のマスを1つ以上含む、縦横すべての単語（2文字以上の連続部分）を返す。
 * mirror が真なら、逆向きに読んで単語になる並びも拾う。
 */
export function findWords(grid: Grid, fresh: Mask, valid: WordSet, mirror = false): Found[] {
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
          let back = ch(i);
          let hasFresh = fr(i);
          for (let j = i + 1; j < e; j++) {
            text += ch(j);
            back = ch(j) + back;
            hasFresh ||= fr(j);
            if (!hasFresh) continue;
            const at = down ? { r: i, c: a, down } : { r: a, c: i, down };
            if (valid.has(text)) out.push({ text, ...at });
            if (mirror && back !== text && valid.has(back)) out.push({ text: back, ...at, mirrored: true });
          }
        }
        s = e;
      }
    }
  }
  return out;
}
