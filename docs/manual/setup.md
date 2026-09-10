# Linux / macOS 用 セットアップマニュアル

本マニュアルでは、Linux / macOS 環境におけるセットアップ手順を解説します

## セットアップ

1. **Node.js, Mirakurun, FFmpeg/FFprobe** がインストール済みであることを確認する

    本番環境は Mirakurun の対応状況に合わせて **`Node.js v24.x`** を推奨します（開発環境では `v26.x` でのビルド・テストにも完全対応）。
    本リポジトリには `.mise.toml` が含まれているため、[mise](https://mise.jdx.dev/) をお使いの場合は以下で Node.js を自動セットアップできます。

    ```bash
    $ mise install
    ```


    手動で確認する場合:

    ```bash
    $ node --version
    $ curl -o - http://<MirakurunURL>:<Port>/api/version
    $ ffmpeg -version
    ```

    FFmpeg/FFprobe についてデフォルトでは `/usr/local/bin/` にインストールされていると想定しています  
    違う場所にインストールされている場合は `config.yml` を修正してください

2. EPGDeck のインストール

    ```bash
    $ git clone https://github.com/knzfujii/EPGDeck.git
    $ cd EPGDeck
    $ npm run all-install
    $ npm run build
    ```

3. 設定ファイルの作成

    ```bash
    $ cp config/config.yml.template config/config.yml
    $ cp config/enc.js.template config/enc.js
    ```

4. 設定ファイルの編集

    - 詳細な設定は [詳細マニュアル](configuration.md) を参照

    ```yaml
    server:
      port: 8888
      mirakurun: 'http+unix://%2Fvar%2Frun%2Fmirakurun.sock/'
      # Mirakurun が別ホストで動作している場合:
      # mirakurun: 'http://192.168.1.10:40772/'
    ```

## EPGDeck の起動 / 終了

### 1. 手動で起動する場合 (テスト・開発用)

```bash
$ npm start
```

終了する場合は、ターミナルで **`Ctrl+C` (SIGINT)** を送信します（グレースフルシャットダウン処理が行われます）。

### 2. 24365 連続稼働（非コンテナ環境: systemd を利用）

Linux 環境では、OS ネイティブの **systemd** を利用して自動起動・自動復旧を行うことを推奨します。

1. ユニット定義ファイルのコピーと編集:
   ```bash
   $ sudo cp misc/systemd/epgdeck.service /etc/systemd/system/
   # 実行ユーザー (User=) やパス (WorkingDirectory=, ExecStart=) をご自身の環境に合わせて編集
   $ sudo nano /etc/systemd/system/epgdeck.service
   ```

2. サービスの有効化と起動:
   ```bash
   $ sudo systemctl daemon-reload
   $ sudo systemctl enable epgdeck
   $ sudo systemctl start epgdeck
   ```

3. 状態確認・ログ確認・停止:
   ```bash
   # 稼働ステータス確認
   $ sudo systemctl status epgdeck

   # リアルタイムログ確認
   $ journalctl -u epgdeck -f

   # サービス停止
   $ sudo systemctl stop epgdeck
   ```

### 3. 24365 連続稼働（コンテナ環境: Docker を利用）

Docker Compose を利用してコンテナとして運用する場合の手順です。

1. 環境変数ファイルの設定:
   ```bash
   $ cp .env.example .env
   # ホストの UID/GID、公開ポート、保存先ディレクトリ等を編集
   $ nano .env
   ```

2. コンテナのビルドと起動:
   ```bash
   $ docker compose up -d --build
   ```

3. ログ確認・停止:
   ```bash
   # ログ確認
   $ docker compose logs -f

   # コンテナ停止
   $ docker compose down
   ```

> [!TIP]
> **実行ユーザーと Samba / NAS 共有ストレージの設定について**
> 録画ファイルを Windows/Mac と共有する場合や、外部 NAS をマウントして利用する場合は、パーミッショントラブルを防ぐために必ず [実行ユーザー・パーミッション設定ガイド](storage_and_permissions.md) をご確認ください。

## MySQL (MariaDB) 使用時の注意

-   **文字コード**: 絵文字や特殊文字を正常に扱うため、データベースの文字コードには必ず **`utf8mb4`** を設定してください（`config.yml` 内の `mysql.charset: utf8mb4`）。
-   **バイナリログ**: EPGDeck 使用中は MySQL のバイナリログが大量に生成されてディスクを圧迫するので、MySQL の設定を変えることを推奨します。

```ini
expire_logs_days = 1
```
