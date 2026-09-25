# テスト & CI/CD アーキテクチャ仕様書

本ドキュメントでは、EPGDeck における品質保証戦略、テスト設計パターン（単体テスト、DB実機結合テスト、E2Eテスト）、および GitHub Actions CI/CD パイプラインの最適化アーキテクチャについて解説します。

---

## 1. テスト戦略の全体像

EPGDeck では、実行速度と検証精度のバランスを取るため、3層のテストピラミッドを採用しています。

```mermaid
graph TD
    E2E["Playwright E2E テスト (全58シナリオ・画面導線・UI)"]
    Integration["MariaDB / MySQL 実機結合テスト (DDL・方言・DAO)"]
    Unit["Vitest 単体テスト (SQLite インメモリ・ロジック・約1.8秒)"]

    E2E --> Integration
    Integration --> Unit
```

| テスト層 | 対象範囲 | 実行環境 | 実行時間 | 実行コマンド |
| :--- | :--- | :--- | :--- | :--- |
| **超高速チェック** | サーバー型検査＋単体テスト＋ESMスモーク＋クライアント構文検査（並列実行） | Node.js + Vitest + Svelte Check | 約 3〜5 秒 | `npm run check:quick` |
| **単体テスト** | ビジネスロジック、Hono ルート、Drizzle Helper、設定パース、Client HTTP | Node.js + Vitest (SQLite インメモリ `:memory:`) | 約 1.8 秒 | `npm test` |
| **下限バージョン互換テスト** | Node.js 22 環境での単体テスト全件実行（ランタイム・Web標準互換性検証） | Node.js 22 (`mise exec node@22`) + Vitest | 約 2〜4 秒 | `npm run test:compat` |
| **ESM スモークテスト** | Node.js ネイティブでの CJS/ESM 相互運用、全外部依存のインスタンス化、CLI 構文検査 | Node.js 直接実行（Vitest 非経由） | 約 0.05 秒 | `npm run test:esm` |
| **実機結合テスト** | MySQL / MariaDB 固有の方言、インデックス作成、Auto-Increment ID、主要 DAO CRUD | Node.js + Vitest (Docker コンテナ: ポート 13306) | 約 3 秒 | `npm run test:mysql` |
| **E2E テスト (単一ファイル)** | 特定画面・機能の E2E スペック単体実行（反復開発用） | Playwright + Chromium (スタンドアロン E2E サーバー) | 約 1.5〜2 秒 | `npm run test:e2e:file -- <path>` |
| **E2E テスト (全件)** | 全画面（12画面）、ユーザー導線、フォーム入力、モーダル、リアルタイム更新 | Playwright + Chromium (スタンドアロン E2E サーバー) | 約 24 秒 | `npm run test:e2e` |
| **総合チェック (DoD)** | サーバー・クライアント並列検証 ＋ E2E テスト全件（全レイヤー完全性保証） | 全レイヤー | 約 30〜40 秒 | `npm run check` |

---

## 2. Vitest 単体テスト基盤

### 2.1 設計原則
- **超高速性の維持**:
  全単体テスト（640+ テストケース、79テストファイル）を 2〜4 秒台で実行完了することを目標としています。テストを高速に保つことで、開発者がコード保存時やコミット前に躊躇なく実行できる環境（`npm run test:watch`）を実現しています。
- **インメモリ SQLite の活用**:
  データベースアクセスを伴うテストでは、ディスク I/O を発生させない `:memory:` 接続（またはテスト専用の一時 DB）を使用し、テスト間で状態が汚染されない完全独立環境を担保しています。
- **本番・開発環境の完全不可侵（DB 分離原則）**:
  テスト実行時、本番およびローカル開発用 DB（`data/database.db`）や設定ファイル（`config/config.yml`）には**絶対にアクセス・変更を行いません**。
- **Web 標準 API の網羅的検証**:
  `authStorage`（`localStorage` ラッパー）、`StrUtil.urlJoin`、`node:util.parseArgs`、組み込み `structuredClone` 等、Node.js / Web 標準 API へ移行した各モジュールの堅牢性を保証するテストを永続配備しています。

### 2.2 クライアント純粋ロジック単体テスト (`test/client/`)
UI コンポーネントに結合させるとテストが重厚化・不安定化しやすい複雑な計算・判定ロジックは、`client/src/lib/utils/` に純粋関数として集約し、Vitest で直接・網羅的に境界値テストを実施します。

- **番組表ロジック (`test/client/guide.test.ts`)**:
  - 朝 4:00 起点の日付境界、深夜帯（0:00〜3:59）の基準日判定（`getBaseDate`）
  - 局名ヘッダー（48px）オフセットを加味した現在時刻線の座標計算
  - スクロール位置計算、タイムライン表示範囲（Unixtime）判定
- **フォーマット処理 (`test/client/format.test.ts`)**:
  - 日時フォーマット、時間差分表記、ファイルサイズ単位変換（MB/GB/TB）
- **HTTP / API クライアント (`test/client/http_client.test.ts`)**:
  - 認証トークン自動付与、クエリパラメータ構築、リードオンリーエラー時の例外ハンドリング

---

## 3. MariaDB / MySQL 実機結合テスト基盤

### 3.1 導入の背景と課題
EPGDeck は SQLite と MySQL / MariaDB のマルチデータベースに対応しています。しかし、SQL 方言（方言別の UPSERT 構文、インデックス生成構文、Auto-Increment の挙動など）の差異は、モックや SQLite 単体テストでは検知できません。

### 3.2 アーキテクチャ
- **非侵入型オプトイン実行**:
  通常の `npm test` では MySQL 結合テストはスキップされ、SQLite による超高速単体テストのみが走ります。`TEST_MYSQL=true` 環境変数が付与された場合のみ実機コンテナへ接続して検証します。
- **ホスト衝突回避ポート (`13306`)**:
  ローカル検証用 `docker-compose.db.yml` では、ホスト標準の MySQL ポート（`3306`）との競合を避けるため、テスト専用ポート `13306` にバインドしています。
- **検証項目**:
  - DDL および `CREATE INDEX IF NOT EXISTS`（MySQL 8.0+ / MariaDB 10.11+）の安全な自動生成
  - `DrizzleHelper` による方言別バルク UPSERT（`ON DUPLICATE KEY UPDATE`）
  - 各種 DAO（ChannelDB, ProgramDB, RecordedDB 等）の CRUD 操作

---

## 4. Playwright E2E テスト基盤

### 4.1 スタンドアロン E2E サーバーアーキテクチャ (`test/e2e/e2e_server.ts`)
CI ランナーや開発環境において、**Mirakurun やチューナーデバイスが存在しない環境でも自律して 100% 稼働する完全隔離 E2E 環境** を構築しています。

- **モックリバインドによる密閉化**:
  InversifyJS DI コンテナを活用し、`IIPCClient` を `MockIPCClient` に、`IMirakurunClientModel` を `MockMirakurunClientModel` に差し替えて起動します。これにより外部サービスへの依存を完全排除しています。
- **完全隔離テストデータベース (`data/test_e2e.db`)**:
  本番用 DB（`data/database.db`）や本番設定ファイル（`config/config.yml`）には一切触れず、テスト専用の SQLite DB および専用ポート（`18889`）で動作します。

### 4.2 ライフサイクルと先行シード方式（レースコンディションの根絶）
Playwright の公式仕様では、**`globalSetup` よりも先に `webServer`（サーバープロセス）が起動** します。
この仕様によるファイルディスクリプタ競合（サーバー起動後に裏で DB ファイルが unlink され、空の DB を参照し続ける問題）を根本防止するため、以下の**先行シードパイプライン（パターン A）** を採用しています：

```typescript
// playwright.config.ts
webServer: {
    command: 'npx tsx test/e2e/seed.ts && npx tsx test/e2e/e2e_server.ts',
    url: process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:18889',
    reuseExistingServer: !process.env.CI,
    timeout: 60000,
}
```

1. **`test/e2e/seed.ts` の先行実行**:
   - 古いテスト DB（`test_e2e.db*`）のクリーンアップ
   - クライアントバンドル（`client/dist`）の存在確認（未ビルド時は自動で `npm --prefix client run build` を実行）
   - 初期シードデータ（NHK総合1、NHK BS 等のチャンネル定義）の投入
   - `client.rawClient.close()` による WAL のフラッシュおよびファイルロック解放
2. **`test/e2e/e2e_server.ts` の起動**:
   - サーバーが立ち上がった瞬間に、すでにシード済みの DB ファイルを正常にオープンし、即座にリクエスト受領可能（Ready）となる。

### 4.3 E2E テストのロケータ設計原則
- **アクセシビリティ要素の優先**:
  `getByRole`、`getByLabel`、`getByPlaceholder` を優先的に使用します。
- **Tailwind クラス依存の排除**:
  CSS クラス（`class="..."`）による取得は、リファクタリングやスタイル調整で極めて壊れやすいため禁止しています。
- **非同期ロード待機**:
  ボタンクリック前に、対象データ（例: `NHK総合1`）が UI 上にレンダリングされていることを `toBeVisible()` で明示的に待機し、ネットワーク揺らぎによるテスト失敗を防止しています。

### 4.4 ブラウザ `<video>` メディアモックとエラーオーバーレイ抑止
動画再生（`/recorded/watch` や `VideoPlayer.svelte`）の E2E テストにおいて、`page.route` で空バッファ（`Buffer.from([])`）をモック返却すると、Chromium ネイティブのメディアデコーダがデコードエラーを発火させます。
これにより Svelte コンポーネント側の `<video onerror={...}>` ➔ `addEventListener('error')` が作動し、UI 前面に「動画の再生に失敗しました」というエラーオーバーレイが被さり、コントロールボタンのクリックが遮断（pointer-events 阻害）されます。

この問題を根本防止するため、以下の**ブラウザ初期化スクリプト（`page.addInitScript`）パターン**を採用します：

```typescript
await page.addInitScript(() => {
    HTMLMediaElement.prototype.play = async () => {};
    HTMLMediaElement.prototype.load = () => {};
    Object.defineProperty(HTMLMediaElement.prototype, 'duration', { get: () => 1800 });
    Object.defineProperty(HTMLMediaElement.prototype, 'readyState', { get: () => 4 });
    const origAdd = HTMLMediaElement.prototype.addEventListener;
    HTMLMediaElement.prototype.addEventListener = function (
        type: string,
        listener: EventListenerOrEventListenerObject,
        options?: boolean | AddEventListenerOptions,
    ) {
        // デコードエラーオーバーレイの発火を抑止し、UIコントロール操作をテスト可能にする
        if (type === 'error') return;
        return origAdd.call(this, type, listener, options);
    };
});
```

### 4.5 フォームバリデーション（HTML5 required vs アプリ側ロジック）の検証
HTML5 の `required` 属性を持つフォーム（例: `ManualReserve.svelte` の番組名入力欄）において、`clear()` による完全な空文字で送信を試みると、ブラウザネイティブの入力要求ポップアップ（吹き出し）が発動して submit イベント自体がキャンセルされます。
そのため、アプリ側（Svelte / TypeScript）の `!name.trim()` やスナックバー通知ロジックまで到達しません。

アプリ側のトリム・バリデーションロジックをテストする場合は、**空白文字（例: `'   '`）を入力してブラウザの `required` を通過させ、アプリ側のバリデーションを発火させる境界値テスト手法**を採用します。

### 4.6 Strict Mode 違反防止とスコープ制限パターン
Playwright は 1 つのロケータに対して複数要素がヒットすると `strict mode violation` でテストを失敗させます。特に以下の構造で発生しやすいため、適切なスコープ制限を行います：

1. **レスポンシブ共存（デスクトップ table とモバイル card の同居）**:
   - PC 画面幅でテーブル行を操作する場合は、必ず `page.locator('table')` や `table.locator('tr')` にスコープを絞る。
2. **モーダル内アクション**:
   - 背景画面とモーダルで「削除」「キャンセル」等のボタンが重複するため、必ず `page.getByRole('dialog')` 内で取得する。
3. **リスト行内の個別アクションボタン**:
   - 親コンテナにも同じテキストが含まれる場合、`page.getByTitle('この動画ファイルのみ削除').first()` や `row.locator(...)` で一意性を担保する。

### 4.7 開発サイクルに応じた実行の使い分け（高速反復 vs 全件保証）
開発の待ち時間を最小化しつつ、他画面へのリグレッションを確実に防止するため、以下の二段階で使い分けます：

1. **UI 実装・試行錯誤中（高速反復）**:
   - `npm run test:e2e:file -- test/e2e/<spec>.spec.ts`
   - 対象スペックファイルのみを実行。ローカル Web サーバーがすでに起動している場合は約 1.5〜2 秒で即座にフィードバックが得られます。
2. **コミット前・作業完了時（DoD / 総合保証）**:
   - `npm run check`（または `npm run test:e2e`）
   - 全 63 シナリオを一括実行し、全画面・全コンポーネントへの意図しない波及（リグレッション）がゼロであることを 100% 保証します。

---

## 5. GitHub Actions CI/CD パイプライン

### 5.1 設計思想: コスト効率と Node.js バージョン互換性検証
クラウド CI（GitHub Actions）の課金体系および仮想マシン起動時間を最小化しつつ、推奨環境（Node.js 24）での完全保証とサポート下限（Node.js 22）での互換性を両立するため、**「Node 24 フル統合ジョブ ＋ Node 22 軽量互換検証ジョブ」の並列構成**を採用しています。

```
GitHub Actions Parallel Jobs
├── [Job 1: Core Verification & E2E (Node 24)] (メイン統合パイプライン)
│     ├── サービスコンテナ起動 (MariaDB 10.11 :3306 & MySQL 8.0 :3307)
│     ├── Lint & フォーマット検証 (Server & Client)
│     ├── 型チェック & Svelte コンパイル & 本番ビルド
│     ├── 単体テスト (SQLite) & DB 実機結合テスト (MariaDB & MySQL)
│     └── Playwright E2E テスト (Chromium / 2ワーカー並列 / 全65シナリオ)
│     ───────────────────────────────────────────────────
│     ★ 所要時間: 約 1分40秒 〜 2分 でオールパス
│
└── [Job 2: Compatibility Check (Node 22)] (下限バージョン互換検証)
      ├── Setup Node.js 22 (キャッシュ復元)
      ├── TypeScript Compile (Server)
      ├── 単体テスト (SQLite)
      └── ESM Interop スモークテスト
      ───────────────────────────────────────────────────
      ★ 所要時間: 約 25〜30 秒 で完了（並列実行のため全体の待ち時間増加ゼロ）
```

### 5.2 主な最適化テクニック
1. **サービスコンテナの並行起動**:
   MariaDB 10.11（ポート 3306）および MySQL 8.0（ポート 3307）をジョブ初期化時に並行起動し、ヘルスチェック完了後にテストを実行。
2. **Playwright ブラウザキャッシュ (`actions/cache@v6`)**:
   `~/.cache/ms-playwright` をコミットハッシュベースでキャッシュし、毎回のブラウザダウンロード時間（約30秒）を完全に排除。キャッシュヒット時の不要な `install-deps` も抑止してオーバーヘッドをゼロ化。
3. **CI 上での Playwright 2 並列実行 (`workers: 2`)**:
   GitHub Actions の `ubuntu-latest`（2 vCPU）を活用し、CI 上でも 2 ワーカー並列でテストを実行。63 シナリオの直列実行による待ち時間を半減（約 30〜35 秒）。
4. **無駄な CI の自動スキップ**:
   - `paths-ignore`: ドキュメント（`docs/**`, `*.md`）変更時は CI を起動せず無料枠を温存。
   - `concurrency`: 同一ブランチへの連続プッシュ時、古い進行中ジョブを自動キャンセル。

---

## 6. 静的解析 & 型検査アーキテクチャ (Static Analysis & Type Integrity)

実行時エラー（特に非同期処理の握りつぶしや unhandledRejection）を未然に防ぎ、長期的な保守性を維持するため、以下の静的解析・型検査基盤を配備しています。

### 6.1 Floating Promise（`await` 漏れ）の完全防止
- **`@typescript-eslint/no-floating-promises: error`**:
  `Promise` を返す関数呼び出しにおいて、`await`、`.catch()`、または `void` 演算子による明示的な無視のいずれも行われていないコード（Floating Promise）を ESLint で厳格にエラーとして検出します。
- **方針**:
  - 順序制御や結果待ちが必要な処理: `await` を付与
  - バックグラウンド実行（Fire-and-forget）で例外ログが必要な処理: `.catch(err => { log.error(err); })` を付与
  - 意図的な非同期起動（キュー投入など、例外が内部で捕捉済みの処理）: `void` を明示

### 6.2 テストコードを含めた網羅的型検査 (`tsconfig.test.json`)
- 通常の `tsconfig.json` は本番ビルド（`dist/` への出力）用として `src/` のみを対象としていますが、テストコード（`test/`）の型整合性を担保するため、`noEmit: true` の `tsconfig.test.json` を配備しています。
- これにより、本番成果物にテストファイルを含めることなく、ESLint（Type-aware rules）および `npm run typecheck`（`tsc -p tsconfig.test.json`）でテストコードやモック実装の型エラーを 100% 検知します。

### 6.3 フロントエンド・バックエンド統一フォーマット
- **Prettier 3 + `prettier-plugin-svelte`**:
  サーバー（TypeScript / JSON / YAML）およびクライアント（Svelte 5 / Tailwind CSS / TypeScript）のフォーマットを統一。
- **CI / Git Hooks 連動**:
  CI パイプライン（`npm run check`）および `lint-staged` によるコミット前フックでフォーマット崩れを自動抑止します。
