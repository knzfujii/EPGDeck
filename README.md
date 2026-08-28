# EPGDeck

[Mirakurun](https://github.com/Chinachu/Mirakurun) を使用した録画管理ソフトです（[EPGStation](https://github.com/l3tnun/EPGStation) からフォークして開発されています）  
iOS・Android での閲覧に最適化されたモバイルフレンドリーな Web インターフェイスが特徴です  
PC からの閲覧でもモダンな UI で操作可能です

## 機能

### 放送番組の視聴・録画・管理

-   ブラウザでの Web インターフェイス操作
    -   番組表の表示
    -   番組検索
    -   番組単位の予約
        -   番組表からの手動予約
        -   ルールによる自動予約
        -   予約の競合や重複の警告
    -   番組の視聴
        -   放送中番組のライブ視聴
        -   [aribb24.js][] を使用する Web での字幕/文字スーパー表示機能
        -   [mpegts.js][] を使用する Web での[低遅延ライブ視聴機能](docs/manual/streaming-and-captions.md)
    -   録画済み番組のストリーミング視聴
    -   録画済み番組のダウンロード
-   API
    -   [WebAPI Document](docs/dev/api.md)

[aribb24.js]: https://github.com/monyone/aribb24.js
[mpegts.js]: https://github.com/xqq/mpegts.js

---

## 動作環境

-   Linux / macOS
-   [Node.js](http://nodejs.org/) : ^18.16.1 (リポジトリ内に `.mise.toml` を同梱しており、[mise](https://mise.jdx.dev/) に対応しています)
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

## ドキュメント

詳細なマニュアルおよび開発者向けガイドは **[docs/](docs/README.md)** を参照してください。

- **[Linux / macOS 用セットアップマニュアル](docs/manual/setup.md)**
- **[設定ファイル詳細マニュアル](docs/manual/configuration.md)**
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
