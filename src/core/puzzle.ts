import type { Board, Slot } from './generator';
import type { Rng } from './words';

export interface Puzzle {
  board: Board;
  /** 最初から見えているマス */
  fixed: boolean[][];
  /** 手札（伏せたマスの文字をシャッフルしたもの） */
  hand: string[];
}

export function slotCells(slot: Slot): [number, number][] {
  return [...slot.word.text].map((_, i) =>
    slot.dir === 'across' ? [slot.row, slot.col + i] : [slot.row + i, slot.col],
  );
}

function shuffle<T>(items: T[], rng: Rng): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

/**
 * 完成形から文字を抜いて問題にする。
 * reveal = 見せるマスの割合。どの語も最低2マス（短い語は半分）は伏せる。
 */
export function makePuzzle(board: Board, reveal: number, rng: Rng): Puzzle {
  const fixed = board.solution.map((row) => row.map((ch) => ch !== '' && rng() < reveal));
  for (const slot of board.slots) {
    const cells = slotCells(slot);
    const need = Math.min(2, Math.ceil(cells.length / 2));
    const shown = shuffle(cells.filter(([r, c]) => fixed[r][c]), rng);
    let hidden = cells.length - shown.length;
    while (hidden < need && shown.length) {
      const [r, c] = shown.pop()!;
      fixed[r][c] = false;
      hidden++;
    }
  }
  const hand: string[] = [];
  board.solution.forEach((row, r) =>
    row.forEach((ch, c) => {
      if (ch && !fixed[r][c]) hand.push(ch);
    }),
  );
  return { board, fixed, hand: shuffle(hand, rng) };
}

export type SlotState = 'open' | 'target' | 'valid' | 'invalid';

/**
 * 語の判定（ゆるい方式）: 埋まった並びが判定辞書にあれば成立。
 * 出題辞書の語なら target、それ以外の実在語なら valid（別解）。
 */
export function judgeSlot(
  slot: Slot,
  cells: string[][],
  isValid: (w: string) => boolean,
  isTarget: (w: string) => boolean,
): SlotState {
  const text = slotCells(slot)
    .map(([r, c]) => cells[r][c])
    .join('');
  if (text.length < slot.word.text.length) return 'open';
  if (isTarget(text)) return 'target';
  return isValid(text) ? 'valid' : 'invalid';
}
