import * as cdk from 'aws-cdk-lib';
import { Duration, RemovalPolicy, Stack, type StackProps } from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';

export type OrionGithubOidcStackProps = StackProps & {
  githubOwner?: string;
  githubRepo?: string;
};

export class OrionGithubOidcStack extends Stack {
  constructor(scope: cdk.App, id: string, props: OrionGithubOidcStackProps = {}) {
    super(scope, id, props);

    const githubOwner = new cdk.CfnParameter(this, 'GitHubOwner', {
      type: 'String',
      default: props.githubOwner ?? 'AnshikaTrivedii',
      description: 'GitHub organization or user that owns the Orion repository.',
    });
    const githubRepo = new cdk.CfnParameter(this, 'GitHubRepo', {
      type: 'String',
      default: props.githubRepo ?? 'Digital-Signage-Orion',
      description: 'GitHub repository name allowed to assume the deploy role.',
    });

    const provider = new iam.OpenIdConnectProvider(this, 'GitHubOidcProvider', {
      url: 'https://token.actions.githubusercontent.com',
      clientIds: ['sts.amazonaws.com'],
    });

    const deployRole = new iam.Role(this, 'GitHubDeployRole', {
      roleName: 'orion-github-deploy',
      description: 'Least-privilege GitHub Actions OIDC role for Orion AWS deploys.',
      assumedBy: new iam.OpenIdConnectPrincipal(provider, {
        StringEquals: {
          'token.actions.githubusercontent.com:aud': 'sts.amazonaws.com',
        },
        StringLike: {
          'token.actions.githubusercontent.com:sub': [
            `repo:${githubOwner.valueAsString}/${githubRepo.valueAsString}:environment:production`,
            `repo:${githubOwner.valueAsString}/${githubRepo.valueAsString}:ref:refs/heads/main`,
          ],
        },
      }),
      maxSessionDuration: Duration.hours(2),
    });

    deployRole.addToPolicy(
      new iam.PolicyStatement({
        sid: 'AssumeCdkBootstrapRoles',
        actions: ['sts:AssumeRole'],
        resources: [`arn:aws:iam::${this.account}:role/cdk-*`],
      }),
    );
    deployRole.addToPolicy(
      new iam.PolicyStatement({
        sid: 'EcrPush',
        actions: [
          'ecr:GetAuthorizationToken',
          'ecr:BatchCheckLayerAvailability',
          'ecr:CompleteLayerUpload',
          'ecr:InitiateLayerUpload',
          'ecr:PutImage',
          'ecr:UploadLayerPart',
          'ecr:BatchGetImage',
          'ecr:DescribeRepositories',
          'ecr:DescribeImages',
        ],
        resources: ['*'],
      }),
    );
    deployRole.addToPolicy(
      new iam.PolicyStatement({
        sid: 'PromoteImagesAndRefresh',
        actions: [
          'ssm:PutParameter',
          'ssm:GetParameter',
          'ssm:GetParameters',
          'autoscaling:StartInstanceRefresh',
          'autoscaling:DescribeAutoScalingGroups',
          'autoscaling:DescribeInstanceRefreshes',
          'codebuild:StartBuild',
          'codebuild:BatchGetBuilds',
          'cloudformation:DescribeStacks',
        ],
        resources: ['*'],
      }),
    );

    cdk.Tags.of(this).add('Application', 'Orion');
    cdk.Tags.of(this).add('Environment', 'shared');

    new cdk.CfnOutput(this, 'GitHubDeployRoleArn', { value: deployRole.roleArn });
  }
}
