// 1局の進行。
// 毎手1枚、好きな空きマスに置く。置いた文字を含む単語ができれば得点（複数なら連鎖）。
// 単語にならなくても置ける＝「待ち」。あとから来る文字でつながれば成立し、最後まで残れば減点。
// 袋はお題の文字 + おまけ + ★。お題の文字は上から順にだいたいまとまって流れてくるので、手札に混ざるのは1〜2語ぶん。
// いつ来るかは運で、手数が尽きると袋の残りは来ない。
import { type Found, type Grid, type Mask, type WordSet, cellsOf, emptyGrid, emptyMask, findWords } from './board';
import { type Mode, type Rng, type Word, WORD_MAP, sampleWord } from './words';

export interface GameOptions {
  mode: Mode;
  size?: number;
  /** お題の語数 */
  missions?: number;
  handSize?: number;
  /** お題と関係なく混ぜる文字数 */
  fillers?: number;
  /** 何の文字にでもなる札の枚数 */
  wilds?: number;
  /** 置ける回数。指定しなければ「袋の枚数 − shortage」 */
  turns?: number;
  /** 袋のうち最後まで来ない枚数。0なら全部来る */
  shortage?: number;
  /** 文字が流れてくる順のばらつき。大きいほど前後のお題の文字が混ざる */
  jitter?: number;
  /** 最初から盤面にある文字数 */
  seeds?: number;
  /** 得点が2倍・3倍になるマスの数 */
  bonus2?: number;
  bonus3?: number;
  /** 手直し（手札を捨てる・待ちの文字を拾う）の回数 */
  fixes?: number;
  /** 逆向きに読んでも単語として成立させる */
  mirror?: boolean;
  /** 待ちのまま終わった文字1枚の減点 */
  deadPenalty?: number;
  /** お題に必ず入れる語（復習用） */
  include?: Word[];
  maxMissionLen?: number;
}

export const DEFAULTS = {
  size: 8,
  missions: 6,
  handSize: 7,
  fillers: 8,
  wilds: 2,
  shortage: 4,
  jitter: 5,
  seeds: 4,
  bonus2: 5,
  bonus3: 2,
  fixes: 4,
  mirror: false,
  deadPenalty: 15,
  maxMissionLen: 6,
};

/** 層ごとの基礎点 × 文字数 */
export const TIER_POINTS = [10, 15, 20];
export const MAX_CHAIN_MULT = 8;
/** 何の文字にでもなる札 */
export const WILD = '*';
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
  /** ★で置いた */
  wild: boolean;
  words: Scored[];
  /** 同時にできた語数 */
  chain: number;
  chainMult: number;
  /** 置いたマスの倍率 */
  cellMult: number;
  total: number;
  /** この1枚で達成したお題 */
  cleared: Word[];
  /** この1枚で「待ち」から成立に変わったマス（置いたマス自身を含む） */
  lit: [number, number][];
  /** 両隣が埋まっているすき間に置いた */
  between: boolean;
  /** 縦と横の両方に単語ができた */
  cross: boolean;
  /** 達成したお題が、先に達成したお題と文字を共有している */
  shared: boolean;
}
export interface Mission {
  word: Word;
  done: boolean;
  /** つづりを見た（得点は通常の受験語と同じになり、復習に回る） */
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

/** 1手もどすために覚えておく状態 */
interface State {
  grid: Grid;
  lit: Mask;
  wild: Mask;
  hand: string[];
  queue: string[];
  done: boolean[];
  made: { text: string; kind: WordKind }[];
  missionCells: string[];
  seen: number;
  score: number;
  maxChain: number;
  fixesLeft: number;
  placed: number;
  turnsLeft: number;
  best: { total: number; word: string };
}

export class Game {
  readonly size: number;
  readonly handSize: number;
  readonly mirror: boolean;
  readonly deadPenalty: number;
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
  fixesLeft: number;
  /** 作った単語（重複なし、作った順） */
  made: { text: string; kind: WordKind }[] = [];
  placed = 0;
  turnsLeft: number;
  /** 手札に来たことのある文字（運と腕を分けて振り返るため） */
  seen: string[] = [];
  /** 1手での最高点と、そのときの一番長い単語 */
  best = { total: 0, word: '' };
  /** 達成したお題が使っているマス */
  missionCells: string[] = [];
  /** お題ごとの、文字が流れてくる範囲（引いた枚数で数える） */
  private flow: [number, number][] = [];
  private snapshot: State | null = null;

  constructor(options: GameOptions, rng: Rng, private valid: WordSet) {
    const o = { ...DEFAULTS, ...options };
    const n = (this.size = o.size);
    this.handSize = o.handSize;
    this.fixesLeft = o.fixes;
    this.mirror = o.mirror;
    this.deadPenalty = o.deadPenalty;
    this.grid = emptyGrid(n);
    this.lit = emptyMask(n);
    this.seed = emptyMask(n);
    this.wild = emptyMask(n);
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

    // 袋: お題ごとに「その語の文字 + おまけ」をひとかたまりにして順に並べ、近くどうしで順番をばらす
    const filler = () => FILLER[Math.floor(rng() * FILLER.length)];
    const stream: { ch: string; key: number }[] = [];
    picked.forEach((w, i) => {
      const block = [...w.text];
      const extra = Math.floor(o.fillers / picked.length) + (i < o.fillers % picked.length ? 1 : 0);
      for (let k = 0; k < extra; k++) block.push(filler());
      const start = stream.length;
      for (const ch of shuffle(block, rng)) stream.push({ ch, key: stream.length + rng() * o.jitter });
      this.flow.push([start - o.jitter, stream.length + o.jitter + o.handSize]);
    });
    for (let i = 0; i < o.wilds; i++) stream.push({ ch: WILD, key: rng() * stream.length });
    this.queue = stream.sort((a, b) => a.key - b.key).map((x) => x.ch);
    this.turnsLeft = options.turns ?? Math.max(1, this.queue.length - o.shortage);

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
    while (this.hand.length < this.handSize && this.queue.length) {
      const ch = this.queue.shift()!;
      this.hand.push(ch);
      this.seen.push(ch);
    }
  }
  private save(): void {
    this.snapshot = {
      grid: this.grid.map((r) => [...r]),
      lit: this.lit.map((r) => [...r]),
      wild: this.wild.map((r) => [...r]),
      hand: [...this.hand],
      queue: [...this.queue],
      done: this.missions.map((m) => m.done),
      made: [...this.made],
      missionCells: [...this.missionCells],
      seen: this.seen.length,
      score: this.score,
      maxChain: this.maxChain,
      fixesLeft: this.fixesLeft,
      placed: this.placed,
      turnsLeft: this.turnsLeft,
      best: { ...this.best },
    };
  }

  get emptyCells(): number {
    return this.grid.flat().filter((ch) => !ch).length;
  }
  /** 手数が尽きた、置く文字がない、または置く場所がない */
  get over(): boolean {
    return this.turnsLeft <= 0 || this.hand.length === 0 || this.emptyCells === 0;
  }
  isWaiting(r: number, c: number): boolean {
    return !!this.grid[r][c] && !this.lit[r][c] && !this.seed[r][c];
  }
  /** 置いたのに単語になっていない文字（種は数えない） */
  get waiting(): [number, number][] {
    const out: [number, number][] = [];
    for (let r = 0; r < this.size; r++) for (let c = 0; c < this.size; c++) if (this.isWaiting(r, c)) out.push([r, c]);
    return out;
  }
  /** いま文字が流れてきているお題か（手札に混ざっていそうか） */
  isFlowing(i: number): boolean {
    const [from, to] = this.flow[i];
    return !this.missions[i].done && this.seen.length >= from && this.seen.length <= to;
  }

  /** (r, c) に ch を置いたらできる単語と得点（置かずに調べる） */
  preview(ch: string, r: number, c: number): { words: Scored[]; total: number } {
    if (this.grid[r]?.[c] !== '') return { words: [], total: 0 };
    this.grid[r][c] = ch;
    const fresh = emptyMask(this.size);
    fresh[r][c] = true;
    const found = findWords(this.grid, fresh, this.valid, this.mirror);
    this.grid[r][c] = '';
    const words = found.map((f) => ({ found: f, ...scoreWord(f.text, this.missions.find((m) => !m.done && m.word.text === f.text)) }));
    const total = words.reduce((sum, w) => sum + w.pts, 0) * Math.min(MAX_CHAIN_MULT, Math.max(1, words.length)) * (words.length ? this.bonus[r][c] : 1);
    return { words, total };
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
    const found = findWords(this.grid, fresh, this.valid, this.mirror);
    const cleared: Word[] = [];
    const lit: [number, number][] = [];
    let shared = false;
    const words: Scored[] = found.map((f) => {
      const mission = this.missions.find((m) => !m.done && m.word.text === f.text);
      const keys = cellsOf(f).map(([r2, c2]) => `${r2},${c2}`);
      if (mission) {
        mission.done = true;
        cleared.push(mission.word);
        shared ||= keys.some((k) => this.missionCells.includes(k));
        this.missionCells.push(...keys);
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
    if (total > this.best.total) {
      this.best = { total, word: words.reduce((a, b) => (b.found.text.length > a.found.text.length ? b : a)).found.text };
    }
    const g = this.grid;
    const between = !!((g[r][c - 1] && g[r][c + 1]) || (g[r - 1]?.[c] && g[r + 1]?.[c]));
    const cross = words.some((w) => w.found.down) && words.some((w) => !w.found.down);
    this.draw();
    return { r, c, wild: isWild, words, chain, chainMult, cellMult, total, cleared, lit, between, cross, shared };
  }

  /** 手直し: 手札 i を捨てて次を引く */
  discard(i: number): boolean {
    if (this.fixesLeft <= 0 || i < 0 || i >= this.hand.length) return false;
    this.save();
    this.hand.splice(i, 1);
    this.fixesLeft--;
    this.draw();
    return true;
  }

  /** 手直し: 待ちの文字を盤面から拾って手札に戻す（手数は戻らない） */
  pickUp(r: number, c: number): boolean {
    if (this.fixesLeft <= 0 || !this.isWaiting(r, c)) return false;
    this.save();
    this.hand.push(this.wild[r][c] ? WILD : this.grid[r][c]);
    this.grid[r][c] = '';
    this.wild[r][c] = false;
    this.fixesLeft--;
    return true;
  }

  /** 直前の1手を取り消す */
  undo(): boolean {
    const s = this.snapshot;
    if (!s) return false;
    this.grid = s.grid;
    this.lit = s.lit;
    this.wild = s.wild;
    this.hand = s.hand;
    this.queue = s.queue;
    this.missions.forEach((m, i) => (m.done = s.done[i]));
    this.made = s.made;
    this.missionCells = s.missionCells;
    this.seen.length = s.seen;
    this.score = s.score;
    this.maxChain = s.maxChain;
    this.fixesLeft = s.fixesLeft;
    this.placed = s.placed;
    this.turnsLeft = s.turnsLeft;
    this.best = s.best;
    this.snapshot = null;
    return true;
  }

  /** つづりを見る。以後そのお題の得点は通常の受験語と同じになる */
  reveal(i: number): void {
    this.missions[i].revealed = true;
    this.snapshot = null;
  }

  /**
   * 達成できなかったお題について、足りなかった文字を返す（空なら文字は全部来ていた）。
   * 手札に来た文字と★、盤面の種で数える。文字の取り合いは考えないので目安。
   */
  shortfall(word: string): string[] {
    const pool = [...this.seen];
    for (let r = 0; r < this.size; r++) for (let c = 0; c < this.size; c++) if (this.seed[r][c]) pool.push(this.grid[r][c]);
    const missing: string[] = [];
    for (const ch of word) {
      const i = pool.indexOf(ch);
      if (i >= 0) pool.splice(i, 1);
      else missing.push(ch);
    }
    let wilds = pool.filter((ch) => ch === WILD).length;
    while (wilds-- > 0 && missing.length) missing.pop();
    return missing;
  }

  /** 終了時の精算 */
  settle(): { dead: number; penalty: number; allMissions: number; noDead: number; total: number } {
    const dead = this.waiting.length;
    const penalty = dead * this.deadPenalty;
    const allMissions = this.missions.every((m) => m.done) ? ALL_MISSIONS_BONUS : 0;
    const noDead = dead === 0 && this.placed >= 20 ? NO_DEAD_BONUS : 0;
    const total = Math.max(0, this.score - penalty + allMissions + noDead);
    return { dead, penalty, allMissions, noDead, total };
  }
}
