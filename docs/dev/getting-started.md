# 開発環境セットアップガイド

本ガイドでは、EPGDeck のローカル開発環境の構築手順、本番環境との競合回避ルール、および開発時のビルド・実行方法について解説します。

---

## 1. 前提条件

- **Node.js**: 推奨 `v26.x (LTS)` (サポート: `v22.x ~ v26.x`)
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
$ cp config/operatorLogConfig.sample.yml config/operatorLogConfig.yml
$ cp config/epgUpdaterLogConfig.sample.yml config/epgUpdaterLogConfig.yml
$ cp config/serviceLogConfig.sample.yml config/serviceLogConfig.yml
```

### `config/config.yml` の編集
1. **ポート番号の変更**:
   本番（通常 `8888`）と被らないポート（例: `8889`）に変更します。
   ```yaml
   port: 8889
   ```
2. **Mirakurun の接続先**:
   ホスト上で本番の Mirakurun が動作している場合は、そのソケットまたはポートを指定して共有参照します。
   ```yaml
   mirakurunPath: http+unix://%2Fvar%2Frun%2Fmirakurun.sock/
   ```
3. **データベース設定**:
   デフォルトは SQLite（`data/database.db`）です。開発専用の DB ファイルとして扱われます。

---

## 4. 開発時のビルド & 実行

### ① ワンコマンド開発モード（おすすめ）
以下のコマンドを実行するだけで、**サーバー（自動コンパイル + nodemon による自動再起動）** と **クライアント（Vite による自動差分ビルド）** が並行して同時に起動します。

```bash
$ npm run dev
```

- **サーバー側**: `src/` 配下の TypeScript を編集して保存すると、自動でコンパイルされサーバーが再起動します。
- **クライアント側**: `client/src/` 配下の Vue / TS を編集して保存すると、Vite により自動で高速差分ビルドされ `client/dist` が更新されます（ブラウザをリロードすると反映）。

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
- **クライアントの Vite 開発サーバー単体起動**:
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
- **サーバー側 Lint & フォーマット**:
  ```bash
  $ npm run lint
  $ npm run format
  ```
- **サーバー側 TypeScript 型チェック**:
  ```bash
  $ npm run compile
  ```
- **クライアント側 Lint**:
  ```bash
  $ cd client && npm run lint
  ```
- **全体ビルド検証**:
  ```bash
  $ npm run build
  ```
