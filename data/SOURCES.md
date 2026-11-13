# データの出典とライセンス

| ファイル | 内容 | 出典 | 利用条件 |
|---|---|---|---|
| `raw/cefrj-vocabulary-profile-1.5.csv` | A1〜B2 の語彙レベル | The CEFR-J Wordlist Version 1.5. Compiled by Yukio Tono, Tokyo University of Foreign Studies.（[olp-en-cefrj](https://github.com/openlanguageprofiles/olp-en-cefrj) 経由） | 出典を明示すれば研究・商用とも無償で利用可。著作権は東京外国語大学 投野研究室 |
| `raw/octanove-vocabulary-profile-c1c2-1.0.csv` | C1〜C2 の語彙レベル | Octanove Vocabulary Profile C1/C2 ver 1.0（Octanove Labs、同上リポジトリ） | CC BY-SA 4.0 |
| `raw/ejdict-hand.txt` | 英和の和訳 | [ejdict-hand](https://github.com/kujirahand/EJDict) | パブリックドメイン |
| `raw/enable1.txt` | 判定辞書 | ENABLE word list（[dolph/dictionary](https://github.com/dolph/dictionary) 経由） | パブリックドメイン |

`src/data/words.json` と `public/valid.txt` は上記から `npm run dict` で生成する。
C1/C2 の語を含むため、生成物を再配布するときは CC BY-SA 4.0 の継承条件に従うこと。

和訳を直すときは `data/gloss-overrides.tsv`（`単語<TAB>和訳`、`#` 始まりはコメント）に書いて `npm run dict` を実行する。

`assets/xolotl.webp` はこのゲームの持ち主が用意したイラスト。アイコンとホームの帯に使う（`src/art.ts` に切り出して埋め込み）。
