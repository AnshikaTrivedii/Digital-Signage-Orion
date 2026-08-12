#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# Local dev: fall back to DATABASE_URL when DIRECT_URL is unset.
export DIRECT_URL="${DIRECT_URL:-${DATABASE_URL:-}}"

if [[ -z "${DIRECT_URL:-}" ]]; then
  echo "ERROR: DATABASE_URL (and DIRECT_URL for Supabase) must be set." >&2
  exit 1
fi

if [[ "${DATABASE_URL:-}" == *"pooler.supabase.com"* && "${DIRECT_URL}" == *"pooler.supabase.com"* ]]; then
  echo "ERROR: Set DIRECT_URL to Supabase direct connection (db.<ref>.supabase.co)." >&2
  echo "       Migrations cannot run through pooler.supabase.com." >&2
  echo "       Or run scripts/supabase-recover-scheduling.sql in Supabase SQL Editor." >&2
  exit 1
fi

MIGRATE_DATABASE_URL="${DIRECT_URL:-${DATABASE_URL:-}}"

run_migrate_deploy() {
  DATABASE_URL="$MIGRATE_DATABASE_URL" npx prisma migrate deploy
}

echo "Running database migrations..."
set +e
migrate_output="$(DATABASE_URL="$MIGRATE_DATABASE_URL" npx prisma migrate deploy 2>&1)"
migrate_status=$?
set -e
echo "$migrate_output"

if [[ "$migrate_status" -ne 0 ]]; then
  if echo "$migrate_output" | grep -qE 'P3009|20260811160000_scheduling_module'; then
    echo ""
    echo "==> Recovering failed scheduling migration and retrying..."
    DATABASE_URL="$MIGRATE_DATABASE_URL" npx prisma migrate resolve --rolled-back 20260811160000_scheduling_module
    run_migrate_deploy
  else
    exit "$migrate_status"
  fi
fi

echo "Running database seed..."
npx prisma db seed

echo "Starting Orion API..."
exec node apps/api/dist/main.js
