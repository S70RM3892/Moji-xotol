// 音と、知らせの帯（碑文の発見・レベルアップ）。動きのある演出は入れない

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
  /** 単語の成立。連鎖が大きいほど高い和音になる */
  word: (chain: number) => {
    const base = 1 + 2 * Math.min(chain, 8);
    [0, 4, 7].forEach((s, i) => tone(base + s, i * 0.06, 0.2));
  },
  /** 単語にならない1枚、ヒントなどの軽い操作 */
  bet: () => tone(-14, 0, 0.1, 'sine', 0.05),
  /** お題達成 */
  mission: () => [3, 7, 10, 15].forEach((s, i) => tone(s, i * 0.07, 0.3)),
  /** 1文字ごとに音階を上がる */
  note: (i: number) => tone([0, 2, 4, 7, 9, 12, 14, 16, 19][Math.min(i, 8)] + 3, 0, 0.15, 'triangle', 0.07),
  bad: () => tone(-19, 0, 0.18, 'sawtooth', 0.05),
};

/** host（position: relative）の上から y の位置に、知らせの帯を2秒出す */
export function toast(host: HTMLElement, y: number, text: string, cls: string): void {
  const node = document.createElement('div');
  node.className = `toast ${cls}`;
  node.textContent = text;
  node.style.top = `${y}px`;
  host.append(node);
  setTimeout(() => node.remove(), 2000);
}
