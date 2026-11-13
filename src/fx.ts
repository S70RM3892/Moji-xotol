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
  /** 語の完成。コンボが伸びるほど高い和音になる */
  word: (combo: number) => {
    const base = 3 + Math.min(combo, 12);
    [0, 4, 7, 12].forEach((s, i) => tone(base + s, i * 0.06, 0.22));
  },
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
export function popup(host: HTMLElement, x: number, y: number, text: string, cls: string): void {
  const el = document.createElement('div');
  el.className = `popup ${cls}`;
  el.textContent = text;
  el.style.left = `${Math.max(48, Math.min(host.clientWidth - 48, x))}px`;
  el.style.top = `${y}px`;
  host.append(el);
  setTimeout(() => el.remove(), reduced() ? 900 : 1300);
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

/** 画面上部から木のタイル色の紙吹雪 */
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
  const colors = ['--accent', '--ok', '--tile', '--alt'].map((v) => css.getPropertyValue(v).trim());
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
