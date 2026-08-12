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
  exit 1
fi

echo "Running database migrations..."
npx prisma migrate deploy

echo "Running database seed..."
npx prisma db seed

echo "Starting Orion API..."
exec node apps/api/dist/main.js
