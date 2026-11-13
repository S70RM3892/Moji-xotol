// 演出: 効果音・振動・得点ポップアップ・紙吹雪・数字のカウントアップ

const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

let audio: AudioContext | null = null;
let soundOn = true;
export function setSound(on: boolean): void {
  soundOn = on;
}

function tone(semitone: number, at: number, dur: number, type: OscillatorType = 'triangle', vol = 0.07): void {
  if (!soundOn) return;
  try {
    audio ??= new AudioContext();
    if (audio.state === 'suspended') void audio.resume();
    const t = audio.currentTime + at;
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.type = type;
    osc.frequency.value = 440 * 2 ** (semitone / 12);
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(gain).connect(audio.destination);
    osc.start(t);
    osc.stop(t + dur);
  } catch {
    /* 音が出せない環境でも遊べる */
  }
}

export const sfx = {
  /** 文字を置く。語の中で進むほど高くなる */
  place: (step: number) => tone(-5 + step * 2, 0, 0.07, 'square', 0.025),
  /** 単語の成立。連鎖が大きいほど高い和音になる */
  word: (chain: number) => {
    const base = 1 + 2 * Math.min(chain, 8);
    [0, 4, 7, 12].forEach((s, i) => tone(base + s, i * 0.06, 0.22));
  },
  /** 単語にならない「待ち」の1枚 */
  bet: () => tone(-14, 0, 0.12, 'sine', 0.06),
  /** お題達成 */
  mission: () => [3, 7, 10, 15, 19, 22].forEach((s, i) => tone(s, i * 0.07, 0.45)),
  /** 連鎖の読み上げ: 1語ごとに音階を上がる */
  note: (i: number) => tone([0, 2, 4, 7, 9, 12, 14, 16, 19][Math.min(i, 8)] + 3, 0, 0.18, 'triangle', 0.08),
  bad: () => tone(-19, 0, 0.2, 'sawtooth', 0.05),
  clear: () => [3, 7, 10, 15, 19].forEach((s, i) => tone(s, i * 0.09, 0.4)),
  levelUp: () => [3, 8, 12, 15, 20, 24].forEach((s, i) => tone(s, 0.5 + i * 0.07, 0.35, 'square', 0.04)),
};

export function buzz(pattern: number | number[]): void {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* 振動できない端末は無視 */
  }
}

/** host（position: relative）の中の (x, y) から浮き上がって消える文字 */
export function popup(host: HTMLElement, x: number, y: number, text: string, cls: string, life = 1300): void {
  const el = document.createElement('div');
  el.className = `popup ${cls}`;
  el.textContent = text;
  el.style.left = `${Math.max(48, Math.min(host.clientWidth - 48, x))}px`;
  el.style.top = `${y}px`;
  host.append(el);
  setTimeout(() => el.remove(), reduced() ? 900 : life);
}

/** 数字を to まで数え上げる。同じ値への呼び出しは何もしない */
const targets = new WeakMap<HTMLElement, number>();
export function countUp(el: HTMLElement, to: number): void {
  if (targets.get(el) === to) return;
  const first = !targets.has(el);
  targets.set(el, to);
  const from = Number(el.textContent) || 0;
  if (first || reduced() || from === to) {
    el.textContent = String(to);
    return;
  }
  const t0 = performance.now();
  const step = (now: number) => {
    if (targets.get(el) !== to) return; // 新しい目標に置き換わった
    const p = Math.min(1, (now - t0) / 500);
    el.textContent = String(Math.round(from + (to - from) * (1 - (1 - p) ** 3)));
    if (p < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

/** 顔料の色（金・青緑・赤土・青）の紙吹雪 */
export function confetti(): void {
  if (reduced()) return;
  const canvas = document.createElement('canvas');
  canvas.className = 'confetti';
  const dpr = Math.min(2, devicePixelRatio || 1);
  const w = innerWidth;
  const h = innerHeight;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  document.body.append(canvas);
  const g = canvas.getContext('2d');
  if (!g) return canvas.remove();
  g.scale(dpr, dpr);
  const css = getComputedStyle(document.documentElement);
  const colors = ['--ochre', '--teal', '--red', '--lapis', '--cream'].map((v) => css.getPropertyValue(v).trim());
  const parts = Array.from({ length: 90 }, (_, i) => ({
    x: w / 2 + (Math.random() - 0.5) * w * 0.5,
    y: h * 0.3,
    vx: (Math.random() - 0.5) * 9,
    vy: -Math.random() * 11 - 3,
    size: 6 + Math.random() * 6,
    rot: Math.random() * 6,
    vr: (Math.random() - 0.5) * 0.4,
    color: colors[i % colors.length],
  }));
  const t0 = performance.now();
  const frame = (now: number) => {
    const t = now - t0;
    g.clearRect(0, 0, w, h);
    g.globalAlpha = Math.max(0, 1 - t / 1600);
    for (const p of parts) {
      p.vy += 0.35;
      p.x += p.vx;
      p.y += p.vy;
      p.rot += p.vr;
      g.save();
      g.translate(p.x, p.y);
      g.rotate(p.rot);
      g.fillStyle = p.color;
      g.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.7);
      g.restore();
    }
    if (t < 1600) requestAnimationFrame(frame);
    else canvas.remove();
  };
  requestAnimationFrame(frame);
}

/** 画面上の (x, y) から顔料の粉がはじける。1枚の canvas を使い回す */
interface Dust { x: number; y: number; vx: number; vy: number; size: number; life: number; color: string }
let dustCanvas: HTMLCanvasElement | null = null;
let dust: Dust[] = [];
export function burst(x: number, y: number, count: number): void {
  if (reduced()) return;
  const css = getComputedStyle(document.documentElement);
  const colors = ['--ochre', '--cream', '--teal', '--red'].map((v) => css.getPropertyValue(v).trim());
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2;
    const v = 2 + Math.random() * 6;
    dust.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 2, size: 3 + Math.random() * 5, life: 1, color: colors[i % colors.length] });
  }
  if (dustCanvas) return;
  const canvas = (dustCanvas = document.createElement('canvas'));
  canvas.className = 'confetti';
  const dpr = Math.min(2, devicePixelRatio || 1);
  canvas.width = innerWidth * dpr;
  canvas.height = innerHeight * dpr;
  document.body.append(canvas);
  const g = canvas.getContext('2d')!;
  g.scale(dpr, dpr);
  const frame = () => {
    g.clearRect(0, 0, innerWidth, innerHeight);
    dust = dust.filter((p) => p.life > 0);
    for (const p of dust) {
      p.vy += 0.3;
      p.x += p.vx;
      p.y += p.vy;
      p.life -= 0.028;
      g.globalAlpha = Math.max(0, p.life);
      g.fillStyle = p.color;
      g.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
    if (dust.length) requestAnimationFrame(frame);
    else {
      canvas.remove();
      dustCanvas = null;
    }
  };
  requestAnimationFrame(frame);
}

/** 腹に響く低い一撃（音程が落ちる） */
export function boom(strength = 1): void {
  if (!soundOn) return;
  try {
    audio ??= new AudioContext();
    const t = audio.currentTime;
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(150, t);
    osc.frequency.exponentialRampToValueAtTime(38, t + 0.28);
    gain.gain.setValueAtTime(Math.min(0.5, 0.22 * strength), t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
    osc.connect(gain).connect(audio.destination);
    osc.start(t);
    osc.stop(t + 0.42);
  } catch {
    /* 音が出せない環境でも遊べる */
  }
}

function overlay(cls: string, life: number, style: Partial<CSSStyleDeclaration> = {}): HTMLElement | null {
  if (reduced()) return null;
  const node = document.createElement('div');
  node.className = cls;
  Object.assign(node.style, style);
  document.body.append(node);
  setTimeout(() => node.remove(), life);
  return node;
}
/** 画面全体が一瞬光る */
export const flashScreen = (strength: number) => overlay('fx-flash', 420, { opacity: String(Math.min(0.75, strength)) });
/** (x, y) から広がる衝撃の輪 */
export const ring = (x: number, y: number, size = 1) =>
  overlay('fx-ring', 700, { left: `${x}px`, top: `${y}px`, ['--s' as never]: String(size) });
/** (x, y) の後ろで回る光の筋 */
export const rays = (x: number, y: number) => overlay('fx-rays', 1900, { left: `${x}px`, top: `${y}px` });
/** 周りを暗くして (x, y) だけ照らす */
export const spotlight = (x: number, y: number) =>
  overlay('fx-spot', 1900, { background: `radial-gradient(circle at ${x}px ${y}px, #0000 90px, #000c 340px)` });

/** (x, y) から target へ、光の粒が尾を引いて飛び込む */
export function fly(x: number, y: number, target: HTMLElement, count: number): void {
  if (reduced()) return;
  const t = target.getBoundingClientRect();
  const tx = t.left + t.width / 2;
  const ty = t.top + t.height / 2;
  for (let i = 0; i < count; i++) {
    const dot = document.createElement('div');
    dot.className = 'fx-spark';
    document.body.append(dot);
    const mx = (x + tx) / 2 + (Math.random() - 0.5) * 260;
    const my = (y + ty) / 2 + (Math.random() - 0.5) * 260;
    const anim = dot.animate(
      [
        { transform: `translate(${x}px, ${y}px) scale(1.6)`, opacity: 1 },
        { transform: `translate(${mx}px, ${my}px) scale(1.1)`, opacity: 1, offset: 0.45 },
        { transform: `translate(${tx}px, ${ty}px) scale(0.3)`, opacity: 0.9 },
      ],
      { duration: 520 + Math.random() * 260, delay: i * 22, easing: 'cubic-bezier(0.5, 0, 0.9, 0.6)', fill: 'backwards' },
    );
    anim.onfinish = () => {
      dot.remove();
      target.animate([{ transform: 'scale(1.35)' }, { transform: 'none' }], { duration: 160 });
    };
  }
}
