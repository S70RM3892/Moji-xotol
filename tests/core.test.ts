import { describe, expect, it } from 'vitest';
import { generateBoard } from '../src/core/generator';
import { judgeSlot, makePuzzle, slotCells } from '../src/core/puzzle';
import { MODE_WEIGHTS, type Mode, WORD_MAP, makeRng, sampleWord } from '../src/core/words';

describe('sampleWord', () => {
  it.each(Object.keys(MODE_WEIGHTS) as Mode[])('%s は狙いの層分布になる', (mode) => {
    const rng = makeRng(1);
    const counts = [0, 0, 0];
    const n = 20000;
    for (let i = 0; i < n; i++) counts[sampleWord(mode, rng).tier]++;
    counts.forEach((c, t) => expect(c / n).toBeCloseTo(MODE_WEIGHTS[mode][t], 1));
  });
});

describe('generateBoard', () => {
  it('完成形の縦横の並びは、置いた語とちょうど一致する', () => {
    const rng = makeRng(7);
    for (let n = 0; n < 200; n++) {
      const { board } = generateBoard({ mode: 'kyodai' }, rng);
      const runs: string[] = [];
      const lines = [
        ...board.solution,
        ...board.solution.map((_, c) => board.solution.map((row) => row[c])),
      ];
      for (const line of lines) {
        for (const run of line.map((ch) => ch || ' ').join('').split(/ +/)) {
          if (run.length >= 2) runs.push(run);
        }
      }
      expect(runs.sort()).toEqual(board.slots.map((s) => s.word.text).sort());
      // どの語も他の語と交差してつながっている
      if (board.slots.length > 1) {
        for (const slot of board.slots) {
          const crossed = slotCells(slot).some(([r, c]) =>
            board.slots.some((o) => o !== slot && slotCells(o).some(([r2, c2]) => r === r2 && c === c2)),
          );
          expect(crossed).toBe(true);
        }
      }
    }
  });
});

describe('makePuzzle / judgeSlot', () => {
  it('手札を正解どおりに戻すと全語が target になる', () => {
    const rng = makeRng(3);
    const { board } = generateBoard({ mode: 'kyote' }, rng);
    const puzzle = makePuzzle(board, 0.3, rng);
    const hidden = board.solution.flat().filter((ch, i) => ch && !puzzle.fixed.flat()[i]);
    expect([...puzzle.hand].sort()).toEqual(hidden.sort());
    for (const slot of board.slots) {
      expect(slotCells(slot).filter(([r, c]) => !puzzle.fixed[r][c]).length).toBeGreaterThanOrEqual(2);
      expect(judgeSlot(slot, board.solution, () => true, (w) => WORD_MAP.has(w))).toBe('target');
    }
  });

  it('未完成は open、実在語は valid、でたらめは invalid', () => {
    const rng = makeRng(5);
    const { board } = generateBoard({ mode: 'kyote' }, rng);
    const slot = board.slots[0];
    const cells = board.solution.map((row) => [...row]);
    const [r, c] = slotCells(slot)[0];
    cells[r][c] = '';
    expect(judgeSlot(slot, cells, () => true, () => false)).toBe('open');
    cells[r][c] = 'q';
    expect(judgeSlot(slot, cells, () => true, () => false)).toBe('valid');
    expect(judgeSlot(slot, cells, () => false, () => false)).toBe('invalid');
  });
});
