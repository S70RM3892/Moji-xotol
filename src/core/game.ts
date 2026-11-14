// 1局の進行。
// お題は1語ずつ出る。その語の文字が手札に届くので、盤面の好きな場所に並べて作る。
// 初めての語は、まずつづりを見ながら作り（知る）、少しあとでつづりなしでもう一度作る（思い出す）。
// 置いた文字を含む単語ができれば得点（複数なら連鎖）。単語にならない文字は「待ち」で、自由に動かせる。
import { type Found, type Grid, type Mask, type WordSet, cellsOf, emptyGrid, emptyMask, findWords } from './board';
import { type Task, cueOf, planTasks, swapWord, taskMult } from './tasks';
import { type Mode, type Rng, type Word, WORD_MAP } from './words';

export { type Task, taskMult } from './tasks';

export interface GameOptions {
  mode: Mode;
  size?: number;
  /** お題にする語の文字数の範囲 */
  maxLen?: number;
  minLen?: number;
  /** 1局で新しく覚える語数 */
  newWords?: number;
  handSize?: number;
  /** お題1語につき混ぜる、お題と関係ない文字の数 */
  fillersPerTask?: number;
  /** 何の文字にでもなる札の枚数 */
  wilds?: number;
  /** 最初から盤面にある文字数 */
  seeds?: number;
  /** 得点が2倍・3倍になるマスの数 */
  bonus2?: number;
  bonus3?: number;
  /** 手札を捨てられる回数 */
  discards?: number;
  /** 逆向きに読んでも単語として成立させる */
  mirror?: boolean;
  /** 待ちのまま終わった文字1枚の減点 */
  deadPenalty?: number;
  /** 思い出すお題で最初から見せる文字数 */
  cueLetters?: number;
  /** 覚え直す語（前に作れなかった語）。新しい語と同じ扱いで、見てから思い出す */
  relearn?: Word[];
  /** 前に自力で作れた語。つづりなしで出す */
  recall?: Word[];
  /** まだ自力で作ったことのない語か */
  isNew?: (word: Word) => boolean;
}

export const DEFAULTS = {
  size: 8,
  maxLen: 6,
  minLen: 4,
  newWords: 3,
  handSize: 7,
  fillersPerTask: 1,
  wilds: 2,
  seeds: 4,
  bonus2: 5,
  bonus3: 2,
  discards: 4,
  mirror: false,
  deadPenalty: 5,
  cueLetters: 1,
};

/** 層ごとの基礎点 × 文字数 */
export const TIER_POINTS = [10, 15, 20];
export const MAX_CHAIN_MULT = 8;
/** 何の文字にでもなる札 */
export const WILD = '*';
/** 思い出すお題を全部ヒントなしで作ったときのボーナス */
export const ALL_SOLO_BONUS = 300;
/** 次のお題に持ち越せる手札の枚数 */
const CARRY = 2;

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
  task: Task | null;
  /** この1枚で「待ち」から成立に変わったマス（置いたマス自身を含む） */
  lit: [number, number][];
  /** 両隣が埋まっているすき間に置いた */
  between: boolean;
  /** 縦と横の両方に単語ができた */
  cross: boolean;
}

export function scoreWord(text: string, task?: Task | null): { kind: WordKind; pts: number } {
  const w = WORD_MAP.get(text);
  if (!w) return { kind: 'plain', pts: text.length };
  const base = TIER_POINTS[w.tier] * text.length;
  return task ? { kind: 'mission', pts: Math.round(base * taskMult(task)) } : { kind: 'target', pts: base };
}

function shuffle<T>(items: T[], rng: Rng): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

export class Game {
  readonly size: number;
  readonly handSize: number;
  readonly mirror: boolean;
  readonly deadPenalty: number;
  readonly cueLetters: number;
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
  queue: string[] = [];
  tasks: Task[] = [];
  /** いまのお題の番号 */
  current = 0;
  /** 達成したお題のマス。演出のあと advance() で壁から消える */
  pending: [number, number][] | null = null;
  score = 0;
  maxChain = 0;
  discardsLeft: number;
  /** 作った単語（重複なし、作った順） */
  made: { text: string; kind: WordKind }[] = [];
  placed = 0;
  /** 1手での最高点と、そのときの一番長い単語 */
  best = { total: 0, word: '' };
  private fillers: number;
  /** ★を混ぜるお題の番号 */
  private wildAt: number[] = [];

  constructor(options: GameOptions, private rng: Rng, private valid: WordSet) {
    const o = { ...DEFAULTS, ...options };
    const n = (this.size = o.size);
    this.handSize = o.handSize;
    this.discardsLeft = o.discards;
    this.mirror = o.mirror;
    this.deadPenalty = o.deadPenalty;
    this.cueLetters = o.cueLetters;
    this.fillers = o.fillersPerTask;
    this.grid = emptyGrid(n);
    this.lit = emptyMask(n);
    this.seed = emptyMask(n);
    this.wild = emptyMask(n);
    this.bonus = Array.from({ length: n }, () => Array<number>(n).fill(1));

    this.tasks = planTasks(o, rng);
    for (let i = 0; i < o.wilds; i++) this.wildAt.push(Math.floor(rng() * this.tasks.length));

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
      this.grid[r][c] = this.filler();
      this.seed[r][c] = true;
    }
    const free = cells.filter(([r, c]) => !this.grid[r][c]);
    for (let i = 0; i < o.bonus2 + o.bonus3 && i < free.length; i++) {
      this.bonus[free[i][0]][free[i][1]] = i < o.bonus3 ? 3 : 2;
    }
    this.feed();
  }

  private filler(): string {
    return FILLER[Math.floor(this.rng() * FILLER.length)];
  }
  /** いまのお題の文字（+ おまけ）を袋に入れて、手札を補充する */
  private feed(): void {
    const t = this.task;
    if (!t) return;
    // お題の文字を先に、おまけと★をそのあとに引く。手札に入った分は並びをまぜる
    const extra: string[] = [];
    for (let i = 0; i < this.fillers; i++) extra.push(this.filler());
    for (const at of this.wildAt) if (at === this.current) extra.push(WILD);
    this.queue = [...shuffle([...t.word.text], this.rng), ...shuffle(extra, this.rng)];
    this.draw();
    shuffle(this.hand, this.rng);
  }
  private draw(): void {
    while (this.hand.length < this.handSize && this.queue.length) this.hand.push(this.queue.shift()!);
  }

  /** いまのお題。全部終わっていれば undefined */
  get task(): Task | undefined {
    return this.tasks[this.current];
  }
  get over(): boolean {
    return this.current >= this.tasks.length;
  }
  /** お題の見せ方: 見て作るなら全部、思い出すなら頭の数文字 + 伏せ字 */
  cue(t: Task): string {
    return cueOf(t, this.cueLetters);
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

  /** (r, c) に ch を置いたらできる単語と得点（置かずに調べる） */
  preview(ch: string, r: number, c: number): { words: Scored[]; total: number } {
    if (this.grid[r]?.[c] !== '') return { words: [], total: 0 };
    this.grid[r][c] = ch;
    const words = this.wordsAt(r, c);
    this.grid[r][c] = '';
    const total = words.reduce((sum, w) => sum + w.pts, 0) * Math.min(MAX_CHAIN_MULT, Math.max(1, words.length)) * (words.length ? this.bonus[r][c] : 1);
    return { words, total };
  }
  private wordsAt(r: number, c: number): Scored[] {
    const fresh = emptyMask(this.size);
    fresh[r][c] = true;
    const t = this.task;
    return findWords(this.grid, fresh, this.valid, this.mirror).map((f) => ({
      found: f,
      ...scoreWord(f.text, t && t.state === 'todo' && !this.pending && f.text === t.word.text ? t : null),
    }));
  }

  /** (r, c) に文字が入ったあとの判定と得点 */
  private resolve(r: number, c: number): Placement {
    const words = this.wordsAt(r, c);
    const lit: [number, number][] = [];
    let task: Task | null = null;
    for (const w of words) {
      if (w.kind === 'mission' && !task) {
        task = this.task!;
        task.state = 'done';
        this.pending = cellsOf(w.found);
      }
      if (!this.made.some((m) => m.text === w.found.text)) this.made.push({ text: w.found.text, kind: w.kind });
      for (const [r2, c2] of cellsOf(w.found)) {
        if (!this.lit[r2][c2]) {
          this.lit[r2][c2] = true;
          lit.push([r2, c2]);
        }
      }
    }
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
    return { r, c, wild: this.wild[r][c], words, chain, chainMult, cellMult, total, task, lit, between, cross };
  }

  /** 手札 i を (r, c) に置く。★は as で文字を指定する。置けなければ null */
  place(i: number, r: number, c: number, as?: string): Placement | null {
    if (this.over || this.pending || this.grid[r]?.[c] !== '' || i < 0 || i >= this.hand.length) return null;
    const tile = this.hand[i];
    const isWild = tile === WILD;
    if (isWild && !(as && /^[a-z]$/.test(as))) return null;
    this.hand.splice(i, 1);
    this.grid[r][c] = isWild ? as! : tile;
    this.wild[r][c] = isWild;
    this.placed++;
    const res = this.resolve(r, c);
    this.draw();
    return res;
  }

  /** 待ちの文字を別の空きマスへ動かす */
  move(r: number, c: number, r2: number, c2: number): Placement | null {
    if (this.over || this.pending || !this.isWaiting(r, c) || this.grid[r2]?.[c2] !== '') return null;
    this.grid[r2][c2] = this.grid[r][c];
    this.wild[r2][c2] = this.wild[r][c];
    this.grid[r][c] = '';
    this.wild[r][c] = false;
    return this.resolve(r2, c2);
  }

  /** 待ちの文字を手札に戻す */
  takeBack(r: number, c: number): boolean {
    if (this.pending || !this.isWaiting(r, c)) return false;
    this.hand.push(this.wild[r][c] ? WILD : this.grid[r][c]);
    this.grid[r][c] = '';
    this.wild[r][c] = false;
    return true;
  }

  /** 手札 i を捨てて次を引く */
  discard(i: number): boolean {
    if (this.discardsLeft <= 0 || i < 0 || i >= this.hand.length) return false;
    this.hand.splice(i, 1);
    this.discardsLeft--;
    this.draw();
    return true;
  }

  /** ヒント: 思い出すお題の文字を、頭から1文字多く見せる */
  hint(): boolean {
    const t = this.task;
    if (!t || t.shown || t.state !== 'todo' || this.cueLetters + t.hints >= t.word.text.length) return false;
    t.hints++;
    return true;
  }

  /** いまのお題の語を別の語に替える。置きかけの文字と手札は片づけて、新しい語の文字を配る */
  swap(next: Word): void {
    const t = this.task;
    if (!t || t.state !== 'todo' || this.pending) return;
    swapWord(this.tasks, t.word, next);
    for (const [r, c] of this.waiting) {
      this.grid[r][c] = '';
      this.wild[r][c] = false;
    }
    this.hand = [];
    this.feed();
  }

  /** いまのお題をあきらめる（advance() で次へ進む） */
  skip(): Task | null {
    const t = this.task;
    if (!t || t.state !== 'todo') return null;
    t.state = 'skipped';
    return t;
  }

  /** 次のお題へ。達成した語は壁から消え、手札は少しだけ持ち越す */
  advance(): void {
    const skipped = this.task?.state === 'skipped';
    for (const [r, c] of this.pending ?? []) {
      this.grid[r][c] = '';
      this.lit[r][c] = false;
      this.wild[r][c] = false;
    }
    this.pending = null;
    this.hand = skipped ? [] : this.hand.slice(0, CARRY);
    this.current++;
    this.feed();
  }

  /** 終了時の精算 */
  settle(): { dead: number; penalty: number; recalls: number; solo: number; allSolo: number; total: number } {
    const dead = this.waiting.length;
    const penalty = dead * this.deadPenalty;
    const recalls = this.tasks.filter((t) => !t.shown);
    const solo = recalls.filter((t) => t.state === 'done' && t.hints === 0).length;
    const allSolo = recalls.length > 0 && solo === recalls.length ? ALL_SOLO_BONUS : 0;
    return { dead, penalty, recalls: recalls.length, solo, allSolo, total: Math.max(0, this.score - penalty + allSolo) };
  }
}
