// お題の並び。どの遊び方でも共通の学習の流れ:
// 新しい語は、まずつづりを見ながら（知る）、別の語を1つはさんで、つづりなしでもう一度（思い出す）。
import { type Mode, type Rng, type Word, sampleWord } from './words';

export interface Task {
  word: Word;
  /** つづりを見ながら（知る）。false なら思い出す */
  shown: boolean;
  /** 使ったヒントの数 */
  hints: number;
  state: 'todo' | 'done' | 'skipped';
}

export interface PlanOptions {
  mode: Mode;
  /** お題にする語の文字数の範囲 */
  maxLen: number;
  minLen?: number;
  /** 1局で新しく覚える語数 */
  newWords: number;
  /** 覚え直す語（前に思い出せなかった語）。新しい語と同じ扱いで、見てから思い出す */
  relearn?: Word[];
  /** 前に自力で思い出せた語。つづりなしで出す */
  recall?: Word[];
  /** まだ自力で思い出したことのない語か */
  isNew?: (word: Word) => boolean;
}

export function planTasks(o: PlanOptions, rng: Rng): Task[] {
  // 語を選ぶ: 覚え直す語 → 新しい語（合わせて newWords 語）、それとは別に、前に思い出せた語を2語まで
  const isNew = o.isNew ?? (() => true);
  const minLen = o.minLen ?? 4;
  const fits = (w: Word) => w.text.length <= o.maxLen && w.text.length >= minLen;
  const fresh: Word[] = [];
  const known: Word[] = [];
  for (const w of o.relearn ?? []) if (fits(w) && !fresh.includes(w) && fresh.length < o.newWords - 1) fresh.push(w);
  for (const w of o.recall ?? []) if (fits(w) && !known.includes(w) && !fresh.includes(w) && known.length < 2) known.push(w);
  // 覚えた語が増えると新しい語に当たりにくくなるので、試す回数は多めに取る
  for (let tries = 0; fresh.length < o.newWords && tries < 3000; tries++) {
    const w = sampleWord(o.mode, rng, o.maxLen, minLen);
    if (fresh.includes(w) || known.includes(w)) continue;
    if (isNew(w)) fresh.push(w);
    else if (known.length < 2) known.push(w);
  }

  // 並べる: 新しい語は「見る」→ ほかの語を1つはさんで →「思い出す」
  const sources: { word: Word; fresh: boolean }[] = [];
  for (let i = 0; i < Math.max(fresh.length, known.length + 2); i++) {
    if (fresh[i]) sources.push({ word: fresh[i], fresh: true });
    if (i >= 2 && known[i - 2]) sources.push({ word: known[i - 2], fresh: false });
  }
  const tasks: Task[] = [];
  const task = (word: Word, shown: boolean): Task => ({ word, shown, hints: 0, state: 'todo' });
  let waiting: Word | null = null;
  for (const s of sources) {
    tasks.push(task(s.word, s.fresh));
    if (waiting) {
      tasks.push(task(waiting, false));
      waiting = null;
    }
    if (s.fresh) waiting = s.word;
  }
  if (waiting) tasks.push(task(waiting, false));
  return tasks;
}

/** まだ始めていない語を別の語に差し替える（「もう知ってる」と言われたとき）。同じ語の「思い出す」も一緒に替わる */
export function swapWord(tasks: Task[], old: Word, next: Word): void {
  for (const t of tasks) if (t.word === old && t.state === 'todo') t.word = next;
}

/** お題の語の倍率。見ながら=1倍、ヒントを使って思い出す=1.5倍、自力で思い出す=3倍 */
export function taskMult(task: Task): number {
  return task.shown ? 1 : task.hints ? 1.5 : 3;
}

/** お題の見せ方: 見ながらなら全部、思い出すなら頭の数文字 + 伏せ字。done 文字ぶんは必ず見せる */
export function cueOf(t: Task, cueLetters: number, done = 0): string {
  const text = t.word.text;
  if (t.shown || t.state !== 'todo') return text;
  const open = Math.min(text.length, Math.max(done, cueLetters + t.hints));
  return text.slice(0, open) + '·'.repeat(text.length - open);
}
