# データベース & スキーマ運用ガイド

本ドキュメントでは、EPGDeck のデータベース構成、Drizzle ORM によるスキーマ定義、DTO/Entity 構造、および EPGStation (v2.10.0) 完全互換ポリシーについて解説します。

---

## 1. サポートするデータベース

EPGDeck は以下の 2 種類のデータベースエンジンをサポートしています。

- **SQLite3** (デフォルト): `@libsql/client` を使用し、ローカルファイル（`data/database.db`）で手軽に動作します。
- **MySQL / MariaDB** (推奨): `mysql2` を使用し、大規模運用や高速な検索に適しています。必ず文字コードを `utf8mb4` に設定してください。

---

## 2. ディレクトリ構成

- **Drizzle Schema 定義**: `src/db/schema/`
  - `sqlite/`: SQLite 用 Drizzle テーブル定義 (`channels.ts`, `programs.ts`, `recorded.ts`, `reserves.ts`, `rules.ts` 等)
  - `mysql/`: MySQL 用 Drizzle テーブル定義
- **DTO / Entity 定義**: `src/db/entities/`
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
- **DB クライアントファクトリ**: `src/db/drizzle.ts`
- **DB 操作モデル (DAO)**: `src/model/db/`
  - `DrizzleOperator.ts`: 初回接続確認および自動テーブル初期化
  - `ProgramDB.ts`, `RecordedDB.ts`, `ReserveDB.ts`, `RuleDB.ts` 等: 各エンティティの CRUD クエリ

---

## 3. EPGStation 完全互換ポリシー

EPGDeck は **EPGStation v2.10.0 との 100% データベース互換性** を維持しています。

1. **新規セットアップ時の自動テーブル生成**:
   - 初回起動時、`DrizzleOperator.checkConnection()` により EPGStation v2.10.0 と同一構造のテーブル群が自動生成されます。
2. **既存環境からのシームレス移行**:
   - 既存の EPGStation で使用していた SQLite DB ファイル（`data/database.db`）または MySQL データベースをそのまま指定するだけで、データ移行作業なしですぐに動作します。

---

## 4. スキーマ変更手順

テーブル構造やカラムを追加・変更する場合は、以下の手順に従って SQLite と MySQL の双方で整合性を保ってください。

### ① Drizzle Schema の更新
`src/db/schema/sqlite/` および `src/db/schema/mysql/` 配下の該当テーブル定義にカラムを追加・修正します。

### ② DTO / Entity クラスの更新
`src/db/entities/` 配下の該当クラスにプロパティを追加・修正します。

### ③ DrizzleOperator の初期化 DDL の同期
`src/model/db/DrizzleOperator.ts` 内の `CREATE TABLE IF NOT EXISTS` クエリに新カラム定義を反映します。

### ④ DB 操作モデル (DAO) の更新
`src/model/db/*DB.ts` の `toRow()`, `toEntity()`, `insert*()`, `find*()` 等のデータマッピング処理を更新します。

---

## 5. 破壊的変更に関するガイドライン

- 既存のカラム削除やデータ型の互換性破壊など、過去の録画データや予約ルールに影響を及ぼす変更は避けてください。
- 既存ユーザーの録画アーカイブ（15,000 件超の運用など）を安全に維持するため、破壊的変更が必要な場合は必ず事前に合意を得てください。

