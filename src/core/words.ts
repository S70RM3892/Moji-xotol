import raw from '../data/words.json';

export type Tier = 0 | 1 | 2; // 0=共テ 1=難関2次 2=京大
export type Mode = 'kyote' | 'nankan' | 'kyodai';

export interface Word {
  text: string;
  tier: Tier;
  /** CEFR のレベル。KU は語彙リストにないが京大の過去問に出た語 */
  cefr: string;
  gloss: string;
  /** 京大重点での出やすさ: 過去問20年分から見積もった「次に出る見込み × まだ知らない見込み」 */
  value: number;
  /** 京大の過去問(2005-2024)に出た年度（下2桁） */
  years: number[];
}

export const TIER_LABEL = ['共テ', '難関2次', '京大'] as const;
export const MODE_LABEL: Record<Mode, string> = {
  kyote: '共テ重点',
  nankan: '難関2次重点',
  kyodai: '京大重点',
};

/**
 * 共テ重点・難関2次重点での、層の出題確率 [共テ, 難関2次, 京大]。
 * 京大重点は層では決めず、過去問の分析から付けた語ごとの「覚える価値」で選ぶ（sampleWord を参照）。
 */
export const MODE_WEIGHTS: Record<Exclude<Mode, 'kyodai'>, [number, number, number]> = {
  kyote: [0.6, 0.3, 0.1],
  nankan: [0.1, 0.65, 0.25],
};

/** 層の中での出やすさ。易しすぎる語と稀すぎる語を下げる */
// A1（中学初級）はお題にしない。A2 もほとんど出さない
const CEFR_WEIGHT: Record<string, number> = { A1: 0, A2: 0.2, B1: 1.5, B2: 1, C1: 1, C2: 0.6 };

export const WORDS: Word[] = (raw as [string, Tier, string, string, number, number[]][]).map(
  ([text, tier, cefr, gloss, value, years]) => ({ text, tier, cefr, gloss, value, years }),
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

interface Table {
  words: Word[];
  cum: number[]; // 累積重み
}
function table(words: Word[], weight: (w: Word) => number): Table {
  let sum = 0;
  return { words, cum: words.map((w) => (sum += weight(w))) };
}
const TABLES: Table[] = [0, 1, 2].map((tier) =>
  table(
    WORDS.filter((w) => w.tier === tier),
    (w) => CEFR_WEIGHT[w.cefr] ?? 1,
  ),
);
/**
 * 京大重点: B2以上と、過去問に出た表外の語。
 * 重みは覚える価値の2乗。価値に比例させると、1語ずつの見込みは低いが数の多い「まだ出ていない語」に
 * 出題の半分が流れてしまう。限られた時間で覚えるなら見込みの高い語から、なので上位に寄せる
 */
const KYODAI = table(
  WORDS.filter((w) => w.value > 0),
  (w) => (w.value / 1e4) ** 2,
);

function pickFrom(table: Table, rng: Rng): Word {
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

/**
 * お題にする語を1つ選ぶ。
 * 共テ重点・難関2次重点: まず層をモードの確率で選び、次に層内で1語選ぶ（層の語数に確率が左右されない）。
 * 京大重点: 過去問から見積もった覚える価値に比例して選ぶ。
 */
export function sampleWord(mode: Mode, rng: Rng, maxLen = 10, minLen = 4): Word {
  for (;;) {
    let w: Word;
    if (mode === 'kyodai') w = pickFrom(KYODAI, rng);
    else {
      const [a, b] = MODE_WEIGHTS[mode];
      const x = rng();
      w = pickFrom(TABLES[x < a ? 0 : x < a + b ? 1 : 2], rng);
    }
    if (w.text.length <= maxLen && w.text.length >= minLen) return w;
  }
}
