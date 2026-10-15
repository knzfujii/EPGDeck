# データベース種別ごとの検索仕様（正規表現・大小文字区別）

EPGDeck ではデータベースドライバに `@libsql/client`（SQLite）および `mysql2`（MySQL / MariaDB）と Drizzle ORM を採用しており、外部 C 拡張ライブラリの動的ロードは行いません。

## データベース別の検索機能対応表

| 検索機能 | SQLite (`@libsql/client`) | MySQL / MariaDB (`mysql2`) | 備考 |
| :--- | :---: | :---: | :--- |
| **あいまい検索 (`LIKE`)** | 対応 | 対応 | 全角・半角正規化（`halfWidth*` カラム）およびスペース区切り AND 検索に対応 |
| **除外キーワード検索** | 対応 | 対応 | `NOT (...)` による条件反転 |
| **正規表現検索 (`REGEXP`)** | 非推奨（拡張なし） | **標準対応** | 正規表現ルールを多用する場合は **MySQL / MariaDB** の利用を推奨 |
| **大小文字区別 (`keyCS` / `ignoreKeyCS`)** | 非対応（常時区別なし） | **対応 (`CAST AS BINARY`)** | SQLite の `LIKE` 仕様に合わせ、大小文字区別は MySQL 使用時のみ有効 |

> [!TIP]
> ルール予約や番組検索で正規表現検索（`REGEXP`）や大小文字区別（`CS`）を活用したい場合、および大規模録画アーカイブを運用する場合は、標準で正規表現に対応し高い並行性能を持つ **MySQL (MariaDB)** の利用を推奨します。接続設定の詳細は [セットアップマニュアル](./setup.md#mysql-mariadb-使用時の注意) および [config.yml 詳細マニュアル](./configuration.md#2-データベース設定-database) を参照してください。

