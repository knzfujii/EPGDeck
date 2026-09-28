# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
- 15,000 件以上の大規模録画アーカイブ対応（サムネイル階層化シャーディング、年月ジャンプ）。
- リードオンリーモード（閲覧専用モード）。
