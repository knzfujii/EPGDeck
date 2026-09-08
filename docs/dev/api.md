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
