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

In GitHub → **Settings → Environments → production**:

**Required**

- Variable `AWS_DEPLOY_ROLE_ARN`
- Secret `CLOUDFRONT_PUBLIC_KEY` = contents of `cloudfront-public-key.pem`

**Optional (only when you have a domain)**

- `ROOT_DOMAIN` = `yourdomain.com`
- `API_CERTIFICATE_ARN` = ACM cert in `ap-south-1` for `api.yourdomain.com`
- `MEDIA_CERTIFICATE_ARN` = ACM cert in `us-east-1` for `media.yourdomain.com`

### 4. First production deploy

Push to `main`, or **Actions → Deploy Orion production → Run workflow**.

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
  --preferences MinHealthyPercentage=50,InstanceWarmup=300
```

### 5. Use the AWS URLs (no domain)

CloudFormation stack `Orion` → **Outputs**:

- `AppUrl` — Amplify dashboard (`https://….amplifyapp.com`)
- `ApiUrl` — API (`https://….cloudfront.net` until you add a domain)
- `MediaUrl` — signed media (`https://….cloudfront.net`)

Connect Amplify to this GitHub repo’s `main` branch. Create the first admin:

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
4. Create DNS: `app` → Amplify, `api` → ALB, `media` → CloudFront
5. Rebuild Amplify so `NEXT_PUBLIC_API_URL` becomes `https://api.yourdomain.com`

Roll back by writing a previous image SHA into `/orion/api-image` and `/orion/worker-image`, then starting ASG instance refreshes.
