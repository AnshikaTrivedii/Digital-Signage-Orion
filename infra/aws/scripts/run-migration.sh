#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${IMAGE_URI:-}" || -z "${DATABASE_URL:-}" ]]; then
  echo "IMAGE_URI and DATABASE_URL are required" >&2
  exit 1
fi

aws ecr get-login-password --region "${AWS_REGION:-ap-south-1}" \
  | docker login --username AWS --password-stdin "${IMAGE_URI%%/*}"
docker pull "$IMAGE_URI"
docker run --rm -e DATABASE_URL="$DATABASE_URL" "$IMAGE_URI" bash scripts/migrate-db.sh
