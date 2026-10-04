# SQLite3 使用時の正規表現検索について

> [!WARNING]
> **現在 EPGDeck では本設定は非推奨・非対応です**:
> EPGDeck ではモダンなアーキテクチャへの刷新に伴い、データベースドライバに `@libsql/client` (LibSQL) および Drizzle ORM を採用しています。
> そのため、旧 EPGStation 時代の `sqlite.extensions` および `sqlite.regexp` 設定は現在廃止されており、`config.yml` に指定しても読み込まれません。
> 
> ルール予約や番組検索で高度な正規表現検索（`REGEXP`）を活用したい場合は、標準で正規表現に対応し、大量録画でも高いパフォーマンスを発揮する **MySQL (MariaDB)** のご利用を推奨します（詳細は [セットアップマニュアル](./setup.md#mysql-mariadb-使用時の注意) を参照してください）。

以下は、レガシーな C 拡張ライブラリを用いた過去の参考手順です。

## shared library の作成

### 1. ソースコードのダウンロード

[SQLite Download Page](https://www.sqlite.org/download.html) から `sqlite-amalgamation-*.zip` と `sqlite-src-*.zip` をダ
ウンロードし、適当な場所に解凍する

### 2. ソースコードの配置

`sqlite-src-*/ext/misc/regexp.c` を `sqlite-amalgamation-*` へコピーする

### 3. ビルド

`sqlite-amalgamation-*` へ移動し以下のコマンドを実行する

-   Linux の場合

```
gcc -g -fPIC -shared regexp.c -o regexp.so
```

-   macOS の場合

```
gcc -g -fPIC -dynamiclib regexp.c -o regexp.dylib
```

-   Windows (64bit) の場合

スタートメニュー -> Visual C++ Build Tools -> Visual C++ 2015 x64 Native Build Tools Command Prompt を開き
`sqlite-amalgamation-*` へ移動し以下のコマンドを実行する

```
cl regexp.c -link -dll -out:regexp.dll
```

### ファイルの配置

生成された regexp.so (Linux), regexp.dylib (macOS), regexp.dll (Windows) を適当な場所へ配置する

## EPGDeck の修正

config.yml に以下の項目を追加します。

```yaml
sqlite:
    extensions:
        - '/hoge/regexp.so'
    regexp: true
```

Windows でのファイルパス指定は

```
C:\\hoge\\regexp.dll
```

ではなく

```
C:/hoge/regexp.dll
```

となるので注意しましょう

EPGDeck を再起動したら完了です
