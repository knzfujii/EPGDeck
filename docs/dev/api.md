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
