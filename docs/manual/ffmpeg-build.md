# FFmpeg カスタムビルドガイド (ARIB 字幕 / VAAPI / 高品質エンコード対応)

本ドキュメントは、EPGDeck において **ARIB STD-B24 字幕保持（MP4 `mov_text` 化）**、**VAAPI ハードウェア支援**、**高品質エンコード（AV1 / 高品質 AAC 等）** を利用するための、FFmpeg カスタムビルドおよび環境構築の参考手順です。

OS 標準の FFmpeg パッケージや既存の動画環境を汚さずに共存させるため、**`/opt/ffmpeg-custom`** 配下に完全隔離して配置・運用する構成を推奨しています。

---

## 1. ホスト上でのビルド & 隔離インストール手順 (Ubuntu / Debian)

### (1) ビルド用依存パッケージのインストール

必要なコーデック・ライブラリの開発パッケージ（`-dev`）をインストールします。特に `libaribb24-dev` が ARIB 字幕デコードに必須となります。

```bash
sudo apt update && sudo apt install -y --no-install-recommends \
  build-essential pkg-config nasm yasm curl bzip2 git \
  libass-dev libfreetype6-dev libfontconfig1-dev libtool \
  libva-dev libvdpau-dev libvorbis-dev \
  libxcb1-dev libxcb-shm0-dev libxcb-xfixes0-dev \
  zlib1g-dev libnuma-dev \
  libx264-dev libx265-dev libmp3lame-dev libopus-dev libvpx-dev \
  libaribb24-dev libsvtav1-dev libsvtav1enc-dev libdav1d-dev libzimg-dev \
  libfdk-aac-dev
```

### (2) FFmpeg のソース取得とビルド

`/opt/ffmpeg-custom` をプレフィックスに指定して静的ライブラリ優先でビルドします。

```bash
cd /tmp
# FFmpeg ソースコードの取得（任意のバージョンを指定可能）
curl -fsSL https://ffmpeg.org/releases/ffmpeg-8.1.2.tar.bz2 | tar -xj
cd ffmpeg-8.1.2

./configure \
  --prefix=/opt/ffmpeg-custom \
  --disable-shared \
  --enable-static \
  --pkg-config-flags=--static \
  --enable-gpl \
  --enable-version3 \
  --enable-nonfree \
  --enable-libfdk-aac \
  --enable-libass \
  --enable-libfreetype \
  --enable-libaribb24 \
  --enable-libmp3lame \
  --enable-libopus \
  --enable-libvorbis \
  --enable-libvpx \
  --enable-libx264 \
  --enable-libx265 \
  --enable-libsvtav1 \
  --enable-libdav1d \
  --enable-libzimg \
  --enable-vaapi \
  --disable-debug \
  --disable-doc \
  --disable-ffplay

# CPU コア数に応じて並列ビルド & インストール
make -j$(nproc)
sudo make install

# 作業用一時ディレクトリの削除
cd /tmp && rm -rf ffmpeg-8.1.2
```

### (3) インストールと機能の確認

ビルドされたバイナリが正常に動作し、`arib_caption` や `vaapi` が有効になっていることを確認します。

```bash
/opt/ffmpeg-custom/bin/ffmpeg -version
/opt/ffmpeg-custom/bin/ffprobe -version

# ARIB 字幕デコーダが組み込まれているか確認
/opt/ffmpeg-custom/bin/ffmpeg -decoders | grep arib
# 出力例: S... arib_caption         ARIB STD-B24 captions (decoder: libaribb24)
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
```

---

## 3. 有効化される主要機能一覧

| 機能 | 指定ライブラリ / オプション | EPGDeck での用途・メリット |
| :--- | :--- | :--- |
| **ARIB STD-B24 字幕デコード** | `libaribb24` | 録画番組の MP4 エンコード時に字幕（`mov_text`）を欠落させず保存可能（`subtitle: true`） |
| **VAAPI ハードウェア支援** | `--enable-vaapi` | Intel iGPU / AMD Radeon による超低負荷・高速ハードウェアエンコード（`enc_vaapi.js`） |
| **H.264 エンコード** | `libx264` | 標準動画エンコード（最高画質・高圧縮） |
| **H.265 / HEVC エンコード** | `libx265` | 高効率圧縮エンコード |
| **高品質スケーリング** | `libzimg` | `zscale` フィルタによる高精度リサイズ・色空間変換 |
| **高品質 AAC 音声** | `libfdk_aac` | Fraunhofer 公式の高品質 AAC エンコーダ（ステレオ・二重音声の音質向上） |
| **AV1 エンコード / デコード** | `libsvtav1` / `libdav1d` | 次世代高圧縮コーデック AV1 の高速エンコードおよびデコード |
| **VP9 / Opus / Vorbis** | `libvpx` / `libopus` / `libvorbis` | WebM 形式でのストリーミングやエンコード |
| **字幕スタイリング** | `libass` / `libfontconfig` | ASS / SRT 字幕のレンダリングやテキスト配置 |

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

