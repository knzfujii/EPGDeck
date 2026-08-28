# 開発環境セットアップガイド

本ガイドでは、EPGDeck のローカル開発環境の構築手順、本番環境との競合回避ルール、および開発時のビルド・実行方法について解説します。

---

## 1. 前提条件

- **Node.js**: `v18.x`
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

### サーバー側のビルドと起動
```bash
# サーバーの型チェック & ビルド
$ npm run build-server

# サーバーの起動
$ npm start
```
起動後、ブラウザで `http://localhost:8889/`（設定したポート）にアクセスします。

### クライアント側のホットリロード開発（フロントエンド）
UI の変更を即座にブラウザに反映させるには、クライアントの watch モードを利用します：

```bash
$ cd client
$ npm run watch
```

---

## 5. コード品質・テストコマンド

変更をコミットする前に、以下のコマンドで Lint とフォーマットを確認してください。

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
