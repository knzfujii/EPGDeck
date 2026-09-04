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

### 3.3 解決策（`SubtitleManager.ts` での補完）
日本の地上波・BS・CS デジタル放送における字幕規格は一意に定まっています（第1言語: `jpn`, 文字コード体系: `JIS8`）。
そこで、`SubtitleManager.ts` の初期化時（`attach` 時）に、標準的な CaptionManagement パケット（Group 0: Aプロファイル、Group 1: Bプロファイル）を合成し、`feeder.feedB24()` で事前注入する設計を採用しました：

```typescript
// SubtitleManager.ts
private injectDefaultCaptionManagement(): void {
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

        // Caption (0x80)
        const captionPES = new Uint8Array([0x80, 0xff, 0xf0, ...dgPayload]);
        this.captionFeeder?.feedB24(captionPES, 0, 0);

        // Superimpose (0x81)
        const superPES = new Uint8Array([0x81, 0xff, 0xf0, ...dgPayload]);
        this.superimposeFeeder?.feedB24(superPES, 0, 0);
    }
}
```
これにより、`aribb24.js` v2 の最新アーキテクチャ（Controller / Feeder / Renderer 分離、高速レンダリング）を維持したまま、HLS 配信でも即座に字幕が正常表示されるようになりました。

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

### 6.2 `-fix_sub_duration` の必須性（クラッシュ防止）
- **課題**: 放送波（ARIB STD-B24）の字幕パケットは表示終了時刻（duration）が明示されておらず、未指定（UINT32_MAX）として渡されます。これをそのまま MP4 muxer（`mov_text`）に流すと、FFmpeg が `Application provided duration in stream is invalid` (error `-22`) を吐いて即座にエンコードが異常終了します。
- **解決策**: FFmpeg 起動オプションに **`-fix_sub_duration`** を指定します。これにより、FFmpeg が後続のパケット PTS から自動的に字幕の表示期間を計算して MP4 に正常に書き込みます。

### 6.3 制御フロー（`config.yml` ⇄ `EncoderModel` ⇄ `enc_helper.js`）
1. `config.yml` の `encode.presets[]` または `encode.subtitle` で `subtitle: true`（省略時 `false`）を設定。
2. `src/model/service/encode/EncoderModel.ts` が子プロセス起動時に環境変数 `SUBTITLE`（`'true'` または `'false'`）を伝搬。
3. `config/enc_helper.js` が `options.subtitle` および `process.env.SUBTITLE` を評価し、有効な場合は：
   - 入力引数に `-fix_sub_duration` を追加
   - 字幕マッピングに `-map 0:s? -c:s mov_text -metadata:s:s:0 language=jpn` を追加
4. 生成された MP4 は、クライアント側（`VideoPlayer.svelte`）で直接再生時にも `video.textTracks` の ON/OFF 切替（字幕ボタン / `C` キー）と完全連動します。

