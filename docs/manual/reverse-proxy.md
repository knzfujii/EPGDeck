# nginx を利用したリバースプロキシの動作設定

nginx を利用したリバースプロキシにて EPGDeck を動かす場合の設定について解説します。

## 1. config.yml の設定

EPGDeck では Web API と Socket.IO が同一ポートで統合動作するため、特別なポート分岐設定は不要です。

```yaml
server:
  port: 8888
  # サブディレクトリ配下で運用する場合（例: http://example.com/epgdeck/）
  # subDirectory: /epgdeck/
```

## nginx 設定

下記の通り、リバースプロキシの設定を行います。  
※`localhost`は適宜変更してください。

```
map $http_upgrade $connection_upgrade {
    default upgrade;
    ''      close;
}

server{
    listen 80;

    add_header X-Frame-Options SAMEORIGIN;
    add_header X-Content-Type-Options nosniff;
    add_header X-XSS-Protection "1; mode=block";
    etag off;

    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-Host $host;
    proxy_set_header X-Forwarded-Server $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;

    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection $connection_upgrade;

    location / {
        proxy_pass http://localhost:8888/;
    }
}
```
