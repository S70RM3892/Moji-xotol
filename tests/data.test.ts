import { describe, expect, it } from 'vitest';
import { PASSAGES } from '../src/data/passages';
import { SENTENCES } from '../src/data/sentences';

const words = (t: string) => t.split(/\s+/).length;

describe('読み解くの例文', () => {
  it('どの段階にも8文以上あり、文は重複しない', () => {
    for (let lv = 1; lv <= 6; lv++) expect(SENTENCES.filter((s) => s.level === lv).length).toBeGreaterThanOrEqual(8);
    expect(new Set(SENTENCES.map((s) => s.text)).size).toBe(SENTENCES.length);
  });
  it('選択肢は3つとも違い、本文そのままではない', () => {
    for (const s of SENTENCES) {
      expect(new Set(s.options).size, s.text).toBe(3);
      expect(s.options).not.toContain(s.text);
      expect(s.note.length, s.text).toBeGreaterThan(0);
    }
  });
});

describe('粗読みの文章', () => {
  it('段階ごとの長さに収まる', () => {
    const range = { 1: [130, 230], 2: [250, 380], 3: [520, 700] } as const;
    for (const p of PASSAGES) {
      const n = words(p.paragraphs.join(' '));
      expect(n, p.title).toBeGreaterThanOrEqual(range[p.level][0]);
      expect(n, p.title).toBeLessThanOrEqual(range[p.level][1]);
    }
  });
  it('選択肢は重複せず、理由と段落の説明がそろっている', () => {
    for (const p of PASSAGES) {
      expect(new Set(p.gist.options).size, p.title).toBe(4);
      expect(new Set(p.check.options).size, p.title).toBe(3);
      expect(p.gist.why.every((w) => w.length > 0), p.title).toBe(true);
      expect(p.outline.length, p.title).toBe(p.paragraphs.length);
    }
    expect(new Set(PASSAGES.map((p) => p.title)).size).toBe(PASSAGES.length);
  });
});
