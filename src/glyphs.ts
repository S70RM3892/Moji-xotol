// 文字に添えるヒエログリフ。アルファベットを一字一音の字形に当てる、土産物のカルトゥーシュでおなじみの対応。
// 表示には src/texture.css に埋め込んだ字形フォント（Glyphs）を使う。
const cp = (...codes: number[]) => String.fromCodePoint(...codes);

const LETTER: Record<string, number> = {
  a: 0x1313f, b: 0x130c0, c: 0x133a1, d: 0x130a7, e: 0x131cb, f: 0x13191, g: 0x133bc, h: 0x13254, i: 0x131cb,
  j: 0x13193, k: 0x133a1, l: 0x130ed, m: 0x13153, n: 0x13216, o: 0x1336f, p: 0x132aa, q: 0x1320e, r: 0x1308b,
  s: 0x132f4, t: 0x133cf, u: 0x13171, v: 0x13191, w: 0x13171, x: 0x1340d, y: 0x131cc, z: 0x13283,
};
export const glyphOf = (ch: string) => (LETTER[ch] ? cp(LETTER[ch]) : '');
/** 単語をそのまま字形に置き換える（未解読の碑文の見た目に使う） */
export const spell = (text: string) => [...text.toLowerCase()].map(glyphOf).join('');

export const SIGN = {
  ankh: cp(0x132f9),
  eye: cp(0x13080),
  scarab: cp(0x131a3),
  palette: cp(0x133de),
  water: cp(0x13217),
  sun: cp(0x131f3),
  jackal: cp(0x130e2),
  roll: cp(0x133db),
  star: cp(0x131fc),
  eye2: cp(0x13079),
  arm: cp(0x1309d),
  bolt: cp(0x13283),
};
