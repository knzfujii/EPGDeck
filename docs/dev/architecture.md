# システムアーキテクチャ解説

本ドキュメントでは、EPGDeck の全体構成、プロセス分離モデル、バックエンド設計パターン、およびフロントエンド構造について解説します。

---

## 1. 全体概要

EPGDeck は、**Node.js / Hono** ベースのバックエンドと、**Svelte 5** ベースの SPA フロントエンドで構成されています。

```mermaid
graph TD
    Client["Browser / PWA / Kodi"] <-->|HTTP / WebSocket| Service["Service Process (Hono / Socket.IO)"]
    Service <-->|IPC| Operator["Operator Process (Main)"]
    Operator <-->|IPC| EPGUpdater["EPGUpdater Process"]
    Operator <-->|HTTP / Unix Socket| Mirakurun["Mirakurun / mirakc"]
    Operator <-->|Drizzle ORM| DB[(SQLite / MySQL)]
    Service <-->|Drizzle ORM| DB
```

---

## 2. プロセス分離モデル

安定性と負荷分散のため、EPGDeck は役割ごとに独立した Node.js プロセスに分離して動作します（`src/index.ts` で起動・管理）。

| プロセス | 役割 | 主な責務 |
|---|---|---|
| **Operator** (メインプロセス) | 録画・チューナー管理 | 録画予約の競合解決・重複排除（詳細は [録画予約・重複排除・競合解決アルゴリズム仕様書](reservation_algorithm.md) 参照）、Mirakurun からのストリーム受信・録画ファイル書き込み、エンコードキューの管理 |
| **EPGUpdater** (子プロセス) | 番組表更新 | Mirakurun から定期的に EPG データを取得し、DB（Programs / Services テーブル）を更新 |
| **ServiceExecutor** (子プロセス) | Web サーバー | Hono による REST API、Swagger UI、Socket.IO によるリアルタイム通知、静的ファイル配信 |


---

## 3. バックエンド設計パターン

### DI (依存性注入) コンテナ: InversifyJS
バックエンドの各モジュール（Model, Service, DB Operator 等）は `inversify` による IoC コンテナで疎結合に管理されています。
- 定義: `src/model/ModelContainer.ts`
- 各クラスは `@injectable()` で修飾され、インターフェース名（文字列シンボル）でインジェクションされます。

### REST API: Hono
API のルーティングは、高速・軽量な Web 標準準拠フレームワーク **Hono** を採用しています。
- ルートハンドラー: `src/model/service/hono/routes/**/*.ts`
- アプリケーション定義: `src/model/service/hono/createHonoApp.ts`
- Swagger UI / OpenAPI ドキュメント: `@hono/swagger-ui` により `/api-docs` および `/api/docs` で提供
- 各エンドポイントは DI コンテナから各種 `*ApiModel` を呼び出し、型安全かつ低レイテンシでレスポンスを返却します。

### ORM: Drizzle ORM
データベースアクセスには **Drizzle ORM**（および `@libsql/client` / `mysql2`）を採用し、軽量・高速かつ型安全なクエリ実行を行っています。
- Schema 定義: `src/db/schema/**/*.ts` (SQLite / MySQL)
- DTO 定義: `src/db/entities/**/*.ts`
- **EPGStation (v2.10.0) 互換性**: データベーステーブル・カラム構造は EPGStation v2.10.0 と 100% 同一であり、既存の `database.db` / MySQL からの直接移行および新規初期化に完全対応しています。

---

## 4. フロントエンド設計
 
- **ビルドツール**: **Vite 8** (`@sveltejs/vite-plugin-svelte`)
  - Rolldown エンジンによる高速バンドル（ビルド時間約 2.6 秒）および HMR (Hot Module Replacement) に対応。
  - Node.js 22 〜 Node.js 26 (LTS) でのネイティブ高速ビルドに対応。
- **フレームワーク**: **Svelte 5** (Runes `$state`, `$derived`, `$props`, `$effect` 準拠)
  - 仮想 DOM レスによる高速な描画と省メモリ設計、軽量なバンドル構成。
- **スタイル / UI システム**: **Tailwind CSS v4** + `@tailwindcss/vite`
  - デザインシステムを `space-y-5` (20px)、`p-4 sm:p-5`、`rounded-2xl` のデザイントークンで全画面統一。
  - ダークモードとライトモードの完全対応（高輝度アクセントジャンルカラー採用）。
- **ルーター**: Svelte 5 ネイティブ Reactive Router (`client/src/lib/router.svelte.ts`)
  - HTML5 History モード完全連動、クエリパラメータ・URL 状態のリアクティブ管理。
- **メディア再生**:
  - `aribb24.js`: 地デジ・BS の字幕 / 文字スーパーのブラウザ描画
  - `mpegts.js`: MPEG-2 TS の低遅延 HTTP ライブストリーミング
  - `hls.js`: HLS によるライブ・録画再生・トランスコード配信
  - 映像鑑賞に最適なシャープな四角（直角デザイン / `rounded-none`）プレイヤーを採用。
- **HTTP / API クライアント**:
  - ブラウザ標準 `fetch` をベースとした軽量な HTTP クライアント（`client/src/lib/httpClient.ts`）を採用。
  - クエリパラメータのマージ、ステータス検証（2xx 以外の自動エラー化）、JSON レスポンスのパースを一元管理。

---

## 5. テスト・コード品質基盤

- **単体テスト**: **Vitest 5** (`vitest.config.mts`)
  - Node.js 環境での高速な単体テスト（設定パース、Hono API、DB アクセス、Client HTTP クライアント、バージョン整合性など）を実行可能。
- **E2E テスト**: **Playwright** (`test/e2e/`)
  - Chromium ヘッドレスブラウザによる全画面・主要機能のシナリオ検証。
- **静的解析・フォーマット**: **ESLint 10** + **Prettier**
  - Flat Config / FlatCompat 構成による TypeScript コードの高速な構文解析およびコードスタイル統一。
- **継続的インテグレーション (CI)**: GitHub Actions
  - PR / Push 時に `npm run check`（型チェック・Lint・テスト・全ビルド）を自動実行して品質を担保。

