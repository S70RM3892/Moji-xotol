// 局をまたいで続く要素: 称号・護符（持ち込む道具）・碑文（見つける技）
import type { Game, GameOptions, Placement } from './core/game';
import { SIGN } from './glyphs';

/** そのレベルに上がるのに必要な累計点: Lv2=1000, Lv3=3000, Lv4=6000 … */
export const levelStart = (lv: number) => 500 * lv * (lv - 1);
export function levelOf(xp: number): number {
  let lv = 1;
  while (levelStart(lv + 1) <= xp) lv++;
  return lv;
}

const TITLES: [number, string][] = [
  [1, '書記見習い'],
  [3, '書記'],
  [5, '神殿の書記'],
  [8, '神官'],
  [12, '大神官'],
  [16, '宰相'],
  [20, 'ファラオの筆'],
];
export const titleOf = (lv: number) => TITLES.filter(([need]) => lv >= need).pop()![1];

// --- 護符: 1局に2つまで持ち込める。レベルで増える ---
export interface Amulet {
  id: string;
  name: string;
  sign: string; // 一覧に出すヒエログリフ
  level: number;
  text: string;
  apply: (o: Required<Pick<GameOptions, 'wilds' | 'fixes' | 'shortage' | 'bonus3' | 'handSize' | 'deadPenalty' | 'mirror'>>) => void;
  /** NEXT に見える枚数 */
  next?: number;
}
export const MAX_AMULETS = 2;
export const AMULETS: Amulet[] = [
  { id: 'scarab', name: 'スカラベ', sign: SIGN.scarab, level: 1, text: '星の札が2枚増える。', apply: (o) => (o.wilds += 2) },
  { id: 'eye', name: 'ホルスの目', sign: SIGN.eye, level: 1, text: 'NEXT が5枚先まで見える。', apply: () => {}, next: 5 },
  { id: 'palette', name: '書記のパレット', sign: SIGN.palette, level: 2, text: '手直しが3回増える。', apply: (o) => (o.fixes += 3) },
  { id: 'ankh', name: 'アンク', sign: SIGN.ankh, level: 3, text: '待ちのまま終わっても減点されない。', apply: (o) => (o.deadPenalty = 0) },
  { id: 'nile', name: 'ナイルの恵み', sign: SIGN.water, level: 4, text: '袋の文字が4枚多く届く。', apply: (o) => (o.shortage = Math.max(0, o.shortage - 4)) },
  { id: 'mirror', name: '鏡文字', sign: SIGN.eye2, level: 5, text: '右から左、下から上に読んでも単語として成立する。', apply: (o) => (o.mirror = true) },
  { id: 'lapis', name: '黄金の床', sign: SIGN.sun, level: 6, text: '×3マスが3つ増える。', apply: (o) => (o.bonus3 += 3) },
  { id: 'hand', name: '大きな手', sign: SIGN.arm, level: 7, text: '手札が1枚増える。', apply: (o) => (o.handSize += 1) },
];

// --- 碑文: 条件は伏せてあり、ヒントだけが読める。達成すると名前と中身が現れる ---
export interface Inscription {
  id: string;
  name: string;
  hint: string; // 未達成のときに見える謎かけ
  text: string; // 達成後に見える説明
}
export const INSCRIPTIONS: Inscription[] = [
  { id: 'first', name: 'はじめの一画', hint: '最初の一歩。', text: '初めて単語を作った。' },
  { id: 'chain3', name: '三連の鎖', hint: '1枚で、いくつ読める？', text: '1枚で3つの単語を同時に作った。' },
  { id: 'chain5', name: '五連の鎖', hint: '短い単語は長い単語の中に住んでいる。', text: '1枚で5つの単語を同時に作った。' },
  { id: 'chain8', name: '八連の鎖', hint: '倍率の天井まで。', text: '1枚で8つ以上の単語を同時に作った。' },
  { id: 'between', name: '要石', hint: '最後に置く石は、端とは限らない。', text: '両隣が埋まったすき間に置いて4連鎖以上。真ん中の文字ほど多くの単語に含まれる。' },
  { id: 'cross', name: '十字', hint: '縦と横は同時に読める。', text: '1枚で縦と横の両方に単語を作った。' },
  { id: 'shared', name: '相乗り', hint: '1文字を2つのお題が使ってもいい。', text: '先に達成したお題と文字を共有して、別のお題を達成した。札が1枚浮く。' },
  { id: 'revive', name: '蘇り', hint: '眠っていた石が一斉に目を覚ます。', text: '1枚で待ちの文字を4枚以上まとめて成立させた。' },
  { id: 'ruby', name: '黄金の仕上げ', hint: '金のマスは最後の1枚のためにある。', text: '×3マスに置いてお題を達成した。' },
  { id: 'star', name: '星の一筆', hint: '来なかった文字は、星が埋める。', text: '★でお題を達成した。' },
  { id: 'kilo', name: '千の一手', hint: '1手に千点。', text: '1手で1000点以上を取った。' },
  { id: 'long', name: '長い言葉', hint: '盤の端から端まで。', text: '8文字の単語を作った。' },
  { id: 'all', name: '六つの碑', hint: 'お題をひとつも残さない。', text: '1局でお題を6語すべて達成した。' },
  { id: 'clean', name: '無欠', hint: '眠ったままの石を残さない。', text: '20枚以上置いて、待ちゼロで終局した。' },
  { id: 'bare', name: '素手の書記', hint: '護符に頼らず、高みへ。', text: '護符なしで評価Sを取った。' },
  { id: 'kyodai', name: '京の門', hint: 'いちばん難しい層の言葉を、自力で。', text: '京大層のお題をつづりを見ずに達成した。' },
  { id: 'mirror', name: '鏡の言葉', hint: '逆さに読める護符がある。', text: '逆向きに読んで単語を作った。' },
  { id: 'again', name: '磨き直し', hint: '同じ盤に、もう一度向き合う。', text: '同じ盤をやり直して自己ベストを更新した。' },
  { id: 'zukan100', name: '語り部', hint: '図鑑に百の言葉。', text: '単語図鑑が100語に達した。' },
  { id: 'zukan500', name: '大書庫', hint: '図鑑に五百の言葉。', text: '単語図鑑が500語に達した。' },
  { id: 'days3', name: '三日の勤め', hint: '日を空けずに通う。', text: '3日続けて遊んだ。' },
  { id: 'days7', name: '七日の勤め', hint: 'さらに通う。', text: '7日続けて遊んだ。' },
];

/** 1手の結果から達成した碑文 */
export function inscriptionsForPlacement(res: Placement, game: Game): string[] {
  const got: string[] = [];
  if (res.chain >= 1) got.push('first');
  if (res.chain >= 3) got.push('chain3');
  if (res.chain >= 5) got.push('chain5');
  if (res.chain >= 8) got.push('chain8');
  if (res.between && res.chain >= 4) got.push('between');
  if (res.cross) got.push('cross');
  if (res.shared) got.push('shared');
  if (res.lit.length >= 5) got.push('revive'); // 置いた1枚 + 待ち4枚
  if (res.cleared.length && res.cellMult === 3) got.push('ruby');
  if (res.cleared.length && res.wild) got.push('star');
  if (res.total >= 1000) got.push('kilo');
  if (res.words.some((w) => w.found.text.length >= 8)) got.push('long');
  if (res.words.some((w) => w.found.mirrored)) got.push('mirror');
  if (res.cleared.some((w) => w.tier === 2 && !game.missions.find((m) => m.word === w)!.revealed)) got.push('kyodai');
  return got;
}
