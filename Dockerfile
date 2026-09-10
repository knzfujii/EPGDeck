# ==========================================
# 1. ビルド用ステージ (Builder)
# ==========================================
FROM node:22-bookworm-slim AS builder

WORKDIR /app

# パッケージインストール用のファイル
COPY package.json package-lock.json ./
COPY client/package.json client/package-lock.json ./client/

# 全依存関係インストール（devDependencies含む）
RUN npm ci && cd client && npm ci

# ソースコードのコピー
COPY . .

# サーバーおよびクライアントのビルド
RUN npm run compile && cd client && npm run build

# 本番用依存関係のみを残す
RUN npm prune --production && cd client && npm prune --production


# ==========================================
# 2. 本番ランタイムステージ (Runner)
# ==========================================
FROM node:22-bookworm-slim AS runner

# 必要なシステムパッケージのインストール
# - tini: PID 1 でのゾンビプロセス回収とシグナル中継
# - ffmpeg: 配信・エンコード・サムネイル生成
# - ca-certificates, curl: 通信・ヘルスチェック用
RUN apt-get update && apt-get install -y --no-install-recommends \
    tini \
    ffmpeg \
    ca-certificates \
    curl \
    && rm -rf /var/lib/apt/lists/*

LABEL maintainer="knzfujii"
WORKDIR /app
ENV NODE_ENV=production

# ビルド成果物と依存モジュールのコピー
COPY --from=builder /app/package.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/client/dist ./client/dist
COPY --from=builder /app/api.yml ./
COPY --from=builder /app/config ./config

# アプリケーション用ディレクトリの作成
RUN mkdir -p /app/recorded /app/thumbnail /app/logs /app/data && \
    chown -R node:node /app

# デフォルトで一般ユーザー（node: UID 1000）で実行
USER node

# ポート番号（デフォルト 8888）
EXPOSE 8888

# ヘルスチェック
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:8888/api/version || exit 1

# tini を init プロセス（PID 1）として使用し、ゾンビプロセス防止とシグナル中継を保証
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "--enable-source-maps", "dist/index.js"]

