import { HERO, ICON } from './art';
import { cellsOf } from './core/board';
import { DEFAULTS, Game, type Placement, WILD } from './core/game';
import { MODE_LABEL, type Mode, TIER_LABEL, WORDS, WORD_MAP, makeRng } from './core/words';
import { boom, burst, buzz, confetti, countUp, flashScreen, fly, popup, rays, ring, setSound, sfx, spotlight } from './fx';
import { SIGN, glyphOf, spell } from './glyphs';
import { AMULETS, INSCRIPTIONS, MAX_AMULETS, inscriptionsForPlacement, levelOf, levelStart, titleOf } from './meta';

const LEVELS = [
  { label: 'やさしい', turns: 38, wilds: 3, note: '38手・★3枚。待ちの9回に1回は外れる。' },
  { label: 'ふつう', turns: 34, wilds: 2, note: '34手・★2枚。待ちの6回に1回は外れる。' },
  { label: 'むずかしい', turns: 30, wilds: 1, note: '30手・★1枚。待ちの3回に1回は外れる。追うお題を絞れ。' },
];
const MODE_NOTE: Record<Mode, string> = {
  kyote: 'お題の7割が共通テスト水準（CEFR A1〜B1）。',
  nankan: 'お題の6割が難関大2次水準（CEFR B2）。',
  kyodai: 'お題の6割が京大水準（CEFR C1〜C2）。',
};
/** 1局のお題に混ぜる復習語の上限 */
const REVIEW_PER_GAME = 2;
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
let mode = load<Mode>('mode', 'kyote');
let level = load<number>('level', 1);
let xp = load<number>('xp', 0);
let games = load<number>('games', 0);
let best = load<number>('best', 0);
let soundOn = load<boolean>('sound', true);
let days = load<{ last: string; streak: number }>('days', { last: '', streak: 0 });
let chosen = load<string[]>('amulets', []);
/** 盤（並びの種・層・むずかしさ）ごとの自己ベスト */
let boards = load<Record<string, number>>('boards', {});
/** つづりを見た・作れなかったお題。あとの局でまた出す */
const missed = new Set(load<string[]>('missed', []).filter((w) => WORD_MAP.has(w)));
/** 自力でお題として作った回数。0回の語は、局の前につづりを見せる（知る → 思い出す） */
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
  seed: number;
  mode: Mode;
  level: number;
  amulets: string[];
  include: string[];
  daily: boolean;
  retry: boolean;
}
let setup: Setup;
let game: Game;
let nextCount = 2;
let fixing = false;
let openMission = -1;
let last: Placement | null = null;
let fresh = new Set<string>(); // 直前の1手で初めて図鑑に入った語
let drawn = 0; // 直前の1手で引いた枚数（手札の右端から数える）
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
const boardKey = (s: Setup) => `${s.seed}:${s.mode}:${s.level}`;
const dailySeed = () => hash(`${today()}|${mode}|${level}`);
const unlocked = () => AMULETS.filter((a) => a.level <= levelOf(xp));
const activeAmulets = () => unlocked().filter((a) => chosen.includes(a.id)).slice(0, MAX_AMULETS);

function show(view: 'home' | 'study' | 'play' | 'result'): void {
  for (const v of ['home', 'study', 'play', 'result']) $(v).hidden = v !== view;
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
      popup(appEl, appEl.clientWidth / 2, 150 + i * 44, `碑文を発見　${ins.name}`, 'found');
    }, 700 + i * 500);
  });
  save('inscriptions', [...earned]);
}

function newSetup(daily: boolean): Setup {
  const seed = daily ? dailySeed() : (Date.now() ^ (Math.random() * 2 ** 32)) >>> 0;
  // 今日の盤は誰がいつ開いても同じ並びにしたいので、復習語は混ぜない
  const pick = makeRng(seed ^ 0x9e3779b9);
  const include = daily
    ? []
    : [...missed]
        .filter((w) => w.length <= DEFAULTS.maxMissionLen)
        .map((w) => ({ w, k: pick() }))
        .sort((a, b) => a.k - b.k)
        .slice(0, REVIEW_PER_GAME)
        .map(({ w }) => w);
  if (!daily) {
    // 一度だけ作れた語を1つ混ぜて、今度はつづりを見ずに思い出せるか確かめる
    const once = Object.keys(learned).filter((w) => learned[w] === 1 && !missed.has(w) && WORD_MAP.has(w) && w.length <= DEFAULTS.maxMissionLen);
    if (once.length) include.push(once[Math.floor(pick() * once.length)]);
  }
  return { seed, mode, level, amulets: activeAmulets().map((a) => a.id), include, daily, retry: false };
}

function startGame(s: Setup): void {
  setup = s;
  const L = LEVELS[s.level];
  const opts = {
    wilds: L.wilds,
    turns: L.turns,
    fixes: DEFAULTS.fixes,
    bonus3: DEFAULTS.bonus3,
    handSize: DEFAULTS.handSize,
    deadPenalty: DEFAULTS.deadPenalty,
    mirror: false,
  };
  const amulets = AMULETS.filter((a) => s.amulets.includes(a.id));
  for (const a of amulets) a.apply(opts);
  nextCount = Math.max(2, ...amulets.map((a) => a.next ?? 0));
  game = new Game({ mode: s.mode, ...opts, include: s.include.map((w) => WORD_MAP.get(w)!) }, makeRng(s.seed), valid);
  fixing = false;
  openMission = -1;
  last = null;
  fresh = new Set();
  drawn = game.hand.length;
  ending = false;
  gameNew = [];
  fx.clear();
  renderStudy();
  show('study');
}

/** 知る: 局の前にお題を見せる。まだ自力で作ったことのない語はつづりも見せる */
function renderStudy(): void {
  const fresh = game.missions.filter((m) => !learned[m.word.text]).length;
  $('studynote').textContent = fresh
    ? `初めての語が${fresh}つある。つづりと意味を声に出して覚えろ。壁に向かったら、見えるのは意味と字数だけになる。`
    : '全部、前に自力で作った語だ。つづりは見せない。意味から思い出せ。';
  $('studylist').replaceChildren(
    ...game.missions.map((m) => {
      const known = !!learned[m.word.text];
      const li = el('li', known ? 'known' : 'new');
      const head = el('div', 'head');
      const word = el('span', 'word', known ? '？'.repeat(m.word.text.length) : m.word.text);
      head.append(word, el('span', 'gl', spell(m.word.text)), el('span', 'tier', TIER_LABEL[m.word.tier]));
      if (known) {
        const b = el('button', 'mini', '確かめる');
        b.onclick = () => {
          word.textContent = m.word.text;
          b.remove();
        };
        head.append(el('span', 'tag', `自力で${learned[m.word.text]}回`), b);
      } else {
        head.append(el('span', 'tag fresh', missed.has(m.word.text) ? '復習' : '初めて'));
      }
      li.append(head, el('div', 'g', m.word.gloss));
      return li;
    }),
  );
}
$('begin').onclick = () => {
  show('play');
  renderPlay();
};


// --- 操作 ---
function tapCell(r: number, c: number): void {
  if (ending) return;
  if (game.grid[r][c]) {
    if (!game.isWaiting(r, c)) return;
    if (!fixing) {
      last = null;
      renderPlay('待ちの文字は「手直し」を押してからタップすると拾える。');
      return;
    }
    fixing = false;
    if (game.pickUp(r, c)) {
      drawn = 1;
      last = null;
      sfx.bet();
    }
    renderPlay();
  }
}

function tapTile(i: number): void {
  if (suppressClick || ending || i >= game.hand.length) return;
  if (fixing) {
    fixing = false;
    const before = game.hand.length;
    if (game.discard(i)) {
      drawn = game.hand.length - before + 1;
      last = null;
      sfx.bet();
    }
    renderPlay();
    return;
  }
  last = null;
  renderPlay('手札はドラッグして、置きたいマスで離す。');
}

function doPlace(i: number, { r, c }: Pos, as?: string): void {
  const before = game.hand.length;
  const res = game.place(i, r, c, as);
  if (!res) return;
  drawn = game.hand.length - before + 1;
  last = res;
  celebrate(res);
  renderPlay();
  if (game.over) {
    ending = true;
    setTimeout(endGame, 700 + showTime(res));
  }
}

/** 連鎖の読み上げで、1語あたりにかける時間 */
const CALL_GAP = 190;
/** 単語ができたときの演出にかかる時間 */
const showTime = (res: Placement) => (res.chain ? res.chain * CALL_GAP + (res.cleared.length ? 2000 : 800) : 0);
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
  earn(inscriptionsForPlacement(res, game));
  buzz(res.cleared.length ? [20, 40, 20, 40, 60] : 12);

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

  // 読み上げのあと: 合計点、連鎖数、壁の揺れ。お題なら壁に光が走り、単語が大きく掲げられる
  setTimeout(() => {
    const cell = cellEl(res.r, res.c);
    const wall = boardEl.parentElement!;
    const power = Math.min(5, res.chain) + (res.cleared.length ? 2 : 0);
    if (cell) {
      const p = centre(cell);
      popup(appEl, p.x, p.y - 20, `+${res.total}`, res.total >= 300 ? 'pts big' : 'pts');
      if (res.chain >= 2) popup(appEl, p.x, p.y - 66, `${res.chain}連鎖！`, `chain slam c${Math.min(res.chain, 5)}`, 1500);
      burst(p.px, p.py, Math.min(220, 24 + power * 30));
      ring(p.px, p.py, 1 + power * 0.5);
      if (power >= 3) setTimeout(() => ring(p.px, p.py, 2 + power * 0.6), 110);
    }
    // 連鎖が大きいほど壁が強く揺れ、画面が光る
    if (res.chain >= 2 || res.cleared.length) {
      wall.style.setProperty('--amp', String(power));
      restart(wall, 'shake');
      boom(power / 3);
    }
    if (power >= 3) flashScreen(0.12 * power);
    if (!res.cleared.length) {
      sfx.word(res.chain);
      return;
    }
    // お題達成: 周りが暗くなり、光の筋を背に単語が叩きつけられる
    sfx.mission();
    restart($('shine'), 'on');
    const b = centre(boardEl);
    spotlight(b.px, b.py);
    rays(b.px, b.py);
    confetti();
    setTimeout(confetti, 350);
    for (const k of game.missionCells) {
      const n = boardEl.querySelector<HTMLElement>(`[data-k="${k}"]`);
      if (!n) continue;
      const q = centre(n);
      for (let t = 0; t < 5; t++) setTimeout(() => burst(q.px, q.py, 10), 200 + t * 160);
    }
    for (const w of res.cleared) {
      const big = el('div', 'bigword');
      big.append(el('span', 'gl', spell(w.text)), el('b', '', w.text), el('span', 'g', brief(w.gloss)), el('span', 'tag', 'お題達成'));
      big.style.left = `${b.x}px`;
      big.style.top = `${b.y}px`;
      appEl.append(big);
      setTimeout(() => {
        boom(1.6);
        flashScreen(0.5);
      }, 230);
      setTimeout(() => big.remove(), 1900);
    }
  }, ws.length * CALL_GAP);
}

// --- ドラッグで置く ---
let drag: { i: number; src: HTMLElement; ghost: HTMLElement | null; sx: number; sy: number; lift: number; over: HTMLElement | null } | null = null;
let suppressClick = false;
function startDrag(e: PointerEvent, i: number): void {
  if (ending || fixing || e.button > 0) return;
  // 指で隠れないよう、タッチのときは札を指の少し上に浮かせる
  drag = { i, src: e.currentTarget as HTMLElement, ghost: null, sx: e.clientX, sy: e.clientY, lift: e.pointerType === 'mouse' ? 0 : 44, over: null };
}
function endDrag(drop: boolean): void {
  const d = drag;
  drag = null;
  if (!d?.ghost) return;
  d.ghost.remove();
  d.src.classList.remove('lifted');
  d.over?.classList.remove('drop');
  suppressClick = true;
  setTimeout(() => (suppressClick = false), 60);
  if (!drop || !d.over) return;
  const [r, c] = d.over.dataset.k!.split(',').map(Number);
  if (game.hand[d.i] === WILD) openPicker(d.i, { r, c });
  else doPlace(d.i, { r, c });
}
document.addEventListener(
  'pointermove',
  (e) => {
    const d = drag;
    if (!d) return;
    if (!d.ghost) {
      if (Math.hypot(e.clientX - d.sx, e.clientY - d.sy) < 8) return;
      d.ghost = d.src.cloneNode(true) as HTMLElement;
      d.ghost.classList.add('ghost');
      d.ghost.style.width = `${d.src.offsetWidth}px`;
      d.ghost.style.height = `${d.src.offsetHeight}px`;
      document.body.append(d.ghost);
      d.src.classList.add('lifted');
    }
    e.preventDefault();
    const x = e.clientX;
    const y = e.clientY - d.lift;
    d.ghost.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%) rotate(-6deg) scale(1.15)`;
    const hit = document.elementFromPoint(x, y)?.closest<HTMLElement>('#board .cell') ?? null;
    const over = hit?.classList.contains('empty') ? hit : null; // 空きマスだけ
    if (over !== d.over) {
      d.over?.classList.remove('drop');
      over?.classList.add('drop');
      d.over = over;
    }
  },
  { passive: false },
);
document.addEventListener('pointerup', () => endDrag(true));
document.addEventListener('pointercancel', () => endDrag(false));

function endGame(): void {
  const s = game.settle();
  const before = levelOf(xp);
  xp += s.total;
  games += 1;
  best = Math.max(best, s.total);
  for (const m of game.missions) {
    if (m.done && !m.revealed) {
      missed.delete(m.word.text);
      learned[m.word.text] = (learned[m.word.text] ?? 0) + 1;
    } else missed.add(m.word.text);
  }
  if (days.last !== today()) {
    const yesterday = new Date(Date.now() - 864e5).toLocaleDateString('sv');
    days = { last: today(), streak: days.last === yesterday ? days.streak + 1 : 1 };
    save('days', days);
  }
  const key = boardKey(setup);
  const prev = boards[key];
  if (prev === undefined || s.total > prev) {
    delete boards[key];
    boards[key] = s.total;
    for (const old of Object.keys(boards).slice(0, -BOARDS_KEPT)) delete boards[old];
    save('boards', boards);
  }
  save('xp', xp);
  save('games', games);
  save('best', best);
  save('missed', [...missed]);
  save('learned', learned);

  // 評価は自力で達成したお題の数で決まる（全部知っている自動プレイの平均が4語）
  const solo = game.missions.filter((m) => m.done && !m.revealed).length;
  const grade = solo >= 5 ? 'S' : solo >= 4 ? 'A' : solo >= 2 ? 'B' : 'C';

  const got: string[] = [];
  if (game.missions.every((m) => m.done)) got.push('all');
  if (s.noDead) got.push('clean');
  if (grade === 'S' && setup.amulets.length === 0) got.push('bare');
  if (setup.retry && prev !== undefined && prev > 0 && s.total > prev) got.push('again');
  if (zukan.size >= 100) got.push('zukan100');
  if (zukan.size >= 500) got.push('zukan500');
  if (days.streak >= 3) got.push('days3');
  if (days.streak >= 7) got.push('days7');
  earn(got);

  $('resmode').textContent = `${setup.daily ? '今日の盤・' : ''}${MODE_LABEL[setup.mode]}・${LEVELS[setup.level].label}`;
  const g = $('grade');
  g.className = `grade g-${grade}`;
  g.textContent = grade;
  const row = (label: string, value: string) => {
    const d = el('div');
    d.append(el('span', '', label), el('b', '', value));
    return d;
  };
  const done = game.missions.filter((m) => m.done).length;
  const rows = [row(`単語の得点（最大${game.maxChain}連鎖）`, `${game.score}`)];
  if (game.best.total) rows.push(row(`最高の一手 ${game.best.word.toUpperCase()}`, `+${game.best.total}`));
  if (s.dead) rows.push(row(`待ちのまま終わった文字 ${s.dead}枚`, `−${s.penalty}`));
  if (s.allMissions) rows.push(row('お題を全部達成', `+${s.allMissions}`));
  if (s.noDead) rows.push(row('待ちゼロ', `+${s.noDead}`));
  rows.push(row(`合計（お題 ${done}/${game.missions.length}）`, `${s.total}`));
  $('resrows').replaceChildren(...rows);
  $('resrecord').textContent =
    prev === undefined
      ? 'この盤は初挑戦。同じ盤をやり直すと、置き方の違いがそのまま点差になる。'
      : s.total > prev
        ? `この盤の自己ベスト更新: ${prev} → ${s.total}`
        : `この盤の自己ベストは ${prev}点。今回は ${s.total}点。`;

  $('resnew').replaceChildren(
    ...gameNew.map((id) => {
      const ins = INSCRIPTIONS.find((x) => x.id === id)!;
      const t = el('div', 'tablet got');
      t.append(el('b', '', `碑文　${ins.name}`), ins.text);
      return t;
    }),
  );

  $('resmissions').replaceChildren(
    ...game.missions.map((m) => {
      const ok = m.done && !m.revealed;
      const li = el('li', ok ? 'ok' : 'ng');
      li.append(
        el('span', 'mark', ok ? '○' : m.done ? '△' : '×'),
        el('span', 'word', m.word.text),
        el('span', 'gl', spell(m.word.text)),
        el('span', 'tier', TIER_LABEL[m.word.tier]),
        el('span', 'g', m.word.gloss),
      );
      if (m.done && m.revealed) li.append(el('span', 'why luck', 'つづりを見て達成。復習に回る。'));
      if (!m.done) {
        const lack = game.shortfall(m.word.text);
        li.append(
          lack.length
            ? el('span', 'why luck', `${lack.map((ch) => ch.toUpperCase()).join('・')} が来なかった（運）`)
            : el('span', 'why skill', '文字は全部来ていた（腕で届く）'),
        );
      }
      return li;
    }),
  );
  const found = game.made.filter((m) => m.kind === 'target').map((m) => WORD_MAP.get(m.text)!);
  $('foundhead').textContent = `見つけた受験語（${found.length}語）`;
  $('resfound').replaceChildren(
    ...(found.length
      ? found.map((w) => {
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
    setTimeout(() => popup(appEl, appEl.clientWidth / 2, 110, `Lv ${lv}　${titleOf(lv)}${gift.length ? `　${gift.join('・')}を得た` : ''}`, 'banner'), 400);
  }
}

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
function renderPlay(note = ''): void {
  countUp($('score'), game.score);
  $('turns').textContent = String(game.turnsLeft);
  $('turns').parentElement!.classList.toggle('low', game.turnsLeft <= 5);
  $('chain').textContent = String(game.maxChain);
  $('play').classList.toggle('fixing', fixing);

  // お題
  $('missions').replaceChildren(
    ...game.missions.map((m, i) => {
      const open = openMission === i;
      const li = el('li', [m.done ? 'done' : '', open ? 'open' : ''].join(' ').trim());
      li.append(el('span', 'tier', TIER_LABEL[m.word.tier]));
      if (m.done || m.revealed) li.append(el('span', 'spell', m.word.text));
      li.append(el('span', 'gloss', open ? m.word.gloss : brief(m.word.gloss)));
      if (!m.done) li.append(el('span', 'len', `${m.word.text.length}字`));
      if (open && !m.done && !m.revealed) {
        const b = el('button', 'mini', 'つづりを見る（得点1/3）');
        b.onclick = (e) => {
          e.stopPropagation();
          game.reveal(i);
          renderPlay();
        };
        li.append(b);
      }
      li.onclick = () => {
        openMission = open ? -1 : i;
        renderPlay();
      };
      return li;
    }),
  );

  // 盤面
  const cells: HTMLElement[] = [];
  for (let r = 0; r < game.size; r++) {
    for (let c = 0; c < game.size; c++) {
      const ch = game.grid[r][c];
      const k = `${r},${c}`;
      const cls = ['cell'];
      const d = el('div');
      if (ch) {
        if (game.missionCells.includes(k)) cls.push('won');
        else cls.push(game.lit[r][c] ? 'lit' : game.seed[r][c] ? 'seed' : 'wait');
        if (game.wild[r][c]) cls.push('star');
        lettered(d, ch);
        if (game.isWaiting(r, c)) d.onclick = () => tapCell(r, c);
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
        const t = performance.now() - f.start;
        if (t < f.dur) d.style.animation = `${f.name} ${f.dur}ms ${-t}ms both`;
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
  } else if (fixing) {
    feed.append(el('div', 'hint', '手直し: 捨てる手札か、拾う待ちの文字をタップ（もう一度「手直し」でやめる）。'));
  } else if (!last) {
    feed.append(el('div', 'hint', '手札をドラッグして、置きたいマスで離す。'));
  } else if (!last.chain) {
    feed.append(el('div', 'hint', '待ち。この文字を含む単語ができれば色が付く。'));
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

  // 手札・NEXT・袋
  $('hand').replaceChildren(
    ...game.hand.map((ch, i) => {
      const b = el('button', ch === WILD ? 'tile wild' : 'tile');
      if (ch === WILD) b.append(el('span', 'gl', SIGN.star));
      else lettered(b, ch);
      if (i >= game.hand.length - drawn) b.classList.add('in');
      b.setAttribute('aria-label', ch === WILD ? '何にでもなる札' : ch);
      b.onclick = () => tapTile(i);
      b.onpointerdown = (e) => startDrag(e, i);
      return b;
    }),
  );
  drawn = 0;
  $('next').replaceChildren(...game.queue.slice(0, nextCount).map((ch) => el('i', '', ch === WILD ? '★' : ch)));
  const counts = new Map<string, number>();
  for (const ch of game.queue) counts.set(ch, (counts.get(ch) ?? 0) + 1);
  const coming = Math.max(0, Math.min(game.queue.length, game.turnsLeft));
  $('bag').replaceChildren(
    `袋 ${game.queue.length}枚（このうち来るのはあと${coming}枚）: `,
    el('b', '', [...counts].sort().map(([ch, n]) => (ch === WILD ? '★' : ch.toUpperCase()) + (n > 1 ? n : '')).join(' ')),
  );

  $<HTMLButtonElement>('undo').disabled = !game.canUndo || ending;
  $<HTMLButtonElement>('fix').disabled = game.fixesLeft <= 0 || ending;
  $('fix').setAttribute('aria-pressed', String(fixing));
  $('fixes').textContent = String(game.fixesLeft);
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
  const dailyBest = boards[`${dailySeed()}:${mode}:${level}`];
  $('dailynote').textContent =
    dailyBest === undefined
      ? '今日の盤は1日同じ並び。何度でもやり直して、置き方を磨ける。'
      : `今日の盤の自己ベスト ${dailyBest}点。もう一度挑んで更新を狙える。`;

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
  if (ending) return;
  if (game.placed === 0) {
    // 1枚も置いていなければ、記録を付けずに戻る
    renderHome();
    show('home');
    return;
  }
  ending = true;
  endGame();
};
$('undo').onclick = () => {
  if (ending || !game.undo()) return;
  last = null;
  fixing = false;
  renderPlay('1手もどした。');
};
$('fix').onclick = () => {
  fixing = !fixing;
  last = null;
  renderPlay();
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

// キーボード: Backspace で1手もどす
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Backspace' || $('play').hidden || ending || !$('picker').hidden) return;
  e.preventDefault();
  $('undo').click();
});

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
