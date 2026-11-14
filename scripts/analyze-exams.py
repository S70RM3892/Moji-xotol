#!/usr/bin/env python3
"""過去問の語彙分析。

OCR 済みの年度別テキスト（<dir>/2005.txt …）を読み、次を出す:
  1. 年度ごとの語数と、語彙レベル（CEFR）別の内訳
  2. 「一度出た語は次に出やすいか／出にくいか」の検証
  3. 過去の出題歴・一般的な頻度・レベルから「次の年に出る確率」を予測するモデルと、その検証
  4. data/kyodai-words.tsv（語・出た年度・回数・予測値）— 集計値だけで、問題文は含めない

使い方: python3 -I scripts/analyze-exams.py <OCRテキストの置き場> <頻度リスト en_50k.txt> [--write]
問題文そのものは著作物なので、このリポジトリには置かない。
"""
import collections
import csv
import math
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw"
text_dir = pathlib.Path(sys.argv[1])
freq_path = pathlib.Path(sys.argv[2])
WRITE = "--write" in sys.argv

# ---------- 語彙リスト ----------
enable = set(RAW.joinpath("enable1.txt").read_text().split())
ORDER = ["A1", "A2", "B1", "B2", "C1", "C2"]
level = {}
for name in ["cefrj-vocabulary-profile-1.5.csv", "octanove-vocabulary-profile-c1c2-1.0.csv"]:
    with open(RAW / name, encoding="utf-8-sig") as f:
        for row in csv.DictReader(f):
            w = row["headword"].split("/")[0].strip().lower()
            lv = row["CEFR"]
            if lv in ORDER and re.fullmatch(r"[a-z]+", w):
                if w not in level or ORDER.index(lv) < ORDER.index(level[w]):
                    level[w] = lv
rank = {}
for i, line in enumerate(freq_path.read_text(encoding="utf-8").split("\n")):
    w = line.split(" ")[0]
    if w and w not in rank:
        rank[w] = i + 1

IRREGULAR = {
    "was": "be", "were": "be", "been": "be", "is": "be", "are": "be", "am": "be", "has": "have", "had": "have",
    "did": "do", "does": "do", "done": "do", "went": "go", "gone": "go", "made": "make", "said": "say", "took": "take",
    "taken": "take", "came": "come", "saw": "see", "seen": "see", "knew": "know", "known": "know", "got": "get",
    "gave": "give", "given": "give", "found": "find", "thought": "think", "told": "tell", "became": "become",
    "left": "leave", "felt": "feel", "brought": "bring", "began": "begin", "begun": "begin", "kept": "keep",
    "held": "hold", "wrote": "write", "written": "write", "stood": "stand", "heard": "hear", "meant": "mean",
    "met": "meet", "ran": "run", "paid": "pay", "sat": "sit", "spoke": "speak", "spoken": "speak", "led": "lead",
    "grew": "grow", "grown": "grow", "lost": "lose", "fell": "fall", "fallen": "fall", "sent": "send", "built": "build",
    "understood": "understand", "drew": "draw", "drawn": "draw", "broke": "break", "broken": "break", "spent": "spend",
    "rose": "rise", "risen": "rise", "chose": "choose", "chosen": "choose", "sought": "seek", "taught": "teach",
    "caught": "catch", "bought": "buy", "fought": "fight", "threw": "throw", "thrown": "throw", "shown": "show",
    "men": "man", "women": "woman", "children": "child", "people": "person", "feet": "foot", "lives": "life",
    "better": "good", "best": "good", "worse": "bad", "worst": "bad", "phenomena": "phenomenon", "criteria": "criterion",
    "hypotheses": "hypothesis", "analyses": "analysis", "bore": "bear", "borne": "bear", "arose": "arise", "arisen": "arise",
    "undertook": "undertake", "undertaken": "undertake", "underwent": "undergo", "undergone": "undergo",
}
SUFFIX = [
    ("ies", "y"), ("ied", "y"), ("es", ""), ("s", ""), ("ed", ""), ("ed", "e"), ("d", ""), ("ing", ""), ("ing", "e"),
    ("er", ""), ("er", "e"), ("est", ""), ("est", "e"), ("ier", "y"), ("iest", "y"), ("ly", ""), ("ily", "y"),
]


def lemma(w):
    """見出し語に寄せる。語彙リストにある形を優先し、なければ ENABLE にある形"""
    if w in IRREGULAR:
        return IRREGULAR[w]
    cands = []
    for suf, rep in SUFFIX:
        if w.endswith(suf) and len(w) - len(suf) >= 2:
            cands.append(w[: len(w) - len(suf)] + rep)
    # runn-ing, stopp-ed のような重ね字
    for suf in ("ing", "ed", "er", "est"):
        if w.endswith(suf):
            stem = w[: -len(suf)]
            if len(stem) >= 3 and stem[-1] == stem[-2]:
                cands.append(stem[:-1])
    if w in level:
        # means / times / trying / expected のように、変化形と同じつづりの見出し語がある場合は、
        # もとの語のほうが易しければそちらと見なす（本文ではたいてい変化形として出ている）
        for c in cands:
            if c in level and ORDER.index(level[c]) < ORDER.index(level[w]):
                return c
        return w
    for c in cands:
        if c in level:
            return c
    if w in enable:
        # 見出し語にない語は、複数形・過去形などだけ元に戻す（-ly や -er は別の語として残す）
        for suf, rep in SUFFIX[:9]:
            if w.endswith(suf) and len(w) - len(suf) >= 3:
                c = w[: len(w) - len(suf)] + rep
                if c in enable and rank.get(c, 10**9) < rank.get(w, 10**9):
                    return c
        return w
    for c in cands:
        if c in enable:
            return c
    return None


# ---------- 読み込み ----------
years = sorted(int(p.stem) for p in text_dir.glob("[0-9][0-9][0-9][0-9].txt"))
counts = {}  # year -> Counter(lemma)
caps = collections.Counter()  # 大文字で始まっていた回数
seen = collections.Counter()
tokens_total = {}
for y in years:
    text = (text_dir / f"{y}.txt").read_text(errors="ignore")
    text = re.sub(r"(\w)-\n\s*(\w)", r"\1\2", text)  # 行末のハイフンをつなぐ
    c = collections.Counter()
    n = 0
    for line in text.split("\n"):
        words = re.findall(r"[A-Za-z]+(?:'[a-z]+)?", line)
        if len(words) < 4:
            continue  # 日本語の行を OCR した断片を除く
        low = [w.lower().split("'")[0] for w in words]
        known = [w for w in low if w in enable or w in level or w in ("a", "i")]
        if len(known) < 0.7 * len(low):
            continue
        for w, orig in zip(low, words):
            if len(w) < 3 or orig[0].isupper() and w not in level and rank.get(w, 10**9) > 20000:
                continue  # 固有名詞らしいもの
            lm = lemma(w)
            if lm:
                c[lm] += 1
                n += 1
                seen[lm] += 1
                caps[lm] += orig[0].isupper()
    counts[y] = c
    tokens_total[y] = n

print("== 1. 年度ごとの語数とレベル別の内訳（延べ語数に占める割合 %）==")
print("年度   語数  異なり語   " + "  ".join(f"{lv:>4}" for lv in ORDER) + "  表外")
agg = collections.Counter()
for y in years:
    by = collections.Counter()
    for w, k in counts[y].items():
        by[level.get(w, "off")] += k
    agg.update(by)
    n = tokens_total[y]
    print(f"{y}  {n:5d}  {len(counts[y]):6d}   " + "  ".join(f"{100 * by[lv] / n:4.1f}" for lv in ORDER) + f"  {100 * by['off'] / n:4.1f}")
N = sum(tokens_total.values())
print("平均                    " + "  ".join(f"{100 * agg[lv] / N:4.1f}" for lv in ORDER) + f"  {100 * agg['off'] / N:4.1f}")

# 異なり語で見た、難しい語の量
appear = collections.defaultdict(list)  # lemma -> [year, ...]
total = collections.Counter()
for y in years:
    for w, k in counts[y].items():
        appear[w].append(y)
        total[w] += k


def proper(w):
    """いつも大文字で始まる表外の語は固有名詞と見なす"""
    return w not in level and seen[w] > 0 and caps[w] / seen[w] >= 0.7


def group(w):
    lv = level.get(w)
    if lv in ("A1", "A2", "B1"):
        return "A1-B1"
    if lv:
        return lv
    # 表外でも、ごくありふれた語（cannot, born, according など）と固有名詞は難語に数えない
    if rank.get(w, 10**9) <= 4000 or proper(w):
        return "A1-B1"
    return "表外"


print("\n== 異なり語（20年間に1回でも出た語）のレベル別の数と、出た年度数 ==")
by_group = collections.defaultdict(list)
for w, ys in appear.items():
    by_group[group(w)].append(len(ys))
for g in ["A1-B1", "B2", "C1", "C2", "表外"]:
    v = by_group[g]
    once = sum(1 for x in v if x == 1)
    print(f"{g:6s} {len(v):5d}語  1年度だけ {100 * once / len(v):4.1f}%  2〜3年度 {100 * sum(1 for x in v if 2 <= x <= 3) / len(v):4.1f}%  4年度以上 {100 * sum(1 for x in v if x >= 4) / len(v):4.1f}%")

# ---------- 2. 一度出た語は、次に出やすいか ----------
# 候補: 見出し語リストの語と、頻度リストにある ENABLE の語（4文字以上）
universe = sorted({w for w in level if len(w) >= 4} | {w for w in enable if len(w) >= 4 and w in rank})
hard = [w for w in universe if group(w) != "A1-B1"]


def band(w):
    r = rank.get(w, 60000)
    return 0 if r <= 3000 else 1 if r <= 8000 else 2 if r <= 20000 else 3


BAND = ["頻度1-3千位", "3-8千位", "8千-2万位", "2万位以下"]
print("\n== 2. 難しい語（B2以上と表外）が「ある年度に出る確率」: それまでの出題歴別 ==")
print("（一般的な頻度が同じくらいの語どうしで比べる。対象年度は2010〜2024）")
table = collections.defaultdict(lambda: [0, 0])  # (band, history) -> [出た, 全体]
for y in years:
    if y < 2010:
        continue
    prior = [x for x in years if x < y]
    for w in hard:
        k = sum(1 for x in appear.get(w, []) if x < y)
        last = max([x for x in appear.get(w, []) if x < y], default=None)
        hist = "なし" if k == 0 else ("1回・直近5年内" if y - last <= 5 else "1回・6年以上前") if k == 1 else "2回以上"
        t = table[(band(w), hist)]
        t[1] += 1
        t[0] += 1 if y in appear.get(w, []) else 0
H = ["なし", "1回・直近5年内", "1回・6年以上前", "2回以上"]
print("頻度帯          " + "".join(f"{h:>16s}" for h in H))
for b in range(4):
    row = ""
    for h in H:
        a, n = table[(b, h)]
        row += f"{100 * a / n:8.2f}% ({n:6d})" if n else " " * 16
    print(f"{BAND[b]:12s}{row}")

# ---------- 3. 予測モデル ----------
# 学術的な文章に多い語の形（ラテン語・ギリシャ語由来の語尾）。日常の具体名詞（cottage, turret）と区別する手がかり
ACADEMIC = re.compile(r"(tion|sion|ity|ism|ist|ive|ize|ise|ate|ify|ous|ence|ance|ment|ical|ic|al|ary|ory|ible|able|logy|ent|ant|ure|ude)(ly|s|d)?$")


def features(w, y):
    ys = [x for x in appear.get(w, []) if x < y]
    span = len([x for x in years if x < y])
    k = len(ys)
    last = max(ys, default=None)
    lv = level.get(w)
    r = rank.get(w, 60000)
    return [
        1.0,
        math.log(r) / 10,
        1.0 if lv == "B2" else 0.0,
        1.0 if lv == "C1" else 0.0,
        1.0 if lv == "C2" else 0.0,
        1.0 if lv is None else 0.0,
        k / span,  # 出た年度の割合
        1.0 if k >= 1 else 0.0,
        1.0 if last is not None and y - last <= 3 else 0.0,  # 直近3年以内に出た
        1.0 if ACADEMIC.search(w) else 0.0,  # 学術語らしい語尾
        min(len(w), 12) / 10,  # 語の長さ
    ]


def fit(rows, labels, steps=400, lr=0.5):
    d = len(rows[0])
    w = [0.0] * d
    n = len(rows)
    for _ in range(steps):
        g = [0.0] * d
        for x, t in zip(rows, labels):
            z = sum(a * b for a, b in zip(w, x))
            p = 1 / (1 + math.exp(-max(-30, min(30, z))))
            for i in range(d):
                g[i] += (p - t) * x[i]
        w = [wi - lr * gi / n * 50 for wi, gi in zip(w, g)]
    return w


def predict(w, x):
    z = sum(a * b for a, b in zip(w, x))
    return 1 / (1 + math.exp(-max(-30, min(30, z))))


import random

random.seed(1)
train_rows, train_y, test = [], [], []
for y in years:
    if y < 2010:
        continue
    for w in hard:
        t = 1 if y in appear.get(w, []) else 0
        if y <= 2019:
            if t or random.random() < 0.08:  # 出なかった例は間引く（重みで補正）
                train_rows.append(features(w, y))
                train_y.append(t)
        else:
            test.append((w, y, t))
coef = fit(train_rows, train_y)
coef[0] += math.log(0.08)  # 出なかった例を8%に間引いて学習したぶん、切片を戻す（確率を実際の水準に合わせる）
names = ["切片", "log頻度順位", "B2", "C1", "C2", "表外", "出た年度の割合", "出たことがある", "直近3年に出た", "学術語らしい語尾", "語の長さ"]
print("\n== 3. 予測モデル（2010〜2019年度で学習）の係数 ==")
print("  ".join(f"{n}={c:+.2f}" for n, c in zip(names, coef)))

scored = [(predict(coef, features(w, y)), t) for w, y, t in test]
scored.sort(reverse=True)
pos = sum(t for _, t in scored)
print(f"\n検証（2020〜2024年度、学習に使っていない）: 候補 {len(scored)} 語年のうち実際に出たのは {pos}（{100 * pos / len(scored):.2f}%、予測の平均は {100 * sum(p for p, _ in scored) / len(scored):.2f}%）")
for frac in (0.01, 0.05, 0.2):
    top = scored[: int(len(scored) * frac)]
    hit = sum(t for _, t in top)
    print(f"  予測上位 {int(frac * 100):2d}%: 的中率 {100 * hit / len(top):5.2f}%（全体の {100 * hit / pos:4.1f}% を拾う、ランダムの {hit / len(top) / (pos / len(scored)):.1f} 倍）")

# ---------- 4. 書き出し ----------
# 検証が済んだら、2010〜2024年度の全部で学習し直して予測に使う
rows, labels = [], []
for y in years:
    if y < 2010:
        continue
    for w in hard:
        t = 1 if y in appear.get(w, []) else 0
        if t or random.random() < 0.08:
            rows.append(features(w, y))
            labels.append(t)
coef = fit(rows, labels)
coef[0] += math.log(0.08)
next_year = max(years) + 1


def unknown(w):
    """京大志望者がその語を知らない見込み。ありふれた語ほど低い（頻度順位 2千位で1割、8千位で5割、2万位以上で8割強）"""
    r = rank.get(w, 60000)
    return 1 / (1 + math.exp(-1.6 * (math.log(r) - math.log(8000))))


out = []
for w in hard:
    p = predict(coef, features(w, next_year))
    if appear.get(w) or level.get(w) in ("B2", "C1", "C2"):
        # 覚える価値 = 出る見込み × まだ知らない見込み
        out.append((w, level.get(w, "-"), ",".join(str(y) for y in appear.get(w, [])), total[w], p * unknown(w)))
out.sort(key=lambda r: -r[4])
tot = sum(r[4] for r in out)
ent = -sum(r[4] / tot * math.log(r[4] / tot) for r in out if r[4] > 0)
print(f"\n覚える価値の合計に占める割合: 上位200語 {100 * sum(r[4] for r in out[:200]) / tot:.0f}% / 上位1000語 {100 * sum(r[4] for r in out[:1000]) / tot:.0f}% / 全{len(out)}語（実質 {math.exp(ent):.0f} 語ぶんの広がり）")
hist = collections.Counter("出た" if r[2] else "出ていない" for r in out[:1000])
print("上位1000語の内訳:", dict(hist), collections.Counter(r[1] for r in out[:1000]))
print(f"\n== 4. {next_year}年度に向けて覚える価値が高い語（上位60） ==")
print(", ".join(f"{w}({lv},{len(ys.split(',')) if ys else 0}回)" for w, lv, ys, _, _ in out[:60]))
print("\n表外で2年度以上に出た語:", ", ".join(w for w, lv, ys, _, _ in out if lv == "-" and ys.count(",") >= 1)[:900])
if WRITE:
    path = ROOT / "data" / "kyodai-words.tsv"
    with open(path, "w") as f:
        f.write("# 京大英語 過去問(2005-2024)の語彙集計。scripts/analyze-exams.py が作る。問題文は含まない\n")
        f.write("# 語\tレベル\t出た年度\t延べ回数\t覚える価値（次年度に出る見込み × まだ知らない見込み）\n")
        for w, lv, ys, k, p in out:
            f.write(f"{w}\t{lv}\t{ys}\t{k}\t{p:.5f}\n")
    print(f"\n{path} に {len(out)} 語を書き出した")
