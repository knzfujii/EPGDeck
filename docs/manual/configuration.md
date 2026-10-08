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
- [11. リードオンリーモード設定 (`readOnly`)](#11-リードオンリーモード設定-readonly)

---

## 1. サーバー設定 (`server`)

### `server.port`
EPGDeck が Web アクセスを待ち受ける HTTP ポート番号です。

| 種類 | デフォルト値 | 必須 |
| --- | --- | --- |
| number | `8888`（テンプレート） / `8889`（内部） | no (※https 設定が無い場合は必須) |

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
使用するデータベース種別を指定します（`sqlite` | `mysql`）。

```yaml
database:
  type: sqlite
```

### `database.path`
SQLite を使用する場合のデータベースファイル保存先パスです（省略時: `%ROOT%/data/database.db`）。

```yaml
database:
  type: sqlite
  path: '%ROOT%/data/database.db'
```

### `database.mysql`
MySQL を使用する場合の接続設定です。文字コードには自動的に `utf8mb4` が適用されます。

```yaml
database:
  type: mysql
  mysql:
    host: 127.0.0.1
    port: 3306
    user: epgdeck
    password: password
    database: epgdeck
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
      limitThreshold: 102400       # 空き容量限界閾値(MB単位。102400 = 100GB)
      action: remove               # 閾値を下回ったときの動作: 'remove' (古い録画を自動削除) または 'none' (省略時: none)
      # limitCmd: '%ROOT%/config/limit.sh' # 閾値を下回ったときに実行する外部コマンド (省略可)
  tempDir: '%ROOT%/recorded_tmp'   # 一時録画ディレクトリ（指定時は録画完了後に正規ディレクトリへ移動）
  # ※ 録画一時ディレクトリを RAM ディスク (/dev/shm) や SSD に配置するベストプラクティスについては
  #    [RAM ディスク活用ガイド](./ramdisk.md#6-録画一時ディレクトリ-recordingtempdir-への適用について) を参照してください。
  historyRetentionDays: 90         # 二重録画防止のための録画履歴保持日数（0で無期限保持・自動削除無効）
  storageCheckIntervalSeconds: 60  # ディスク空き容量チェック間隔(秒)
  priority:
    recording: 2                   # 通常録画時のMirakurun優先度
    conflict: 1                    # 重複・競合録画時のMirakurun優先度
    streaming: 0                   # ライブ配信時のMirakurun優先度
  timeSpecifiedStartMargin: 1      # 時刻指定予約の開始前マージン(秒)
  timeSpecifiedEndMargin: 2        # 時刻指定予約の終了後マージン(秒)
  # EIT更新のない短時間番組（PR枠・ミニ番組等）のサービスストリーム自動切替閾値(秒、0で無効化、デフォルト: 300)
  shortProgramDurationThresholdSeconds: 300
  thumbnail:
    path: '%ROOT%/thumbnail'
    size: 480x270
    positionSeconds: 5
    format: webp                   # サムネイル画像形式 ('jpeg' または 'webp'、デフォルト: 'jpeg')
  dropLog:
    enabled: true
    path: '%ROOT%/drop'
    deleteOnNoDrop: true           # エラー・ドロップが0件の録画はログ実ファイルを自動削除 (省略時: true)
  uploadTempDir: '%ROOT%/data/upload'
  copyKeywordToDirectory: false    # ルール新規作成時に検索キーワードを保存先サブディレクトリ名に自動設定 (省略時: false)
```

### `recording.timeSpecifiedStartMargin` / `recording.timeSpecifiedEndMargin`（時刻指定予約マージン）
- **`timeSpecifiedStartMargin`**: 時刻指定予約および短時間番組の開始前マージン（秒）。デフォルト: `1`。
- **`timeSpecifiedEndMargin`**: 時刻指定予約および短時間番組の終了後マージン（秒）。デフォルト: `2`。
- **放送遅延に関する重要な注意点**:
  日本の地上波・BS/CSデジタル放送波は、送出側のエンコード・多重化、電波伝送、チューナーによる復調、TS受信バッファ等のパイプラインを経由するため、**PCのシステム時計（NTP標準時）に対して約2.5〜3秒遅れて** 受信されます。
  通常の番組指定予約は Mirakurun が放送波内の番組情報テーブル（EIT[p/f]）のイベント境界と連動してストリームを制御するため遅延の影響を受けませんが、時刻指定予約（および短時間番組自動切替）はシステム時計基準のタイマーでストリームを切り出します。
  そのため、システム時計の時刻に対して実際の放送内容は約2.5〜3秒過去のものとなります：
  - 例: `timeSpecifiedStartMargin: 3`（3秒前）に設定すると、放送内容としては `3秒 + 約2.5〜3秒 = 約5.5〜6秒前` から録画されます。
  - 例: `timeSpecifiedEndMargin: 2`（2秒後）に設定すると、放送内容としては `2秒 - 約2.5〜3秒 = -0.5〜1秒`（終了予定時刻の直前）で切断され、末尾が欠落（尻切れ）します。
  - **推奨設定**: 頭切れと尻切れを確実に防ぐには、**開始マージンを小さめ（0〜1秒程度）、終了マージンを長め（4〜5秒以上）** に設定することをお勧めします。

### `recording.shortProgramDurationThresholdSeconds`（短時間番組のサービスストリーム自動切替）
- **`shortProgramDurationThresholdSeconds`**: 5分（300秒）以下のミニ番組やPR枠など、放送波の番組情報（EIT[p/f]）が更新されず録画タイムアウト・頭欠けが発生しやすい短時間番組について、自動的にサービスストリーム（時刻指定相当の録画）へ切り替えて確実に録画する閾値（秒）です。`0` を指定すると自動切替を無効化します。

### `recording.directories`（保存先ディレクトリ・容量管理）
- **`limitThreshold`**: 空き容量限界閾値を **MB 単位** で指定します（例: `102400` で 100GB）。空き容量がこの値を下回ると `action` や `limitCmd` がトリガーされます。
- **`action`**: 閾値を下回った際の動作です。`'remove'` を指定すると、空き容量が閾値を回復するまで最も古い保護されていない録画ファイルを順次自動削除します。`'none'` または未指定時は削除を行いません。
- **`limitCmd`**: 閾値を下回った際に実行する外部コマンドを指定します。通知スクリプトの実行などに利用できます。

### `recording.copyKeywordToDirectory`（サブディレクトリ自動設定）
- **`copyKeywordToDirectory`**: `true` に設定すると、番組検索画面から「この条件でルール作成」を選択した際、検索キーワードをルールの保存先サブディレクトリ（`directory`）に自動入力します。デフォルトは `false`（自動入力なし）です。

### `recording.thumbnail`（サムネイル設定）
- **階層化保存（シャーディング）**: 大量録画（10万件規模）環境でのファイルシステム負荷軽減のため、新規サムネイルは `recordedId % 100` による2桁サブディレクトリ（`00/`〜`99/`）に自動分散保存されます。既存のフラットなサムネイルとも完全互換で共存可能です。
- **マイグレーション**: 既存のフラットなサムネイルを一括でサブディレクトリ階層へ再配置・DB更新する場合は、CLI ツール `npm run migrate-thumbnails [-- --dry-run]` を実行します。詳細は [バックアップマニュアル](./backup.md#epgstation-から移行時のサムネイル階層化マイグレーション) を参照してください。

### `recording.dropLog`（ドロップログ設定）
- **`deleteOnNoDrop`（0件ログ自動削除）**: `true`（デフォルト）の場合、エラー・ドロップ・スクランブルが0件の正常録画時に詳細ログ実ファイルを自動削除します。ログ実ファイルが削除されても、**DB上のドロップ集計値（0件）は永続保持** され、録画一覧でも正常表示されます。ドロップが発生した録画のログ実ファイルは通常通り保持されます。

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
  subtitle: false                  # 全プリセット共通の字幕保存デフォルト (省略時: false)
  skipSubtitleForSuperimpose: true # "字幕スーパー" (焼き込み字幕) を含む番組は ARIB 字幕埋め込みを自動スキップ (省略時: false)
  presets:
    # 1. 標準スクリプト指定 (config/ 配下のファイル名を指定)
    - name: H.264-1080p
      script: enc_1080p.js
      suffix: .mp4
      rate: 4.0
      subtitle: true               # プリセット個別指定 (MP4 内に mov_text 字幕を保存)
    - name: H.264-720p
      script: enc_720p.js
      suffix: .mp4
      rate: 2.5
    - name: HEVC-1080p-VAAPI
      script: enc_1080p_hevc_vaapi.js
      suffix: .mp4
      rate: 2.0
      subtitle: false

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

### グローバル設定項目
- **`subtitle`**: 全プリセット共通の字幕保存デフォルトです（省略時: `false`）。
- **`skipSubtitleForSuperimpose`**: 番組情報に「字幕スーパー」が含まれる場合、映像自体に字幕が焼き込まれているため、ARIB 字幕埋め込み処理（`mov_text`）を自動的にスキップしてエンコードの失敗や字幕の重複描画を防ぎます（省略時: `false`）。

> [!WARNING]
> **字幕なし番組（`[字]` マークなし）における注意事項（`INT_MAX` クラッシュの回避）**
> - 日本のデジタル放送規格（ARIB）では、**字幕放送を行っていない番組（紀行、音楽、スポーツ等）であっても、ストリーム内に「画面クリア」の空パケット（ダミー字幕信号）が常時送出**されています。
> - このような字幕なし番組に対して `subtitle: true`（MP4 への字幕埋め込み）を有効にすると、番組終了直前の空パケットに対して FFmpeg が無期限（約1194時間）の表示期間を割り振ってしまい、**MP4 の 32bit 最大値（`INT_MAX`）を超過してエンコード末尾で異常終了（`Application provided duration is invalid` / exit code 234）する現象** が発生します（※FFmpeg の仕様上の制約）。
> - そのため、**グローバル設定および通常プリセットは `subtitle: false` を基本** とし、アニメやドラマなど確実に字幕が必要な番組・ルールに対して個別プリセットを適用することを強く推奨します。

### `encode.presets` パラメータ一覧

| パラメータ名 | 型 | 必須 | 説明 |
| :--- | :--- | :--- | :--- |
| **`name`** | `string` | **必須** | Web UI 上に表示されるプリセット表示名（例: `H.264-1080p`） |
| **`script`** | `string` | 任意 | `config/` ディレクトリ配下のエンコードスクリプト名（例: `enc_1080p.js`） |
| **`cmd`** | `string` | 任意 | 独自コマンド・外部シェルスクリプトを実行する場合のコマンド文字列 |
| **`suffix`** | `string` | 任意 | 出力ファイルの拡張子（例: `.mp4`, `.mkv`）。省略時は元ファイルの拡張子 |
| **`rate`** | `number` | 任意 | **タイムアウト倍率係数**（デフォルト: `4.0`）。録画実時間 × `rate` を超過した場合にハングアップとみなして強制終了します（例: 30分番組 × `rate: 4.0` = 120分でタイムアウト） |
| **`subtitle`** | `boolean` | 任意 | このプリセットで MP4 内に ARIB 字幕（`mov_text`）を埋め込むかどうか（省略時: `encode.subtitle` の値に従う） |

### ジャンル別・ハードウェア別エンコードの最適化ガイド

`config/enc_*.js` では、番組ジャンル（アニメ、映画、自然映像等）や使用GPUに応じた最適化オプションを指定できます：

| ターゲット | 推奨設定・オプション | 効果・特徴 |
| :--- | :--- | :--- |
| **アニメ** | `codec: 'libx264'`, `tune: 'animation'`, `crf: 23` | ベタ塗り部のビットを節約しつつ輪郭線を保護。通常より容量が20〜30%削減 |
| **映画・シネマ** | `codec: 'libx264'`, `tune: 'film'`, `crf: 21` | 暗部階調とフィルムグレインのディテールを維持 |
| **自然・海・波** | `maxrate: '6000k'`, `bufsize: '12000k'`<br>または `codec: 'hevc_vaapi'` (VBR 4M/6M) | 水面や吹雪、芝生などの高周波ノイズによる容量爆発（TS原画と同等以上になる現象）を確実に抑制 |
| **AMD GPU (VAAPI 自動)** | `enc_1080p_hevc_vaapi.js`<br>(`codec: 'hevc_vaapi'`, `quality: 'high'`) | 🟢 **【推奨】** 事前プローブにより、アニメ（約2.2M）から前面展望（約4.2M）まで最適なビットレートを全自動算出 |
| **AMD GPU (VAAPI VBR)** | `codec: 'hevc_vaapi'`, `videoBitrate: '4000k'` | 容量上限を確実に固定・枠運用したい場合（1時間あたり約 1.8GB） |
| **AMD GPU (VAAPI CQP)** | `codec: 'hevc_vaapi'`, `rcMode: 'CQP'`, `qp: 33` | 常時品質基準（CQP）。日常アニメは 500〜800MB に勝手に縮み、高難関映像は高ビットレートを配分して破綻を防止 |
| **NVIDIA GPU (NVENC)** | `enc_nvenc.js`<br>(`codec: 'h264_nvenc'` または `'hevc_nvenc'`) | GeForce/Quadroによる高速処理（※設定例・実機動作未確認） |
| **Intel GPU (QSV)** | `enc_qsv.js`<br>(`codec: 'h264_qsv'` または `'hevc_qsv'`) | Coreプロセッサ内蔵QuickSyncによる低消費電力エンコード（※設定例・実機動作未確認） |

### コンテンツ適応型ビットレート自動推定 (`quality`)

VAAPI エンコード時、番組の内容（アニメ、トーク番組、音楽ライブ、鉄道前面展望など）に応じて適切な目標ビットレートを全自動決定する仕組みです。ディスク I/O ゼロのメモリ内高速並列プローブ（所要時間わずか **2〜4秒**）により本編の複雑度を測定し、最適なビットレート・最大レート・バッファサイズを割り当てます：

- **3つの高精度解析エンジン**:
  1. **広域12〜16点スキャン**: 番組長に応じて 12〜16箇所を網羅サンプリングし、後半の激しいシーンなどの見落としを完全排除。
  2. **分散・標準偏差マージン（CV解析）**: シーンのばらつき（変動係数 $CV$）を計算し、均一なアニメ等は中央値寄り（P60）で容量を徹底節約、落差の激しい特番・アクション映画等はピーク寄り（P85）へ安全マージンを自動シフト。
  3. **デュアルQP傾き測定（Q-Slope）**: ピークシーンを QP 30 と QP 24 で同時測定し、「QPを上げると激縮みする素直なアニメ（Q-Slope $\ge 1.8$）」と「QPを上げてもビットレートが粘る高周波映像（Q-Slope $\le 1.45$）」を数学的に判別して目標値と上限を最適補正。
- **目標クオリティプリセット**:
  - **`quality: 'highest'`**: 妥協なき最高峰画質。前面展望などの極限高周波映像では 6.4〜6.8Mbps、通常アニメでも約 3.0Mbps を配分（CRF 20 相当）。
  - **`quality: 'high'`（推奨・標準）**: 高画質と容量のベストバランス。前面展望で約 4.0〜4.2Mbps、通常特番で約 2.8Mbps、通常アニメで約 2.1〜2.2Mbps を配分（CRF 23 相当）。
  - **`quality: 'standard'`**: 標準バランス。前面展望で約 3.2Mbps、通常アニメで約 1.8Mbps を配分（CRF 25 相当）。
  - **`quality: 'economy'`**: 容量節約最優先。前面展望で約 2.4Mbps、通常アニメで約 1.4Mbps を配分（CRF 27 相当）。
  - **数値指定**: `quality: 22` のように CRF 相当の数値を直接指定して連続的にビットレート水準を調整することも可能です。
- **解像度（画素数）に応じた自動スケーリング**:
  - 出力解像度（1080p / 720p / 480p 等）に応じて、総画素数に基づく圧縮効率補正式 `(outPixels / 1555200)^0.75` が自動適用されます。
  - 例（`quality: 'high'` の場合）:
    - **1920x1080**: アニメ 約 2,700k / 前面展望 約 5,000k（1.24倍）
    - **1440x1080**: アニメ 約 2,100〜2,200k / 前面展望 約 4,000k（1.00倍・基準）
    - **1280x720**: アニメ 約 1,400〜1,500k / 前面展望 約 2,700k（0.67倍）
    - **720x480**: アニメ 約 700k / 前面展望 約 1,300k（0.32倍）
  - 元動画が 720p や 480p の場合でも無駄なアップスケールを行わず、元解像度を超えない安全なプローブと補正が行われます。

### 地デジ 1440x1080 解像度と拡大オプション (`fix1440to1920`)

日本の地上波デジタル放送（地デジ）のハイビジョン映像は、放送帯域の制約上、**横 1440 × 縦 1080 ピクセル**（画素アスペクト比 SAR 4:3 / 表示比率 DAR 16:9）で送出されています。

`config/enc_helper.js` では、以下のスケーリング制御を提供しています：

- **デフォルト動作 (`fix1440to1920: false`)**:
  - 全エンコーダ共通のデフォルト値です。
  - 地デジの入力解像度（1440x1080）をそのまま保持し、再生時に 16:9 で表示されるメタデータを付与して出力します。
  - **メリット**: スケーリング補間による画質劣化がなく、ピクセル数が 1920x1080 より **約33% 少ない**（約155万画素 vs 約207万画素）ため、ファイルサイズを最も小さく抑えられます。
- **拡大補正 (`fix1440to1920: true`)**:
  - テンプレート（`enc_1080p_hevc_vaapi.js.template`, `enc_vaapi.js.template`）で指定されています。
  - 横幅を 1920 ピクセルに拡大し、正方形ピクセル（SAR 1:1 / 1920x1080 Full HD）へ変換します。
  - **メリット**: アスペクト比非対応の旧型スマートテレビや一部の簡易再生アプリでも歪みなく再生でき、一般的な 1080p 動画として扱いやすくなります。
  - **注意点**: 画素数が33%増加するため、同一ビットレート（またはCRF）では容量が約15〜25%増加します。容量最少化・原画忠実を重視する場合は、スクリプト内で `fix1440to1920: false` を指定してください。

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
  isSuppressReservesUpdateAllLog: false # true で EPG 更新に伴う予約一括更新時のフック実行ログ出力を抑制
```

---

## 8. URLスキーム設定 (`urlscheme`)

クライアントアプリで外部動画再生プレイヤー（VLC や Infuse 等）を起動するためのスキーム設定です。

```yaml
urlscheme:
  m2ts:
    ios: vlc-x-callback://x-callback-url/stream?url=PROTOCOL%3A%2F%2FADDRESS
    android: intent://ADDRESS#Intent;action=android.intent.action.VIEW;type=video/*;scheme=PROTOCOL;end
    # mac: iina://weblink?url=PROTOCOL%3A%2F%2FADDRESS
    # win: potplayer://PROTOCOL%3A%2F%2FADDRESS
  video:
    ios: vlc-x-callback://x-callback-url/stream?url=PROTOCOL%3A%2F%2FADDRESS
    android: intent://ADDRESS#Intent;action=android.intent.action.VIEW;type=video/*;scheme=PROTOCOL;end
    # mac: iina://weblink?url=PROTOCOL%3A%2F%2FADDRESS
    # win: potplayer://PROTOCOL%3A%2F%2FADDRESS
  download:
    ios: vlc-x-callback://x-callback-url/download?url=PROTOCOL%3A%2F%2FADDRESS&filename=FILENAME
    # android: intent://ADDRESS#Intent;action=android.intent.action.VIEW;type=video/*;scheme=PROTOCOL;end
    # mac: ...
    # win: ...
```

> **Note**:
> - iOS で Infuse を使用したい場合は、`video.ios` に `infuse://x-callback-url/play?url=PROTOCOL://ADDRESS` を設定してください。
> - macOS や Windows でデスクトッププレイヤー（IINA や PotPlayer 等）と連携したい場合は、`mac` または `win` に対応するカスタム URL スキームを設定してください。

---

## 9. 配信・ストリーミング設定 (`streaming`)

EPGDeck には高品質なデフォルト配信コマンド群が内蔵されているため、通常はコマンドの詳細設定は不要です。独自に FFmpeg オプションをカスタマイズしたい場合や、一時バッファの保存先を変更したい場合に指定します。

### 一時バッファディレクトリ (`streaming.tempDir`)

HLS 配信時のセグメントファイル（`.ts`）およびプレイリスト（`.m3u8`）を出力する一時ディレクトリです（省略時は `%ROOT%/data/streamfiles`）。

> [!TIP]
> **SSD 寿命保護と I/O 負荷軽減のためのベストプラクティス**:
> HLS 配信は数秒単位で一時ファイルを作成・削除するため、SSD に大きな書き込み負荷（TBW 消耗）を与えます。RAM ディスク（`/dev/shm`）上に配置することで、ディスク書き込み量をゼロに抑え、快適な応答性を得ることができます。
> 
> ```yaml
> streaming:
>   tempDir: '/dev/shm/epgdeck/streamfiles'
> ```
> 
> 詳細な設定手順・注意点・Docker 環境での対処法については **[RAM ディスク活用ガイド](./ramdisk.md)** を参照してください。

---

## 10. Kodi 連携設定 (`kodi`)

Kodi の Web インターフェースと連携し、EPGDeck の録画詳細画面から直接テレビへ再生指示を送ることができます。設定されている場合、録画詳細の各ファイルに「Kodi」再生ボタンが表示されます。

```yaml
kodi:
  - name: Living Kodi
    host: http://192.168.1.100:8080
    user: kodi
    password: password
```

詳細な設定手順は [Kodi 連携マニュアル](./client-integration/kodi.md) を参照してください。

---

## 11. リードオンリーモード設定 (`readOnly`)

EPGDeck には、家族やゲストなど管理者以外のユーザーに Web UI を開放する際に、録画ファイルの誤削除や予約ルールの改変・録画予約の取り消しなどを防止できる「リードオンリーモード（閲覧専用モード）」が搭載されています。

パスワード認証を行うことで、一時的に管理者モードへアンロック（解除）できます。

### 設定項目一覧

| 項目名 | 型 | デフォルト値 | 説明 |
| :--- | :--- | :--- | :--- |
| `readOnly.enabled` | boolean | `false` | リードオンリーモードを有効化するかどうか。`true` の場合、未認証時は閲覧専用となります。 |
| `readOnly.password` | string | `""` | 管理者モードへの解除に必要なパスワード。環境変数 `EPGDECK_ADMIN_PASSWORD` でも指定可能です（環境変数優先）。 |
| `readOnly.allowedOperations` | string[] | `[]` | リードオンリー時に例外的に許可する操作のホワイトリスト。 |

#### `allowedOperations` で指定可能な値

**【視聴・ダウンロード系】**
- `liveStream`: 放送中番組（オンエアー）のリアルタイムストリーミング視聴および放送中画面の表示を許可します。
- `recordedStream`: 録画済み番組（TS ファイル等）のリアルタイムトランスコード配信（HLS, WebM）を許可します。（※エンコード済み MP4 ファイル等の直接再生は常時許可されます）
- `download`: 録画ファイルのダウンロード（および M3U プレイリストの保存）を許可します。

**【画面閲覧系（未指定時は非表示・非許可）】**
- `dashboard`: ダッシュボード画面（`/`）の閲覧を許可します。（非許可時は録画一覧へ自動リダイレクト）
- `search`: 番組検索画面（`/search`）の利用を許可します。
- `rules`: ルール一覧（`/rule`）の閲覧を許可します。（※ルール編集画面は管理者専用です）
- `encode`: エンコード一覧画面（`/encode`）の閲覧を許可します。

※ **番組表（`/guide`）**、**録画一覧（`/recorded`）**、および **予約一覧（`/reserves`）** はリードオンリー時でも常時表示・閲覧可能です（追加・変更・削除操作のみ非表示・保護）。
※ **システムログ（`/logs`）** は常に管理者専用です。

> [!NOTE]
> - **MP4 直接再生**: エンコード済み MP4 ファイル等の直接再生（`/api/videos/:id`）は、サーバー負荷が極めて低いためリードオンリーモードでも**常時許可**されます。`recordedStream` 設定は CPU/GPU 負荷を伴うリアルタイムトランスコード配信の可否を制御します。
> - **管理者限定操作**: 録画保護（protect/unprotect）の変更や、予約・ルールの追加・編集・削除、録画ファイルの削除、エンコードジョブの登録・キャンセルなどの破壊的・更新操作は常に管理者限定です（`allowedOperations` には指定できません）。

### 設定例

```yaml
readOnly:
  enabled: true
  password: 'my-secure-admin-password' # または環境変数 EPGDECK_ADMIN_PASSWORD
  allowedOperations:
    - liveStream
    - recordedStream
    - download
    - dashboard
    - search
```

### 環境変数によるパスワード指定

Docker 環境や設定ファイルをバージョン管理している場合、パスワードを `config.yml` に平文で記述する代わりに環境変数で注入できます。

```bash
export EPGDECK_ADMIN_PASSWORD="my-secure-admin-password"
```

### 動作仕様

1. **未認証時（閲覧専用）**:
   - Web UI ヘッダーに「🔒 閲覧専用」バッジが表示されます。
   - 予約の追加・キャンセル・スキップボタン、ルールの作成・変更・削除ボタン、録画の保護・削除ボタン、エンコード手動追加・キャンセルボタンが非表示になります。
   - バックエンド（REST API）側でも Hono ミドルウェアにより、許可されていない書き込み系リクエストや API は `403 Forbidden` (`error: 'readOnlyMode'`) で拒否されます。
2. **アンロック（管理者モード）**:
   - ヘッダーの「🔒 閲覧専用」バッジをクリックするとパスワード入力モーダルが開きます。
   - 正しいパスワードを入力すると、HMAC-SHA256 で署名された有効期限付き認証トークンがブラウザの `localStorage` に保存され、全機能がアンロックされます。
   - ヘッダーのバッジが「🔓 管理者モード」に変わり、いつでも「再ロック（閲覧専用に戻す）」が可能です。

