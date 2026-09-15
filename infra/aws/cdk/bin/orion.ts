import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { OrionEnvironmentStack } from '../lib/orion-environment-stack';
import { OrionGithubOidcStack } from '../lib/orion-github-oidc-stack';

const app = new cdk.App();
const account = process.env.CDK_DEFAULT_ACCOUNT;
const region = process.env.CDK_DEFAULT_REGION ?? 'ap-south-1';

new OrionGithubOidcStack(app, 'Orion-github-oidc', {
  env: { account, region },
  description: 'GitHub Actions OIDC deploy role for Orion production',
});

new OrionEnvironmentStack(app, 'Orion', {
  env: { account, region },
  description: 'Orion production digital signage environment',
});
