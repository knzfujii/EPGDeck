# EPGDeck 改善 TODO リスト（タスク管理ボード）

EPGDeck の今後の機能追加、UX 改善、パフォーマンス最適化、および仕様検討のための未完了タスク一覧です。

> [!NOTE]
> 本リストは **未来のタスク管理** を目的としています。完了した機能仕様や設計ナレッジは、各種専門ドキュメント（[画面変更仕様書](dev/epgdeck_change_spec.md)、[システムアーキテクチャ](dev/architecture.md)、[設定マニュアル](manual/configuration.md) 等）に体系的に記録・整理されています。

---

## 1. 録画管理 & 運用安全 (Recording & Operations)


- [ ] **録画タグ機能（RecordedTag）の引き継ぎ・仕様判断**
  - EPGStation から引き継いだバックエンド実装（DB スキーマ・REST API・録画完了時の自動タグ付与ロジック）が存在するが、フロントエンド UI は本家時代から未実装（`// TODO` のまま放置）
  - EPGDeck として正式に UI（タグ管理、ルール・手動予約での自動付与設定、録画詳細でのバッジ表示・手動付与/解除、タグによる検索・絞り込み）を実装して機能提供するか、あるいは不要な死にコードとしてバックエンドから完全廃止・整理するかを判断
- [ ] **視聴済み管理**
  - 録画一覧および詳細で視聴済みか否かのバッジ・ラベルを表示し、未視聴番組の絞り込みや視聴状態のトグル・一括操作に対応
- [ ] **ディスク容量逼迫時のフェイルセーフ**
  - 録画保存先ディスクの空き容量が閾値（例: 10GB / 5% 以下）を下回った際の事前警告（WebSocket / Snackbar 通知）
  - 容量枯渇による録画ストリーム異常終了を防ぐ安全ポリシー（保護されていない古い録画の自動クリーンアップまたは新規録画抑制）の検討

---

## 2. パフォーマンス & フロントエンド (Performance & Frontend)

- [ ] **番組表・ログの仮想スクロール (Virtual Scroll) 導入検討**
  - 番組表（1週間分）やシステムログ（数万行）表示時の DOM ノード数肥大化を抑え、描画負荷とメモリ消費を削減
  - スクロール追従性と既存 CSS グリッドレイアウトとの両立検証

---

## 3. 番組メタデータ & UX 向上 (Metadata & UI Enrichment)

DB 内に保存されながら UI で活用されていないメタデータを活用し、情報の視認性と操作性を向上させるタスクです。

- [ ] **チャンネル局ロゴの UI 表示 (`channel.hasLogoData`)**
  - `/api/channels/:channelId/logo` を活用し、番組表（局ヘッダー）、オンエア画面、録画詳細・再生画面等に局ロゴアイコンを表示（未取得時の局名テキストフォールバック対応）
- [ ] **映像・音声スペックバッジの表示 (`videoResolution`, `audioComponentType` 等)**
  - `videoResolution`（1080i, 720p 等）や `audioComponentType`（ステレオ、二か国語/デュアルモノ、5.1ch サラウンド等）のコード値をパースし、番組詳細モーダル・録画詳細画面にスペックバッジを表示
- [ ] **無料放送バッジ（[無]）の表示 (`program.isFree`)**
  - BS/CS などの番組表（Guide）や検索結果、番組詳細モーダルにおいて、無料放送番組に「[無]」または「無料」バッジを表示し、有料番組と即座に判別可能にする
- [ ] **ARIB 構造化詳細テキスト (`rawExtended`) のリッチ表示**
  - 出演者、スタッフ、あらすじ、原作などの Key-Value 構造化データを活用し、番組詳細モーダルで単一プレーンテキストではなくセクション見出し付きレイアウトやアコーディオン形式でリッチに表示
- [ ] **サブジャンルおよび第2・第3ジャンルの詳細表示 (`subGenre1〜3`, `genre2〜3`)**
  - 第1主ジャンルだけでなく、中ジャンル（例：「洋画」「国内アニメ」等）や第2・第3ジャンルの日本語名称を番組詳細・録画詳細に表示
- [ ] **時間指定予約の視認性向上 (`reserve.isTimeSpecified`)**
  - 予約一覧（Reserves）画面で、通常の番組指定予約と時間指定予約を視覚的に区別できるバッジやアイコンを表示
- [ ] **ルール一覧のソート・並び替え機能 (`Rule.svelte`)**
  - デフォルトソートとして競合調停ロジック連動の優先順位順（優先度 Priority 降順 ＋ ルール ID 昇順）を実装完了
  - 将来的な拡張として登録順（新しい順/古い順）、キーワード順（昇順/降順）、予約件数順（多い順）等の任意並び替え UI と状態保持の検討
- [ ] **二重録画防止履歴の全体一覧・検索機能 (`recorded_history`)**
  - ルールの二重録画防止（`avoidDuplicate`）で保持されている履歴全体の検索・閲覧画面の提供（※録画詳細からの個別重複判定除外・再追加および削除時の予約自動再評価連動は実装完了）

---

## 4. ドキュメント & ガイド (Documentation)

- （現在進行中の未完了タスクはありません）

---

## 5. 完了済み機能・改善実績（アーカイブ）

実装および専門ドキュメントへの仕様記録が完了したタスクです。詳細な仕様・設計は各ドキュメントをご参照ください。

| 機能・改善項目 | 主な内容 | 記録先ドキュメント |
| :--- | :--- | :--- |
| **設定・ストレージ画面の廃止 & ヘッダー外観切り替え統合** | 独立画面 `/settings` および `/storages` を廃止、ヘッダーに OS 準拠含むテーマ 3 段階切り替え（auto/light/dark）を集約、PWA・半角表示の常時有効化、検索からのルール作成時サブディレクトリ自動入力連携 | [画面変更仕様書](dev/epgdeck_change_spec.md#2-epgdeck-主要画面構成--改善一覧) |
| **複数選択一括削除** | 録画一覧でのカード/テーブル両対応チェックボックス、保護番組自動除外、フローティング一括操作バー、一括削除 API | [画面変更仕様書](dev/epgdeck_change_spec.md#36-録画一覧-recorded--録画詳細-recordeddetail) |
| **録画中番組の3択停止** | 進行中番組の「完了として保存（履歴登録）」「中断して保存（未完了・履歴未登録）」「録画を取り消し（物理削除）」モーダル | [画面変更仕様書](dev/epgdeck_change_spec.md#34-予約一覧-reserves)、[録画マニュアル](manual/recording.md#5-録画中番組の操作途中完了中断取り消し) |
| **リードオンリーモード** | パスワード解除式閲覧専用モード、誤操作・削除防止、権限別画面・API 遮断（`allowedOperations`） | [画面変更仕様書](dev/epgdeck_change_spec.md#5-リードオンリーモード閲覧専用モード仕様)、[設定マニュアル](manual/configuration.md#11-リードオンリーモード設定-readonly) |
| **サムネイル階層化** | `recordedId % 100` による2桁サブディレクトリ（`00/`〜`99/`）シャーディング、既存互換、CLI 移行ツール | [画面変更仕様書](dev/epgdeck_change_spec.md#36-録画一覧-recorded--録画詳細-recordeddetail)、[バックアップ](manual/backup.md#epgstation-から移行時のサムネイル階層化マイグレーション) |
| **ルール検索 & カルーセル** | 録画詳細での同一ルール動画カルーセル、録画一覧でのルール指定絞り込み・バッジ解除・URLクエリ連動 | [画面変更仕様書](dev/epgdeck_change_spec.md#36-録画一覧-recorded--録画詳細-recordeddetail) |
| **ルールキーワード検索** | ルール一覧でのインクリメンタル/Enterキーワード検索バー、URLクエリ連動、件数表示バッジ | [画面変更仕様書](dev/epgdeck_change_spec.md#35-ルール一覧-rule) |
| **PWA 完全連動** | 設定画面の PWA トグルと Service Worker ライフサイクル連動、全画面ネイティブ表示、セーフエリア対応 | [画面変更仕様書](dev/epgdeck_change_spec.md#61-pwa-progressive-web-apps--設定画面連動) |
| **UI/UX・レスポンシブ** | 予約一覧のスマホ2段タブ最適化、ルール編集/削除ディバイダー、フォントサイズ統一、`no-scrollbar` | [画面変更仕様書](dev/epgdeck_change_spec.md#63-レスポンシブ--誤操作防止) |
| **ドロップログ最適化** | 0件時ログ実ファイル自動削除（`deleteOnNoDrop`）、DB履歴永続保持、走査高速化（Set化） | [録画マニュアル](manual/recording.md#9-ドロップチェックとログ管理drop-log)、[アーキテクチャ](dev/architecture.md#3-バックエンド設計パターン) |
| **スマホ動画操作改善** | 背景タップでのコントロール表示/非表示、誤停止防止、中央クイック操作ボタン群（-10s/再生/+30s） | [画面変更仕様書](dev/epgdeck_change_spec.md#37-統合動画プレーヤー-watchsvelte--videoplayersvelte) |
| **外部プレイヤー連携** | M3U 導線廃止、iOS (VLC)・Android (インテント) 外部プレイヤー直接起動、録画詳細・再生モーダル連動 | [画面変更仕様書](dev/epgdeck_change_spec.md#65-外部プレイヤー連携urlスキーム--インテント起動と-m3u-導線廃止) |
| **開発プロセス高速化** | `check:quick`（約3秒並列チェック）、ESLint/TypeScript キャッシュ、自律ワークフロー（リファクタ・自己レビュー・ドキュメント更新）制度化 | [AGENTS.md](../AGENTS.md)、[テスト仕様書](dev/testing.md) |
| **手動予約の修正 & 録画オプション共通化** | 時間指定手動予約の API 仕様不一致バグ修正、TS保存先・エンコード最大3系統・元TS削除・末尾欠け許可の共通コンポーネント化（`RecordingOptionForm`）、Guide / Reserves / ManualReserve の操作統一 | [画面変更仕様書](dev/epgdeck_change_spec.md#2-画面一覧統廃合対比表) |
| **HLS 字幕動的注入 & 録画 HLS シーク最適化・ストリームプロセス管理** | aribb24.js v2 のシーク・セグメント破棄に対応する ID3 字幕管理データ動的先行注入、未エンコード領域シーク時のサーバー `ss` パラメータ連携ストリーム再起動、シークバーへのエンコード済みバッファ進行可視化、WebM/HTTP配信切断時の ffmpeg 即時 kill 徹底によるプロセス残留防止 | [配信・字幕仕様書](dev/streaming-and-captions.md#33-解決策subtletitlemanagerts-での動的補完とシーク保護) |
| **RAM ディスク (`/dev/shm`) 活用ガイド** | HLS ストリーミング一時バッファやトランスコード一時領域への `/dev/shm`（tmpfs）適用手順、SSD 書き込み寿命保護（TBW 削減）・ディスク I/O 負荷軽減のベストプラクティス、Docker 64MB 制限回避策、録画一時領域のサイジング注意点 | [RAM ディスク活用ガイド](manual/ramdisk.md)、[設定マニュアル](manual/configuration.md#9-配信ストリーミング設定-streaming) |
| **途中録画・実録画時間（duration）によるシークバー長補正** | 途中録画や番組延長時のシークバー長不一致を解消。動画ファイル実測 API（ffprobe）➔ DB 実測値（`recorded.duration`）➔ 番組予定枠の 3 段階フォールバック、30秒以上遅延開始時の `startAt` 自動補正、HLS 完了時実尺同期、録画一覧・詳細での実時間優先表示 | [画面変更仕様書](dev/epgdeck_change_spec.md#37-統合動画プレーヤー-watchsvelte--videoplayersvelte) |
| **Web API 全面リファクタリング & Hono RPC 型安全アーキテクチャ** | キャッシュ無効化ヘッダー自動注入、階層化 API 例外（`ApiError`）とグローバル集約ハンドラー、全 18 系統 Zod スキーマ・バリデーション導入、全ルートのメソッドチェーン化と `ApiRoutesType` エクスポート、フロントエンド用 Hono RPC クライアント（`client/src/lib/apiClient.ts`、認証トークン透過注入対応）の導入、全フロントエンド画面・コンポーネントの Hono RPC 完全移行 | [REST API 仕様書](dev/api.md#エラーハンドリングとレスポンス仕様) |
| **クライアント API 一本化・設定キャッシュ一元化・型厳格化 (`as any` 完全排除)** | レガシー `httpClient.ts` の完全廃止、認証トークン管理の独立モジュール化（`authStorage.ts`）、設定データの重複フェッチを防止する `configStore`（Svelte 5 Runes）導入、バックエンド `streams.ts` の `c.json` 型推論改善、フロントエンド全画面・コンポーネントにおける `as any` キャストの完全排除（0件達成） | [アーキテクチャ仕様書](dev/architecture.md#4-フロントエンド設計パターン)、[REST API 仕様書](dev/api.md#型安全-api-クライアント-hono-rpc) |
| **空き容量自動削除（StorageManageModel）の単位計算バグ修正 & 設定テンプレート完全化** | 上流（EPGStation）から引き継がれていた削除ループ内での容量再取得時の MB 換算漏れ（バイト単位のまま比較し 1 件でループを抜けてしまう、または誤ったバイト閾値設定で全録画が消滅する重大バグ）を解消、`getFreeSizeMB` による MB 換算の一本化、連続削除の単体テスト作成（`storage_manage.test.ts`）、`config.yml.template` および設定マニュアル（`configuration.md`）の全設定項目（`apiServers`, `action`, `limitCmd`, `encode.presets.cmd`, `urlscheme` の Mac/Win 対応等）の網羅・MB 単位表記統一 | [設定マニュアル](manual/configuration.md#5-録画設定-recording)、[録画マニュアル](manual/recording.md#10-空き容量自動確保ストレージクリーンアップ) |
| **時間指定ルール予約の分単位指定対応 & 専用 UI・一覧識別強化** | 時（Hour）単位制限を撤廃し、開始時刻・終了時刻を分単位（HH:mm、日跨ぎ対応）で指定可能化。ルール編集画面（`RuleEdit.svelte`）で通常検索と時間指定予約のタブ切り替え導入（タイトル・局・曜日・時間帯に絞った専用フォーム）、ルール一覧（`Rule.svelte`）での「時間指定」バッジおよび曜日・時間帯（例: 月〜金 19:30〜20:45）の視認性向上、`ReserveOptionChecker` / `ReservationManageModel` のミリ秒精度予約枠生成ロジック完全対応 | [画面変更仕様書](dev/epgdeck_change_spec.md#35-ルール一覧-rule) |
| **時間指定録画の番組名フォールバック & 再生画面タイトル表示修正** | 時間指定予約録画時に EPG 番組表が存在しない場合でも空文字化せず予約時タイトル（`reserve.name`）を確実に保持、録画枠が複数番組を跨ぐ場合も最長重複番組を自動特定（`ProgramDB.findChannelIdAndTime` / `RecorderModel` / `RecordingUtilModel`）、動画再生画面（`Watch.svelte`）で通信完了後のタイトル空文字時に「読み込み中...」のまま固定される表示不具合を解消 | [予約アルゴリズム仕様書](dev/reservation-algorithm.md#5-時刻指定予約istimespecificationによる予約枠生成)、[画面変更仕様書](dev/epgdeck_change_spec.md#37-統合動画プレーヤー-watchsvelte--videoplayersvelte) |
| **ルールの優先順位設定（Priority 制御）** | チューナー競合発生時、数値が大きいルール（1〜10、デフォルト: 5）が優先的に録画枠を確保するよう競合調停アルゴリズム（`ReservationManageModel`）を拡張。あえて低優先度（1〜4）に設定して競合時に譲る運用や、高優先度（6〜10）で確実に確保する運用に対応。ルール編集画面（`RuleEdit.svelte`）でのセレクトボックス・バッジプレビュー、ルール一覧（`Rule.svelte`）でのカード・テーブル優先度バッジ表示に対応 | [予約アルゴリズム仕様書](dev/reservation-algorithm.md#4-時間帯重複とチューナー競合解決isconflict) |
| **放映中・録画中番組の保護と録画継続性多層防御** | EPG更新や複数ルールの同一番組重複調停時、放映中既存予約の最優先保護（`ReservationManageModel.sortReserve`）、programId変動時の更新枠引き継ぎ（`createReservesDiff`）、録画中プロセスの強制キャンセル抑止＆二重起動防止（`RecordingManageModel`） | [予約アルゴリズム仕様書](dev/reservation-algorithm.md#3-同一番組に対する重複予約の調停program-id-重複排除) |
| **手動時刻指定予約のフラグ整合性是正 & 例外・ロガータイポ修正** | 時刻指定手動予約作成（`ReservationManageModel.createManualReserveWithSpecifiedTime`）で誤設定されていた `isEventRelay = true` を是正（`false` 保持）、チャンネル未検出例外名タイポ（`eservation...` ➔ `Reservation...`）およびロガー参照誤り（`log.stream` ➔ `log.system`）の解消、単体テスト追加 | [予約アルゴリズム仕様書](dev/reservation-algorithm.md#5-時刻指定予約istimespecificationによる予約枠生成) |
| **録画中3択操作ハンドラーの共通化（フロントエンド重複排除）** | 4画面（Dashboard, Guide, Reserves, OnAir）で完全重複していた録画中3択操作（完了保存・中断保存・取り消し破棄）の API 呼び出し・通知・エラー処理を `client/src/lib/utils/recording.ts`（`executeRecordingAction`）に集約、`RecordingActionModal` Props 型定義の正規化、単体テスト・E2Eテスト全件通過 | [画面変更仕様書](dev/epgdeck_change_spec.md#34-予約一覧-reserves) |
| **録画オプション状態管理の共通化（RecordingOptionFormState導入）** | 番組表（Guide）・予約一覧（Reserves）・手動予約（ManualReserve）で重複していた録画オプション（TS保存先・エンコード最大3系統・元TS削除・末尾欠け許可）の `$state` 定義・初期化・ロード・リクエスト JSON 生成ロジックを `RecordingOptionFormState`（Svelte 5 Runes）に集約、ボイラープレート削減 | [画面変更仕様書](dev/epgdeck_change_spec.md#2-画面一覧統廃合対比表) |
| **RecordedTagManageModel タイポ修正（Manade ➔ Manage）** | 上流（EPGStation）から引き継がれていた `RecordedTagManadeModel` / `IRecordedTagManadeModel` のタイポを `RecordedTagManageModel` / `IRecordedTagManageModel` に修正（ファイル名・クラス名・DI トークン・参照箇所の一括リネーム） | [アーキテクチャ](dev/architecture.md#2-ディレクトリ構成) |
| **IPC 内部通信プロトコルのタイポ一括是正（reservation / RuleFunctions / ReplyMessage）** | 上流から引き継がれていた内部 IPC プロセス間通信層の英単語タイポ（`reserveation` ➔ `reservation`、`RuleFuntions` ➔ `RuleFunctions`、`ReplayMessage` / `replay` ➔ `ReplyMessage` / `reply`）を全モデル・クライアント・サーバー・テスト間で完全是正 | [アーキテクチャ](dev/architecture.md#3-バックエンド設計パターン) |
| **フロントエンド残存 `any` 型注釈の厳格化 & エラーハンドリング安全化** | クライアント全域（`client/src/`）に散在していた残存 `any` 型注釈・無条件キャストを完全撤廃（0件達成）。`SocketEventPayloadMap` による WebSocket イベントの厳格型付け、API パラメータ型連携（`api.*.$get/post`）、Svelte 5 `Component` 動的コンポーネント型付け、`catch (e: unknown)` と `HttpError` による安全な例外処理、`recording.ts`（非 Error 例外境界値）および `socket.test.ts`（SocketStore ライフサイクル・ログ購読自動調停）の単体テスト新規追加 | [アーキテクチャ](dev/architecture.md#4-フロントエンド設計パターン) |
| **バックエンド内部メソッド・プロパティのタイポ是正 & 不要キャスト排除** | `findChannleTypes` ➔ `findChannelTypes`（`IChannelDB` / `ChannelDB` / `ScheduleApiModel`）、`recodingUtil` ➔ `recordingUtil`、`isCanceld` ➔ `isCanceled`、`canceld` / `encod` ログタイポ是正（`EncoderModel`）、`RecorderModel` 内の不要な `as any` キャスト削除 | [アーキテクチャ](dev/architecture.md#3-バックエンド設計パターン) |
| **ルール排他制御の近代化（PromiseQueue 直列化）& コアモデル単体テスト網羅** | `RuleManageModel` の脆弱な手動排他ロック（`isRunning = false` による無効化バグ・即時エラー拒絶）を撤廃し `PromiseQueue` による FIFO 直列化キューへ刷新、`StorageManageModel` の `try-finally` によるロック解除防衛、`RecordedManageModel`（未待機 Promise 解消含む）・`RuleManageModel`・`RecordingUtilModel`・`RecordingManageModel` の包括的単体テスト（+35件、計387件）配備 | [アーキテクチャ](dev/architecture.md#3-バックエンド設計パターン)、[テスト仕様書](dev/testing.md#2-vitest-単体テスト基盤) |
| **StreamManageModel 二重アンロック解消 & コアサービス単体テスト網羅** | `StreamManageModel` の切断コールバック（`setExitStream`）での `finalize()` 重複呼び出しによる待機ジョブ不正アンロックの潜在バグ解消と安全な `try-finally` 構造化、タイポ是正（`FORCE_STOP_STREAM_PRIORITY`、`ConcurrentEncodeNumIsZero`、`addUpdateReserves` 等、互換エイリアス保持）、`StreamManageModel`・`EncodeManageModel`・`ExternalCommandManageModel` の単体テスト新規配備（+19件、計406件 PASS） | [アーキテクチャ](dev/architecture.md#3-バックエンド設計パターン)、[テスト仕様書](dev/testing.md#2-vitest-単体テスト基盤) |
| **EPGUpdateManageModel 通信例外隠蔽バグ解消 & 番組表同期単体テスト網羅** | `EPGUpdateManageModel` の Mirakurun 通信失敗時に未代入の `eventStream` に対して `stopStream` が呼ばれて TypeError で真のエラーが隠蔽されるバグを解消、タイポ是正（`startAnalyzingMirakurunEvents`、`EVENT_STREAM_RECONNECTION_MAX`）、サブチャンネル `shared` や臨時放送・リレー等の判定ロジック `isMainProgram`、放送局除外フィルタ、番組更新キュー調停・ロールバック、チューナー種別自動判定の包括的単体テスト配備（+20件、計426件 PASS） | [アーキテクチャ](dev/architecture.md#3-バックエンド設計パターン)、[テスト仕様書](dev/testing.md#2-vitest-単体テスト基盤) |
| **ReservationManageModel 予約ライフサイクル単体テスト網羅（キャンセル・スキップ解除・リレー等）** | 予約管理の中核を担う `ReservationManageModel` において未テストだった 6 大ライフサイクルメソッド（手動物理削除 vs ルールスキップ化の `cancel`、`removeSkip`、重複解除の `removeOverlap`、親予約設定引き継ぎと二重予約防止の `addEventRelay`、終了済み予約一括削除の `cleanup`、各オプション更新の `edit`）の包括的単体テスト（`reservation_lifecycle.test.ts`）を新規配備（+22件、計448件 PASS） | [予約アルゴリズム仕様書](dev/reservation-algorithm.md)、[テスト仕様書](dev/testing.md#2-vitest-単体テスト基盤) |
| **ThumbnailManageModel 単体テスト網羅（実ファイル削除・空親ディレクトリ削除・再生成・クリーンアップ）** | サムネイル生成・削除・整合性管理を行う `ThumbnailManageModel` のテストを新規拡充（`test/unit/thumbnail_manage.test.ts`）。ファイル削除と空親ディレクトリの安全な自動削除（基底ディレクトリ非削除保証）、実ファイル欠損時の安全なスキップ、サムネイル未生成および実ファイル消失時の自動再生成キュー積載、孤立ファイルおよび孤立 DB レコードの双方向整合性クリーンアップ（`fileCleanup`）を網羅（+10件、計15件 / 全体458件 PASS） | [テスト仕様書](dev/testing.md#2-vitest-単体テスト基盤)、[画面変更仕様書](dev/epgdeck_change_spec.md#36-録画一覧-recorded--録画詳細-recordeddetail) |
| **RecordedTag バックエンド層（Model / API / DB）未定義変数バグ解消 & 包括的単体テスト網羅** | `RecordedTagManageModel.delete()` 内で未定義変数 `name` を参照していた潜在バグを `tagId` に是正、`update()` のエラーロギングを追加。`RecordedTagManageModel`（CRUD・関連付け・通知イベント・例外系）、`RecordedTagApiModel`（IPC 委譲・DB 取得マッピング）、`RecordedTagDB`（インメモリ SQLite による CRUD・部分一致検索・除外フィルタ・ページネーション・リレーション重複耐性・バックアップ復元）のフルスタック単体テスト（`test/unit/recorded_tag.test.ts`）を新規配備（+21件、全体479件 PASS） | [アーキテクチャ](dev/architecture.md#3-バックエンド設計パターン)、[テスト仕様書](dev/testing.md#2-vitest-単体テスト基盤) |
| **コア Web API モデル層単体テスト網羅（Schedule / Channel / Config）** | フロントエンドとサーバー間の最重要通信モデル群（`ScheduleApiModel`, `ChannelApiModel`, `ConfigApiModel`）の包括的単体テスト（計20件）を新規配備。放送波種別集約とチャンネル別番組グルーピング・除外、`rawExtended` JSON パース境界値・破損保護、日毎の分割番組取得（`days`）、放映中番組の先頭1件制限、局ロゴ取得（`getLogo`）の存在・未取得例外、HTTP/HTTPS ポート分離および各種ストリーミング・URLスキーム設定展開を網羅（全体499件 PASS） | [REST API 仕様書](dev/api.md)、[テスト仕様書](dev/testing.md#2-vitest-単体テスト基盤) |
| **ストリーミング具象モデル・APIモデル・エンコード管理の包括的単体テスト網羅（+61件）** | ストリーミング具象モデル群（`LiveStreamModel`, `LiveHLSStreamModel`, `RecordedStreamModel`, `RecordedHLSStreamModel`, `HLSFileDeleterModel`）、主要 API モデル層（`ReserveApiModel`, `RecordedApiModel`, `RuleApiModel`, `StreamApiModel`）、およびエンコードプロセス管理層（`EncodeProcessManageModel`）の単体テスト計7ファイル・61件を新規配備。HLS一時ファイルクリーンアップ、直接TS/トランスコード判定、優先度キル調停（FIFO）、予約・録画・ルール・配信のIPC委譲と二重録画履歴判定・予約数紐付けなどを完全網羅（全体560件 PASS） | [アーキテクチャ](dev/architecture.md#3-バックエンド設計パターン)、[テスト仕様書](dev/testing.md#2-vitest-単体テスト基盤) |
| **オーケストレーション・チューナー割当・主要API・SocketIO単体テスト網羅（+52件）** | `EventSetter` のログタイポ2箇所是正（`falied` ➔ `failed`、`parese` ➔ `parse`）。`EventSetter`（EPG更新・ルール・予約・録画・サムネイル・タグ・エンコード完了連携と外部コマンド発行）、`RecordingStreamCreator`（チューナー空き枠探索・末尾削り・同一局共有・Mirakurun延長追従・時間指定タイマー破棄）、`RecordingApiModel`（録画中3択操作委譲）、`EncodeApiModel`（キュー情報集約・保存先パス解決・キャンセル）、`IPTVApiModel`（M3U8・XMLTVエスケープ・除外フィルタ）、`SocketIOManageModel`（デバウンス・ルーム購読）の単体テスト計6ファイル・52件を新規配備（全体612件 PASS） | [アーキテクチャ](dev/architecture.md#3-バックエンド設計パターン)、[テスト仕様書](dev/testing.md#2-vitest-単体テスト基盤) |
| **ユーティリティ層（FileUtil等）潜在バグ解消 & 全イベント具象モデル単体テスト網羅（+37件）** | `FileUtil.ts` 内の未定義変数タイポ（`reslove` ➔ `resolve`）を完全是正し `unlink`/`stat`/`rename`/`move` 実行時の致命的 ReferenceError 潜在バグを解消。`FileUtil`（再帰mkdir、読み書き、追記、空判定、移動、サイズ取得、rmdir、隠しファイル除外探索）、`DateUtil`（フォーマットトークン、曜日変換、JST時差変換）、`ChannelUtil`（ARIBサービス種別判定）、`Util`（sleep）、`ProcessUtil`（終了判定、環境変数置換、SIGINT/SIGKILLプロセス安全終了）、および全イベントモデル（`EPGUpdateEvent`, `ReserveEvent`, `RuleEvent`, `RecordingEvent`, `RecordedEvent`, `RecordedTagEvent`, `ThumbnailEvent`, `EncodeEvent`, `OperatorEncodeEvent`）の単体テスト計6ファイル・38件（純増37件）を新規配備（全体649件 PASS） | [アーキテクチャ](dev/architecture.md#3-バックエンド設計パターン)、[テスト仕様書](dev/testing.md#2-vitest-単体テスト基盤) |
| **プロセス間通信（IPC基盤）タイポ是正・安全解除 & ServiceServer包括的単体テスト網羅（+13件）** | `IPCClient.ts` のログタイポ是正（`bit child process` ➔ `not child process`）およびプロセス終了・破棄時の安全なメッセージリスナー解除（`destroy()`）を追加。`IPCServer`（子プロセス登録、各モデルへのディスパッチ、エラー応答、IPCFunctionError、通知・エンコード・ログのプッシュ配信、ChildIsNull防衛）、`IPCClient`（プッシュ受信、sendと応答マッピング、エラー伝播、IPCTimeoutタイムアウト制御）、および `ServiceServer`（uploadTempDir自動生成、HTTPサーバー起動、HTTPS複数/単一CA証明書ロード、SocketIO初期化）の単体テスト計2ファイル・13件を新規配備（全体662件 PASS） | [アーキテクチャ](dev/architecture.md#3-バックエンド設計パターン)、[テスト仕様書](dev/testing.md#2-vitest-単体テスト基盤) |
