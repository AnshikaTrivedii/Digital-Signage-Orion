#!/usr/bin/env bash
# One-time recovery for production P3009 on 20260811160000_scheduling_module.
#
# Prerequisites (Render / Supabase):
#   DATABASE_URL  = application connection URL
#   DIRECT_URL    = migration connection URL. On Render, use Supabase's Session
#                   pooler URI (pooler.supabase.com:5432), since the direct
#                   db.<ref>.supabase.co endpoint is IPv6-only by default.
#
# Usage (from repo root, with production env vars exported or in .env):
#   bash scripts/recover-scheduling-migration.sh
#
# What it does:
#   1. Clears the failed migration record (marks it rolled back)
#   2. Re-runs migrate deploy using DIRECT_URL (idempotent migration SQL)
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

export DIRECT_URL="${DIRECT_URL:-${DATABASE_URL:-}}"

if [[ -z "${DIRECT_URL:-}" ]]; then
  echo "ERROR: Set DIRECT_URL (Supabase direct connection) or DATABASE_URL." >&2
  exit 1
fi

if [[ "${DIRECT_URL}" == *"pooler.supabase.com:6543/"* ]]; then
  echo "ERROR: DIRECT_URL must not use Supabase's transaction pooler (port 6543)." >&2
  echo "       Use the direct connection, or Supavisor Session pooler (port 5432) on Render." >&2
  exit 1
fi

echo "==> Marking failed migration as rolled back..."
npx prisma migrate resolve --rolled-back 20260811160000_scheduling_module

echo "==> Re-applying migrations via direct connection..."
MIGRATE_DATABASE_URL="${DIRECT_URL:-${DATABASE_URL:-}}"
DATABASE_URL="$MIGRATE_DATABASE_URL" npx prisma migrate deploy

echo "==> Done. Redeploy Render or restart the API."
