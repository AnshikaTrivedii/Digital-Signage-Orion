#!/usr/bin/env bash
# Publish apps/web/out to the CDK Amplify app (manual hosting, no GitHub connection).
set -euo pipefail

REGION="${AWS_REGION:-ap-south-1}"
export AWS_DEFAULT_REGION="$REGION"
APP_ID="${AMPLIFY_APP_ID:-}"
BRANCH="${AMPLIFY_BRANCH:-main}"
OUT_DIR="${WEB_OUT_DIR:-apps/web/out}"

if [[ -z "$APP_ID" ]]; then
  APP_ID="$(aws cloudformation describe-stacks --stack-name Orion \
    --query 'Stacks[0].Outputs[?OutputKey==`AmplifyAppId`].OutputValue' --output text)"
fi
if [[ -z "$APP_ID" || "$APP_ID" == "None" ]]; then
  echo "ERROR: Amplify app id not found." >&2
  exit 1
fi
if [[ ! -f "$OUT_DIR/index.html" ]]; then
  echo "ERROR: $OUT_DIR/index.html is missing. Build the dashboard with STATIC_EXPORT=true first." >&2
  exit 1
fi

pending="$(aws amplify list-jobs --app-id "$APP_ID" --branch-name "$BRANCH" --max-items 10 \
  --query 'jobSummaries[?status==`PENDING` || status==`RUNNING`].jobId' --output text)"
for job in $pending; do
  echo "Stopping leftover Amplify job $job"
  aws amplify stop-job --app-id "$APP_ID" --branch-name "$BRANCH" --job-id "$job" >/dev/null || true
done

ZIP_DIR="$(mktemp -d)"
ZIP="$ZIP_DIR/artifacts.zip"
(cd "$OUT_DIR" && zip -r -q "$ZIP" .)
echo "Created $(du -h "$ZIP" | awk '{print $1}') zip for Amplify app $APP_ID branch $BRANCH"

DEPLOY_JSON="$(aws amplify create-deployment --app-id "$APP_ID" --branch-name "$BRANCH" --output json)"
JOB_ID="$(python3 -c 'import json,sys; print(json.load(sys.stdin)["jobId"])' <<<"$DEPLOY_JSON")"
UPLOAD_URL="$(python3 -c 'import json,sys; print(json.load(sys.stdin)["zipUploadUrl"])' <<<"$DEPLOY_JSON")"
echo "Uploading to Amplify job $JOB_ID"
curl -sS --fail --request PUT --upload-file "$ZIP" "$UPLOAD_URL" >/dev/null
rm -rf "$ZIP_DIR"

aws amplify start-deployment --app-id "$APP_ID" --branch-name "$BRANCH" --job-id "$JOB_ID" >/dev/null
for _ in $(seq 1 60); do
  STATUS="$(aws amplify get-job --app-id "$APP_ID" --branch-name "$BRANCH" --job-id "$JOB_ID" --query 'job.summary.status' --output text)"
  echo "Amplify job $JOB_ID status: $STATUS"
  case "$STATUS" in
    SUCCEED) exit 0 ;;
    FAILED|CANCELLED)
      aws amplify get-job --app-id "$APP_ID" --branch-name "$BRANCH" --job-id "$JOB_ID" \
        --query 'job.steps[?status==`FAILED`].[stepName,statusReason]' --output text
      exit 1
      ;;
  esac
  sleep 10
done
echo "Timed out waiting for Amplify job $JOB_ID"
exit 1
