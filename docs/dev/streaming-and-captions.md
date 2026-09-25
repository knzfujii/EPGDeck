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
- サーバー側（`LiveStreamBaseModel` / `RecordedStreamBaseModel`）では、FFmpeg に流し込む前のパイプラインに **`arib-subtitle-timedmetadater`** を挿入します。
- `arib-subtitle-timedmetadater` は TS 内の字幕パケットを解析し、**ID3 Timed Metadata (`timed_id3` / stream_type: `0x15`)** パケットとして TS ストリーム内に再多重化します。
- FFmpeg は字幕ストリームを無効化（`-sn`）しつつ、データストリームをコピー（`-map 0 -c:d copy`）して TS セグメントを出力します。
- クライアント側（`hls.js`）は、セグメントから ID3 メタデータを抽出し、`Hls.Events.FRAG_PARSING_METADATA` イベントを発火します。
- クライアントの `SubtitleManager.ts` が ID3 ペイロードを受け取り、`feeder.feedID3()` に渡して描画します。
- ※ **Node.js ESM 相互運用**: `arib-subtitle-timedmetadater` は CJS 形式で `exports.default` にクラスが格納されるため、`StreamBaseModel.createID3MetadataTransform()` ファクトリ経由で防衛的にアンラップしてインスタンス化します。

---

## 3. aribb24.js v2 と node-arib-subtitle-timedmetadater の仕様差・解決策

### 3.1 発生した問題
EPGDeck において、M2TS-LL では字幕が表示できる一方、HLS 配信では動画再生が成功しても字幕が一切表示されない問題が発生しました。

### 3.2 根本原因の特定
1. **`node-arib-subtitle-timedmetadater` の挙動**:
   - このライブラリの内部実装（`src/index.ts`）では以下のように記述されています：
     ```typescript
     if ((data_group_id & 0x0F) != 1) { // FIXME!
       continue;
     }
     ```
   - ARIB STD-B24 の規格上、`data_group_id & 0x0F` が `0` は **CaptionManagement（字幕管理データ：言語・文字コード定義）**、`1` は **CaptionStatement（字幕本文データ）** です。
   - ライブラリが `data_group_id != 1` を破棄しているため、**HLS の ID3 メタデータには CaptionStatement（本文）しか含まれず、CaptionManagement（管理データ）が一切含まれません**。
2. **`aribb24.js` v1 と v2 の仕様差**:
   - 本家 EPGStation が使用している `aribb24.js` **v1** (1.11.2) は、CaptionManagement が届かなくてもデフォルトの文字コード体系（JIS8）で直接本文をレンダリングする設計（`CanvasProvider`）でした。
   - しかし、今回アップデートした `aribb24.js` **v2** (2.0.25) は規格に厳密に従って再設計されており、Feeder（`decoding-feeder.ts`）内部で：
     ```typescript
     // Caption
     if (this.priviousManagementData == null) { continue; }
     ```
     **CaptionManagement を受信していない場合、すべての CaptionStatement をスキップ（破棄）する** 仕様になっています。
   - このため、HLS から ID3 メタデータを受信しても、管理データが存在しないため `aribb24.js` v2 が全て読み飛ばしてしまっていました。

### 3.3 解決策（`SubtitleManager.ts` での動的補完とシーク保護）
日本の地上波・BS・CS デジタル放送における字幕規格は一意に定まっています（第1言語: `jpn`, 文字コード体系: `JIS8`）。
そこで、`SubtitleManager.ts` において標準的な CaptionManagement パケット（Group 0: Aプロファイル、Group 1: Bプロファイル）を合成し、`feeder.feedB24()` で注入する設計を採用しています。

#### 初回初期化注入から「動的注入＋シーク保護」への発展
単にプレイヤー初期化時に 1 度だけ `PTS: 0` で注入するだけでは、以下の理由で字幕が表示されなくなる問題が発生しました：
1. **シーク時の状態リセット**: `aribb24.js` の `onSeeking` ハンドラは、プレイヤーのシーク時に `disappearance()` を呼び出し、内部の `priviousManagementData` を `null` に破棄・リセットする。
2. **PTS 不整合**: シーク先やセグメントの PTS と初期注入時刻（0秒）が乖離していると、レンダラーの表示区間外とみなされ管理データが有効化されない。

このため、以下の動的注入アーキテクチャを実装しています：
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

### 6.2 `-fix_sub_duration` の必須性と字幕パケット間隔の注意点（`INT_MAX` 制限）
- **課題**: 放送波（ARIB STD-B24）の字幕パケットは表示終了時刻（duration）が明示されておらず、未指定（UINT32_MAX）として渡されます。これをそのまま MP4 muxer（`mov_text`）に流すと、FFmpeg が `Application provided duration in stream is invalid` (error `-22`) を吐いて即座にエンコードが異常終了します。
- **解決策**: FFmpeg 起動オプションに **`-fix_sub_duration`** を指定します。これにより、FFmpeg が後続のパケット PTS から自動的に字幕の表示期間を計算して MP4 に正常に書き込みます。
- **注意点（字幕間隔が約35.7分以上空く番組でのクラッシュ）**:
  - `-fix_sub_duration` は直前のパケットの duration を `次のパケットの PTS - 直前のパケットの PTS` で動的に調整します。
  - そのため、**洋画劇場など「字幕が映像に焼き込まれたオープンキャプション作品（＜字幕スーパー＞）」** や長時間特番などで、冒頭にわずかに ARIB 字幕が出た後、次の字幕パケットが約 35.7 分（2,147 秒）以上届かない場合、計算された duration が MP4/MOV の符号付き 32bit 最大値 `INT_MAX`（2,147,483,647 マイクロ秒 ≒ 2,147 秒）を超過します。
  - この場合、MP4 muxer（`libavformat/movenc.c`）のバリデーションチェックにより `Application provided duration: ... in stream ... is invalid` が発生してエンコードが終了します。
  - **自動回避策 (`skipSubtitleForSuperimpose: true`)**:
    - `config.yml` の `encode.skipSubtitleForSuperimpose: true` を設定すると、番組情報（タイトル・概要・詳細）に「字幕スーパー」が含まれている番組をエンコード開始時に自動検知し、字幕埋め込みを無効化（`subtitle: false` / `-sn`）してエンコードを実行します。
    - これにより、長時間のエンコード（例: 20〜30分間）が無駄に走った後にクラッシュする事態を完全にゼロにし、正常かつ高速にエンコードを完了させます。

### 6.3 制御フローとコマンドログ記録（`config.yml` ⇄ `EncoderModel` ⇄ `enc_helper.js`）
1. `config.yml` の `encode.presets[]` または `encode.subtitle` で `subtitle: true`（省略時 `false`）、および `encode.skipSubtitleForSuperimpose: true` を設定。
2. `src/model/service/encode/EncoderModel.ts` が開始時に `encodeCmd.cmd` を INFO ログに出力。さらに「字幕スーパー」を検出した場合は自動で `SUBTITLE: 'false'` に切り替え、環境変数 `SKIP_SUBTITLE_FOR_SUPERIMPOSE: 'true'` も子プロセスに伝搬。
3. `config/enc_helper.js` が実行時に組み立てた FFmpeg コマンド（シェルクォート整形済み）を `[enc_helper] FFmpeg command: ...` として出力。
4. `EncoderModel` がこのコマンド行を検知して INFO ログに記録し、万一エンコードが異常終了した場合にもエラーログの先頭に `failed ffmpeg command: ...` を自動出力して障害調査を容易にします。
5. 生成された MP4 は、クライアント側（`VideoPlayer.svelte`）で直接再生時にも `video.textTracks` の ON/OFF 切替（字幕ボタン / `C` キー）と完全連動します。

### 6.4 FFmpeg の `--enable-libaribb24` 依存性
- **ストリーミング（HLS / M2TS-LL）との決定的な違い**:
  - HLS 配信はサーバー側 Node.js（`arib-subtitle-timedmetadater`）が ID3 化し、ブラウザ側（`aribb24.js`）がデコードします。
  - M2TS-LL は FFmpeg が `-c:s copy` でパススルーし、ブラウザ側（`aribb24.js`）がデコードします。
  - したがって、**ストリーミング視聴機能には FFmpeg の libaribb24 は一切不要（libaribb24 非対応の通常 FFmpeg であっても完全動作）** です。
- **MP4 字幕保持時の必須性**:
  - MP4 にテキスト字幕（`mov_text`）を多重化するには、FFmpeg 自身が ARIB STD-B24 パケットをデコードしてテキスト化する必要があります。
  - FFmpeg 内で ARIB 字幕のデコーダーは `libaribb24` のみ（標準組み込みデコーダーは存在しない）であるため、`subtitle: true` を動作させるには **`--enable-libaribb24` を有効化してビルドされた FFmpeg が必須** となります。
  - 非対応 FFmpeg で `subtitle: true` を指定すると、`Decoder (codec arib_caption) not found for input stream` エラーでエンコードが失敗します（`subtitle: false` の場合は `-sn` となるため非対応 FFmpeg でも安全に完了します）。

---

## 7. MP4 オンデマンド WebVTT 字幕配信 API (`GET /api/videos/:id/vtt`)

MP4 ファイル内に埋め込まれた字幕（`mov_text` / `tx3g`）を、ブラウザ標準の `<track>` タグでオーバーレイ表示するための API 構成です。

- **ファイルレス（オンデマンド抽出）**:
  - ディスク上に `.vtt` ファイルを永続化保存せず、リクエスト時に FFmpeg pipe（`ffmpeg -i input.mp4 -f webvtt pipe:1`）経由でメモリ上にストリーム抽出します。
- **LRU インメモリキャッシュ**:
  - 同一動画・同一セッションでのシークや再取得による FFmpeg 多重起動を防ぐため、サーバー側で LRU インメモリキャッシュを保持します。
- **クライアント連携**:
  - `VideoPlayer.svelte` 内で `<track kind="subtitles" src="/api/videos/:id/vtt" default>` としてバインドされ、ネイティブな字幕レンダリングと完全連動します。

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
  - `onmousemove` でコントロール表示タイマーをリセットしていると、タップ前にコントロールが表示状態へ強制変更され、意図しないパーツ押下や背景トグルの不整合を引き起こします。
  - `onpointermove` / `onpointerleave` を使用し、`if (e.pointerType === 'touch') return;` でタッチ移動を明示的に除外することで、PC のマウスホバー時のみ自動表示を有効化します。
- **全画面透過オーバーレイによるタップ判定**:
  - `<video>` 直結のクリックイベント（再生トグル）を排し、前面に透明な `<button>`（`z-10`）をオーバーレイ配置します。
  - 非表示時のタップは「コントロール表示のみ（再生継続）」とし、表示時の空き領域タップは「即時非表示」とする 2 段階トグルを実現します。
- **非表示状態の完全無効化 (`inert` 属性の活用)**:
  - コントロール非表示時、下部コントロールバーに `inert={!showControls || undefined}` および `pointer-events-none` を付与します。
  - これにより、CSS の透過（`opacity-0`）だけでなく、ブラウザのヒットテスト・キーボードフォーカス・スクリーンリーダーから完全に除外され、不可視パーツの誤爆を防止します。
- **シーク・スライダー操作中のタイマー保護**:
  - シークバーや音量スライダーのドラッグ中（`onpointerdown` から `onpointerup` / `onchange` まで）は、自動非表示タイマーを一時停止（`pauseHideControlsTimer()`）し、指を離すまでコントロールが勝手に消えないよう保護します。

### 8.4 録画 HLS のシーク最適化とエンコードバッファ表示（即時シークとストリーム再起動）
- **課題（未エンコード領域へのシークでの巻き戻り）**:
  - 録画番組の HLS 配信は、リクエスト開始時に先頭から順次リアルタイムエンコード・セグメント化されます。
  - 再生開始後数分の段階でユーザーがシークバーで 10 分以降などの未生成領域を指定すると、`hls.js` はプレイリスト（m3u8）内に存在する最新セグメントの末尾（2分など）に再生位置を強制吸着（スナップ）させてしまい、意図した位置へシークできません。
- **解決策（バッファ内即時シーク ＋ バッファ外ストリーム再起動）**:
  - **エンコード済みバッファ管理 (`bufferedEnd`)**:
    - `VideoPlayer.svelte` は `hls.on(Hls.Events.LEVEL_UPDATED)` および `FRAG_BUFFERED` を監視し、現在サーバー側で生成完了している最大セグメント時刻（`playbackOffset + level.details.totalduration`）をリアルタイムに算出します。
  - **シーク分岐判定と即時ローディング遷移 (`seekTo`)**:
    - 指定時刻が生成済みバッファ内の場合: `<video>` の通常シーク（`videoElement.currentTime = targetTime - playbackOffset`）を実行し、ロード済みセグメントから即時再生。
    - 指定時刻が生成済みバッファ外の場合:
      - `<video>` の再生を即時一時停止（`videoElement.pause()`）し、旧 HLS インスタンスを破棄（`cleanupEngines()`）して旧ストリームのセグメント取得を完全停止。
      - 再生表示時刻をシーク先時刻へ即座に移動（`currentTime = clampedTime`）させ、シークバーのつまみと時間をジャンプ。
      - `isLoading = true` に即座に切り替え、中央にスピナー（くるくる）を表示して「XX:XX から HLS 配信を再生成中... (○秒)」とリアルタイム経過を表示。
      - `onHlsSeekRestart(targetTime)` コールバックを発火。
      - 再生成待機中は `ontimeupdate` / `onseeked` に `!isLoading` ガードを設けることで、旧要素の遅延イベントによる意図しないタイムスタンプ巻き戻りを完全防止。
  - **サーバー連携によるストリーム再起動と多重シーク制御 (`restartHlsAtPosition`)**:
    - `Watch.svelte` は旧ストリームを停止し、サーバー API `GET /api/streams/recorded/:videoFileId/hls?ss=${seekSecond}` を呼び出して指定位置からエンコードを開始する新ストリームを立ち上げます。
    - 連続シーク時の多重リクエストを防止するため、キュー方式（最新ターゲット保持＆ループ処理）を採用。
    - 新ストリーム準備完了時、`videoSrc` にタイムスタンプクエリ（`?t=${Date.now()}`）を付与してマニフェスト URL を更新し、同一 streamId の再利用時でも Svelte 5 `$effect` が確実にリロードを検知・再生成を実行。
    - クライアント側は `playbackOffset = seekSecond` を保持し、番組全体の実尺に対する絶対再生時刻（`playbackOffset + videoElement.currentTime`）を一貫して管理・表示します。
  - **エンコード進行バーの視覚化 (`VideoControls.svelte`)**:
    - シークバーの背景に、生成済みバッファ範囲（`bufferedEnd / duration`）をグレーバー（`bg-slate-500/60`）として重畳描画。
    - ユーザーは「どこまでが即座にシーク可能か」「どこ以降がストリーム再起動になるか」を一目で直感的に把握できます。
  - **WebM / MP4 トランスコード配信のシーク処理とポジション保護**:
    - WebM やトランスコード MP4 の HTTP リアルタイムパイプ配信は、Cues（シーク用インデックス情報）を持たないため、ブラウザネイティブの `videoElement.currentTime` 設定によるバッファ内シークは行えず、0 秒へリセットされる原因となります。
    - そのため、WebM / MP4 トランスコードストリームのシーク時は常にサーバー側 API（`-ss ${seekSecond}`）を用いたストリーム再生成（`onHlsSeekRestart`）を行います。
    - この際、`Watch.svelte` は `videoSrc` を空文字にクリアして `VideoPlayer` コンポーネントをアンマウント・再生成（`{#if videoSrc}` による破棄）させるのではなく、`playbackOffset = currentTarget` と新しい URL を直接更新します。
    - `VideoPlayer.svelte` 側でもアンロード処理（`cleanupEngines()`）の前に `isLoading = true` とシーク先 `currentTime` を先行確定し、メタデータロード直後ではなく再生開始時（`onplaying`）に `isLoading = false` へ復帰させることで、シーク時にポジションが一瞬 0 に移動するチラつきや巻き戻りを完全に防止しています。

---

## 9. ファイルストリーミング配信アーキテクチャと Node.js バージョン互換性

### 9.1 ファイル配信パイプラインとデッドロック回避 (`responseFile`)
- **Web Streams バックプレッシャーストールの回避**:
  - `@hono/node-server` の標準 Web Streams ループ（`Readable.toWeb(stream)`）は、巨大な動画ファイル（数十MB〜数GB）配信時にクライアントの受信速度や TCP ウィンドウの停滞によってバックプレッシャーが蓄積し、転送が途中で完全停止（デッドロック）する問題があります。
  - そのため、Node.js 実行環境（`c.env.outgoing` が存在する場合）では、Express 時代と同様に Node.js ネイティブの `stream.pipe(outgoing)` を用いて直接ソケットへ流し込みます。
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
  - `for (const sym of Object.getOwnPropertySymbols(res)) delete res[sym]` のように無差別にすべての Symbol を削除すると、Node.js 22 環境では `res.headers` が `undefined` に破壊され、後続処理やテストコードで `TypeError: Cannot read properties of undefined (reading 'get')` クラッシュを引き起こします。
  - キャッシュ Symbol を剥奪する場合は、必ず `if (sym.description === 'cache')` のように対象 Symbol を限定して削除する必要があります。
