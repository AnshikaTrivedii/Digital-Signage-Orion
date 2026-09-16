#!/usr/bin/env bash
# Amplify Hosting Compute copies apps/web/node_modules/next into /tmp/app.
# npm workspaces often leave that path as a symlink into the repo-root store, so the
# bundled package.json exists but dist/server/next.js does not. Replace those links
# with real files before Amplify packages the compute bundle.
set -euo pipefail

ROOT="${CODEBUILD_SRC_DIR:-}"
if [[ -z "$ROOT" || ! -f "$ROOT/package.json" ]]; then
  ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
fi
WEB="$ROOT/apps/web"

materialize_pkg() {
  local pkg="$1"
  local dest="$WEB/node_modules/$pkg"
  local src src_real dest_real tmp
  src="$(cd "$WEB" && node -p "require('path').dirname(require.resolve('$pkg/package.json'))")"
  src_real="$(cd "$src" && pwd)"
  mkdir -p "$WEB/node_modules"
  dest_real="$(cd "$dest" 2>/dev/null && pwd || true)"
  if [[ -d "$dest" && ! -L "$dest" && "$dest_real" == "$src_real" ]]; then
    dereference_links "$dest"
    return
  fi
  tmp="$(mktemp -d)"
  cp -a "$src_real" "$tmp/pkg"
  rm -rf "$dest"
  mv "$tmp/pkg" "$dest"
  rmdir "$tmp" 2>/dev/null || rm -rf "$tmp"
}

dereference_links() {
  local dir="$1"
  [[ -d "$dir" ]] || return 0
  find "$dir" -type l -print0 | while IFS= read -r -d '' link; do
    local target
    target="$(readlink -f "$link" || true)"
    if [[ -n "$target" && -e "$target" ]]; then
      rm "$link"
      cp -a "$target" "$link"
    fi
  done
}

copy_next() {
  local dest_parent="$1"
  mkdir -p "$dest_parent"
  rm -rf "$dest_parent/next"
  cp -a "$WEB/node_modules/next" "$dest_parent/next"
}

phase="${1:-all}"

if [[ "$phase" == "pre" || "$phase" == "all" ]]; then
  materialize_pkg next
  dereference_links "$WEB/node_modules/next"
  test -f "$WEB/node_modules/next/dist/server/next.js"
  echo "Materialized next at $WEB/node_modules/next"
fi

if [[ "$phase" == "post" || "$phase" == "all" ]]; then
  dereference_links "$WEB/.next/node_modules"
  STANDALONE="$WEB/.next/standalone"
  if [[ -d "$STANDALONE/apps/web" ]]; then
    mkdir -p "$STANDALONE/apps/web/.next" "$STANDALONE/node_modules" "$STANDALONE/apps/web/node_modules"
    cp -a "$WEB/public" "$STANDALONE/apps/web/public"
    cp -a "$WEB/.next/static" "$STANDALONE/apps/web/.next/static"
    copy_next "$STANDALONE/node_modules"
    copy_next "$STANDALONE/apps/web/node_modules"
  elif [[ -d "$STANDALONE" ]]; then
    mkdir -p "$STANDALONE/.next" "$STANDALONE/node_modules"
    cp -a "$WEB/public" "$STANDALONE/public"
    cp -a "$WEB/.next/static" "$STANDALONE/.next/static"
    copy_next "$STANDALONE/node_modules"
  fi
  test -f "$WEB/node_modules/next/dist/server/next.js"
  echo "Prepared Amplify compute next bundle"
fi
