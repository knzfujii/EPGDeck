# EPGDeck コントリビューションガイド (Contributing Guide)

EPGDeck プロジェクトへのご関心および貢献をご検討いただき、誠にありがとうございます！  
バグ報告、新機能の提案、ドキュメントの改善、プルリクエスト（PR）の提出など、あらゆるコントリビューションを心より歓迎します。

---

## 1. 基本姿勢・開発ポリシー

- **モダンで自立したアーキテクチャの追求**:
  - EPGDeck は EPGStation からフォークして開発がスタートしましたが、現在は Hono + Drizzle ORM、Svelte 5 Runes + Tailwind CSS v4 により全面的に刷新された独立したプロダクトです。過去の実装に過度に縛られず、現代的な設計とクリーンなコードを重視します。
- **データ移行互換性の維持**:
  - 既存の EPGStation（v2.10.0）のデータベース（SQLite / MySQL）からスムーズに移行して使い始められる互換性を担保します。
- **事実とエビデンスに基づく検証**:
  - 表層的な文字面の一致だけでなく、実機での動作や自動テストの裏付けを重視します。

---

## 2. 開発環境のセットアップ

### 前提条件
- **Node.js**: `v24.x` 推奨（サポート: `^22.3.0 ~ v26.x`）
- **mise** (推奨バージョンマネージャー):
  リポジトリ内に `mise.toml` を同梱しているため、`mise install` で自動的に適切な Node.js がセットアップされます。
- **Mirakurun** または **mirakc**:
  番組表取得や録画テストを行う場合は稼働中のチューナーサーバーが必要です。

### リポジトリのクローンとインストール
```bash
git clone https://github.com/knzfujii/EPGDeck.git
cd EPGDeck

# サーバーおよびクライアントの依存パッケージを一括インストール
npm run all-install
```

### 開発用設定ファイルの準備
同一ホスト上で本番サーバーが稼働している場合のポート競合を防ぐため、開発専用設定を作成します。
```bash
cp config/config.yml.template config/config.yml
# config/config.yml のポート（server.port）を 8889 等に変更
```

### 開発サーバーの起動
```bash
# サーバー（TypeScript 自動コンパイル & 再起動）とクライアント（Vite 自動差分ビルド）を同時起動
npm run dev
```

---

## 3. ブランチ戦略 (GitHub Flow)

EPGDeck では、**GitHub Flow** を採用しています。

- **`main` ブランチ**: 常にデプロイ可能で安定したプロダクションブランチです。`main` への直接 push は禁止されています。
- **トピックブランチ**: すべての変更は `main` から分岐したトピックブランチで作業し、Pull Request を通じてマージします。
  - 新機能: `feat/feature-name`
  - バグ修正: `fix/bug-description`
  - ドキュメント: `docs/doc-topic`
  - ツール・依存関係: `chore/tool-update`

---

## 4. コミットメッセージ規約

コミットメッセージは、[Conventional Commits](https://www.conventionalcommits.org/ja/) 形式に従ってください。

```text
<type>(<scope>): <description>

[optional body]
```

### Type 一覧
- `feat`: 新機能の追加
- `fix`: バグ修正
- `docs`: ドキュメントのみの変更
- `style`: コードの動作に影響しないフォーマット・空白修正
- `refactor`: バグ修正や機能追加を含まないコードのリファクタリング
- `perf`: パフォーマンス改善
- `test`: テストコードの追加・修正
- `chore`: ビルド設定、ツールチェーン、依存関係の更新など

---

## 5. 品質保証 & テスト戦略（二段階検証）

ローカルの作業テンポを損なわずに確実な品質を担保するため、**二段階の検証プロトコル**を採用しています。

### ① ローカルコミット前（高速検証・DoD）
コミット前には必ずコードを整形し、高速品質チェックを実行してください。所要時間は約 2〜3 秒です。
```bash
# 1. コードの自動フォーマット
npm run format

# 2. 高速品質チェック (型チェック + 単体テスト + クライアント構文チェック)
npm run check:quick
```
※ 画面改修時に直接挙動を確認したい場合は、対象スペック単体（`npm run test:e2e:file -- <spec-path>`、約 1.5 秒）を実行できます。

### ② リモート PR / CI（総合 E2E 検証）
- PR を作成・更新すると、GitHub Actions CI が自動トリガーされ、**Playwright E2E テスト全 69 件**、MariaDB/MySQL 実機結合テスト、Node 22 互換性テストがクラウド上で並列実行されます。
- すべての CI チェックが PASS していることが `main` へのマージ条件となります。

---

## 6. バグ報告 & 機能提案 (Issue)

- バグの報告は [Bug Report Issue Form](https://github.com/knzfujii/EPGDeck/issues/new?template=1_bug_report.yml) より、環境情報や再現手順を添えてご報告ください。
- 新機能の提案は [Feature Request Issue Form](https://github.com/knzfujii/EPGDeck/issues/new?template=2_feature_request.yml) より、ユースケースや課題背景を添えてご提案ください。
- 質問やセットアップの相談は [GitHub Discussions](https://github.com/knzfujii/EPGDeck/discussions) をご利用ください。

---

## 7. プルリクエスト（PR）の提出

1. 最新の `main` からトピックブランチを作成します。
2. 変更を実装し、対応するテスト（単体テストまたは E2E スペック）を追加・更新します。
3. `npm run format` でコードを整形し、`npm run check:quick` がエラー 0 で PASS することを確認します。
4. 変更内容に応じてドキュメント（`docs/`、`README.md`）を更新します。
5. GitHub 上で PR を作成し、[PR テンプレート](PULL_REQUEST_TEMPLATE.md) の各項目とセルフチェックリストを記入して提出してください。
