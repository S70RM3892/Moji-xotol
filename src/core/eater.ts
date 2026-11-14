// 「喰らう」モード。壁いっぱいに文字が並び、文字食い邪神を上下左右に動かして、お題の語をつづりの順に食べさせる。
// 正しい文字のマスへは進めて、食べたマスは空く。違う文字には進めず、命が1つ減る。
// 壁はお題ごとに作り直す。邪神の隣から、つづりどおりにたどれる道が必ず1本だけ通っている。
import { type Mask, emptyGrid, emptyMask } from './board';
import { type PlanOptions, type Task, cueOf, planTasks, swapWord, taskMult } from './tasks';
import type { Rng, Word } from './words';

export interface EaterOptions extends PlanOptions {
  size?: number;
  /** 1語あたりの命（間違えられる回数） */
  lives?: number;
  /** 思い出すお題で最初から見せる文字数 */
  cueLetters?: number;
}

/** 層ごとの基礎点 × 文字数（語を食べ切ったとき） */
const TIER_POINTS = [10, 15, 20];
const LETTER_POINTS = 10;
/** 1語を一度も間違えずに食べ切ったときの加点 */
export const CLEAN_BONUS = 50;
export const ALL_SOLO_BONUS = 300;

/** 道の外に置く文字の出やすさ */
const COMMON = 'eeeeaaaaiiioooouusssttrrnnllddhhmmppccbbggffyywkv';
/** つづりで取り違えやすい文字。道のすぐ横に置いて、次の1文字を本当に覚えているかを問う */
const CONFUSE: Record<string, string> = {
  a: 'eou', e: 'aiy', i: 'eyu', o: 'aue', u: 'oai', y: 'ie',
  b: 'pvd', c: 'ksz', d: 'tb', f: 'vph', g: 'jqk', h: 'nk', j: 'gy', k: 'cq', l: 'ri', m: 'nw',
  n: 'mh', p: 'bq', q: 'kg', r: 'ln', s: 'czx', t: 'dl', v: 'fbw', w: 'vm', x: 'sz', z: 'sx',
};

export type Step =
  | { kind: 'blocked' }
  | { kind: 'walk' }
  | { kind: 'wrong'; r: number; c: number; ch: string; failed: boolean }
  | { kind: 'eat'; r: number; c: number; ch: string; pts: number; done: boolean; bonus: number };

type Cell = [number, number];
const NEAR: Cell[] = [[-1, 0], [1, 0], [0, -1], [0, 1]];

export class Eater {
  readonly size: number;
  readonly cueLetters: number;
  private readonly maxLives: number;
  /** '' は食べたあとの空きマス */
  grid: string[][];
  /** 間違えて吐き出したマス */
  spat: Mask;
  pos: Cell;
  /** いまのお題のつづりどおりにたどれる道 */
  path: Cell[] = [];
  tasks: Task[];
  current = 0;
  /** いまのお題で食べ終えた文字数 */
  progress = 0;
  lives: number;
  score = 0;
  /** 間違えずに続けて食べた数 */
  combo = 0;
  maxCombo = 0;
  wrongs = 0;
  private wordWrongs = 0;

  constructor(options: EaterOptions, private rng: Rng) {
    this.size = options.size ?? 8;
    this.cueLetters = options.cueLetters ?? 1;
    this.maxLives = this.lives = options.lives ?? 3;
    this.tasks = planTasks(options, rng);
    this.grid = emptyGrid(this.size);
    this.spat = emptyMask(this.size);
    this.pos = [this.size >> 1, this.size >> 1];
    this.layout();
  }

  get task(): Task | undefined {
    return this.tasks[this.current];
  }
  get over(): boolean {
    return this.current >= this.tasks.length;
  }
  /** お題の見せ方。食べた文字はそのまま見える */
  cue(t: Task): string {
    return cueOf(t, this.cueLetters, t === this.task ? this.progress : 0);
  }
  private inside(r: number, c: number): boolean {
    return r >= 0 && c >= 0 && r < this.size && c < this.size;
  }
  private around([r, c]: Cell): Cell[] {
    return NEAR.map(([dr, dc]) => [r + dr, c + dc] as Cell).filter(([r2, c2]) => this.inside(r2, c2));
  }
  private pick(letters: string): string {
    return letters[Math.floor(this.rng() * letters.length)];
  }

  /** いまのお題のために壁を作り直す */
  private layout(): void {
    const t = this.task;
    if (!t) return;
    const word = t.word.text;
    const key = ([r, c]: Cell) => r * this.size + c;
    for (let tries = 0; tries < 400; tries++) {
      // 邪神の隣から、同じマスを通らない道を1本引く
      const path: Cell[] = [];
      const used = new Set([key(this.pos)]);
      let at = this.pos;
      while (path.length < word.length) {
        const open = this.around(at).filter((p) => !used.has(key(p)));
        if (!open.length) break;
        at = open[Math.floor(this.rng() * open.length)];
        used.add(key(at));
        path.push(at);
      }
      if (path.length < word.length) continue;

      // 道の途中から、先のマスにある同じ文字へ飛べてしまう配置は捨てる（飛ぶと戻れなくなる）
      const index = new Map(path.map((p, i) => [key(p), i]));
      let ok = true;
      // i 文字目を食べる時点で邪神が立てるのは、出発点と、食べ終えた道のマス
      for (let i = 0; i < word.length && ok; i++) {
        for (let j = -1; j < i && ok; j++) {
          for (const p of this.around(j < 0 ? this.pos : path[j])) {
            const k = index.get(key(p));
            if (k !== undefined && k > i && word[k] === word[i]) ok = false;
          }
        }
      }
      if (!ok) continue;

      this.path = path;
      this.spat = emptyMask(this.size);
      const inWord = new Set(word);
      for (let r = 0; r < this.size; r++) {
        for (let c = 0; c < this.size; c++) {
          const here: Cell = [r, c];
          const i = index.get(key(here));
          if (i !== undefined) {
            this.grid[r][c] = word[i];
            continue;
          }
          if (r === this.pos[0] && c === this.pos[1]) {
            this.grid[r][c] = '';
            continue;
          }
          // この壁マスの隣を道が通るなら、その「次の1文字」と取り違えやすい文字を置く
          const nextLetters: string[] = [];
          let touchesPath = false;
          for (const p of this.around(here)) {
            const k = p[0] === this.pos[0] && p[1] === this.pos[1] ? -1 : index.get(key(p));
            if (k === undefined) continue;
            touchesPath = true;
            if (k + 1 < word.length) nextLetters.push(word[k + 1]);
          }
          let ch = '';
          for (let n = 0; n < 30 && !ch; n++) {
            const trap = nextLetters.length && this.rng() < 0.75;
            const cand = trap ? this.pick(CONFUSE[this.pick(nextLetters.join(''))] ?? COMMON) : this.pick(COMMON);
            // 道に触れるマスには、お題の文字を置かない（正しい道が1本に決まる）
            if (!touchesPath || !inWord.has(cand)) ch = cand;
          }
          this.grid[r][c] = ch || [...'xzqjkvwy'].find((x) => !inWord.has(x)) || 'x';
        }
      }
      return;
    }
  }

  /** 邪神を1マス動かす */
  move(dr: number, dc: number): Step {
    const t = this.task;
    const r = this.pos[0] + dr;
    const c = this.pos[1] + dc;
    if (!t || t.state !== 'todo' || !this.inside(r, c)) return { kind: 'blocked' };
    const ch = this.grid[r][c];
    if (!ch) {
      this.pos = [r, c];
      return { kind: 'walk' };
    }
    const word = t.word.text;
    if (ch !== word[this.progress]) {
      this.spat[r][c] = true;
      this.lives--;
      this.wrongs++;
      this.wordWrongs++;
      this.combo = 0;
      const failed = this.lives <= 0;
      if (failed) t.state = 'skipped';
      return { kind: 'wrong', r, c, ch, failed };
    }
    this.grid[r][c] = '';
    this.pos = [r, c];
    this.progress++;
    this.combo++;
    this.maxCombo = Math.max(this.maxCombo, this.combo);
    let pts = Math.round(LETTER_POINTS * (1 + 0.2 * Math.min(this.combo - 1, 10)));
    let bonus = 0;
    const done = this.progress >= word.length;
    if (done) {
      t.state = 'done';
      bonus = Math.round(TIER_POINTS[t.word.tier] * word.length * taskMult(t)) + (this.wordWrongs === 0 ? CLEAN_BONUS : 0);
      pts += bonus;
    }
    this.score += pts;
    return { kind: 'eat', r, c, ch, pts, done, bonus };
  }

  /** ヒント: 次に食べるマスを教える（そのお題は「自力」ではなくなる） */
  hint(): Cell | null {
    const t = this.task;
    if (!t || t.state !== 'todo') return null;
    if (!t.shown) t.hints++;
    return this.path[this.progress] ?? null;
  }

  /** いまのお題の語を別の語に替えて、壁を作り直す */
  swap(next: Word): void {
    const t = this.task;
    if (!t || t.state !== 'todo') return;
    swapWord(this.tasks, t.word, next);
    this.progress = 0;
    this.wordWrongs = 0;
    this.layout();
  }

  /** いまのお題をあきらめる */
  skip(): Task | null {
    const t = this.task;
    if (!t || t.state !== 'todo') return null;
    t.state = 'skipped';
    return t;
  }

  /** 次のお題へ。壁を作り直す */
  advance(): void {
    this.current++;
    this.progress = 0;
    this.lives = this.maxLives;
    this.wordWrongs = 0;
    this.layout();
  }

  settle(): { recalls: number; solo: number; allSolo: number; total: number } {
    const recalls = this.tasks.filter((t) => !t.shown);
    const solo = recalls.filter((t) => t.state === 'done' && t.hints === 0).length;
    const allSolo = recalls.length > 0 && solo === recalls.length ? ALL_SOLO_BONUS : 0;
    return { recalls: recalls.length, solo, allSolo, total: this.score + allSolo };
  }
}
