#!/usr/bin/env python3
"""品詞つきの和訳を作る。

出典の役割分担:
  - 品詞の一覧: CEFR-J Wordlist / Octanove（語ごとの品詞とレベル）。そこにない語は Princeton WordNet 3.0 の品詞と使用頻度
  - 語義の並び順: WordNet の語義ごとの使用頻度（SemCor の出現回数）と日本語 WordNet（NICT）の訳語、
    それに JMdict（EDRDG）の逆引き（その英語を訳語に持つ日本語。常用語ほど重い）
  - 訳語そのもの: ejdict-hand。語義を1つずつ品詞に振り分け、その語が持たない品詞の語義は捨てる。
    ejdict にその品詞の訳がないときだけ、JMdict の常用語で補う

使い方: python3 -I scripts/build-glosses.py <WordNet を展開した場所> <jmdict-eng-*.json>
  WordNet の場所には wordnet/index.noun … cntlist.rev（nltk_data の wordnet.zip）と wnjpn-ok.tab を置く。
  JMdict は scriptin/jmdict-simplified の jmdict-eng（JSON）。
出力: data/glosses.tsv（語, 品詞の並び, 品詞つきの和訳）
"""
import collections
import csv
import json
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw"
WN = pathlib.Path(sys.argv[1])

POS_JA = {"n": "名", "v": "動", "a": "形", "r": "副"}
CEFR_POS = {"noun": "n", "verb": "v", "adjective": "a", "adverb": "r"}
ORDER = ["A1", "A2", "B1", "B2", "C1", "C2"]

# ---------- 品詞の一覧（CEFR-J / Octanove） ----------
cefr = collections.defaultdict(dict)  # word -> {pos: level}
for name in ["cefrj-vocabulary-profile-1.5.csv", "octanove-vocabulary-profile-c1c2-1.0.csv"]:
    with open(RAW / name, encoding="utf-8-sig") as f:
        for row in csv.DictReader(f):
            w = row["headword"].split("/")[0].strip().lower()
            p = CEFR_POS.get(row["pos"].strip())
            lv = row["CEFR"]
            if p and lv in ORDER and re.fullmatch(r"[a-z]+", w):
                if p not in cefr[w] or ORDER.index(lv) < ORDER.index(cefr[w][p]):
                    cefr[w][p] = lv

# ---------- WordNet ----------
index = {}  # (lemma, pos) -> [synset offset, ...]（使用頻度順）
for p, name in {"n": "noun", "v": "verb", "a": "adj", "r": "adv"}.items():
    for line in open(WN / "wordnet" / f"index.{name}"):
        if line.startswith(" "):
            continue
        parts = line.split()
        np = int(parts[3])
        index[(parts[0], p)] = parts[4 + np + 2:]
count = {}  # (lemma, pos, 語義番号) -> SemCor での出現回数
for line in open(WN / "wordnet" / "cntlist.rev"):
    key, sn, c = line.split()
    lemma, rest = key.split("%")
    p = {1: "n", 2: "v", 3: "a", 4: "r", 5: "a"}[int(rest.split(":")[0])]
    count[(lemma, p, int(sn))] = int(c)
ja = collections.defaultdict(list)  # synset -> 日本語の訳語
for line in open(WN / "wnjpn-ok.tab", encoding="utf-8"):
    cols = line.rstrip("\n").split("\t")
    if len(cols) >= 2:
        ja[cols[0]].append(cols[1])


def wn_pos(w):
    """WordNet での品詞ごとの使用回数"""
    out = {}
    for p in "nvar":
        offs = index.get((w, p))
        if offs:
            out[p] = sum(count.get((w, p, i + 1), 0) for i in range(len(offs)))
    return out


def wn_senses(w, p):
    """[(重み, 日本語の訳語の集合)]。重みは語義の使用回数 + 順位の分"""
    out = []
    offs = index.get((w, p), [])
    for i, o in enumerate(offs[:6]):
        lemmas = ja.get(f"{o}-{p}") or (ja.get(f"{o}-s") if p == "a" else None) or []
        out.append((count.get((w, p, i + 1), 0) + 1.0 / (i + 1), set(lemmas)))
    return out


# ---------- JMdict の逆引き ----------
# (英語, 品詞) -> {日本語: (重み, 読み)}。英語の1語がそのまま訳語になっている日本語だけを拾う
jm = collections.defaultdict(dict)
SKIP_MISC = {"arch", "obs", "rare", "sl", "vulg", "derog", "X", "obsc", "poet", "dated", "hist", "net-sl", "joc", "m-sl", "fam", "chn"}
if len(sys.argv) > 2:
    for e in json.load(open(sys.argv[2], encoding="utf-8"))["words"]:
        if not e["kana"]:
            continue
        common = any(k["common"] for k in e["kanji"] + e["kana"])
        kana = e["kana"][0]["text"]
        for si, sense in enumerate(e["sense"]):
            misc = set(sense.get("misc", []))
            if misc & SKIP_MISC:
                continue
            tags = sense.get("partOfSpeech", [])
            text = kana if "uk" in misc or not e["kanji"] else e["kanji"][0]["text"]
            for gi, g in enumerate(sense["gloss"]):
                narrow = "(" in g["text"]  # 「to sustain (damage)」のように、場面を限った訳
                en = re.sub(r"\s*\([^)]*\)", "", g["text"]).strip().lower()
                verb = en.startswith("to ")
                en = en[3:] if verb else en
                # カタカナ語（英語をそのまま写しただけの語）は、訳の手がかりにならない
                if not re.fullmatch(r"[a-z]+", en) or re.fullmatch(r"[ァ-ヶー・]+", text):
                    continue
                form = text
                if verb:
                    p = "v"
                    if "vs" in tags and not any(t.startswith("v") and t not in ("vs", "vt", "vi") for t in tags):
                        form += "する"
                elif any(t.startswith("adj") for t in tags):
                    p = "a"
                    form += "な" if "adj-na" in tags else "の" if "adj-no" in tags and "adj-i" not in tags else ""
                elif any(t.startswith("adv") for t in tags):
                    p = "r"
                elif any(t in ("n", "vs", "pn", "n-suf", "n-pref") for t in tags):
                    p = "n"
                else:
                    continue
                weight = (3.0 if common else 1.0) * (1.0, 0.6)[min(gi, 1)] * (1.0 if si == 0 else 0.7) * (0.3 if narrow else 1.0)
                if weight > jm[(en, p)].get(form, (0, ""))[0]:
                    jm[(en, p)][form] = (weight, kana)

# ---------- ejdict ----------
ej = {}
for line in open(RAW / "ejdict-hand.txt", encoding="utf-8"):
    if "\t" not in line:
        continue
    head, body = line.rstrip("\n").split("\t", 1)
    for h in head.split(","):
        ej.setdefault(h.strip(), body)

VERB_END = re.compile(r"(する|[うくぐすつぬぶむる])$")
ADJ_END = re.compile(r"(い|な|の|的な|した|ている|れた|がちな|らしい|っぽい)$")
ADV_END = re.compile(r"(に|く|と|て|で|も|ら|り|ば|が|ず)$")


def classify(raw, clean, word, allowed):
    """ejdict の語義1つが、どの品詞のものかを訳語の形から決める。allowed はその語が取りうる品詞"""
    head = clean.split("、")[0]
    if len(allowed) == 1:
        # 品詞が1つしかない語は、ほぼその品詞。ただし名詞だけの語に「…の」「…している」の形の訳が来たら、
        # 語彙表が認めていない形容詞用法なので捨てる（component の「成分の」など）
        if allowed[0] == "n" and "〈C〉" not in raw and "〈U〉" not in raw and re.search(r"(の|な|している|した|的)$", head):
            return None
        return allowed[0]
    score = {p: 0.0 for p in allowed}

    def add(p, v):
        if p in score:
            score[p] += v

    verb_like = bool(VERB_END.search(head)) and not re.search(r"(ある|ない|いる)$", head)
    adj_like = bool(ADJ_END.search(head)) or bool(re.search(r"(のある|がある|ある|ない)$", head))
    if "〈C〉" in raw or "〈U〉" in raw:
        add("n", 5)
    if re.match(r"^(《[^》]*》)?(\([^)]*\))?\s*(…|〈[^〉]*〉(を|に|が|から|と|へ)|〈[^〉]*(が|は)〉)", raw.strip()) or re.search(r"…(を|に|と|から|へ)", head):
        add("v", 4)
    if verb_like:
        add("v", 2.5)
        if "v" not in score:  # 動詞がない語で「…できる」「…する」の形なら、形容詞の訳（portable = 持ち運びのできる）
            add("a", 2)
    if adj_like:
        add("a", 2.5 if not head.endswith("の") else 1.5)
    if re.search(r"(して|て|で)$", head):
        add("a" if "r" not in score else "r", 2)
    if ADV_END.search(head):
        add("r", 2.5)
    if word.endswith("ly"):
        add("r", 1.5)
    if not verb_like and not adj_like and not ADV_END.search(head):
        add("n", 2)
    best = max(score, key=lambda p: score[p])
    return best if score[best] > 0 else None


def clean_sense(raw):
    s = re.sub(r"《[^》]*》", "", raw)
    s = re.sub(r"^[^《〈]*》", "", s)  # 入れ子の注記の残り
    s = s.replace("〈C〉", "").replace("〈U〉", "").replace("『", "").replace("』", "")
    s = re.sub(r"\([^)]*\)", "", s)
    s = re.sub(r"^=.*$", "", s)
    s = re.sub(r"\s+", "", s)
    if not s or re.search(r"[a-zA-Z]{3,}", s):
        return ""
    # 〈…〉の中の区切りは、訳語の区切りではない
    s = re.sub(r"〈[^〉]*〉", lambda m: m.group(0).replace(",", "・").replace(";", "・"), s)
    # 区切りが抜けて「…を引き受ける〈責任〉を負う」と続いている所を切る
    s = re.sub(r"(?<=[るうくすつむぶぐ])(?=〈)", ",", s)
    seen, words = set(), []
    for w in re.split(r"[,;:]", s):
        w = w.strip(",;:　 ")
        if w and w not in seen:
            seen.add(w)
            words.append(w)
    return "、".join(words[:3])


def proper_use(raw):
    """《the A-》のように、大文字で始まる特別な用法の語義（Assumption = 聖母被昇天 など）"""
    return bool(re.match(r"^\s*《(the\s+)?[A-Z]", raw))


def overlap(sense, lemmas):
    """ejdict の語義と WordNet の訳語が同じ意味を指しているか（文字の重なりで見る）"""
    best = 0
    plain = re.sub(r"[…〈〉をにがのはと、]", "", sense)
    for l in lemmas:
        stem = re.sub(r"(する|な|の|に|い)$", "", l)
        if len(stem) >= 2 and stem in plain:
            best = max(best, len(stem))
        elif any(re.search(r"[一-龥]", l[i:i + 2]) and l[i:i + 2] in plain for i in range(len(l) - 1)):
            best = max(best, 1)
    return best


def build(word, levels=None):
    """(品詞の並び, 品詞つきの和訳)"""
    wn = wn_pos(word)
    total = sum(wn.values()) or 1
    if levels:  # CEFR-J にある語: その品詞を、やさしい順に
        inventory = sorted(levels, key=lambda p: (ORDER.index(levels[p]), -wn.get(p, 0)))
    elif wn:  # ない語: WordNet で使用回数の多い品詞。ごく少ない品詞は捨てる
        top = max(wn.values())
        inventory = [p for p in sorted(wn, key=lambda p: -wn[p]) if wn[p] >= max(1, top * 0.2) or len(wn) == 1]
        if not inventory:  # 使用回数の記録がない語は、WordNet にある品詞を全部
            inventory = list(wn)
    else:
        return "", ""
    # 訳語の形から品詞を決める。候補は、WordNet がその語に認める品詞と、CEFR-J の品詞
    allowed = list(dict.fromkeys(list(inventory) + list(wn)))
    groups = collections.defaultdict(list)
    body = ej.get(word)
    if body:
        # 語義の区切りは「 / 」。区切りが抜けて空白だけになっている項目（call など）は、日本語どうしの間の空白でも切る
        for raw in re.split(r" / |(?<=[^ -~]) (?=[^ -~])", body):
            clean = clean_sense(raw)
            if clean:
                p = classify(raw, clean, word, allowed)
                if p:
                    groups[p].append((clean, proper_use(raw)))
    # CEFR-J にない品詞でも、WordNet でよく使われ（全体の3割以上）、ejdict に訳があれば加える
    for p in sorted(groups, key=lambda p: -wn.get(p, 0)):
        if p not in inventory and wn.get(p, 0) / total >= 0.3:
            inventory.append(p)
    inventory = inventory[:3]
    several = len(inventory) > 1

    parts, used = [], []
    for p in inventory:
        senses = groups.get(p, [])
        wsenses = wn_senses(word, p)
        jwords = jm.get((word, p), {})
        text = []
        if senses:
            # WordNet でよく使われる語義に当たる訳を前へ
            top = max((w for w, _ in wsenses), default=0) or 1
            jtop = max((w for w, _ in jwords.values()), default=0) or 1

            def rank(item):
                i, (sense, special) = item
                score = 0
                for weight, lemmas in wsenses:
                    if overlap(sense, lemmas):
                        score = max(score, weight / top)
                # JMdict でその英語の訳語になっている日本語が、この語義に入っているか（かな書きでも当てる）
                votes = sum(w for form, (w, kana) in jwords.items() if overlap(sense, [form] + ([kana] if len(kana) >= 3 else [])))
                # WordNet で最も使われる語義は動かさない。JMdict の票は、それ以外の順位を決める
                return (special, -(score + 0.6 * min(votes / jtop, 1.0)), i)

            seen, size = set(), 0
            for sense, _ in [x for _, x in sorted(enumerate(senses), key=rank)]:
                words = [w for w in sense.split("、") if w not in seen]
                words = words[: 2 if several or sum(map(len, words)) > 16 else 3]
                if not words:
                    continue
                piece = "、".join(words)
                if text and size + len(piece) > (26 if several else 44):
                    break
                seen.update(words)
                text.append(piece)
                size += len(piece)
                if len(text) >= 3:
                    break
        elif any(w >= 1.8 for w, _ in jwords.values()):
            # ejdict にその品詞の訳がなければ、JMdict で常用語とされている訳語で補う
            text = [f for f, (w, _) in sorted(jwords.items(), key=lambda kv: -kv[1][0]) if w >= 1.8][:2]
            text = ["、".join(text)]
        elif body:
            # それもなければ、日本語 WordNet の訳語で補う。
            # ただし ejdict の本文にも現れる訳語だけを使う（片方にしかない訳語は当てにしない）
            for _, lemmas in wsenses[:3]:
                for l in sorted(lemmas, key=len):
                    stem = re.sub(r"(する|な|の|に)$", "", l)
                    if len(stem) >= 2 and stem in body and l not in text and len(text) < 2:
                        text.append(l)
        if text:
            parts.append(f"[{POS_JA[p]}] " + "／".join(text))
            used.append(p)
    if not parts and body:
        # どの品詞にも振り分けられなかったら、主な品詞の訳として最初の語義を出す
        first = next((clean_sense(r) for r in body.split(" / ") if clean_sense(r)), "")
        if first:
            return inventory[0], f"[{POS_JA[inventory[0]]}] {first}"
    if not parts:
        # ejdict に見出しがない語（philosophical など）は、JMdict の訳語、なければ日本語 WordNet の訳語を使う。漢字を含む短い訳語を優先
        for p in inventory:
            best = [f for f, (w, _) in sorted(jm.get((word, p), {}).items(), key=lambda kv: -kv[1][0])][:2]
            if best:
                return p, f"[{POS_JA[p]}] " + "、".join(best)
        for p in inventory:
            for _, lemmas in wn_senses(word, p)[:2]:
                good = sorted((l for l in lemmas if re.search(r"[一-龥]", l) and 2 <= len(l) <= 6), key=len)[:2]
                if good:
                    return p, f"[{POS_JA[p]}] " + "、".join(good)
    return "".join(used), "　".join(parts)


if __name__ == "__main__":
    words = [row[0] for row in json.loads((ROOT / "src" / "data" / "words.json").read_text())]
    out, empty = [], 0
    for w in words:
        pos, gloss = build(w, cefr.get(w))
        if gloss:
            out.append(f"{w}\t{pos}\t{gloss}")
        else:
            empty += 1
    path = ROOT / "data" / "glosses.tsv"
    path.write_text("# 品詞つきの和訳。scripts/build-glosses.py が作る（出典は data/SOURCES.md）\n# 語\t品詞（n名 v動 a形 r副、主な順）\t和訳\n" + "\n".join(out) + "\n", encoding="utf-8")
    print(f"{path}: {len(out)} 語（訳を作れなかった語 {empty}）")
