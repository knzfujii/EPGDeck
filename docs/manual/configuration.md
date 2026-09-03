# config.yml 詳細マニュアル

EPGDeck では、設定ファイルをカテゴリごとにグループ化した構造化 YAML スキーマを採用しています。

## 設定カテゴリ一覧

- [1. サーバー設定 (`server`)](#1-サーバー設定-server)
- [2. データベース設定 (`database`)](#2-データベース設定-database)
- [3. ログ設定 (`log`)](#3-ログ設定-log)
- [4. 番組表・EPG設定 (`epg`)](#4-番組表epg設定-epg)
- [5. 録画設定 (`recording`)](#5-録画設定-recording)
- [6. エンコード設定 (`encode`)](#6-エンコード設定-encode)
- [7. 外部連携・フック設定 (`hooks`)](#7-外部連携フック設定-hooks)
- [8. URLスキーム設定 (`urlscheme`)](#8-urlスキーム設定-urlscheme)
- [9. 配信・ストリーミング設定 (`streaming`)](#9-配信ストリーミング設定-streaming)
- [10. Kodi 連携設定 (`kodi`)](#10-kodi-連携設定-kodi)

---

## 1. サーバー設定 (`server`)

### `server.port`
EPGDeck が Web アクセスを待ち受ける HTTP ポート番号です。

| 種類 | デフォルト値 | 必須 |
| --- | --- | --- |
| number | - | no (※https 設定が無い場合は必須) |

```yaml
server:
  port: 8888
```

### `server.mirakurun`
接続先 Mirakurun の URL または UNIX ドメインソケットのパスです。

| 種類 | デフォルト値 | 必須 |
| --- | --- | --- |
| string | - | yes |

```yaml
server:
  mirakurun: http+unix://%2Fvar%2Frun%2Fmirakurun.sock/
  # または
  # mirakurun: 'http://192.168.1.10:40772/'
```

### `server.apiServers`
Swagger UI の OpenAPI ドキュメントに記載するサーバー URL の一覧です。  
localhost 以外のホストから API を利用する場合に設定します（未指定時は `http://localhost:<port>` が自動設定されます）。

| 種類 | デフォルト値 | 必須 |
| --- | --- | --- |
| string[] | `http://localhost:<port>` | no |

```yaml
server:
  apiServers:
    - http://192.168.1.10:8888
```

### `server.subDirectory`
リバースプロキシ等でサブディレクトリ下に配置する場合のプレフィックスパスです。

```yaml
server:
  subDirectory: /epgdeck/
```

### `server.isAllowAllCORS`
すべてのオリジンからの CORS リクエストを許可するかどうかを設定します。

```yaml
server:
  isAllowAllCORS: true
```

### `server.https`
HTTPS で直接待ち受ける場合の設定です。

```yaml
server:
  https:
    port: 8443
    key: /path/to/server.key
    cert: /path/to/server.crt
    ca: /path/to/ca.crt # オプション
```

---

## 2. データベース設定 (`database`)

### `database.type`
使用するデータベース種別を指定します（`sqlite` | `mysql` | `postgres`）。

```yaml
database:
  type: sqlite
```

### `database.sqlite`
SQLite 固有のオプション設定です。

```yaml
database:
  type: sqlite
  sqlite:
    extensions:
      - '/path/to/regexp.so'
    regexp: true
```

### `database.mysql` / `database.postgres`
RDBMS の接続設定です。

```yaml
database:
  type: mysql
  mysql:
    host: 127.0.0.1
    port: 3306
    user: epgdeck
    password: password
    database: epgdeck
    charset: utf8mb4
```

---

## 3. ログ設定 (`log`)

EPGDeck のログ出力（コンソール・ファイル・Web 表示バッファ）を設定します。

```yaml
log:
  level: info          # debug | info | warn | error
  console: true        # 端末へのカラーログ出力
  file:
    enabled: true      # ログファイルへの永続化
    path: '%ROOT%/logs/epgdeck.log'
    maxSize: 10485760  # 1ファイルあたりの最大サイズ(バイト)
    backups: 5         # 保持世代数
  bufferSize: 1000     # Web UI / Socket.io で保持するログ行数
```

---

## 4. 番組表・EPG設定 (`epg`)

```yaml
epg:
  intervalMinutes: 10              # Mirakurun からの番組表定期更新間隔(分)
  replaceEnclosingCharacters: true # [字] などの囲み文字を標準括弧に置換
  channelOrder: [1, 2, 3]          # チャンネル並び順 (Channel ID)
  sidOrder: [1024, 1025]           # サービスID並び順
  excludeChannels: [10]            # 除外チャンネル
  excludeSids: [1026]              # 除外サービスID
```

---

## 5. 録画設定 (`recording`)

```yaml
recording:
  filenameFormat: '%YEAR%年%MONTH%月%DAY%日%HOUR%時%MIN%分%SEC%秒-%TITLE%'
  fileExtension: .m2ts
  directories:
    - name: recorded
      path: '%ROOT%/recorded'
      limitThreshold: 107374182400 # 100GB以下になったら古い録画を自動削除(バイト)
  tempDir: '%ROOT%/recorded_tmp'   # 一時録画ディレクトリ（指定時は録画完了後に正規ディレクトリへ移動）
  historyRetentionDays: 90         # 二重録画防止のための録画履歴保持日数
  storageCheckIntervalSeconds: 60  # ディスク空き容量チェック間隔(秒)
  priority:
    recording: 2                   # 通常録画時のMirakurun優先度
    conflict: 1                    # 重複・競合録画時のMirakurun優先度
    streaming: 0                   # ライブ配信時のMirakurun優先度
  timeSpecifiedStartMargin: 1      # 時刻指定予約の開始前マージン(秒)
  timeSpecifiedEndMargin: 2        # 時刻指定予約の終了後マージン(秒)
  thumbnail:
    path: '%ROOT%/thumbnail'
    size: 480x270
    positionSeconds: 5
  dropLog:
    enabled: true
    path: '%ROOT%/drop'
  uploadTempDir: '%ROOT%/data/upload'
```

---

## 6. エンコード設定 (`encode`)

EPGDeck では Jellyfin-FFmpeg などの高速・高機能なトランスコーダを標準サポートしています。

```yaml
encode:
  binaries:
    ffmpeg: /usr/bin/ffmpeg
    ffprobe: /usr/bin/ffprobe
  maxProcesses: 4                  # システム全体の最大エンコードプロセス数
  concurrency: 1                   # 同時実行キュー数
  presets:
    # 1. 標準スクリプト指定 (config/ 配下のファイル名を指定)
    - name: H.264-1080p
      script: enc_1080p.js
      suffix: .mp4
      rate: 4.0
    - name: H.264-720p
      script: enc_720p.js
      suffix: .mp4
      rate: 2.5

    # 2. 独自コマンド・外部シェルスクリプト指定 (cmd を直接記述)
    # %NODE% (Node.js実行パス), %ROOT% (プロジェクトルート) などのマクロや外部バイナリが利用可能です
    # - name: Custom-Script
    #   cmd: '%NODE% %ROOT%/config/my_custom_encode.js'
    #   suffix: .mp4
    #   rate: 3.0
    # - name: Shell-Script
    #   cmd: '/usr/local/bin/my_encode.sh'
    #   suffix: .mkv
    #   rate: 4.0
```

### `encode.presets` パラメータ一覧

| パラメータ名 | 型 | 必須 | 説明 |
| :--- | :--- | :--- | :--- |
| **`name`** | `string` | **必須** | Web UI 上に表示されるプリセット表示名（例: `H.264-1080p`） |
| **`script`** | `string` | 任意 | `config/` ディレクトリ配下のエンコードスクリプト名（例: `enc_1080p.js`） |
| **`cmd`** | `string` | 任意 | 独自コマンド・外部シェルスクリプトを実行する場合のコマンド文字列 |
| **`suffix`** | `string` | 任意 | 出力ファイルの拡張子（例: `.mp4`, `.mkv`）。省略時は元ファイルの拡張子 |
| **`rate`** | `number` | 任意 | **タイムアウト倍率係数**（デフォルト: `4.0`）。録画実時間 × `rate` を超過した場合にハングアップとみなして強制終了します（例: 30分番組 × `rate: 4.0` = 120分でタイムアウト） |

---

## 7. 外部連携・フック設定 (`hooks`)

録画やエンコードのライフサイクルイベントに応じて外部スクリプトを呼び出せます。

```yaml
hooks:
  reserveNewAddition: '%ROOT%/config/hooks/reserveNewAddition.sh'
  reserveUpdate: '%ROOT%/config/hooks/reserveUpdate.sh'
  reserveDeleted: '%ROOT%/config/hooks/reserveDeleted.sh'
  recordingPreStart: '%ROOT%/config/hooks/recordingPreStart.sh'
  recordingPrepRecFailed: '%ROOT%/config/hooks/recordingPrepRecFailed.sh'
  recordingStart: '%ROOT%/config/hooks/recordingStart.sh'
  recordingFinish: '%ROOT%/config/hooks/recordingFinish.sh'
  recordingFailed: '%ROOT%/config/hooks/recordingFailed.sh'
  encodingFinish: '%ROOT%/config/hooks/encodingFinish.sh'
  isSuppressReservesUpdateAllLog: false
```

---

## 8. URLスキーム設定 (`urlscheme`)

クライアントアプリで外部動画再生プレイヤー（VLC や Infuse 等）を起動するためのスキーム設定です。

```yaml
urlscheme:
  m2ts:
    ios: vlc-x-callback://x-callback-url/stream?url=PROTOCOL%3A%2F%2FADDRESS
    android: intent://ADDRESS#Intent;action=android.intent.action.VIEW;type=video/*;scheme=PROTOCOL;end
  video:
    ios: infuse://x-callback-url/play?url=PROTOCOL://ADDRESS
    android: intent://ADDRESS#Intent;action=android.intent.action.VIEW;type=video/*;scheme=PROTOCOL;end
  download:
    ios: vlc-x-callback://x-callback-url/download?url=PROTOCOL%3A%2F%2FADDRESS&filename=FILENAME
```

---

## 9. 配信・ストリーミング設定 (`streaming`)

EPGDeck には高品質なデフォルト配信コマンド群が内蔵されているため、通常は設定不要です。独自に FFmpeg オプションをカスタマイズしたい場合のみ指定します。

---

## 10. Kodi 連携設定 (`kodi`)

Kodi の Web インターフェースと連携し、EPGDeck から直接再生指示を送ることができます。

```yaml
kodi:
  - name: Living Kodi
    host: http://192.168.1.100:8080
    user: kodi
    password: password
```

詳細な設定手順は [Kodi 連携マニュアル](./client-integration/kodi.md) を参照してください。

