#!/usr/bin/env python3
"""過去問の語彙分析。

OCR 済みの年度別テキスト（<dir>/2005.txt …）を読み、次を出す:
  1. 年度ごとの語数と、語彙レベル（CEFR）別の内訳
  2. 「一度出た語は次に出やすいか／出にくいか」の検証
  3. 過去の出題歴・一般的な頻度・レベルから「次の年に出る確率」を予測するモデルと、その検証
  4. data/kyodai-words.tsv（語・出た年度・回数・予測値）— 集計値だけで、問題文は含めない

使い方: python3 -I scripts/analyze-exams.py <OCRテキストの置き場> <頻度リスト en_50k.txt> [--profile kyodai|kyote] [--write]
  kyodai: 京都大学の英語。難語 = B2以上と表外。data/kyodai-words.tsv に書く
  kyote : 共通テスト・センター試験の英語。難語 = B1以上と表外。data/kyote-words.tsv に書く
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
PROFILE = sys.argv[sys.argv.index("--profile") + 1] if "--profile" in sys.argv else "kyodai"
# --peer <テキストの置き場>[:<呼び名>[:<書き出すファイルの名前>]]
#   別の試験（他大学、共テなど）。その試験に出た語かどうかを予測の手がかりに加える。何度でも指定できる。
#   3つ目を付けると、--write のときに data/<名前>-words.tsv（語と出た年度だけ）も書き出す
PEER_ARGS = [sys.argv[i + 1].split(":") for i, a in enumerate(sys.argv) if a == "--peer"]
PEER_DIRS = [pathlib.Path(a[0]) for a in PEER_ARGS]
PEER_LABEL = [a[1] if len(a) > 1 else pathlib.Path(a[0]).name for a in PEER_ARGS]
PEER_SLUG = [a[2] if len(a) > 2 else None for a in PEER_ARGS]
# 試験ごとの設定: やさしい側に数えるレベル、表外語を難語と見なす頻度順位、「まだ知らない見込み」が5割になる頻度順位
EASY, OFF_RANK, HALF_KNOWN, TITLE = {
    "kyodai": (("A1", "A2", "B1"), 4000, 8000, "京大英語"),
    "kyote": (("A1", "A2"), 3000, 4000, "共通テスト・センター試験 英語"),
}[PROFILE]

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


def count_words(path, track=True):
    """1年度ぶんのテキストを、見出し語ごとの回数にする"""
    text = path.read_text(errors="ignore")
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
                if track:
                    seen[lm] += 1
                    caps[lm] += orig[0].isupper()
    return c, n


for y in years:
    counts[y], tokens_total[y] = count_words(text_dir / f"{y}.txt")

# 別の試験: 語 -> その試験に出た年度
peers = []
for d in PEER_DIRS:
    table = collections.defaultdict(list)
    for f in sorted(d.glob("[0-9][0-9][0-9][0-9].txt")):
        for w in count_words(f, track=False)[0]:
            table[w].append(int(f.stem))
    peers.append(table)
    print(f"別の試験 {PEER_LABEL[len(peers) - 1]}: {min(int(f.stem) for f in d.glob('[0-9]*.txt'))}〜{max(int(f.stem) for f in d.glob('[0-9]*.txt'))}年度、異なり語 {len(table)}")

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
    if lv in EASY:
        return "A1-B1"
    if lv:
        return lv
    # 表外でも、ごくありふれた語（cannot, born, according など）と固有名詞は難語に数えない
    if rank.get(w, 10**9) <= OFF_RANK or proper(w):
        return "A1-B1"
    return "表外"


print("\n== 異なり語（20年間に1回でも出た語）のレベル別の数と、出た年度数 ==")
by_group = collections.defaultdict(list)
for w, ys in appear.items():
    by_group[group(w)].append(len(ys))
for g in ["A1-B1", "B1", "B2", "C1", "C2", "表外"]:
    v = by_group[g]
    if not v:
        continue
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
FIRST = years[0] + 5  # 出題歴を数えるために、最初の5年度は予測の対象にしない
SPLIT = years[-3]  # ここまでで学習し、最後の2年度で検証する
print("\n== 2. 難しい語が「ある年度に出る確率」: それまでの出題歴別 ==")
print(f"（一般的な頻度が同じくらいの語どうしで比べる。対象年度は{FIRST}〜{years[-1]}）")
table = collections.defaultdict(lambda: [0, 0])  # (band, history) -> [出た, 全体]
for y in years:
    if y < FIRST:
        continue
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

# 別の試験に出た語は、この試験にも出やすいか（一般的な頻度と、この試験での出題歴をそろえて比べる）
peer_tables = []
for label, t in zip(PEER_LABEL, peers):
    start = min(x for xs in t.values() for x in xs)
    cmp = collections.defaultdict(lambda: [0, 0])
    for y in years:
        if y < max(FIRST, start + 1):
            continue
        for w in hard:
            own = "出題歴あり" if any(x < y for x in appear.get(w, [])) else "出題歴なし"
            other = "出た" if any(x < y for x in t.get(w, [])) else "出ていない"
            c = cmp[(band(w), own, other)]
            c[1] += 1
            c[0] += 1 if y in appear.get(w, []) else 0
    peer_tables.append({
        "label": label,
        "from": max(FIRST, start + 1),
        "rows": [
            {"band": BAND[b], "own": own, "rate": [round(100 * cmp[(b, own, o)][0] / cmp[(b, own, o)][1], 2) if cmp[(b, own, o)][1] else None for o in ("出ていない", "出た")], "n": [cmp[(b, own, o)][1] for o in ("出ていない", "出た")]}
            for b in range(4)
            for own in ("出題歴なし", "出題歴あり")
        ],
    })
    print(f"\n== 2b. 別の試験 {label} に出た語が、この試験に出る確率（対象年度は{max(FIRST, start + 1)}〜{years[-1]}）==")
    print("頻度帯        この試験での出題歴    別の試験に出ていない        別の試験に出た")
    for b in range(4):
        for own in ("出題歴なし", "出題歴あり"):
            row = ""
            for other in ("出ていない", "出た"):
                a, n = cmp[(b, own, other)]
                row += f"{100 * a / n:8.2f}% ({a:3d}/{n:6d})" if n else " " * 22
            print(f"{BAND[b]:12s}{own:10s}{row}")

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
    ] + peer_features(w, y)


def peer_features(w, y):
    """別の試験での出題歴（その年度より前だけを見る）"""
    if not peers:
        return []
    out = []
    for t in peers:  # 試験ごとに別の手がかりにする（共テに出る日常語と、他大学に出る論説語は効き方が違う）
        prior = [x for x in t.get(w, []) if x < y]
        out += [
            1.0 if prior else 0.0,  # その試験に出たことがある
            1.0 if any(y - x <= 5 for x in prior) else 0.0,  # 直近5年以内に出た
        ]
    return out


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
    if y < FIRST:
        continue
    for w in hard:
        t = 1 if y in appear.get(w, []) else 0
        if y <= SPLIT:
            if t or random.random() < 0.08:  # 出なかった例は間引く（重みで補正）
                train_rows.append(features(w, y))
                train_y.append(t)
        else:
            test.append((w, y, t))
coef = fit(train_rows, train_y)
coef[0] += math.log(0.08)  # 出なかった例を8%に間引いて学習したぶん、切片を戻す（確率を実際の水準に合わせる）
names = ["切片", "log頻度順位", "B2", "C1", "C2", "表外", "出た年度の割合", "出たことがある", "直近3年に出た", "学術語らしい語尾", "語の長さ"] + [f"{label}{k}" for label in PEER_LABEL for k in ("に出た", "に直近5年")]
print(f"\n== 3. 予測モデル（{FIRST}〜{SPLIT}年度で学習）の係数 ==")
print("  ".join(f"{n}={c:+.2f}" for n, c in zip(names, coef)))

scored = [(predict(coef, features(w, y)), t) for w, y, t in test]
scored.sort(reverse=True)
pos = sum(t for _, t in scored)
print(f"\n検証（{SPLIT + 1}〜{years[-1]}年度、学習にもモデルの設計にも使っていない）: 候補 {len(scored)} 語年のうち実際に出たのは {pos}（{100 * pos / len(scored):.2f}%、予測の平均は {100 * sum(p for p, _ in scored) / len(scored):.2f}%）")
validation = []
for frac in (0.01, 0.05, 0.2):
    top = scored[: int(len(scored) * frac)]
    hit = sum(t for _, t in top)
    validation.append({"top": frac, "hit": hit / len(top), "share": hit / pos, "lift": hit / len(top) / (pos / len(scored))})
    print(f"  予測上位 {int(frac * 100):2d}%: 的中率 {100 * hit / len(top):5.2f}%（全体の {100 * hit / pos:4.1f}% を拾う、ランダムの {hit / len(top) / (pos / len(scored)):.1f} 倍）")

# ---------- 4. 書き出し ----------
# 検証が済んだら、全部の年度で学習し直して予測に使う
rows, labels = [], []
for y in years:
    if y < FIRST:
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
    return 1 / (1 + math.exp(-1.6 * (math.log(r) - math.log(HALF_KNOWN))))


out = []
for w in hard:
    p = predict(coef, features(w, next_year))
    if appear.get(w) or (level.get(w) in ("B1", "B2", "C1", "C2") and level.get(w) not in EASY):
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
    path = ROOT / "data" / f"{PROFILE}-words.tsv"
    # 難語ではないが本文に出た語（A2〜B1 など）も、回数だけ残す。速く読む練習の対象になる
    easy = sorted((w for w in appear if w not in set(hard) and len(w) >= 4 and level.get(w, "") != "A1" and not proper(w) and (w in level or rank.get(w, 10**9) > 1500)), key=lambda w: -total[w])
    with open(path, "w") as f:
        f.write(f"# {TITLE} 過去問({years[0]}-{years[-1]})の語彙集計。scripts/analyze-exams.py が作る。問題文は含まない\n")
        f.write("# 語\tレベル\t出た年度\t延べ回数\t覚える価値（次年度に出る見込み × まだ知らない見込み。難語以外は0）\n")
        for w, lv, ys, k, p in out:
            f.write(f"{w}\t{lv}\t{ys}\t{k}\t{p:.5f}\n")
        for w in easy:
            f.write(f"{w}\t{level.get(w, '-')}\t{','.join(str(y) for y in appear[w])}\t{total[w]}\t0\n")
    print(f"\n{path} に難語 {len(out)} 語、それ以外 {len(easy)} 語を書き出した")

    # 画面で見るための要約（src/data/analysis.json）。試験ごとに1項目
    import json

    summary_path = ROOT / "src" / "data" / "analysis.json"
    summary = json.loads(summary_path.read_text()) if summary_path.exists() else {}
    summary[PROFILE] = {
        "title": TITLE,
        "years": [years[0], years[-1]],
        "tokens": N,
        "levels": {lv: round(100 * agg[lv] / N, 1) for lv in ORDER} | {"表外": round(100 * agg["off"] / N, 1)},
        "types": {g: {"n": len(by_group[g]), "once": round(100 * sum(1 for x in by_group[g] if x == 1) / len(by_group[g]))} for g in by_group if g != "A1-B1" and by_group[g]},
        "repeat": {
            "from": FIRST,
            "bands": BAND,
            "history": H,
            "rate": [[round(100 * table[(b, h)][0] / table[(b, h)][1], 2) if table[(b, h)][1] else None for h in H] for b in range(4)],
        },
        "model": {
            "train": [FIRST, SPLIT],
            "test": [SPLIT + 1, years[-1]],
            "base": round(100 * pos / len(scored), 2),
            "rows": [{"top": int(v["top"] * 100), "hit": round(100 * v["hit"], 1), "share": round(100 * v["share"]), "lift": round(v["lift"], 1)} for v in validation],
        },
    }
    summary[PROFILE]["peers"] = peer_tables
    summary_path.write_text(json.dumps(summary, ensure_ascii=False, indent=1) + "\n")
    for label, slug, t in zip(PEER_LABEL, PEER_SLUG, peers):
        if not slug:
            continue
        keep = sorted((w for w in t if len(w) >= 4 and not proper(w) and (w in level or rank.get(w, 10**9) > 1500)), key=lambda w: (-len(t[w]), w))
        ys = sorted({x for xs in t.values() for x in xs})
        (ROOT / "data" / f"{slug}-words.tsv").write_text(
            f"# {label} 過去問({ys[0]}-{ys[-1]})に出た語と年度。scripts/analyze-exams.py が作る。問題文は含まない\n# 語\tレベル\t出た年度\n"
            + "".join(f"{w}\t{level.get(w, '-')}\t{','.join(map(str, t[w]))}\n" for w in keep)
        )
        print(f"data/{slug}-words.tsv に {len(keep)} 語を書き出した")
    print(f"{summary_path} を更新した")
