# AGENTS.md - AIエージェント行動指針 (Agent Guidelines)

本リポジトリ（EPGDeck）で作業を行うすべての AI アシスタント・自律エージェントは、以下のプロジェクト共通の原則・品質基準を厳守すること。

---

## 1. プロダクトの目的・目指す形 (Vision & Purpose)

EPGDeck は、長年親しまれてきた EPGStation のデータ互換性を保ちながら、再構築されたテレビ録画・放送視聴プラットフォームである。

- **高信頼な録画インフラ (Reliability)**:
  - 24時間365日の無人稼働に耐え、録画失敗やデータ破損を決して起こさない。
  - 日本の放送規格（ARIB STD-B24 字幕、マルチ編成、臨時放送、ドロップ監視）に厳格・誠実に準拠する。
- **洗練された軽快な操作性 (Deck UX)**:
  - PC・スマホ・タブレット（PWA）のどのデバイスからでも、迷わず・サクサク・直感的に操作できる。
  - 膨大な番組表や数万件の録画ライブラリをストレスなく検索・予約・再生できる日常のテレビ操作盤（Deck）を提供する。

---

## 2. 基本姿勢・技術思想 (Core Philosophy)

- **標準的・王道な設計の徹底 (Idiomatic Practices)**:
  - 長期的な保守性と可読性を最優先とし、アドホックな回避策や場当たりハックを避ける。
  - エコシステム（Node.js, TypeScript, Playwright, Drizzle, Hono, Svelte 5 等）が提供する標準・公式推奨プラクティスを採用する。
- **既存データからの移行性の担保 (Data Migration Compatibility)**:
  - EPGStation の既存データベース（SQLite / MySQL）からスムーズに移行・運用開始できるデータ互換性を維持する。
  - アーキテクチャやコードベースは EPGDeck として独立・刷新されており、過去の実装に過度に縛られず、クリーンで標準的なコードを優先する。
- **破壊的変更の事前合意**:
  - DB スキーマ、設定形式、公開 API 変更など既存環境に影響する変更は必ず事前に合意を得る。
- **ユーザー体験（UX）のリアリティ (Pragmatic UX)**:
  - 単に「データが存在するか」の機械的な判定で済ませず、「ユーザーが実際の利用シーンでその画面を見たときに自然か（時間感覚やスケール感）」を常に吟味して仕様を決定する。
- **仮説と実データの検証 (Evidence-based)**:
  - 仕様上の懸念が生じた際は、コードの字面だけで推測せず、日本の放送規格（ARIB 外字・表記実態）や実データベース、テスト結果と突き合わせて客観的に影響度を評価する。
- **ブランチ戦略 (GitHub Flow)**:
  - **`main` は常にデプロイ可能な安定版**: `main` への直接 push は原則禁止とし、トピックブランチ（`feat/...`, `fix/...`, `chore/...` 等）から Pull Request（PR）を作成してマージする。
- **Git Worktree の利用規約 (`misc/worktree.sh`)**:
  - トピックブランチ等で git worktree を作成・セットアップする際は、手動の `git worktree add` ではなく、**`./misc/worktree.sh <branch-name> [target-path]`** の使用を推奨する。
  - 本スクリプトにより、未追跡の設定ファイル（`config/config.yml`、`config/enc_*.js`）のシンボリックリンクが自動作成され、共通ストレージ構成と整合した開発環境が即座にセットアップされる。既存 worktree へのリンク再適用は `./misc/worktree.sh --link-only <target-path>` で行う。
- **真因の局所解決（過剰防衛の禁止） (Minimal & Targeted Fix)**:
  - 不具合は「真因」に対して最も小さく、標準的な変更で解決する。
  - 「念のため」という推測で周辺コードに防波堤を広げたり、グローバル例外を握り潰すような過剰な対症療法（Over-engineering）は行わない。

---

## 3. 品質保証・テスト・CI/CD 規約 (Quality & Testing)

### 2.1. テスト・検証戦略
- **テスト同封と継続保守**: 機能追加・バグ修正時は必ず対応するテスト（単体／結合／E2E）を作成・更新する（skip 放置は禁止）。
- **フェーズ別の二段階検証プロトコル（ローカル高速反復 ＆ リモート E2E 委譲）**:
  - **1. ローカル開発・コミット承認要請前（DoD / 高速検証）**:
    - ローカルでの作業テンポと開発サイクルを最速化するため、コミット前の必須検証（DoD）は **`npm run check:quick`**（型チェック＋単体テスト＋クライアント構文チェック、約 2〜3 秒）とする。
    - 画面改修や UI 挙動を手元で確認したい場合のみ、対象スペック単体 `npm run test:e2e:file -- <spec-path>`（約 1.5 秒）を実行する。
  - **2. リモート PR / CI（総合 E2E 検証・マージ条件）**:
    - Playwright E2E テスト全件（全 69 シナリオ）および MariaDB/MySQL 結合テストは、GitHub Actions（PR トリガー）へ完全に委譲する。
    - PR 作成・更新時に自動実行される CI が 100% PASS していることを確認した上で `main` へマージする。
- **フロントエンド・UI 設計規約**:
  - **マルチデバイス視点の徹底**: スマホ（390px / ドロワー・カード）、タブレット（768px）、PC（1280px / サイドバー・テーブル）の各幅でレイアウト崩れがないか確認。
  - **Svelte 5 Runes の落とし穴防止**: `$effect` 内で URL クエリと状態変数を同期する際は、状態変数を直接参照せず必ず `untrack` で囲み、入力値のリセット不具合を防止すること。
  - **Tailwind CSS Utility-First 原則と Svelte 5 コンポーネント共通化の徹底**:
    - `app.css` にコンポーネントクラス（`.btn-*`, `.form-*`, `.divider-v`, `.card-base` 等）を定義することは**原則禁止**。
    - ボタン、フォーム部品、ディバイダー、カード等の共通化・再利用は CSS クラスではなく、必ず `client/src/lib/components/common/`（`Button`, `IconButton`, `Divider`, `Input`, `Select`, `Checkbox`, `Card` 等）の Svelte 5 コンポーネントとして実装・利用すること。
- **E2E テスト & 環境分離原則**:
  - **テスト環境の完全分離**: 本番 DB（`data/database.db`）や `config/config.yml` は参照せず、`data/test_e2e.db` と `config/config.test.yml` を使用するスタンドアロン構成を厳守。
  - **ロケータ設計**: CSS クラス依存を排し、アクセシビリティ要素（`getByRole`, `getByLabel`）や `data-testid`（`getByTestId`）を使用。複数ヒット時は親要素や `first()` でコンテキストを限定。
  - **ビデオ・フォーム検証**: `<video>` テストは `page.addInitScript` でデコードエラーをインターセプトし、HTML5 `required` 検証は空白文字でブラウザ標準検証を通過させてテスト。
- **DB 結合テスト (`npm run test:mysql`)**: DB 方言やクエリ層の変更時に `TEST_MYSQL=true` で検証。

### 2.2. タスク完了の標準ワークフロー（自律実行の義務）
エージェントは指示されたコードを書くだけの受動的対応を排し、**指示の有無にかかわらず以下の4ステップを必ず自律的に完遂すること**。

1. **実装 & テスト同封 (Implementation & Test)**: 目的の機能を実装し、境界値・エッジケースを網羅するテストを作成して PASS を確認。
2. **ボーイスカウトルール（自律的リファクタ） (Proactive Refactoring)**: 変更箇所の周辺にある重複ロジック、型定義（`any` 等）、不適切な命名、不要なコメントを整える（大幅な変更は提案にとどめる）。
3. **客観的自己レビュー（Diff 精査） (Self-Review)**: `git diff` を自ら精査し、不要なコードやデバッグログの混入、境界値考慮、設計パターン合致を確認。
4. **ドキュメント & 変更履歴の即時同期 (Documentation & Changelog Sync)**:
   - **現行仕様 (State) の更新**: 機能変更や UI 改修時は、対応する `docs/dev/*.md`（`ui_spec.md`, `architecture.md` 等）や `docs/manual/*.md` を最新の単一情報源（SSOT）として即座に上書き更新する。
   - **意思決定記録 (Why / ADR) の保護**: 設計判断の根拠、技術的検証結果、地雷回避の防護線（巻き戻し禁止理由）が生じた場合は、必ず `docs/dev/modernization-roadmap.md` に理由を体系的に記録する。
   - **変更履歴の更新**: ユーザー影響のある機能追加・変更・修正は、同一コミット対象として `CHANGELOG.md`（Keep a Changelog 形式）に即時追記する。
   - **TODO ボードの純化**: 完了タスクは `docs/TODO.md` から整理し、過去ログで肥大化させず未完了タスク専用ボードとしてのスリムな状態を維持する。

### 2.3. コード品質・コミット基準
- **フォーマッタ先行実行**: コミット前に必ず `npm run format` を実行し、整形済みの状態でステージング・コミットを行う。
- **総合品質チェック 100% PASS (DoD)**: プロダクションコード変更を伴うコミットでは必ず **`npm run check:quick`** の全パスを確認し、エビデンス（通過件数・エラー 0）を提示する。全件 E2E はリモート PR の GitHub Actions CI で保証する。
- **ドキュメント・非コード変更時のテスト免除規約**: `docs/**`, `*.md`, `.gitignore`, `LICENSE` 等、実行コードやビルド成果物に影響しないファイルのみの変更時は、テスト実行をスキップし、フォーマッタ確認および差分レビューのみでコミット承認要請を行ってよい。
- **非同期処理の厳格管理**: `no-floating-promises`（未待機 Promise は `await` か `void`）、`no-async-promise-executor` 禁止を遵守。

### 2.4. コミット承認要請フォーマット（必須テンプレート）
ユーザーにコミット承認を求める際は、必ず以下のフォーマットで報告すること（自己レビューやドキュメント更新を行わずに報告することを防止する）：

```markdown
### 1. 変更サマリー
- 今回の修正目的と実装内容の要約

### 2. 自律リファクタ内容
- 変更箇所周辺で自主的に改善・整理した点（または気付いた今後の改善提案）

### 3. 自己レビュー結果
- `git diff` を精査した観点（境界値考慮、不要コード排除、可読性等）

### 4. ドキュメント更新
- 更新した `docs/**/*.md`、`README.md`、`CHANGELOG.md` 等の対象ファイルと変更内容

### 5. 検証結果
- `npm run check:quick` の実行結果（PASS 件数、エラー 0）

---
コミットを実行してよろしいでしょうか？
```

---

## 4. 詳細設計・ドメイン仕様リファレンス (Documentation Index)

コンテキスト最適化のため、ドメイン固有の詳細仕様・実装規約は `docs/dev/` 配下の専門ドキュメントに責務を委ねている。
**エージェントは機能の実装・改修・調査を行う際、目的に応じて以下の対応ドキュメントをオンデマンドで参照すること。**

- **機能実装・バグ修正時**: まず【現行仕様 (State)】を参照し、現在のアーキテクチャ・コード構造を最速でキャッチアップする。
- **アーキテクチャ変更・リファクタ検討時**: 必ず【意思決定記録 (Why / ADR)】を参照し、過去の技術的検証結果や不採用理由、地雷回避の防護線を確認して安易な巻き戻しを防止する。

| 区分 | 対象領域 | 参照ドキュメント | 主な掲載内容 |
| :--- | :--- | :--- | :--- |
| **State** (現行仕様) | **全体設計・構造** | [`docs/dev/architecture.md`](docs/dev/architecture.md) | システム全体アーキテクチャ、プロセス分離モデル、バックエンド設計パターン、フロントエンド構造 |
| **State** (現行仕様) | **画面仕様・UI設計** | [`docs/dev/ui_spec.md`](docs/dev/ui_spec.md) | 全画面構成、朝4時起点番組表、録画中3択操作、年月ジャンプ、レスポンシブ設計 |
| **State** (現行仕様) | **予約・重複調停** | [`docs/dev/reservation-algorithm.md`](docs/dev/reservation-algorithm.md) | 予約重複判定、プライオリティ制御、二重録画防止（`recorded_history`）仕様 |
| **State** (現行仕様) | **動画配信・字幕** | [`docs/dev/streaming-and-captions.md`](docs/dev/streaming-and-captions.md) | M2TS-LL/HLS 配信、ARIB B24 字幕（ID3/WebVTT）、EPIPE 回避、Svelte 5 リアクティビティ規約 |
| **State** (現行仕様) | **REST API 仕様** | [`docs/dev/api.md`](docs/dev/api.md) | Hono API エンドポイント、型安全 RPC クライアント、リクエスト/レスポンススキーマ |
| **State** (現行仕様) | **データベース仕様** | [`docs/dev/database.md`](docs/dev/database.md) | Drizzle ORM スキーマ定義、Entity 構造、EPGStation 完全互換ポリシー |
| **State** (現行仕様) | **テスト詳細・E2E規約** | [`docs/dev/testing.md`](docs/dev/testing.md) | 単体・結合・E2E テスト詳細、フィクスチャ、モック戦略、DB 分離手順 |
| **Why** (決定記録) | **近代化・ADR** | [`docs/dev/modernization-roadmap.md`](docs/dev/modernization-roadmap.md) | **意思決定記録 (ADR)**: Graceful Shutdown、Web Streams バックプレッシャー、大容量配信デッドロック回避設計保護、IPC型安全化、軽量ロガー刷新の背景・Why |
| **Active** (タスク) | **残タスク・課題** | [`docs/TODO.md`](docs/TODO.md) | 未来の未完了タスク・検討課題のみを管理するアクティブボード |
| **History** (履歴) | **リリース変更履歴** | [`CHANGELOG.md`](CHANGELOG.md) | バージョンごとのリリース差分・変更点サマリー |
