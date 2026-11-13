import { HERO, ICON } from './art';
import { cellsOf } from './core/board';
import { DEFAULTS, Game, type Placement, WILD } from './core/game';
import { MODE_LABEL, type Mode, TIER_LABEL, WORDS, WORD_MAP, makeRng } from './core/words';
import { buzz, confetti, countUp, popup, setSound, sfx } from './fx';
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
let cursor: Pos | null = null;
let down = false; // 置いたあとカーソルが進む向き
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

function show(view: 'home' | 'play' | 'result'): void {
  for (const v of ['home', 'play', 'result']) $(v).hidden = v !== view;
  scrollTo(0, 0);
}

function nextEmpty(from: Pos, dr: number, dc: number): Pos | null {
  for (let r = from.r + dr, c = from.c + dc; r >= 0 && c >= 0 && r < game.size && c < game.size; r += dr, c += dc) {
    if (!game.grid[r][c]) return { r, c };
  }
  return null;
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
  down = false;
  fixing = false;
  openMission = -1;
  last = null;
  fresh = new Set();
  drawn = game.hand.length;
  ending = false;
  gameNew = [];
  fx.clear();
  cursor = nextEmpty({ r: 3, c: 1 }, 0, 1) ?? nextEmpty({ r: 0, c: -1 }, 0, 1);
  show('play');
  renderPlay();
}

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
      cursor = { r, c };
      sfx.bet();
    }
    renderPlay();
    return;
  }
  if (cursor?.r === r && cursor.c === c) down = !down; // 同じマスをもう一度 → 向きを切り替え
  else cursor = { r, c };
  renderPlay();
}

function tapTile(i: number): void {
  if (ending || i >= game.hand.length) return;
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
  if (!cursor) {
    last = null;
    renderPlay('置くマスを先にタップ。');
    return;
  }
  if (game.hand[i] === WILD) openPicker(i);
  else doPlace(i);
}

function doPlace(i: number, as?: string): void {
  if (!cursor) return;
  const { r, c } = cursor;
  const before = game.hand.length;
  const res = game.place(i, r, c, as);
  if (!res) return;
  drawn = game.hand.length - before + 1;
  last = res;
  cursor = nextEmpty({ r, c }, down ? 1 : 0, down ? 0 : 1);
  celebrate(res);
  renderPlay();
  if (game.over) {
    ending = true;
    setTimeout(endGame, res.chain ? 1500 : 700);
  }
}

function celebrate(res: Placement): void {
  const now = performance.now();
  const key = (r: number, c: number) => `${r},${c}`;
  fx.set(key(res.r, res.c), { name: 'pop', start: now, dur: 170 });
  fresh = new Set();
  if (!res.chain) {
    sfx.bet();
    return;
  }
  // 待ちだった文字が生き返り、いちばん長い単語の文字が順に跳ねる
  for (const [r, c] of res.lit) {
    if (r !== res.r || c !== res.c) fx.set(key(r, c), { name: 'revive', start: now, dur: 420 });
  }
  const longest = res.words.reduce((a, b) => (b.found.text.length > a.found.text.length ? b : a));
  cellsOf(longest.found).forEach(([r, c], i) => {
    const cur = fx.get(key(r, c));
    if (!cur || cur.name === 'pop') fx.set(key(r, c), { name: 'wave', start: now + i * 45, dur: 420 });
  });
  for (const w of res.words) {
    if (w.kind !== 'plain' && !zukan.has(w.found.text)) {
      zukan.add(w.found.text);
      fresh.add(w.found.text);
    }
  }
  if (fresh.size) save('zukan', [...zukan]);

  if (res.cleared.length) {
    sfx.mission();
    buzz([20, 40, 20]);
  } else {
    sfx.word(res.chain);
    buzz(12);
  }
  earn(inscriptionsForPlacement(res, game));
  requestAnimationFrame(() => {
    const cell = boardEl.querySelector<HTMLElement>(`[data-k="${res.r},${res.c}"]`);
    if (!cell) return;
    const a = appEl.getBoundingClientRect();
    const b = cell.getBoundingClientRect();
    const x = b.left - a.left + b.width / 2;
    const y = b.top - a.top;
    popup(appEl, x, y, `+${res.total}`, 'pts');
    if (res.chain >= 2) setTimeout(() => popup(appEl, x, y - 34, `${res.chain}連鎖！`, 'chain'), 120);
    if (res.cleared.length) {
      const names = res.cleared.map((w) => w.text.toUpperCase()).join('・');
      setTimeout(() => popup(appEl, appEl.clientWidth / 2, boardEl.offsetTop + 60, `お題達成　${names}`, 'banner'), 300);
      confetti();
    }
  });
}

function endGame(): void {
  const s = game.settle();
  const before = levelOf(xp);
  xp += s.total;
  games += 1;
  best = Math.max(best, s.total);
  for (const m of game.missions) {
    if (m.done && !m.revealed) missed.delete(m.word.text);
    else missed.add(m.word.text);
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
function openPicker(i: number): void {
  pickFor = i;
  $('picker').hidden = false;
}
$('letters').replaceChildren(
  ...[...'abcdefghijklmnopqrstuvwxyz'].map((ch) => {
    const b = el('button', '', ch);
    b.onclick = () => {
      $('picker').hidden = true;
      doPlace(pickFor, ch);
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
        d.textContent = ch;
        if (game.isWaiting(r, c)) d.onclick = () => tapCell(r, c);
      } else {
        if (game.bonus[r][c] > 1) {
          cls.push(`b${game.bonus[r][c]}`);
          d.textContent = `×${game.bonus[r][c]}`;
        }
        d.tabIndex = 0;
        d.setAttribute('role', 'button');
        d.setAttribute('aria-label', `${r + 1}行${c + 1}列`);
        d.onclick = () => tapCell(r, c);
      }
      if (cursor?.r === r && cursor.c === c) {
        cls.push('cur');
        d.dataset.dir = down ? '↓' : '→';
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
    feed.append(el('div', 'hint', 'マスを選んで手札をタップ。同じマスをもう一度タップで向きが変わる。'));
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
      const b = el('button', ch === WILD ? 'tile wild' : 'tile', ch === WILD ? '★' : ch);
      if (i >= game.hand.length - drawn) b.classList.add('in');
      b.setAttribute('aria-label', ch === WILD ? '何にでもなる札' : ch);
      b.onclick = () => tapTile(i);
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
  $('turn').textContent = down ? '向き ↓' : '向き →';
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
      b.append(el('span', 'sign', open ? a.sign : '封'), body);
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
      t.append(el('b', '', got ? ins.name : '？？？'), got ? ins.text : ins.hint);
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
$('turn').onclick = () => {
  down = !down;
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

// キーボード: 文字で置く、矢印でマス移動、スペースで向き、Backspace で1手もどす
document.addEventListener('keydown', (e) => {
  if (e.ctrlKey || e.metaKey || e.altKey || $('play').hidden || ending || !$('picker').hidden) return;
  const arrows: Record<string, [number, number]> = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
  if (/^[a-zA-Z]$/.test(e.key)) {
    const i = game.hand.indexOf(e.key.toLowerCase());
    if (i >= 0) tapTile(i);
  } else if (arrows[e.key] && cursor) {
    e.preventDefault();
    cursor = nextEmpty(cursor, ...arrows[e.key]) ?? cursor;
    renderPlay();
  } else if (e.key === ' ') {
    e.preventDefault();
    down = !down;
    renderPlay();
  } else if (e.key === 'Backspace') {
    e.preventDefault();
    $('undo').click();
  }
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
