// 置ける手の探索。ヒント・手詰まり判定・シミュレーション用の自動プレイに使う。
import { type Found, type Grid, type WordSet, emptyMask, findWords } from './board';

export interface Lexicon {
  valid: Set<string>;
  list: string[];
  masks: Int32Array; // 単語が含む文字の集合（26ビット）
}

const bit = (ch: string) => 1 << (ch.charCodeAt(0) - 97);
const maskOf = (s: string) => [...s].reduce((m, ch) => m | bit(ch), 0);

export function makeLexicon(words: Iterable<string>): Lexicon {
  const list = [...new Set(words)];
  return { valid: new Set(list), list, masks: Int32Array.from(list, maskOf) };
}

export interface Move {
  tiles: { r: number; c: number; ch: string }[];
  words: Found[];
  score: number;
}

/**
 * 手札から1〜maxTiles枚を1列に置いて単語を作る手のうち、最高点のものを返す。
 * lex は探す語彙、valid は成立判定に使う語彙（lex より広くてよい）。
 * 1枚だけ置く手もここに含まれる（その1枚を含む単語が必ず列挙される）。
 */
export function bestMove(
  grid: Grid,
  hand: string[],
  lex: Lexicon,
  valid: WordSet,
  score: (words: Found[], grid: Grid, tiles: Move['tiles']) => number,
  maxTiles = hand.length,
): Move | null {
  const n = grid.length;
  const handCount = new Int8Array(26);
  let handMask = 0;
  for (const ch of hand) {
    handCount[ch.charCodeAt(0) - 97]++;
    handMask |= bit(ch);
  }
  let boardEmpty = true;
  for (const row of grid) for (const ch of row) if (ch) boardEmpty = false;

  let best: Move | null = null;
  const used = new Int8Array(26);
  const fresh = emptyMask(n);

  for (let d = 0; d < 2; d++) {
    const down = d === 1;
    for (let a = 0; a < n; a++) {
      const at = (i: number) => (down ? grid[i][a] : grid[a][i]);
      // 隣の列に文字があるか（置いた文字が既存の文字とつながるか）
      const side = (i: number) => {
        const [r, c] = down ? [i, a] : [a, i];
        const [dr, dc] = down ? [0, 1] : [1, 0];
        return !!(grid[r - dr]?.[c - dc] || grid[r + dr]?.[c + dc]);
      };
      let lineMask = 0;
      let lineHas = false;
      for (let i = 0; i < n; i++) {
        if (at(i)) {
          lineMask |= bit(at(i));
          lineHas = true;
        }
      }
      let lineTouches = lineHas;
      for (let i = 0; i < n && !lineTouches; i++) lineTouches = side(i);
      if (!lineTouches && !boardEmpty) continue;
      if (boardEmpty && (a !== n >> 1 || down)) continue; // 最初の1語は中央の横だけ調べる
      const allow = lineMask | handMask;

      for (let w = 0; w < lex.list.length; w++) {
        if (lex.masks[w] & ~allow) continue;
        const text = lex.list[w];
        const len = text.length;
        if (len > n) continue;
        for (let off = 0; off + len <= n; off++) {
          used.fill(0);
          let placed = 0;
          let touches = boardEmpty;
          let ok = true;
          for (let i = 0; i < len; i++) {
            const cur = at(off + i);
            if (cur) {
              if (cur !== text[i]) {
                ok = false;
                break;
              }
              touches = true;
            } else {
              const k = text.charCodeAt(i) - 97;
              if (++used[k] > handCount[k] || ++placed > maxTiles) {
                ok = false;
                break;
              }
              touches ||= side(off + i);
            }
          }
          if (!ok || placed === 0 || !touches) continue;

          const tiles: Move['tiles'] = [];
          for (let i = 0; i < len; i++) {
            if (at(off + i)) continue;
            const [r, c] = down ? [off + i, a] : [a, off + i];
            tiles.push({ r, c, ch: text[i] });
          }
          for (const t of tiles) {
            grid[t.r][t.c] = t.ch;
            fresh[t.r][t.c] = true;
          }
          const words = findWords(grid, fresh, valid);
          const s = score(words, grid, tiles);
          for (const t of tiles) {
            grid[t.r][t.c] = '';
            fresh[t.r][t.c] = false;
          }
          if (!best || s > best.score || (s === best.score && tiles.length < best.tiles.length)) {
            best = { tiles, words, score: s };
          }
        }
      }
    }
  }
  return best;
}
