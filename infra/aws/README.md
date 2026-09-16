# Orion production on AWS

Staging stays on **Netlify** (dashboard) and **Render** (API). AWS is **production only**.

One stack: `Orion` in `ap-south-1`.

You **do not need a domain to deploy**. Without DNS, AWS gives you HTTPS URLs automatically. Add `app` / `api` / `media` hostnames later and redeploy.

This stack is sized for about **$70–90/month** in `ap-south-1` (1 NAT, `db.t4g.small` 20 GB, one API + one worker `t4g.small`). That is a small production, not the original 2,000-device Multi-AZ plan.

## One-time setup

### 1. Tools

- AWS CLI logged in as an admin
- Node 22

```bash
cd infra/aws/cdk
npm install
npx cdk bootstrap aws://ACCOUNT_ID/ap-south-1
```

`ACCOUNT_ID` is from `aws sts get-caller-identity --query Account --output text`.

### 2. CloudFront signing key pair (required even without a domain)

```bash
openssl genrsa -out cloudfront-private-key.pem 2048
openssl rsa -pubout -in cloudfront-private-key.pem -out cloudfront-public-key.pem
```

Do not commit these files.

### 3. GitHub login role (once, from your laptop)

```bash
cd infra/aws/cdk
npx cdk deploy Orion-github-oidc \
  --parameters GitHubOwner=AnshikaTrivedii \
  --parameters GitHubRepo=Digital-Signage-Orion
```

Copy `GitHubDeployRoleArn`.

### 3b. Amplify GitHub App token (required for dashboard SSR)

The production dashboard is **Amplify Hosting Compute** (`orion-dashboard-ssr`, platform `WEB_COMPUTE`). Amplify builds Next.js from GitHub on every push to `main`. GitHub Actions no longer zips or uploads frontend artifacts.

The static `orion-dashboard` app cannot be converted in place. The first CDK deploy that includes Compute **creates** `orion-dashboard-ssr` and **deletes** `orion-dashboard`. Wait for the Amplify `main` job to succeed before using `AppUrl`. The old `*.amplifyapp.com` URL will stop working.

1. In the AWS Amplify console, install the **Amplify GitHub App** on `Digital-Signage-Orion` (repository admin access).
2. Create a GitHub personal access token that can create the repo webhook: classic PAT with `repo` and `admin:repo_hook`, or a fine-grained token with **Contents** (read) and **Webhooks** (read/write) on this repo.
3. Store it as a GitHub environment secret (not a repo variable).

If you connect the repo in the Amplify console first, still keep this token in CDK so later `cdk deploy` does not wipe the Git connection.

In GitHub → **Settings → Environments → production**:

**Required**

- Variable `AWS_DEPLOY_ROLE_ARN`
- Secret `CLOUDFRONT_PUBLIC_KEY` = contents of `cloudfront-public-key.pem`
- Secret `AMPLIFY_GITHUB_TOKEN` = GitHub PAT for the Amplify GitHub App

**Optional (only when you have a domain)**

- `ROOT_DOMAIN` = `yourdomain.com`
- `API_CERTIFICATE_ARN` = ACM cert in `ap-south-1` for `api.yourdomain.com`
- `MEDIA_CERTIFICATE_ARN` = ACM cert in `us-east-1` for `media.yourdomain.com`

### 4. First production deploy

Push to `main`, or **Actions → Deploy Orion production → Run workflow**.

GitHub Actions deploys CDK (API, worker, Amplify app config) and rolls out API/worker images. Amplify CI builds `apps/web` with `next build` and publishes Hosting Compute. Do not create a second Amplify app by hand.

If a previous deploy rolled back, GitHub Actions deletes leftover named resources (`orion-api`, `orion-media-…`, `orion-dashboard-ssr`, log groups) and imports any that CloudFormation still needs. You do not have to delete those by hand.

Then upload the private key:

```bash
aws secretsmanager put-secret-value \
  --region ap-south-1 \
  --secret-id orion/cloudfront-private-key \
  --secret-string file://cloudfront-private-key.pem
```

Refresh the API ASG so instances load the key:

```bash
aws autoscaling start-instance-refresh --auto-scaling-group-name orion-api \
  --preferences MinHealthyPercentage=100,InstanceWarmup=300
```

### 5. Use the AWS URLs (no domain)

CloudFormation stack `Orion` → **Outputs**:

- `AppUrl` / `AmplifySsrAppUrl` — Amplify Hosting Compute dashboard (`https://main.<app>.amplifyapp.com`)
- `AmplifySsrAppId` — Compute app id
- `ApiUrl` — API (`https://….cloudfront.net` until you add a domain)
- `MediaUrl` — signed media (`https://….cloudfront.net`)

After CDK deploy, wait until the Amplify console job for `orion-dashboard-ssr` / `main` is **SUCCEED**. Confirm the app platform is **WEB_COMPUTE** and the framework is **Next.js - SSR**. Then open `AppUrl`.

Verify playlist deep links: open `/app/playlists/<real-uuid>` and refresh. Client navigation from the playlist list to the editor must keep the real id (not `__id__`).

`NEXT_PUBLIC_API_URL` is an Amplify env var set from the stack `ApiUrl` output and inlined when Amplify runs `next build`. Changing the API URL requires a new Amplify build (push to `main`, or **Redeploy this version** in the Amplify console).

Create the first admin:

```bash
curl -X POST "$API_URL/api/auth/bootstrap/super-admin" \
  -H 'Content-Type: application/json' \
  -d '{"email":"you@example.com","fullName":"You","password":"choose-a-strong-password"}'
```

Point the Android player at `ApiUrl`.

### 6. When you get a domain later

1. Issue ACM certs: `api.yourdomain.com` in `ap-south-1`, `media.yourdomain.com` in `us-east-1`
2. Set GitHub production variables `ROOT_DOMAIN`, `API_CERTIFICATE_ARN`, `MEDIA_CERTIFICATE_ARN`
3. Redeploy (push `main` or rerun the workflow)
4. Create DNS: `app` → the Compute app (`AmplifySsrAppUrl` / Amplify custom domain), `api` → ALB, `media` → CloudFront
5. Trigger an Amplify rebuild so `NEXT_PUBLIC_API_URL` becomes `https://api.yourdomain.com` (push to `main` or Redeploy this version)

Roll back by writing a previous image SHA into `/orion/api-image` and `/orion/worker-image`, then starting ASG instance refreshes.
