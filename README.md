# Moji-xotol

大学受験の英単語（共通テスト〜京大）で遊ぶ、文字タイル式の単語パズル。
和訳を見て、手札の文字で盤面の単語を完成させる。

- **モード**: 共テ重点 / 難関2次重点 / 京大重点。出題される語の層の確率が変わる（`src/core/words.ts` の `MODE_WEIGHTS`）
- **層の定義**: 共テ = CEFR A1〜B1、難関2次 = B2、京大 = C1〜C2
- **判定**: 並びが実在の英単語なら成立。出題語なら高得点、それ以外の実在語は別解として低得点

## 使い方

```sh
npm install
npm run dev      # 開発サーバー
npm test         # テスト
npm run build    # dist/ に静的ファイルを出力
npm run dict     # data/raw から辞書を再生成
npm run measure  # 盤面生成器の成功率・速度・層分布を計測
```

URL に `?seed=数値` を付けると同じ盤面を再現できる。

データの出典とライセンスは [data/SOURCES.md](data/SOURCES.md)。
