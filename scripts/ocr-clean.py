#!/usr/bin/env python3
"""OCR の結果から、読み取りに自信のない語を除いて年度別のテキストを作る。

tesseract を `tsv` 出力で走らせると、語ごとに信頼度（0〜100）が付く。
信頼度の低い語は読み誤りが多い（日本語の部分を英字として読んだ断片、かすれた字）ので、数える前に捨てる。

使い方: python3 -I scripts/ocr-clean.py <tsv の置き場> <出力先> [信頼度の下限=80]
  tsv のファイル名は <接頭辞><年度>-<ページ>.tsv（例: p2015-2.tsv）
"""
import collections
import csv
import pathlib
import re
import sys

src = pathlib.Path(sys.argv[1])
dst = pathlib.Path(sys.argv[2])
MIN_CONF = float(sys.argv[3]) if len(sys.argv) > 3 else 80
dst.mkdir(parents=True, exist_ok=True)

pages = collections.defaultdict(list)
for p in src.glob("*.tsv"):
    m = re.fullmatch(r"[a-z]*(\d{4})-(\d+)", p.stem)
    if m:
        pages[int(m.group(1))].append((int(m.group(2)), p))

kept = dropped = 0
examples = collections.Counter()
for year in sorted(pages):
    lines = []
    for _, path in sorted(pages[year]):
        current, key = [], None
        with open(path, encoding="utf-8", errors="ignore") as f:
            for row in csv.DictReader(f, delimiter="\t", quoting=csv.QUOTE_NONE):
                text = (row.get("text") or "").strip()
                if row.get("level") != "5" or not text:
                    continue
                k = (row["block_num"], row["par_num"], row["line_num"])
                if k != key:
                    if current:
                        lines.append(" ".join(current))
                    current, key = [], k
                if float(row["conf"]) >= MIN_CONF:
                    current.append(text)
                    kept += 1
                else:
                    dropped += 1
                    if re.fullmatch(r"[A-Za-z]{4,}", text):
                        examples[text.lower()] += 1
        if current:
            lines.append(" ".join(current))
    (dst / f"{year}.txt").write_text("\n".join(lines) + "\n", encoding="utf-8")

total = kept + dropped
print(f"{len(pages)}年度: 語 {total} のうち {dropped}（{100 * dropped / max(1, total):.1f}%）を信頼度 {MIN_CONF:.0f} 未満として除いた")
print("除いた英字の語の例:", ", ".join(w for w, _ in examples.most_common(40)))
