import * as cdk from 'aws-cdk-lib';
import { Duration, RemovalPolicy, Stack, type StackProps } from 'aws-cdk-lib';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as amplify from 'aws-cdk-lib/aws-amplify';
import * as autoscaling from 'aws-cdk-lib/aws-autoscaling';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as codebuild from 'aws-cdk-lib/aws-codebuild';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import * as wafv2 from 'aws-cdk-lib/aws-wafv2';

export class OrionEnvironmentStack extends Stack {
  constructor(scope: cdk.App, id: string, props?: StackProps) {
    super(scope, id, props);
    const envName = 'production';
    const prefix = 'orion';
    const dashboardBranch = 'main';
    cdk.Tags.of(this).add('Application', 'Orion');
    cdk.Tags.of(this).add('Environment', envName);

    const rootDomain = String(this.node.tryGetContext('rootDomain') ?? '').trim();
    const apiCertificateArn = String(this.node.tryGetContext('apiCertificateArn') ?? '').trim();
    const mediaCertificateArn = String(this.node.tryGetContext('mediaCertificateArn') ?? '').trim();
    const hasCustomApiDomain = Boolean(rootDomain && apiCertificateArn);
    const hasCustomMediaDomain = Boolean(rootDomain && mediaCertificateArn);

    const cloudFrontPublicKey = new cdk.CfnParameter(this, 'CloudFrontPublicKey', {
      type: 'String',
      noEcho: true,
      description: 'PEM public key paired with the CloudFront signing private key secret.',
    });

    const vpc = new ec2.Vpc(this, 'Vpc', {
      vpcName: `${prefix}-vpc`,
      maxAzs: 2,
      natGateways: 1,
      subnetConfiguration: [
        { name: 'public', subnetType: ec2.SubnetType.PUBLIC, cidrMask: 24 },
        { name: 'application', subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS, cidrMask: 24 },
        { name: 'database', subnetType: ec2.SubnetType.PRIVATE_ISOLATED, cidrMask: 24 },
      ],
    });
    vpc.addGatewayEndpoint('S3Endpoint', { service: ec2.GatewayVpcEndpointAwsService.S3 });

    const mediaBucket = new s3.Bucket(this, 'MediaBucket', {
      bucketName: `${prefix}-media-${this.account}`,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      versioned: true,
      enforceSSL: true,
      lifecycleRules: [
        { abortIncompleteMultipartUploadAfter: Duration.days(7), noncurrentVersionExpiration: Duration.days(30) },
      ],
      removalPolicy: RemovalPolicy.RETAIN_ON_UPDATE_OR_DELETE,
      autoDeleteObjects: false,
    });

    const publicKey = new cloudfront.PublicKey(this, 'MediaPublicKey', {
      encodedKey: cloudFrontPublicKey.valueAsString,
      comment: `${prefix} media signed-url verifier`,
    });
    const keyGroup = new cloudfront.KeyGroup(this, 'MediaKeyGroup', { items: [publicKey] });
    const mediaDistribution = new cloudfront.Distribution(this, 'MediaDistribution', {
      comment: `${prefix} private media`,
      ...(hasCustomMediaDomain
        ? {
            domainNames: [`media.${rootDomain}`],
            certificate: acm.Certificate.fromCertificateArn(this, 'MediaCertificate', mediaCertificateArn),
          }
        : {}),
      priceClass: cloudfront.PriceClass.PRICE_CLASS_200,
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(mediaBucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        trustedKeyGroups: [keyGroup],
      },
    });

    const apiRepository = new ecr.Repository(this, 'ApiRepository', {
      repositoryName: `${prefix}-api`,
      imageScanOnPush: true,
      removalPolicy: RemovalPolicy.RETAIN_ON_UPDATE_OR_DELETE,
      lifecycleRules: [{ maxImageCount: 40 }],
    });
    const workerRepository = new ecr.Repository(this, 'WorkerRepository', {
      repositoryName: `${prefix}-worker`,
      imageScanOnPush: true,
      removalPolicy: RemovalPolicy.RETAIN_ON_UPDATE_OR_DELETE,
      lifecycleRules: [{ maxImageCount: 40 }],
    });

    const apiImageParameter = new ssm.StringParameter(this, 'ApiImageParameter', {
      parameterName: `/${prefix}/api-image`,
      stringValue: `${apiRepository.repositoryUri}:bootstrap`,
    });
    const workerImageParameter = new ssm.StringParameter(this, 'WorkerImageParameter', {
      parameterName: `/${prefix}/worker-image`,
      stringValue: `${workerRepository.repositoryUri}:bootstrap`,
    });

    const deadLetterQueue = new sqs.Queue(this, 'PopLogDeadLetterQueue', {
      queueName: `${prefix}-pop-log-dlq`,
      encryption: sqs.QueueEncryption.SQS_MANAGED,
      retentionPeriod: Duration.days(14),
    });
    const popLogQueue = new sqs.Queue(this, 'PopLogQueue', {
      queueName: `${prefix}-pop-log`,
      encryption: sqs.QueueEncryption.SQS_MANAGED,
      visibilityTimeout: Duration.seconds(120),
      receiveMessageWaitTime: Duration.seconds(20),
      deadLetterQueue: { queue: deadLetterQueue, maxReceiveCount: 5 },
    });

    const jwtSecret = new secretsmanager.Secret(this, 'JwtSecret', {
      secretName: `${prefix}/jwt`,
      generateSecretString: {
        secretStringTemplate: JSON.stringify({ value: '' }),
        generateStringKey: 'value',
        passwordLength: 64,
        excludePunctuation: true,
      },
    });
    const cloudFrontPrivateKeySecret = new secretsmanager.Secret(this, 'CloudFrontPrivateKey', {
      secretName: `${prefix}/cloudfront-private-key`,
      description: 'Replace this placeholder with the PEM private key matching CloudFrontPublicKey.',
      secretStringValue: cdk.SecretValue.unsafePlainText('pending-upload-pem-private-key'),
    });

    const apiSecurityGroup = new ec2.SecurityGroup(this, 'ApiSecurityGroup', { vpc, allowAllOutbound: true });
    const workerSecurityGroup = new ec2.SecurityGroup(this, 'WorkerSecurityGroup', { vpc, allowAllOutbound: true });
    const databaseSecurityGroup = new ec2.SecurityGroup(this, 'DatabaseSecurityGroup', { vpc, allowAllOutbound: false });
    databaseSecurityGroup.addIngressRule(apiSecurityGroup, ec2.Port.tcp(5432), 'API PostgreSQL');
    databaseSecurityGroup.addIngressRule(workerSecurityGroup, ec2.Port.tcp(5432), 'worker PostgreSQL');

    const database = new rds.DatabaseInstance(this, 'Database', {
      engine: rds.DatabaseInstanceEngine.postgres({ version: rds.PostgresEngineVersion.VER_16 }),
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.T4G, ec2.InstanceSize.SMALL),
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      securityGroups: [databaseSecurityGroup],
      credentials: rds.Credentials.fromGeneratedSecret('orion'),
      databaseName: 'orion',
      multiAz: false,
      allocatedStorage: 20,
      maxAllocatedStorage: 100,
      storageType: rds.StorageType.GP3,
      storageEncrypted: true,
      backupRetention: Duration.days(7),
      deletionProtection: false,
      removalPolicy: RemovalPolicy.SNAPSHOT,
      publiclyAccessible: false,
    });

    const opsTopic = new sns.Topic(this, 'OpsTopic', { displayName: `${prefix}-ops` });
    new rds.CfnEventSubscription(this, 'DatabaseEventSubscription', {
      snsTopicArn: opsTopic.topicArn,
      sourceType: 'db-instance',
      sourceIds: [database.instanceIdentifier],
      eventCategories: ['failure', 'failover', 'deletion', 'maintenance', 'recovery', 'backup'],
      enabled: true,
    });

    const applicationLogGroup = new logs.LogGroup(this, 'ApplicationLogs', {
      logGroupName: `/orion/${envName}/application`,
      retention: logs.RetentionDays.TWO_WEEKS,
      removalPolicy: RemovalPolicy.RETAIN_ON_UPDATE_OR_DELETE,
    });

    const apiRole = this.createInstanceRole({
      id: 'ApiRole',
      repository: apiRepository,
      logGroup: applicationLogGroup,
      imageParameter: apiImageParameter,
      jwtSecret,
      cloudFrontSecret: cloudFrontPrivateKeySecret,
      databaseSecret: database.secret!,
      mediaBucket,
      sendQueue: popLogQueue,
    });
    const workerRole = this.createInstanceRole({
      id: 'WorkerRole',
      repository: workerRepository,
      logGroup: applicationLogGroup,
      imageParameter: workerImageParameter,
      databaseSecret: database.secret!,
      consumeQueue: popLogQueue,
      consumeQueueDlq: deadLetterQueue,
    });

    const albSecurityGroup = new ec2.SecurityGroup(this, 'AlbSecurityGroup', { vpc, allowAllOutbound: true });
    albSecurityGroup.addIngressRule(
      ec2.Peer.anyIpv4(),
      hasCustomApiDomain ? ec2.Port.tcp(443) : ec2.Port.tcp(80),
      hasCustomApiDomain ? 'Public HTTPS' : 'Public HTTP until a custom domain/certificate is attached',
    );
    const alb = new elbv2.ApplicationLoadBalancer(this, 'ApiLoadBalancer', {
      loadBalancerName: `${prefix}-api`,
      vpc,
      internetFacing: true,
      securityGroup: albSecurityGroup,
      idleTimeout: Duration.seconds(60),
    });
    apiSecurityGroup.addIngressRule(albSecurityGroup, ec2.Port.tcp(3001), 'ALB API traffic');
    const listener = hasCustomApiDomain
      ? alb.addListener('HttpsListener', {
          port: 443,
          protocol: elbv2.ApplicationProtocol.HTTPS,
          certificates: [elbv2.ListenerCertificate.fromArn(apiCertificateArn)],
          sslPolicy: elbv2.SslPolicy.RECOMMENDED_TLS,
        })
      : alb.addListener('HttpListener', {
          port: 80,
          protocol: elbv2.ApplicationProtocol.HTTP,
        });

    const apiCdn = hasCustomApiDomain
      ? undefined
      : new cloudfront.Distribution(this, 'ApiDistribution', {
          comment: `${prefix} API HTTPS without a custom domain`,
          priceClass: cloudfront.PriceClass.PRICE_CLASS_200,
          defaultBehavior: {
            origin: new origins.LoadBalancerV2Origin(alb, {
              protocolPolicy: cloudfront.OriginProtocolPolicy.HTTP_ONLY,
              httpPort: 80,
            }),
            viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
            cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
            originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
            allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
          },
        });
    const apiPublicUrl = hasCustomApiDomain
      ? `https://api.${rootDomain}`
      : `https://${apiCdn!.distributionDomainName}`;
    const mediaPublicUrl = hasCustomMediaDomain
      ? `https://media.${rootDomain}`
      : `https://${mediaDistribution.distributionDomainName}`;

    const webApp = new amplify.CfnApp(this, 'DashboardHosting', {
      name: `${prefix}-dashboard`,
      platform: 'WEB',
      buildSpec:
        'version: 1\napplications:\n  - appRoot: apps/web\n    frontend:\n      phases:\n        preBuild:\n          commands:\n            - cd ../.. && npm ci\n        build:\n          commands:\n            - cd ../.. && STATIC_EXPORT=true npm run build:web\n      artifacts:\n        baseDirectory: out\n        files:\n          - \'**/*\'\n      cache:\n        paths:\n          - node_modules/**/*',
      environmentVariables: [
        { name: 'STATIC_EXPORT', value: 'true' },
        { name: 'NEXT_PUBLIC_API_URL', value: apiPublicUrl },
      ],
      customRules: [
        {
          source: '/app/playlists/<*>',
          target: '/app/playlists/__id__/index.html',
          status: '200',
        },
      ],
    });
    new amplify.CfnBranch(this, 'DashboardBranch', {
      appId: webApp.attrAppId,
      branchName: dashboardBranch,
      enableAutoBuild: false,
      stage: 'PRODUCTION',
      environmentVariables: [
        { name: 'NEXT_PUBLIC_API_URL', value: apiPublicUrl },
        { name: 'STATIC_EXPORT', value: 'true' },
      ],
    });
    const dashboardOrigins = [`https://${webApp.attrDefaultDomain}`];
    if (rootDomain) dashboardOrigins.push(`https://app.${rootDomain}`);

    const apiAsg = this.createServiceAsg({
      id: 'ApiAsg',
      name: `${prefix}-api`,
      vpc,
      role: apiRole,
      securityGroup: apiSecurityGroup,
      imageParameter: apiImageParameter,
      serviceName: 'api',
      envName,
      logGroupName: applicationLogGroup.logGroupName,
      min: 1,
      max: 2,
      containerPort: 3001,
      elbHealthCheck: true,
      environment: {
        PORT: '3001',
        POP_LOG_QUEUE_URL: popLogQueue.queueUrl,
        PLAYER_HEARTBEAT_LOG: 'false',
        PLAYER_POP_LOG: 'false',
        S3_USE_LOCAL_STORAGE: 'false',
        S3_BUCKET: mediaBucket.bucketName,
        S3_REGION: this.region,
        CORS_ORIGINS: dashboardOrigins.join(','),
        CLOUDFRONT_MEDIA_DOMAIN: mediaPublicUrl,
        CLOUDFRONT_KEY_PAIR_ID: publicKey.publicKeyId,
        METRICS_NAMESPACE: `Orion/${envName}`,
        ORION_ENV: envName,
        CLOUDWATCH_METRICS: 'true',
      },
      database,
      jwtSecret,
      cloudFrontPrivateKeySecret,
    });
    const apiTargetGroup = listener.addTargets('ApiTargets', {
      port: 3001,
      protocol: elbv2.ApplicationProtocol.HTTP,
      targets: [apiAsg],
      healthCheck: {
        path: '/api/ready',
        healthyHttpCodes: '200',
        interval: Duration.seconds(30),
        healthyThresholdCount: 2,
        unhealthyThresholdCount: 3,
        timeout: Duration.seconds(5),
      },
    });

    const workerAsg = this.createServiceAsg({
      id: 'WorkerAsg',
      name: `${prefix}-worker`,
      vpc,
      role: workerRole,
      securityGroup: workerSecurityGroup,
      imageParameter: workerImageParameter,
      serviceName: 'worker',
      envName,
      logGroupName: applicationLogGroup.logGroupName,
      min: 1,
      max: 2,
      environment: {
        POP_LOG_QUEUE_URL: popLogQueue.queueUrl,
        METRICS_NAMESPACE: `Orion/${envName}`,
        ORION_ENV: envName,
        CLOUDWATCH_METRICS: 'true',
      },
      database,
    });
    apiAsg.scaleOnCpuUtilization('ApiCpuScaling', { targetUtilizationPercent: 60 });
    workerAsg.scaleOnCpuUtilization('WorkerCpuScaling', { targetUtilizationPercent: 70 });
    workerAsg.scaleOnMetric('WorkerQueueScaling', {
      metric: popLogQueue.metricApproximateNumberOfMessagesVisible(),
      scalingSteps: [
        { lower: 200, change: 1 },
        { lower: 2000, change: 2 },
      ],
      adjustmentType: autoscaling.AdjustmentType.CHANGE_IN_CAPACITY,
    });

    const migratorSecurityGroup = new ec2.SecurityGroup(this, 'MigratorSecurityGroup', { vpc, allowAllOutbound: true });
    databaseSecurityGroup.addIngressRule(migratorSecurityGroup, ec2.Port.tcp(5432), 'migration runner PostgreSQL');
    const migrator = new codebuild.Project(this, 'MigrationProject', {
      projectName: `${prefix}-migrate`,
      vpc,
      subnetSelection: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      securityGroups: [migratorSecurityGroup],
      environment: {
        buildImage: codebuild.LinuxArmBuildImage.AMAZON_LINUX_2_STANDARD_3_0,
        privileged: true,
      },
      environmentVariables: {
        DB_SECRET_ARN: { value: database.secret!.secretArn },
        DB_HOST: { value: database.dbInstanceEndpointAddress },
        DB_PORT: { value: database.dbInstanceEndpointPort },
      },
      buildSpec: codebuild.BuildSpec.fromObject({
        version: '0.2',
        phases: {
          build: {
            commands: [
              'export DB_SECRET=$(aws secretsmanager get-secret-value --secret-id "$DB_SECRET_ARN" --query SecretString --output text)',
              'export DATABASE_URL=$(python3 -c "import json, os, urllib.parse; s=json.loads(os.environ[\'DB_SECRET\']); print(\'postgresql://%s:%s@%s:%s/orion?schema=public\' % (urllib.parse.quote(s[\'username\']), urllib.parse.quote(s[\'password\']), os.environ[\'DB_HOST\'], os.environ[\'DB_PORT\']))")',
              'aws ecr get-login-password --region "$AWS_DEFAULT_REGION" | docker login --username AWS --password-stdin "${IMAGE_URI%%/*}"',
              'docker run --rm -e DATABASE_URL="$DATABASE_URL" "$IMAGE_URI" bash scripts/migrate-db.sh',
            ],
          },
        },
      }),
    });
    database.secret!.grantRead(migrator);
    apiRepository.grantPull(migrator);
    migrator.addToRolePolicy(new iam.PolicyStatement({ actions: ['ecr:GetAuthorizationToken'], resources: ['*'] }));

    const webAcl = new wafv2.CfnWebACL(this, 'ApiWebAcl', {
      defaultAction: { allow: {} },
      scope: 'REGIONAL',
      visibilityConfig: { cloudWatchMetricsEnabled: true, metricName: `${prefix}-waf`, sampledRequestsEnabled: true },
      rules: [
        {
          name: 'AWSCommonRules',
          priority: 0,
          overrideAction: { none: {} },
          statement: { managedRuleGroupStatement: { vendorName: 'AWS', name: 'AWSManagedRulesCommonRuleSet' } },
          visibilityConfig: { cloudWatchMetricsEnabled: true, metricName: 'common', sampledRequestsEnabled: true },
        },
        {
          name: 'RateLimit',
          priority: 1,
          action: { block: {} },
          statement: { rateBasedStatement: { aggregateKeyType: 'IP', limit: 5000 } },
          visibilityConfig: { cloudWatchMetricsEnabled: true, metricName: 'rate-limit', sampledRequestsEnabled: true },
        },
      ],
    });
    new wafv2.CfnWebACLAssociation(this, 'ApiWebAclAssociation', {
      resourceArn: alb.loadBalancerArn,
      webAclArn: webAcl.attrArn,
    });

    this.addAlarms({
      prefix,
      apiAsg,
      workerAsg,
      apiTargetGroup,
      alb,
      popLogQueue,
      deadLetterQueue,
      database,
    });
    this.addDashboard({
      prefix,
      envName,
      apiAsg,
      workerAsg,
      apiTargetGroup,
      alb,
      popLogQueue,
      deadLetterQueue,
      database,
    });

    new cdk.CfnOutput(this, 'ApiUrl', { value: apiPublicUrl });
    new cdk.CfnOutput(this, 'AppUrl', { value: rootDomain ? `https://app.${rootDomain}` : `https://${dashboardBranch}.${webApp.attrDefaultDomain}` });
    new cdk.CfnOutput(this, 'MediaUrl', { value: mediaPublicUrl });
    new cdk.CfnOutput(this, 'ApiDnsTarget', { value: alb.loadBalancerDnsName });
    new cdk.CfnOutput(this, 'MediaDnsTarget', { value: mediaDistribution.distributionDomainName });
    new cdk.CfnOutput(this, 'AmplifyDefaultDomain', { value: webApp.attrDefaultDomain });
    new cdk.CfnOutput(this, 'AmplifyAppId', { value: webApp.attrAppId });
    new cdk.CfnOutput(this, 'AmplifyBranch', { value: dashboardBranch });
    new cdk.CfnOutput(this, 'DnsInstructions', {
      value: rootDomain
        ? `Create DNS: app CNAME to Amplify; api ALIAS/CNAME to ALB; media CNAME to CloudFront.`
        : `No custom domain yet. Use ApiUrl, AppUrl, and MediaUrl outputs. Add ROOT_DOMAIN and ACM certs later, then redeploy.`,
    });
    new cdk.CfnOutput(this, 'ApiRepositoryUri', { value: apiRepository.repositoryUri });
    new cdk.CfnOutput(this, 'WorkerRepositoryUri', { value: workerRepository.repositoryUri });
    new cdk.CfnOutput(this, 'MigrationProjectName', { value: migrator.projectName });
    new cdk.CfnOutput(this, 'ApiAutoScalingGroupName', { value: apiAsg.autoScalingGroupName });
    new cdk.CfnOutput(this, 'WorkerAutoScalingGroupName', { value: workerAsg.autoScalingGroupName });
    new cdk.CfnOutput(this, 'ApiImageParameterName', { value: apiImageParameter.parameterName });
    new cdk.CfnOutput(this, 'WorkerImageParameterName', { value: workerImageParameter.parameterName });
    new cdk.CfnOutput(this, 'ApplicationLogGroupName', { value: applicationLogGroup.logGroupName });
    new cdk.CfnOutput(this, 'OpsTopicArn', { value: opsTopic.topicArn });
    new cdk.CfnOutput(this, 'CloudFrontPrivateKeySecretArn', { value: cloudFrontPrivateKeySecret.secretArn });
  }

  private createInstanceRole(props: {
    id: string;
    repository: ecr.Repository;
    logGroup: logs.LogGroup;
    imageParameter: ssm.StringParameter;
    databaseSecret: secretsmanager.ISecret;
    jwtSecret?: secretsmanager.Secret;
    cloudFrontSecret?: secretsmanager.Secret;
    mediaBucket?: s3.Bucket;
    sendQueue?: sqs.Queue;
    consumeQueue?: sqs.Queue;
    consumeQueueDlq?: sqs.Queue;
  }) {
    const role = new iam.Role(this, props.id, { assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com') });
    role.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonSSMManagedInstanceCore'));
    role.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName('CloudWatchAgentServerPolicy'));
    props.repository.grantPull(role);
    props.logGroup.grantWrite(role);
    props.imageParameter.grantRead(role);
    props.databaseSecret.grantRead(role);
    props.jwtSecret?.grantRead(role);
    props.cloudFrontSecret?.grantRead(role);
    props.mediaBucket?.grantReadWrite(role);
    props.sendQueue?.grantSendMessages(role);
    props.consumeQueue?.grantConsumeMessages(role);
    props.consumeQueueDlq?.grantConsumeMessages(role);
    role.addToPolicy(new iam.PolicyStatement({ actions: ['ecr:GetAuthorizationToken'], resources: ['*'] }));
    role.addToPolicy(new iam.PolicyStatement({ actions: ['cloudwatch:PutMetricData'], resources: ['*'] }));
    return role;
  }

  private createServiceAsg(props: {
    id: string;
    name: string;
    vpc: ec2.Vpc;
    role: iam.Role;
    securityGroup: ec2.SecurityGroup;
    imageParameter: ssm.StringParameter;
    serviceName: 'api' | 'worker';
    envName: string;
    logGroupName: string;
    min: number;
    max: number;
    containerPort?: number;
    elbHealthCheck?: boolean;
    environment: Record<string, string>;
    database: rds.DatabaseInstance;
    jwtSecret?: secretsmanager.Secret;
    cloudFrontPrivateKeySecret?: secretsmanager.Secret;
  }) {
    const jwtLookup = props.jwtSecret
      ? `JWT_SECRET=$(aws secretsmanager get-secret-value --secret-id '${props.jwtSecret.secretArn}' --query SecretString --output text --region '${this.region}' | python3 -c "import json,sys; raw=sys.stdin.read(); print(json.loads(raw)['value'] if raw.strip().startswith('{') else raw)")`
      : 'JWT_SECRET=';
    const cfLookup = props.cloudFrontPrivateKeySecret
      ? `CF_KEY=$(aws secretsmanager get-secret-value --secret-id '${props.cloudFrontPrivateKeySecret.secretArn}' --query SecretString --output text --region '${this.region}')`
      : 'CF_KEY=';
    const portPublish = props.containerPort ? `-p ${props.containerPort}:${props.containerPort}` : '';
    const envLines = Object.entries(props.environment).map(([key, value]) => `${key}=${value}`);
    const userData = ec2.UserData.forLinux();
    userData.addCommands(
      'dnf install -y docker amazon-cloudwatch-agent python3',
      'systemctl enable --now docker',
      'mkdir -p /etc/orion /opt/aws/amazon-cloudwatch-agent/etc',
      `cat > /opt/aws/amazon-cloudwatch-agent/etc/amazon-cloudwatch-agent.json <<'CW'`,
      JSON.stringify({
        metrics: {
          namespace: 'CWAgent',
          append_dimensions: { AutoScalingGroupName: '${aws:AutoScalingGroupName}' },
          aggregation_dimensions: [['AutoScalingGroupName']],
          metrics_collected: {
            mem: { measurement: ['mem_used_percent'] },
            disk: { measurement: ['used_percent'], resources: ['/'] },
          },
        },
      }),
      'CW',
      '/opt/aws/amazon-cloudwatch-agent/bin/amazon-cloudwatch-agent-ctl -a fetch-config -m ec2 -s -c file:/opt/aws/amazon-cloudwatch-agent/etc/amazon-cloudwatch-agent.json',
      `cat > /opt/orion-${props.serviceName}.sh <<'SCRIPT'`,
      '#!/usr/bin/env bash',
      'set -euo pipefail',
      `IMAGE_URI=$(aws ssm get-parameter --name '${props.imageParameter.parameterName}' --query Parameter.Value --output text --region '${this.region}')`,
      `DB_SECRET=$(aws secretsmanager get-secret-value --secret-id '${props.database.secret!.secretArn}' --query SecretString --output text --region '${this.region}')`,
      jwtLookup,
      cfLookup,
      `export DATABASE_URL=$(DB_SECRET="$DB_SECRET" DB_HOST='${props.database.dbInstanceEndpointAddress}' DB_PORT='${props.database.dbInstanceEndpointPort}' python3 -c "import json, os, urllib.parse; s=json.loads(os.environ['DB_SECRET']); print('postgresql://%s:%s@%s:%s/orion?schema=public' % (urllib.parse.quote(s['username']), urllib.parse.quote(s['password']), os.environ['DB_HOST'], os.environ['DB_PORT']))")`,
      'cat > /etc/orion/service.env <<EOF',
      'DATABASE_URL=$DATABASE_URL',
      'JWT_SECRET=$JWT_SECRET',
      'CLOUDFRONT_PRIVATE_KEY_FILE=/etc/orion/cloudfront.pem',
      ...envLines,
      'NODE_ENV=production',
      `AWS_REGION=${this.region}`,
      `AWS_DEFAULT_REGION=${this.region}`,
      'EOF',
      'printf "%s\\n" "$CF_KEY" > /etc/orion/cloudfront.pem',
      `aws ecr get-login-password --region '${this.region}' | docker login --username AWS --password-stdin "${'$'}{IMAGE_URI%%/*}"`,
      'for i in $(seq 1 30); do docker pull "$IMAGE_URI" && break; sleep 20; done',
      `docker rm -f orion-${props.serviceName} || true`,
      `exec docker run --name orion-${props.serviceName} --env-file /etc/orion/service.env ${portPublish} --log-driver=awslogs --log-opt awslogs-region=${this.region} --log-opt awslogs-group=${props.logGroupName} --log-opt awslogs-stream=${props.serviceName}-$(hostname) "$IMAGE_URI"`,
      'SCRIPT',
      `chmod +x /opt/orion-${props.serviceName}.sh`,
      `cat > /etc/systemd/system/orion-${props.serviceName}.service <<EOF`,
      '[Unit]',
      'After=docker.service',
      'Requires=docker.service',
      '[Service]',
      `ExecStart=/opt/orion-${props.serviceName}.sh`,
      'Restart=always',
      'RestartSec=5',
      '[Install]',
      'WantedBy=multi-user.target',
      'EOF',
      'systemctl daemon-reload',
      `systemctl enable --now orion-${props.serviceName}`,
    );

    const launchTemplate = new ec2.LaunchTemplate(this, `${props.id}LaunchTemplate`, {
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.T4G, ec2.InstanceSize.SMALL),
      machineImage: ec2.MachineImage.latestAmazonLinux2023({ cpuType: ec2.AmazonLinuxCpuType.ARM_64 }),
      role: props.role,
      securityGroup: props.securityGroup,
      userData,
      requireImdsv2: true,
    });

    return new autoscaling.AutoScalingGroup(this, props.id, {
      autoScalingGroupName: props.name,
      vpc: props.vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      launchTemplate,
      minCapacity: props.min,
      maxCapacity: props.max,
      healthCheck: props.elbHealthCheck
        ? autoscaling.HealthCheck.elb({ grace: Duration.minutes(10) })
        : autoscaling.HealthCheck.ec2({ grace: Duration.minutes(10) }),
      updatePolicy: autoscaling.UpdatePolicy.rollingUpdate({ minInstancesInService: 0, maxBatchSize: 1 }),
    });
  }

  private addAlarms(props: {
    prefix: string;
    apiAsg: autoscaling.AutoScalingGroup;
    workerAsg: autoscaling.AutoScalingGroup;
    apiTargetGroup: elbv2.ApplicationTargetGroup;
    alb: elbv2.ApplicationLoadBalancer;
    popLogQueue: sqs.Queue;
    deadLetterQueue: sqs.Queue;
    database: rds.DatabaseInstance;
  }) {
    const asgCpu = (asg: autoscaling.AutoScalingGroup, id: string) =>
      new cloudwatch.Alarm(this, id, {
        metric: new cloudwatch.Metric({
          namespace: 'AWS/EC2',
          metricName: 'CPUUtilization',
          statistic: 'Average',
          period: Duration.minutes(1),
          dimensionsMap: { AutoScalingGroupName: asg.autoScalingGroupName },
        }),
        threshold: 80,
        evaluationPeriods: 3,
        comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      });
    const asgMemory = (asg: autoscaling.AutoScalingGroup, id: string) =>
      new cloudwatch.Alarm(this, id, {
        metric: new cloudwatch.Metric({
          namespace: 'CWAgent',
          metricName: 'mem_used_percent',
          statistic: 'Average',
          period: Duration.minutes(1),
          dimensionsMap: { AutoScalingGroupName: asg.autoScalingGroupName },
        }),
        threshold: 85,
        evaluationPeriods: 3,
        comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      });

    asgCpu(props.apiAsg, 'ApiCpuAlarm');
    asgCpu(props.workerAsg, 'WorkerCpuAlarm');
    asgMemory(props.apiAsg, 'ApiMemoryAlarm');
    asgMemory(props.workerAsg, 'WorkerMemoryAlarm');

    new cloudwatch.Alarm(this, 'ApiUnhealthyTargetsAlarm', {
      metric: props.apiTargetGroup.metricUnhealthyHostCount(),
      threshold: 0,
      evaluationPeriods: 2,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
    });
    new cloudwatch.Alarm(this, 'Alb5xxAlarm', {
      metric: props.alb.metricHttpCodeElb(elbv2.HttpCodeElb.ELB_5XX_COUNT),
      threshold: 5,
      evaluationPeriods: 2,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
    });
    new cloudwatch.Alarm(this, 'AlbLatencyAlarm', {
      metric: props.alb.metricTargetResponseTime({ statistic: 'p95' }),
      threshold: 2,
      evaluationPeriods: 3,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
    });
    new cloudwatch.Alarm(this, 'PopQueueAgeAlarm', {
      metric: props.popLogQueue.metricApproximateAgeOfOldestMessage(),
      threshold: 300,
      evaluationPeriods: 2,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
    });
    new cloudwatch.Alarm(this, 'PopQueueDepthAlarm', {
      metric: props.popLogQueue.metricApproximateNumberOfMessagesVisible(),
      threshold: 5000,
      evaluationPeriods: 3,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
    });
    new cloudwatch.Alarm(this, 'PopDlqAlarm', {
      metric: props.deadLetterQueue.metricApproximateNumberOfMessagesVisible(),
      threshold: 0,
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
    });
    new cloudwatch.Alarm(this, 'DatabaseCpuAlarm', {
      metric: props.database.metricCPUUtilization(),
      threshold: 80,
      evaluationPeriods: 3,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
    });
    new cloudwatch.Alarm(this, 'DatabaseFreeStorageAlarm', {
      metric: props.database.metricFreeStorageSpace(),
      threshold: 4 * 1024 * 1024 * 1024,
      evaluationPeriods: 2,
      comparisonOperator: cloudwatch.ComparisonOperator.LESS_THAN_THRESHOLD,
    });
    new cloudwatch.Alarm(this, 'DatabaseConnectionsAlarm', {
      metric: props.database.metricDatabaseConnections(),
      threshold: 60,
      evaluationPeriods: 2,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
    });
  }

  private addDashboard(props: {
    prefix: string;
    envName: string;
    apiAsg: autoscaling.AutoScalingGroup;
    workerAsg: autoscaling.AutoScalingGroup;
    apiTargetGroup: elbv2.ApplicationTargetGroup;
    alb: elbv2.ApplicationLoadBalancer;
    popLogQueue: sqs.Queue;
    deadLetterQueue: sqs.Queue;
    database: rds.DatabaseInstance;
  }) {
    const orionMetric = (metricName: string) =>
      new cloudwatch.Metric({
        namespace: `Orion/${props.envName}`,
        metricName,
        statistic: 'Sum',
        period: Duration.minutes(1),
        dimensionsMap: { Environment: props.envName },
      });

    new cloudwatch.Dashboard(this, 'OperationsDashboard', {
      dashboardName: props.prefix,
      widgets: [
        [
          new cloudwatch.GraphWidget({ title: 'Heartbeat success', left: [orionMetric('HeartbeatSuccess')] }),
          new cloudwatch.GraphWidget({
            title: 'Online devices',
            left: [
              new cloudwatch.Metric({
                namespace: `Orion/${props.envName}`,
                metricName: 'OnlineDevices',
                statistic: 'Average',
                period: Duration.minutes(1),
                dimensionsMap: { Environment: props.envName },
              }),
            ],
          }),
        ],
        [
          new cloudwatch.GraphWidget({
            title: 'PoP enqueue / consume',
            left: [orionMetric('PopLogsEnqueued'), orionMetric('PopLogsConsumed')],
          }),
          new cloudwatch.GraphWidget({
            title: 'Queue lag',
            left: [props.popLogQueue.metricApproximateAgeOfOldestMessage(), props.popLogQueue.metricApproximateNumberOfMessagesVisible()],
          }),
        ],
        [
          new cloudwatch.GraphWidget({ title: 'Media download failures', left: [orionMetric('MediaDownloadFailures')] }),
          new cloudwatch.GraphWidget({ title: 'DLQ', left: [props.deadLetterQueue.metricApproximateNumberOfMessagesVisible()] }),
        ],
        [
          new cloudwatch.GraphWidget({ title: 'ALB 5xx / latency', left: [props.alb.metricHttpCodeElb(elbv2.HttpCodeElb.ELB_5XX_COUNT)], right: [props.alb.metricTargetResponseTime()] }),
          new cloudwatch.GraphWidget({ title: 'RDS CPU / connections', left: [props.database.metricCPUUtilization()], right: [props.database.metricDatabaseConnections()] }),
        ],
      ],
    });
  }
}
