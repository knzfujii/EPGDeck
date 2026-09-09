# 開発環境セットアップガイド

本ガイドでは、EPGDeck のローカル開発環境の構築手順、本番環境との競合回避ルール、および開発時のビルド・実行方法について解説します。

---

## 1. 前提条件

- **Node.js**: 本番推奨 `v24.x`（Mirakurun 互換性のため）、開発サポート: `v22.x ~ v26.x`
- **mise** (推奨バージョンマネージャー):
  リポジトリルートに `.mise.toml` が含まれているため、以下を実行するだけで適切な Node.js がセットアップされます。
  ```bash
  $ mise install
  ```


---

## 2. 依存パッケージのインストール

ルートディレクトリで以下のコマンドを実行し、サーバーおよびクライアントの依存パッケージを一括インストールします。

```bash
$ npm run all-install
```

> **Note**: VS Code 等のエディタで `tsconfig.json` に型エラー（赤波線）が表示される場合は、このパッケージインストールが完了すると自動的に解消されます。

---

## 3. 開発用設定ファイルの準備（重要）

同一ホスト上で本番の EPGStation / EPGDeck が稼働している場合、**ポートやデータベースの競合を避けるために必ず開発用の設定を作成してください**。

### 設定ファイルのコピー
```bash
$ cp config/config.yml.template config/config.yml
```

### `config/config.yml` の編集
1. **ポート番号の変更**:
   本番（通常 `8888`）と被らないポート（例: `8889`）に変更します。
   ```yaml
   server:
     port: 8889
   ```
2. **Mirakurun の接続先**:
   ホスト上で本番の Mirakurun が動作している場合は、そのソケットまたはポートを指定して共有参照します。
   ```yaml
   server:
     mirakurun: http+unix://%2Fvar%2Frun%2Fmirakurun.sock/
   ```
3. **データベース設定**:
   デフォルトは SQLite（`data/database.db`）です。開発専用の DB ファイルとして扱われます。

---

## 4. 開発時のビルド & 実行

### ① ワンコマンド開発モード（おすすめ）
以下のコマンドを実行するだけで、**サーバー（自動コンパイル + nodemon による自動再起動）** と **クライアント（Vite による自動差分ビルド / HMR）** が並行して同時に起動します。

```bash
$ npm run dev
```

- **サーバー側**: `src/` 配下の TypeScript を編集して保存すると、自動でコンパイルされサーバーが再起動します。
- **クライアント側**: `client/src/` 配下の Svelte / TypeScript を編集して保存すると、Vite により自動で高速差分ビルドされ `client/dist` が更新されます（Vite 開発サーバーでは HMR により即座にブラウザに反映）。

---

### ② 個別に起動する場合

- **サーバー側のみ監視 & 自動再起動**:
  ```bash
  $ npm run dev:server
  ```
- **クライアント側のみ監視 & 自動差分ビルド**:
  ```bash
  $ npm run dev:client
  ```
- **クライアントの Vite 開発サーバー単体起動 (HMR 有効・ポート 5173)**:
  ```bash
  $ cd client && npm run dev
  ```
- **本番用通常ビルド & 起動**:
  ```bash
  $ npm run build
  $ npm start
  ```

---

## 5. 自動テスト・コード品質コマンド

EPGDeck では Vitest を採用しており、超高速な単体テストが実行可能です。変更を加えた際やコミット前には必ずテストを実行してください。

- **単体テストの実行 (Vitest)**:
  ```bash
  $ npm test
  ```
- **テストのファイル監視モード (Watch mode)**:
  ```bash
  $ npm run test:watch
  ```
- **全自動包括チェック（コミット前推奨）**:
  サーバー・クライアントの Lint、フォーマットチェック、型チェック、単体テスト、ビルドを一括実行して検証します。
  ```bash
  $ npm run check
  ```
- **サーバー & テストコード型チェック (`tsc`)**:
  `src/` および `test/` 配下の TypeScript 型エラーを網羅的に検証します（テスト専用のモック型不整合も検出）。
  ```bash
  $ npm run typecheck
  ```
- **Lint (ESLint / Floating Promise 厳格検査)**:
  ```bash
  $ npm run lint          # 自動修正
  $ npm run lint:check    # チェックのみ
  ```
- **コード整形 (Prettier)**:
  サーバーおよびクライアント（Svelte 5 / TypeScript）のコードを一括整形します。
  ```bash
  $ npm run format        # 自動フォーマット
  $ npm run format:check  # フォーマット検証のみ
  ```
- **MariaDB / MySQL 実機結合テスト**:
  ローカルの Docker コンテナ（ポート `13306`）を起動し、DDL・インデックス・主要 DAO の CRUD を検証します。
  ```bash
  $ docker compose -f docker-compose.db.yml up -d
  $ npm run test:mysql
  $ docker compose -f docker-compose.db.yml down -v
  ```
- **Playwright E2E テスト**:
  テスト用スタンドアロンサーバーを自動起動し、Chromium ブラウザによる画面・操作検証を行います（未ビルド時は自動でクライアントビルドが実行されます）。
  ```bash
  $ npm run test:e2e
  ```
- **全体ビルド**:
  ```bash
  $ npm run build
  ```

---

## 6. テスト・CI/CD アーキテクチャの詳細

テスト環境の分離構造、スタンドアロンサーバーのモック機構、Playwright のライフサイクル仕様、GitHub Actions の最適化などについては、**[テスト & CI/CD アーキテクチャ仕様書](testing.md)** をご参照ください。

