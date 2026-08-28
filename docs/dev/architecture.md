# システムアーキテクチャ解説

本ドキュメントでは、EPGDeck の全体構成、プロセス分離モデル、バックエンド設計パターン、およびフロントエンド構造について解説します。

---

## 1. 全体概要

EPGDeck は、**Node.js / Express** ベースのバックエンドと、**Vue.js** ベースの SPA フロントエンドで構成されています。

```mermaid
graph TD
    Client["Browser / PWA / Kodi"] <-->|HTTP / WebSocket| Service["Service Process (Express / Socket.IO)"]
    Service <-->|IPC| Operator["Operator Process (Main)"]
    Operator <-->|IPC| EPGUpdater["EPGUpdater Process"]
    Operator <-->|HTTP / Unix Socket| Mirakurun["Mirakurun / mirakc"]
    Operator <-->|TypeORM| DB[(SQLite / MySQL)]
    Service <-->|TypeORM| DB
```

---

## 2. プロセス分離モデル

安定性と負荷分散のため、EPGDeck は役割ごとに独立した Node.js プロセスに分離して動作します（`src/index.ts` で起動・管理）。

| プロセス | 役割 | 主な責務 |
|---|---|---|
| **Operator** (メインプロセス) | 録画・チューナー管理 | 録画予約の競合解決、Mirakurun からのストリーム受信・録画ファイル書き込み、エンコードキューの管理 |
| **EPGUpdater** (子プロセス) | 番組表更新 | Mirakurun から定期的に EPG データを取得し、DB（Programs / Services テーブル）を更新 |
| **ServiceExecutor** (子プロセス) | Web サーバー | Express による REST API、Swagger UI、Socket.IO によるリアルタイム通知、静的ファイル配信 |

---

## 3. バックエンド設計パターン

### DI (依存性注入) コンテナ: InversifyJS
バックエンドの各モジュール（Model, Service, DB Operator 等）は `inversify` による IoC コンテナで疎結合に管理されています。
- 定義: `src/model/ModelContainer.ts`
- 各クラスは `@injectable()` で修飾され、インターフェース名（文字列シンボル）でインジェクションされます。

### REST API: express-openapi
API のルーティングとバリデーションは、OpenAPI 仕様（`api.yml`）と `express-openapi` に基づいて宣言的に定義されています。
- ルートハンドラー: `src/model/service/api/**/*.ts`
- 各エンドポイントは OpenAPI の operationId や tags と対応付けられています。

### ORM: TypeORM
データベースアクセスには TypeORM（0.3系）を使用しています。
- Entity 定義: `src/db/entities/**/*.ts`
- マイグレーション: `src/db/migrations/`
- SQLite3 および MySQL/MariaDB に対応しています。

---

## 4. フロントエンド設計

- **フレームワーク**: Vue.js (v2.7 + TypeScript Class Component)
- **UI コンポーネント**: Vuetify (Material Design)
- **状態管理**: Vuex ではなく、Inversify による DI を活用した State モデルクラス群（`client/src/model/state/`）でリアクティブに管理
- **メディア再生**:
  - `aribb24.js`: 地デジ・BS の字幕 / 文字スーパーのブラウザ描画
  - `mpegts.js`: MPEG-2 TS の低遅延 HTTP ライブストリーミング
  - `hls.js`: HLS による録画再生・トランスコード配信
