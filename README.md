# EPGDeck

[Mirakurun](https://github.com/Chinachu/Mirakurun) を使用した録画管理ソフトです（[EPGStation](https://github.com/l3tnun/EPGStation) からフォークして開発されています）  
**Svelte 5 Runes** と **Tailwind CSS v4** による、圧倒的に軽量・高速でモダンな Web インターフェイス（PC / iOS / Android / PWA 完全対応）が特徴です。

## 特徴 ＆ 主な機能

### 📺 放送番組の視聴・録画・アーカイブ管理

-   **超高速・省メモリな Web インターフェイス (Svelte 5 + Tailwind CSS v4)**
    -   **番組表 (`/guide`)**: 視認性に優れたコンパクトグリッド（70% 幅最適化）、個別セルのタイトル・概要最大化、鮮明なダークモードジャンル色。
    -   **放映中番組 (`/onair`)**: 現在放送中番組 ＆ 次番組のワンクリック予約・詳細ポップアップ、進行度プログレスバー。
    -   **録画済み一覧 (`/recorded`)**: **15,000件超の録画アーカイブ対応**（年・月セレクターによる瞬間ジャンプ、ジャンルチップ絞り込み、テーブル/カード切り替え、保護トグル）。
    -   **自動録画ルール管理 (`/rule`)**: 実予約数の集計バッジ表示、EPGStation 完全互換の詳細ルール作成・編集モーダル（保存先ストレージ/サブディレクトリ/エンコード2系統）。
    -   **予約一覧 (`/reserves`)**: ワンクリックでの手動予約キャンセル（取消）＆ ルール予約スキップ / スキップ解除（復活）。
    -   **統合動画プレイヤー (`Watch.svelte`)**: 映像鑑賞に最適なシャープな四角（直角デザイン / `rounded-none`）、[aribb24.js][] による字幕/文字スーパー表示、[mpegts.js][] による低遅延ライブ視聴、HLS キープアライブ ＆ 離脱時の自動チューナー解放。
-   **API**
    -   [WebAPI Document](docs/dev/api.md) (Hono REST API / Swagger UI)

[aribb24.js]: https://github.com/monyone/aribb24.js
[mpegts.js]: https://github.com/xqq/mpegts.js

---

## 動作環境

-   Linux / macOS
-   [Node.js](http://nodejs.org/) : `^22.0.0 ~ v26.x` (推奨: `v26.x LTS`、リポジトリ内に `.mise.toml` を同梱しており、[mise](https://mise.jdx.dev/) に対応しています)
-   [Mirakurun](https://github.com/Chinachu/Mirakurun) : ^3.8.0 or [mirakc](https://github.com/mirakc/mirakc) : ^3.1.10
-   いずれかのデータベース
    -   [SQLite3](https://www.sqlite.org/)（設定不要だが検索機能に制限あり）[標準]
        -   [SQLite3 使用時の正規表現での検索の有効化について](docs/manual/sqlite-regexp.md)
    -   [MySQL](https://www.mysql.com/jp/) ([MariaDB](https://mariadb.org/))【推奨(要設定)】※文字コードは utf8mb4
-   [FFmpeg](http://ffmpeg.org/)

sqlite3 パッケージのインストール時にバイナリが存在しなかった場合は次の環境も必要

-   for Linux / macOS
    -   [Python v3.x](https://www.python.org/) node-gyp にて必要
    -   [GCC](https://gcc.gnu.org/) node-gyp にて必要

---

## データベース ＆ 設定互換性ポリシー

### データベース (SQLite / MySQL)
EPGDeck は **EPGStation 最新版 (v2.10.0) との完全なデータベース互換性** を保証しています。
* **新規インストール**: 初回起動時に EPGStation v2.10.0 互換の全テーブル・カラム・インデックスが自動生成されます。
* **既存データ移行**: 既存の EPGStation の SQLite（`data/database.db`）や MySQL をそのまま指定して起動するだけで、録画・予約・ルールを 100% 保持したまま移行できます。

### 設定ファイル (`config/config.yml`)
EPGDeck では、システム構成に合わせて設定ファイルを機能別（`server`, `database`, `recording`, `encode` 等）にカテゴリ分けした構造を採用しています。
* EPGStation 形式の `config.yml` とは設定キーの階層構造が異なります。
* セットアップ時は、同梱されている `config/config.yml.template` を `config/config.yml` にコピーして設定を行ってください。
* 設定の詳細は **[設定ファイル詳細マニュアル](docs/manual/configuration.md)** を参照してください。

---

## ドキュメント

詳細なマニュアルおよび開発者向けガイドは **[docs/](docs/README.md)** を参照してください。

- **[Linux / macOS 用セットアップマニュアル](docs/manual/setup.md)**
- **[設定ファイル詳細マニュアル](docs/manual/configuration.md)**
- **[エンコードシステム仕様書 & 設定マニュアル](docs/manual/encoding.md)**
- **[開発環境セットアップガイド](docs/dev/getting-started.md)**
- **[トラブルシューティング / FAQ](docs/manual/troubleshooting.md)**

---

## アップデート方法

-   以下のコマンドを実行後に EPGDeck を再起動する

    ```
    $ git pull
    $ npm run all-install
    $ npm run build
    ```

---

## 動作確認

-   ブラウザから `http://<IPaddress>:<Port>/` にアクセスをする
-   curl や wget で API を叩く

    ```
    $ curl -o - http://<IPaddress>:<Port>/api/config
    ```

### ログの確認

#### [ログ出力の詳細設定](docs/manual/logging.md)

#### logs/EPGUpdater

-   EPG 更新機能からのログが記録されています
    -   `access.log`
        -   基本的に空ファイル
    -   `stream.log`
        -   基本的に空ファイル
    -   `system.log`
        -   Mirakurun へのアクセスログ、番組情報の更新等のログ

#### logs/Operator

-   録画管理機能からのログが記録されています
    -   `access.log`
        -   基本的に空ファイル
    -   `stream.log`
        -   基本的に空ファイル
    -   `system.log`
        -   Mirakurun へのアクセスログ、コマンドの実行、録画等のログ

#### logs/Service

-   Web インターフェイスからのログ記録されています
    -   `access.log`
        -   Web インターフェイスへのアクセスログ
    -   `stream.log`
        -   ストリーミング配信ログ
    -   `system.log`
        -   Web サーバの動作ログ
    -   `encode.log`
        -   エンコード処理関連のログ

---

## クライアント向け設定

-   EPGDeck を利用する端末向けの設定を行うと快適に利用可能です

### URL Scheme

-   EPGDeck 上の動画再生を OS 上のアプリケーションで行うことが出来ます

    -   [config.yml 内の設定 (iOS, Android, macOS, Windows)](docs/manual/configuration.md#urlscheme)
    -   [macOS 用の URL Scheme 設定方法](docs/manual/client-integration/mac-url-scheme.md)
    -   [Windows 用の URL Scheme 設定方法](docs/manual/client-integration/windows-url-scheme.md)

-   上記以外の環境での設定は WebUI の設定で各ブラウザごとに設定してください

### スマートフォン側の設定

config.yml で設定したアプリをインストールしてください

---

## データベースのバックアップとレストア

データベースに含まれる以下の情報がバックアップ可能です

-   予約情報
-   録画済み番組情報
-   録画履歴
-   録画予約ルール

バックアップデータはデータベースに依存しないので MySQL でバックアップし、SQLite3 へレストアなども可能です

### 注意

以下のファイルとディレクトリはバックアップに含まれません  
別途手動でバックアップしてください

-   録画ファイル (recorded)
-   サムネイル (thumbnail)
-   ドロップログ (drop)
-   ログ (logs)
-   設定ファイル (config.yml)

### バックアップ

-   以下のコマンドを実行

```
npm run backup FILENAME
```

### レストア

-   config.yml に新しいデータベース設定を記述後に以下のコマンドを実行

```
npm run restore FILENAME
```

---

## Tips

### Kodi との連携

[Kodi](https://kodi.tv/) との連携に対応しています詳細は [Kodi 連携ガイド](docs/manual/client-integration/kodi.md) を参照してください

### Android 6.0 以上での注意

Android の設定 -> ユーザー補助 にて "操作の監視" が必要なサービスを ON にしていると、番組表の動作が著しく重くなります  
具体的なアプリは LMT Launcher や Pie Control などが挙げられます

該当サービスを OFF にするのが一番良いですが、それができない場合は Firefox での使用を試してみてください。

## Contributing

[CONTRIBUTING.md](.github/CONTRIBUTING.md)

## Licence

[MIT Licence](LICENSE)
