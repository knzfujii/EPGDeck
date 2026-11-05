# FFmpeg 9 カスタムビルドガイド (ARIB 字幕 / VAAPI / WebP / x264・x265 独自静的ビルド対応)

本ドキュメントは、EPGDeck において **ARIB STD-B24 字幕保持（MP4 `mov_text` 化）**、**VAAPI / Intel QSV(oneVPL) ハードウェア支援**、**WebP サムネイル生成**、**`libswscale` 刷新**、**Native VVC (H.266) デコード**、**Vulkan 1.4 GPU フィルタ**、**LittleCMS 2 によるカラーマネジメント**、および **独自ビルドの最新 `x264` (`stable` 8bit/10bit) / `x265` (`4.3` 8bit/10bit/12bit Multi-bit) 完全静的リンク** を利用するための、カスタム FFmpeg 9.x のビルドおよび環境構築手順です。

OS 標準の FFmpeg パッケージや既存の動画環境を汚さずに共存させるため、**`/opt/ffmpeg9-custom`** 配下に完全隔離して配置・運用する構成を採用します。

---

## 1. ホスト上でのビルド & 隔離インストール手順 (Ubuntu 24.04 / Debian)

> [!IMPORTANT]
> **なぜ `x264` / `x265` を独自静的ビルドするのか**
>
> Ubuntu 24.04 標準パッケージの `libx265-dev` は **`3.5`（2021年リリース）** と古く、マルチスレッド処理・レート制御時のクラッシュやメモリリークなどの不安定要素が残っています。
> 本手順では、MulticoreWare 公式最新安定版 **`x265 4.3`**（8bit/10bit/12bit 統合 Multi-bit 構成、スレッド競合・メモリ安全性修正・AVX2 強化版）および VideoLAN 公式 **`x264 stable`**（8bit/10bit 両対応）をソースから静的ライブラリ（`.a`）としてビルドし、FFmpeg バイナリへ直接埋め込みます。これにより OS 標準ライブラリ（`.so`）への依存を排除し、安定性・圧縮効率・エンコード速度を大幅に向上させます。

### (1) ビルド用依存パッケージのインストール

OS 標準の古い `libx264-dev` / `libx265-dev` が誤ってリンクされるのを防ぐため開発用ヘッダを削除し、必要なビルド依存パッケージを一括導入します：

```bash
# 既存の古い開発用ヘッダを削除（OS のランタイムパッケージは維持）
sudo apt remove -y libx264-dev libx265-dev 2>/dev/null || true

# ビルドツールの導入
sudo apt update && sudo apt install -y --no-install-recommends \
  build-essential pkg-config cmake nasm yasm curl bzip2 git libtool \
  zlib1g-dev libnuma-dev \
  libass-dev libfreetype6-dev libfontconfig1-dev \
  libfribidi-dev libharfbuzz-dev \
  libva-dev libvdpau-dev libdrm-dev \
  libxcb1-dev libxcb-shm0-dev libxcb-xfixes0-dev \
  libvpx-dev \
  libsvtav1-dev libsvtav1enc-dev libdav1d-dev libaom-dev librav1e-dev \
  libaribb24-dev libzvbi-dev \
  libmp3lame-dev libopus-dev libvorbis-dev libfdk-aac-dev libsoxr-dev libtwolame-dev \
  libwebp-dev libjxl-dev libopenjp2-7-dev librsvg2-dev \
  libzimg-dev liblcms2-dev libvulkan-dev libvpl-dev \
  libgnutls28-dev libsrt-gnutls-dev librist-dev libxml2-dev libunistring-dev \
  libvidstab-dev libbluray-dev
```

### (2) ソース取得とビルド

#### Step 2-1: `x264` (`stable` / 8bit+10bit) の静的ビルド
```bash
PREFIX="/opt/ffmpeg9-custom"
BUILD_DIR="/tmp/ffmpeg-build-9.0.2"
rm -rf "${BUILD_DIR}" && mkdir -p "${BUILD_DIR}"
sudo mkdir -p "${PREFIX}/lib/pkgconfig" "${PREFIX}/include" "${PREFIX}/bin"

cd "${BUILD_DIR}"
git clone --depth 1 --branch stable https://code.videolan.org/videolan/x264.git
cd x264
./configure \
  --prefix="${PREFIX}" \
  --enable-static \
  --enable-pic \
  --disable-cli \
  --bit-depth=all
make -j$(nproc)
sudo make install
```

#### Step 2-2: `x265` (`4.3` / 8bit+10bit+12bit Multi-bit) の静的ビルド
```bash
cd "${BUILD_DIR}"
git clone --depth 1 --branch 4.3 https://github.com/Multicorewareinc/x265.git x265
cd x265/build/linux
mkdir -p 12bit 10bit 8bit

# 1. 12-bit 静的ライブラリ
cd 12bit
cmake -G "Unix Makefiles" ../../../source \
  -DHIGH_BIT_DEPTH=ON -DEXPORT_C_API=OFF -DENABLE_SHARED=OFF -DENABLE_CLI=OFF -DMAIN12=ON
make -j$(nproc)

# 2. 10-bit 静的ライブラリ
cd ../10bit
cmake -G "Unix Makefiles" ../../../source \
  -DHIGH_BIT_DEPTH=ON -DEXPORT_C_API=OFF -DENABLE_SHARED=OFF -DENABLE_CLI=OFF -DENABLE_HDR10_PLUS=ON
make -j$(nproc)

# 3. 8-bit 静的ライブラリ & 10bit/12bit の統合結合
cd ../8bit
ln -sf ../10bit/libx265.a libx265_main10.a
ln -sf ../12bit/libx265.a libx265_main12.a

cmake -G "Unix Makefiles" ../../../source \
  -DCMAKE_INSTALL_PREFIX="${PREFIX}" \
  -DENABLE_SHARED=OFF \
  -DENABLE_CLI=OFF \
  -DEXTRA_LIB="x265_main10.a;x265_main12.a" \
  -DEXTRA_LINK_FLAGS="-L." \
  -DLINKED_10BIT=ON \
  -DLINKED_12BIT=ON
make -j$(nproc)

mv libx265.a libx265_main.a
ar -M <<EOF
CREATE libx265.a
ADDLIB libx265_main.a
ADDLIB libx265_main10.a
ADDLIB libx265_main12.a
SAVE
END
EOF

sudo make install
sudo sed -i 's/^Libs:\(.*\)/Libs:\1 -lstdc++ -lm -lgcc_s -lgcc -lrt -ldl -lnuma/' "${PREFIX}/lib/pkgconfig/x265.pc"
```

#### Step 2-3: FFmpeg 9.0.2 本体のビルド
```bash
mkdir -p "${BUILD_DIR}/ffmpeg" && cd "${BUILD_DIR}/ffmpeg"
curl -fsSL https://ffmpeg.org/releases/ffmpeg-9.0.2.tar.bz2 | tar -xj --strip-components=1

export PKG_CONFIG_PATH="${PREFIX}/lib/pkgconfig:${PKG_CONFIG_PATH:-}"

./configure \
  --prefix="${PREFIX}" \
  --extra-cflags="-I${PREFIX}/include" \
  --extra-ldflags="-L${PREFIX}/lib" \
  --extra-libs="-lpthread -lm -lstdc++ -ldl -lnuma" \
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
  --enable-lcms2 \
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

make -j$(nproc)
sudo make install

# 作業ディレクトリの削除
cd /tmp && rm -rf "${BUILD_DIR}"
```

### (3) インストールと機能の確認

ビルドされたバイナリが正常に動作し、`x264` / `x265` が静的リンクされていることを確認します：

```bash
/opt/ffmpeg9-custom/bin/ffmpeg -version
/opt/ffmpeg9-custom/bin/ffprobe -version

# x264/x265 が静的リンクされ、外部共有ライブラリ（.so）への依存がないことを確認（何も出力されなければ成功）
ldd /opt/ffmpeg9-custom/bin/ffmpeg | grep -E "x264|x265"

# ARIB 字幕デコーダが組み込まれているか確認
/opt/ffmpeg9-custom/bin/ffmpeg -decoders | grep arib
# 出力例: S... arib_caption         ARIB STD-B24 captions (decoder: libaribb24)

# WebP エンコーダが組み込まれているか確認
/opt/ffmpeg9-custom/bin/ffmpeg -encoders | grep webp
# 出力例: V....D libwebp              libwebp WebP image (codec webp)
```

---

## 2. EPGDeck への適用方法 (`config.yml`)

ビルドしたカスタムバイナリを EPGDeck に認識させるため、`config/config.yml` の `encode.binaries` にパスを指定します。

```yaml
encode:
  binaries:
    ffmpeg: /opt/ffmpeg9-custom/bin/ffmpeg
    ffprobe: /opt/ffmpeg9-custom/bin/ffprobe
  presets:
    - name: H.264-1080p
      script: enc_1080p.js
      suffix: .mp4
      subtitle: true    # libaribb24 により MP4 内に ARIB 字幕 (mov_text) が正常に保持されます

recording:
  thumbnail:
    format: webp        # libwebp により高圧縮・高品質な WebP サムネイルを生成
```

---

## 3. 有効化される主要機能一覧

| 機能 / 用途 | 指定ライブラリ / オプション | EPGDeck での用途・メリット |
| :--- | :--- | :--- |
| **H.264 静的エンコード** | `libx264` (stable 静的リンク) | 高互換・高品質な H.264 エンコード（8bit/10bit 両対応） |
| **H.265 / HEVC 静的エンコード** | `libx265` (4.3 Multi-bit 静的リンク) | 最新 `x265 4.3` による高効率・高画質エンコード（8bit/10bit/12bit Multi-bit 統合構成、スレッド安全性向上） |
| **ARIB STD-B24 字幕デコード** | `libaribb24` | 録画番組の MP4 エンコード時に字幕（`mov_text`）を欠落させず保存可能（`subtitle: true`） |
| **WebP サムネイル生成** | `libwebp` | サムネイル画像の容量を JPEG 比で 30〜50% 削減 |
| **VAAPI ハードウェア支援** | `--enable-vaapi` | Intel iGPU / AMD Radeon による低負荷・高速ハードウェアエンコード（`enc_vaapi.js` 等） |
| **Intel QSV (oneVPL)** | `libvpl` | Intel 第11世代以降 CPU / Arc GPU 向け高速エンコード支援 |
| **カラーマネジメント** | `lcms2` | LittleCMS 2 による正確な ICC プロファイル色空間変換・HDR 処理支援 |
| **AV1 エンコード / デコード** | `libsvtav1` / `libdav1d` / `libaom` / `librav1e` | 次世代高圧縮コーデック AV1 の高速エンコードおよび最速デコード |
| **VP9 / Opus / Vorbis** | `libvpx` / `libopus` / `libvorbis` | WebM 形式でのストリーミングやエンコード |
| **JPEG XL / JPEG 2000** | `libjxl` / `libopenjpeg` | 次世代静止画フォーマットの入出力対応 |
| **高品質スケーリング** | `libzimg` | `zscale` フィルタによる高精度リサイズ・色空間変換 |
| **高品質 AAC 音声** | `libfdk_aac` | Fraunhofer 公式の高品質 AAC エンコーダ（ステレオ・二重音声の音質向上） |
| **高音質リサンプリング** | `libsoxr` | SoX ベースの高品質オーディオサンプリングレート変換 |
| **放送用 MP2 音声** | `libtwolame` | 日本の放送 TS 音声ストリーム互換 |
| **字幕スタイリング** | `libass` / `libfontconfig` / `libharfbuzz` | ASS / SRT 字幕の高度なフォント整形・配置 |
| **SRT / RIST ストリーミング** | `libsrt` / `librist` | 低遅延・高信頼映像伝送プロトコル対応 |

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
