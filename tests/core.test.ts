import { describe, expect, it } from 'vitest';
import { emptyGrid, emptyMask, findWords } from '../src/core/board';
import { DEFAULTS, Game, WILD } from '../src/core/game';
import { bestMove, makeLexicon } from '../src/core/solver';
import { MODE_WEIGHTS, type Mode, WORD_MAP, makeRng, sampleWord } from '../src/core/words';

const lex = makeLexicon(['rat', 'rate', 'ate', 'at', 'tea', 'eat', 'export', 'port', 'or', 'ox']);

/** 盤面を空にして、決まった手札で始める */
function blank(hand: string[], queue: string[] = []): Game {
  const g = new Game({ mode: 'kyote', seeds: 0, bonus2: 0, bonus3: 0, wilds: 0 }, makeRng(1), lex.valid);
  g.hand = hand;
  g.queue = queue;
  return g;
}

describe('sampleWord', () => {
  it.each(Object.keys(MODE_WEIGHTS) as Mode[])('%s は狙いの層分布になる', (mode) => {
    const rng = makeRng(1);
    const counts = [0, 0, 0];
    const n = 20000;
    for (let i = 0; i < n; i++) counts[sampleWord(mode, rng).tier]++;
    counts.forEach((c, t) => expect(c / n).toBeCloseTo(MODE_WEIGHTS[mode][t], 1));
  });
});

describe('findWords', () => {
  it('置いた文字を含む部分だけを、縦横とも拾う', () => {
    const grid = emptyGrid(8);
    'rate'.split('').forEach((ch, i) => (grid[2][i] = ch));
    grid[3][3] = 'a';
    grid[4][3] = 't';
    const fresh = emptyMask(8);
    fresh[2][3] = true; // 最後に置いた e
    const words = findWords(grid, fresh, lex.valid).map((w) => `${w.text}${w.down ? '↓' : '→'}`);
    expect(words.sort()).toEqual(['ate→', 'eat↓', 'rate→']);
  });
});

describe('Game', () => {
  it('単語にならない1枚は待ちになり、あとの1枚で生き返って連鎖になる', () => {
    const g = blank(['r', 'a', 'e', 't']);
    expect(g.place(0, 0, 0)!.chain).toBe(0); // r
    expect(g.place(0, 0, 1)!.chain).toBe(0); // a
    expect(g.place(0, 0, 3)!.chain).toBe(0); // e を1マス空けて置く
    expect(g.waiting).toHaveLength(3);
    const res = g.place(0, 0, 2)!; // 真ん中に t
    expect(res.words.map((w) => w.found.text).sort()).toEqual(['at', 'ate', 'rat', 'rate']);
    expect(res.chain).toBe(4);
    expect(res.total).toBe((2 + 3 + 3 + 40) * 4); // rate は共テ語 10×4、ほかは文字数
    expect(g.waiting).toHaveLength(0);
  });

  it('お題は3倍、つづりを見たお題は通常の点になる', () => {
    const play = (reveal: boolean) => {
      const g = blank(['r', 'a', 't', 'e']);
      g.missions[0] = { word: WORD_MAP.get('rate')!, done: false, revealed: false };
      if (reveal) g.reveal(0);
      'rat'.split('').forEach((_, i) => g.place(0, 0, i));
      const res = g.place(0, 0, 3)!;
      expect(res.cleared.map((w) => w.text)).toEqual(['rate']);
      return res.words.find((w) => w.found.text === 'rate')!.pts;
    };
    expect(play(false)).toBe(120);
    expect(play(true)).toBe(40);
  });

  it('倍率マス・★・手数・減点', () => {
    const g = blank(['o', WILD, 'q'], []);
    g.bonus[0][1] = 3;
    g.turnsLeft = 3;
    g.place(0, 0, 0); // o
    expect(g.place(0, 0, 1)).toBeNull(); // ★は文字の指定が要る
    const res = g.place(0, 0, 1, 'x')!; // ox を×3マスで
    expect(res.total).toBe(2 * 3);
    expect(g.wild[0][1]).toBe(true);
    g.place(0, 5, 5); // q は待ちのまま
    expect(g.over).toBe(true);
    const s = g.settle();
    expect(s.dead).toBe(1);
    expect(s.total).toBe(Math.max(0, 6 - DEFAULTS.deadPenalty));
  });

  it('1手もどすと盤面・手札・得点が元に戻る', () => {
    const g = blank(['a', 't'], ['e']);
    g.place(0, 0, 0);
    g.place(0, 0, 1); // at
    expect(g.score).toBe(2);
    expect(g.undo()).toBe(true);
    expect(g.score).toBe(0);
    expect(g.hand).toEqual(['t', 'e']); // a を置いたときに e を引いている
    expect(g.grid[0][1]).toBe('');
    expect(g.undo()).toBe(false); // もどせるのは1手だけ
  });

  it('手直し: 待ちの文字は拾って置き直せる。成立した文字は拾えない', () => {
    const g = blank(['x', 'a', 't'], []);
    g.place(0, 4, 4); // x は待ち
    expect(g.pickUp(4, 4)).toBe(true);
    expect(g.hand).toContain('x');
    expect(g.grid[4][4]).toBe('');
    expect(g.fixesLeft).toBe(DEFAULTS.fixes - 1);
    g.place(g.hand.indexOf('a'), 0, 0);
    g.place(g.hand.indexOf('t'), 0, 1); // at が成立
    expect(g.pickUp(0, 0)).toBe(false);
  });

  it('鏡文字: 逆向きに読んだ単語も成立する', () => {
    const play = (mirror: boolean) => {
      const g = new Game({ mode: 'kyote', seeds: 0, bonus2: 0, bonus3: 0, wilds: 0, mirror }, makeRng(1), lex.valid);
      g.hand = ['t', 'a', 'r'];
      g.place(0, 0, 0); // t
      g.place(0, 0, 1); // a
      return g.place(0, 0, 2)!.words.map((w) => w.found.text).sort(); // 並びは t a r
    };
    expect(play(false)).toEqual([]);
    expect(play(true)).toEqual(['rat']);
  });

  it('届かなかったお題について、来なかった文字を返す', () => {
    const g = blank(['p', 'o', 'r'], []);
    g.seen = [];
    expect(g.shortfall('port')).toEqual(['p', 'o', 'r', 't']);
    g.seen = ['p', 'o', 'r', WILD];
    expect(g.shortfall('port')).toEqual([]); // t は★で埋まる
    g.seen = ['p', 'o', 'r'];
    expect(g.shortfall('port')).toEqual(['t']);
  });

  it('袋はお題の文字をすべて含む', () => {
    const g = new Game({ mode: 'kyodai' }, makeRng(9), lex.valid);
    const pool = [...g.hand, ...g.queue];
    for (const m of g.missions) {
      for (const ch of m.word.text) {
        const i = pool.indexOf(ch);
        expect(i).toBeGreaterThanOrEqual(0);
        pool.splice(i, 1);
      }
    }
  });
});

describe('bestMove', () => {
  it('手札1枚で作れる最高点の手を返す', () => {
    const grid = emptyGrid(8);
    'rat'.split('').forEach((ch, i) => (grid[2][i + 1] = ch));
    const mv = bestMove(grid, ['e', 'x'], lex, lex.valid, (ws) => ws.length, 1)!;
    expect(mv.tiles).toEqual([{ r: 2, c: 4, ch: 'e' }]);
    expect(mv.words.map((w) => w.text).sort()).toEqual(['ate', 'rate']);
  });
});
