# EPGDeck 改善 TODO リスト（タスク管理ボード）

EPGDeck の今後の機能追加、UX 改善、パフォーマンス最適化、および仕様検討のための未完了タスク一覧です。

> [!NOTE]
> 本リストは **未来の未完了タスク管理（State）** に特化しています。
> - 完了した機能仕様・現行アーキテクチャ: [UI/UX 画面仕様書](dev/ui_spec.md)、[システムアーキテクチャ](dev/architecture.md)、[設定マニュアル](manual/configuration.md)
> - 過去の設計決定・技術的検証（Why / ADR）: [近代化ロードマップ 兼 アーキテクチャ決定記録](dev/modernization-roadmap.md)
> - リリースごとの変更差分: [CHANGELOG.md](../CHANGELOG.md)

---

## 1. 録画管理 & 運用安全 (Recording & Operations)

- [ ] **録画タグ機能（RecordedTag）の引き継ぎ・仕様判断**
  - EPGStation から引き継いだバックエンド実装（DB スキーマ・REST API・録画完了時の自動タグ付与ロジック）が存在するが、フロントエンド UI は未実装
  - EPGDeck として正式に UI（タグ管理、ルール・手動予約での自動付与設定、録画詳細でのバッジ表示・手動付与/解除、タグによる検索・絞り込み）を提供するか、不要コードとしてバックエンドから完全廃止するかを判断
- [ ] **視聴済み管理**
  - 録画一覧および詳細で視聴済みか否かのバッジ・ラベルを表示し、未視聴番組の絞り込みや視聴状態のトグル・一括操作に対応
- [ ] **ディスク容量逼迫時のフェイルセーフ**
  - 録画保存先ディスクの空き容量が閾値（例: 10GB / 5% 以下）を下回った際の事前警告（WebSocket / Snackbar 通知）
  - 容量枯渇による録画ストリーム異常終了を防ぐ安全ポリシー（保護されていない古い録画の自動クリーンアップまたは新規録画抑制）の検討
- [ ] **録画中断・不完全録画のステータス管理と UI 表示の実装**
  - **背景**: サーバー停止・再起動時、起動時クリーンアップ（`cleanRecordings`）で `isRecording: 0` 復帰や実ファイルサイズ・サムネイル反映は行われるが、DB にステータスカラムがないため「正常完了」と区別がつかない
  - **DB スキーマ**: `recorded` テーブルにステータスカラム（`status: 'completed' | 'interrupted' | 'error'` 等、デフォルト `'completed'`）を追加
  - **起動時クリーンアップ**: 再起動時に救済されたレコードを `'interrupted'`（中断終了）として記録し、実ファイルから実測 duration / endAt を補正
  - **手動3択操作連携**: 録画中モーダルの「中断して保存」は `'interrupted'`、「完了として保存」は `'completed'` を付与
  - **Web UI 可視化**: 録画一覧および詳細に「中断」「途中終了」等の明確なステータスバッジ（黄色・オレンジ系）を表示

---

## 2. パフォーマンス & フロントエンド (Performance & Frontend)

- [ ] **番組表・ログの仮想スクロール (Virtual Scroll) 導入検討**
  - 番組表（1週間分）やシステムログ（数万行）表示時の DOM ノード数肥大化を抑え、描画負荷とメモリ消費を削減
  - スクロール追従性と既存 CSS グリッドレイアウトとの両立検証
- [ ] **録画 MP4 直接再生時のシーク遅延 (Chrome tx3g バグ) 対策と VTT 別保存化の検討**
  - Chrome 等で MP4 内部字幕（`tx3g` / `mov_text`）のシーク遅延バグ（18〜27秒待ち）が発生する問題への対策
  - エンコード時に MP4 内部へ字幕を含めず、同名の `.vtt` を別ファイルとして生成・保存するアーキテクチャへの改修検討（ファイル削除・DB スキーマ・移行ツールの影響精査が必要）

---

## 3. 番組メタデータ & UX 向上 (Metadata & UI Enrichment)

- [ ] **チャンネル局ロゴの UI 表示 (`channel.hasLogoData`)**
  - `/api/channels/:channelId/logo` を活用し、番組表（局ヘッダー）、オンエア画面、録画詳細・再生画面等に局ロゴアイコンを表示（未取得時の局名テキストフォールバック対応）
- [ ] **映像・音声スペックバッジの表示 (`videoResolution`, `audioComponentType` 等)**
  - `videoResolution`（1080i, 720p 等）や `audioComponentType`（ステレオ、二か国語、5.1ch サラウンド等）のコード値をパースし、番組詳細・録画詳細にスペックバッジを表示
- [ ] **無料放送バッジ（[無]）の表示 (`program.isFree`)**
  - BS/CS などの番組表（Guide）や検索結果、番組詳細モーダルにおいて、無料放送番組に「[無]」または「無料」バッジを表示し、有料番組と即座に判別可能にする
- [ ] **ARIB 構造化詳細テキスト (`rawExtended`) のリッチ表示**
  - 出演者、スタッフ、あらすじ、原作などの Key-Value 構造化データを活用し、番組詳細モーダルでセクション見出し付きレイアウトやアコーディオン形式でリッチに表示
- [ ] **サブジャンルおよび第2・第3ジャンルの詳細表示 (`subGenre1〜3`, `genre2〜3`)**
  - 第1主ジャンルだけでなく、中ジャンル（例：「洋画」「国内アニメ」等）や第2・第3ジャンルの日本語名称を番組詳細・録画詳細に表示
- [ ] **時間指定予約の視認性向上 (`reserve.isTimeSpecified`)**
  - 予約一覧（Reserves）画面で、通常の番組指定予約と時間指定予約を視覚的に区別できるバッジやアイコンを表示
- [ ] **ルール一覧のソート・並び替え機能 (`Rule.svelte`)**
  - 登録順（新しい順/古い順）、キーワード順（昇順/降順）、予約件数順（多い順）等の任意並び替え UI と状態保持の検討（優先度順ソートは配備済み）
- [ ] **二重録画防止履歴の全体一覧・検索機能 (`recorded_history`)**
  - ルールの二重録画防止（`avoidDuplicate`）で保持されている履歴全体の検索・閲覧画面の提供（録画詳細からの個別重複判定除外・再追加は配備済み）

---

## 4. アーキテクチャ近代化 & 安定稼働 (Architecture & Maintainability)

長期的な安定稼働、依存ライブラリのアップデート容易性、および開発体験（DX）向上のための残存タスクです。詳細な背景・技術検証・決定経緯は [アーキテクチャ近代化ロードマップ 兼 ADR](dev/modernization-roadmap.md) を参照してください。

- [ ] **Drizzle ORM スキーマの一元化 & 生 DDL ハードコードの撤廃 (Phase 2)**
  - `DrizzleOperator.ts` に直書きされた 500 行超の生 DDL（`CREATE TABLE IF NOT EXISTS`）を全廃し、Drizzle Kit（`drizzle-orm/migrator`）による自動マイグレーションへ統一
  - Drizzle 推論型（`$inferSelect` / `$inferInsert`）を活用し、DAO 層の `(db as any)` と手動 `toEntity`（boolean 変換）を段階的に削減
- [ ] **InversifyJS 6.x とレガシーデコレータからの脱却 (Phase 3)**
  - `experimentalDecorators` / `emitDecoratorMetadata` 依存を解消し、TypeScript 5+ 標準デコレータ（TC39 Stage 3）および高速トランスパイラ（Vite / esbuild / tsx）完全対応を達成
  - 400 行超の `ModelContainerSetter.ts` 手動文字列バインドを型安全な解決方式へスリム化
- [ ] **フロントエンドの巨大コンポーネント（God Component）の関心事分離 (Phase 3)**
  - `RuleEdit.svelte` (2,149 行)、`RecordedDetail.svelte` (1,310 行) 等の巨大画面からモーダル・フォーム部品をサブコンポーネントへ分割し、ロジックを Svelte 5 Runes クラス（`*.svelte.ts`）に外出し

---

## 5. ドキュメント & ガイド (Documentation)

- [ ] **API ドキュメント（Swagger / OpenAPI）のスキーマ完全化**
  - Hono RPC 型定義と OpenAPI スキーマの自動生成同期の検証
