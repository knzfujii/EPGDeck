# データベース & マイグレーション運用ガイド

本ドキュメントでは、EPGDeck のデータベース構成、Entity 定義の変更手順、および TypeORM によるマイグレーション管理について解説します。

---

## 1. サポートするデータベース

EPGDeck は以下の 2 種類のデータベースエンジンをサポートしています。

- **SQLite3** (デフォルト): 設定不要で手軽に動作します。
- **MySQL / MariaDB** (推奨): 大規模運用や高速な検索に適しています。必ず文字コードを `utf8mb4` に設定してください。

---

## 2. ディレクトリ構成

- **Entity 定義**: `src/db/entities/`
  - `Program.ts`: 番組情報
  - `Recorded.ts`: 録画済み番組
  - `RecordedHistory.ts`: 録画履歴
  - `RecordedTag.ts`: タグ
  - `Reserve.ts`: 予約情報
  - `Rule.ts`: 自動予約ルール
  - `Channel.ts`: 放送局・チャンネル
  - `Thumbnail.ts`: サムネイル情報
  - `VideoFile.ts`: 録画動画ファイル情報
  - `DropLogFile.ts`: ドロップログファイル情報
- **マイグレーションファイル**: `src/db/migrations/`
  - `sqlite/`: SQLite 専用マイグレーション
  - `mysql/`: MySQL 専用マイグレーション
- **TypeORM 設定**: `ormconfig.js`

---

## 3. スキーマ変更とマイグレーションの作成手順

Entity にフィールドを追加・変更した場合は、必ず SQLite と MySQL の両方のマイグレーションを生成してコミットしてください。

### ① Entity ファイルの修正
`src/db/entities/` 配下の該当する Entity クラスにプロパティやカラム定義（`@Column` 等）を追加・修正します。

### ② マイグレーションファイルの生成
以下のコマンドで、Entity 定義と DB の差分からマイグレーションコードを自動生成します。

```bash
# SQLite 用マイグレーションの生成
$ npm run orm-gen --db=sqlite --name=AddFeatureColumn

# MySQL 用マイグレーションの生成
$ npm run orm-gen --db=mysql --name=AddFeatureColumn
```

### ③ 生成されたマイグレーションの確認と修正
`src/db/migrations/<db>/<timestamp>-<name>.ts` に生成されたマイグレーションコードの `up` / `down` メソッドを確認し、必要に応じてデータ移行処理を追加します。

### ④ マイグレーションの実行
```bash
$ npm run orm-run
```

---

## 4. 破壊的変更に関するガイドライン

- 既存のカラム削除や型変更など、過去の録画データや予約ルールに影響を及ぼす変更を行う場合は、**既存データが破損しないマイグレーションパスを必ず用意**してください。
- 既存ユーザーのデータを尊重し、不可逆な変更が必要な場合は事前に十分な検討を行ってください。
