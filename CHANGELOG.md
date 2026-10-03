# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

### Added
- **自前 TS 解析・ドロップ監視パッケージ `arib-probe` の新設**: 外部の長期間未保守パッケージ `aribts`（2018年停止）およびその推移的依存（C++ バインディング残骸、古いイベントエミッタ等 9 パッケージ）を完全排除し、ゼロ依存・Pure TypeScript・ESM ネイティブの内部パッケージ `packages/arib-probe` を新設。
  - 188 バイト TS パケット同期・ヘッダ解析（エラーフラグ、連続性カウンタ、スクランブル）
  - 高速 CRC32/MPEG-2 テーブル計算
  - PMT（Program Map Table）および TOT/TDT（放送時刻）の軽量デコード
  - PCR（Program Clock Reference）デコードによるメディア経過時間（タイムコード `HH:MM:SS.mmm`）の追跡とドロップログへの付与
  - 規格準拠の PID / StreamType 名称解決ヘルパー（`resolvePidName` 等）と `getResult()` へのストリーム名自動結合
  - `DropCheckerModel` のパイプラインを `TsProbe` 単一ストリームへ集約し、重複していた約 120 行の switch 文を撤廃。型安全性と保守性を劇的に向上。
- **字幕 PES 解析 & HLS ID3 Timed Metadata 生成の内製化 (`arib-subtitle-timedmetadater` の完全排除)**:
  - 外部パッケージ `arib-subtitle-timedmetadater` および間接依存（`arib-mpeg2ts-parser`, `commander` 計 3 パッケージ）を完全アンインストール。
  - `packages/arib-probe` に以下をゼロ依存・Pure TypeScript で新規実装：
    - `TsPesParser`: TS パケット跨ぎの可変長 PES 組み立ておよび 33bit 90kHz PTS デコーダー
    - `TsPacketizer`: セクションおよび PES データの 188 バイト TS パケット化（Adaptation Field スタッフィング対応）
    - `ID3`: ID3v2 PRIV (`aribb24.js`) フレーム生成および PMT ディスクリプタ（`metadata_pointer_descriptor` / `metadata_elementary_stream` 0x15）生成
    - `TsSubtitleId3Muxer`: PMT 自動書き換えおよび ID3 Timed Metadata 再多重化 Transform ストリーム
  - 上流ライブラリに存在していた `data_group_id != 1` 破棄バグ（FIXME）を解消し、CaptionManagement (Group 0) と CaptionStatement (Group 1) の双方を漏れなく ID3 化して `aribb24.js v2` との互換性を向上。
  - `StreamBaseModel` から CJS/ESM 防衛アンラップハックを撤廃し、型安全な内部モジュールへ一本化。
- **EIT（番組情報テーブル）セクション解析 & ARIB STD-B24 文字列デコーダーの新設**:
  - `packages/arib-probe` に `decodeAribString` を新設。ISO/IEC 2022 規格に完全準拠し、4 スロット（G0..G3）の独立管理、GL/GR ロッキングシフト、SS2/SS3（シングルシフト）、ひらがな・カタカナ特殊記号（`「`、`」`、`ー` 等）の Unicode 直接マッピング、および ARIB 囲み文字外字（`[字]`, `[デ]`, `[多]` 等）のゼロ依存高速デコードを実装。
  - EIT present/following (Table ID 0x4E/0x4F, PID 0x0012) のセクションデコーダー `decodeEitSection` を実装し、`TsProbe` から番組情報やイベントリレー記述子を放送波からリアルタイムに `eit` イベントで受信可能に。
  - `TsSectionAssembler` の耐障害性: ハードウェアビットエラーパケット（TEI=1）の即時破棄、未同期 `pointer_field` プレフィックスの安全なスキップ、4096バイト超過セクション長の境界値保護を内包。
- **動画プレイヤーおよび録画詳細でのドロップ発生タイムコード可視化 & シーク連携**:
  - `client/src/lib/utils/dropLog.ts`: ドロップログのタイムコード（PCR 経過時間）をパースし、密集ドロップをクラスタリングするユーティリティを新設。
  - `VideoControls.svelte` / `VideoPlayer.svelte`: シークバー上にドロップ発生ポイントをマーカー（ピン）として視覚化。ホバーで詳細ツールチップを表示し、クリックで該当箇所へ直接シーク可能に。ドロップピンをストリーム種別（映像: 赤、音声: 橙、字幕: 水色、制御情報/その他: 灰）に応じて色分け表示。
  - `Watch.svelte`: 録画再生時にドロップログを自動取得してプレイヤーに供給。
  - `RecordedDetail.svelte`: ドロップログモーダル内に「発生タイムライン」一覧を表示し、各発生位置とストリーム種別バッジ（`[映像]`, `[音声]`, `[字幕]`）を一目で把握可能に。
- **放送波 TS ストリーム（EIT）直接監視による録画中リアルタイム番組延長・イベントリレー即時検知**:
  - `packages/arib-probe` の `decodeEitSection` に ARIB STD-B10 `event_group_descriptor` (Tag `0xD6`) の解析を追加し、イベントリレー情報（他チャンネル移行・マルチ編成）の取得に対応。
  - `DropCheckerModel` に `on('eit')` / `off('eit')` を新設し、録画ストリームの `TsProbe` から EIT イベントを購読可能に。
  - `RecorderModel` で録画中にストリーム内の EIT present/following をリアルタイム監視。Mirakurun API への定期ポーリングを待つことなく、放送波からミリ秒単位で「番組延長（終了時刻の伸長）」「イベントリレー」を即座に検知し、予約情報（`reserve`）・録画中レコード（`recorded`）およびリレータイマーを自動更新（番組タイトルは Mirakurun の正規化タイトルを SSOT として保持）。
  - イベントリレー検知時は Mirakurun REST API の EPG 更新遅延をバイパスし、TS 記述子から取得した `networkId` / `serviceId` / `eventId` を直接用いて即座に移行先番組の予約作成を発行。
  - `RecorderModel.setEventRelayTimer` における過去終了時刻ガード（`now >= reserve.endAt`）および 32-bit 最大タイマー値クランプによる Node.js `TimeoutOverflowWarning` の防止。
- **放送波 PMT / EIT 音声記述子（`audio_component_descriptor` 0xC4）解析による録画メタデータの実測値同期**:
  - `packages/arib-probe` に `audio_component_descriptor`（Tag 0xC4）のデコーダーを新設し、PMT の ES 記述子ループおよび EIT（PID 0x0012）の番組記述子ループの双方から音声メタデータをデコード可能に。主/副音声（デュアルモノラル 0x02）、ステレオ（0x03）、5.1ch サラウンド（0x09）、言語コード（`jpn`, `eng` 等）、サンプリングレート（48kHz 等）および音声説明テキストを抽出。
  - `RecorderModel` で PMT / EIT イベントをリアルタイム購読し、録画中および録画完了時に `recorded.audioComponentType` および `recorded.audioSamplingRate` へ実測値を即座に同期（`recordedDB.updateProgramInfo`）。EPG 情報が未設定の番組や時刻指定予約でも実放送波に即した音声メタデータを記録し、エンコーダーへの正確なパラメータ伝達（二重音声分離等）を支援。

### Fixed
- **前番組延長（野球等）に伴う後続番組の録画保護・開始繰り下げ（Delay）追従・放送波待機**:
  - `RecorderModel.prepRecord()`: 録画準備時に Mirakurun から最新の番組情報を取得し、前番組の延長により開始時刻が未来へ繰り下げられている場合、予約時刻（`reserve.startAt`, `reserve.endAt`）を更新してタイマーを新開始時刻へリスケジュール。無駄なチューナー専有を防止。
  - `RecorderModel.doRecord()`: Mirakurun の `getProgramStream` 接続後、レガシー EPGStation が持っていた 5 秒固定タイムアウト（前番組放送中に Mirakurun がデータ提供を待機している間に録画失敗と判定して予約を強制破棄していた問題）を抜本解決。番組指定予約において Mirakurun との接続が維持されている間、定期的に番組情報を確認しながら放送波上での番組開始（EIT present 一致）を安全に待機。待機中に繰り下げ確定を検知した場合はタイマーを新時刻へリスケジュールし、目的番組のパケットが到着した瞬間にクリーンに録画を開始。
- **番組延長・繰り下げ時のチューナー競合（isConflict）即時再調停**:
  - `ReservationManageModel.recheckConflicts()` を新設。番組延長（EIT）や繰り下げ（prepRecord / doRecord 待機中）が発生した時間枠に対して平面走査法によるシミュレーションを即座に再実行。
  - チューナー不足による競合状態の変化を検知し、DB更新および `reserveEvent.emitUpdated(diff)` を送出。次回の定期EPG更新を待たずにUI（番組表・予約一覧）や録画実行エンジン（`RecordingManageModel`）へリアルタイムに競合情報を反映。
  - `RecordingEvent.emitRecheckConflicts` / `EventSetter` を介した疎結合なイベント駆動アーキテクチャにより、循環依存を排除して実装。

### Changed
- **外部依存パッケージのマイナー更新および不要パッケージ整理**:
  - `inversify`: `6.0.2` ➔ `6.2.2`
  - `eslint`: `10.11.0` ➔ `10.12.0`
  - `@types/node`: `24.13.6` ➔ `24.19.1`（ルート・クライアント共通）
  - `@lucide/svelte`: `1.50.0` ➔ `1.51.0`（クライアント）
  - 非推奨スタブパッケージ `@types/socket.io` を削除（`socket.io` v4 本体の組み込み型定義へ一本化）
  - Flat Config 移行に伴い不要となった旧形式アダプタ `@eslint/eslintrc` を削除
  - `@playwright/test` と二重登録されていた単体パッケージ `playwright` を削除（`@playwright/test` 内包 CLI に集約）
  - `eslint.config.mjs` で直接インポートされていた `globals` を正規の devDependencies（`17.13.0`）として明示登録
- **レガシー互換スクリプトの完全撤廃**:
  - 旧 EPGStation 時代の名残だった `npm run all-install` スクリプトを完全撤廃（npm workspaces による標準の `npm install` へ完全一本化）し、README およびドキュメントの不要な互換性注記を削除。
- **コード品質向上のためのタイポ修正**:
  - `StreamBaseModel` 等における長年のタイポプロパティ名 `id3MetadataTransoform` を `id3MetadataTransform` に修正。

## [0.1.0-beta.4] - 2026-10-02

### Changed
- **クライアント側依存パッケージのマイナー更新および型定義の統一**:
  - `@lucide/svelte` を `1.50.0` に更新。
  - `@types/node` をプロジェクト全体の実行環境（Node.js v24）に合わせて `24.13.6` に統一（26 系からの整合・重複排除）。

### Fixed
- **予約一覧でのキャンセル・各種操作時における画面リロード（先頭スクロール）の解消**: 全タブ（すべて/重複/スキップ/競合）において予約キャンセル・予約復活・録画停止・設定更新を実行した際、全画面ローディング（`<LoadingState>`）による DOM 破棄・再構築が発生してスクロール位置がページ先頭にリセットされる不具合を修正。サイレント再取得（`fetchReserves(true)`）への移行、Keyed each ブロック（`item.id`）による確実な差分適用、および操作中アイテム単位でのボタン disabled 制御を適用し、スクロール位置を完全に維持。

## [0.1.0-beta.3] - 2026-09-30

### Added
- **動画プレイヤー再生中のマウスカーソル自動非表示**: 再生中にマウス無操作が約3.5秒続いた際、コントロールバーのフェードアウトと連動してプレイヤー上のマウスカーソルを自動非表示（`cursor-none`）化。マウス移動や一時停止で即座に再表示。
- **録画一覧のコントローラブルページネーション**: ページ番号直接入力フォーム＋「Go」ボタン、最初・最後ジャンプを備えたコントローラブルページャーを導入。
- **録画一覧の表示件数セレクター**: 1ページあたりの表示件数を `10 / page`, `25 / page`, `50 / page`, `100 / page`（デフォルト: 50）から選択可能にし、`localStorage` 永続化および URL クエリ（`?limit=...`）と同期。

### Changed
- **依存パッケージの最新安定版更新と脆弱性解消**: `hono` (4.13.12), `@hono/node-server` (2.1.3), `mirakurun` (4.1.5), `mysql2` (3.24.5), `vite` (8.3.2), `vitest` (5.0.3), `@typescript-eslint/*` (8.71.0), `lint-staged` (17.6.0), `@lucide/svelte` (1.49.0), `@types/node` (24.13.6) へ更新し、推移的依存の脆弱性（`brace-expansion`, `dompurify` 等）を解消。
- **全画面のマークアップ近代化と CSS Flexbox Gap への全面移行**: レガシーな `space-y-*` マージンハック（非表示要素と競合して末尾に不要マージンを生じさせていた真因）を全画面（録画、予約、ルール、ルール編集、ダッシュボード、番組検索、放送中、エンコード、ログ、手動予約、録画詳細、視聴、ナビゲーション）で全廃し、モダン Web 標準の `flex flex-col gap-*` に全面移行。番組表（`Guide`）やログ（`Logs`）、録画一覧（`Recorded`）のハードコード `calc()` / 強制 `min-h` を撤廃し、Flexbox 残余領域自動充填（`flex-1 min-h-0`）とコンテンツ本来の高さ（Intrinsic Sizing）に再構築。
- **全画面共通のスマホ下部余白とセーフエリア最適化**: 従来の `pb-safe` によるベースパディング上書き（余白0px化）を解消し、`pb-safe-8`（32px + セーフエリア加算）を新設。全画面において、スマホ表示時のスクロール最下部に程よい息継ぎ余白を確保し、iPhone 等のホームバー環境でも確実に保護。
- **録画一覧のページャー・コンテンツ間余白最適化**: 上部・下部ページャーと録画一覧コンテンツが接触する問題を解消するため、セクションコンテナに垂直ギャップ（`gap-4 sm:gap-5`）を配備し、下部ページャーに `pt-2` を追加して適正なマージンを確立。
- **モバイル特化のページング時スクロール挙動改善**: スマホ表示（幅 768px 未満）でのページング時に縦積みフィルター群を自動スクロールアウトして上部ページャーを画面上端へ吸着スクロールするよう最適化。PC 表示では視線ブレを防止するため位置を維持。
- **アクションボタン語彙体系・アイコン設計の全面標準化（3大操作パターンと体言止め原則）**:
  - 全画面に散在していた表記揺れ（「予約」「予約追加」「手動予約」「録画予約する」「新規作成」等）を、操作のメンタルモデルに基づき **3つの基本パターン** に完全体系化：
    1. **枠追加の導線（編集画面を開く）**: `[＋]` アイコンを伴う体言止め（`[＋] 予約追加`, `[＋] ルール追加`）
    2. **画面内での確定（フォーム・モーダル送信）**: 文脈が自明なためアイコン・対象名を排し、新規は `登録`、既存変更は `更新`
    3. **番組からの直接予約（即時実行）**: 編集をスキップするワンタップ予約として `録画予約` に統一（番組表・放送中・番組検索）
  - **体言止め・デバイス間統一原則**:
    - 助詞（「を」「へ」）や動詞活用（「する」「追加した」「見る」）を全廃し、簡潔な体言止めに統一（例: `ルール編集`, `設定更新`, `視聴`, `重複判定追加`, `重複判定除外`, `保護`, `削除`、矢印アイコン付きリンクの `すべて`）。
    - PC / スマホ間での文言出し分け（PC: `保護する` / スマホ: `保護` 等）を廃止し、全画面幅で統一。

### Fixed
- **予約一覧およびモバイル小画面での横スクロール・要素見切れの完全解消**:
  - `FilterTabs.svelte` のパディング・ギャップ最適化（`px-2`, `gap-1`）、ピル型バッジの丸括弧排除、およびセグメンテッド配置（`flex-1 sm:flex-initial justify-center`）により、予約一覧の4タブ（すべて/重複/スキップ/競合）が幅 360px 端末でも1行に美しく完全収容されるよう修正。
  - `Button.svelte` において `sm:hidden` 等のブレークポイント付き display ユーティリティ判定を適正化し、全ボタンに `whitespace-nowrap` を付与。スマホ表示時に「予約追加」ボタン等のアイコンとテキストが意図せず 2 行に折り返される問題を解消。
  - `RuleEdit.svelte` の検索対象期間（`datetime-local` ピッカー）をスマホ時に縦並び（`flex-col sm:flex-row`）へレスポンシブ化し、全11画面における不要な横スクロール・はみ出しをゼロ化。
  - `Recorded.svelte` の複数選択フローティングバーにおいて、各ボタン・要素に `shrink-0` と `whitespace-nowrap` を付与し、ボタン高さを画面全体のスケール感に調和した標準サイズ（モバイル: `h-9` / PC: `h-10`）へ一回り拡大。アイコン（18px/16px）、フォントサイズ（`text-sm`）、およびセパレータ（`h-5`/`h-6`）を適正化し、タップしやすさと視認性を向上。モバイル狭小画面（360px〜390px）での文字縦折れ・アイコン押し潰れを解消し、削除ボタンを体言止めの「削除」にシンプル化するとともに左右に垂直セパレータを配置して視覚的分離を強化。
- **録画一覧（テーブル表示）の操作ボタン押下時における詳細画面誤遷移の解消**: テーブル行（`<tr>`）のクリック遷移イベントが再生・保護・削除ボタンに伝播（バブリング）していた問題を解消し、削除等の操作時に不要な詳細画面遷移が発生しないよう修正。
- **録画詳細画面の 404 エラー復帰時における検索・フィルター状態保持**: 録画詳細で番組情報が存在しない場合に固定パス（`/recorded`）へ戻るのではなく、直前の検索条件・ジャンル・ページネーションを保持した一覧 URL へ安全に復帰するよう最適化。

---

## [0.1.0-beta.2] - 2026-09-28

### Added
- **録画ファイル移動・DB更新ツール (`npm run move-recorded`)**: 録画ファイルのディレクトリ移動、ワイルドカード・拡張子フィルタ、DB パス一括同期、安全チェック機構を配備。
- **アーキテクチャ近代化 Phase 1〜3**:
  - **Graceful Shutdown**: SIGINT / SIGTERM 時の録画中ストリーム・ファイル書き込み安全フラッシュ（`RecordingManageModel.stopAll()`）、実録画時間（duration）確定、DB コネクション安全切断、2回目シグナル即時終了シーケンス。
  - **ストリーミングバックプレッシャー制御**: Node.js 17+ 標準の `Readable.toWeb` による Web Streams 自動バックプレッシャー制御とクライアント切断時のリソース即時解放機構。
  - **プロセス間通信 (IPC) の型安全化**: 引数型 `IPCArgsMap` / 戻り値型 `IPCResponseMap` によるジェネリクス型 RPC と Discriminated Union 化による `<any>` 完全撤廃。
  - **軽量・高速非同期ロガー**: `log4js` を完全撤廃し、`rotating-file-stream` への置換およびディスクフル・競合時のサーキットブレーカー（自動一時サスペンド）機構を導入。
- **UI デザインシステム標準化**: Svelte 5 共通コンポーネント群（`Button`, `IconButton`, `Divider`, `Input`, `Select`, `Textarea`, `Checkbox`, `Card`, `Badge`, `SearchInput`, `FilterTabs`, `PageHeader`, `ReadOnlyGuard`, `LoadingState`, `EmptyState`）を全面配備。
- **単体・E2E テストの大幅拡充**: Vitest 単体テストが計 748 件に到達。Playwright E2E テスト（リードオンリーモード、ダッシュボード、予約一覧、オンエア、ルール編集等）を拡充。

### Changed
- **npm workspaces によるパッケージ管理の一元化**: ルート `package.json` に `"workspaces": ["client"]` を設定し、`package-lock.json` を一元ロック（重複 76 パッケージ削減）。
- **レガシー `namespace` 構文の廃止と `node:fs/promises` 移行**: `FileUtil`, `ProcessUtil`, `Util` の手動 Promise コールバックラップを全廃し、Node.js 22 標準 API へ一本化。安全な `rename` / `EXDEV` 時フォールバックを確立。
- **予約一覧 (`/reserves`) の視認性向上**: タブ並び順を「すべて・重複・スキップ・競合」に再編し、左端アクセントボーダー（`border-l-4`）とステータス別背景色分け（緑・灰・赤・ローズ）を導入。
- **ダッシュボード (`/`) のヘッダー操作フォント統一**: ストレージ容量・予約警告アコーディオン等のヘッダー操作ボタンを `text-sm` に統一。直近予約一覧を最新 10 件に制限。
- **録画中 3 択操作ハンドラーの一元化**: 4 画面（Dashboard, Guide, Reserves, OnAir）で重複していた 3 択停止（完了保存・中断保存・取り消し破棄）処理を共通モジュール（`recording.ts`）に集約。
- **Tailwind CSS Utility-First 原則の徹底**: `app.css` の独自クラス（`.btn-*`, `.form-*`, `.divider-v`, `.card-base` 等）を完全撤廃。
- **ドキュメント仕様体系の実装実態完全同期**:
  - `docs/dev/api.md`: 未記載だった録画中 3 択制御 API (`/api/recording`) の仕様を追記（Swagger や他文書と重複する一覧等は排して簡潔化）。
  - `docs/dev/database.md`: `rule` / `reserve` の優先度カラム `priority`（デフォルト: 5）の ER 図・スキーマ定義への反映、および既存 EPGStation DB からの非破壊自動マイグレーション機構の明記。
  - `docs/dev/reservation-algorithm.md`: 手動予約ソート順序（手動時刻指定予約 ＞ 手動個別番組予約 ＞ ルール予約）の実装実態との整合・修正。
  - `docs/dev/ui_spec.md`: アクションボタン仕様の記述を Svelte 5 共通コンポーネント規格（`Button size="compact"`, `IconButton`, `Divider`）へ完全統一。
  - `docs/dev/architecture.md`: データベース互換性と `priority` カラム自動追加機構の記述同期。
- **ドキュメント全体の表現適正化**: 「超高速」「圧倒的」などの過度な誇張表現を全廃し、客観的で落ち着いた技術的表現へ統一。
- **録画アーカイブ管理件数の想定スケール引き上げ**: ドキュメント全体（README, ui_spec, database, architecture, configuration 等）における録画管理規模の表記を「15,000 件」から「**10万件規模**」へ更新。

### Fixed
- **大容量動画配信時のデッドロック回避設計の恒久保護**: `@hono/node-server` の Web Streams バックプレッシャーストールを防止するため、Node.js ネイティブ `stream.pipe(outgoing)` と `createAlreadySentResponse()` による Symbol 削除ガードを保護・文書化。
- **放送中画面 (`/onair`) の非放送チャンネル適正化**: 未来番組が誤って「現在放映中」として表示される不具合を修正し、「放送休止中」表示と次番組予約を適正化。
- **トランスコード配信切断時の ffmpeg stdin EPIPE エラーハンドリング**: クライアント離脱時の `uncaughtException: Error: write EPIPE` を安全に吸収。
- **ルール編集画面のチェックボックス配置**: 録画オプションチェックボックスの折り返し・縦並び配置の適正化。

---

## [0.1.0-beta.1] - 2026-09-01

### Added
- EPGDeck 初回パブリックベータリリース。
- Node.js 22 (ESM)、Hono (RPC)、Svelte 5 (Runes)、Tailwind CSS v4、Drizzle ORM を採用した録画・放送視聴プラットフォーム。
- EPGStation (SQLite / MySQL) との 100% データ互換性。
- ARIB STD-B24 字幕表示（ID3 Timed Metadata / WebVTT）、M2TS-LL 低遅延ストリーミング。
- 10万件規模の大規模録画アーカイブ対応（サムネイル階層化シャーディング、年月ジャンプ）。
- リードオンリーモード（閲覧専用モード）。
