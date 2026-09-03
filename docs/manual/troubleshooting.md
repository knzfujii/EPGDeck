# トラブルシューティング / よくある質問 (FAQ)

EPGDeck の利用中やセットアップ時に発生しやすい問題とその解決策をまとめています。

---

## 1. 起動時の問題

### Q. 起動ログに `check mirakurun` が出続けて起動しない
- **原因**: EPGDeck が Mirakurun に接続できていません。
- **対処法**:
  1. Mirakurun サービスが正常に稼働しているか確認してください（`curl http://<MirakurunIP>:<Port>/api/version`）。
  2. `config/config.yml` の `server.mirakurun` の指定が正しいか確認してください（従来の `server.mirakurunPath` も後方互換で対応）。
     - Unix ドメインソケットの場合: `http+unix://%2Fvar%2Frun%2Fmirakurun.sock/`
     - HTTP ポートの場合: `http://127.0.0.1:40772` 等

### Q. 起動ログに `check db` が出続けて起動しない
- **原因**: データベース（SQLite / MySQL）への接続に失敗しています。
- **対処法**:
  - **SQLite の場合**: `data/` ディレクトリに対する書き込み権限があるか確認してください。
  - **MySQL の場合**: MySQL サーバーが稼働しているか、`config/config.yml` の `mysql`（ホスト、ポート、ユーザー名、パスワード、DB名）が正しいか確認してください。

### Q. `Error: listen EADDRINUSE: address already in use :::8888` で落ちる
- **原因**: 指定したポート番号（デフォルト `8888`）が他のプロセス（本番の EPGStation や別サービス）で既に使用されています。
- **対処法**:
  - `config/config.yml` の `port` を別の番号（例: `8889`）に変更してください。

---

## 2. 番組表・録画に関する問題

### Q. 番組表（EPG）が表示されない・データが取得されない
- **対処法**:
  1. Mirakurun 側でチャンネル設定・チューナー設定が完了し、番組表データが取得できているか確認してください。
  2. 初回起動直後は番組表の取得に数分程度かかる場合があります。Web UI の `/logs`（システムログ画面）または `logs/epgdeck.log` を確認してください。

### Q. 録画が開始されない・失敗する
- **対処法**:
  1. Web UI の `/logs`（システムログ画面）または `logs/epgdeck.log` を確認してください。
  2. 録画先ディレクトリ（`config.yml` の `recorded`）が存在し、EPGDeck を実行しているユーザーに書き込み権限があるか確認してください。
  3. チューナー不足（競合）が発生していないか確認してください。

---

## 3. 再生・ストリーミングに関する問題

### Q. ライブ視聴や録画再生でエラーが出る
- **対処法**:
  1. `ffmpeg` および `ffprobe` が正しくインストールされ、`config.yml` の `encode.binaries` で指定したパスに存在するか確認してください。
  2. ブラウザが対応しているストリーミング形式（HLS / WebM / MP4 等）を選択してください。
