import { describe, expect, it } from 'vitest';
import { emptyGrid, emptyMask, findWords } from '../src/core/board';
import { DEFAULTS, Game, WILD } from '../src/core/game';
import { MODE_WEIGHTS, type Mode, WORD_MAP, makeRng, sampleWord } from '../src/core/words';

const valid = new Set(['rat', 'rate', 'ate', 'at', 'tea', 'eat', 'ox', 'or']);
const RATE = WORD_MAP.get('rate')!;

/** 盤面を空にして、お題と手札を決めて始める */
function blank(hand: string[], shown = true): Game {
  const g = new Game({ mode: 'kyote', seeds: 0, bonus2: 0, bonus3: 0, wilds: 0 }, makeRng(1), valid);
  g.tasks = [
    { word: RATE, shown, hints: 0, state: 'todo' },
    { word: WORD_MAP.get('abandon')!, shown: false, hints: 0, state: 'todo' },
  ];
  g.current = 0;
  g.hand = hand;
  g.queue = [];
  return g;
}

describe('sampleWord', () => {
  it.each(Object.keys(MODE_WEIGHTS) as Exclude<Mode, 'kyodai'>[])('%s は狙いの層分布になる', (mode) => {
    const rng = makeRng(1);
    const counts = [0, 0, 0];
    const n = 20000;
    for (let i = 0; i < n; i++) counts[sampleWord(mode, rng).tier]++;
    counts.forEach((c, t) => expect(c / n).toBeCloseTo(MODE_WEIGHTS[mode][t], 1));
  });
});

describe('findWords', () => {
  it('置いた文字を含む部分だけを、縦横とも拾う。鏡文字なら逆向きも', () => {
    const grid = emptyGrid(8);
    'rate'.split('').forEach((ch, i) => (grid[2][i] = ch));
    grid[3][3] = 'a';
    grid[4][3] = 't';
    const fresh = emptyMask(8);
    fresh[2][3] = true; // 最後に置いた e
    const read = (g: string[][], f: boolean[][], mirror: boolean) => findWords(g, f, valid, mirror).map((w) => `${w.text}${w.down ? '↓' : '→'}`).sort();
    expect(read(grid, fresh, false)).toEqual(['ate→', 'eat↓', 'rate→']);

    const back = emptyGrid(8);
    'tar'.split('').forEach((ch, i) => (back[0][i] = ch));
    const end = emptyMask(8);
    end[0][2] = true;
    expect(read(back, end, false)).toEqual([]);
    expect(read(back, end, true)).toEqual(['rat→']);
  });
});

describe('お題の並び', () => {
  it('新しい語は「見て作る」→ 別の語をはさんで →「思い出す」の順に出る', () => {
    const g = new Game({ mode: 'kyote' }, makeRng(5), valid);
    const seq = g.tasks.map((t) => `${t.word.text}:${t.shown ? '見' : '思'}`);
    const words = [...new Set(g.tasks.map((t) => t.word.text))];
    expect(words).toHaveLength(DEFAULTS.newWords);
    expect(g.tasks).toHaveLength(DEFAULTS.newWords * 2);
    for (const w of words) {
      const see = seq.indexOf(`${w}:見`);
      const recall = seq.indexOf(`${w}:思`);
      expect(see).toBeGreaterThanOrEqual(0);
      expect(recall).toBeGreaterThan(see);
    }
    // 1語目の「思い出す」は、2語目の「見て作る」のあと
    expect(seq.indexOf(`${words[0]}:思`)).toBe(2);
  });

  it('前に作れた語は、つづりなしで1回だけ出る。覚え直す語は見るところから', () => {
    const known = WORD_MAP.get('rate')!;
    const again = WORD_MAP.get('fuel')!;
    const g = new Game({ mode: 'kyote', recall: [known], relearn: [again], isNew: (w) => w !== known }, makeRng(5), valid);
    expect(g.tasks.filter((t) => t.word === known).map((t) => t.shown)).toEqual([false]);
    expect(g.tasks.filter((t) => t.word === again).map((t) => t.shown)).toEqual([true, false]);
  });

  it('最初の手札に、1語目の文字が全部入っている', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const g = new Game({ mode: 'kyodai' }, makeRng(seed), valid);
      const pool = [...g.hand];
      for (const ch of g.task!.word.text) {
        const i = pool.indexOf(ch);
        expect(i).toBeGreaterThanOrEqual(0);
        pool.splice(i, 1);
      }
    }
  });
});

describe('Game', () => {
  it('並べ終えるとお題達成。語は advance で壁から消え、次のお題の文字が届く', () => {
    const g = blank(['r', 'a', 't', 'e', 'x', 'y', 'z']);
    g.place(0, 0, 0); // r
    g.place(0, 0, 1); // a
    const three = g.place(0, 0, 2)!; // t → rat, at
    expect(three.words.map((w) => w.found.text).sort()).toEqual(['at', 'rat']);
    expect(three.task).toBeNull();
    const res = g.place(0, 0, 3)!; // e → rate, ate
    expect(res.task?.word.text).toBe('rate');
    expect(res.words.find((w) => w.found.text === 'rate')!.pts).toBe(40); // 見て作るのは1倍
    expect(g.place(0, 5, 5)).toBeNull(); // 演出が終わるまで置けない
    g.advance();
    expect(g.grid[0].slice(0, 4)).toEqual(['', '', '', '']);
    expect(g.current).toBe(1);
    expect(g.hand).toHaveLength(DEFAULTS.handSize);
    expect(g.hand).toEqual(expect.arrayContaining(['x', 'y'])); // 持ち越すのは2枚まで
    expect(g.hand).not.toContain('z');
    for (const ch of 'abandon') expect([...g.hand, ...g.queue]).toContain(ch);
  });

  it('思い出すお題は自力で3倍、ヒントを使うと1.5倍。ヒントは1文字ずつ見える', () => {
    const solo = blank(['r', 'a', 't', 'e'], false);
    expect(solo.cue(solo.task!)).toBe('r···');
    'rat'.split('').forEach((_, i) => solo.place(0, 0, i));
    expect(solo.place(0, 0, 3)!.words.find((w) => w.kind === 'mission')!.pts).toBe(120);

    const hinted = blank(['r', 'a', 't', 'e'], false);
    expect(hinted.hint()).toBe(true);
    expect(hinted.cue(hinted.task!)).toBe('ra··');
    'rat'.split('').forEach((_, i) => hinted.place(0, 0, i));
    expect(hinted.place(0, 0, 3)!.words.find((w) => w.kind === 'mission')!.pts).toBe(60);
  });

  it('待ちの文字は動かせるし、手札にも戻せる。成立した文字は動かない', () => {
    const g = blank(['a', 't', 'x']);
    g.place(0, 0, 0); // a
    g.place(1, 4, 4); // x は待ち
    expect(g.isWaiting(4, 4)).toBe(true);
    expect(g.takeBack(4, 4)).toBe(true);
    expect(g.hand).toContain('x');
    g.place(g.hand.indexOf('t'), 5, 5); // t を離れた場所に
    const res = g.move(5, 5, 0, 1)!; // a の隣へ動かす → at
    expect(res.words.map((w) => w.found.text)).toEqual(['at']);
    expect(g.grid[5][5]).toBe('');
    expect(g.move(0, 1, 6, 6)).toBeNull();
    expect(g.takeBack(0, 0)).toBe(false);
  });

  it('倍率マス・★・捨てる・下見', () => {
    const g = blank(['o', WILD, 'q']);
    g.bonus[0][1] = 3;
    g.place(0, 0, 0); // o
    expect(g.preview('x', 0, 1).total).toBe(2 * 3);
    expect(g.grid[0][1]).toBe(''); // 下見では盤面は変わらない
    expect(g.place(0, 0, 1)).toBeNull(); // ★は文字の指定が要る
    const res = g.place(0, 0, 1, 'x')!; // ox を×3マスで
    expect(res.total).toBe(6);
    expect(res.wild).toBe(true);
    expect(g.discard(0)).toBe(true);
    expect(g.hand).toEqual([]);
    expect(g.discardsLeft).toBe(DEFAULTS.discards - 1);
  });

  it('とばすと次のお題へ進み、手札は入れ替わる。精算は思い出せた数を数える', () => {
    const g = blank(['r', 'a', 't', 'e'], false);
    expect(g.skip()?.word.text).toBe('rate');
    g.advance();
    expect(g.current).toBe(1);
    expect(g.hand).not.toContain('r'.repeat(2));
    g.skip();
    g.advance();
    expect(g.over).toBe(true);
    const s = g.settle();
    expect([s.recalls, s.solo, s.allSolo]).toEqual([2, 0, 0]);
  });
});

describe('Eater（喰らうモード）', () => {
  it('どの壁でも、次の1文字はちょうど1方向にだけある（道が1本に決まる）', async () => {
    const { Eater } = await import('../src/core/eater');
    for (let seed = 1; seed <= 60; seed++) {
      const g = new Eater({ mode: seed % 2 ? 'kyote' : 'kyodai', maxLen: 7, newWords: 3 }, makeRng(seed));
      while (!g.over) {
        const word = g.task!.word.text;
        for (let i = 0; i < word.length; i++) {
          const options = [[-1, 0], [1, 0], [0, -1], [0, 1]].filter(([dr, dc]) => g.grid[g.pos[0] + dr]?.[g.pos[1] + dc] === word[i]);
          expect(options).toHaveLength(1);
          const step = g.move(options[0][0], options[0][1]);
          expect(step.kind).toBe('eat');
        }
        expect(g.task!.state).toBe('done');
        g.advance();
      }
      expect(g.settle().solo).toBe(g.tasks.filter((t) => !t.shown).length);
    }
  });

  it('違う文字には進めず、命が減る。命が尽きるとそのお題は失敗', async () => {
    const { Eater } = await import('../src/core/eater');
    const g = new Eater({ mode: 'kyote', maxLen: 6, newWords: 3, lives: 2 }, makeRng(3));
    const word = g.task!.word.text;
    const wrong = [[-1, 0], [1, 0], [0, -1], [0, 1]].find(([dr, dc]) => {
      const ch = g.grid[g.pos[0] + dr]?.[g.pos[1] + dc];
      return ch && ch !== word[0];
    })!;
    const before = [...g.pos];
    const first = g.move(wrong[0], wrong[1]);
    expect(first).toMatchObject({ kind: 'wrong', failed: false });
    expect(g.pos).toEqual(before);
    expect(g.lives).toBe(1);
    expect(g.move(wrong[0], wrong[1])).toMatchObject({ kind: 'wrong', failed: true });
    expect(g.task!.state).toBe('skipped');
    g.advance();
    expect(g.lives).toBe(2);
    expect(g.current).toBe(1);
  });

  it('ヒントは次のマスを教え、思い出すお題なら自力ではなくなる', async () => {
    const { Eater } = await import('../src/core/eater');
    const g = new Eater({ mode: 'kyote', maxLen: 6, newWords: 3 }, makeRng(8));
    g.tasks[0].shown = false;
    const cell = g.hint()!;
    expect(g.grid[cell[0]][cell[1]]).toBe(g.task!.word.text[0]);
    expect(g.task!.hints).toBe(1);
  });
});

describe('語の難しさ', () => {
  it('中学初級（A1）はお題に出ない。京大重点では共テ水準の語が出ない', () => {
    const rng = makeRng(2);
    for (let i = 0; i < 5000; i++) {
      expect(sampleWord('kyote', rng).cefr).not.toBe('A1');
      expect(['B2', 'C1', 'C2', 'KU']).toContain(sampleWord('kyodai', rng).cefr);
    }
  });

  it('京大重点は、過去問に出た語を優先して出す（語数では2割強だが、出題では8割前後）', () => {
    const rng = makeRng(3);
    let seen = 0;
    const n = 20000;
    for (let i = 0; i < n; i++) if (sampleWord('kyodai', rng).years.length) seen++;
    expect(seen / n).toBeGreaterThan(0.7);
    expect(seen / n).toBeLessThan(0.95);
    // 語彙リストにない過去問の語も出る
    expect(WORD_MAP.get('subsequent')?.cefr).toBe('KU');
    expect(WORD_MAP.get('subsequent')!.years.length).toBeGreaterThanOrEqual(2);
  });

  it('文字数の範囲を守る', () => {
    const rng = makeRng(2);
    for (let i = 0; i < 2000; i++) {
      const n = sampleWord('nankan', rng, 8, 6).text.length;
      expect(n).toBeGreaterThanOrEqual(6);
      expect(n).toBeLessThanOrEqual(8);
    }
    const g = new Game({ mode: 'kyodai', minLen: 6, maxLen: 8 }, makeRng(4), valid);
    for (const t of g.tasks) expect(t.word.text.length).toBeGreaterThanOrEqual(6);
  });

  it('「もう知ってる」で語を替えると、見るお題も思い出すお題も新しい語になる', async () => {
    const g = new Game({ mode: 'kyote' }, makeRng(5), valid);
    const old = g.task!.word;
    const next = WORD_MAP.get('scrutiny')!;
    g.place(0, 4, 4); // 置きかけの文字
    g.swap(next);
    expect(g.tasks.filter((t) => t.word === old)).toHaveLength(0);
    expect(g.tasks.filter((t) => t.word === next).map((t) => t.shown)).toEqual([true, false]);
    expect(g.waiting).toHaveLength(0);
    for (const ch of new Set('scrutiny')) expect([...g.hand, ...g.queue]).toContain(ch);

    const { Eater } = await import('../src/core/eater');
    const e = new Eater({ mode: 'kyote', maxLen: 10, newWords: 3 }, makeRng(5));
    e.swap(next);
    expect(e.task!.word).toBe(next);
    expect(e.path.map(([r, c]) => e.grid[r][c]).join('')).toBe('scrutiny');
  });
});
