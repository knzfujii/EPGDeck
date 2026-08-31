# EPGDeck 改善 TODO リスト

EPGDeck の機能改善、パフォーマンス最適化、品質向上、保守性向上のためのタスク一覧です。
今後の機能追加やリファクタリングのロードマップとして随時更新・追記可能です。

---

## 1. データベース & パフォーマンス (Database & Performance)

- [x] **DBインデックス（INDEX）の最適化**
  - [x] `program` テーブルに `(channelId, startAt, endAt)`, `(startAt, endAt)` 複合インデックスを追加（番組表・放映中取得の高速化）
  - [x] `recorded` テーブルに `(channelId, startAt)`, `(startAt, endAt)`, `(ruleId)` インデックスを追加（15,000件超アーカイブの年月ジャンプ・ジャンル絞り込み高速化）
  - [x] `reserve` テーブルに `(startAt, endAt)`, `(ruleId)`, `(channelId, startAt)` インデックスを追加
  - [x] `DrizzleOperator` で SQLite / MySQL の既存データを破壊しない安全な自動インデックス生成（`CREATE INDEX IF NOT EXISTS` / `INFORMATION_SCHEMA` チェック）を実装

- [x] **番組一括更新（Bulk Insert）の最適化**
  - [x] `ProgramDB.ts` の `insert` / `update` メソッドで Drizzle ORM の複数行一括 `values(chunk)` 挿入を活用し、EPG更新時の DB 負荷と処理時間を削減
- [x] **DBアクセス層の重複コード解消**
  - [x] `ProgramDB.ts`, `RecordedDB.ts` 等の方言差（SQLite / MySQL）がない同一クエリ処理を共通化・リファクタリング

---

## 2. フロントエンド & UI/UX (Frontend & Realtime)

- [x] **バンドル分割・遅延ロード (Code Splitting / Lazy Loading)**
  - [x] `hls.js`, `mpegts.js`, `aribb24.js` などの動画再生ライブラリを別チャンクに分離（Vite `manualChunks` 設定）
  - [x] 初期表示用 JS バンドルサイズの削減
- [x] **Socket.IO リアルタイム通信のフロントエンド接続**
  - [x] グローバル Socket.IO リアクティブストア（`socket.svelte.ts`）の構築
  - [x] 録画開始/終了、予約変更、エンコード進捗通知を受信し、ダッシュボード・予約一覧・録画一覧・エンコード画面を自動同期
- [x] **フロントエンドの型安全性向上 (`any` の排除)**
  - [x] `Recorded.svelte`, `Reserves.svelte`, `Rule.svelte`, `Dashboard.svelte`, `OnAir.svelte`, `RecordedDetail.svelte` などの状態変数を `api.d.ts` の厳格な型（`RecordedItem`, `ReserveItem`, `Rule` 等）へ置き換え
- [x] **共通ユーティリティ（フォーマッタ）の集約**
  - [x] `formatDate`, `formatTime`, `formatSize`, `formatDuration`, `formatBitrate`, `formatPlayerTime` を `client/src/lib/utils/format.ts` に集約・共通化
- [x] **字幕表示（`aribb24.js`）の実装**
  - [x] `VideoPlayer.svelte` に `aribb24.js` による字幕 / 文字スーパー描画レイヤーを統合
- [x] **不要な依存パッケージの棚卸し**
  - [x] `client/package.json` の未使用ライブラリ（`clsx`, `date-fns`, `eventemitter2`, `inversify`, `lodash`, `reflect-metadata`, `resize-observer-polyfill`, `smoothscroll-polyfill`, `tailwind-merge` 等）を削除

---

## 3. バックエンド & API (Backend & Robustness)

- [x] **大容量動画アップロード時のメモリ枯渇（OOM）防止**
  - [x] `src/model/service/hono/routes/videos.ts` の `/upload` エンドポイントで、一括バッファリングから `file.stream()` を用いたストリーム書き込みへ変更
- [x] **EPGUpdater のプロセスライフサイクル安定化**
  - [x] `ModelContainer.ts` および `EPGUpdateExecutor.ts` への `reflect-metadata` 永続化による起動クラッシュ防止
  - [x] `EPGUpdateExecutorManageModel.ts` での子プロセス終了ハンドラ一本化（排他制御）と 3秒バックオフ待機によるプロセス指数関数的増殖ループの恒久防止
- [x] **ストリーミング例外および 500 エラー防止**
  - [x] 終了済みストリームに対するキープタイマー競合（`StreamIsUndefined`）の安全ガード化
  - [x] 実ファイル不在時の `stat` 存在確認ガードによる `ffprobe` クラッシュ防止
- [ ] **Hono ルートの共通エラーハンドリング強化**
  - [ ] `app.onError` によるエラー型安全なレスポンス返却と詳細ロギングの統一

---

## 4. テスト・CI/CD・コンテナ環境 (Testing, CI/CD & Docker)

- [x] **Dockerfile のマルチステージビルド最適化 & 軽量化**
  - [x] 不要となったネイティブビルドツール（C++ / Python / setuptools）の削除
  - [x] `npm prune --omit=dev` による最終イメージからの devDependencies 排除
  - [x] Node.js 26 ベース化とコンテナイメージサイズの大幅削減
- [x] **自動テストの拡充**
  - [x] ルール検索エンジン（`ProgramDB.ts` の除外キーワード、時間帯、あいまい検索）のユニットテスト追加
  - [x] Hono REST API エンドポイントの統合テスト拡充 (`test/unit/hono_api.test.ts`)
  - [x] 録画・予約管理（並列チューナー競合解決・ライフサイクル）のユニットテスト追加 (`test/unit/reservation_conflict.test.ts`, `test/unit/recording_manage.test.ts`)
  - [x] Drizzle ORM DAO CRUD クエリテスト拡充 (`test/unit/dao_crud.test.ts`)
- [x] **E2E テスト環境の全画面構築**
  - [x] Playwright による全主要画面の E2E 自動テスト環境構築（全 15 テスト完備）
  - [x] ダッシュボード、番組表、放映中、録画一覧/詳細、予約/手動予約、検索/ルール管理、エンコードキュー、ストレージ、設定、再生、システムログの自動検証オールグリーン

---

## 5. ドキュメント & 設定 (Documentation & Hygiene)

- [x] **旧技術スタック（TypeORM / Express / Vue）の残存表記の更新**
  - [x] `docs/dev/architecture.md` の冒頭・Mermaid 図を Hono / Drizzle / Svelte 5 に同期
  - [x] `docs/dev/database.md` を Drizzle ORM（`drizzle-kit`）の運用手順に書き換え
  - [x] `client/tsconfig.json` の include 設定（Vue 時代の残骸）を最新の Svelte 5 構成に整理
- [x] **エンコードシステムのモダン化と共通ヘルパー化**
  - [x] `config/enc_helper.js` 共通化モジュールの作成（メディア解析、進捗計算、二重音声分離、地デジ 1440p 自動補正）
  - [x] 用途別テンプレート（1080p, 720p, VAAPI, QSV, NVENC）の整備
  - [x] エンコード仕様書 & 設定ガイドの作成 (`docs/encode.md`)

---

## ユーザー追加メモ (User Notes)

- [x] configの利用状況。妥当性の確認
    - [x] エンコード周辺の整理
    - [x] WebM (VP9) ストリーミング設定の復元とビットレート誤記修正
- [x] 録画詳細画面からの手動エンコード追加の修正
    - [x] プリセット指定形式（`mode: string`）および `isSaveSameDirectory: true` の送信修正
    - [x] 「エンコード完了後に元ファイルを削除する」オプションの追加
- [ ] Playerのseekbarがふさわしくない画面での表示
- [ ] Mirakurunとのバージョン互換の確認
- [x] ストレージ画面をダッシュボードに統合
- [x] 番組表が今日以前に戻れる。未来も制限がない
- [ ] 録画中の番組の途中完了（正常完了扱い）、削除（なかったことにする）
- [ ] 録画ファイルの削除を表示させない設定（configでグローバル設定、画面でデバイス単位）
- [ ] 録画一覧より録画を複数選択してを削除する機能
- [ ] 簡単録画（予約にそのまま入れる） / 詳細録画（いろいろ指定できる）
