# AGENTS.md - AIエージェント行動指針 (Agent Guidelines)

本リポジトリ（EPGDeck）で作業を行うすべての AI アシスタント・自律エージェントは、以下のプロジェクト共通の原則・品質基準を厳守すること。

---

## 1. 基本姿勢・技術思想 (Core Philosophy)

- **上流への敬意と背景調査原則**:
  - EPGStation（l3tnun 氏）の著作権と設計を尊重しつつ、EPGDeck としての大胆な設計刷新を推進する。
  - 上流から引き継いだ一見不自然なコード（例: 重複調停キー等）があっても安易に「バグ」と決めつけず、`git log -S` やコミット履歴、過去の Issue を精査し、過去の障害回避・エッジケース救済の意図を解明した上で判断する。
- **仮説と実データの検証**:
  - 仕様上の懸念が生じた際は、コードの字面だけで推測せず、日本の放送規格（ARIB 外字・表記実態）や実データベースと突き合わせて客観的に影響度を評価する。
- **標準的・王道な設計の徹底 (Idiomatic Practices)**:
  - 長期的な保守性と可読性を最優先とし、アドホックな回避策や場当たりハックを避ける。
  - エコシステム（Node.js, TypeScript, Playwright, Drizzle, Hono, Svelte 5 等）が提供する標準・公式推奨プラクティスを採用する。
- **破壊的変更の事前合意**:
  - DB スキーマ、設定形式、公開 API 変更など既存環境に影響する変更は必ず事前に合意を得る。

---

## 2. 品質保証・テスト・CI/CD 規約 (Quality & Testing)

### 2.1. テスト戦略
- **テスト同封と継続保守**: 機能追加・バグ修正時は必ず対応するテスト（単体／結合／E2E）を作成・更新する（skip による放置は禁止）。
- **スコープ別テスト実行**:
  - **サーバー単体 (`npm test`)**: SQLite インメモリで超高速（約1.5秒）実行。
  - **クライアント純粋ロジック (`test/client/`)**: 座標計算・日付判定・文字列処理等は `client/src/lib/utils/` に純粋関数として集約し、Vitest で高速・網羅的に境界値テストを実施。
  - **画面・UI変更時の E2E 検証 (`npm run check` / `npm run test:e2e`)【最重要・義務】**:
    - **UI変更時の絶対原則**: `client/` 配下のファイル（コンポーネント、ルーティング、スタイル、ストア等）を1行でも変更した場合は、**必ず Playwright E2E テスト（`npm run test:e2e` または `npm run check`）を全件実行し、100% PASS を確認すること**。
    - **重大な規律違反（絶対厳禁）**: 画面・UI を変更したにもかかわらず E2E テストを実行しないまま完了報告やコミット承認要請を行うことは、品質保証上の重大な怠慢・規律違反とする。
    - **マルチデバイス視点の徹底**: スマホ（390px / ドロワー、カード表示）、タブレット（768px）、PC（1280px / サイドバー、テーブル表示）で動作・DOM構造が異なるため、特定の画面幅に依存したセレクタ設計やレスポンシブ崩れを放置しないこと。
    - **Svelte 5 Runes の落とし穴防止**: `$effect` 内で URL クエリと状態変数を同期する際は、状態変数を直接参照せず必ず `untrack` で囲み、入力値が即時空文字にリセットされる不具合を防止すること。
  - **DB 結合テスト (`npm run test:mysql`)**: DB 方言やクエリ層の変更時に `TEST_MYSQL=true` で検証。
- **テスト環境・DBの完全分離**:
  - 本番・開発用 DB（`data/database.db`）および `config/config.yml` を絶対に参照・変更しない。
  - E2E テストは `data/test_e2e.db` と `config/config.test.yml` を使用し、Mirakurun 不要のスタンドアロンで自律稼働する構造を維持する。
- **E2E ロケータ設計原則**:
  - CSS クラス依存を排し、アクセシビリティ要素（`getByRole`, `getByLabel`）または `getByTestId`（`data-testid`）を使用する。
  - 部分一致を活用し、サブテキスト追加等の軽微な UI 改修でテストが落ちない柔軟なセレクタ設計とする。
  - レスポンシブ等で同一テキストが複数存在する場合は、親要素（`table`, `dialog` 等）や `first()` でコンテキストを限定して Strict Mode 違反を防ぐ。

### 2.2. コード品質・コミット基準
- **フォーマッタ先行実行**: コミット前に必ずコードフォーマッタ（`npm run format` およびクライアント用フォーマット）を実行し、整形済みの状態でステージング・コミットを行う。
- **総合品質チェックの 100% PASS (DoD)**: コミット提案前に必ず `npm run check`（Linter, 型チェック, ビルド, **E2E テスト**）の全パスを確認し、通過結果（件数・エビデンス）をユーザーに明示する。
- **非同期処理の厳格管理**: `no-floating-promises`（未待機 Promise は `await` か `void`）、`no-async-promise-executor`（`new Promise(async ...)` 禁止）を遵守。
- **ドキュメントの同期**: 仕様変更・知見は `docs/` 配下の専門ドキュメントに即時反映し、完了したタスクは `docs/TODO.md` から適切に整理する。
- **CI/CD コスト最適化**: GitHub Actions では VM 起動オーバーヘッド削減のため無駄な別ジョブ分割を避け、`paths-ignore` と `concurrency` を維持する。

---

## 3. 詳細設計・ドメイン仕様リファレンス (Documentation Index)

コンテキスト最適化のため、ドメイン固有の詳細仕様・実装規約は `docs/dev/` 配下の専門ドキュメントに責務を委ねている。
**エージェントは各機能の実装・改修・調査を行う際、必ず以下の対応ドキュメントをオンデマンドで参照すること。**

| 対象領域 | 参照ドキュメント | 主な掲載内容 |
| :--- | :--- | :--- |
| **全体設計・構造** | [`docs/dev/architecture.md`](docs/dev/architecture.md) | システム全体アーキテクチャ、ディレクトリ構成、レイヤー分離、状態管理 |
| **機能仕様・EPGStation差分** | [`docs/dev/epgdeck_change_spec.md`](docs/dev/epgdeck_change_spec.md) | 番組表（朝4時起点境界・局名ヘッダー48px）、録画中3択操作、未受信波非表示、検索キーワード抽出、UI改善点 |
| **予約・重複調停ロジック** | [`docs/dev/reservation-algorithm.md`](docs/dev/reservation-algorithm.md) | 予約重複判定、プライオリティ制御、二重録画防止（`recorded_history`）仕様 |
| **動画配信・字幕・Svelte** | [`docs/dev/streaming-and-captions.md`](docs/dev/streaming-and-captions.md) | HLS/MP4 配信、ARIB B24 字幕（ID3/WebVTT）、FFmpeg オプション（`-fix_sub_duration`）、Svelte 5 リアクティビティ規約 |
| **テスト詳細・E2E規約** | [`docs/dev/testing.md`](docs/dev/testing.md) | 単体・結合・E2E テスト詳細、フィクスチャ、モック戦略、DB 分離手順 |
| **REST API 仕様** | [`docs/dev/api.md`](docs/dev/api.md) | Hono API エンドポイント、リクエスト/レスポンススキーマ |
| **データベース仕様** | [`docs/dev/database.md`](docs/dev/database.md) | Drizzle ORM スキーマ定義、マイグレーション運用 |
| **進捗・残タスク** | [`docs/TODO.md`](docs/TODO.md) | 機能開発ロードマップ、未解決 Issue、完了済みタスク |
