# 実行ユーザー・パーミッションおよび共有ストレージ (Samba / NAS) 設定ガイド

EPGDeck を 24時間365日安定稼働させ、録画ファイルをローカルディスクや Samba (CIFS) / NFS などのネットワーク共有ストレージに安全に保存・共有するためのパーミッション設計および設定ガイドです。

---

## 1. 概要とパーミッション設計原則

録画サーバーの運用では、以下のアクセス権限トラブルを防止するため、**適切な実行ユーザー**と **`UMask=0002`（グループ書き込み許可）** の設定が不可欠です。

- **Samba ファイル操作の保護**: 録画ファイルが所有者専用（`0644`）になると、共有クライアント（Windows / Mac）から削除・整理できなくなる。
- **コンテナ権限の不整合防止**: コンテナが `root` 実行されると、ホストや NAS の保存ファイルが `root:root` 所有となり一般ユーザーから操作不能になる。
- **共有ストレージ書き込みの確保**: NAS マウント時に UID/GID を指定しないと書き込み権限エラーで録画が失敗する。

---

## 2. 非コンテナ環境（ベアメタル / systemd）での設定

非コンテナ環境では、OS ネイティブの **`systemd`** を使用してサービス化します。

### 2.1 systemd ユニットファイルの設定 (`misc/systemd/epgdeck.service`)

付属の `misc/systemd/epgdeck.service` を `/etc/systemd/system/` にコピーして設定します。

```ini
[Unit]
Description=EPGDeck Recording Server
After=network.target network-online.target mirakurun.service mariadb.service mysql.service
Wants=network-online.target

[Service]
Type=simple

# 1. 実行ユーザーとグループ（普段ログインしている一般ユーザーを指定）
User=john
Group=john

WorkingDirectory=/home/john/EPGDeck
ExecStart=/usr/bin/node --enable-source-maps dist/index.js

# 2. 自動再起動（24365稼働）
Restart=always
RestartSec=3s

# 3. グレースフルシャットダウン（録画ファイル破損防止）
KillMode=mixed
TimeoutStopSec=30s
KillSignal=SIGTERM

# 4. パーミッション制御（最重要）
# UMask=0002 を指定することで、ファイル作成時に 0664 (rw-rw-r--)、
# ディレクトリ作成時に 0775 (rwxrwxr-x) となり、同一グループの別ユーザーからも削除・編集が可能になります。
UMask=0002

LimitNOFILE=65536
StandardOutput=journal
StandardError=journal
SyslogIdentifier=epgdeck

[Install]
WantedBy=multi-user.target
```

サービス登録と起動：
```bash
$ sudo cp misc/systemd/epgdeck.service /etc/systemd/system/
$ sudo systemctl daemon-reload
$ sudo systemctl enable epgdeck
$ sudo systemctl start epgdeck

# 状態確認・ログ確認
$ sudo systemctl status epgdeck
$ journalctl -u epgdeck -f
```

---

## 3. 共有ストレージ (Samba / NAS / NFS) を利用する場合の設定

### 3.1 EPGDeck 稼働ホスト自身が Samba サーバー（ファイル共有元）の場合

録画先ディレクトリを Windows / Mac 等に公開する場合、`/etc/samba/smb.conf` で共有ディレクトリのマスクを設定します。

```ini
[Recorded]
   path = /path/to/recorded
   browseable = yes
   writable = yes
   guest ok = no
   valid users = john, family

   # EPGDeck と Samba 利用ユーザー間でファイルを相互に編集・削除できるようにする設定
   force create mode = 0664
   create mask = 0664
   force directory mode = 0775
   directory mask = 0775
   force group = users
```

### 3.2 外部 NAS（Synology, QNAP, TrueNAS 等）をマウントする場合

EPGDeck が動作する Linux マシンから、外部 NAS の Samba (CIFS) 共有フォルダをマウントして録画先にする場合、`/etc/fstab` のマウントオプションで EPGDeck 実行ユーザーの UID/GID を必ず指定してください。

```text
# /etc/fstab の記述例 (CIFS / Samba)
//192.168.1.100/recorded  /mnt/nas/recorded  cifs  credentials=/etc/samba/credentials,uid=1000,gid=1000,file_mode=0775,dir_mode=0775,iocharset=utf8  0  0
```

> [!TIP]
> **ポイント**: `uid=1000,gid=1000,file_mode=0775,dir_mode=0775` を指定することで、NAS 側のファイル所有者に関わらず、Linux ローカル側では指定したユーザー（UID 1000）の持ち物としてマウントされ、読み書き・削除が確実に行えます。

---

## 4. コンテナ環境（Docker / Docker Compose）での設定

Docker 環境では、ホスト側のユーザー UID/GID とコンテナ内の実行権限を一致させることが極めて重要です。

### 4.1 `.env` による UID / GID の指定

1. ホスト上で実行ユーザーの UID / GID を確認します：
   ```bash
   $ id -u
   1000
   $ id -g
   1000
   ```

2. プロジェクト直下の `.env.example` をコピーして `.env` を作成します：
   ```bash
   $ cp .env.example .env
   ```

3. `.env` 内の `PUID` / `PGID` および保存先パスを設定します：
   ```ini
   PUID=1000
   PGID=1000
   RECORDED_DIR=/mnt/nas/recorded
   PORT=8888
   ```

### 4.2 `docker-compose.yml` での動作

`docker-compose.yml` では、以下のように指定された UID/GID でコンテナが起動します：

```yaml
services:
  epgdeck:
    image: epgdeck:latest
    user: "${PUID:-1000}:${PGID:-1000}"
    volumes:
      - ${RECORDED_DIR:-./recorded}:/app/recorded
    stop_grace_period: 30s
    init: true
    # ...
```

- これにより、コンテナ内で作成された録画ファイルもホスト側では `UID 1000` の所有となり、権限不整合が発生しません。
- `init: true` により `tini` が介在し、ffmpeg などの外部コマンドのゾンビプロセス（`<defunct>`）を確実に回収します。

### 4.3 GPU ハードウェアアクセラレーション（QSV / VAAPI）を利用する場合

Intel QuickSync Video (QSV) などのハードウェアエンコードを使用する場合、コンテナから `/dev/dri` へアクセスできるように権限を付与します。

ホスト側の render / video グループの GID を確認：
```bash
$ getent group render
render:x:107:
```

`docker-compose.yml` に以下を追記：
```yaml
    devices:
      - /dev/dri:/dev/dri
    group_add:
      - "107" # ホストの render グループ GID
```

---

## 5. トラブルシューティング

| 症状 | 原因 | 対処法 |
| :--- | :--- | :--- |
| **Samba から録画ファイルが削除できない** | ファイルが `0644` かつ所有者が別ユーザーになっている | systemd に `UMask=0002` を設定するか、Samba 側の `create mask = 0664` を設定する |
| **コンテナ起動時にログやデータ保存で Permission denied** | ホスト側のボリュームマウントディレクトリの権限がコンテナ実行ユーザーと不一致 | ホスト側で `chown -R 1000:1000 ./recorded ./thumbnail ./data ./logs` を実行する |
| **外部コマンドや ffmpeg が裏で残存する** | 親プロセスの強制終了または init プロセスの不在 | Operator のクリーン終了処理（Graceful Shutdown）および Docker の `init: true`（tini）を使用する |

---

## 6. 関連ドキュメント

- **[RAM ディスク (`/dev/shm`) 活用ガイド](./ramdisk.md)**: HLS ストリーミング一時ファイルやトランスコード中間領域に RAM ディスクを適用し、SSD 寿命保護とディスク I/O 負荷を軽減する設定ガイドです。
- **[config.yml 設定マニュアル](./configuration.md)**: 各種ディレクトリ設定の詳細リファレンスです。
