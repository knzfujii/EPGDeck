# ログ出力設定マニュアル

EPGDeck では、[log4js](https://github.com/log4js-node/log4js-node) による統合ロギングを採用しています。  
ログ設定はすべて `config/config.yml` 内の `log` セクションで一元管理されます。

## 1. ログ設定の構成 (`config.yml`)

```yaml
log:
  level: info          # 出力ログレベル (debug | info | warn | error)
  console: true        # ターミナル・コンソールへのカラー出力
  file:
    enabled: true      # ログファイルへの永続化
    path: '%ROOT%/logs/epgdeck.log' # ログファイルの保存先
    maxSize: 10485760  # 1ファイルあたりの最大サイズ(バイト) (例: 10MB)
    backups: 5         # 保持世代数
  bufferSize: 1000     # Web UI (/logs) および Socket.IO 配信用のインメモリ保持行数
```

## 2. ログレベル一覧

| レベル | 説明 |
| :--- | :--- |
| **`error`** | 録画失敗、外部コマンド異常終了、致命的な例外 |
| **`warn`** | 録画準備の競合警告、軽微な異常 |
| **`info`** | 通常運用時の情報（予約更新、録画開始/完了、エンコード進捗等） |
| **`debug`** | 開発・デバッグ時の詳細情報（FFmpeg の詳細な引数や実行ログ等） |

## 3. Web UI リアルタイムストリーミング (/logs)

EPGDeck にはリアルタイムログビューアが標準搭載されています。
- Web UI の「システムログ」画面（`/logs`）から、リアルタイムに流れるアクセスログやシステムログをブラウザ上で直接確認できます。
- カテゴリ別フィルタ（System, Access, Stream, Encode）やログレベルによるリアルタイム絞り込み、ログファイル全体のダウンロードが可能です。

