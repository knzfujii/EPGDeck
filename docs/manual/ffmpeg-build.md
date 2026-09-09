# FFmpeg カスタムビルドガイド (ARIB 字幕 / VAAPI / WebP / 高品質エンコード対応)

本ドキュメントは、EPGDeck において **ARIB STD-B24 字幕保持（MP4 `mov_text` 化）**、**VAAPI / Intel QSV(oneVPL) ハードウェア支援**、**WebP サムネイル生成**、**libplacebo による HDR トーンマッピング**、および **高品質エンコード（AV1 / 高品質 AAC 等）** を利用するための、FFmpeg カスタムビルドおよび環境構築の参考手順です。

OS 標準の FFmpeg パッケージや既存の動画環境を汚さずに共存させるため、**`/opt/ffmpeg-custom`** 配下に完全隔離して配置・運用する構成を推奨しています。

---

## 1. ホスト上でのビルド & 隔離インストール手順 (Ubuntu 24.04 / Debian)

### (1) ビルド用依存パッケージのインストール

必要なコーデック・ライブラリの開発パッケージ（`-dev`）をインストールします。特に `libaribb24-dev`（ARIB 字幕）や `libwebp-dev`（WebP サムネイル）が重要となります。

```bash
sudo apt update && sudo apt install -y --no-install-recommends \
  build-essential pkg-config nasm yasm curl bzip2 git libtool \
  zlib1g-dev libnuma-dev \
  libass-dev libfreetype6-dev libfontconfig1-dev \
  libfribidi-dev libharfbuzz-dev \
  libva-dev libvdpau-dev libdrm-dev \
  libxcb1-dev libxcb-shm0-dev libxcb-xfixes0-dev \
  libx264-dev libx265-dev libvpx-dev \
  libsvtav1-dev libsvtav1enc-dev libdav1d-dev libaom-dev librav1e-dev \
  libaribb24-dev libzvbi-dev \
  libmp3lame-dev libopus-dev libvorbis-dev libfdk-aac-dev libsoxr-dev libtwolame-dev \
  libwebp-dev libjxl-dev libopenjp2-7-dev librsvg2-dev \
  libzimg-dev libplacebo-dev libvpl-dev \
  libgnutls28-dev libsrt-gnutls-dev librist-dev libxml2-dev libunistring-dev \
  libvidstab-dev libbluray-dev
```

### (2) FFmpeg のソース取得とビルド

`/opt/ffmpeg-custom` をプレフィックスに指定して静的ライブラリ優先でビルドします。

```bash
cd /tmp
# FFmpeg 8.1.2 ソースコードの取得
curl -fsSL https://ffmpeg.org/releases/ffmpeg-8.1.2.tar.bz2 | tar -xj
cd ffmpeg-8.1.2

./configure \
  --prefix=/opt/ffmpeg-custom \
  --disable-shared \
  --enable-static \
  --enable-gpl \
  --enable-version3 \
  --enable-nonfree \
  --enable-libfdk-aac \
  --enable-libass \
  --enable-libfreetype \
  --enable-libfontconfig \
  --enable-libfribidi \
  --enable-libharfbuzz \
  --enable-libaribb24 \
  --enable-libzvbi \
  --enable-libmp3lame \
  --enable-libopus \
  --enable-libvorbis \
  --enable-libsoxr \
  --enable-libtwolame \
  --enable-libvpx \
  --enable-libx264 \
  --enable-libx265 \
  --enable-libsvtav1 \
  --enable-libdav1d \
  --enable-libaom \
  --enable-librav1e \
  --enable-libwebp \
  --enable-libjxl \
  --enable-libopenjpeg \
  --enable-librsvg \
  --enable-libzimg \
  --enable-libplacebo \
  --enable-vaapi \
  --enable-libdrm \
  --enable-libvpl \
  --enable-gnutls \
  --enable-libsrt \
  --enable-librist \
  --enable-libxml2 \
  --enable-libvidstab \
  --enable-libbluray \
  --disable-debug \
  --disable-doc \
  --disable-ffplay

# CPU コア数に応じて並列ビルド & インストール
make -j$(nproc)
sudo make install

# 作業用一時ディレクトリの削除
cd /tmp && rm -rf ffmpeg-8.1.2 ffmpeg-8.1.2.tar.bz2
```

### (3) インストールと機能の確認

ビルドされたバイナリが正常に動作し、`arib_caption`、`libwebp`、`vaapi` 等が有効になっていることを確認します。

```bash
/opt/ffmpeg-custom/bin/ffmpeg -version
/opt/ffmpeg-custom/bin/ffprobe -version

# ARIB 字幕デコーダが組み込まれているか確認
/opt/ffmpeg-custom/bin/ffmpeg -decoders | grep arib
# 出力例: S... arib_caption         ARIB STD-B24 captions (decoder: libaribb24)

# WebP エンコーダが組み込まれているか確認
/opt/ffmpeg-custom/bin/ffmpeg -encoders | grep webp
# 出力例: V....D libwebp              libwebp WebP image (codec webp)
```

---

## 2. EPGDeck への適用方法 (`config.yml`)

ビルドしたカスタムバイナリを EPGDeck に認識させるため、`config/config.yml` の `encode.binaries` にパスを指定します。

```yaml
encode:
  binaries:
    ffmpeg: /opt/ffmpeg-custom/bin/ffmpeg
    ffprobe: /opt/ffmpeg-custom/bin/ffprobe
  presets:
    - name: H.264-1080p
      script: enc_1080p.js
      suffix: .mp4
      rate: 4.0
      subtitle: true    # libaribb24 により MP4 内に ARIB 字幕 (mov_text) が正常に保持されます

recording:
  thumbnail:
    format: webp        # libwebp により高圧縮・高品質な WebP サムネイルを生成
```

---

## 3. 有効化される主要機能一覧

| 機能 / 用途 | 指定ライブラリ / オプション | EPGDeck での用途・メリット |
| :--- | :--- | :--- |
| **WebP エンコード** | `libwebp` | **サムネイル画像の容量を JPEG 比で 30〜50% 削減** |
| **ARIB STD-B24 字幕デコード** | `libaribb24` | 録画番組の MP4 エンコード時に字幕（`mov_text`）を欠落させず保存可能（`subtitle: true`） |
| **VAAPI ハードウェア支援** | `--enable-vaapi` | Intel iGPU / AMD Radeon による超低負荷・高速ハードウェアエンコード（`enc_vaapi.js`） |
| **Intel QSV (oneVPL)** | `libvpl` | Intel 第11世代以降 CPU / Arc GPU 向け高速エンコード |
| **高品質 GPU レンダリング** | `libplacebo` | **HDR (HLG/HDR10) → SDR トーンマッピング**、次世代高品質スケーリング |
| **H.264 エンコード** | `libx264` | 標準動画エンコード（最高画質・高圧縮） |
| **H.265 / HEVC エンコード** | `libx265` | 高効率圧縮エンコード |
| **AV1 エンコード / デコード** | `libsvtav1` / `libdav1d` / `libaom` / `librav1e` | 次世代高圧縮コーデック AV1 の高速エンコードおよび最速デコード |
| **VP9 / Opus / Vorbis** | `libvpx` / `libopus` / `libvorbis` | WebM 形式でのストリーミングやエンコード |
| **JPEG XL / JPEG 2000** | `libjxl` / `libopenjpeg` | 次世代静止画フォーマットの入出力対応 |
| **高品質スケーリング** | `libzimg` | `zscale` フィルタによる高精度リサイズ・色空間変換 |
| **高品質 AAC 音声** | `libfdk_aac` | Fraunhofer 公式の高品質 AAC エンコーダ（ステレオ・二重音声の音質向上） |
| **高音質リサンプリング** | `libsoxr` | SoX ベースの高品質オーディオサンプリングレート変換 |
| **放送用 MP2 音声** | `libtwolame` | 日本の放送 TS 音声ストリーム互換 |
| **字幕スタイリング** | `libass` / `libfontconfig` / `libharfbuzz` | ASS / SRT 字幕の高度なフォント整形・配置 |
| **SRT / RIST ストリーミング** | `libsrt` / `librist` | 超低遅延・高信頼映像伝送プロトコル対応 |

---

## 4. ライセンスに関する注意事項

> [!CAUTION]
> **`libfdk-aac` (`--enable-nonfree`) の再配布について**
>
> `libfdk-aac` は Fraunhofer 社の独自ライセンスであり、FFmpeg の GPL ライセンスと法的に非互換です。
> そのため、`libfdk-aac` を含めてビルドしたバイナリを **第三者へ配布・公開することはライセンス違反となる可能性があります**。
> 個人利用や家庭内・自社サーバーでの内部利用（私的使用の範囲）であれば問題ありません。
> 不特定多数に再配布する可能性がある場合は、`--enable-nonfree` および `--enable-libfdk-aac` を外し、内蔵の `aac` エンコーダをご利用ください。
> 参照: [FFmpeg License and Legal Considerations](https://ffmpeg.org/legal.html)

---

## 5. (参考) コンテナ環境での利用

Docker コンテナ環境等で運用する場合は、同様のビルド手順をマルチステージビルドとして `Dockerfile` に組み込むことで、隔離された軽量な実行環境を構築できます。
詳細は [エンコードシステム仕様書 & 設定マニュアル](encoding.md) も併せて参照してください。


