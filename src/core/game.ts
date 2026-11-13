// 1ゲームの進行。
// 毎手1枚、好きな空きマスに置く。置いた文字を含む単語ができれば得点（複数なら連鎖）。
// 単語にならなくても置ける＝「待ち」。あとから来る文字でつながれば成立し、最後まで残れば減点。
// 袋はお題の文字 + おまけを全部まぜたもの。手数が尽きると袋の残りは来ないので、待ちは外れることがある。
import { type Found, type Grid, type Mask, type WordSet, cellsOf, emptyGrid, emptyMask, findWords } from './board';
import { type Mode, type Rng, type Word, WORD_MAP, sampleWord } from './words';

export interface GameOptions {
  mode: Mode;
  size?: number;
  /** お題の語数。袋の中身はお題の文字 + おまけ */
  missions?: number;
  handSize?: number;
  /** お題と関係なく混ぜる文字数 */
  fillers?: number;
  /** 何の文字にでもなる札の枚数 */
  wilds?: number;
  /** 置ける回数。袋を引き切る前に終わるので、来ない文字が出る */
  turns?: number;
  /** 最初から盤面にある文字数 */
  seeds?: number;
  /** 得点が2倍・3倍になるマスの数 */
  bonus2?: number;
  bonus3?: number;
  discards?: number;
  /** お題に必ず入れる語（復習用） */
  include?: Word[];
  maxMissionLen?: number;
}

export const DEFAULTS = {
  size: 8,
  missions: 6,
  handSize: 6,
  fillers: 12,
  wilds: 2,
  turns: 34,
  seeds: 4,
  bonus2: 5,
  bonus3: 2,
  discards: 3,
  maxMissionLen: 7,
};

/** 層ごとの基礎点 × 文字数 */
export const TIER_POINTS = [10, 15, 20];
export const MAX_CHAIN_MULT = 8;
/** 何の文字にでもなる札 */
export const WILD = '*';
/** 最後まで単語にならなかった文字1枚の減点 */
export const DEAD_PENALTY = 15;
export const ALL_MISSIONS_BONUS = 400;
export const NO_DEAD_BONUS = 150;

/** おまけ文字の出やすさ。短い語を作りやすい文字に寄せる */
const FILLER = 'eeeeaaaiioossttrrnnldhmpcuy';

export type WordKind = 'mission' | 'target' | 'plain';
export interface Scored {
  found: Found;
  kind: WordKind;
  pts: number;
}
export interface Placement {
  r: number;
  c: number;
  words: Scored[];
  /** 同時にできた語数 */
  chain: number;
  chainMult: number;
  /** 置いたマスの倍率 */
  cellMult: number;
  total: number;
  /** この1枚で達成したお題 */
  cleared: Word[];
  /** この1枚で「待ち」から成立に変わったマス */
  lit: [number, number][];
}
export interface Mission {
  word: Word;
  done: boolean;
  /** つづりを見た（得点は半分、復習に回る） */
  revealed: boolean;
}

export function scoreWord(text: string, mission?: Mission): { kind: WordKind; pts: number } {
  const w = WORD_MAP.get(text);
  if (!w) return { kind: 'plain', pts: text.length };
  const base = TIER_POINTS[w.tier] * text.length;
  if (!mission) return { kind: 'target', pts: base };
  return { kind: 'mission', pts: mission.revealed ? base : base * 3 };
}

function shuffle<T>(items: T[], rng: Rng): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

type Snapshot = Pick<Game, 'score' | 'maxChain' | 'discardsLeft' | 'placed' | 'turnsLeft'> & {
  grid: Grid;
  lit: Mask;
  wild: Mask;
  hand: string[];
  queue: string[];
  done: boolean[];
  made: Game['made'];
};

export class Game {
  readonly size: number;
  readonly handSize: number;
  grid: Grid;
  /** 単語の一部になったマス */
  lit: Mask;
  /** 最初から置かれていた文字 */
  seed: Mask;
  /** ★で置いた文字 */
  wild: Mask;
  /** マスの倍率 (1, 2, 3) */
  bonus: number[][];
  hand: string[] = [];
  /** これから引く文字。先頭が次の1枚 */
  queue: string[];
  missions: Mission[];
  score = 0;
  maxChain = 0;
  discardsLeft: number;
  /** 作った単語（重複なし、作った順） */
  made: { text: string; kind: WordKind }[] = [];
  placed = 0;
  turnsLeft: number;
  private snapshot: Snapshot | null = null;

  constructor(options: GameOptions, rng: Rng, private valid: WordSet) {
    const o = { ...DEFAULTS, ...options };
    const n = (this.size = o.size);
    this.handSize = o.handSize;
    this.discardsLeft = o.discards;
    this.grid = emptyGrid(n);
    this.lit = emptyMask(n);
    this.seed = emptyMask(n);
    this.wild = emptyMask(n);
    this.turnsLeft = o.turns;
    this.bonus = Array.from({ length: n }, () => Array<number>(n).fill(1));

    const picked: Word[] = [];
    for (const w of o.include ?? []) {
      if (w.text.length <= o.maxMissionLen && !picked.includes(w) && picked.length < o.missions) picked.push(w);
    }
    while (picked.length < o.missions) {
      const w = sampleWord(o.mode, rng, o.maxMissionLen);
      if (!picked.includes(w)) picked.push(w);
    }
    shuffle(picked, rng);
    this.missions = picked.map((word) => ({ word, done: false, revealed: false }));

    // 袋: お題の文字 + おまけ + ★ を全部まぜる。どの文字がいつ来るか、最後まで来ないかは運。
    const filler = () => FILLER[Math.floor(rng() * FILLER.length)];
    const bag = picked.flatMap((w) => [...w.text]);
    for (let i = 0; i < o.fillers; i++) bag.push(filler());
    for (let i = 0; i < o.wilds; i++) bag.push(WILD);
    this.queue = shuffle(bag, rng);

    // 種と倍率マス: 互いに重ならない位置にばらまく
    const cells = shuffle(
      Array.from({ length: n * n }, (_, i) => [Math.floor(i / n), i % n] as [number, number]),
      rng,
    );
    const inner = cells.filter(([r, c]) => r > 0 && c > 0 && r < n - 1 && c < n - 1);
    const seeds: [number, number][] = [];
    for (const [r, c] of inner) {
      if (seeds.length >= o.seeds) break;
      if (seeds.every(([r2, c2]) => Math.abs(r - r2) + Math.abs(c - c2) >= 3)) seeds.push([r, c]);
    }
    for (const [r, c] of seeds) {
      this.grid[r][c] = filler();
      this.seed[r][c] = true;
    }
    const free = cells.filter(([r, c]) => !this.grid[r][c]);
    for (let i = 0; i < o.bonus2 + o.bonus3 && i < free.length; i++) {
      this.bonus[free[i][0]][free[i][1]] = i < o.bonus3 ? 3 : 2;
    }
    this.draw();
  }

  private draw(): void {
    while (this.hand.length < this.handSize && this.queue.length) this.hand.push(this.queue.shift()!);
  }
  private save(): void {
    this.snapshot = {
      grid: this.grid.map((r) => [...r]),
      lit: this.lit.map((r) => [...r]),
      wild: this.wild.map((r) => [...r]),
      turnsLeft: this.turnsLeft,
      hand: [...this.hand],
      queue: [...this.queue],
      done: this.missions.map((m) => m.done),
      made: [...this.made],
      score: this.score,
      maxChain: this.maxChain,
      discardsLeft: this.discardsLeft,
      placed: this.placed,
    };
  }

  get emptyCells(): number {
    return this.grid.flat().filter((ch) => !ch).length;
  }
  /** 手数が尽きた、置く文字がない、または置く場所がない */
  get over(): boolean {
    return this.turnsLeft <= 0 || this.hand.length === 0 || this.emptyCells === 0;
  }
  /** 置いたのに単語になっていない文字（種は数えない） */
  get waiting(): [number, number][] {
    const out: [number, number][] = [];
    for (let r = 0; r < this.size; r++) {
      for (let c = 0; c < this.size; c++) {
        if (this.grid[r][c] && !this.lit[r][c] && !this.seed[r][c]) out.push([r, c]);
      }
    }
    return out;
  }
  get canUndo(): boolean {
    return this.snapshot !== null;
  }

  /** 手札 i を (r, c) に置く。★は as で文字を指定する。置けなければ null */
  place(i: number, r: number, c: number, as?: string): Placement | null {
    if (this.over || this.grid[r]?.[c] !== '' || i < 0 || i >= this.hand.length) return null;
    const tile = this.hand[i];
    const isWild = tile === WILD;
    if (isWild && !(as && /^[a-z]$/.test(as))) return null;
    this.save();
    this.hand.splice(i, 1);
    this.grid[r][c] = isWild ? as! : tile;
    this.wild[r][c] = isWild;
    this.placed++;
    this.turnsLeft--;

    const fresh = emptyMask(this.size);
    fresh[r][c] = true;
    const found = findWords(this.grid, fresh, this.valid);
    const cleared: Word[] = [];
    const lit: [number, number][] = [];
    const words: Scored[] = found.map((f) => {
      const mission = this.missions.find((m) => !m.done && m.word.text === f.text);
      if (mission) {
        mission.done = true;
        cleared.push(mission.word);
      }
      const s = scoreWord(f.text, mission);
      if (!this.made.some((m) => m.text === f.text)) this.made.push({ text: f.text, kind: s.kind });
      for (const [r2, c2] of cellsOf(f)) {
        if (!this.lit[r2][c2]) {
          this.lit[r2][c2] = true;
          lit.push([r2, c2]);
        }
      }
      return { found: f, ...s };
    });
    const chain = words.length;
    const chainMult = Math.min(MAX_CHAIN_MULT, Math.max(1, chain));
    const cellMult = chain ? this.bonus[r][c] : 1;
    const total = words.reduce((sum, w) => sum + w.pts, 0) * chainMult * cellMult;
    this.score += total;
    this.maxChain = Math.max(this.maxChain, chain);
    this.draw();
    return { r, c, words, chain, chainMult, cellMult, total, cleared, lit };
  }

  /** 手札 i を捨てて次を引く */
  discard(i: number): boolean {
    if (this.discardsLeft <= 0 || i < 0 || i >= this.hand.length) return false;
    this.save();
    this.hand.splice(i, 1);
    this.discardsLeft--;
    this.draw();
    return true;
  }

  /** 直前の1手を取り消す */
  undo(): boolean {
    const s = this.snapshot;
    if (!s) return false;
    this.grid = s.grid;
    this.lit = s.lit;
    this.wild = s.wild;
    this.turnsLeft = s.turnsLeft;
    this.hand = s.hand;
    this.queue = s.queue;
    this.missions.forEach((m, i) => (m.done = s.done[i]));
    this.made = s.made;
    this.score = s.score;
    this.maxChain = s.maxChain;
    this.discardsLeft = s.discardsLeft;
    this.placed = s.placed;
    this.snapshot = null;
    return true;
  }

  /** つづりを見る。以後そのお題の得点は通常の受験語と同じになる */
  reveal(i: number): void {
    this.missions[i].revealed = true;
    this.snapshot = null;
  }

  /** 終了時の精算 */
  settle(): { dead: number; penalty: number; allMissions: number; noDead: number; total: number } {
    const dead = this.waiting.length;
    const penalty = dead * DEAD_PENALTY;
    const allMissions = this.missions.every((m) => m.done) ? ALL_MISSIONS_BONUS : 0;
    const noDead = dead === 0 && this.placed > 0 ? NO_DEAD_BONUS : 0;
    const total = Math.max(0, this.score - penalty + allMissions + noDead);
    return { dead, penalty, allMissions, noDead, total };
  }
}
