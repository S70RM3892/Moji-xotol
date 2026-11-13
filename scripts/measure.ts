// 盤面生成器の計測: 成功率・所要時間・層の実現分布
// 使い方: npm run measure
import { generateBoard } from '../src/core/generator';
import { makePuzzle } from '../src/core/puzzle';
import { MODE_LABEL, MODE_WEIGHTS, type Mode, makeRng } from '../src/core/words';

const N = 2000;
const configs = [
  { size: 9, wordCount: 5 },
  { size: 10, wordCount: 6 },
  { size: 10, wordCount: 8 },
  { size: 11, wordCount: 8 },
];

for (const cfg of configs) {
  console.log(`\n=== ${cfg.size}x${cfg.size} / ${cfg.wordCount}語 (${N}盤面) ===`);
  for (const mode of Object.keys(MODE_WEIGHTS) as Mode[]) {
    const rng = makeRng(12345);
    let ok = 0;
    let attempts = 0;
    let letters = 0;
    let crossings = 0;
    let hand = 0;
    let len = 0;
    const tiers = [0, 0, 0];
    const t0 = performance.now();
    for (let i = 0; i < N; i++) {
      const { board, attempts: a } = generateBoard({ mode, ...cfg }, rng);
      attempts += a;
      if (board.slots.length < cfg.wordCount) continue;
      ok++;
      const cells = board.solution.flat().filter(Boolean).length;
      const total = board.slots.reduce((s, x) => s + x.word.text.length, 0);
      letters += cells;
      crossings += total - cells;
      len += total / board.slots.length;
      for (const s of board.slots) tiers[s.word.tier]++;
      hand += makePuzzle(board, 0.3, rng).hand.length;
    }
    const ms = (performance.now() - t0) / N;
    const sum = tiers[0] + tiers[1] + tiers[2];
    const dist = tiers.map((t) => `${((100 * t) / sum).toFixed(0)}%`).join('/');
    const want = MODE_WEIGHTS[mode].map((w) => `${w * 100}%`).join('/');
    console.log(
      `${MODE_LABEL[mode].padEnd(8, '　')} 成功 ${((100 * ok) / N).toFixed(1)}%  ` +
        `試行 ${(attempts / N).toFixed(2)}回  ${ms.toFixed(2)}ms/面  ` +
        `層 ${dist} (狙い ${want})  平均語長 ${(len / ok).toFixed(1)}  ` +
        `交差 ${(crossings / ok).toFixed(1)}  手札 ${(hand / ok).toFixed(1)}枚`,
    );
  }
}
