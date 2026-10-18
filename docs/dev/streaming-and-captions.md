# ストリーミング配信と ARIB 字幕処理のアーキテクチャ・開発ノウハウ

本ドキュメントでは、EPGDeck におけるストリーミング配信（M2TS-LL / HLS / WebM / MP4）のパイプライン構成、および日本のデジタル放送規格（ARIB STD-B24）に基づく字幕・文字スーパーの処理メカニズムと開発時の注意点・ノウハウを記録します。

---

## 1. ストリーミング配信方式の全体像

EPGDeck は以下のストリーミング配信方式をサポートしています。

| 配信方式 | プロトコル / 形式 | 再生エンジン | 字幕対応 | 主な用途 |
| :--- | :--- | :--- | :--- | :--- |
| **M2TS-LL** | HTTP MPEG-TS | `mpegts.js` | ○（生 PES） | 放送中の低遅延ライブ視聴（遅延約1〜2秒） |
| **HLS** | HTTP Live Streaming (HLS) | `hls.js` / ネイティブ | ○（ID3 Timed Metadata） | 放送中ライブ（安定重視）および録画番組の視聴 |
| **WebM** | HTTP Chunked VP9/Vorbis | HTML5 Video (ネイティブ) | ×（仕様上なし） | ブラウザ標準トランスコード再生 |
| **MP4** | HTTP Fragmented MP4 | HTML5 Video (ネイティブ) | ×（仕様上なし） | モバイル・ブラウザ汎用直接再生 |

---

## 2. ARIB STD-B24 字幕・文字スーパーの伝送とレンダリング

### 2.1 配信方式による字幕データ伝送の違い

日本のデジタル放送波（MPEG-2 TS）に含まれる字幕データ（ARIB STD-B24）は、配信方式によって異なる経路でクライアントへ届きます。

```
[放送波 MPEG-2 TS]
   ├── 映像 (video)
   ├── 音声 (audio)
   ├── 字幕 PES (stream_id: 0xbd, PID: 字幕PID)
   └── 文字スーパー PES (stream_id: 0xbf, PID: 文字スーパーPID)
```

#### (1) M2TS-LL の場合
- サーバー側の FFmpeg は `-map 0 -c:s copy -c:d copy -ignore_unknown -f mpegts` で MPEG-TS コンテナに字幕ストリームをそのまま多重化して出力します。
- クライアント側（`mpegts.js`）は、TS パケットから PES プライベートデータを抽出し、以下のイベントを発火します：
  - 通常字幕（Caption: `0x80`）: `mpegts.Events.PES_PRIVATE_DATA_ARRIVED`（`stream_id === 0xbd`）
  - 文字スーパー（Superimpose: `0x81`）: `mpegts.Events.PES_PRIVATE_DATA_ARRIVED`（`stream_id === 0xbf`）
- クライアントの `SubtitleManager.ts` がこれを受け取り、`captionFeeder.feedB24()` / `superimposeFeeder.feedB24()` に渡して描画します。

#### (2) HLS の場合
- HLS では、TS 内の字幕ストリームをそのまま多重化（`-c:s copy`）すると、FFmpeg の HLS muxer が WebVTT（.vtt）を出力しようとしてクラッシュします（後述）。
- サーバー側（`LiveStreamBaseModel` / `RecordedStreamBaseModel`）では、FFmpeg に流し込む前のパイプラインに **`packages/arib-probe` の `TsSubtitleId3Muxer`**（内製ゼロ依存モジュール）を挿入します。
- `TsSubtitleId3Muxer` は TS 内の字幕パケット（PES）を解析し、**ID3 Timed Metadata (`timed_id3` / stream_type: `0x15`)** パケットとして TS ストリーム内に再多重化します。同時に PMT に `metadata_pointer_descriptor` と 0x15 ストリーム情報を自動挿入します。
- FFmpeg は字幕ストリームを無効化（`-sn`）しつつ、データストリームをコピー（`-map 0 -c:d copy`）して TS セグメントを出力します。
- クライアント側（`hls.js`）は、セグメントから ID3 メタデータを抽出し、`Hls.Events.FRAG_PARSING_METADATA` イベントを発火します。
- クライアントの `SubtitleManager.ts` が ID3 ペイロードを受け取り、`feeder.feedID3()` に渡して描画します。

---

## 3. ARIB STD-B24 字幕データグループ仕様と ID3 Timed Metadata 多重化

### 3.1 ARIB STD-B24 データ構造と aribb24.js v2 デコード要件
1. **CaptionManagement と CaptionStatement**:
   - ARIB STD-B24 の規格上、データグループ ID（`data_group_id & 0x0F`）において `0` は **CaptionManagement（字幕管理データ：言語・文字コード定義）**、`1` は **CaptionStatement（字幕本文データ）** です。
   - `aribb24.js` v2 は放送規格に厳密に準拠しており、Feeder（`decoding-feeder.ts`）内部で CaptionManagement が先行して存在しない場合、後続の CaptionStatement（本文）をデコードせず破棄（スキップ）します。
   - したがって、HLS の ID3 Timed Metadata には本文だけでなく管理データ（Group 0）も確実にカプセル化する必要があります。

### 3.2 二重防衛アーキテクチャ（サーバー多重化 ＋ クライアント動的補完）
EPGDeck では、放送波の開始途中からの受信やシーク時でも字幕が欠落しないよう、以下の二重防衛アーキテクチャを確立しています：

1. **サーバー側での完全な ID3 変換 (`TsSubtitleId3Muxer`)**:
   - 内製パッケージ `packages/arib-probe` の `TsSubtitleId3Muxer` では、CaptionManagement（Group 0）と CaptionStatement（Group 1）の双方を漏れなく ID3 PRIV パケットにカプセル化して再多重化します。
2. **クライアント側での動的補完とシーク保護 (`SubtitleManager.ts`)**:
   - 放送波の途中で CaptionManagement が間引かれた場合や、プレイヤーのシークによってデコーダー内部の管理状態がリセット（`disappearance()`）された場合に備え、`SubtitleManager.ts` で標準的な CaptionManagement パケットを動的先行注入するフォールバックを備えています。
   - 日本の地上波・BS・CS デジタル放送における字幕規格（第1言語: `jpn`, 文字コード体系: `JIS8`）に基づき、標準的な CaptionManagement パケット（Group 0: Aプロファイル、Group 1: Bプロファイル）を合成し、`feeder.feedB24()` で注入します。

### 3.3 動的先行注入とシーク保護 (`SubtitleManager.ts`)

シーク時やセグメント境界での字幕途切れを防止するため、以下の動的注入仕様を実装しています：
- **シーク時の状態保持**: `aribb24.js` の `onSeeking` ハンドラが `disappearance()` を呼び出して管理状態をリセットするため、シーク直後の再注入が必要となる。
- **PTS 整合性の維持**: セグメントの PTS に同期させて管理データを注入する。

具体的には以下の機構で動作します：
- **各セグメント先頭での動的先行注入 (`feedHlsMetadata`)**:
  HLS の ID3 メタデータ（`FRAG_PARSING_METADATA`）を受信した際、各セグメント内の最初のサンプルの PTS（`dtsSec`）直前（`dtsSec - 0.001`）をタイムスタンプとして `injectDefaultCaptionManagement(timeSec)` を先行注入する。
- **シーク時の即時再注入復元 (`hookFeederOnSeeking` / `notifySeek`)**:
  ユーザーがシークを行った際、`aribb24.js` の `onSeeking` による破棄直後に現在の `videoElement.currentTime` を用いて `injectDefaultCaptionManagement` を再注入し、シーク直後の字幕本文も即座にレンダリング可能にする。

```typescript
// SubtitleManager.ts
private injectDefaultCaptionManagement(timeSec = 0): void {
    for (const grp of [0, 1]) {
        const dataGroupId = grp << 5;
        const dgByte0 = (dataGroupId << 2) & 0xfc;
        const dgPayload = new Uint8Array([
            dgByte0,
            0x00, 0x00, // link numbers
            0x00, 0x0b, // size: 11 bytes
            0x00,       // TMD: realtime
            0x01,       // 1 language
            0x00,       // tag=0, DMF=0
            0x6a, 0x70, 0x6e, // "jpn"
            0x00,       // Format=0, TCS=0 (JIS8), rollup=0
            0x00, 0x00, 0x00, // data units: 0
            0x00, 0x00, // CRC16
        ]);

        const ptsMs = Math.max(0, Math.floor(timeSec * 1000));
        // Caption (0x80)
        const captionPES = new Uint8Array([0x80, 0xff, 0xf0, ...dgPayload]);
        this.captionFeeder?.feedB24(captionPES, ptsMs, ptsMs);

        // Superimpose (0x81)
        const superPES = new Uint8Array([0x81, 0xff, 0xf0, ...dgPayload]);
        this.superimposeFeeder?.feedB24(superPES, ptsMs, ptsMs);
    }
}
```
これにより、初回再生開始時はもちろん、任意位置へのシーク後やレジューム再生後も途切れることなく ARIB 字幕が即時かつ安定して表示されます。

---

## 4. FFmpeg ストリーミングコマンドの最適化ノウハウ

### 4.1 HLS における `-c:s copy` によるクラッシュ（エラーコード `-22`）
- **現象**: HLS 配信開始時、FFmpeg が `[webvtt @ ...] webvtt muxer supports only codec webvtt for type subtitle` というエラーコード `-22 (Invalid argument)` を出力して即座に終了し、マニフェストが生成されない。
- **原因**: `-f hls`（HLS muxer）に `-map 0 -c:s copy` を指定すると、FFmpeg は字幕ストリームを HLS のサブタイトル（WebVTT セグメント）として扱おうとし、ARIB 字幕コーデックの変換に対応できず失敗する。
- **対策**: HLS コマンドでは字幕ストリームを無視し（`-sn`）、ID3 メタデータ等のデータストリームのみを多重化する（`-map 0 -c:d copy`）。

### 4.2 ライブ HLS における `-re` の禁止
- **現象**: ライブ HLS 配信時に、再生が頻繁に止まる、カクつく、バッファが枯渇する。
- **原因**: Mirakurun からの放送波チューナーストリーム（`pipe:0`）は、**すでにリアルタイムレート（放送波の速度）で届いている**。これに `-re`（入力読み込みレート制御）を重ねて適用すると、クロックの微細な揺らぎでバッファがアンダーラン/オーバーランし、エンコード遅延やパイプ詰まりが発生する。
- **対策**: **ライブ配信の入力には `-re` を付与してはならない**（録画済みの疑似ライブ等でのみ使用する）。

### 4.3 セグメント時間と GOP 境界の制御
- **セグメント時間**: `hls_time 2`（2秒）はエンコード・mux のオーバーヘッドが大きくリアルタイム維持のマージンが少ないため、**`hls_time 3`（3秒）** を標準とする。
- **Closed GOP**: libx264 の場合、`-flags +cgop` を指定して各 GOP を独立完結させ、セグメント境界での映像の乱れやタイムスタンプのずれを防止する。

### 4.4 HTTP パイプ配信（WebM / ライブ配信等）におけるプロセスクリーンアップの厳格化
- **課題（ffmpeg プロセスの残留と多重上限到達エラー）**:
  - Hono / Node.js サーバー環境において、WebM やライブ配信（M2TS-LL 等）の HTTP レスポンスパイプラインにおいて、ブラウザ側のタブクローズやページ離脱、シークによる切断が発生した際、AbortSignal や Stream end が正常に伝搬せず、ffmpeg プロセスが生存し続ける事象が発生していた。
  - プロセス生存中にサーバー側 keepAlive タイマーが周回して延長され続けた結果、トランスコード多重上限（`maxProcesses: 2`）に達し、後続の再生要求で `CreateStreamProcessError`（HTTP 500）が発生する原因となっていた。
- **対策（ソケット close と Web Streams cancel の多重フック）**:
  - `src/model/service/hono/routes/streams.ts` の `handleLiveStream` において、以下の多重イベントをフックして切断を即座に検知し、`streamApiModel.stop(streamId, true)` を強制実行：
    1. `c.req.raw.signal` の `abort` イベント
    2. Node.js ソケットレイヤーの `c.env.incoming.on('close')` および `c.env.outgoing.on('close')`
    3. Web Streams `ReadableStream` の `cancel()` コールバック
    4. 子プロセスパイプの `data` (enqueue 失敗時), `end`, `error`, `close`
  - これにより、ユーザーが再生停止・シーク・離脱した瞬間に 100% 確実にバックエンドの ffmpeg プロセスが破棄（SIGKILL）され、リソース枯渇が完全に防止されます。

---

## 5. 推奨 FFmpeg コマンドテンプレート一覧

### ライブ HLS 720p (推奨)
```bash
%FFMPEG% -dual_mono_mode main -i pipe:0 -sn -map 0 -c:d copy -threads 0 -ignore_unknown \
  -max_muxing_queue_size 1024 -f hls -hls_time 3 -hls_list_size 17 -hls_allow_cache 1 \
  -hls_segment_filename %streamFileDir%/stream%streamNum%-%09d.ts -hls_flags delete_segments \
  -c:a aac -ar 48000 -b:a 192k -ac 2 \
  -c:v libx264 -flags +cgop -vf yadif,scale=-2:720 -b:v 3000k -preset veryfast \
  -flags +loop-global_header %OUTPUT%
```

### 録画 TS HLS 720p (推奨)
```bash
%FFMPEG% -dual_mono_mode main -i pipe:0 -sn -map 0 -c:d copy -threads 0 -ignore_unknown \
  -max_muxing_queue_size 1024 -f hls -hls_time 3 -hls_list_size 0 -hls_allow_cache 1 \
  -hls_segment_filename %streamFileDir%/stream%streamNum%-%09d.ts -hls_flags delete_segments \
  -c:a aac -ar 48000 -b:a 192k -ac 2 \
  -c:v libx264 -flags +cgop -vf yadif,scale=-2:720 -b:v 3000k -preset veryfast \
  -flags +loop-global_header %OUTPUT%
```

### 放送中 M2TS-LL 720p (推奨)
```bash
%FFMPEG% -dual_mono_mode main -f mpegts -analyzeduration 500000 -i pipe:0 \
  -map 0 -c:s copy -c:d copy -ignore_unknown \
  -fflags nobuffer -flags low_delay -max_delay 250000 -max_interleave_delta 1 -threads 0 \
  -c:a aac -ar 48000 -b:a 192k -ac 2 \
  -c:v libx264 -flags +cgop -vf yadif,scale=-2:720 -b:v 3000k -preset veryfast \
  -y -f mpegts pipe:1
```

---

## 6. MP4 エンコード時の ARIB 字幕保存アーキテクチャ

### 6.1 MP4 コンテナと字幕フォーマット規格 (`mov_text` / `tx3g`)
- MP4（ISO Base Media File Format）の国際規格でサポートされている標準字幕形式は **`mov_text`（FourCC: `tx3g`）** のみです。生 SRT（`subrip`）を MP4 コンテナに直接多重化することは規格上できず、FFmpeg でもエラーで拒否されます。
- `tx3g` は実質的に「MP4 規格に適合させたバイナリ版 SRT」であり、Apple 製品（iOS / iPadOS / macOS / Safari）、モダンブラウザ（HTML5 `<video>` の `textTracks`）、各種メディアプレイヤー（VLC / Kodi / Infuse）でネイティブに認識・描画されます。
- 外部 SRT ファイルが必要な場合も、`ffmpeg -i file.mp4 -map 0:s:0 file.srt` でいつでも無劣化・一瞬でテキスト抽出が可能です。

### 6.2 エンコード字幕保持（`subtitle: true`）の三段階防衛アーキテクチャ
`@epgdeck/enc-helper`（`packages/enc-helper`）および `EncoderModel` では、ARIB STD-B24 字幕を MP4（`mov_text`）へ多重化する際のエラーを以下の 3 段階制御で防止します。

| 防御層 | 指定オプション / 機構 | 解決する仕様上の制約・動作 |
| :--- | :--- | :--- |
| **未確定 duration 補正** | `-fix_sub_duration` | ARIB 字幕パケットは表示終了時刻（duration）が未指定（`UINT32_MAX`）で送出されるため、後続パケットの PTS から表示期間を自動算出し、MP4 muxer の `Invalid argument (-22)` を防止。 |
| **32bit オーバーフロー防止** | `-time_base:s 1/1000` | デフォルトのマイクロ秒タイムベース（`1/1000000`）では字幕間隔が約 35.7 分（`INT32_MAX` = 2,147秒）以上空くと 32bit 符号付き整数オーバーフローでクラッシュする。ミリ秒タイムベース（`1/1000`）の明示により上限を **約 596 時間（約24日間）** へ拡大し、疎な字幕でも 1ms 精度を維持して完走。 |
| **ストリーム欠落・字幕スーパー保護** | `-map 0:s?` / `skipSubtitleForSuperimpose` | 字幕ストリーム不在時は `-map 0:s?` で自動無視。また `encode.skipSubtitleForSuperimpose: true` 設定時は、番組情報（タイトル・概要・詳細）に「字幕スーパー」を含む番組を検知して自動で `-sn`（字幕除外）に切り替え、焼き込み字幕との二重描画を防止。 |

### 6.3 制御フローとコマンドログ記録（`config.yml` ⇄ `EncoderModel` ⇄ `@epgdeck/enc-helper`）
- **設定伝搬**: `config.yml` の `encode.presets[]` または `encode.subtitle` で `subtitle: true`（省略時 `false`）、および `encode.skipSubtitleForSuperimpose` を参照し、`EncoderModel.ts` が環境変数 `SUBTITLE`（`'true'` / `'false'`）を子プロセスへ渡します。
- **コマンドロギング**: `@epgdeck/enc-helper` が実行時に組み立てた FFmpeg コマンド（シェルクォート整形済み）を `[enc_helper] FFmpeg command: ...` として出力し、`EncoderModel` が INFO ログおよび異常終了時のエラーログ（`failed ffmpeg command: ...`）に記録します。
- **言語メタデータ**: 日本の放送波標準仕様（第1言語: 日本語）に準拠し、`language=jpn` として多重化されます。

### 6.4 FFmpeg の `--enable-libaribb24` 依存性
- **ストリーミング（HLS / M2TS-LL）**:
  - HLS 配信はサーバー側 Node.js（`arib-probe` の `TsSubtitleId3Muxer`）が ID3 化し、M2TS-LL は `-c:s copy` でパススルーしてブラウザ側（`aribb24.js`）がデコードするため、**FFmpeg の `libaribb24` は不要**です。
- **MP4 字幕保持（`subtitle: true`）**:
  - FFmpeg 自身が ARIB STD-B24 パケットをデコードして `mov_text` へ変換するため、**`--enable-libaribb24` を有効化してビルドされた FFmpeg が必須**です（`subtitle: false` の場合は `-sn` となるため不要）。

---

## 7. オンデマンド WebVTT 字幕抽出・配信 API (`GET /api/videos/:videoFileId/vtt`)

MP4 内に埋め込まれた字幕（`mov_text` / `tx3g`）を、Chrome 等のブラウザでシーク遅延（MP4 内部テキストトラック走査による 18〜27秒のフリーズ）を起こさずに `<track>` 要素で高速表示するための API 構成です。

- **ファイルレス・オンデマンド抽出 (`VideoApiModel.getVtt`)**:
  - ディスク上に `.vtt` ファイルを永続化せず、リクエスト時に `ffmpeg -i <mp4> -map 0:s:0 -f webvtt pipe:1` を実行して標準出力から WebVTT テキストを動的抽出します（字幕ストリーム不在時は空の `WEBVTT\n\n` を返却）。
- **インメモリキャッシュ**:
  - 抽出結果を標準 `Map` によるインメモリキャッシュ（最大 100 件、`fs.stat` の `mtimeMs` によるファイル更新検証付き）に保持し、同一動画の再取得やシーク時は FFmpeg を起動せず即時応答します。
- **クライアント連携**:
  - `VideoPlayer.svelte` 内で `<track kind="subtitles" src="/api/videos/{videoFileId}/vtt" srclang="ja" label="日本語" default>` として読み込まれ、字幕 ON/OFF トグル（字幕ボタン / `C` キー）と連動します。

---

## 8. クライアント再生・シーク制御と Svelte 5 実装原則

### 8.1 シーク・実尺（duration）同期原則
- **MP4 等の直接再生**:
  - ネイティブの `videoElement.duration` を最優先とし、ブラウザ内蔵の正確なコンテナメタデータを信頼します。
- **HLS / WebM 配信再生**:
  - 配信開始直後はセグメントバッファが未充足で `videoElement.duration` が `Infinity` や不定になりやすいため、DB に記録された実録画時間（`totalDuration`）を初期値として同期し、プログレスバーやシークバーの破綻を防止します。

### 8.2 Svelte 5 リアクティビティ規約 (`VideoPlayer.svelte` / UI)
- **`$props()` の分割代入によるリアクティビティ喪失の防止**:
  - Svelte 5 では `const { value } = $props()` と分割代入すると、以降のプロパティ更新がリアクティブに追従しなくなります。
  - プレイヤーの再生位置や状態同期を行う場合は、必ず `props.xxx` を直接 `$derived` や `$effect` 内で参照します。
- **ローカル `$state` との連動による即時 UI フィードバック**:
  - 音量スライダー、シークバー、字幕 ON/OFF ボタンなどのハイライトは、サーバーレスポンスを待たずにローカル `$state` と連動させて即時描画を保証します。

### 8.3 モバイル・タッチデバイスでのイベント処理とコントロール制御
- **ポインターイベント（Pointer Events）によるタッチ合成イベントの分離**:
  - タッチ端末では、タップ操作時にブラウザが `mousemove` イベントを合成して先行発火させます。
  - `onpointermove` / `onpointerleave` を使用し、`if (e.pointerType === 'touch') return;` でタッチ移動を明示的に除外することで、PC のマウスホバー時のみ自動表示を有効化します。
- **全画面透過オーバーレイによるタップ判定**:
  - `<video>` 直結のクリックイベント（再生トグル）を排し、前面に透明な `<button>`（`z-10`）をオーバーレイ配置します。
  - 非表示時のタップは「コントロール表示のみ（再生継続）」とし、表示時の空き領域タップは「即時非表示」とする 2 段階トグルを実現します。
- **非表示状態の完全無効化 (`inert` 属性の活用)**:
  - コントロール非表示時、下部コントロールバーに `inert={!showControls || undefined}` および `pointer-events-none` を付与し、ブラウザのヒットテスト・キーボードフォーカス・スクリーンリーダーから除外して不可視パーツの誤操作を防止します。
- **シーク・スライダー操作中のタイマー保護**:
  - シークバーや音量スライダーのドラッグ中（`onpointerdown` から `onpointerup` / `onchange` まで）は、自動非表示タイマーを一時停止（`pauseHideControlsTimer()`）します。

### 8.4 録画 HLS のシーク最適化とエンコードバッファ表示（即時シークとストリーム再起動）
- **エンコード済みバッファ管理 (`bufferedEnd`)**:
  - `VideoPlayer.svelte` は `hls.on(Hls.Events.LEVEL_UPDATED)` および `FRAG_BUFFERED` を監視し、現在サーバー側で生成完了している最大セグメント時刻（`playbackOffset + level.details.totalduration`）をリアルタイムに算出します。
- **シーク分岐判定と即時ローディング遷移 (`seekTo`)**:
  - **生成済みバッファ内の場合**: `<video>` の通常シーク（`videoElement.currentTime = targetTime - playbackOffset`）を実行し、ロード済みセグメントから即時再生。
  - **生成済みバッファ外の場合**:
    - `<video>` の再生を一時停止し、旧 HLS インスタンスを破棄（`cleanupEngines()`）。
    - 再生表示時刻をシーク先時刻へ移動（`currentTime = clampedTime`）し、`isLoading = true` に切り替えてスピナーと経過秒数を表示。
    - `onHlsSeekRestart(targetTime)` コールバックを発火（再生成待機中は `!isLoading` ガードで旧要素のイベントによるタイムスタンプ巻き戻りを防止）。
- **サーバー連携によるストリーム再起動 (`restartHlsAtPosition`)**:
  - `RecordedDetail.svelte` は旧ストリームを停止し、`GET /api/streams/recorded/:videoFileId/hls?ss=${seekSecond}`（エンコード済み動画の HLS 配信時は `/encoded`）を呼び出して指定位置から新ストリームを起動します。
  - 連続シーク時の多重リクエストを防ぐため最新ターゲット保持のループ制御を採用し、`playbackOffset = seekSecond` を加算した絶対再生時刻を一貫管理します。
- **エンコード進行バーの視覚化 (`VideoControls.svelte`)**:
  - シークバー背景に生成済みバッファ範囲（`bufferedEnd / duration`）をグレーバー（`bg-slate-500/60`）として重畳描画します。
- **WebM / MP4 トランスコード配信のシーク処理と安定化**:
  - Cues（シークインデックス）を持たない WebM / MP4 リアルタイムパイプ配信でも、シーク時はサーバー側 API（`?ss=${seekSecond}`）でストリームを再生成し、`playbackOffset` を同期します。
  - **ドラッグ操作とコミットの分離 (`VideoControls.svelte`)**: トランスコード配信（WebM / MP4 / HLS）のシークバースライダー操作中（`oninput`）は表示時刻プレビューのみを追従させ、実際の重いストリーム再生成（FFmpeg 起動）は指・マウスを離した瞬間（`onpointerup` / `onchange`）に 1 回だけ発行し、多重トランスコード要求によるプロセスの詰まりを防止します。
  - **メディア要素保持によるフルスクリーン維持**: シーク再生成時の `cleanupEngines({ preserveMediaElement: true })` では、`<video>` 要素の `src` を剥奪（`removeAttribute('src')`）せず維持したまま次のストリーム URL を差し替えることで、モバイルブラウザ（iOS Safari / Android Chrome）が「メディア消滅」と誤認してフルスクリーンを自動解除する現象を防止します。
  - **レジューム通知の表示制御 (`VideoPlayer.svelte`)**: 「前回 XX:XX まで視聴しました」通知は動画の初回ロード時（`playbackOffset === 0` かつ未判定時）にのみ 1 回だけ表示し、シーク再開時や再生操作後は自動的に非表示化・抑止します。
  - **タイムライン保護 (`isSeeking`)**: シーク開始から新ストリームの `playing` イベント受信まで `isSeeking` フラグで表示時刻を目標値に固定し、過渡期の 0 秒巻き戻りやチラつきを防止します。

---

## 9. ファイルストリーミング配信アーキテクチャと Node.js バージョン互換性

### 9.1 ファイル配信パイプラインとデッドロック回避 (`responseFile`)
- **Web Streams バックプレッシャーストールの回避**:
  - `@hono/node-server` の標準 Web Streams ループ（`Readable.toWeb(stream)`）は、巨大な動画ファイル（数十MB〜数GB）配信時にクライアントの受信速度や TCP ウィンドウの停滞によってバックプレッシャーが蓄積し、転送が途中で完全停止（デッドロック）する問題があります。
  - そのため、Node.js 実行環境（`c.env.outgoing` が存在する場合）では、Node.js ネイティブの `stream.pipe(outgoing)` を用いて直接ソケットへ流し込みます。
- **二重ヘッダー送信防止 (`createAlreadySentResponse` / `x-hono-already-sent`)**:
  - `stream.pipe(outgoing)` で手動送信した後、Hono のミドルウェアチェーンや `@hono/node-server` の `responseViaResponseObject()` に対してレスポンス送信済みであることを通知するため、`headers: { 'x-hono-already-sent': 'true' }` を付与したダミーレスポンスを返却します。
  - `@hono/node-server` は `x-hono-already-sent` ヘッダーを検知すると `outgoing.writeHead()` や `outgoing.end()` の重複呼出を安全にスキップします。

### 9.2 Node.js 22 / 24 間の `Response` 内部実装差異と Symbol 削除の注意点
- **背景**:
  - Hono では、ミドルウェア（CORS 等）が `c.res` を先行参照するとレスポンスに内部キャッシュシンボル（`cacheKey = Symbol("cache")`）が付与され、`@hono/node-server` の `responseViaCache()` が意図せず起動して `ERR_HTTP_HEADERS_SENT` を引き起こす場合があります。
- **Node.js 22 と 24 の差異**:
  - **Node.js 24**: Web 標準 `Response` クラスの内部フィールドが Private Identifier（`#kHeaders` 等）に移行しており、`Object.getOwnPropertySymbols(res)` は空配列 `[]` となります。
  - **Node.js 22**: undici の `Response` 実装において `Headers` インスタンス参照等の内部スロットが `Symbol` で管理されています。
- **実装上の教訓**:
  - `for (const sym of Object.getOwnPropertySymbols(res)) delete res[sym]` のように無差別にすべての Symbol を削除すると、Node.js 22 環境では `res.headers` が `undefined` に破壊されます。
  - キャッシュ Symbol を剥奪する場合は、必ず `if (sym.description === 'cache')` のように対象 Symbol を限定して削除する必要があります。

### 9.3 静的ファイル配信の設計保護方針（Readable.toWeb への安易なリファクタリング禁止）
- `responseFile` における `stream.pipe(outgoing)` と `createAlreadySentResponse()`（`cache` Symbol 安全剥奪）は、数GB規模の録画ファイルをプログレッシブ再生・シークする際のバックプレッシャーストール（デッドロック）を防止する必須のアーキテクチャパターンです。安易に `Readable.toWeb` へ変更することを禁止します（詳細は [`docs/dev/modernization-roadmap.md`](modernization-roadmap.md) 1.3 節を参照）。

---

## 10. ライブ／録画トランスコード配信におけるパイプライン保護と EPIPE 回避

### 10.1 クライアント切断時（再生離脱）の EPIPE 発生メカニズム
- WebM や MP4、M2TS 等のリアルタイムトランスコード配信中（`LiveStreamBaseModel` / `RecordedStreamBaseModel`）にクライアントが再生画面から離脱した場合、HTTP レスポンスストリームが切断されます。
- クライアント切断に伴い FFmpeg（`streamProcess`）が標準出力の切断を検知して先に終了すると、FFmpeg の `stdin` パイプが閉じられます。
- このとき、Mirakurun やファイルストリーム（`fileStream`）から届いたデータが `stream.pipe(this.streamProcess.stdin)` 経由で書き込まれ続けると、書き込み先ソケットが既に破棄されているため `childProcess.stdin` が `Error: write EPIPE` または `ERR_STREAM_DESTROYED` イベントを発火します。

### 10.2 FFmpeg stdin での EPIPE ハンドリング
- `LiveStreamBaseModel` および `RecordedStreamBaseModel` において、`this.streamProcess.stdin` に対する `error` イベントリスナーを登録し、子プロセスの早期終了に伴う `EPIPE` や `ERR_STREAM_DESTROYED` を無害な切断として安全に無視することで、未処理エラーによる `uncaughtException` を防止します。

---

## 11. ドロップログの PCR タイムコード解析と動画プレイヤー連携

### 11.1 PCR タイムコード追従 (`packages/arib-probe`)
- 録画中にパケットドロップやスクランブルが発生した際、`packages/arib-probe` の `DropChecker` は TS パケット内の PCR（Program Clock Reference）タイムスタンプをリアルタイム追従し、録画開始からの正確な経過時間（秒・ミリ秒）をドロップログに記録します。

### 11.2 動画プレイヤーシークバーでの可視化
- 録画再生時、クライアントは `/api/dropLogs/:dropLogFileId` からドロップログを取得し、発生秒数と種別（映像・音声・字幕・制御情報）を解析します。
- `VideoControls.svelte` のシークバー上に、ドロップ発生位置を示すピンマーカーを重畳描画し、該当箇所へのワンクリックジャンプを可能にします。

