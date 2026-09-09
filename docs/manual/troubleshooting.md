# トラブルシューティング / よくある質問 (FAQ)

EPGDeck の利用中やセットアップ時に発生しやすい問題とその解決策をまとめています。

---

## 1. 起動時の問題

### Q. 起動ログに `check mirakurun` が出続けて起動しない

- **原因**: EPGDeck が Mirakurun に接続できていません。
- **対処法**:
    1. Mirakurun サービスが正常に稼働しているか確認してください（`curl http://<MirakurunIP>:<Port>/api/version`）。
    2. `config/config.yml` の `server.mirakurun` の指定が正しいか確認してください（従来の `server.mirakurunPath`
       も後方互換で対応）。
        - Unix ドメインソケットの場合: `http+unix://%2Fvar%2Frun%2Fmirakurun.sock/`
        - HTTP ポートの場合: `http://127.0.0.1:40772` 等

### Q. 起動ログに `check db` が出続けて起動しない

- **原因**: データベース（SQLite / MySQL）への接続に失敗しています。
- **対処法**:
    - **SQLite の場合**: `data/` ディレクトリに対する書き込み権限があるか確認してください。
    - **MySQL の場合**: MySQL サーバーが稼働しているか、`config/config.yml` の
      `mysql`（ホスト、ポート、ユーザー名、パスワード、DB名）が正しいか確認してください。

### Q. `Error: listen EADDRINUSE: address already in use :::8888` で落ちる

- **原因**: 指定したポート番号（デフォルト
  `8888`）が他のプロセス（本番の EPGStation や別サービス）で既に使用されています。
- **対処法**:
    - `config/config.yml` の `port` を別の番号（例: `8889`）に変更してください。

---

## 2. 番組表・録画に関する問題

### Q. 番組表（EPG）が表示されない・データが取得されない

- **対処法**:
    1. Mirakurun 側でチャンネル設定・チューナー設定が完了し、番組表データが取得できているか確認してください。
    2. 初回起動直後は番組表の取得に数分程度かかる場合があります。Web UI の `/logs`（システムログ画面）または
       `logs/epgdeck.log` を確認してください。

### Q. 録画が開始されない・失敗する

- **対処法**:
    1. Web UI の `/logs`（システムログ画面）または `logs/epgdeck.log` を確認してください。
    2. 録画先ディレクトリ（`config.yml` の
       `recorded`）が存在し、EPGDeck を実行しているユーザーに書き込み権限があるか確認してください。
    3. チューナー不足（競合）が発生していないか確認してください。

---

## 3. 再生・ストリーミングに関する問題

### Q. ライブ視聴や録画再生でエラーが出る

- **対処法**:
    1. `ffmpeg` および `ffprobe` が正しくインストールされ、`config.yml` の `encode.binaries`
       で指定したパスに存在するか確認してください。
    2. ブラウザが対応しているストリーミング形式（HLS / WebM / MP4 等）を選択してください。

---

## 4. データベースのデータ修復・メンテナンス用 SQL

ルールの除外キーワードや重複回避、予約状態などが不整合を起こした際、直接データベース（SQLite /
MySQL）に接続して修復するための SQL クエリ集です。

### 4.1 データベースへの接続

- **SQLite の場合**:
    ```bash
    sqlite3 data/database.db
    ```
- **MySQL の場合**:
    ```bash
    mysql -u <ユーザー名> -p <データベース名>
    ```

> [!TIP]
> EPGDeck の稼働中でも SQL による参照や更新は可能ですが、大きなテーブル操作や一括更新を行う際はサービスの停止中またはバックアップ（`cp data/database.db data/database.db.bak`）を取った上での実行を推奨します。

### 4.2 ルール関連のデータ復旧

#### ① 空文字や空白の除外キーワードが残りフィルターが誤動作する場合

除外キーワードを空欄で保存したにもかかわらず、DB 内に空文字 `""`
や空白が残って検索時に除外フィルターが解除されないケースの修復です。

- **状態の確認**:
    ```sql
    SELECT id, keyword, ignoreKeyword, halfWidthIgnoreKeyword
    FROM rule
    WHERE ignoreKeyword = '' OR (ignoreKeyword IS NOT NULL AND TRIM(ignoreKeyword) = '');
    ```
- **修復（除外キーワードと関連フラグを NULL / 0 にクリア）**:
    ```sql
    UPDATE rule
    SET ignoreKeyword = NULL,
        halfWidthIgnoreKeyword = NULL,
        ignoreName = 0,
        ignoreDescription = 0,
        ignoreExtended = 0,
        ignoreKeyCS = 0,
        ignoreKeyRegExp = 0,
        updateCnt = updateCnt + 1
    WHERE ignoreKeyword = '' OR TRIM(ignoreKeyword) = '';
    ```

#### ② 特定ルールの除外設定のみを完全にリセットしたい場合

- **修復（例: ルール ID が `12` の場合）**:
    ```sql
    UPDATE rule
    SET ignoreKeyword = NULL,
        halfWidthIgnoreKeyword = NULL,
        ignoreName = 0,
        ignoreDescription = 0,
        ignoreExtended = 0,
        updateCnt = updateCnt + 1
    WHERE id = 12;
    ```

### 4.3 二重録画防止・録画履歴（recorded_history）の復旧

「重複録画を回避する（`avoidDuplicate`）」が有効なルールで、以前録画した番組の再放送が自動スキップされてしまう場合、`recorded_history`
テーブルから対象番組の履歴を削除することで再度録画予約の対象にできます。

- **該当番組の履歴を確認**:
    ```sql
    -- SQLite の場合
    SELECT id, name, channelId, datetime(endAt/1000, 'unixepoch', 'localtime') AS recordedTime
    FROM recorded_history
    WHERE name LIKE '%番組名%';

    -- MySQL の場合
    SELECT id, name, channelId, FROM_UNIXTIME(endAt/1000) AS recordedTime
    FROM recorded_history
    WHERE name LIKE '%番組名%';
    ```
- **修復（該当番組の履歴のみを削除して再録画を許可）**:
    ```sql
    DELETE FROM recorded_history WHERE name LIKE '%番組名%';
    ```
- **全履歴リセット（過去の全重複判定履歴を消去したい場合）**:
    ```sql
    DELETE FROM recorded_history;
    ```

### 4.4 予約（reserve）の復旧・クリーンアップ

#### ① ルール予約が「重複（スキップ）」のまま解除されない場合

- **スキップ中・重複中の予約を確認**:
    ```sql
    SELECT id, ruleId, name, isSkip, isOverlap, isIgnoreOverlap
    FROM reserve
    WHERE isOverlap = 1 OR isSkip = 1;
    ```
- **特定予約（例: ID `105`）のスキップ・重複を強制解除して録画対象にする**:
    ```sql
    UPDATE reserve
    SET isOverlap = 0,
        isSkip = 0,
        isIgnoreOverlap = 1
    WHERE id = 105;
    ```
- **全ルール予約のスキップ・重複フラグを一括リセット（次回の EPG 定期更新で再計算させる）**:
    ```sql
    UPDATE reserve
    SET isOverlap = 0,
        isSkip = 0
    WHERE isTimeSpecified = 0;
    ```

#### ② 既に削除されたルールに紐づく「孤立した予約」の削除

- **確認**:
    ```sql
    SELECT r.id, r.ruleId, r.name
    FROM reserve r
    LEFT JOIN rule ru ON r.ruleId = ru.id
    WHERE r.ruleId IS NOT NULL AND ru.id IS NULL;
    ```
- **修復（孤立予約の削除）**:
    ```sql
    DELETE FROM reserve
    WHERE ruleId IS NOT NULL AND ruleId NOT IN (SELECT id FROM rule);
    ```
