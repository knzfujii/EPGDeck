---
name: epgdeck-release
description: >-
  EPGDeck のバージョンアップ・リリースフローを安全かつ確実に遂行するための公式スキル。
  直前タグからの git log 差分抽出、CHANGELOG.md 自動起草、ローカル docker build 先行検証、
  リリース PR 作成、main マージ後のタグ打鍵、GitHub Release 作成までを一気通貫でガイド・実行する。
---

# EPGDeck リリースワークフロースキル (epgdeck-release)

本スキルは、EPGDeck におけるバージョンアップから GitHub Release 公開までの作業を、人為的ミスや手戻りなく安全に遂行するための標準手順書である。

---

## 1. リリースプロセスの全体原則

1. **日常開発とリリース準備の厳格な分離**:
   - 日常の機能追加やバグ修正 PR では `package.json` のバージョン変更や `CHANGELOG.md` の編集を行わない。
   - バージョンアップは必ず独立したリリースブランチ（`chore/release-vX.Y.Z`）で行う。
2. **CHANGELOG の「前タグからの純粋差分」原則**:
   - `CHANGELOG.md` には、直前のリリースタグ以降に `main` にマージされた純粋なプロダクト差分のみを記載する。
   - ブランチ内での試行錯誤や過渡的バグの修正は `Fixed` に含めず、機能の `Added` や仕様改善に統合する。
3. **二段階検証（ローカル先行 ＋ リモート PR）**:
   - リリース PR 作成前に、必ずローカルで `docker build` および `npm run check:quick` を先行実行する。
   - タグ push 後の CI 失敗によるタグ削除・再作成という最悪の手戻りを未然に防止する。
4. **タグ打鍵時の待ち時間ゼロ**:
   - タグは「すでに `main` で全検証が完了したコミット」に対してのみ打鍵する。
   - タグ push 時に重複したテストやビルドは実行せず、即座に GitHub Release を公開する。

---

## 2. リリース実行手順（ステップ・バイ・ステップ）

### ステップ 1: リリースブランチの作成と差分抽出

```bash
# 1. 最新の main を取得
git checkout main
git pull origin main

# 2. 直前のリリースタグを確認
PREV_TAG=$(git describe --tags --abbrev=0)
echo "直前タグ: $PREV_TAG"

# 3. 直前タグからのコミット一覧を確認
git log ${PREV_TAG}..HEAD --oneline

# 4. リリース専用ブランチを作成
git checkout -b chore/release-v<NEW_VERSION>
```

### ステップ 2: CHANGELOG.md の起草 & バージョン更新

1. **`package.json` の更新**:
   - ルート `package.json` の `"version"` を新バージョン（例: `0.2.0-beta.2`）に更新。
   - （`client/package.json` も同期）。
2. **`CHANGELOG.md` の更新**:
   - コミットログを分析し、以下のカテゴリに分類して最上部に追記する：
     - `### Added`: 新機能・新画面・新 API
     - `### Changed`: 仕様変更・リファクタ・パフォーマンス改善
     - `### Fixed`: 前バージョンから存在していた不具合の解消
     - `### Documentation`: ドキュメント・ガイドラインの改定
   - 日付は JST 基準（`YYYY-MM-DD`）。

### ステップ 3: ローカル安全装置の先行確認

リリース PR を作成する前に、以下のコマンドをローカルで順次実行し、100% 合格することを確認する：

```bash
# 1. 高速チェック（型検査、単体テスト、構文検査）
mise exec -- npm run check:quick

# 2. Docker ビルド先行検証
docker build -t epgdeck:release-check .

# 3. 検証用コンテナイメージのクリーンアップ
docker rmi epgdeck:release-check
```

### ステップ 4: リリース PR の作成とマージ

```bash
# 1. 変更をステージング & フォーマット
mise exec -- npm run format
git add package.json client/package.json CHANGELOG.md
git commit -m "chore(release): bump version to <NEW_VERSION>"
git push -u origin chore/release-v<NEW_VERSION>

# 2. PR を作成
gh pr create --title "chore(release): bump version to <NEW_VERSION>" \
  --body "## 概要\nバージョン <NEW_VERSION> のリリース準備\n\n## 変更点\nCHANGELOG.md 参照"

# 3. PR 上の GitHub Actions CI（全テスト & Docker ビルドチェック）の完了を待機
gh pr checks <PR_NUMBER> --watch

# 4. ユーザー承認を得た上で Rebase and Merge を実行
gh pr merge <PR_NUMBER> --rebase --delete-branch
```

### ステップ 5: main へのタグ打鍵 & GitHub Release 公開

マージが完了したら、`main` のマージコミットに対してタグを打ち、リリースノートを公開する：

```bash
# 1. ローカル main を最新化
git checkout main
git pull origin main

# 2. タグを打鍵してリモートへ push
git tag v<NEW_VERSION>
git push origin v<NEW_VERSION>

# 3. CHANGELOG.md から該当バージョンの内容を抽出して GitHub Release を作成
# （-beta, -rc の場合は --prerelease を付与）
gh release create v<NEW_VERSION> \
  --title "v<NEW_VERSION>" \
  --notes "$(cat CHANGELOG_SECTION.md)" \
  [--prerelease]
```

---

## 3. トラブルシューティング & 地雷回避チェックリスト

- [ ] **Docker ビルドが通らない**:
  - `packages/*` 内の `package.json` に `"private": true` が付いているか？
  - `packages/*` に不要な `"prepare"` スクリプトが残っていないか？
  - `Dockerfile` の builder / runner 両ステージにパスが定義されているか？
- [ ] **CHANGELOG に余計な作業履歴が混入している**:
  - ブランチ内で作ったがすぐ直した過渡的バグを `Fixed` に書いていないか？（直前タグとの純粋な差分だけを残す）
- [ ] **タグ打鍵対象のコミットがずれている**:
  - 必ず `main` にマージされた後の最新コミット（HEAD）に対してタグを打っているか？
