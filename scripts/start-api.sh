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

# Prisma P3009 names the failed row in `_prisma_migrations`, e.g.
#   The `20260915120000_partition_proof_of_play_logs` migration started at ... failed
failed_migration_from_p3009() {
  echo "$1" | sed -n 's/.*The `\([0-9]\{14\}_[A-Za-z0-9_]*\)` migration started at .* failed.*/\1/p' | head -n 1
}

mark_migration_rolled_back() {
  local name="$1"
  if [[ ! "$name" =~ ^[0-9]{14}_[A-Za-z0-9_]+$ ]]; then
    echo "ERROR: refusing to resolve unexpected migration name: $name" >&2
    return 1
  fi

  set +e
  DATABASE_URL="$MIGRATE_DATABASE_URL" npx prisma migrate resolve --rolled-back "$name"
  local resolve_status=$?
  set -e
  if [[ "$resolve_status" -eq 0 ]]; then
    return 0
  fi

  # `migrate resolve` needs the migration folder. A failed row from another
  # branch (e.g. main's partition migration while deploying dev) is only in
  # the database, so clear it directly.
  echo "==> prisma migrate resolve could not clear ${name}; updating _prisma_migrations"
  DATABASE_URL="$MIGRATE_DATABASE_URL" npx prisma db execute --stdin --url="$MIGRATE_DATABASE_URL" <<SQL
UPDATE "_prisma_migrations"
SET rolled_back_at = NOW()
WHERE migration_name = '${name}'
  AND finished_at IS NULL
  AND rolled_back_at IS NULL;
SQL
}

echo "Running database migrations..."
set +e
migrate_output="$(DATABASE_URL="$MIGRATE_DATABASE_URL" npx prisma migrate deploy 2>&1)"
migrate_status=$?
set -e
echo "$migrate_output"

if [[ "$migrate_status" -ne 0 ]]; then
  failed_migration="$(failed_migration_from_p3009 "$migrate_output")"
  if [[ -n "$failed_migration" ]]; then
    echo ""
    echo "==> Recovering failed migration ${failed_migration} and retrying..."
    mark_migration_rolled_back "$failed_migration"
    run_migrate_deploy
  else
    exit "$migrate_status"
  fi
fi

echo "Running database seed..."
npx prisma db seed

echo "Starting Orion API..."
exec node apps/api/dist/main.js
