import { HERO, ICON } from './art';
import { cellsOf } from './core/board';
import { Eater } from './core/eater';
import { DEFAULTS, Game, type Placement, type Task, WILD } from './core/game';
import { MODE_LABEL, type Mode, TIER_LABEL, WORDS, WORD_MAP, type Word, makeRng, sampleWord } from './core/words';
import { boom, burst, buzz, confetti, countUp, flashScreen, fly, popup, rays, ring, setSound, sfx, spotlight } from './fx';
import { SIGN, glyphOf, spell } from './glyphs';
import { AMULETS, INSCRIPTIONS, MAX_AMULETS, inscriptionsForPlacement, levelOf, levelStart, titleOf } from './meta';

type Kind = 'tile' | 'eat';
/** むずかしさ。お題の文字数の範囲は遊ぶ形で変わる（刻むは盤面の幅、喰らうは道の長さが上限） */
const LEVELS = [
  { label: 'やさしい', min: 4, tileMax: 6, eatMax: 6, cue: 2, wilds: 3, note: 'お題は4〜6文字。思い出すときは頭の2文字が見える。' },
  { label: 'ふつう', min: 5, tileMax: 7, eatMax: 8, cue: 1, wilds: 2, note: 'お題は5文字以上（刻むは7、喰らうは8文字まで）。思い出すときは頭の1文字が見える。' },
  { label: 'むずかしい', min: 6, tileMax: 8, eatMax: 10, cue: 0, wilds: 1, note: 'お題は6文字以上（刻むは8、喰らうは10文字まで）。思い出すときの手がかりは意味と字数だけ。' },
];
const lengths = (k: Kind, lv: number) => ({ minLen: LEVELS[lv].min, maxLen: k === 'eat' ? LEVELS[lv].eatMax : LEVELS[lv].tileMax });
const MODE_NOTE: Record<Mode, string> = {
  kyote: 'お題の6割が共通テスト水準（CEFR B1 中心）、3割が難関2次水準。中学初級の語は出ない。',
  nankan: 'お題の65%が難関大2次水準（CEFR B2）、25%が京大水準。',
  kyodai: 'お題の75%が京大水準（CEFR C1〜C2）、残りは難関2次水準。共テ水準の語は出ない。',
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
/** 1行に収めるための短い和訳: 最初の語義だけ、補足の括弧を外す */
const brief = (g: string) => g.split('／')[0].replace(/[〈〉]/g, '');
const gloss = (w: string) => WORD_MAP.get(w)?.gloss.split('／')[0] ?? glossOf.get(w) ?? '';

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
let drawn = 0; // 直前の1手で引いた枚数（手札の右端から数える）
let busy = false; // お題達成の演出中は置けない
let ending = false;
let gameNew: string[] = []; // この局で見つけた碑文
/** マスごとの演出。描き直しても途中から続くよう開始時刻で持つ */
const fx = new Map<string, { name: string; start: number; dur: number }>();

const today = () => new Date().toLocaleDateString('sv');
function hash(text: string): number {
  let h = 2166136261;
  for (const ch of text) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return h >>> 0;
}
const boardKey = (s: Pick<Setup, 'kind' | 'seed' | 'mode' | 'level'>) => `${s.seed}:${s.mode}:${s.level}${s.kind === 'eat' ? ':eat' : ''}`;
const dailySeed = () => hash(`${today()}|${mode}|${level}`);
const dailyKey = () => boardKey({ kind, seed: dailySeed(), mode, level });
const unlocked = () => AMULETS.filter((a) => a.level <= levelOf(xp));
const activeAmulets = () => unlocked().filter((a) => chosen.includes(a.id)).slice(0, MAX_AMULETS);

function show(view: 'home' | 'play' | 'eat' | 'result'): void {
  for (const v of ['home', 'play', 'eat', 'result']) $(v).hidden = v !== view;
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
      sfx.mission();
      popup(appEl, appEl.clientWidth / 2, 150 + i * 44, `碑文を発見　${ins.name}`, 'found', 2200);
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
  for (let tries = 0; tries < 400 && !next; tries++) {
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
  drawn = game.hand.length;
  fx.clear();
  show('play');
  renderPlay();
  announce(game.task, game.task ? game.cue(game.task) : '', boardEl);
}

/** 新しいお題を大きく見せる */
function announce(t: Task | undefined, cue: string, board: HTMLElement): void {
  if (!t) return;
  const b = centre(board);
  const card = el('div', t.shown ? 'bigword intro' : 'bigword intro recall');
  card.append(
    el('span', 'tag', t.shown ? '新しい言葉。つづりを見て覚えろ' : '思い出せ'),
    el('b', '', cue),
    el('span', 'g', brief(t.word.gloss)),
  );
  card.style.left = `${b.x}px`;
  card.style.top = `${b.y - board.offsetHeight * 0.26}px`; // 手元の盤面を隠さないよう上に寄せる
  appEl.append(card);
  setTimeout(() => card.remove(), 1200);
  if (t.shown) sfx.word(1);
  else sfx.bet();
}

// --- 置いたあとの処理 ---
function afterPlacement(res: Placement): void {
  last = res;
  celebrate(res);
  renderPlay();
  if (!res.task) return;
  // お題達成: 演出のあと、語が壁に吸い込まれて次のお題へ
  busy = true;
  setTimeout(nextTask, showTime(res));
}
function nextTask(): void {
  game.advance();
  busy = false;
  last = null;
  drawn = game.hand.length;
  if (game.over) {
    ending = true;
    renderPlay();
    setTimeout(endGame, 300);
    return;
  }
  renderPlay();
  announce(game.task, game.task ? game.cue(game.task) : '', boardEl);
}

function doPlace(i: number, { r, c }: Pos, as?: string): void {
  const before = game.hand.length;
  const res = game.place(i, r, c, as);
  if (!res) return;
  drawn = Math.max(0, game.hand.length - before + 1);
  afterPlacement(res);
}

/** 連鎖の読み上げで、1語あたりにかける時間 */
const CALL_GAP = 190;
/** 単語ができたときの演出にかかる時間 */
const showTime = (res: Placement) => (res.chain ? res.chain * CALL_GAP + (res.task ? 2000 : 800) : 0);
const cellEl = (r: number, c: number) => boardEl.querySelector<HTMLElement>(`[data-k="${r},${c}"]`);
/** 要素の中心。app 内の座標（ポップアップ用）と画面上の座標（粉用） */
function centre(node: HTMLElement) {
  const a = appEl.getBoundingClientRect();
  const b = node.getBoundingClientRect();
  return { x: b.left - a.left + b.width / 2, y: b.top - a.top + b.height / 2, px: b.left + b.width / 2, py: b.top + b.height / 2 };
}
function restart(node: HTMLElement, cls: string): void {
  node.classList.remove(cls);
  void node.offsetWidth;
  node.classList.add(cls);
}

function celebrate(res: Placement): void {
  const key = (r: number, c: number) => `${r},${c}`;
  fx.set(key(res.r, res.c), { name: 'pop', start: performance.now(), dur: 170 });
  fresh = new Set();
  if (!res.chain) {
    sfx.bet();
    return;
  }
  for (const [r, c] of res.lit) {
    if (r !== res.r || c !== res.c) fx.set(key(r, c), { name: 'revive', start: performance.now(), dur: 420 });
  }
  for (const w of res.words) {
    if (w.kind !== 'plain' && !zukan.has(w.found.text)) {
      zukan.add(w.found.text);
      fresh.add(w.found.text);
    }
  }
  if (fresh.size) save('zukan', [...zukan]);
  earn(inscriptionsForPlacement(res));
  buzz(res.task ? [20, 40, 20, 40, 60] : 12);

  // できた単語を短い順に1語ずつ読み上げる: マスが光り、単語が浮かび、粉が散り、音階が上がる
  const ws = [...res.words].sort((a, b) => a.found.text.length - b.found.text.length);
  ws.forEach((w, i) => {
    setTimeout(() => {
      const nodes = cellsOf(w.found).map(([r, c]) => cellEl(r, c)).filter((n): n is HTMLElement => !!n);
      nodes.forEach((n, k) => {
        n.style.animation = '';
        n.style.setProperty('--d', `${k * 28}ms`);
        restart(n, 'flash');
      });
      const mid = nodes[Math.floor(nodes.length / 2)];
      if (!mid) return;
      const p = centre(mid);
      popup(appEl, p.x, p.y, w.found.text.toUpperCase(), `call ${w.kind}`, 800);
      burst(p.px, p.py, w.kind === 'plain' ? 14 : 44);
      ring(p.px, p.py, w.kind === 'plain' ? 0.6 : 1);
      fly(p.px, p.py, $('score'), w.kind === 'plain' ? 3 : 9);
      sfx.note(i);
    }, i * CALL_GAP);
  });

  // 読み上げのあと: 合計点、連鎖数、壁の揺れ。お題なら周りが暗くなり、単語が叩きつけられる
  setTimeout(() => {
    const cell = cellEl(res.r, res.c);
    const wall = boardEl.parentElement!;
    const power = Math.min(5, res.chain) + (res.task ? 2 : 0);
    if (cell) {
      const p = centre(cell);
      popup(appEl, p.x, p.y - 20, `+${res.total}`, res.total >= 300 ? 'pts big' : 'pts');
      if (res.chain >= 2) popup(appEl, p.x, p.y - 66, `${res.chain}連鎖！`, `chain slam c${Math.min(res.chain, 5)}`, 1500);
      burst(p.px, p.py, Math.min(220, 24 + power * 30));
      ring(p.px, p.py, 1 + power * 0.5);
      if (power >= 3) setTimeout(() => ring(p.px, p.py, 2 + power * 0.6), 110);
    }
    if (res.chain >= 2 || res.task) {
      wall.style.setProperty('--amp', String(power));
      restart(wall, 'shake');
      boom(power / 3);
    }
    if (power >= 3) flashScreen(0.12 * power);
    const t = res.task;
    if (!t) {
      sfx.word(res.chain);
      return;
    }
    sfx.mission();
    restart($('shine'), 'on');
    const b = centre(boardEl);
    spotlight(b.px, b.py);
    rays(b.px, b.py);
    confetti();
    if (!t.shown) setTimeout(confetti, 350);
    for (const [r, c] of game.pending ?? []) {
      const n = cellEl(r, c);
      if (!n) continue;
      const q = centre(n);
      for (let k = 0; k < 5; k++) setTimeout(() => burst(q.px, q.py, 10), 200 + k * 160);
    }
    const big = el('div', 'bigword');
    const tag = t.shown ? '刻んだ。あとでもう一度出る' : t.hints ? 'ヒントで思い出した' : '自力で思い出した！';
    big.append(el('span', 'gl', spell(t.word.text)), el('b', '', t.word.text), el('span', 'g', brief(t.word.gloss)), el('span', 'tag', tag));
    big.style.left = `${b.x}px`;
    big.style.top = `${b.y}px`;
    appEl.append(big);
    setTimeout(() => {
      boom(1.6);
      flashScreen(0.5);
    }, 230);
    setTimeout(() => big.remove(), 1900);
  }, ws.length * CALL_GAP);
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
      const before = game.hand.length;
      if (game.discard(d.from.hand)) {
        drawn = Math.max(0, game.hand.length - before + 1);
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
      drawn = 1;
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

function finish(o: Outcome): void {
  const before = levelOf(xp);
  xp += o.total;
  games += 1;
  best = Math.max(best, o.total);
  // 思い出すお題の結果だけを記録する: 自力で思い出せたら「覚えた」、それ以外は覚え直し
  for (const t of o.tasks) {
    if (t.shown) continue;
    if (t.state === 'done' && t.hints === 0) {
      learned[t.word.text] = (learned[t.word.text] ?? 0) + 1;
      missed.delete(t.word.text);
    } else missed.add(t.word.text);
  }
  if (days.last !== today()) {
    const yesterday = new Date(Date.now() - 864e5).toLocaleDateString('sv');
    days = { last: today(), streak: days.last === yesterday ? days.streak + 1 : 1 };
    save('days', days);
  }
  const key = boardKey(setup);
  const prev = boards[key];
  if (prev === undefined || o.total > prev) {
    delete boards[key];
    boards[key] = o.total;
    for (const old of Object.keys(boards).slice(0, -BOARDS_KEPT)) delete boards[old];
    save('boards', boards);
  }
  save('xp', xp);
  save('games', games);
  save('best', best);
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
  if (grade === 'S' || grade === 'A') confetti();
  if (levelOf(xp) > before) {
    const lv = levelOf(xp);
    const gift = AMULETS.filter((a) => a.level > before && a.level <= lv).map((a) => `護符「${a.name}」`);
    setTimeout(() => popup(appEl, appEl.clientWidth / 2, 110, `Lv ${lv}　${titleOf(lv)}${gift.length ? `　${gift.join('・')}を得た` : ''}`, 'banner', 2200), 400);
  }
}

// --- 喰らうモード ---
let eater: Eater;
let hintCell: [number, number] | null = null;
let freshWall = true; // 壁を作り直した直後は、文字がめくれて現れる
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
  freshWall = true;
  show('eat');
  renderEat();
  announce(eater.task, eater.task ? eater.cue(eater.task) : '', eboardEl);
}

function renderEat(note = ''): void {
  countUp($('escore'), eater.score);
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
        if (freshWall) {
          cls.push('fresh');
          d.style.setProperty('--d', `${(Math.abs(r - eater.pos[0]) + Math.abs(c - eater.pos[1])) * 28}ms`);
        }
      } else cls.push('eaten');
      d.className = cls.join(' ');
      d.dataset.k = `${r},${c}`;
      cells.push(d);
    }
  }
  eboardEl.replaceChildren(...cells);
  freshWall = false;

  $('efeed').replaceChildren(
    el('div', 'hint', note || (t?.shown ? 'つづりの順に、隣の文字へ進め。' : '次の1文字はどれだ。違う文字には進めず、命が減る。')),
  );
  const live = !!t && t.state === 'todo' && !busy && !ending;
  $('ehint').textContent = t?.shown ? '知ってる' : 'ヒント';
  $<HTMLButtonElement>('ehint').disabled = !live;
  $<HTMLButtonElement>('eskip').disabled = !live;
}

const ecell = (r: number, c: number) => eboardEl.querySelector<HTMLElement>(`[data-k="${r},${c}"]`);

function eatMove(dr: number, dc: number): void {
  if ($('eat').hidden || busy || ending) return;
  const step = eater.move(dr, dc);
  if (step.kind === 'blocked') {
    const g = eboardEl.querySelector<HTMLElement>('.god');
    if (g) restart(g, 'bump');
    return;
  }
  if (step.kind === 'walk') {
    renderEat();
    return;
  }
  if (step.kind === 'wrong') {
    renderEat(`${step.ch.toUpperCase()} ではない。吐き出した。`);
    const n = ecell(step.r, step.c);
    if (n) {
      restart(n, 'no');
      const p = centre(n);
      popup(appEl, p.x, p.y, '×', 'call wrong', 700);
    }
    sfx.bad();
    buzz(60);
    boom(0.6);
    if (step.failed) failEat();
    return;
  }
  // 正しい文字を食べた
  hintCell = null;
  const from = ecell(step.r, step.c);
  const p = from ? centre(from) : null;
  renderEat();
  const g = eboardEl.querySelector<HTMLElement>('.god');
  if (g) restart(g, 'chomp');
  sfx.note(eater.progress - 1);
  buzz(10);
  if (p) {
    popup(appEl, p.x, p.y, step.ch.toUpperCase(), 'call target', 700);
    burst(p.px, p.py, 26 + Math.min(eater.combo, 10) * 4);
    ring(p.px, p.py, 0.7);
    fly(p.px, p.py, $('escore'), 4);
  }
  if (!step.done) return;

  // 語を食べ切った
  const t = eater.task!;
  busy = true;
  const wall = eboardEl.parentElement!;
  const b = centre(eboardEl);
  if (!zukan.has(t.word.text)) {
    zukan.add(t.word.text);
    save('zukan', [...zukan]);
  }
  const got: string[] = ['first'];
  if (!t.shown && t.hints === 0 && t.word.tier === 2) got.push('kyodai');
  earn(got);
  setTimeout(() => {
    sfx.mission();
    buzz([20, 40, 20, 40, 60]);
    wall.style.setProperty('--amp', '5');
    restart(wall, 'shake');
    restart($('eshine'), 'on');
    spotlight(b.px, b.py);
    rays(b.px, b.py);
    confetti();
    if (!t.shown) setTimeout(confetti, 350);
    burst(b.px, b.py, 160);
    ring(b.px, b.py, 3);
    popup(appEl, b.x, b.y - 110, `+${step.bonus}`, 'pts big', 1500);
    const big = el('div', 'bigword');
    const tag = t.shown ? '食べた。あとでもう一度出る' : t.hints ? 'ヒントで思い出した' : '自力で思い出した！';
    big.append(el('span', 'gl', spell(t.word.text)), el('b', '', t.word.text), el('span', 'g', brief(t.word.gloss)), el('span', 'tag', tag));
    big.style.left = `${b.x}px`;
    big.style.top = `${b.y}px`;
    appEl.append(big);
    setTimeout(() => {
      boom(1.6);
      flashScreen(0.5);
    }, 230);
    setTimeout(() => big.remove(), 1900);
  }, 180);
  setTimeout(nextEat, 2200);
}

/** 正解を見せてから次のお題へ */
function failEat(): void {
  const t = eater.task;
  if (!t) return;
  busy = true;
  const b = centre(eboardEl);
  const card = el('div', 'bigword intro recall');
  card.append(el('span', 'tag', '正解はこれ。次の局でもう一度'), el('span', 'gl', spell(t.word.text)), el('b', '', t.word.text), el('span', 'g', brief(t.word.gloss)));
  card.style.left = `${b.x}px`;
  card.style.top = `${b.y}px`;
  appEl.append(card);
  renderEat();
  setTimeout(() => {
    card.remove();
    nextEat();
  }, 1900);
}

function nextEat(): void {
  eater.advance();
  busy = false;
  hintCell = null;
  freshWall = true;
  if (eater.over) {
    ending = true;
    setTimeout(endEat, 300);
    return;
  }
  renderEat();
  announce(eater.task, eater.cue(eater.task!), eboardEl);
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
    freshWall = true;
    renderEat(note);
    announce(eater.task, eater.cue(eater.task!), eboardEl);
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
/** いまのお題: 種類・層・つづり（伏せ字つき）・意味 */
function drawMission(panel: HTMLElement, t: Task | undefined, cue: string, label: string): void {
  panel.className = `mission ${!t ? 'idle' : t.state === 'done' ? 'done' : t.shown ? 'shown' : 'recall'}`;
  if (!t) return;
  panel.querySelector('.kind')!.textContent = !t.shown && t.hints ? `${label}（ヒント${t.hints}）` : label;
  panel.querySelector('.tier')!.textContent = TIER_LABEL[t.word.tier];
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
  countUp($('score'), game.score);
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
      const f = fx.get(k);
      if (f) {
        const elapsed = performance.now() - f.start;
        if (elapsed < f.dur) d.style.animation = `${f.name} ${f.dur}ms ${-elapsed}ms both`;
        else fx.delete(k);
      }
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
      if (i >= game.hand.length - drawn) b.classList.add('in');
      b.setAttribute('aria-label', ch === WILD ? '何にでもなる札' : ch);
      b.onpointerdown = (e) => startDrag(e, { hand: i });
      return b;
    }),
  );
  drawn = 0;
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
  $('kindnote').textContent = KINDS.find((k) => k.value === kind)!.note + (kind === 'eat' ? ' 護符は使わない。' : '');
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

  $('zukan').replaceChildren(
    ...TIER_LABEL.map((label, tier) => {
      const total = WORDS.filter((w) => w.tier === tier).length;
      const got = [...zukan].filter((w) => WORD_MAP.get(w)!.tier === tier).length;
      const row = el('div', 'zrow');
      const bar = el('span', 'bar');
      const fill = el('i');
      fill.style.width = `${(100 * got) / total}%`;
      bar.append(fill);
      row.append(el('span', '', label), bar, el('span', '', `${got} / ${total}`));
      return row;
    }),
  );
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
    drawn = game.hand.length;
    renderPlay(note);
    announce(game.task, game.cue(game.task!), boardEl);
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
  const b = centre(boardEl);
  const card = el('div', 'bigword intro recall');
  card.append(el('span', 'tag', '正解はこれ。次の局でもう一度'), el('span', 'gl', spell(t.word.text)), el('b', '', t.word.text), el('span', 'g', brief(t.word.gloss)));
  card.style.left = `${b.x}px`;
  card.style.top = `${b.y}px`;
  appEl.append(card);
  sfx.bad();
  renderPlay();
  setTimeout(() => {
    card.remove();
    nextTask();
  }, 1900);
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
