#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "ERROR: DATABASE_URL must be set." >&2
  exit 1
fi

echo "Applying Prisma migrations..."
npx prisma migrate deploy

echo "Ensuring Proof-of-Play partitions and dropping partitions older than 30 days..."
npx prisma db execute --url "$DATABASE_URL" --stdin <<'SQL'
SELECT orion_ensure_pop_partitions(14, 30);
SELECT orion_drop_old_pop_partitions(30);
SQL

echo "Database migration complete."
