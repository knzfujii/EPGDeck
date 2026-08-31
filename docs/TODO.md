# EPGDeck 改善 TODO リスト

EPGDeck の機能改善、パフォーマンス最適化、品質向上、保守性向上のためのタスク一覧です。
今後の機能追加やリファクタリングのロードマップとして随時更新・追記可能です。

---

## 1. データベース & バックエンド (Database & Backend)

- [x] **DBインデックス（INDEX）の最適化**
  - [x] `program` テーブルに `(channelId, startAt, endAt)`, `(startAt, endAt)` 複合インデックスを追加
  - [x] `recorded` テーブルに `(channelId, startAt)`, `(startAt, endAt)`, `(ruleId)` インデックスを追加
  - [x] `reserve` テーブルに `(startAt, endAt)`, `(ruleId)`, `(channelId, startAt)` インデックスを追加
  - [x] `DrizzleOperator` で SQLite / MySQL の既存データを破壊しない安全な自動インデックス生成を実装
- [x] **番組一括更新（Bulk Insert）の最適化**
  - [x] `ProgramDB.ts` の `insert` / `update` メソッドで Drizzle ORM の複数行一括 `values(chunk)` 挿入を活用
- [ ] **DBアクセス層（SQLite/MySQL）の共通クエリ集約 (T-6)**
  - [ ] `ProgramDB.ts`, `RecordedDB.ts` 等の方言差（SQLite / MySQL）がない同一 Drizzle クエリ処理を共通化・リファクタリング
- [x] **大容量動画アップロード時のメモリ枯渇（OOM）防止**
  - [x] `src/model/service/hono/routes/videos.ts` の `/upload` で、`file.stream()` を用いたストリーム書き込みへ変更
- [x] **EPGUpdater のプロセスライフサイクル安定化**
  - [x] `ModelContainer.ts` および `EPGUpdateExecutor.ts` への `reflect-metadata` 永続化による起動クラッシュ防止
  - [x] `EPGUpdateExecutorManageModel.ts` での子プロセス終了ハンドラ一本化と 3秒バックオフ待機による増殖ループ防止
- [x] **ストリーミング例外および 500 エラー防止**
  - [x] 終了済みストリームに対するキープタイマー競合（`StreamIsUndefined`）の安全ガード化
  - [x] 実ファイル不在時の `stat` 存在確認ガードによる `ffprobe` クラッシュ防止
- [x] **Hono ルートの共通エラーハンドリング強化**
  - [x] `createHonoApp.ts` の `app.onError` によるエラー型安全なレスポンス返却と詳細ロギングの統一

---

## 2. フロントエンド & UI/UX (Frontend & UI/UX)

- [x] **ルートレベルの動的コード分割 (Lazy Loading)**
  - [x] `App.svelte` で全画面コンポーネントを動的 `import()` 化し、初期 JS ロードを大幅に軽量化
- [x] **404 Not Found ルートの実装**
  - [x] 未知のパスにアクセスした際のエラー画面（`NotFound.svelte`）の実装
- [x] **設定・テーマ管理の一本化**
  - [x] `Settings.svelte` に「自動 (OS準拠) / ライト / ダーク」選択ボタングループを新設し、`themeStore` と完全双方向同期
- [ ] **API クライアント層の集約と型安全化 (T-5)**
  - [ ] 各コンポーネントに散在する `axios.get/post` を `client/src/lib/api/` に集約し、`api.d.ts` の型を完全バインド
- [ ] **巨大コンポーネントの分割・リファクタリング (T-7)**
  - [ ] `RuleEditModal.svelte`（822行）や `VideoPlayer.svelte`（783行）をサブコンポーネントや Svelte 5 Snippet に分割
- [ ] **番組表・ログの仮想スクロール (Virtual Scroll) 導入検討**
  - [ ] 大量ノード表示時の描画負荷軽減

---

## 3. エンコード & ストリーミング (Encode & Streaming)

- [x] **エンコード設定の `script` 指定方式の導入**
  - [x] `config.yml` 内の presets で `script: enc_1080p.js` のようにスクリプト名のみを指定可能に改善
  - [x] 従来の `cmd` 指定とも完全な後方互換性を保持
- [x] **エンコード完了時の `FileIsNotFound` エラー解消**
  - [x] `config/enc_1080p.js` / `enc_720p.js` をテンプレートから実体化し、CLI エントリポイントを適正化
- [x] **ファイル整合性検証時のフェイルセーフ強化**
  - [x] 検証例外時に `process.exit(1)` で確実に異常終了させ、元 TS ファイルの誤削除を完全防止
- [x] **WebM (VP9) ストリーミング設定の復元とビットレート修正**

---

## 4. ユーザー追加機能 & 仕様検討事項 (User Features & Decisions)

- [ ] **録画一覧での複数選択一括削除機能**
- [ ] **録画中の番組の途中完了（正常完了扱い）・削除（取り消し）**
- [ ] **簡単録画（即時予約） / 詳細録画（ダイアログ指定）の UI 分離**
- [ ] **録画ファイルの削除を表示させない設定（config グローバル設定 / 画面デバイス単位）**
- [ ] **Mirakurun とのバージョン互換性の確認・テスト**
- [ ] **エンコード一覧が正常に動作していない**
