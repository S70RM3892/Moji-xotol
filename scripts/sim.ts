// ルール検証: 自動プレイで「待ち」ルールの手応えを測る（お題の達成率・待ちの成功率・連鎖・得点）
// 使い方: npx tsx scripts/sim.ts [ゲーム数]
import { readFileSync } from 'node:fs';
import { DEFAULTS, Game, type GameOptions, WILD, scoreWord } from '../src/core/game';
import { bestMove, makeLexicon } from '../src/core/solver';
import { type Mode, makeRng } from '../src/core/words';

const lex = makeLexicon(
  readFileSync(new URL('../public/valid.txt', import.meta.url), 'utf8')
    .split('\n')
    .map((l) => l.split('\t')[0])
    .filter(Boolean),
);

interface Cfg extends Partial<GameOptions> {
  name: string;
  /** お題のつづりを思い出せる確率 */
  know: number;
}

function run(cfg: Cfg, mode: Mode, games: number) {
  const rng = makeRng(2024);
  const sum = { missions: 0, known: 0, dead: 0, score: 0, chain: 0, moves: 0, bets: 0, hit: 0, big: 0, left: 0, discards: 0 };
  const scores: number[] = [];
  for (let g = 0; g < games; g++) {
    const game = new Game({ mode, ...cfg }, rng, lex.valid);
    const n = game.size;
    const known = game.missions.map(() => rng() < cfg.know);
    sum.known += known.filter(Boolean).length;

    // 知っているお題ごとに、置く行と開始列を決めておく（種と矛盾しない場所）
    const reserved = new Map<string, number>(); // "r,c" -> お題番号
    const plan = new Map<number, { r: number; c: number }>();
    game.missions.forEach((m, i) => {
      if (!known[i]) return;
      const text = m.word.text;
      let best: { r: number; c: number; match: number } | null = null;
      for (let r = 0; r < n; r++) {
        for (let c = 0; c + text.length <= n; c++) {
          let match = 0;
          let ok = true;
          for (let k = 0; k < text.length && ok; k++) {
            const cur = game.grid[r][c + k];
            if (reserved.has(`${r},${c + k}`) || (cur && cur !== text[k])) ok = false;
            else if (cur) match++;
          }
          // 同じ行に別のお題が隣り合うと誤って長い並びになるので避ける
          if (ok && (reserved.has(`${r},${c - 1}`) || reserved.has(`${r},${c + text.length}`))) ok = false;
          if (ok && (!best || match > best.match)) best = { r, c, match };
        }
      }
      if (!best) return;
      plan.set(i, best);
      for (let k = 0; k < text.length; k++) reserved.set(`${best.r},${best.c + k}`, i);
    });

    const betCells = new Set<string>();
    const track = (res: NonNullable<ReturnType<Game['place']>>) => {
      sum.moves++;
      if (res.chain === 0) {
        sum.bets++;
        betCells.add(`${res.r},${res.c}`);
      }
      if (res.chain >= 3) sum.big++;
      for (const [r, c] of res.lit) if (betCells.delete(`${r},${c}`)) sum.hit++;
    };
    const count = (xs: string[]) => {
      const m = new Map<string, number>();
      for (const x of xs) m.set(x, (m.get(x) ?? 0) + 1);
      return m;
    };
    while (!game.over) {
      // 1) 知っているお題のうち、足りない文字がまだ袋に残っているものに置く
      const pool = count([...game.hand, ...game.queue]);
      const wildsLeft = pool.get(WILD) ?? 0;
      let best: { h: number; r: number; c: number; as?: string; missing: number; bonus: number } | null = null;
      for (const [i, p] of plan) {
        if (game.missions[i].done) continue;
        const text = game.missions[i].word.text;
        const empty: number[] = [];
        for (let k = 0; k < text.length; k++) if (!game.grid[p.r][p.c + k]) empty.push(k);
        // 袋と手札で足りるか（足りない分は★で埋める）
        const need = count(empty.map((k) => text[k]));
        let short = 0;
        for (const [ch, k] of need) short += Math.max(0, k - (pool.get(ch) ?? 0));
        if (short > wildsLeft) continue;
        for (const k of empty) {
          let h = game.hand.indexOf(text[k]);
          let as: string | undefined;
          if (h < 0 && empty.length === 1 && game.hand.includes(WILD)) {
            h = game.hand.indexOf(WILD); // 最後の1枚だけ★を使う
            as = text[k];
          }
          if (h < 0) continue;
          const cand = { h, r: p.r, c: p.c + k, as, missing: empty.length, bonus: game.bonus[p.r][p.c + k] };
          // 完成に近いお題を優先。倍率マスは最後に回す
          if (!best || cand.missing < best.missing || (cand.missing === best.missing && cand.bonus < best.bonus)) best = cand;
        }
      }
      if (best) {
        track(game.place(best.h, best.r, best.c, best.as)!);
        continue;
      }
      // 2) 残りの文字で、予約していない場所に単語を作る
      const letters = game.hand.filter((ch) => ch !== WILD);
      const mv = bestMove(
        game.grid,
        letters,
        lex,
        lex.valid,
        (words, _g, tiles) =>
          reserved.has(`${tiles[0].r},${tiles[0].c}`) ? -1 : words.reduce((s, w) => s + scoreWord(w.text).pts, 0) * words.length,
        1,
      );
      if (mv && mv.score > 0) {
        const t = mv.tiles[0];
        track(game.place(game.hand.indexOf(t.ch), t.r, t.c)!);
        continue;
      }
      // 3) 置き場がなければ捨てる。捨てられなければ空きに置く（待ちになる）
      const junk = game.hand.findIndex((ch) => ch !== WILD);
      if (junk < 0) break;
      if (game.fixesLeft > 0) {
        game.discard(junk);
        sum.discards++;
        continue;
      }
      let spot: [number, number] | null = null;
      for (let r = n - 1; r >= 0 && !spot; r--) {
        for (let c = n - 1; c >= 0 && !spot; c--) if (!game.grid[r][c] && !reserved.has(`${r},${c}`)) spot = [r, c];
      }
      if (!spot) break;
      track(game.place(junk, spot[0], spot[1])!);
    }
    const s = game.settle();
    sum.missions += game.missions.filter((m) => m.done).length;
    sum.dead += s.dead;
    sum.score += s.total;
    sum.chain += game.maxChain;
    sum.left += game.hand.length + game.queue.length;
    scores.push(s.total);
  }
  scores.sort((a, b) => a - b);
  const q = (p: number) => scores[Math.floor(p * (scores.length - 1))];
  const M = cfg.missions ?? DEFAULTS.missions;
  console.log(
    `${cfg.name.padEnd(22, '　')} お題 ${(sum.missions / games).toFixed(2)}/${M}(既知${(sum.known / games).toFixed(1)})  ` +
      `手数 ${(sum.moves / games).toFixed(0)}  待ち ${(sum.bets / games).toFixed(1)}→成立 ${((100 * sum.hit) / sum.bets).toFixed(0)}%  ` +
      `死に札 ${(sum.dead / games).toFixed(1)}  3連鎖+ ${(sum.big / games).toFixed(1)}回  最大連鎖 ${(sum.chain / games).toFixed(1)}  ` +
      `得点 中央${q(0.5)} (下位25% ${q(0.25)} / 上位25% ${q(0.75)} / 最高 ${q(1)})`,
  );
}

const games = Number(process.argv[2]) || 200;
const cfgs: Cfg[] = [
  { name: 'やさしい / 全部知ってる', know: 1, shortage: 0, wilds: 3, maxMissionLen: 5 },
  { name: 'ふつう / 全部知ってる', know: 1, shortage: 4, wilds: 2, maxMissionLen: 6 },
  { name: 'ふつう / 6割知ってる', know: 0.6, shortage: 4, wilds: 2, maxMissionLen: 6 },
  { name: 'むずかしい / 全部知ってる', know: 1, shortage: 9, wilds: 1, maxMissionLen: 7 },
];
console.log(`判定語彙 ${lex.list.length}語`);
for (const mode of (process.argv[3] ? [process.argv[3]] : ['kyote', 'kyodai']) as Mode[]) {
  console.log(`\n== ${mode} (${games}局) ==`);
  for (const cfg of cfgs) run(cfg, mode, games);
}
