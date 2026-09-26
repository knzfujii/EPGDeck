#!/usr/bin/env bash
# ==============================================================================
# EPGDeck Worktree Setup & Symlink Helper
#
# Usage:
#   ./misc/worktree.sh <branch-name> [target-path] [options]
#   ./misc/worktree.sh --link-only <target-path> [options]
# ==============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MAIN_REPO_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

# デフォルト設定
BASE_BRANCH="main"
LINK_ONLY=false
LINK_MODULES=false
BRANCH_NAME=""
TARGET_DIR=""

print_usage() {
    cat <<EOF
Usage:
  $(basename "$0") <branch-name> [target-path] [options]
  $(basename "$0") --link-only <target-path> [options]

Arguments:
  <branch-name>     Name of the git branch to create or checkout.
  [target-path]     Destination path for the worktree.
                    (Default: ../EPGDeck-<branch-suffix>)

Options:
  -b, --base <branch>    Base branch to branch off from (default: main).
  -l, --link-only        Skip git worktree creation, only create/update symlinks.
  -m, --link-modules     Also symlink root and client node_modules from main repo.
  -h, --help             Show this help message.

Examples:
  # Create a worktree for refactor/style at ../EPGDeck-style and link data
  $(basename "$0") refactor/style

  # Create a worktree with custom path
  $(basename "$0") feat/new-feature ../EPGDeck-feature

  # Re-apply or update symlinks on an existing worktree
  $(basename "$0") --link-only ../EPGDeck-style

  # Re-apply symlinks and also link node_modules
  $(basename "$0") --link-only ../EPGDeck-style --link-modules
EOF
}

# 引数パース
while [[ $# -gt 0 ]]; do
    case "$1" in
        -h|--help)
            print_usage
            exit 0
            ;;
        -l|--link-only)
            LINK_ONLY=true
            shift
            ;;
        -m|--link-modules)
            LINK_MODULES=true
            shift
            ;;
        -b|--base)
            BASE_BRANCH="$2"
            shift 2
            ;;
        -*)
            echo "Error: Unknown option $1" >&2
            print_usage
            exit 1
            ;;
        *)
            if [ -z "${BRANCH_NAME}" ] && [ "${LINK_ONLY}" = false ]; then
                BRANCH_NAME="$1"
            elif [ -z "${TARGET_DIR}" ]; then
                TARGET_DIR="$1"
            else
                echo "Error: Unexpected argument $1" >&2
                print_usage
                exit 1
            fi
            shift
            ;;
    esac
done

# link-only モードでブランチ名が指定されず第1引数が TARGET_DIR に入る場合のハンドリング
if [ "${LINK_ONLY}" = true ] && [ -z "${TARGET_DIR}" ] && [ -n "${BRANCH_NAME}" ]; then
    TARGET_DIR="${BRANCH_NAME}"
    BRANCH_NAME=""
fi

if [ "${LINK_ONLY}" = false ] && [ -z "${BRANCH_NAME}" ]; then
    echo "Error: <branch-name> is required unless --link-only is specified." >&2
    print_usage
    exit 1
fi

# TARGET_DIR が未指定の場合のデフォルト決定
if [ -z "${TARGET_DIR}" ]; then
    # ブランチ名のプレフィックス（feat/, fix/, refactor/ 等）から末尾の名前を抽出
    CLEAN_NAME="${BRANCH_NAME##*/}"
    TARGET_DIR="../EPGDeck-${CLEAN_NAME}"
fi

# 絶対パスに変換
TARGET_DIR_ABS="$(cd "$(dirname "${TARGET_DIR}")" 2>/dev/null && pwd)/$(basename "${TARGET_DIR}")" || TARGET_DIR_ABS="${TARGET_DIR}"

echo "========================================================"
echo " EPGDeck Worktree Setup"
echo " Main Repo:   ${MAIN_REPO_DIR}"
echo " Target Dir:  ${TARGET_DIR_ABS}"
if [ "${LINK_ONLY}" = false ]; then
    echo " Branch:      ${BRANCH_NAME} (base: ${BASE_BRANCH})"
fi
echo " Link Modules: ${LINK_MODULES}"
echo "========================================================"

# 1. Worktree 作成（link-only 以外）
if [ "${LINK_ONLY}" = false ]; then
    if git -C "${MAIN_REPO_DIR}" worktree list | grep -Fq "${TARGET_DIR_ABS}"; then
        echo "[Info] Worktree already exists at ${TARGET_DIR_ABS}. Proceeding to symlinks."
    elif [ -d "${TARGET_DIR_ABS}" ]; then
        echo "[Warn] Directory ${TARGET_DIR_ABS} exists but is not registered as a worktree."
        echo "       Skipping worktree add and proceeding to symlinks."
    else
        echo "[1/2] Creating git worktree..."
        # ローカルまたはリモートにブランチが既に存在するか確認
        if git -C "${MAIN_REPO_DIR}" show-ref --verify --quiet "refs/heads/${BRANCH_NAME}"; then
            git -C "${MAIN_REPO_DIR}" worktree add "${TARGET_DIR_ABS}" "${BRANCH_NAME}"
        elif git -C "${MAIN_REPO_DIR}" show-ref --verify --quiet "refs/remotes/origin/${BRANCH_NAME}"; then
            git -C "${MAIN_REPO_DIR}" worktree add --track -b "${BRANCH_NAME}" "${TARGET_DIR_ABS}" "origin/${BRANCH_NAME}"
        else
            git -C "${MAIN_REPO_DIR}" worktree add -b "${BRANCH_NAME}" "${TARGET_DIR_ABS}" "${BASE_BRANCH}"
        fi
    fi
else
    if [ ! -d "${TARGET_DIR_ABS}" ]; then
        echo "Error: Target directory ${TARGET_DIR_ABS} does not exist." >&2
        exit 1
    fi
fi

# 2. シンボリックリンクの作成・更新
echo "[2/2] Setting up symlinks for data and configuration..."

# 2.1 config/
mkdir -p "${TARGET_DIR_ABS}/config"
if [ -f "${MAIN_REPO_DIR}/config/config.yml" ]; then
    ln -sf "${MAIN_REPO_DIR}/config/config.yml" "${TARGET_DIR_ABS}/config/config.yml"
    echo "  - config/config.yml linked"
fi

for script in "${MAIN_REPO_DIR}"/config/enc*.js; do
    if [ -f "${script}" ]; then
        base="$(basename "${script}")"
        # テンプレートファイルおよび追跡対象の enc_helper.js は除外
        if [[ "${base}" != *.template ]] && [ "${base}" != "enc_helper.js" ]; then
            ln -sf "${script}" "${TARGET_DIR_ABS}/config/${base}"
            echo "  - config/${base} linked"
        fi
    fi
done

# 2.2 data/ (フォールバック: config.yml で database.path が未指定の場合のレガシー共有)
mkdir -p "${TARGET_DIR_ABS}/data"
for dbfile in "${MAIN_REPO_DIR}"/data/database.db*; do
    if [ -e "${dbfile}" ]; then
        base="$(basename "${dbfile}")"
        ln -sf "${dbfile}" "${TARGET_DIR_ABS}/data/${base}"
        echo "  - data/${base} linked (legacy fallback)"
    fi
done

# 2.3 ストレージパスに関する案内
# 注意: config.yml で外部ストレージ（epgdeck-storage 等）が指定されている場合、個別のディレクトリ操作や symlink は不要です。
echo "  - storage paths (recorded, thumbnail, db) are managed by config/config.yml"

# 2.5 node_modules（オプション）
if [ "${LINK_MODULES}" = true ]; then
    echo "  - Linking node_modules..."
    if [ -d "${MAIN_REPO_DIR}/node_modules" ]; then
        ln -sfn "${MAIN_REPO_DIR}/node_modules" "${TARGET_DIR_ABS}/node_modules"
        echo "    * root node_modules linked"
    fi
    if [ -d "${MAIN_REPO_DIR}/client/node_modules" ]; then
        mkdir -p "${TARGET_DIR_ABS}/client"
        ln -sfn "${MAIN_REPO_DIR}/client/node_modules" "${TARGET_DIR_ABS}/client/node_modules"
        echo "    * client/node_modules linked"
    fi
fi

echo "========================================================"
echo " Setup complete!"
echo " Target: ${TARGET_DIR_ABS}"
echo ""
echo " [Note]"
echo " * Database and server port are shared with main."
echo " * Please stop the main server before starting the worktree server."
if [ "${LINK_MODULES}" = false ]; then
    echo " * If node_modules are not linked, run:"
    echo "     cd ${TARGET_DIR_ABS} && mise exec -- npm install"
fi
echo "========================================================"
