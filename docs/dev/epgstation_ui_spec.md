# EPGStation (オリジナル) 画面仕様リファレンス

本ドキュメントは、Vue 2 / Vuetify ベースで構築されていたオリジナル EPGStation (v2.x) の全画面構成、提供機能、および API 連携を整理した参考仕様書です。EPGDeck への移行・差分比較の基礎資料として保持しています。

---

## 1. 画面一覧と API 連携サマリー

| 画面名 | パス | 主な役割・機能 | 主な連携 API |
| :--- | :--- | :--- | :--- |
| **ダッシュボード** | `/` | 録画中・最新録画済み・直近予約の3カラム表示 | `GET /api/recording`, `/api/recorded`, `/api/reserves` |
| **放映中** | `/onair` | 放送波別カード一覧、進行度表示、ライブストリーム開始 | `GET /api/schedules/broadcasting` |
| **ライブ視聴** | `/onair/watch` | ブラウザ上での低遅延/HLSライブ視聴、キープアライブ | `GET/DELETE /api/streams/live/...`, `PUT .../keep` |
| **番組表** | `/guide` | 24時間グリッド表示（朝4時起点）、番組詳細ダイアログ | `GET /api/schedules`, `POST/DELETE /api/reserves` |
| **番組表設定** | `/guide/setting` | 1分あたりの高さ・チャンネル幅・文字サイズ等の調整 | ローカル設定 (`localStorage`) |
| **予約一覧** | `/reserves` | 予約リスト確認、競合/重複バッジ表示、予約削除・手動解除 | `GET/DELETE /api/reserves`, `POST /api/reserves/delete` |
| **手動予約** | `/reserves/manual` | 日時・放送局を直接指定した番組表非依存の録画予約 | `POST /api/reserves` (時間指定ペイロード) |
| **録画中一覧** | `/recording` | 進行中録画の監視、強制停止（中断して録画済み化） | `GET /api/recording`, `DELETE /api/recording/:id` |
| **録画済み一覧** | `/recorded` | 過去の録画検索、再生、ダウンロード、一括削除、クリーンアップ | `GET/POST /api/recorded`, `POST /api/recorded/cleanup` |
| **録画詳細** | `/recorded/detail/:id` | メタデータ閲覧、再生形式選択、追加エンコード、外部連携 | `GET /api/recorded/:id`, `POST /api/recorded/:id/encode` |
| **直接再生** | `/recorded/watch` | エンコード済み MP4 ファイル等のブラウザ直接再生 | `GET /api/videos/:id` |
| **ストリーミング** | `/recorded/streaming/:id` | TS等のトランスコード配信（HLS / WebM / MP4） | `GET/DELETE /api/streams/recorded/...` |
| **ファイルアップロード** | `/recorded/upload` | 外部録画ファイルを手動インポート | `POST /api/recorded/upload` |
| **エンコード管理** | `/encode` | 実行中・待機中キューの確認、ジョブキャンセル、一括クリア | `GET/DELETE /api/encode`, `POST /api/encode/delete` |
| **番組検索** | `/search` | 条件検索（キーワード/ジャンル/時間帯等）とルール登録 | `POST /api/schedules/search`, `POST /api/rules` |
| **ルール一覧** | `/rule` | 登録ルールの有効/無効切替、編集（検索画面へ遷移）、削除 | `GET/DELETE /api/rules`, `PUT /api/rules/:id/enable` |
| **ストレージ容量** | `/storages` | 保存先ストレージの総容量・使用容量・空き容量プログレス表示 | `GET /api/storages` |
| **設定** | `/settings` | PWA、テーマ、描画パフォーマンス、既定の再生モード等 | ローカル設定 (`localStorage`) |

---

## 2. オリジナル固有の設計・特徴

1. **画面の細分化**:
   - 録画中一覧（`/recording`）、ストレージ容量（`/storages`）、番組表サイズ設定（`/guide/setting`）など、単機能ごとの独立画面が多い構成。
   - ルール編集は独立した編集ページを持たず、検索画面（`/search?ruleId=...`）に条件を流し込んで更新する設計。
2. **クリーンアップ機能の存在**:
   - Web 画面上から `POST /api/recorded/cleanup` を実行し、実ファイル不在の DB レコードを一括整理する導線が存在（※誤削除リスクのため EPGDeck では UI 導線を意図して非搭載）。
3. **ストリーミングセッション管理**:
   - 視聴開始時にストリーム ID を発行し、10秒ごとの `PUT /api/streams/:id/keep` で維持、離脱時に `DELETE /api/streams/:id` でプロセス停止するキープアライブ制御を採用。
