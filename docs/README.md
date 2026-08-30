# EPGDeck ドキュメントポータル

EPGDeck の利用ユーザー向けマニュアルおよび開発者向けドキュメントの一覧です。

---

## 📖 ユーザー / 管理者向けマニュアル (`docs/manual/`)

EPGDeck のインストール、設定、日常の運用に関するドキュメントです。

- **[基本セットアップガイド](manual/setup.md)**
  - Linux / macOS 環境でのインストール手順、mise での環境構築、サービスの自動起動設定（pm2）。
- **[設定ファイル詳細マニュアル](manual/configuration.md)**
  - `config/config.yml` の各設定項目（ポート、録画先、エンコード、Mirakurun接続等）の解説。
- **[エンコードシステム仕様書 & 設定マニュアル](manual/encoding.md)**
  - `config/enc_helper.js` によるメディア解析・二重音声分離・ハードウェア支援エンコードの設定と運用。
- **[ロギングシステム仕様 & ログビューア](manual/logging.md)**
  - log4js 統合ログの出力設定および Web UI（`/logs`）でのリアルタイムログ確認。
- **[データベースのバックアップ & レストア](manual/backup.md)**
  - データベース情報のバックアップ取得および復元手順。
- **[リバースプロキシ設定 (Nginx)](manual/reverse-proxy.md)**
  - Nginx を使用したリバースプロキシ構築と Socket.IO 設定例。
- **[字幕表示・低遅延配信設定](manual/streaming-and-captions.md)**
  - aribb24.js / mpegts.js を用いた Web での字幕表示と低遅延ライブ配信の設定。
- **[SQLite3 正規表現検索の有効化](manual/sqlite-regexp.md)**
  - SQLite3 使用時に正規表現検索を利用可能にする手順。
- **[トラブルシューティング / FAQ](manual/troubleshooting.md)**
  - 起動エラー（`check mirakurun` 待機、ポート衝突等）やよくある問題の対処法。

### 視聴クライアント連携
- **[Kodi 連携ガイド](manual/client-integration/kodi.md)**
  - Kodi からの録画番組再生や IPTV Simple Client によるライブ視聴連携。
- **[macOS 外部プレイヤー起動 (URL Scheme)](manual/client-integration/mac-url-scheme.md)**
  - macOS の Safari / Chrome から VLC 等の外部プレイヤーを呼び出す設定。
- **[Windows 外部プレイヤー起動 (URL Scheme)](manual/client-integration/windows-url-scheme.md)**
  - Windows から MPC-HC 等の外部プレイヤーを呼び出すレジストリ設定。

---

## 🛠️ 開発者向けガイド (`docs/dev/`)

EPGDeck の機能開発、コードベースの変更、API 利用、および UI 設計に関する技術ドキュメントです。

- **[開発環境セットアップガイド](dev/getting-started.md)**
  - mise による環境構築、本番環境との競合回避（ポート・DB分離）、ビルド・ホットリロード開発手順。
- **[システムアーキテクチャ解説](dev/architecture.md)**
  - プロセス設計（Operator / Service / EPGUpdater）、Hono REST API、Drizzle ORM、Svelte 5 フロントエンド構成。
- **[WebAPI 仕様・利用ガイド](dev/api.md)**
  - Hono / Swagger UI を利用した RESTful API の仕様と確認方法。
- **[データベース & マイグレーション運用ガイド](dev/database.md)**
  - Drizzle ORM の Schema 設計、Entity 構造、EPGStation 完全互換ポリシー。
- **[画面変更仕様書 (Svelte 5 刷新・開発履歴)](dev/epgdeck_change_spec.md)**
  - Svelte 5 + Tailwind CSS v4 への完全移行、15,000件最適化、新機能（次番組予約・スキップ復活・ルール詳細編集・ダークモードジャンル色等）の変更設計書。
- **[オリジナル EPGStation 画面仕様書](dev/epgstation_ui_spec.md)**
  - フォーク元である EPGStation の全画面仕様・画面遷移・機能対比の参考資料。
- **[改善 TODO リスト](TODO.md)**
  - 今後の機能改善・リファクタリング・パフォーマンス最適化タスク一覧。

