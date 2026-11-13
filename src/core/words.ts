import raw from '../data/words.json';

export type Tier = 0 | 1 | 2; // 0=共テ 1=難関2次 2=京大
export type Mode = 'kyote' | 'nankan' | 'kyodai';

export interface Word {
  text: string;
  tier: Tier;
  cefr: string;
  gloss: string;
}

export const TIER_LABEL = ['共テ', '難関2次', '京大'] as const;
export const MODE_LABEL: Record<Mode, string> = {
  kyote: '共テ重点',
  nankan: '難関2次重点',
  kyodai: '京大重点',
};

/** モードごとの層の出題確率 [共テ, 難関2次, 京大] */
export const MODE_WEIGHTS: Record<Mode, [number, number, number]> = {
  kyote: [0.7, 0.2, 0.1],
  nankan: [0.2, 0.6, 0.2],
  kyodai: [0.1, 0.3, 0.6],
};

/** 層の中での出やすさ。易しすぎる語と稀すぎる語を下げる */
const CEFR_WEIGHT: Record<string, number> = { A1: 0.3, A2: 1, B1: 1.5, B2: 1, C1: 1, C2: 0.3 };

export const WORDS: Word[] = (raw as [string, Tier, string, string][]).map(
  ([text, tier, cefr, gloss]) => ({ text, tier, cefr, gloss }),
);
export const WORD_MAP = new Map(WORDS.map((w) => [w.text, w]));

export type Rng = () => number;

/** 再現可能な乱数 (mulberry32) */
export function makeRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface TierTable {
  words: Word[];
  cum: number[]; // 累積重み
}
const TABLES: TierTable[] = [0, 1, 2].map((tier) => {
  const words = WORDS.filter((w) => w.tier === tier);
  let sum = 0;
  const cum = words.map((w) => (sum += CEFR_WEIGHT[w.cefr] ?? 1));
  return { words, cum };
});

function pickFrom(table: TierTable, rng: Rng): Word {
  const x = rng() * table.cum[table.cum.length - 1];
  let lo = 0;
  let hi = table.cum.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (table.cum[mid] > x) hi = mid;
    else lo = mid + 1;
  }
  return table.words[lo];
}

/** まず層をモードの確率で選び、次に層内で1語選ぶ。層の語数に確率が左右されない */
export function sampleWord(mode: Mode, rng: Rng, maxLen = 10): Word {
  const [a, b] = MODE_WEIGHTS[mode];
  for (;;) {
    const x = rng();
    const tier = x < a ? 0 : x < a + b ? 1 : 2;
    const w = pickFrom(TABLES[tier], rng);
    if (w.text.length <= maxLen) return w;
  }
}
