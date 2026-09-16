# `/dev/shm`（RAM ディスク / tmpfs）活用ガイド

EPGDeck において、ストリーミング一時バッファ（HLS セグメント等）やトランスコード一時領域にメモリファイルシステム（`/dev/shm`）を適用し、**SSD/HDD の書き込み寿命保護（TBW 削減）** と **ディスク I/O 負荷軽減** を実現するためのベストプラクティスガイドです。

---

## 1. なぜ `/dev/shm`（RAM ディスク）を活用するのか

### 1.1 HLS ストリーミング配信によるディスク摩耗の実態
EPGDeck の Web UI やモバイル端末でライブ視聴・録画ストリーミング（HLS 形式）を行う際、FFmpeg は数秒単位（標準 3 秒）で動画セグメントファイル（`.ts`）とプレイリスト（`.m3u8`）をディスク上の一時ディレクトリに生成し続けます。

- **高頻度な I/O**: 数秒ごとに数 MB のファイルが作成・削除され続けます。
- **書き込み量の累積**: 1 回の視聴（数時間）で十数 GB〜数十 GB もの書き込みが発生します。
- **SSD へのダメージ**: SSD には素子の書き換え寿命（TBW: Terabytes Written）があり、常時ストリーミング視聴を行うと寿命が急速に減少します。
- **ディスク負荷**: 録画中のメインストレージと同一の HDD/SSD に一時ファイルを置くと、ヘッドシーク競合や I/O ボトルネックが発生し、録画のドロップ原因になる場合があります。

### 1.2 メモリファイルシステム（tmpfs）を適用するメリット
Linux 標準の `/dev/shm` はカーネルが管理するメモリベースのファイルシステム（tmpfs）です。

1. **SSD/HDD 書き込み量ゼロ**: すべてメインメモリ（RAM）上で完結するため、物理ストレージの摩耗が一切発生しません。
2. **圧倒的な超低遅延**: ディスク I/O 待ち（iowait）がゼロになり、HLS セグメント生成・配信が高速化され、シークや再生開始の応答性が向上します。
3. **ゴミファイルの残留防止**: 再起動や電源断でデータが自動的に消滅するため、異常終了時に不要なセグメントファイルがディスクを圧迫し続ける心配がありません。

---

## 2. 適用領域ごとの推奨度と注意点

EPGDeck で設定可能な一時領域と、`/dev/shm` 適用の推奨度は以下の通りです。

| 一時領域設定 | デフォルトパス | 推奨度 | メモリ消費目安 | 備考 |
| :--- | :--- | :---: | :--- | :--- |
| **ストリーミング一時領域**<br>`streaming.tempDir` | `%ROOT%/data/streamfiles` | **★★★<br>(必須級推奨)** | 1 ストリームあたり約 50〜100MB | HLS セグメントはリングバッファ式に古いものから自動削除されるため、メモリをほとんど消費せず最大の保護効果が得られます。 |
| **アップロード一時領域**<br>`recording.uploadTempDir` | `%ROOT%/data/upload` | **★★☆<br>(推奨)** | アップロード動画サイズ分 | Web UI から手動で動画をアップロードする際の一時領域。十分な空きメモリがあれば安全です。 |
| **録画一時領域**<br>`recording.tempDir` | *(未指定: 直接保存先)* | **★☆☆<br>(条件付き)** | 地デジ: 約 7〜8GB/h<br>BS/CS: 約 10〜15GB/h | **注意**: 同時録画数 × 番組長で数十 GB を消費します。メモリ枯渇（OOM Killer）による録画中断リスクがあるため、原則として高速 SSD を推奨します。 |

---

## 3. システムの `/dev/shm` 容量確認とサイズ変更

### 3.1 現在の割り当てと空き容量の確認
Linux では通常、**物理 RAM の 50%** が `/dev/shm` の最大容量として自動割り当てされています。

```bash
$ df -h /dev/shm
Filesystem      Size  Used Avail Use% Mounted on
tmpfs           7.8G  1.2M  7.8G   1% /dev/shm
```

> [!NOTE]
> tmpfs は「使用した分だけメモリを消費する」仕様です。最大容量（Size）が 8GB と表示されていても、実際に 100MB のファイルしか置いていなければ、消費される物理メモリは 100MB のみです。

### 3.2 容量を明示的に拡張・制限する場合 (`/etc/fstab`)
デフォルトの 50% からサイズを変更したい場合は、`/etc/fstab` に以下の設定を追加または変更します。

```text
# 例: /dev/shm の上限を 4GB に設定する場合
tmpfs   /dev/shm    tmpfs   defaults,size=4G    0   0

# 例: 搭載メモリに余裕があり 16GB に拡大する場合
tmpfs   /dev/shm    tmpfs   defaults,size=16G   0   0
```

設定を即座に反映させるには：
```bash
sudo mount -o remount /dev/shm
```

---

## 4. EPGDeck 設定手順

### 4.1 `config.yml` の編集
`config/config.yml` の `streaming` セクションで `tempDir` を指定します。

```yaml
# ------------------------------------------------------------------------------
# 9. ライブ・録画ストリーミング設定 (Streaming)
# ------------------------------------------------------------------------------
streaming:
  # HLS セグメント一時バッファを RAM ディスク (/dev/shm) に配置
  tempDir: '/dev/shm/epgdeck/streamfiles'

# ------------------------------------------------------------------------------
# 5. 録画設定 (Recording)
# ------------------------------------------------------------------------------
recording:
  # 手動アップロード一時領域も RAM ディスクに配置する場合
  uploadTempDir: '/dev/shm/epgdeck/upload'
```

### 4.2 ディレクトリの自動作成について
`/dev/shm` は RAM 上にあるため、**OS 再起動時に配下のディレクトリ（`/dev/shm/epgdeck` など）は消去されます**。

しかし、**EPGDeck は起動時およびストリーミング開始時に指定されたディレクトリを自動的に再作成（`mkdir -p`）します**。そのため、起動スクリプトや systemd ユニットで事前に `mkdir` コマンドを用意する必要はありません。

---

## 5. Docker / コンテナ環境での重要注意事項

Docker コンテナ上で EPGDeck を稼働させる場合、**重大な落とし穴** があります。

> [!CAUTION]
> **Docker コンテナの `/dev/shm` はデフォルトでわずか 64MB に制限されています！**
> そのままストリーミング視聴を行うと、数分でディスクフル（容量不足エラー）となり、FFmpeg が強制終了して再生が止まります。

### 解決策 A: ホストの `/dev/shm` をバインドマウントする（推奨）
ホストマシンの RAM ディスクをそのまま共有します。

**docker-compose.yml 例:**
```yaml
services:
  epgdeck:
    image: epgdeck:latest
    container_name: epgdeck
    volumes:
      - /dev/shm:/dev/shm  # ホストの /dev/shm をそのままマウント
      - ./config:/app/config
      - ./recorded:/app/recorded
```

**docker run 例:**
```bash
docker run -d \
  -v /dev/shm:/dev/shm \
  ...
```

### 解決策 B: コンテナの `shm_size` を拡大する
コンテナ独自の `/dev/shm` 容量を拡大します。

**docker-compose.yml 例:**
```yaml
services:
  epgdeck:
    image: epgdeck:latest
    container_name: epgdeck
    shm_size: '2gb'        # 2GB〜4GB に拡大
```

**docker run 例:**
```bash
docker run -d --shm-size=2g ...
```

---

## 6. 録画一時ディレクトリ (`recording.tempDir`) への適用について

`config.yml` の `recording.tempDir` を指定すると、録画中の TS ファイルを一旦一時ディレクトリに保存し、録画完了後に `recording.directories` の本保存先へ移動（`rename` または コピー＆削除）させることができます。

### RAM ディスク化の判断基準

- **非推奨のケース（一般的な環境）**:
  - メモリが 8GB〜16GB 程度の場合
  - 複数チューナーで同時録画を行う場合（例: 地デジ 3 番組 × 2 時間 ＝ 約 45GB 消費）
  - 年末年始や特番など長時間の録画がある場合
  - **リスク**: 容量超過時にカーネルの OOM Killer が起動し、EPGDeck や Mirakurun が巻き添えで強制終了してすべての録画が失敗します。

- **推奨される代替アプローチ（2 段ストレージ構成）**:
  - **一時領域（`tempDir`）**: ローカルの高速 NVMe / SATA SSD
  - **本保存先（`directories`）**: 大容量 HDD や低速な NAS（Samba / NFS）
  - **効果**: 録画中の書き込みは安定した高速 SSD で受け止め、録画完了後にバックグラウンドで NAS へ転送されるため、ネットワーク瞬断や NAS のスリープによる録画ドロップを完全に防止できます。

---

## 7. トランスコード・エンコード時の中間領域としての活用

`config/enc_helper.js` やカスタムエンコードスクリプトで、中間ファイル（2 パスエンコードのログファイルや一時ファイル等）を扱う場合は、出力先パスに `/dev/shm` を指定することで高速化と SSD 保護が可能です。

```javascript
// カスタムスクリプト内での例
const tempPassLog = `/dev/shm/epgdeck/passlog_${Date.now()}`;
```

---

## 8. ベストプラクティス設定例まとめ

一般家庭での録画サーバー（メモリ 8GB〜32GB 搭載機）における最もバランスの良い推奨設定です。

```yaml
# config/config.yml 抜粋

recording:
  # 録画先ディレクトリ
  directories:
    - name: recorded
      path: '%ROOT%/recorded'
  # 録画一時ディレクトリ（SSD を指定し、NAS への安全な退避に利用）
  # tempDir: '/mnt/fast-ssd/epgdeck_tmp'

  # アップロード一時領域（RAM ディスク）
  uploadTempDir: '/dev/shm/epgdeck/upload'

streaming:
  # ストリーミング一時バッファ（RAM ディスク / SSD 寿命保護に最大効果）
  tempDir: '/dev/shm/epgdeck/streamfiles'
```

この設定を適用するだけで、日常的な HLS 視聴に伴う数十〜数百 GB/日の SSD 書き込みを完全にゼロに抑え、快適なストリーミング視聴とサーバーの長期安定稼働を両立できます。

