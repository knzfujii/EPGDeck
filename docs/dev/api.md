# EPGDeck WebAPI マニュアル

本マニュアルでは、EPGDeck が提供する WebAPI について解説します

## EPGDeck における WebAPI

EPGDeck が提供する WebAPI は [Hono](https://hono.dev/) による RESTful API で、OpenAPI (Swagger) 準拠です  
利用可能な全ての API は **Swagger UI** 上で確認可能です  
`http://<hostname>:<port>/api-docs`

### Swagger UI へのアクセス

| エンドポイント | 説明 |
| :--- | :--- |
| `GET /api-docs` | Swagger UI の HTML を直接提供 |
| `GET /api/docs` | OpenAPI 仕様書（JSON）を提供 |

### API へのアクセス

各 API へのリクエストは `http://<hostname>:<port>/api/` から行います  
ターミナルからは `curl` を用いて確認が可能です

```bash
curl -o - -X {method} -H 'Content-type:{content-type}' http://<hostname>:<port>/api/{api-path}
```

#### Servers 設定

localhost 以外からアクセスする場合は `config.yml` の `server.apiServers` の設定が必要です。

[設定マニュアル](../manual/configuration.md#1-サーバー設定-server) を参照

---

## 認証とリードオンリーモード API (`/api/auth`)

EPGDeck では、リードオンリーモード（閲覧専用モード）有効時に API 呼び出しの認可制御を行っています。

### 認証トークン

管理者パスワード検証が成功すると、HMAC-SHA256 で署名された認証トークンが発行されます。  
API 呼び出し時に以下のいずれかの方法でトークンを渡すことで、管理者権限で実行できます。

1. **Authorization ヘッダー**:
   ```http
   Authorization: Bearer <token>
   ```
2. **クエリパラメータ（ストリーミング・ダウンロード用）**:
   `<video>` タグや `<a>` タグなど、ヘッダー付与が困難な用途向けにクエリパラメータでも受容します。
   ```http
   GET /api/videos/123?token=<token>
   ```

### 認証エンドポイント

#### 1. 管理者モードへのアンロック (`POST /api/auth/unlock`)
パスワードを検証し、有効な認証トークンを発行します。

- **リクエスト**:
  ```json
  {
    "password": "管理者パスワード"
  }
  ```
- **レスポンス (200 OK)**:
  ```json
  {
    "token": "1725800000000.abcdef...",
    "expiresAt": 1728392000000
  }
  ```
- **レスポンス (401 Unauthorized)**:
  パスワードが誤っている場合。
  ```json
  {
    "error": "invalidPassword"
  }
  ```

#### 2. 認証トークンの検証 (`GET /api/auth/status`)
現在保持しているトークンの有効性を確認します（有効期限切れチェックなど）。

- **リクエストヘッダー**: `Authorization: Bearer <token>`
- **レスポンス (200 OK)**:
  ```json
  {
    "unlocked": true,
    "expiresAt": 1728392000000
  }
  ```
  （未認証または無効なトークンの場合は `{ "unlocked": false }`）

#### 3. 明示的ロック (`POST /api/auth/lock`)
管理モードを終了し、閲覧専用に戻すためのエンドポイントです（クライアント側のトークン破棄と連動）。

---

## リードオンリーモード時のエラーレスポンス

リードオンリーモード有効時に、未認証のクライアントから書き込み・変更系 API（`POST`, `PUT`, `DELETE` 等）または未許可の操作を呼び出すと、HTTP 403 Forbidden が返却されます。

```json
{
  "error": "readOnlyMode",
  "message": "This operation is restricted in read-only mode"
}
```

詳細は [設定マニュアル](../manual/configuration.md#11-リードオンリーモード設定-readonly) を参照してください。

---

## エラーハンドリングとレスポンス仕様

EPGDeck の API は、Hono のグローバルエラーハンドラー（`app.onError`）と `resolveApiError` により標準化された JSON エラーレスポンスを返却します。

### エラーレスポンス形式
```json
{
  "code": 409,
  "message": "この番組はすでに予約されています",
  "errors": "ReservationManageModelReservedError"
}
```

- **400 Bad Request**: パラメータ不正、放送終了済み番組の予約など
- **403 Forbidden**: リードオンリーモードによる制限
- **404 Not Found**: 指定リソース（番組・予約・録画・動画ファイル等）の不存在
- **409 Conflict**: 予約重複、競合
- **503 Service Unavailable**: チューナー枯渇・ビジー
- **500 Internal Server Error**: サーバー内部例外

### キャッシュ制御
`/api/*` 配下の JSON レスポンスには、ミドルウェアにより以下のキャッシュ無効化ヘッダーが自動的に付与されます。
- `Cache-Control: private, no-cache, no-store, must-revalidate`
- `Expires: -1`
- `Pragma: no-cache`

---

## リクエストバリデーションと型安全アーキテクチャ

EPGDeck の API ルーティングは、[Zod](https://zod.dev/) と `@hono/zod-validator` を用いた宣言的なスキーマ定義により保護されています。

- **クエリ・パスパラメータの自動検証 & 型変換**:
  - `src/model/service/hono/schemas/` 配下で定義されたスキーマに従い、文字列クエリが安全に数値・真偽値へ型変換（coerce/transform）されます。
  - 不正なパラメータ（数値項目への文字列混入、不正な enum 値など）はハンドラ実行前に即座に HTTP 400 Bad Request として遮断されます。
- **合成型 `ApiRoutesType` のエクスポート**:
  - `src/model/service/hono/apiRoutes.ts` で全 API ルートをチェーン合成し、`ApiRoutesType` をエクスポート。フロントエンドの Hono RPC (`hc`) との型安全な連携基盤を提供します。

---

## 型安全 API クライアント (Hono RPC)

クライアント側（`client/src/lib/apiClient.ts`）では、サーバー側の `ApiRoutesType` を利用した型安全な RPC クライアントを提供しています。

### 特徴
- **完全なエンドツーエンドの型補完**: URL 文字列のハードコードや `any` キャストが不要となり、パスパラメータ・クエリパラメータ・リクエストボディ・レスポンス JSON の型が TypeScript 上で完全に推論されます。
- **認証トークンの自動透過注入**: 独立モジュール `authStorage.ts`（`localStorage` の Bearer トークン）と透過的に統合され、リードオンリーモードのロック解除時にも自動で `Authorization` ヘッダーが付与されます。

### 使用例
```typescript
import api from '@/lib/apiClient';

// GET /api/version (レスポンス型: { version: string })
const res = await api.version.$get();
const data = await res.json();
console.log(data.version);

// GET /api/rules (クエリ型安全。デフォルトで優先度 priority 降順、ID 昇順でソート)
const rulesRes = await api.rules.$get({
    query: {
        limit: 20,
        offset: 0,
    },
});
const rulesData = await rulesRes.json();

// POST /api/reserves (リクエストボディ型安全)
const createRes = await api.reserves.$post({
    json: {
        programId: 12345,
        option: { ... },
    },
});
```

---

## サムネイル API 仕様

| メソッド | パス | 説明 | 主なパラメータ |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/thumbnails/:thumbnailId` | サムネイル画像取得 | 実ファイル不在時は `404 Not Found` |
| `POST` | `/api/thumbnails/videos/:videoFileId` | 指定動画のサムネイル作成・再作成 | クエリまたはボディ: `seconds` (抽出秒数), `replace` (既存サムネ置換フラグ, デフォルト: seconds指定時true) |
| `POST` | `/api/thumbnails/regenerate` | 欠損サムネイルの一括自己修復・再作成 | ファイル不在の壊れたDBレコードを自動削除し再生成 |
| `POST` | `/api/thumbnails/cleanup` | ディスクとDBのサムネイル整合性整理 | - |
| `DELETE` | `/api/thumbnails/:thumbnailId` | サムネイル削除 | ファイルがディスク上に見当たらない場合も正常削除として処理 |

---

## 録画番組重複判定履歴 API (`/api/recorded/:recordedId/history`)

二重録画防止（重複判定）の対象から特定録画番組を除外・追加するための API です。

| メソッド | パス | 説明 | レスポンス |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/recorded/:recordedId/history` | 指定録画番組が重複判定履歴（`recorded_history`）に存在するか確認 | `{ "hasHistory": boolean }` |
| `DELETE` | `/api/recorded/:recordedId/history` | 指定録画番組を重複判定履歴から削除し、予約を即座に再評価 | `{ "code": 200 }` |
| `POST` | `/api/recorded/:recordedId/history` | 指定録画番組を重複判定履歴に登録し、予約を即座に再評価 | `{ "code": 200 }` |



