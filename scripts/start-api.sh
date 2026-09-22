#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# Local dev: fall back to DATABASE_URL when DIRECT_URL is unset. Despite the
# legacy name, DIRECT_URL is the connection used specifically for migrations.
# On IPv4-only hosts such as Render, use Supabase's *Session* pooler (port
# 5432); the direct db.<ref>.supabase.co endpoint is IPv6-only unless the
# Supabase IPv4 add-on is enabled.
export DIRECT_URL="${DIRECT_URL:-${DATABASE_URL:-}}"

if [[ -z "${DIRECT_URL:-}" ]]; then
  echo "ERROR: DATABASE_URL (and DIRECT_URL for Supabase) must be set." >&2
  exit 1
fi

if [[ "${DIRECT_URL}" == *"pooler.supabase.com:6543/"* ]]; then
  echo "ERROR: DIRECT_URL must not use Supabase's transaction pooler (port 6543)." >&2
  echo "       Use the direct connection, or Supavisor Session pooler (port 5432) on Render." >&2
  exit 1
fi

MIGRATE_DATABASE_URL="${DIRECT_URL:-${DATABASE_URL:-}}"

run_migrate_deploy() {
  DATABASE_URL="$MIGRATE_DATABASE_URL" npx prisma migrate deploy
}

# Prisma P3009: "The `NAME` migration started at TIMESTAMP UTC failed"
failed_migration_name() {
  echo "$1" | sed -n 's/.*The `\([^`]*\)` migration started at.*/\1/p' | tail -1
}

resolve_rolled_back() {
  DATABASE_URL="$MIGRATE_DATABASE_URL" npx prisma migrate resolve --rolled-back "$1"
}

echo "Running database migrations..."
set +e
migrate_output="$(DATABASE_URL="$MIGRATE_DATABASE_URL" npx prisma migrate deploy 2>&1)"
migrate_status=$?
set -e
echo "$migrate_output"

if [[ "$migrate_status" -ne 0 ]]; then
  failed_migration="$(failed_migration_name "$migrate_output")"

  if [[ "$failed_migration" == "20260811160000_scheduling_module" ]]; then
    echo ""
    echo "==> Recovering failed scheduling migration and retrying..."
    resolve_rolled_back "$failed_migration"
    run_migrate_deploy
  elif [[ -n "$failed_migration" && ! -d "prisma/migrations/${failed_migration}" ]]; then
    # Production can retain a failed row for a migration that is no longer in
    # this build (e.g. 20260915120000_partition_proof_of_play_logs). That P3009
    # must not be treated as a scheduling rollback — that migration is applied
    # and resolve --rolled-back then fails with P3012.
    echo ""
    echo "==> Clearing failed migration '${failed_migration}' (not in this build) and retrying..."
    resolve_rolled_back "$failed_migration"
    run_migrate_deploy
  else
    exit "$migrate_status"
  fi
fi

echo "Running database seed..."
npx prisma db seed

echo "Starting Orion API..."
exec node apps/api/dist/main.js
