#!/usr/bin/env bash
# One-time recovery for production P3009 on 20260811160000_scheduling_module.
#
# Prerequisites (Render / Supabase):
#   DATABASE_URL  = pooler URL (for the running app)
#   DIRECT_URL    = direct Postgres URL (db.<ref>.supabase.co — NOT pooler)
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

if [[ "${DATABASE_URL:-}" == *"pooler.supabase.com"* && "${DIRECT_URL}" == *"pooler.supabase.com"* ]]; then
  echo "ERROR: DIRECT_URL must be the Supabase *direct* connection (db.<ref>.supabase.co)," >&2
  echo "       not the pooler (pooler.supabase.com). See Supabase → Settings → Database." >&2
  exit 1
fi

echo "==> Marking failed migration as rolled back..."
npx prisma migrate resolve --rolled-back 20260811160000_scheduling_module

echo "==> Re-applying migrations via direct connection..."
npx prisma migrate deploy

echo "==> Done. Redeploy Render or restart the API."
