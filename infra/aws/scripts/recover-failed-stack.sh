#!/usr/bin/env bash
# Delete leftover failed stacks and unmanaged named resources so `cdk deploy Orion` can run.
set -euo pipefail

REGION="${AWS_REGION:-ap-south-1}"
export AWS_DEFAULT_REGION="$REGION"
ACCOUNT="$(aws sts get-caller-identity --query Account --output text)"
DEPLOY_ROLE="arn:aws:iam::${ACCOUNT}:role/cdk-hnb659fds-deploy-role-${ACCOUNT}-${REGION}"

stack_status() {
  aws cloudformation describe-stacks --stack-name "$1" --query 'Stacks[0].StackStatus' --output text 2>/dev/null || echo NONE
}

assume_cdk_deploy_role() {
  echo "Assuming $DEPLOY_ROLE"
  local creds
  creds="$(aws sts assume-role --role-arn "$DEPLOY_ROLE" --role-session-name orion-recover --duration-seconds 3600 --output json)"
  eval "$(printf '%s' "$creds" | python3 -c 'import json,sys
c=json.load(sys.stdin)["Credentials"]
print("export AWS_ACCESS_KEY_ID="+json.dumps(c["AccessKeyId"]))
print("export AWS_SECRET_ACCESS_KEY="+json.dumps(c["SecretAccessKey"]))
print("export AWS_SESSION_TOKEN="+json.dumps(c["SessionToken"]))')"
}

disable_rds_protection() {
  local ids
  ids="$(aws rds describe-db-instances --query 'DBInstances[?DeletionProtection==`true`].DBInstanceIdentifier' --output text 2>/dev/null || true)"
  for id in $ids; do
    if [[ "$id" == *orion* ]]; then
      echo "Disabling deletion protection on $id"
      aws rds modify-db-instance --db-instance-identifier "$id" --no-deletion-protection --apply-immediately >/dev/null
    fi
  done
}

delete_stack_if_present() {
  local name="$1"
  local status
  status="$(stack_status "$name")"
  if [[ "$status" == "NONE" ]]; then
    echo "Stack $name not found"
    return 0
  fi
  echo "Deleting stack $name ($status)"
  disable_rds_protection
  aws cloudformation delete-stack --stack-name "$name"
  aws cloudformation wait stack-delete-complete --stack-name "$name"
  echo "Deleted $name"
}

ignore() {
  "$@" >/dev/null 2>&1 || true
}

empty_and_delete_bucket() {
  local bucket="$1"
  aws s3api head-bucket --bucket "$bucket" >/dev/null 2>&1 || return 0
  echo "Deleting s3://$bucket"
  python3 - "$bucket" <<'PY'
import json, subprocess, sys
bucket = sys.argv[1]
while True:
    listing = subprocess.check_output(
        ["aws", "s3api", "list-object-versions", "--bucket", bucket, "--output", "json"],
        text=True,
    )
    data = json.loads(listing or "{}")
    objects = [
        {"Key": item["Key"], "VersionId": item["VersionId"]}
        for item in (data.get("Versions") or []) + (data.get("DeleteMarkers") or [])
    ]
    if not objects:
        break
    subprocess.check_call(
        [
            "aws",
            "s3api",
            "delete-objects",
            "--bucket",
            bucket,
            "--delete",
            json.dumps({"Objects": objects[:1000], "Quiet": True}),
        ]
    )
subprocess.check_call(["aws", "s3api", "delete-bucket", "--bucket", bucket])
PY
}

delete_named_leftovers() {
  echo "Removing unmanaged named leftovers"
  ignore aws ecr delete-repository --repository-name orion-api --force
  ignore aws ecr delete-repository --repository-name orion-worker --force
  empty_and_delete_bucket "orion-media-${ACCOUNT}"
  ignore aws logs delete-log-group --log-group-name /orion/production/application
  for queue in orion-pop-log orion-pop-log-dlq; do
    url="$(aws sqs get-queue-url --queue-name "$queue" --query QueueUrl --output text 2>/dev/null || true)"
    if [[ -n "${url:-}" && "$url" != "None" ]]; then
      ignore aws sqs delete-queue --queue-url "$url"
    fi
  done
  ignore aws ssm delete-parameter --name /orion/api-image
  ignore aws ssm delete-parameter --name /orion/worker-image
  ignore aws secretsmanager delete-secret --secret-id orion/jwt --force-delete-without-recovery
  ignore aws secretsmanager delete-secret --secret-id orion/cloudfront-private-key --force-delete-without-recovery
  ignore aws ec2 delete-launch-template --launch-template-name orion-api-lt
  ignore aws ec2 delete-launch-template --launch-template-name orion-worker-lt
  ignore aws codebuild delete-project --name orion-migrate
  ignore aws iam detach-role-policy --role-name orion-amplify-hosting \
    --policy-arn arn:aws:iam::aws:policy/AdministratorAccess-Amplify
  ignore aws iam delete-role --role-name orion-amplify-hosting
  for app_name in orion-dashboard orion-dashboard-ssr; do
    app_id="$(aws amplify list-apps --query 'apps[?name==`'"${app_name}"'`].appId' --output text 2>/dev/null || true)"
    if [[ -n "${app_id:-}" && "$app_id" != "None" ]]; then
      ignore aws amplify delete-app --app-id "$app_id"
    fi
  done
  db_ids="$(aws rds describe-db-instances --query 'DBInstances[].DBInstanceIdentifier' --output text 2>/dev/null || true)"
  for id in $db_ids; do
    if [[ "$id" == *orion* ]]; then
      echo "Deleting leftover RDS $id"
      ignore aws rds modify-db-instance --db-instance-identifier "$id" --no-deletion-protection --apply-immediately
      ignore aws rds delete-db-instance --db-instance-identifier "$id" --skip-final-snapshot --delete-automated-backups
    fi
  done
}

assume_cdk_deploy_role
delete_stack_if_present Orion-staging
delete_stack_if_present Orion-production

ORION_STATUS="$(stack_status Orion)"
echo "Orion status: $ORION_STATUS"
if [[ "$ORION_STATUS" == "ROLLBACK_COMPLETE" || "$ORION_STATUS" == "ROLLBACK_FAILED" || "$ORION_STATUS" == "CREATE_FAILED" ]]; then
  delete_stack_if_present Orion
  ORION_STATUS="$(stack_status Orion)"
fi

if [[ "$ORION_STATUS" == "NONE" ]]; then
  delete_named_leftovers
else
  echo "Keeping stack Orion ($ORION_STATUS); named leftovers will be imported or updated in place"
fi
