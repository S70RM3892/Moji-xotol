# データの出典とライセンス

| ファイル | 内容 | 出典 | 利用条件 |
|---|---|---|---|
| `raw/cefrj-vocabulary-profile-1.5.csv` | A1〜B2 の語彙レベル | The CEFR-J Wordlist Version 1.5. Compiled by Yukio Tono, Tokyo University of Foreign Studies.（[olp-en-cefrj](https://github.com/openlanguageprofiles/olp-en-cefrj) 経由） | 出典を明示すれば研究・商用とも無償で利用可。著作権は東京外国語大学 投野研究室 |
| `raw/octanove-vocabulary-profile-c1c2-1.0.csv` | C1〜C2 の語彙レベル | Octanove Vocabulary Profile C1/C2 ver 1.0（Octanove Labs、同上リポジトリ） | CC BY-SA 4.0 |
| `raw/ejdict-hand.txt` | 英和の和訳 | [ejdict-hand](https://github.com/kujirahand/EJDict) | パブリックドメイン |
| （リポジトリには置かない） | 品詞と、語義ごとの使用頻度 | Princeton WordNet 3.0（nltk_data の `wordnet.zip`） | WordNet License（出典を明示すれば自由に利用可） |
| （同上） | 語義と日本語の訳語の対応 | 日本語 WordNet 1.1 `wnjpn-ok.tab`（NICT、[bond-lab/wnja](https://github.com/bond-lab/wnja)） | 出典を明示すれば自由に利用可 |
| （同上） | 英語を訳語に持つ日本語（逆引き） | JMdict（Electronic Dictionary Research and Development Group、[jmdict-simplified](https://github.com/scriptin/jmdict-simplified) の `jmdict-eng`） | CC BY-SA 4.0 |
| `raw/enable1.txt` | 判定辞書 | ENABLE word list（[dolph/dictionary](https://github.com/dolph/dictionary) 経由） | パブリックドメイン |

`data/kyodai-words.tsv` は、京都大学の英語の過去問（2000〜2026年度の27年分）を OCR で読み取って数えた集計表。
`data/kyote-words.tsv` は、大学入学共通テスト・センター試験の英語（2004〜2026年度の23年分。school.js88.com の一覧から辿れる問題PDF）を同じ方法で数えた集計表。
語・語彙レベル・出た年度・延べ回数・覚える価値（予測値）だけを持ち、問題文は含まない。
過去問そのものは著作物なので、このリポジトリには置いていない。集計のやり方は `scripts/analyze-exams.py`。
OCR（tesseract）の語ごとの信頼度が75未満の語は、`scripts/ocr-clean.py` で落としてから数えている。`src/data/analysis.json` は同じ集計の要約（アプリの「分析」画面に出す表）。

`data/glosses.tsv` は品詞つきの和訳。`python3 -I scripts/build-glosses.py <WordNet を展開した場所> <jmdict-eng-*.json>` で作る。
訳語の大半は ejdict-hand のもので、WordNet・日本語 WordNet・JMdict は品詞の判定と語義の並べ替えに使う。ejdict に訳がない品詞・語だけ、JMdict（一部は日本語 WordNet）の訳語が入る。

`src/data/words.json` と `public/valid.txt` は上記から `npm run dict` で生成する。
C1/C2 の語と、JMdict 由来の訳語を含むため、生成物を再配布するときは CC BY-SA 4.0 の継承条件に従うこと。

和訳を直すときは `data/gloss-overrides.tsv`（`単語<TAB>和訳`、`#` 始まりはコメント）に書いて `npm run dict` を実行する。

`src/data/sentences.ts`（読み解くモードの例文）と `src/data/passages.ts`（粗読みモードの文章）は、このゲームのために書いたもの。

`assets/xolotl.webp` はこのゲームの持ち主が用意したイラスト。アイコンとホームの帯に使う（`src/art.ts` に切り出して埋め込み）。

`src/texture.css` には、漆喰のテクスチャ（このリポジトリで生成した画像）と、文字に添えるヒエログリフの字形を埋め込んでいる。字形は Noto Sans Egyptian Hieroglyphs の一部（SIL Open Font License 1.1）。
