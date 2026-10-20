# 4人将棋（yonin-shogi）

スマホのブラウザで、友達4人とオンライン対戦できる4人将棋です。CPU3人と対戦するモードと、1台を4人で回して遊ぶモードもあります。

- ルール仕様書: https://claude.ai/code/artifact/89dd005e-60e2-47c3-ba2b-ccb29e53fc11
- ルールエンジン: `src/engine/`
- オンライン対戦（Firebase Realtime Database）: `src/online/`

## 開発

```sh
npm install
npm test        # ルールとオンライン同期のテスト
npm run dev     # http://localhost:5173 で起動
```

`?backend=memory` を付けて開くと、Firebaseなしでオンライン画面の動作を確認できます（そのページの中だけで動きます）。

## オンライン対戦の設定

1. Firebaseでプロジェクトを作り、Realtime Databaseを作成する（無料のSparkプランのまま）。
2. Webアプリを追加し、表示された設定値を `src/online/config.ts` に貼る。
3. Realtime Databaseの「ルール」タブに `database.rules.json` の内容を貼って公開する。

## 公開

`main` に push すると、GitHub Actions が GitHub Pages に公開します（リポジトリの Settings → Pages で Source を「GitHub Actions」にしておく）。
