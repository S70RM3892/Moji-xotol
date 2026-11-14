import { HERO, ICON } from './art';
import { Eater } from './core/eater';
import { DEFAULTS, Game, type Placement, type Task, WILD } from './core/game';
import { MODE_LABEL, type Mode, TIER_LABEL, WORDS, WORD_MAP, type Word, makeRng, sampleWord } from './core/words';
import { setSound, sfx, toast } from './fx';
import { SIGN, glyphOf, spell } from './glyphs';
import analysis from './data/analysis.json';
import { PASSAGES, PASSAGE_LEVEL, type Passage } from './data/passages';
import { LEVEL_NAME, SENTENCES, type Sentence } from './data/sentences';
import { AMULETS, INSCRIPTIONS, MAX_AMULETS, inscriptionsForPlacement, levelOf, levelStart, titleOf } from './meta';

type Kind = 'tile' | 'eat' | 'read' | 'parse' | 'skim';
/** むずかしさ。お題の文字数の範囲は遊ぶ形で変わる（刻むは盤面の幅、喰らうは道の長さが上限） */
const LEVELS = [
  { label: 'やさしい', min: 4, tileMax: 6, eatMax: 6, cue: 2, wilds: 3, note: 'お題は4〜6文字。思い出すときは頭の2文字が見える。' },
  { label: 'ふつう', min: 5, tileMax: 7, eatMax: 8, cue: 1, wilds: 2, note: 'お題は5文字以上（刻むは7、喰らうは8文字まで）。思い出すときは頭の1文字が見える。' },
  { label: 'むずかしい', min: 6, tileMax: 8, eatMax: 10, cue: 0, wilds: 1, note: 'お題は6文字以上（刻むは8、喰らうは10文字まで）。思い出すときの手がかりは意味と字数だけ。' },
];
const lengths = (k: Kind, lv: number) => ({ minLen: LEVELS[lv].min, maxLen: k === 'eat' ? LEVELS[lv].eatMax : LEVELS[lv].tileMax });
const MODE_NOTE: Record<Mode, string> = {
  kyote: '共通テスト・センター試験23年分（2004〜2026）の分析に基づいて選ぶ。繰り返し出ていて、次も出る見込みが高い語（B1中心）を優先する。',
  nankan: 'お題の65%が難関大2次水準（CEFR B2）、25%が京大水準。',
  kyodai: '京大の過去問27年分（2000〜2026）の分析に基づいて選ぶ。次に出る見込みが高く、まだ知らなそうな語（B2以上と、過去問に出た学術語）を優先する。',
};
/** 盤ごとの自己ベストを覚えておく数 */
const BOARDS_KEPT = 60;

type Pos = { r: number; c: number };
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text = ''): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
};
const appEl = $('app');
const boardEl = $('board');
// 見出しや飾りの字形（HTML には名前だけ書いてある）
for (const node of document.querySelectorAll<HTMLElement>('[data-sign]')) {
  const sign = SIGN[node.dataset.sign as keyof typeof SIGN];
  if (node.classList.contains('gl')) node.textContent = sign;
  else node.dataset.g = sign;
}
/** 文字と、それに添える字形 */
function lettered(host: HTMLElement, ch: string): void {
  host.append(ch, el('span', 'gl', glyphOf(ch)));
}
$<HTMLImageElement>('heroimg').src = HERO;
$<HTMLImageElement>('iconimg').src = ICON;
$<HTMLImageElement>('padicon').src = ICON;

function load<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v === null ? fallback : (JSON.parse(v) as T);
  } catch {
    return fallback;
  }
}
function save(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* 保存できなくても遊べる */
  }
}

// --- 続けて遊ぶための記録（このブラウザにだけ残る） ---
const KINDS: { value: Kind; label: string; note: string }[] = [
  { value: 'tile', label: '刻む', note: '手札の文字をドラッグして、壁に語を並べる。連鎖と倍率マスで点を伸ばす。' },
  { value: 'eat', label: '喰らう', note: '壁いっぱいの文字の中で文字食い邪神を動かし、語をつづりの順に食べさせる。' },
  { value: 'skim', label: '粗読み', note: '文章を1題、時間を計って通読し、要旨を選ぶ。訳さず、戻らず、段落ごとの役割を追う練習。長さは3段階（短い → 中くらい → 京大型の約600語）。' },
  { value: 'parse', label: '読み解く', note: '英文を1文読み、同じ意味の英文を選ぶ。日本語に訳さず、英語のまま意味を取る練習。文の入り組み方が6段階で上がっていく。' },
  { value: 'read', label: '読む', note: '英単語を見て、意味を即答する。長文を速く読むための練習。1.5秒以内に答えられた語を「瞬時に読める語」として数える。' },
];
let kind = load<Kind>('kind', 'tile');
let mode = load<Mode>('mode', 'kyodai');
let level = load<number>('level', 1);
let xp = load<number>('xp', 0);
let games = load<number>('games', 0);
let best = load<number>('best', 0);
let soundOn = load<boolean>('sound', true);
let days = load<{ last: string; streak: number }>('days', { last: '', streak: 0 });
let chosen = load<string[]>('amulets', []);
/** 盤（並びの種・層・むずかしさ）ごとの自己ベスト */
let boards = load<Record<string, number>>('boards', {});
/** 思い出せなかった語。あとの局で、もう一度見るところからやり直す */
const missed = new Set(load<string[]>('missed', []).filter((w) => WORD_MAP.has(w)));
/** ヒントなしで思い出して作った回数 */
const learned = load<Record<string, number>>('learned', {});
/** 一度でも盤面で作った受験語 */
const zukan = new Set(load<string[]>('zukan', []).filter((w) => WORD_MAP.has(w)));
/** 見つけた碑文 */
const earned = new Set(load<string[]>('inscriptions', []));
setSound(soundOn);

// --- 判定辞書（単語 → 短い和訳） ---
const glossOf = new Map<string, string>();
const valid = new Set<string>();
function loadValid(text: string): void {
  for (const line of text.split('\n')) {
    const [w, g] = line.split('\t');
    if (!w) continue;
    valid.add(w);
    if (g) glossOf.set(w, g);
  }
}
/** 1行に収めるための短い和訳: 主な品詞の、最初の語義だけ（和訳は「[動] a、b／c　[名] d」の形） */
const brief = (g: string) => g.split('　')[0].split('／')[0];
const gloss = (w: string) => (WORD_MAP.has(w) ? brief(WORD_MAP.get(w)!.gloss) : (glossOf.get(w) ?? ''));

// --- 1局の状態 ---
interface Setup {
  kind: Kind;
  seed: number;
  mode: Mode;
  level: number;
  amulets: string[];
  relearn: string[];
  recall: string[];
  daily: boolean;
  retry: boolean;
}
let setup: Setup;
let game: Game;
let nextCount = 2;
let last: Placement | null = null;
let fresh = new Set<string>(); // 直前の1手で初めて図鑑に入った語
let busy = false; // お題達成の演出中は置けない
let ending = false;
let gameNew: string[] = []; // この局で見つけた碑文

const today = () => new Date().toLocaleDateString('sv');
function hash(text: string): number {
  let h = 2166136261;
  for (const ch of text) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return h >>> 0;
}
const boardKey = (s: Pick<Setup, 'kind' | 'seed' | 'mode' | 'level'>) => `${s.seed}:${s.mode}:${s.level}${s.kind === 'tile' ? '' : `:${s.kind}`}`;
const dailySeed = () => hash(`${today()}|${mode}|${level}`);
const dailyKey = () => boardKey({ kind, seed: dailySeed(), mode, level });
const unlocked = () => AMULETS.filter((a) => a.level <= levelOf(xp));
const activeAmulets = () => unlocked().filter((a) => chosen.includes(a.id)).slice(0, MAX_AMULETS);

function show(view: 'home' | 'play' | 'eat' | 'read' | 'parse' | 'skim' | 'stats' | 'result'): void {
  for (const v of ['home', 'play', 'eat', 'read', 'parse', 'skim', 'stats', 'result']) $(v).hidden = v !== view;
  scrollTo(0, 0);
}

/** 碑文を刻む。新しく見つけたものだけ知らせる */
function earn(ids: string[]): void {
  const fresh = ids.filter((id) => !earned.has(id));
  if (!fresh.length) return;
  fresh.forEach((id, i) => {
    earned.add(id);
    gameNew.push(id);
    const ins = INSCRIPTIONS.find((x) => x.id === id)!;
    setTimeout(() => {
      toast(appEl, 150 + i * 44, `碑文を発見　${ins.name}`, 'found');
    }, 700 + i * 500);
  });
  save('inscriptions', [...earned]);
}

/** まだ自力で思い出したことのない語か（思い出せなかった語は、覚え直すので新しい語と同じ扱い） */
const isNew = (w: Word) => !learned[w.text] || missed.has(w.text);

/** 「もう知ってる」: いまの語を知っている語として記録し、別の新しい語に差し替える */
function knowWord(tasks: Task[], current: Task, swap: (next: Word) => void): string {
  const old = current.word;
  const pick = makeRng((Date.now() ^ (Math.random() * 2 ** 32)) >>> 0);
  const { minLen, maxLen } = lengths(setup.kind, setup.level);
  let next: Word | null = null;
  for (let tries = 0; tries < 3000 && !next; tries++) {
    const w = sampleWord(setup.mode, pick, maxLen, minLen);
    if (isNew(w) && !tasks.some((t) => t.word === w)) next = w;
  }
  if (!next) return 'この条件で出せる新しい語が、もう残っていない。';
  // 知っている語は「3回思い出した」扱いにして、当分お題に出さない
  learned[old.text] = Math.max(learned[old.text] ?? 0, 3);
  missed.delete(old.text);
  save('learned', learned);
  save('missed', [...missed]);
  swap(next);
  return `${old.text.toUpperCase()} は知っている語として記録した。代わりの語を出す。`;
}

function newSetup(daily: boolean): Setup {
  const seed = daily ? dailySeed() : (Date.now() ^ (Math.random() * 2 ** 32)) >>> 0;
  const pick = makeRng(seed ^ 0x9e3779b9);
  const sample = (words: string[], n: number) =>
    words
      .filter((w) => WORD_MAP.has(w) && w.length <= lengths(kind, level).maxLen && w.length >= lengths(kind, level).minLen)
      .map((w) => ({ w, k: pick() }))
      .sort((a, b) => a.k - b.k)
      .slice(0, n)
      .map(({ w }) => w);
  // 覚え直す語（思い出せなかった語）を2つまで、前に思い出せた語を2つまで混ぜる。回数の少ない語から
  const relearn = sample([...missed], 2);
  const known = Object.keys(learned).filter((w) => !missed.has(w)).sort((a, b) => learned[a] - learned[b]);
  const recall = sample(known.slice(0, 8), 2);
  return { kind, seed, mode, level, amulets: kind === 'tile' ? activeAmulets().map((a) => a.id) : [], relearn, recall, daily, retry: false };
}

function startGame(s: Setup): void {
  setup = s;
  gameNew = [];
  ending = false;
  busy = false;
  if (s.kind === 'eat') return startEat(s);
  if (s.kind === 'read') return startRead();
  if (s.kind === 'parse') return startParse();
  if (s.kind === 'skim') return startSkim();
  const L = LEVELS[s.level];
  const opts = {
    wilds: L.wilds,
    discards: DEFAULTS.discards,
    fillersPerTask: DEFAULTS.fillersPerTask,
    bonus3: DEFAULTS.bonus3,
    handSize: DEFAULTS.handSize,
    deadPenalty: DEFAULTS.deadPenalty,
    mirror: false,
  };
  const amulets = AMULETS.filter((a) => s.amulets.includes(a.id));
  for (const a of amulets) a.apply(opts);
  nextCount = Math.max(2, ...amulets.map((a) => a.next ?? 0));
  game = new Game(
    {
      mode: s.mode,
      ...opts,
      ...lengths('tile', s.level),
      cueLetters: L.cue,
      relearn: s.relearn.map((w) => WORD_MAP.get(w)!),
      recall: s.recall.map((w) => WORD_MAP.get(w)!),
      isNew,
    },
    makeRng(s.seed),
    valid,
  );
  last = null;
  fresh = new Set();
  show('play');
  renderPlay();
}

// --- 置いたあとの処理 ---
function afterPlacement(res: Placement): void {
  last = res;
  record(res);
  renderPlay();
  if (!res.task) return;
  // お題達成: 答えの札を少し見せてから、語を壁から消して次のお題へ
  busy = true;
  answerCard(boardEl, res.task, res.task.shown ? '刻んだ。あとでもう一度出る' : res.task.hints ? 'ヒントで思い出した' : '自力で思い出した');
  setTimeout(nextTask, DONE_PAUSE);
}
function nextTask(): void {
  game.advance();
  busy = false;
  last = null;
  if (game.over) {
    ending = true;
    renderPlay();
    setTimeout(endGame, 300);
    return;
  }
  renderPlay();
}

function doPlace(i: number, { r, c }: Pos, as?: string): void {
  const res = game.place(i, r, c, as);
  if (!res) return;
  afterPlacement(res);
}

/** お題を終えたあと、答えの札を見せておく時間 */
const DONE_PAUSE = 1000;
/** 壁の中央に、語・字形・意味を書いた札を出す */
function answerCard(board: HTMLElement, t: Task, tag: string, cls = ''): void {
  const a = appEl.getBoundingClientRect();
  const b = board.getBoundingClientRect();
  const card = el('div', `bigword ${cls}`.trim());
  card.append(el('span', 'tag', tag), el('span', 'gl', spell(t.word.text)), el('b', '', t.word.text), el('span', 'g', brief(t.word.gloss)));
  card.style.left = `${b.left - a.left + b.width / 2}px`;
  card.style.top = `${b.top - a.top + b.height / 2}px`;
  appEl.append(card);
  setTimeout(() => card.remove(), DONE_PAUSE);
}

/** 1手の結果を記録する: 図鑑・碑文・音 */
function record(res: Placement): void {
  fresh = new Set();
  if (!res.chain) {
    sfx.bet();
    return;
  }
  for (const w of res.words) {
    if (w.kind !== 'plain' && !zukan.has(w.found.text)) {
      zukan.add(w.found.text);
      fresh.add(w.found.text);
    }
  }
  if (fresh.size) save('zukan', [...zukan]);
  earn(inscriptionsForPlacement(res));
  if (res.task) sfx.mission();
  else sfx.word(res.chain);
}

// --- ドラッグ: 手札から盤面へ。待ちの文字は盤面の上で動かせるし、手札にも戻せる ---
type Source = { hand: number } | { cell: Pos };
let drag: { from: Source; ch: string; src: HTMLElement; ghost: HTMLElement | null; sx: number; sy: number; lift: number; over: HTMLElement | null } | null = null;
function startDrag(e: PointerEvent, from: Source): void {
  if (ending || busy || e.button > 0) return;
  const ch = 'hand' in from ? game.hand[from.hand] : game.grid[from.cell.r][from.cell.c];
  // 指で隠れないよう、タッチのときは札を指の少し上に浮かせる
  drag = { from, ch, src: e.currentTarget as HTMLElement, ghost: null, sx: e.clientX, sy: e.clientY, lift: e.pointerType === 'mouse' ? 0 : 44, over: null };
}
function endDrag(drop: boolean): void {
  const d = drag;
  drag = null;
  if (!d?.ghost) {
    if (d && drop) {
      last = null;
      renderPlay('札はつかんで運ぶ。置きたいマスの上で離す。');
    }
    return;
  }
  d.ghost.remove();
  d.src.classList.remove('lifted');
  d.over?.classList.remove('drop');
  $('droptip').hidden = true;
  for (const node of boardEl.querySelectorAll('.good, .great')) node.classList.remove('good', 'great');
  const over = drop ? d.over : null;
  if (!over) return;
  if ('hand' in d.from) {
    if (over.id === 'trash') {
      if (game.discard(d.from.hand)) {
        last = null;
        sfx.bet();
        renderPlay('1枚すてた。');
      }
      return;
    }
    if (!over.dataset.k) return;
    const [r, c] = over.dataset.k.split(',').map(Number);
    if (d.ch === WILD) openPicker(d.from.hand, { r, c });
    else doPlace(d.from.hand, { r, c });
    return;
  }
  const { r, c } = d.from.cell;
  if (over.id === 'hand') {
    if (game.takeBack(r, c)) {
      last = null;
      renderPlay();
    }
    return;
  }
  if (!over.dataset.k) return;
  const [r2, c2] = over.dataset.k.split(',').map(Number);
  const res = game.move(r, c, r2, c2);
  if (res) afterPlacement(res);
}
document.addEventListener(
  'pointermove',
  (e) => {
    const d = drag;
    if (!d) return;
    if (!d.ghost) {
      if (Math.hypot(e.clientX - d.sx, e.clientY - d.sy) < 8) return;
      d.ghost = el('div', d.ch === WILD ? 'tile wild ghost' : 'tile ghost');
      if (d.ch === WILD) d.ghost.append(el('span', 'gl', SIGN.star));
      else lettered(d.ghost, d.ch);
      const box = d.src.getBoundingClientRect();
      d.ghost.style.width = `${box.width}px`;
      d.ghost.style.height = `${box.height}px`;
      document.body.append(d.ghost);
      d.src.classList.add('lifted');
      // つかんだ瞬間に、この文字で単語ができるマスを光らせる
      const origin = 'cell' in d.from ? d.from.cell : null;
      if (origin) game.grid[origin.r][origin.c] = '';
      if (d.ch !== WILD) {
        for (const node of boardEl.querySelectorAll<HTMLElement>('.cell.empty')) {
          const [r, c] = node.dataset.k!.split(',').map(Number);
          const pv = game.preview(d.ch, r, c);
          if (pv.words.length) node.classList.add(pv.words.some((w) => w.kind !== 'plain') ? 'great' : 'good');
        }
      }
      if (origin) game.grid[origin.r][origin.c] = d.ch;
    }
    e.preventDefault();
    const x = e.clientX;
    const y = e.clientY - d.lift;
    d.ghost.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%) rotate(-6deg) scale(1.15)`;
    $('droptip').style.transform = `translate(${x}px, ${y - 64}px) translate(-50%, -50%)`;
    const hit = document.elementFromPoint(x, y);
    const cell = hit?.closest<HTMLElement>('#board .cell.empty') ?? null;
    const zone = 'hand' in d.from ? hit?.closest<HTMLElement>('#trash') : hit?.closest<HTMLElement>('.rack')?.querySelector<HTMLElement>('#hand');
    const over = cell ?? zone ?? null;
    if (over === d.over) return;
    d.over?.classList.remove('drop');
    over?.classList.add('drop');
    d.over = over;
    const tip = $('droptip');
    if (cell && d.ch !== WILD) {
      const [r, c] = cell.dataset.k!.split(',').map(Number);
      const origin = 'cell' in d.from ? d.from.cell : null;
      if (origin) game.grid[origin.r][origin.c] = '';
      const pv = game.preview(d.ch, r, c);
      if (origin) game.grid[origin.r][origin.c] = d.ch;
      tip.textContent = pv.words.length ? `${pv.words.map((w) => w.found.text.toUpperCase()).join('・')}　+${pv.total}` : 'まだ単語にならない';
      tip.className = pv.words.length ? 'yes' : 'no';
      tip.hidden = false;
    } else tip.hidden = true;
  },
  { passive: false },
);
document.addEventListener('pointerup', () => endDrag(true));
document.addEventListener('pointercancel', () => endDrag(false));

/** 1局の結果。遊ぶ形によらず同じ形にまとめる */
interface Outcome {
  tasks: Task[];
  total: number;
  recalls: number;
  solo: number;
  rows: [string, string][];
  /** この形だけの碑文 */
  extra: string[];
  /** お題のほかにできた受験語 */
  found: Word[];
}

function endGame(): void {
  const s = game.settle();
  const rows: [string, string][] = [[`単語の得点（最大${game.maxChain}連鎖）`, `${game.score}`]];
  if (game.best.total) rows.push([`最高の一手 ${game.best.word.toUpperCase()}`, `+${game.best.total}`]);
  if (s.dead) rows.push([`単語にならなかった文字 ${s.dead}枚`, `−${s.penalty}`]);
  if (s.allSolo) rows.push(['全部ヒントなしで思い出した', `+${s.allSolo}`]);
  const mission = new Set(game.tasks.map((t) => t.word.text));
  finish({
    tasks: game.tasks,
    total: s.total,
    recalls: s.recalls,
    solo: s.solo,
    rows,
    extra: s.dead === 0 && game.placed >= 20 ? ['clean'] : [],
    found: game.made.filter((m) => m.kind !== 'plain' && !mission.has(m.text)).map((m) => WORD_MAP.get(m.text)!),
  });
}

/** 得点・局数・連続日数・盤ごとの自己ベストを記録する。戻り値は、この盤の前回までの自己ベストと、加点前のレベル */
function account(total: number): { prev: number | undefined; before: number } {
  const before = levelOf(xp);
  xp += total;
  games += 1;
  best = Math.max(best, total);
  if (days.last !== today()) {
    const yesterday = new Date(Date.now() - 864e5).toLocaleDateString('sv');
    days = { last: today(), streak: days.last === yesterday ? days.streak + 1 : 1 };
    save('days', days);
  }
  const key = boardKey(setup);
  const prev = boards[key];
  if (prev === undefined || total > prev) {
    delete boards[key];
    boards[key] = total;
    for (const old of Object.keys(boards).slice(0, -BOARDS_KEPT)) delete boards[old];
    save('boards', boards);
  }
  save('xp', xp);
  save('games', games);
  save('best', best);
  return { prev, before };
}
function levelUpNotice(before: number): void {
  const lv = levelOf(xp);
  if (lv <= before) return;
  const gift = AMULETS.filter((a) => a.level > before && a.level <= lv).map((a) => `護符「${a.name}」`);
  toast(appEl, 110, `Lv ${lv}　${titleOf(lv)}${gift.length ? `　${gift.join('・')}を得た` : ''}`, 'banner');
}

function finish(o: Outcome): void {
  const { prev, before } = account(o.total);
  // 思い出すお題の結果だけを記録する: 自力で思い出せたら「覚えた」、それ以外は覚え直し
  for (const t of o.tasks) {
    if (t.shown) continue;
    if (t.state === 'done' && t.hints === 0) {
      learned[t.word.text] = (learned[t.word.text] ?? 0) + 1;
      missed.delete(t.word.text);
    } else missed.add(t.word.text);
  }
  save('missed', [...missed]);
  save('learned', learned);

  // 評価は、思い出すお題をヒントなしでこなせた割合で決まる
  const rate = o.recalls ? o.solo / o.recalls : 0;
  const grade = rate >= 1 ? 'S' : rate >= 0.7 ? 'A' : rate >= 0.4 ? 'B' : 'C';

  const soloOf = (w: string) => o.tasks.some((t) => !t.shown && t.word.text === w && t.state === 'done' && t.hints === 0);
  const got = [...o.extra];
  if (o.tasks.every((t) => t.state === 'done')) got.push('all');
  if (o.tasks.some((t) => t.shown && t.state === 'done' && soloOf(t.word.text))) got.push('echo');
  if (grade === 'S' && setup.kind === 'tile' && setup.amulets.length === 0) got.push('bare');
  if (setup.retry && prev !== undefined && prev > 0 && o.total > prev) got.push('again');
  if (zukan.size >= 100) got.push('zukan100');
  if (zukan.size >= 500) got.push('zukan500');
  if (days.streak >= 3) got.push('days3');
  if (days.streak >= 7) got.push('days7');
  earn(got);

  const kindLabel = KINDS.find((k) => k.value === setup.kind)!.label;
  $('resmode').textContent = `${setup.daily ? '今日の盤・' : ''}${kindLabel}・${MODE_LABEL[setup.mode]}・${LEVELS[setup.level].label}`;
  const g = $('grade');
  g.className = `grade g-${grade}`;
  g.textContent = grade;
  const row = (label: string, value: string) => {
    const d = el('div');
    d.append(el('span', '', label), el('b', '', value));
    return d;
  };
  $('resrows').replaceChildren(
    ...o.rows.map(([label, value]) => row(label, value)),
    row(`合計（自力で思い出した ${o.solo}/${o.recalls}）`, `${o.total}`),
  );
  $('resrecord').textContent =
    prev === undefined
      ? 'この盤は初挑戦。同じ盤をやり直すと、同じ語をもう一度思い出す練習になる。'
      : o.total > prev
        ? `この盤の自己ベスト更新: ${prev} → ${o.total}`
        : `この盤の自己ベストは ${prev}点。今回は ${o.total}点。`;

  $('resnew').replaceChildren(
    ...gameNew.map((id) => {
      const ins = INSCRIPTIONS.find((x) => x.id === id)!;
      const t = el('div', 'tablet got');
      t.append(el('b', '', `碑文　${ins.name}`), ins.text);
      return t;
    }),
  );

  // 語ごとに、思い出せたかどうかをまとめる
  const words = [...new Set(o.tasks.map((t) => t.word))];
  $('resmissions').replaceChildren(
    ...words.map((w) => {
      const recall = o.tasks.find((t) => !t.shown && t.word === w);
      const solo = !!recall && recall.state === 'done' && recall.hints === 0;
      const hinted = !!recall && recall.state === 'done' && recall.hints > 0;
      const li = el('li', solo ? 'ok' : 'ng');
      li.append(
        el('span', 'mark', solo ? '○' : hinted ? '△' : '×'),
        el('span', 'word', w.text),
        el('span', 'gl', spell(w.text)),
        el('span', 'tier', TIER_LABEL[w.tier]),
        ...(hasPast(w) ? [el('span', 'past', pastLabel(w))] : []),
        el('span', 'g', w.gloss),
        el(
          'span',
          solo ? 'why skill' : 'why luck',
          solo
            ? `自力で思い出した（通算${learned[w.text]}回）。次はもっと間を空けて出る。`
            : hinted
              ? `ヒント${recall!.hints}回で思い出した。次の局でもう一度見るところから。`
              : recall && recall.state !== 'todo'
                ? '思い出せなかった。次の局でもう一度見るところから。'
                : '思い出す番まで進まなかった。',
        ),
      );
      return li;
    }),
  );
  $('retry').hidden = false;
  $('misshead').textContent = 'この局の言葉';
  $('foundhead').hidden = setup.kind === 'eat';
  $('resfound').hidden = setup.kind === 'eat';
  $('foundhead').textContent = `ついでに見つけた受験語（${o.found.length}語）`;
  $('resfound').replaceChildren(
    ...(o.found.length
      ? o.found.map((w) => {
          const li = el('li');
          li.append(el('span', 'word', w.text), el('span', 'tier', TIER_LABEL[w.tier]), el('span', 'g', w.gloss));
          return li;
        })
      : [el('li', 'empty', 'お題のほかに受験語はできなかった')]),
  );
  show('result');
  levelUpNotice(before);
}

// --- 読むモード: 英単語を見て意味を即答する。長文を速く読むための練習 ---
/** この時間以内に正しく答えられたら「瞬時に読めた」と数える */
const FAST_MS = 1500;
const READ_COUNT = 20;
/** むずかしさごとの制限時間（秒） */
const READ_LIMIT = [7, 5, 4];
/** 語ごとの記録: 瞬時に読めた連続回数と、直近の回答時間。3回続けば「瞬時に読める語」 */
const fluent = load<Record<string, [number, number]>>('fluent', {});
/** 間違えた語・遅かった語。次の回でもう一度出す */
const slow = new Set(load<string[]>('slow', []).filter((w) => WORD_MAP.has(w)));
const isFluent = (w: string) => (fluent[w]?.[0] ?? 0) >= 3;

/** その層の試験の本文で出会う語。出た年度が多い語ほど出やすい */
function readPool(): { word: Word; weight: number }[] {
  return WORDS.filter((w) => w.cefr !== 'A1' && w.text.length >= 4)
    .map((w) => {
      const seen = mode === 'kyote' ? w.ctYears : mode === 'kyodai' ? w.years.length : Math.max(w.years.length, w.ctYears) * (w.tier >= 1 ? 1 : 0.3);
      const value = mode === 'kyote' ? w.ctValue : mode === 'kyodai' ? w.value : w.tier === 1 ? 20000 : 0;
      // やさしい語は見た瞬間に分かるはずなので、ほとんど出さない。難しい語ほど、また過去問に何度も出た語ほど出やすい
      const hard = { A2: 0.05, B1: 0.5, B2: 1.5, C1: 2, C2: 2, KU: 2, CT: 1.5 }[w.cefr] ?? 0;
      return { word: w, weight: (seen + value / 15000) * hard };
    })
    .filter((x) => x.weight > 0);
}

interface ReadItem {
  word: Word;
  options: Word[];
  /** 選んだ選択肢の番号。時間切れは -1 */
  picked: number | null;
  ms: number;
}
let readItems: ReadItem[] = [];
let readAt = 0;
let readShown = 0; // 問題を出した時刻
let readTimer = 0;
let readScore = 0;

function startRead(): void {
  const pool = readPool();
  const byText = new Map(pool.map((x) => [x.word.text, x]));
  const chosen: Word[] = [];
  // 前に遅かった・間違えた語を半分まで。残りは、まだ瞬時に読めない語から重みに従って選ぶ
  for (const w of [...slow].sort(() => Math.random() - 0.5)) {
    if (chosen.length >= READ_COUNT / 2) break;
    if (byText.has(w)) chosen.push(byText.get(w)!.word);
  }
  const rest = pool.filter((x) => !isFluent(x.word.text) && !chosen.includes(x.word));
  let sum = rest.reduce((a, x) => a + x.weight, 0);
  while (chosen.length < READ_COUNT && rest.length) {
    let r = Math.random() * sum;
    const i = Math.max(0, rest.findIndex((x) => (r -= x.weight) <= 0));
    chosen.push(rest[i].word);
    sum -= rest[i].weight;
    rest.splice(i, 1);
  }
  const shapes = new Map<string, Word[]>();
  for (const { word } of pool) {
    const k = `${word.tier}${word.pos[0] ?? ''}`; // 同じ層・同じ品詞の語から選択肢を取る
    shapes.set(k, [...(shapes.get(k) ?? []), word]);
  }
  readItems = chosen
    .sort(() => Math.random() - 0.5)
    .map((word) => {
      const same = shapes.get(`${word.tier}${word.pos[0] ?? ''}`) ?? [];
      const options = [word];
      for (let tries = 0; options.length < 4 && tries < 200; tries++) {
        const cand = same[Math.floor(Math.random() * same.length)] ?? WORDS[Math.floor(Math.random() * WORDS.length)];
        if (!options.some((o) => brief(o.gloss) === brief(cand.gloss))) options.push(cand);
      }
      return { word, options: options.sort(() => Math.random() - 0.5), picked: null, ms: 0 };
    });
  readAt = 0;
  readScore = 0;
  show('read');
  askRead();
}

function askRead(): void {
  const item = readItems[readAt];
  readShown = performance.now();
  clearInterval(readTimer);
  const limit = READ_LIMIT[setup.level] * 1000;
  readTimer = window.setInterval(() => {
    const left = limit - (performance.now() - readShown);
    if (left <= 0) answerRead(-1);
    else $('rtime').textContent = (left / 1000).toFixed(1);
  }, 100);
  $('rtime').textContent = (limit / 1000).toFixed(1);
  renderRead(item);
}

function renderRead(item: ReadItem): void {
  $('rscore').textContent = String(readScore);
  $('rstep').textContent = String(readAt + 1);
  $('rsteps').textContent = `/ ${readItems.length}`;
  $('rword').textContent = item.word.text;
  $('rglyph').textContent = spell(item.word.text);
  $('rtier').textContent = TIER_LABEL[item.word.tier];
  const past = $('rpast');
  past.hidden = !hasPast(item.word);
  past.textContent = pastLabel(item.word);
  const answered = item.picked !== null;
  $('rchoices').replaceChildren(
    ...item.options.map((o, i) => {
      const b = el('button', 'choice');
      b.append(el('span', 'key', String(i + 1)), el('span', 'g', answered ? o.gloss : brief(o.gloss)));
      if (answered) {
        b.disabled = true;
        if (o === item.word) b.classList.add('right');
        else if (i === item.picked) b.classList.add('wrong');
        if (o !== item.word) b.append(el('span', 'was', o.text));
      } else b.onclick = () => answerRead(i);
      return b;
    }),
  );
  const ok = answered && item.options[item.picked!] === item.word;
  $('rnote').textContent = !answered
    ? '意味を選べ。1〜4のキーでも答えられる。'
    : !ok
      ? item.picked === -1
        ? '時間切れ。'
        : '違う。'
      : item.ms <= FAST_MS
        ? `瞬時に読めた（${(item.ms / 1000).toFixed(1)}秒）。`
        : `正解。ただし ${(item.ms / 1000).toFixed(1)}秒かかった。1.5秒以内を目指せ。`;
}

function answerRead(i: number): void {
  const item = readItems[readAt];
  if (!item || item.picked !== null) return;
  clearInterval(readTimer);
  item.picked = i;
  item.ms = performance.now() - readShown;
  const ok = i >= 0 && item.options[i] === item.word;
  const w = item.word.text;
  if (ok && item.ms <= FAST_MS) {
    fluent[w] = [(fluent[w]?.[0] ?? 0) + 1, Math.round(item.ms)];
    slow.delete(w);
    sfx.note(Math.min(readAt, 8));
  } else {
    fluent[w] = [0, Math.round(item.ms)];
    slow.add(w);
    if (ok) sfx.bet();
    else sfx.bad();
  }
  if (ok) {
    const limit = READ_LIMIT[setup.level] * 1000;
    readScore += 100 + Math.round(100 * Math.max(0, Math.min(1, (limit - item.ms) / (limit - 1000))));
    if (!zukan.has(w)) zukan.add(w);
  }
  renderRead(item);
  // 正解ならすぐ次へ。間違えたときは正しい意味を読む時間を取る
  setTimeout(nextRead, ok ? 600 : 2200);
}

function nextRead(): void {
  if ($('read').hidden) return;
  readAt++;
  if (readAt < readItems.length) askRead();
  else endRead();
}

function endRead(): void {
  clearInterval(readTimer);
  const done = readItems.filter((x) => x.picked !== null);
  const right = done.filter((x) => x.picked! >= 0 && x.options[x.picked!] === x.word);
  const fast = right.filter((x) => x.ms <= FAST_MS);
  save('fluent', fluent);
  save('slow', [...slow]);
  save('zukan', [...zukan]);
  const { prev, before } = account(readScore);
  const rate = done.length ? fast.length / done.length : 0;
  const grade = rate >= 0.9 ? 'S' : rate >= 0.75 ? 'A' : rate >= 0.5 ? 'B' : 'C';
  const times = right.map((x) => x.ms).sort((a, b) => a - b);
  const median = times.length ? times[times.length >> 1] / 1000 : 0;

  $('resmode').textContent = `読む・${MODE_LABEL[setup.mode]}・${LEVELS[setup.level].label}`;
  const g = $('grade');
  g.className = `grade g-${grade}`;
  g.textContent = grade;
  const row = (label: string, value: string) => {
    const d = el('div');
    d.append(el('span', '', label), el('b', '', value));
    return d;
  };
  $('resrows').replaceChildren(
    row('正解', `${right.length} / ${done.length}`),
    row('瞬時に読めた（1.5秒以内）', `${fast.length} / ${done.length}`),
    row('正解までの時間（中央値）', `${median.toFixed(1)}秒`),
    row('合計', `${readScore}`),
  );
  $('resrecord').textContent =
    `瞬時に読める語は通算 ${Object.keys(fluent).filter(isFluent).length} 語（3回続けて1.5秒以内に正解した語）。` +
    (prev !== undefined && readScore > prev ? ` 自己ベスト更新: ${prev} → ${readScore}` : '');
  $('resnew').replaceChildren();
  // 見直す語: 間違えた語と、遅かった語
  const review = done.filter((x) => !fast.includes(x));
  $('misshead').textContent = `見直す語（${review.length}語）。次の回にもう一度出る`;
  $('resmissions').replaceChildren(
    ...(review.length
      ? review.map((x) => {
          const ok = right.includes(x);
          const li = el('li', ok ? 'ok' : 'ng');
          li.append(
            el('span', 'mark', ok ? '△' : '×'),
            el('span', 'word', x.word.text),
            el('span', 'tier', TIER_LABEL[x.word.tier]),
            ...(hasPast(x.word) ? [el('span', 'past', pastLabel(x.word))] : []),
            el('span', 'g', x.word.gloss),
            el('span', 'why luck', ok ? `正解だが ${(x.ms / 1000).toFixed(1)}秒かかった` : x.picked === -1 ? '時間切れ' : `「${brief(x.options[x.picked!].gloss)}」と答えた`),
          );
          return li;
        })
      : [el('li', 'empty', '全部、瞬時に読めた')]),
  );
  $('foundhead').hidden = true;
  $('resfound').hidden = true;
  $('retry').hidden = true;
  show('result');
  levelUpNotice(before);
}

document.addEventListener('keydown', (e) => {
  if ($('read').hidden || !/^[1-4]$/.test(e.key)) return;
  answerRead(Number(e.key) - 1);
});
$('rquit').onclick = () => {
  clearInterval(readTimer);
  if (readItems.some((x) => x.picked !== null)) endRead();
  else {
    renderHome();
    show('home');
  }
};

// --- 読み解くモード: 英文を1文読み、同じ意味の英文を選ぶ。訳さずに英語のまま意味を取る練習 ---
const PARSE_COUNT = 10;
/** 京大の読解1題（近年はおよそ600語）を5分で読む速さ */
const PACE_WPM = 120;
/** いまの段階（1〜6）。速く正しく読めると上がり、間違えると下がる */
let parseLevel = Math.min(6, Math.max(1, load<number>('parseLevel', 2)));
/** 正しく読めたことのある文 */
const parseSeen = new Set(load<string[]>('parseSeen', []));
interface ParseItem {
  s: Sentence;
  options: string[];
  picked: number | null;
  readMs: number;
  reread: boolean;
  phase: 'read' | 'ask' | 'done';
}
let parseItems: ParseItem[] = [];
let parseScore = 0;
let parseShown = 0;
let parseStreak = 0;
const wordsIn = (text: string) => text.split(/\s+/).length;
const wpmOf = (item: ParseItem) => Math.round(wordsIn(item.s.text) / (Math.max(item.readMs, 300) / 60000));
const parseRight = (item: ParseItem) => item.picked !== null && item.options[item.picked] === item.s.options[0];

function startParse(): void {
  parseItems = [];
  parseScore = 0;
  parseStreak = 0;
  show('parse');
  nextParse();
}

/** いまの段階の文から、まだ読めていないものを優先して1つ選ぶ */
function nextParse(): void {
  if (parseItems.length >= PARSE_COUNT) return endParse();
  const used = new Set(parseItems.map((x) => x.s));
  let pool: Sentence[] = [];
  for (let d = 0; d < 6 && !pool.length; d++) {
    pool = SENTENCES.filter((x) => Math.abs(x.level - parseLevel) === d && !used.has(x));
  }
  if (!pool.length) return endParse();
  const fresh = pool.filter((x) => !parseSeen.has(x.text));
  const from = fresh.length ? fresh : pool;
  const s = from[Math.floor(Math.random() * from.length)];
  parseItems.push({ s, options: [...s.options].sort(() => Math.random() - 0.5), picked: null, readMs: 0, reread: false, phase: 'read' });
  parseShown = performance.now();
  renderParse();
}

function renderParse(): void {
  const item = parseItems[parseItems.length - 1];
  const done = item.phase === 'done';
  $('pscore').textContent = String(parseScore);
  $('pstep').textContent = String(parseItems.length);
  $('psteps').textContent = `/ ${PARSE_COUNT}`;
  $('plevel').textContent = String(item.s.level);
  $('pkind').textContent = item.phase === 'read' ? '1回で意味をつかめ' : done ? LEVEL_NAME[item.s.level] : '同じ意味の文はどれ？';
  const tag = $('ptag');
  tag.hidden = !done;
  tag.textContent = item.s.tag;
  // 選ぶあいだは本文を隠す（読み返さずに意味を持っておく練習）。読み返したら本文を出したままにする
  const text = $('ptext');
  text.hidden = item.phase === 'ask' && !item.reread;
  text.textContent = item.s.text;
  $('pchoices').replaceChildren(
    ...(item.phase === 'read'
      ? []
      : item.options.map((o, i) => {
          const b = el('button', 'choice');
          b.append(el('span', 'key', String(i + 1)), el('span', 'g', o));
          if (done) {
            b.disabled = true;
            if (o === item.s.options[0]) b.classList.add('right');
            else if (i === item.picked) b.classList.add('wrong');
          } else b.onclick = () => answerParse(i);
          return b;
        })),
  );
  $('pgo').hidden = item.phase !== 'read';
  $('pagain').hidden = item.phase !== 'ask' || item.reread;
  $('pnext').hidden = !done;
  $('pnext').textContent = parseItems.length >= PARSE_COUNT ? '結果を見る' : '次の文へ';
  const wpm = wpmOf(item);
  $('pnote').textContent =
    item.phase === 'read'
      ? `${wordsIn(item.s.text)}語。訳さずに読み、意味がつかめたら「読めた」を押す。`
      : item.phase === 'ask'
        ? `読むのに ${(item.readMs / 1000).toFixed(1)}秒（1分あたり ${wpm}語。目安は ${PACE_WPM}語）。1〜3のキーでも選べる。`
        : `${parseRight(item) ? '正解。' : '違う。'}${item.s.note}`;
}

function answerParse(i: number): void {
  const item = parseItems[parseItems.length - 1];
  if (!item || item.phase !== 'ask') return;
  item.picked = i;
  item.phase = 'done';
  const ok = parseRight(item);
  const fast = wpmOf(item) >= PACE_WPM && !item.reread;
  if (ok) {
    parseSeen.add(item.s.text);
    const speed = Math.max(0, Math.min(100, wpmOf(item) - 60));
    parseScore += Math.round((100 + speed + item.s.level * 20) * (item.reread ? 0.5 : 1));
    // 速く正しく読めたのが2回続いたら、段階を上げる
    parseStreak = fast ? parseStreak + 1 : 0;
    if (parseStreak >= 2 && parseLevel < 6) {
      parseLevel++;
      parseStreak = 0;
    }
    sfx.word(item.s.level);
  } else {
    parseStreak = 0;
    if (parseLevel > 1) parseLevel--;
    sfx.bad();
  }
  save('parseLevel', parseLevel);
  save('parseSeen', [...parseSeen]);
  renderParse();
}

function endParse(): void {
  const done = parseItems.filter((x) => x.phase === 'done');
  const right = done.filter(parseRight);
  const speeds = right.map(wpmOf).sort((a, b) => a - b);
  const median = speeds.length ? speeds[speeds.length >> 1] : 0;
  const { prev, before } = account(parseScore);
  const grade = right.length >= 9 && median >= PACE_WPM ? 'S' : right.length >= 8 ? 'A' : right.length >= 6 ? 'B' : 'C';
  $('resmode').textContent = '読み解く';
  const g = $('grade');
  g.className = `grade g-${grade}`;
  g.textContent = grade;
  const row = (label: string, value: string) => {
    const d = el('div');
    d.append(el('span', '', label), el('b', '', value));
    return d;
  };
  $('resrows').replaceChildren(
    row('正解', `${right.length} / ${done.length}`),
    row(`読む速さ（正解した文の中央値。目安 ${PACE_WPM}語/分）`, `${median}語/分`),
    row('いまの段階', `${parseLevel}: ${LEVEL_NAME[parseLevel]}`),
    row('合計', `${parseScore}`),
  );
  $('resrecord').textContent =
    `読めた文は通算 ${parseSeen.size} / ${SENTENCES.length}。` + (prev !== undefined && parseScore > prev ? ` 自己ベスト更新: ${prev} → ${parseScore}` : '');
  $('resnew').replaceChildren();
  const review = done.filter((x) => !parseRight(x) || x.reread);
  $('misshead').textContent = `見直す文（${review.length}文）`;
  $('resmissions').replaceChildren(
    ...(review.length
      ? review.map((x) => {
          const li = el('li', parseRight(x) ? 'ok' : 'ng');
          li.append(
            el('span', 'mark', parseRight(x) ? '△' : '×'),
            el('span', 'tier', `段階${x.s.level}・${x.s.tag}`),
            el('span', 'sent', x.s.text),
            el('span', 'why skill', `＝ ${x.s.options[0]}`),
            el('span', 'why luck', x.s.note),
          );
          return li;
        })
      : [el('li', 'empty', '全部、読み返さずに正しく読めた')]),
  );
  $('foundhead').hidden = true;
  $('resfound').hidden = true;
  $('retry').hidden = true;
  show('result');
  levelUpNotice(before);
}

$('pgo').onclick = () => {
  const item = parseItems[parseItems.length - 1];
  if (!item || item.phase !== 'read') return;
  item.readMs = performance.now() - parseShown;
  item.phase = 'ask';
  renderParse();
};
$('pagain').onclick = () => {
  const item = parseItems[parseItems.length - 1];
  if (!item || item.phase !== 'ask') return;
  item.reread = true;
  renderParse();
};
$('pnext').onclick = nextParse;
$('pquit').onclick = () => {
  if (parseItems.some((x) => x.phase === 'done')) endParse();
  else {
    renderHome();
    show('home');
  }
};
document.addEventListener('keydown', (e) => {
  if ($('parse').hidden) return;
  const item = parseItems[parseItems.length - 1];
  if (!item) return;
  if (item.phase === 'ask' && /^[1-3]$/.test(e.key)) answerParse(Number(e.key) - 1);
  else if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    if (item.phase === 'read') $('pgo').click();
    else if (item.phase === 'done') nextParse();
  }
});

// --- 粗読みモード: 文章を1題、時間を計って通読し、要旨と流れを答える ---
/** いまの段階（1: 短い / 2: 中くらい / 3: 京大型） */
let skimLevel = Math.min(3, Math.max(1, load<number>('skimLevel', 1)));
/** 読んだ文章の記録（題材 → 読む速さと、要旨を取れたか） */
const skimDone = load<Record<string, { wpm: number; ok: boolean }>>('skimDone', {});
interface Skim {
  p: Passage;
  words: number;
  phase: 'read' | 'gist' | 'check' | 'done';
  start: number;
  readMs: number;
  gist: string[];
  check: string[];
  gistPick: number | null;
  checkPick: number | null;
  score: number;
}
let skim: Skim | null = null;
let skimTimer = 0;
let skimLast = '';
/** これより速いのは、読まずに進めたと見なす（速さの加点も段階の昇格もなし） */
const SKIM_MAX_WPM = 450;
const shuffled = <T>(a: readonly T[]) => [...a].sort(() => Math.random() - 0.5);
const clock = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}`;

function startSkim(): void {
  // いまの段階で、まだ読んでいない文章を優先。なければ近い段階、それもなければ読んだものをもう一度
  const byNear = (list: Passage[]) => {
    for (let d = 0; d < 3; d++) {
      const hit = list.filter((x) => Math.abs(x.level - skimLevel) === d);
      if (hit.length) return hit;
    }
    return [];
  };
  let pool = byNear(PASSAGES.filter((x) => !skimDone[x.title]));
  if (!pool.length) pool = byNear(PASSAGES.filter((x) => x.title !== skimLast));
  const p = pool[Math.floor(Math.random() * pool.length)];
  skimLast = p.title;
  skim = {
    p,
    words: p.paragraphs.join(' ').split(/\s+/).length,
    phase: 'read',
    start: performance.now(),
    readMs: 0,
    gist: shuffled(p.gist.options),
    check: shuffled(p.check.options),
    gistPick: null,
    checkPick: null,
    score: 0,
  };
  clearInterval(skimTimer);
  skimTimer = window.setInterval(() => {
    if (skim?.phase === 'read' && !$('skim').hidden) $('stime').textContent = clock(performance.now() - skim.start);
  }, 1000);
  show('skim');
  renderSkim();
}

function renderSkim(): void {
  const k = skim;
  if (!k) return;
  const { p } = k;
  const goalMs = (k.words / PACE_WPM) * 60000;
  $('slevel').textContent = PASSAGE_LEVEL[p.level];
  $('swords').textContent = String(k.words);
  $('stime').textContent = clock(k.phase === 'read' ? performance.now() - k.start : k.readMs);
  $('sgoal').textContent = `目安 ${clock(goalMs)}`;
  const asking = k.phase === 'gist' || k.phase === 'check';
  $('sask').hidden = !asking;
  $('skind').textContent = k.phase === 'gist' ? '問1　この文章の要旨はどれ？' : '問2　文章の流れ';
  const q = $('sq');
  q.hidden = k.phase !== 'check';
  q.textContent = p.check.q;
  const options = k.phase === 'gist' ? k.gist : k.check;
  $('schoices').replaceChildren(
    ...(asking
      ? options.map((o, i) => {
          const b = el('button', 'choice');
          b.append(el('span', 'key', String(i + 1)), el('span', 'g', o));
          b.onclick = () => answerSkim(i);
          return b;
        })
      : []),
  );
  // 答えるあいだは本文を隠す（読み返さずに、頭に残った骨組みで答える）
  const text = $('stext');
  text.hidden = asking;
  if (text.dataset.title !== p.title) {
    text.dataset.title = p.title;
    text.replaceChildren(...p.paragraphs.map((t) => el('p', '', t)));
  }
  $('sgo').hidden = k.phase !== 'read';
  $('snext').hidden = k.phase !== 'done';
  const review = $('sreview');
  review.hidden = k.phase !== 'done';
  $('stexthead').hidden = k.phase !== 'done';
  if (k.phase === 'done') review.replaceChildren(...skimReview(k, goalMs));
  $('snote').textContent =
    k.phase === 'read'
      ? '訳さず、戻らずに最後まで読む。段落ごとに「何をしている段落か」だけ押さえる。読み終えたら下のボタン。'
      : asking
        ? `読むのに ${clock(k.readMs)}（1分あたり ${Math.round(k.words / (k.readMs / 60000))}語）。本文は見ずに答える。1〜${options.length}のキーでも選べる。`
        : '';
}

/** 答え合わせ: 速さ、2問の正誤と理由、日本語の要旨、段落ごとの役割 */
function skimReview(k: Skim, goalMs: number): HTMLElement[] {
  const { p } = k;
  const wpm = Math.round(k.words / (k.readMs / 60000));
  const gistOk = k.gist[k.gistPick ?? -1] === p.gist.options[0];
  const checkOk = k.check[k.checkPick ?? -1] === p.check.options[0];
  const head = el('div', 'card sresult');
  const row = (label: string, value: string) => {
    const d = el('div');
    d.append(el('span', '', label), el('b', '', value));
    return d;
  };
  head.append(
    row('題材', p.title),
    row(`読む時間（目安 ${clock(goalMs)}）`, `${clock(k.readMs)}${wpm > SKIM_MAX_WPM ? '' : k.readMs <= goalMs ? '　目安内' : '　目安より遅い'}`),
    row(`速さ（目安 ${PACE_WPM}語/分）`, wpm > SKIM_MAX_WPM ? `${wpm}語/分　速すぎるので読んだと見なさない` : `${wpm}語/分`),
    row('要旨', gistOk ? '取れた' : '外した'),
    row('流れ', checkOk ? '取れた' : '外した'),
    row('得点', String(k.score)),
  );
  const list = (options: string[], pick: number | null, right: string, why?: (o: string) => string) => {
    const ul = el('ul', 'sopts');
    for (const [i, o] of options.entries()) {
      const li = el('li', o === right ? 'right' : i === pick ? 'wrong' : '');
      li.append(el('span', 'mark', o === right ? '○' : i === pick ? '×' : '・'), el('span', 'en', o));
      if (i === pick) li.append(el('span', 'you', 'あなたの答え'));
      if (why) li.append(el('span', 'why', why(o)));
      ul.append(li);
    }
    return ul;
  };
  const outline = el('ol', 'soutline');
  p.outline.forEach((t) => outline.append(el('li', '', t)));
  const flow = el('p', 'sq', p.check.q);
  flow.lang = 'en';
  return [
    head,
    el('h2', '', '問1　要旨'),
    list(k.gist, k.gistPick, p.gist.options[0], (o) => p.gist.why[p.gist.options.indexOf(o)]),
    el('h2', '', '問2　流れ'),
    flow,
    list(k.check, k.checkPick, p.check.options[0]),
    el('p', 'note', p.check.note),
    el('h2', '', '要旨（日本語）'),
    el('p', 'ssum', p.summary),
    el('h2', '', '段落ごとの役割'),
    outline,
  ];
}

function answerSkim(i: number): void {
  const k = skim;
  if (!k) return;
  if (k.phase === 'gist') {
    k.gistPick = i;
    k.phase = 'check';
    renderSkim();
    return;
  }
  if (k.phase !== 'check') return;
  k.checkPick = i;
  k.phase = 'done';
  const { p } = k;
  const wpm = Math.round(k.words / (k.readMs / 60000));
  const gistOk = k.gist[k.gistPick ?? -1] === p.gist.options[0];
  const checkOk = k.check[i] === p.check.options[0];
  // 速さの加点は、要旨が取れたときだけ（読まずに進めても得をしない）
  const read = wpm <= SKIM_MAX_WPM;
  k.score = ((gistOk ? 300 : 0) + (checkOk ? 150 : 0) + (gistOk && read ? Math.max(0, Math.min(150, wpm - 60)) : 0)) * p.level;
  const old = skimDone[p.title];
  if (!old || gistOk || !old.ok) skimDone[p.title] = { wpm, ok: gistOk };
  if (gistOk && checkOk && read && wpm >= PACE_WPM && skimLevel < 3) skimLevel++;
  else if (!gistOk && skimLevel > 1) skimLevel--;
  save('skimDone', skimDone);
  save('skimLevel', skimLevel);
  if (gistOk) sfx.mission();
  else sfx.bad();
  const { before } = account(k.score);
  renderSkim();
  window.scrollTo(0, 0);
  levelUpNotice(before);
}

$('sgo').onclick = () => {
  if (!skim || skim.phase !== 'read') return;
  skim.readMs = Math.max(1000, performance.now() - skim.start);
  skim.phase = 'gist';
  renderSkim();
  window.scrollTo(0, 0);
};
$('snext').onclick = () => {
  startSkim();
  window.scrollTo(0, 0);
};
$('squit').onclick = () => {
  clearInterval(skimTimer);
  skim = null;
  renderHome();
  show('home');
};
document.addEventListener('keydown', (e) => {
  if ($('skim').hidden || !skim) return;
  if ((skim.phase === 'gist' || skim.phase === 'check') && /^[1-4]$/.test(e.key)) {
    const n = Number(e.key) - 1;
    if (n < (skim.phase === 'gist' ? 4 : 3)) answerSkim(n);
  }
});

// --- 分析データを見る ---
type Exam = 'kyodai' | 'kyote';
const POS_NAME: Record<string, string> = { n: '名', v: '動', a: '形', r: '副' };
let statExam: Exam = 'kyodai';
let statShown = 60;

function renderStats(): void {
  const d = analysis[statExam];
  const table = (head: string[], rows: string[][]) => {
    const t = el('table');
    const tr = el('tr');
    head.forEach((h) => tr.append(el('th', '', h)));
    t.append(tr);
    for (const r of rows) {
      const line = el('tr');
      r.forEach((c, i) => line.append(el(i ? 'td' : 'th', '', c)));
      t.append(line);
    }
    return t;
  };
  $('statexam').replaceChildren(
    ...(['kyodai', 'kyote'] as Exam[]).map((x) => {
      const b = el('button', '', x === 'kyodai' ? '京大' : '共テ・センター');
      b.setAttribute('aria-pressed', String(x === statExam));
      b.onclick = () => {
        statExam = x;
        statShown = 60;
        renderStats();
      };
      return b;
    }),
  );
  $('statsum').textContent = `${d.title} ${d.years[0]}〜${d.years[1]}年度の問題を読み取って数えた、延べ ${d.tokens.toLocaleString()} 語の集計。`;

  // 1. 語のレベル
  $('statlevels').replaceChildren(
    ...Object.entries(d.levels).map(([lv, pct]) => {
      const row = el('div', 'zrow');
      const track = el('span', 'bar');
      const fill = el('i');
      fill.style.width = `${pct}%`;
      track.append(fill);
      row.append(el('span', '', lv), track, el('span', '', `${pct}%`));
      return row;
    }),
  );
  $('stattypes').textContent =
    '難しい語の種類数: ' +
    Object.entries(d.types)
      .map(([g, v]) => `${g} ${v.n}語（うち1年度だけ ${v.once}%）`)
      .join('、') +
    '。';

  // 2. 出題歴と、次に出る確率
  $('statrepeat').replaceChildren(
    table(
      ['一般的な頻度', ...d.repeat.history],
      d.repeat.bands.map((b, i) => [b, ...d.repeat.rate[i].map((v) => (v === null ? '−' : `${v}%`))]),
    ),
  );
  $('statrepeatnote').textContent = `難しい語が、ある年度の問題に出る確率（${d.repeat.from}〜${d.years[1]}年度）。左の列ほど出題歴が少ない。一度出た語は、出たことのない語の何倍も出やすい。`;

  // 3. 予測の検証
  $('statmodel').replaceChildren(
    table(
      ['予測の上位', '実際に出た割合', '出た難語のうち拾えた割合', 'でたらめに選ぶ場合との比'],
      d.model.rows.map((r) => [`${r.top}%`, `${r.hit}%`, `${r.share}%`, `${r.lift}倍`]),
    ),
  );
  $('statmodelnote').textContent = `${d.model.train[0]}〜${d.model.train[1]}年度で作った予測を、使っていない ${d.model.test[0]}〜${d.model.test[1]}年度で確かめた結果。難語が1年度に出る割合は平均 ${d.model.base}%。`;

  // 3b. 別の試験に出た語は、この試験にも出やすいか
  const peers = ('peers' in d ? d.peers : []) as { label: string; from: number; rows: { band: string; own: string; rate: (number | null)[]; n: number[] }[] }[];
  $('statpeerhead').hidden = !peers.length;
  $('statpeers').replaceChildren(
    ...peers.flatMap((p) => [
      el('p', 'note', `${p.label}に出た語が、${d.title}に出る確率（${p.from}〜${d.years[1]}年度）。一般的な頻度と、${d.title}での出題歴が同じ語どうしで比べる。`),
      table(
        ['一般的な頻度', `${d.title}での出題歴`, `${p.label}に出ていない`, `${p.label}に出た`],
        p.rows.map((r) => [r.band, r.own.replace('出題歴', ''), ...r.rate.map((v) => (v === null ? '−' : `${v}%`))]),
      ),
    ]),
  );

  // 4. 覚える価値の高い語
  const value = (w: Word) => (statExam === 'kyodai' ? w.value : w.ctValue);
  const q = $<HTMLInputElement>('statq').value.trim().toLowerCase();
  const ranked = WORDS.filter((w) => value(w) > 0).sort((a, b) => value(b) - value(a));
  const hits = ranked.map((w, i) => ({ w, rank: i + 1 })).filter(({ w }) => !q || w.text.includes(q) || w.gloss.includes(q));
  $('statcount').textContent = `${hits.length.toLocaleString()} 語（全 ${ranked.length.toLocaleString()} 語を、覚える価値の高い順に並べてある）`;
  $('statwords').replaceChildren(
    ...hits.slice(0, statShown).map(({ w, rank }) => {
      const li = el('li');
      const state = learned[w.text] && !missed.has(w.text) ? '覚えた' : isFluent(w.text) ? '瞬時' : '';
      li.append(
        el('span', 'rank', String(rank)),
        el('span', 'word', w.text),
        el('span', 'tier', `${w.cefr}・${[...w.pos].map((c) => POS_NAME[c]).join('')}`),
        ...(hasPast(w) ? [el('span', 'past', pastLabel(w))] : []),
        ...(state ? [el('span', 'tag', state)] : []),
        el('span', 'g', w.gloss),
      );
      return li;
    }),
  );
  $('statmore').hidden = hits.length <= statShown;
}
$('tostats').onclick = () => {
  show('stats');
  renderStats();
};
$('statback').onclick = () => {
  renderHome();
  show('home');
};
$('statq').oninput = () => {
  statShown = 60;
  renderStats();
};
$('statmore').onclick = () => {
  statShown += 120;
  renderStats();
};

// --- 喰らうモード ---
let eater: Eater;
let hintCell: [number, number] | null = null;
const eboardEl = $('eboard');

function startEat(s: Setup): void {
  const L = LEVELS[s.level];
  eater = new Eater(
    {
      mode: s.mode,
      ...lengths('eat', s.level),
      newWords: DEFAULTS.newWords,
      cueLetters: L.cue,
      relearn: s.relearn.map((w) => WORD_MAP.get(w)!),
      recall: s.recall.map((w) => WORD_MAP.get(w)!),
      isNew,
    },
    makeRng(s.seed),
  );
  hintCell = null;
  show('eat');
  renderEat();
}

function renderEat(note = ''): void {
  $('escore').textContent = String(eater.score);
  $('estep').textContent = String(Math.min(eater.current + 1, eater.tasks.length));
  $('esteps').textContent = `/ ${eater.tasks.length}`;
  $('elives').textContent = SIGN.ankh.repeat(Math.max(0, eater.lives));
  $('ecombo').textContent = String(eater.combo);
  const t = eater.task;
  drawMission($('emission'), t, t ? eater.cue(t) : '', t?.shown ? '見ながら食べる' : '思い出して食べる');
  drawTrail($('etrail'), eater.tasks.slice(0, eater.current));

  const cells: HTMLElement[] = [];
  for (let r = 0; r < eater.size; r++) {
    for (let c = 0; c < eater.size; c++) {
      const ch = eater.grid[r][c];
      const d = el('div');
      const cls = ['cell'];
      if (r === eater.pos[0] && c === eater.pos[1]) {
        cls.push('god');
        d.style.backgroundImage = `url(${ICON})`;
        d.setAttribute('aria-label', '文字食い邪神');
      } else if (ch) {
        lettered(d, ch);
        if (eater.spat[r][c]) cls.push('spat');
        if (hintCell?.[0] === r && hintCell[1] === c) cls.push('hintcell');
      } else cls.push('eaten');
      d.className = cls.join(' ');
      d.dataset.k = `${r},${c}`;
      cells.push(d);
    }
  }
  eboardEl.replaceChildren(...cells);

  $('efeed').replaceChildren(
    el('div', 'hint', note || (t?.shown ? 'つづりの順に、隣の文字へ進め。' : '次の1文字はどれだ。違う文字には進めず、命が減る。')),
  );
  const live = !!t && t.state === 'todo' && !busy && !ending;
  $('ehint').textContent = t?.shown ? '知ってる' : 'ヒント';
  $<HTMLButtonElement>('ehint').disabled = !live;
  $<HTMLButtonElement>('eskip').disabled = !live;
}

function eatMove(dr: number, dc: number): void {
  if ($('eat').hidden || busy || ending) return;
  const step = eater.move(dr, dc);
  if (step.kind === 'blocked') return;
  if (step.kind === 'walk') {
    renderEat();
    return;
  }
  if (step.kind === 'wrong') {
    sfx.bad();
    if (step.failed) failEat();
    else renderEat(`${step.ch.toUpperCase()} ではない。命が1つ減った。`);
    return;
  }
  // 正しい文字を食べた
  hintCell = null;
  sfx.note(eater.progress - 1);
  if (!step.done) {
    renderEat();
    return;
  }

  // 語を食べ切った
  const t = eater.task!;
  busy = true;
  if (!zukan.has(t.word.text)) {
    zukan.add(t.word.text);
    save('zukan', [...zukan]);
  }
  const got: string[] = ['first'];
  if (!t.shown && t.hints === 0 && t.word.tier === 2) got.push('kyodai');
  earn(got);
  sfx.mission();
  renderEat(`食べ切った。+${step.bonus}`);
  answerCard(eboardEl, t, t.shown ? '食べた。あとでもう一度出る' : t.hints ? 'ヒントで思い出した' : '自力で思い出した');
  setTimeout(nextEat, DONE_PAUSE);
}

/** 正解を見せてから次のお題へ */
function failEat(): void {
  const t = eater.task;
  if (!t) return;
  busy = true;
  renderEat('正解を見て、次へ。');
  answerCard(eboardEl, t, '正解はこれ。次の局でもう一度', 'recall');
  setTimeout(nextEat, DONE_PAUSE);
}

function nextEat(): void {
  eater.advance();
  busy = false;
  hintCell = null;
  if (eater.over) {
    ending = true;
    setTimeout(endEat, 300);
    return;
  }
  renderEat();
}

function endEat(): void {
  const s = eater.settle();
  const rows: [string, string][] = [[`食べた得点（最大${eater.maxCombo}連食）`, `${eater.score}`]];
  if (eater.wrongs) rows.push(['間違えて吐き出した回数', `${eater.wrongs}回`]);
  if (s.allSolo) rows.push(['全部ヒントなしで思い出した', `+${s.allSolo}`]);
  finish({
    tasks: eater.tasks,
    total: s.total,
    recalls: s.recalls,
    solo: s.solo,
    rows,
    extra: eater.wrongs === 0 && eater.tasks.every((t) => t.state === 'done') ? ['glutton'] : [],
    found: [],
  });
}

for (const [id, dr, dc] of [['up', -1, 0], ['down', 1, 0], ['left', 0, -1], ['right', 0, 1]] as const) {
  $(id).onclick = () => eatMove(dr, dc);
}
document.addEventListener('keydown', (e) => {
  const dir: Record<string, [number, number]> = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
  if ($('eat').hidden || !dir[e.key] || e.ctrlKey || e.metaKey || e.altKey) return;
  e.preventDefault();
  eatMove(...dir[e.key]);
});
// 壁の上のスワイプでも動かせる
let swipe: { x: number; y: number } | null = null;
eboardEl.addEventListener('pointerdown', (e) => (swipe = { x: e.clientX, y: e.clientY }));
eboardEl.addEventListener('pointerup', (e) => {
  if (!swipe) return;
  const dx = e.clientX - swipe.x;
  const dy = e.clientY - swipe.y;
  swipe = null;
  if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return;
  if (Math.abs(dx) > Math.abs(dy)) eatMove(0, dx > 0 ? 1 : -1);
  else eatMove(dy > 0 ? 1 : -1, 0);
});
$('ehint').onclick = () => {
  if (busy || ending) return;
  const cur = eater.task;
  if (cur?.shown && cur.state === 'todo') {
    const note = knowWord(eater.tasks, cur, (next) => eater.swap(next));
    hintCell = null;
    renderEat(note);
    return;
  }
  hintCell = eater.hint();
  sfx.bet();
  renderEat(eater.task?.shown ? '次のマスを光らせた。' : '次のマスを光らせた。このお題は「自力」ではなくなる。');
};
$('eskip').onclick = () => {
  if (busy || ending || !eater.skip()) return;
  sfx.bad();
  failEat();
};
$('equit').onclick = () => {
  if (ending || busy) return;
  if (eater.score === 0) {
    renderHome();
    show('home');
    return;
  }
  ending = true;
  endEat();
};

// --- ★の文字選び ---
let pickFor = -1;
let pickAt: Pos = { r: 0, c: 0 };
function openPicker(i: number, at: Pos): void {
  pickFor = i;
  pickAt = at;
  $('picker').hidden = false;
}
$('letters').replaceChildren(
  ...[...'abcdefghijklmnopqrstuvwxyz'].map((ch) => {
    const b = el('button');
    lettered(b, ch);
    b.onclick = () => {
      $('picker').hidden = true;
      doPlace(pickFor, pickAt, ch);
    };
    return b;
  }),
);
$('pickcancel').onclick = () => ($('picker').hidden = true);

// --- 描画 ---
/** 京大の過去問に出た年度の書き方: 「京大過去問 2回（'07 '15）」 */
const pastLabel = (w: Word) =>
  [
    // 年度は4回までなら並べる。それ以上は回数だけ
    w.years.length ? `京大 ${w.years.length}回${w.years.length <= 4 ? `（${w.years.map((y) => `'${String(y).padStart(2, '0')}`).join(' ')}）` : ''}` : '',
    w.osYears ? `阪大 ${w.osYears}回` : '',
    w.ctYears ? `共テ ${w.ctYears}回` : '',
  ]
    .filter(Boolean)
    .join('・');
const hasPast = (w: Word) => w.years.length > 0 || w.ctYears > 0 || w.osYears > 0;
/** いまのお題: 種類・層・つづり（伏せ字つき）・意味 */
function drawMission(panel: HTMLElement, t: Task | undefined, cue: string, label: string): void {
  panel.className = `mission ${!t ? 'idle' : t.state === 'done' ? 'done' : t.shown ? 'shown' : 'recall'}`;
  if (!t) return;
  panel.querySelector('.kind')!.textContent = !t.shown && t.hints ? `${label}（ヒント${t.hints}）` : label;
  panel.querySelector('.tier')!.textContent = TIER_LABEL[t.word.tier];
  const past = panel.querySelector<HTMLElement>('.past')!;
  past.hidden = !hasPast(t.word);
  past.textContent = pastLabel(t.word);
  const word = panel.querySelector('.mword')!;
  word.replaceChildren();
  for (const ch of cue) {
    const box = el('span', ch === '·' ? 'slot hidden' : 'slot');
    if (ch !== '·') lettered(box, ch);
    word.append(box);
  }
  panel.querySelector('.mgloss')!.textContent = t.word.gloss;
}
/** これまでのお題: 字形だけを並べる（つづりは見せない） */
function drawTrail(host: HTMLElement, tasks: Task[]): void {
  host.replaceChildren(
    ...tasks.map((x) => {
      const ok = x.state === 'done' && (x.shown || x.hints === 0);
      return el('span', `gl ${x.state === 'skipped' ? 'ng' : ok ? 'ok' : 'half'}`, spell(x.word.text));
    }),
  );
}

function renderPlay(note = ''): void {
  $('score').textContent = String(game.score);
  $('step').textContent = String(Math.min(game.current + 1, game.tasks.length));
  $('steps').textContent = `/ ${game.tasks.length}`;
  $('chain').textContent = String(game.maxChain);

  const t = game.task;
  drawMission($('mission'), t, t ? game.cue(t) : '', t?.shown ? '見ながら作る' : '思い出す');
  drawTrail($('trail'), game.tasks.slice(0, game.current));

  // 盤面
  const pending = new Set((game.pending ?? []).map(([r, c]) => `${r},${c}`));
  const cells: HTMLElement[] = [];
  for (let r = 0; r < game.size; r++) {
    for (let c = 0; c < game.size; c++) {
      const ch = game.grid[r][c];
      const k = `${r},${c}`;
      const cls = ['cell'];
      const d = el('div');
      if (ch) {
        if (pending.has(k)) cls.push('won');
        else cls.push(game.lit[r][c] ? 'lit' : game.seed[r][c] ? 'seed' : 'wait');
        if (game.wild[r][c]) cls.push('star');
        lettered(d, ch);
        if (game.isWaiting(r, c)) d.onpointerdown = (e) => startDrag(e, { cell: { r, c } });
      } else {
        if (game.bonus[r][c] > 1) {
          cls.push(`b${game.bonus[r][c]}`);
          d.textContent = `×${game.bonus[r][c]}`;
        }
        cls.push('empty');
      }
      d.className = cls.join(' ');
      d.dataset.k = k;
      cells.push(d);
    }
  }
  boardEl.replaceChildren(...cells);

  // 直前の1手でできた単語
  const feed = $('feed');
  feed.replaceChildren();
  if (note) {
    feed.append(el('div', 'hint', note));
  } else if (!last) {
    feed.append(el('div', 'hint', '札をつかむと、単語ができるマスが光る。点線の文字は何度でも動かせる。'));
  } else if (!last.chain) {
    feed.append(el('div', 'hint', 'まだ単語になっていない。続きの文字を並べるか、つかんで動かせ。'));
  } else {
    const parts = [`+${last.total}`];
    if (last.chain > 1) parts.push(`${last.chain}連鎖 ×${last.chainMult}`);
    if (last.cellMult > 1) parts.push(`マス ×${last.cellMult}`);
    feed.append(el('div', 'sum', parts.join('　')));
    const order = { mission: 0, target: 1, plain: 2 };
    const ws = [...last.words].sort((a, b) => order[a.kind] - order[b.kind] || b.pts - a.pts);
    for (const w of ws.slice(0, 3)) {
      const line = el('div', `w ${w.kind}`);
      line.append(el('b', '', w.found.text));
      if (fresh.has(w.found.text)) line.append(el('span', 'new', 'NEW'));
      line.append(el('span', 'g', (w.found.mirrored ? '（逆読み）' : '') + gloss(w.found.text)), el('span', 'p', `${w.pts}`));
      feed.append(line);
    }
    if (ws.length > 3) feed.lastElementChild!.querySelector('.g')!.textContent += `　ほか${ws.length - 3}語`;
  }

  // 手札・NEXT
  $('hand').replaceChildren(
    ...game.hand.map((ch, i) => {
      const b = el('button', ch === WILD ? 'tile wild' : 'tile');
      if (ch === WILD) b.append(el('span', 'gl', SIGN.star));
      else lettered(b, ch);
      b.setAttribute('aria-label', ch === WILD ? '何にでもなる札' : ch);
      b.onpointerdown = (e) => startDrag(e, { hand: i });
      return b;
    }),
  );
  $('next').replaceChildren(...game.queue.slice(0, nextCount).map((ch) => el('i', '', ch === WILD ? '★' : ch)));

  const live = !!t && t.state === 'todo' && !busy && !ending;
  $('hint').textContent = t?.shown ? '知ってる' : 'ヒント';
  $<HTMLButtonElement>('hint').disabled = !live || (!t!.shown && !game.cue(t!).includes('·'));
  $<HTMLButtonElement>('skip').disabled = !t || t.state !== 'todo' || busy || ending;
  $('discards').textContent = String(game.discardsLeft);
  $('trash').classList.toggle('off', game.discardsLeft <= 0);
}

function renderHome(): void {
  const lv = levelOf(xp);
  $('lv').textContent = String(lv);
  $('title').textContent = titleOf(lv);
  $('xp').textContent = String(xp);
  $('xpbar').style.width = `${(100 * (xp - levelStart(lv))) / (levelStart(lv + 1) - levelStart(lv))}%`;
  $('games').textContent = String(games);
  $('streak').textContent = String(days.streak);
  $('best').textContent = String(best);
  $('missed').textContent = String(missed.size);
  $('learned').textContent = String(Object.keys(learned).length);
  $('modenote').textContent = MODE_NOTE[mode];
  $('levelnote').textContent = LEVELS[level].note;
  const dailyBest = boards[dailyKey()];
  $('kindnote').textContent = KINDS.find((k) => k.value === kind)!.note + (kind === 'tile' ? '' : ' 護符は使わない。');
  $('fluent').textContent = String(Object.keys(fluent).filter(isFluent).length);
  const drill = kind === 'read' || kind === 'parse' || kind === 'skim';
  $('daily').hidden = drill;
  $('dailynote').hidden = drill;
  $('start').textContent = kind === 'read' ? '20語を読む' : kind === 'parse' ? `10文を読み解く（いま 段階${parseLevel}: ${LEVEL_NAME[parseLevel]}）` : kind === 'skim' ? `1題を粗読みする（いま ${PASSAGE_LEVEL[skimLevel]}）` : 'ランダムな盤';
  $('dailynote').textContent =
    dailyBest === undefined
      ? '今日の盤は1日同じ並び。新しい語を3つ、見て作り、あとで思い出す。'
      : `今日の盤の自己ベスト ${dailyBest}点。もう一度挑むと、同じ語を思い出す練習になる。`;

  chosen = chosen.filter((id) => unlocked().some((a) => a.id === id));
  $('amulets').replaceChildren(
    ...AMULETS.map((a) => {
      const open = a.level <= lv;
      const b = el('button', open ? 'chip' : 'chip locked');
      const body = el('span');
      body.append(el('b', '', open ? a.name : '？？？'), el('span', 't', open ? a.text : `Lv ${a.level} で手に入る`));
      b.append(el('span', 'sign', open ? a.sign : SIGN.bolt), body);
      b.disabled = !open;
      b.setAttribute('aria-pressed', String(chosen.includes(a.id)));
      b.onclick = () => {
        if (chosen.includes(a.id)) chosen = chosen.filter((id) => id !== a.id);
        else chosen = [...chosen, a.id].slice(-MAX_AMULETS);
        save('amulets', chosen);
        renderHome();
      };
      return b;
    }),
  );

  $('inscount').textContent = `${earned.size} / ${INSCRIPTIONS.length}`;
  $('inscriptions').replaceChildren(
    ...INSCRIPTIONS.map((ins) => {
      const got = earned.has(ins.id);
      const t = el('div', got ? 'tablet got' : 'tablet');
      // 未解読のうちは、名前の代わりに字形の並びが見える
      t.append(got ? el('b', '', ins.name) : el('b', 'gl', spell(ins.id)), got ? ins.text : ins.hint);
      return t;
    }),
  );

  const bar = (label: string, got: number, total: number) => {
    const row = el('div', 'zrow');
    const track = el('span', 'bar');
    const fill = el('i');
    fill.style.width = `${(100 * got) / total}%`;
    track.append(fill);
    row.append(el('span', '', label), track, el('span', '', `${got} / ${total}`));
    return row;
  };
  // 京大の過去問に出た難しい語（B2以上と表外）のうち、自力で思い出せた語
  const exam = WORDS.filter((w) => w.value > 0 && w.years.length);
  $('zukan').replaceChildren(
    ...TIER_LABEL.map((label, tier) =>
      bar(label, [...zukan].filter((w) => WORD_MAP.get(w)!.tier === tier).length, WORDS.filter((w) => w.tier === tier).length),
    ),
    bar('京大過去問', exam.filter((w) => learned[w.text] && !missed.has(w.text)).length, exam.length),
  );
  $('zukannote').textContent = `上3行は盤面で作った語。「京大過去問」は、過去20年の京大英語に出た難しい語 ${exam.length} 語のうち、自力で思い出せた数。`;
}

function segment<T>(host: HTMLElement, items: { label: string; value: T }[], get: () => T, set: (v: T) => void): void {
  const draw = () => {
    host.replaceChildren(
      ...items.map(({ label, value }) => {
        const b = el('button', '', label);
        b.setAttribute('aria-pressed', String(get() === value));
        b.onclick = () => {
          set(value);
          draw();
          renderHome();
        };
        return b;
      }),
    );
  };
  draw();
}
segment(
  $('kinds'),
  KINDS.map((k) => ({ label: k.label, value: k.value })),
  () => kind,
  (k) => save('kind', (kind = k)),
);
segment(
  $('modes'),
  (Object.keys(MODE_LABEL) as Mode[]).map((m) => ({ label: MODE_LABEL[m], value: m })),
  () => mode,
  (m) => save('mode', (mode = m)),
);
segment(
  $('levels'),
  LEVELS.map((l, i) => ({ label: l.label, value: i })),
  () => level,
  (l) => save('level', (level = l)),
);

$('daily').onclick = () => startGame(newSetup(true));
$('start').onclick = () => startGame(newSetup(false));
$('again').onclick = () => startGame(newSetup(false));
$('retry').onclick = () => startGame({ ...setup, retry: true });
$('tohome').onclick = () => {
  renderHome();
  show('home');
};
$('quit').onclick = () => {
  if (ending || busy) return;
  if (game.placed === 0) {
    // 1枚も置いていなければ、記録を付けずに戻る
    renderHome();
    show('home');
    return;
  }
  ending = true;
  endGame();
};
$('hint').onclick = () => {
  if (busy || ending) return;
  const cur = game.task;
  if (cur?.shown && cur.state === 'todo') {
    const note = knowWord(game.tasks, cur, (next) => game.swap(next));
    last = null;
    renderPlay(note);
    return;
  }
  if (!game.hint()) return;
  last = null;
  sfx.bet();
  renderPlay('1文字見せた。このお題の得点は1.5倍になる。');
};
$('skip').onclick = () => {
  if (busy || ending) return;
  const t: Task | null = game.skip();
  if (!t) return;
  // 正解を見せてから次へ
  busy = true;
  sfx.bad();
  renderPlay();
  answerCard(boardEl, t, '正解はこれ。次の局でもう一度', 'recall');
  setTimeout(nextTask, DONE_PAUSE);
};
const soundBtn = $('sound');
const drawSound = () => {
  soundBtn.textContent = soundOn ? '音 ON' : '音 OFF';
  soundBtn.setAttribute('aria-pressed', String(soundOn));
};
soundBtn.onclick = () => {
  save('sound', (soundOn = !soundOn));
  setSound(soundOn);
  drawSound();
};
drawSound();

// 判定辞書: ページに埋め込まれていればそれを使い、なければ読み込む
const embedded = document.getElementById('valid-words');
const ready = embedded?.textContent
  ? Promise.resolve(embedded.textContent)
  : fetch(`${import.meta.env.BASE_URL}valid.txt`).then((r) => (r.ok ? r.text() : Promise.reject(new Error(String(r.status)))));
const starters = [$<HTMLButtonElement>('daily'), $<HTMLButtonElement>('start')];
starters.forEach((b) => (b.disabled = true));
ready
  .then((text) => {
    loadValid(text.trim());
    starters.forEach((b) => (b.disabled = false));
  })
  .catch(() => {
    $('dailynote').textContent = '辞書を読み込めなかった。ページを再読み込みしてくれ。';
  });
renderHome();
