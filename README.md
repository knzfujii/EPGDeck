# EPGDeck

[Mirakurun](https://github.com/Chinachu/Mirakurun) を使用した録画管理ソフトです（[EPGStation](https://github.com/l3tnun/EPGStation) からフォークして開発されています）  
**Hono + Drizzle ORM** の高速バックエンドと、**Svelte 5 Runes + Tailwind CSS v4** のモダンで軽量な Web インターフェイス（PC / iOS / Android / PWA 完全対応）を備えています。

## 特徴 ＆ 主な機能

### 📺 放送番組の視聴・録画・アーカイブ管理

-   **超高速・省メモリな Web インターフェイス (Svelte 5 + Tailwind CSS v4)**
    -   **ダッシュボード (`/`)**: 直近の予約・録画済み一覧に加え、各録画先ストレージの使用状況・容量プログレスバーを統合表示。
    -   **番組表 (`/guide`)**: 視認性に優れたコンパクトグリッド、今日〜8日後までのクイック日付選択セレクタ、過去・未来のナビゲーションガード、現在時刻ジャンプ。
    -   **放映中番組 (`/onair`)**: 現在放送中番組 ＆ 次番組のワンクリック予約・詳細ポップアップ、進行度プログレスバー。
    -   **録画済み一覧 (`/recorded`)**: **15,000件超の録画アーカイブ対応**（年・月セレクターによる瞬間ジャンプ、ジャンルチップ絞り込み、テーブル/カード切り替え、保護トグル）。
    -   **自動録画ルール管理 (`/rule`)**: 実予約数の集計バッジ表示、EPGStation 完全互換の詳細ルール作成・編集モーダル（保存先ストレージ/サブディレクトリ/エンコード2系統）。
    -   **予約一覧 (`/reserves`)**: ワンクリックでの手動予約キャンセル（取消）＆ ルール予約スキップ / スキップ解除（復活）。
    -   **リアルタイムシステムログ (`/logs`)**: Winston による統合ログを Web 画面上でリアルタイムストリーミング追尾（`tail -f` 相当）、レベル・プロセス別フィルタ、キーワード検索、ログ保存。
    -   **統合動画プレイヤー (`Watch.svelte`)**: 映像鑑賞に最適な直角デザイン、[aribb24.js][] による字幕/文字スーパー表示、[mpegts.js][] による低遅延ライブ視聴、HLS キープアライブ ＆ 離脱時の自動チューナー解放。

-   **高性能・高機能なエンコードエンジン (`config/enc_helper.js`)**
    -   **二重音声（Dual-mono）自動分離**: ニュースやバイリンガル放送（主音声/副音声）の自動判定とステレオ分離。
    -   **地デジ 1440x1080 アスペクト比補正**: 16:9 ディスプレイで歪まない `setdar=16/9` 自動適用。
    -   **元ファイル保護安全機構**: エンコード後の動画長検証（`verifyDuration`）により、異常終了や 0 バイト出力時に元 TS の誤削除を防止。
    -   **リアルタイム進捗計算**: Web UI へのエンコード進捗（% / fps / 残り時間）リアルタイム通知。
    -   **ハードウェア支援プリセット**: VAAPI (Intel/AMD), Intel QSV, NVIDIA NVENC テンプレートを同梱。

-   **REST API & リアルタイム通信**
    -   [WebAPI Document](docs/dev/api.md) (Hono REST API / Swagger UI)
    -   Socket.IO による録画状態・予約更新・エンコード進捗の全クライアント自動同期。

[aribb24.js]: https://github.com/monyone/aribb24.js
[mpegts.js]: https://github.com/xqq/mpegts.js

---

## 動作環境

-   Linux / macOS
-   [Node.js](http://nodejs.org/) : `^22.0.0 ~ v26.x` (推奨: `v26.x LTS`、リポジトリ内に `.mise.toml` を同梱しており、[mise](https://mise.jdx.dev/) に対応しています)
-   [Mirakurun](https://github.com/Chinachu/Mirakurun) : ^3.8.0 or [mirakc](https://github.com/mirakc/mirakc) : ^3.1.10
-   いずれかのデータベース
    -   [SQLite3](https://www.sqlite.org/)（設定不要、Drizzle ORM で自動管理）[標準]
    -   [MySQL](https://www.mysql.com/jp/) ([MariaDB](https://mariadb.org/))【推奨】※文字コードは utf8mb4
-   [FFmpeg](http://ffmpeg.org/)

---

## データベース ＆ 設定互換性ポリシー

### データベース (SQLite / MySQL)
EPGDeck は **EPGStation 最新版 (v2.10.0) との完全なデータベース互換性** を保証しています。
* **新規インストール**: 初回起動時に EPGStation v2.10.0 互換の全テーブル・カラム・インデックスが自動生成されます。
* **既存データ移行**: 既存の EPGStation の SQLite（`data/database.db`）や MySQL をそのまま指定して起動するだけで、録画・予約・ルールを 100% 保持したまま移行できます。

### 設定ファイル (`config/config.yml`)
EPGDeck では、システム構成に合わせて設定ファイルを機能別（`server`, `database`, `log`, `epg`, `recording`, `encode`, `hooks`, `urlscheme`, `streaming`, `kodi`）にカテゴリ分けした構造を採用しています。
* EPGStation 形式の `config.yml` とは設定キーの階層構造が異なります。
* セットアップ時は、同梱されている `config/config.yml.template` を `config/config.yml` にコピーして設定を行ってください。
* 設定の詳細は **[設定ファイル詳細マニュアル](docs/manual/configuration.md)** を参照してください。

---

## リポジトリ構成

```
.
├── client/              # フロントエンド（Svelte 5 + Vite + Tailwind CSS v4）
│   └── src/
│       ├── lib/         # 共通コンポーネント、状態管理ストア、ユーティリティ
│       └── routes/      # 各画面ルート（ダッシュボード、番組表、録画一覧、ログ等）
├── config/              # 設定ファイルテンプレート、エンコード支援スクリプト
├── docs/                # 利用者向けマニュアル（manual/）および開発者ガイド（dev/）
├── src/                 # バックエンド（Node.js + Hono + Drizzle ORM）
│   ├── db/              # Drizzle ORM スキーマ定義（SQLite / MySQL）
│   └── model/           # ドメインモデル、録画・配信制御、Hono API ルート
└── test/                # 自動テストスイート
    ├── e2e/             # Playwright E2E テスト
    └── unit/            # Vitest 単体テスト
```

## ドキュメント

詳細なマニュアルおよび開発者向けガイドは **[docs/](docs/README.md)** を参照してください。

- **[Linux / macOS 用セットアップマニュアル](docs/manual/setup.md)**
- **[設定ファイル詳細マニュアル](docs/manual/configuration.md)**
- **[ロギングシステム仕様 & リアルタイムビューア](docs/manual/logging.md)**
- **[エンコードシステム仕様書 & 設定マニュアル](docs/manual/encoding.md)**
- **[リバースプロキシ設定ガイド (Nginx)](docs/manual/reverse-proxy.md)**
- **[開発環境スタートガイド](docs/dev/getting-started.md)**
- **[トラブルシューティング / FAQ](docs/manual/troubleshooting.md)**

---

## インストール & アップデート方法

### アップデート

```bash
git pull
npm run all-install
npm run build
```

---

## 動作確認

-   ブラウザから `http://<IPaddress>:<Port>/` にアクセスする
-   curl や wget で API を確認

    ```bash
    curl -o - http://<IPaddress>:<Port>/api/version
    ```

### ログの確認

EPGDeck は Winston 統合ロギングを採用しており、Web UI の **`/logs`（システムログ画面）** からリアルタイムにログを確認できます。
ファイルログは設定に応じて `logs/epgdeck.log` に集約出力されます。詳細は **[ロギングシステム仕様](docs/manual/logging.md)** を参照してください。

---

## クライアント向け設定

### URL Scheme

EPGDeck 上の動画再生を OS 上の外部アプリケーション（VLC、IINA、PotPlayer 等）で行うことができます。

-   [config.yml 内の設定 (iOS, Android, macOS, Windows)](docs/manual/configuration.md#urlscheme)
-   [macOS 用の URL Scheme 設定方法](docs/manual/client-integration/mac-url-scheme.md)
-   [Windows 用の URL Scheme 設定方法](docs/manual/client-integration/windows-url-scheme.md)

---

## データベースのバックアップとレストア

データベースに含まれる予約情報・録画済み番組情報・録画履歴・自動録画ルールをバックアップ / レストア可能です。

### バックアップ

```bash
npm run backup FILENAME
```

### レストア

```bash
npm run restore FILENAME
```

---

## Tips

### Kodi との連携

[Kodi](https://kodi.tv/) との連携に対応しています。詳細は [Kodi 連携ガイド](docs/manual/client-integration/kodi.md) を参照してください。

---

## Contributing

[CONTRIBUTING.md](.github/CONTRIBUTING.md)

## Licence

[MIT Licence](LICENSE)

