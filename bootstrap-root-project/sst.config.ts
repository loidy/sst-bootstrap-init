/// <reference path="./.sst/platform/config.d.ts" />

const POSTGRES_PORT = 5432;
// sst.aws.Vpc hardcodes this CIDR, and the NAT ingress rule below has to match it.
const VPC_CIDR = "10.0.0.0/16";

type Acu = `${number} ACU`;
type PauseAfter = `${number} ${"minute" | "minutes" | "hour" | "hours"}`;

type StageConfig = {
  productionLevel: boolean;
  az: number;
  nat: "ec2" | "managed";
  bastion: boolean;
  flowLogs: boolean;
  vpcEndpoints: boolean;
  scaling: { min: Acu; max: Acu; pauseAfter?: PauseAfter };
  replicas: number;
  proxy: boolean;
  instanceClass: string;
  backupRetentionDays: number;
  deletionProtection: boolean;
  finalSnapshot: boolean;
  performanceInsights: boolean;
  offsiteBackups: boolean;
  kmsDeletionWindowDays: number;
  postgresLogRetentionDays: number;
  manageCaaRecords: boolean;
};

// #region bootstrap-init:generated — re-run bootstrap-init to regenerate, or edit by hand
const APP_PREFIX = "bootstrap";
const AWS_REGION = process.env.AWS_REGION ?? "eu-central-1";
const BACKUP_REPLICA_REGION = process.env.BACKUP_REPLICA_REGION ?? "eu-west-1";
const DATABASE = {
  kind: "aurora-serverless-v2",
  version: "17.4",
  name: "bootstrap",
  encryption: "cmk",
} as const;
const BUCKET = {
  prefix: "bootstrap-files",
  versioning: true,
  encryption: "cmk",
  noncurrentVersionExpirationDays: null,
  intelligentTiering: false,
  abortIncompleteMultipartDays: 7,
} as const;
const STAGE_CONFIG = {
  production: {
    productionLevel: true,
    az: 3,
    nat: "ec2",
    bastion: true,
    flowLogs: true,
    vpcEndpoints: false,
    scaling: { min: "1 ACU", max: "32 ACU" },
    replicas: 1,
    proxy: false,
    instanceClass: "t4g.small",
    backupRetentionDays: 30,
    deletionProtection: true,
    finalSnapshot: true,
    performanceInsights: true,
    offsiteBackups: false,
    kmsDeletionWindowDays: 30,
    postgresLogRetentionDays: 30,
    manageCaaRecords: true,
  },
  staging: {
    productionLevel: false,
    az: 2,
    nat: "ec2",
    bastion: true,
    flowLogs: false,
    vpcEndpoints: false,
    scaling: { min: "0 ACU", max: "8 ACU", pauseAfter: "4 hours" },
    replicas: 0,
    proxy: false,
    instanceClass: "t4g.micro",
    backupRetentionDays: 7,
    deletionProtection: false,
    finalSnapshot: false,
    performanceInsights: false,
    offsiteBackups: false,
    kmsDeletionWindowDays: 7,
    postgresLogRetentionDays: 7,
    manageCaaRecords: true,
  },
  dev: {
    productionLevel: false,
    az: 2,
    nat: "ec2",
    bastion: true,
    flowLogs: false,
    vpcEndpoints: false,
    scaling: { min: "0 ACU", max: "8 ACU", pauseAfter: "30 minutes" },
    replicas: 0,
    proxy: false,
    instanceClass: "t4g.micro",
    backupRetentionDays: 1,
    deletionProtection: false,
    finalSnapshot: false,
    performanceInsights: false,
    offsiteBackups: false,
    kmsDeletionWindowDays: 7,
    postgresLogRetentionDays: 7,
    manageCaaRecords: true,
  },
} satisfies Record<string, StageConfig>;
// #endregion bootstrap-init:generated

function isNamedStage(stage: string): stage is keyof typeof STAGE_CONFIG {
  return Object.prototype.hasOwnProperty.call(STAGE_CONFIG, stage);
}

function fallbackStageName(): keyof typeof STAGE_CONFIG {
  const names = Object.keys(STAGE_CONFIG) as (keyof typeof STAGE_CONFIG)[];
  return names.find((name) => !STAGE_CONFIG[name].productionLevel) ?? names[0];
}

function resolveStageConfig(stage: string): StageConfig {
  if (isNamedStage(stage)) {
    return STAGE_CONFIG[stage];
  }

  return { ...STAGE_CONFIG[fallbackStageName()], manageCaaRecords: false, productionLevel: false };
}

function rootParameterName(stage: string): string {
  return `/${APP_PREFIX}/${stage}/root`;
}

function rootDomainParameterName(stage: string): string {
  return `/${APP_PREFIX}/${stage}/config/ROOT_DOMAIN`;
}

async function loadSsmParameter(
  primaryName: string,
  fallbackName: string | undefined,
  label: string,
): Promise<string> {
  try {
    return (await aws.ssm.getParameter({ name: primaryName })).value;
  } catch {
    if (!fallbackName || fallbackName === primaryName) {
      throw new Error(`${label} parameter not found at ${primaryName}`);
    }

    return (await aws.ssm.getParameter({ name: fallbackName })).value;
  }
}

async function loadRootDomain(stage: string): Promise<string> {
  const rootStage = process.env.ROOT_STAGE ?? stage;
  const fallbackName =
    process.env.ROOT_STAGE || isNamedStage(rootStage)
      ? undefined
      : rootDomainParameterName(String(fallbackStageName()));

  return loadSsmParameter(
    rootDomainParameterName(rootStage),
    fallbackName,
    "ROOT_DOMAIN",
  );
}

export default $config({
  app(input) {
    const stage = input?.stage ?? "";
    const config = resolveStageConfig(stage);

    return {
      name: "bootstrap-root-project",
      // "retain" skips KMS keys and the database secret. retain-all keeps them.
      removal: config.productionLevel ? "retain-all" : "remove",
      protect: config.productionLevel,
      home: "aws",
      providers: {
        aws: {
          region: AWS_REGION,
        },
      },
    };
  },
  async run() {
    const stage = $app.stage;
    const config = resolveStageConfig(stage);
    const wantsDatabase = DATABASE.kind !== "none";

    const ROOT_DOMAIN = process.env.ROOT_DOMAIN || (await loadRootDomain(stage));
    if (!ROOT_DOMAIN) {
      throw new Error(`ROOT_DOMAIN resolved to an empty value for stage "${stage}"`);
    }

    const rdsKmsKey =
      wantsDatabase && DATABASE.encryption === "cmk"
        ? new aws.kms.Key("RdsEncryptionKmsKey", {
            description: "KMS key for PostgreSQL storage encryption",
            deletionWindowInDays: config.kmsDeletionWindowDays,
            enableKeyRotation: true,
          })
        : undefined;

    if (rdsKmsKey) {
      new aws.kms.Alias("RdsEncryptionKmsAlias", {
        name: `alias/${APP_PREFIX}/${stage}/rds`,
        targetKeyId: rdsKmsKey.keyId,
      });
    }

    const vpc = wantsDatabase
      ? new sst.aws.Vpc("MainVPC", {
          az: config.az,
          nat: config.nat,
          bastion: config.bastion,
          transform: {
            natSecurityGroup: (sg) => {
              sg.ingress = [
                {
                  protocol: "-1",
                  fromPort: 0,
                  toPort: 0,
                  cidrBlocks: [VPC_CIDR],
                },
                ...(config.bastion
                  ? [
                      {
                        protocol: "tcp",
                        fromPort: 22,
                        toPort: 22,
                        cidrBlocks: ["0.0.0.0/0"],
                      },
                    ]
                  : []),
              ];
            },
            bastionSecurityGroup: (sg) => {
              sg.ingress = config.bastion
                ? [
                    {
                      protocol: "tcp",
                      fromPort: 22,
                      toPort: 22,
                      cidrBlocks: ["0.0.0.0/0"],
                    },
                  ]
                : [];
            },
          },
        })
      : undefined;

    if (vpc && config.flowLogs) {
      const flowLogGroup = new aws.cloudwatch.LogGroup("VpcFlowLogGroup", {
        name: `/${APP_PREFIX}/${stage}/vpc/flow-logs`,
        retentionInDays: 90,
      });

      const flowLogRole = new aws.iam.Role("VpcFlowLogRole", {
        assumeRolePolicy: JSON.stringify({
          Version: "2012-10-17",
          Statement: [
            {
              Effect: "Allow",
              Principal: { Service: "vpc-flow-logs.amazonaws.com" },
              Action: "sts:AssumeRole",
            },
          ],
        }),
      });

      new aws.iam.RolePolicy("VpcFlowLogPolicy", {
        role: flowLogRole.id,
        policy: $jsonStringify({
          Version: "2012-10-17",
          Statement: [
            {
              Effect: "Allow",
              Action: [
                "logs:CreateLogStream",
                "logs:PutLogEvents",
                "logs:DescribeLogStreams",
              ],
              Resource: $interpolate`${flowLogGroup.arn}:*`,
            },
          ],
        }),
      });

      new aws.ec2.FlowLog("VpcFlowLog", {
        vpcId: vpc.id,
        trafficType: "ALL",
        logDestinationType: "cloud-watch-logs",
        logDestination: flowLogGroup.arn,
        iamRoleArn: flowLogRole.arn,
        maxAggregationInterval: 600,
      });
    }

    const allowAllEgress = [
      {
        protocol: "-1",
        fromPort: 0,
        toPort: 0,
        cidrBlocks: ["0.0.0.0/0"],
      },
    ];

    const appSecurityGroup =
      vpc &&
      new aws.ec2.SecurityGroup("AppSecurityGroup", {
        vpcId: vpc.id,
        description: "Application compute",
        egress: allowAllEgress,
      });

    const migrationSecurityGroup =
      vpc &&
      new aws.ec2.SecurityGroup("MigrationSecurityGroup", {
        vpcId: vpc.id,
        description: "Database migration runner",
        egress: allowAllEgress,
      });

    const databaseSecurityGroup =
      vpc &&
      new aws.ec2.SecurityGroup("DatabaseSecurityGroup", {
        vpcId: vpc.id,
        description: "PostgreSQL, reachable only from listed security groups",
        egress: allowAllEgress,
      });

    const proxySecurityGroup =
      vpc && config.proxy
        ? new aws.ec2.SecurityGroup("DatabaseProxySecurityGroup", {
            vpcId: vpc.id,
            description: "RDS Proxy",
            egress: allowAllEgress,
          })
        : undefined;

    function allowPostgres(
      name: string,
      targetSecurityGroupId: $util.Input<string>,
      sourceSecurityGroupId: $util.Input<string>,
      description: string,
    ) {
      new aws.vpc.SecurityGroupIngressRule(name, {
        securityGroupId: targetSecurityGroupId,
        referencedSecurityGroupId: sourceSecurityGroupId,
        ipProtocol: "tcp",
        fromPort: POSTGRES_PORT,
        toPort: POSTGRES_PORT,
        description,
      });
    }

    if (vpc && databaseSecurityGroup && appSecurityGroup && migrationSecurityGroup) {
      const databaseClients: {
        name: string;
        securityGroupId: $util.Input<string>;
        description: string;
      }[] = [
        {
          name: "App",
          securityGroupId: appSecurityGroup.id,
          description: "Application compute",
        },
        {
          name: "Migration",
          securityGroupId: migrationSecurityGroup.id,
          description: "Migration runner",
        },
      ];

      if (config.bastion) {
        databaseClients.push({
          name: "Bastion",
          securityGroupId: vpc.nodes.bastionSecurityGroup.apply((sg) => sg!.id),
          description: "Bastion tunnel",
        });
      }

      for (const client of databaseClients) {
        allowPostgres(
          `Database${client.name}Ingress`,
          databaseSecurityGroup.id,
          client.securityGroupId,
          client.description,
        );

        if (proxySecurityGroup) {
          allowPostgres(
            `DatabaseProxy${client.name}Ingress`,
            proxySecurityGroup.id,
            client.securityGroupId,
            client.description,
          );
        }
      }

      if (proxySecurityGroup) {
        allowPostgres(
          "DatabaseProxyIngress",
          databaseSecurityGroup.id,
          proxySecurityGroup.id,
          "RDS Proxy",
        );
      }

      if (config.vpcEndpoints) {
        const endpointSg = new aws.ec2.SecurityGroup("VpcEndpointSecurityGroup", {
          vpcId: vpc.id,
          description: "HTTPS to interface VPC endpoints",
          egress: allowAllEgress,
          ingress: [
            {
              protocol: "tcp",
              fromPort: 443,
              toPort: 443,
              cidrBlocks: [VPC_CIDR],
            },
          ],
        });

        for (const service of ["kms", "ssm", "secretsmanager"] as const) {
          new aws.ec2.VpcEndpoint(
            `${service[0].toUpperCase()}${service.slice(1)}Endpoint`,
            {
              vpcId: vpc.id,
              serviceName: `com.amazonaws.${AWS_REGION}.${service}`,
              vpcEndpointType: "Interface",
              subnetIds: vpc.privateSubnets,
              securityGroupIds: [endpointSg.id],
              privateDnsEnabled: true,
            },
          );
        }
      }
    }

    let database: sst.aws.Aurora | sst.aws.Postgres | undefined;
    let aurora: sst.aws.Aurora | undefined;
    if (vpc && databaseSecurityGroup && DATABASE.kind === "aurora-serverless-v2") {
      aurora = new sst.aws.Aurora("MainDatabase", {
        engine: "postgres",
        scaling: config.scaling,
        replicas: config.replicas,
        version: DATABASE.version,
        vpc,
        username: "postgres",
        database: DATABASE.name,
        dataApi: false,
        proxy: config.proxy,
        transform: {
          cluster: (cluster) => {
            cluster.storageEncrypted = true;
            if (rdsKmsKey) {
              cluster.kmsKeyId = rdsKmsKey.arn;
            }
            cluster.vpcSecurityGroupIds = [databaseSecurityGroup.id];
            cluster.iamDatabaseAuthenticationEnabled = true;
            cluster.backupRetentionPeriod = config.backupRetentionDays;
            cluster.preferredBackupWindow = "01:00-02:00";
            cluster.preferredMaintenanceWindow = "sun:02:30-sun:03:30";
            cluster.copyTagsToSnapshot = true;
            cluster.deletionProtection = config.deletionProtection;
            cluster.enabledCloudwatchLogsExports = ["postgresql"];
            cluster.skipFinalSnapshot = !config.finalSnapshot;
            cluster.finalSnapshotIdentifier = config.finalSnapshot
              ? `${APP_PREFIX}-${stage}-final`
              : undefined;
            cluster.applyImmediately = !config.productionLevel;
            cluster.allowMajorVersionUpgrade = false;
          },
          clusterParameterGroup: (pg) => {
            pg.parameters = $resolve([pg.parameters ?? []]).apply(([existing]) => [
              ...existing,
              { name: "rds.force_ssl", value: "1", applyMethod: "pending-reboot" },
              {
                name: "shared_preload_libraries",
                value: "pgaudit,pg_stat_statements",
                applyMethod: "pending-reboot",
              },
              { name: "pgaudit.log", value: "ddl,role,write", applyMethod: "immediate" },
              { name: "log_connections", value: "1", applyMethod: "immediate" },
              { name: "log_disconnections", value: "1", applyMethod: "immediate" },
            ]);
          },
          instance: (instance) => {
            if (config.performanceInsights) {
              instance.performanceInsightsEnabled = true;
              instance.performanceInsightsRetentionPeriod = 7;
            }
          },
          proxy: (proxy) => {
            proxy.requireTls = true;
            if (proxySecurityGroup) {
              proxy.vpcSecurityGroupIds = [proxySecurityGroup.id];
            }
          },
        },
      });
      database = aurora;

      new aws.cloudwatch.LogGroup("PostgresLogGroup", {
        name: $interpolate`/aws/rds/cluster/${aurora.nodes.cluster.clusterIdentifier}/postgresql`,
        retentionInDays: config.postgresLogRetentionDays,
      });
    } else if (vpc && databaseSecurityGroup && DATABASE.kind === "rds-postgres") {
      database = new sst.aws.Postgres("MainDatabase", {
        vpc,
        instance: config.instanceClass,
        version: DATABASE.version,
        username: "postgres",
        database: DATABASE.name,
        proxy: config.proxy,
        transform: {
          instance: (instance) => {
            instance.storageEncrypted = true;
            if (rdsKmsKey) {
              instance.kmsKeyId = rdsKmsKey.arn;
            }
            instance.vpcSecurityGroupIds = [databaseSecurityGroup.id];
            instance.backupRetentionPeriod = config.backupRetentionDays;
            instance.deletionProtection = config.deletionProtection;
            instance.multiAz = config.replicas > 0;
            instance.enabledCloudwatchLogsExports = ["postgresql"];
            instance.applyImmediately = !config.productionLevel;
            if (config.performanceInsights) {
              instance.performanceInsightsEnabled = true;
              instance.performanceInsightsRetentionPeriod = 7;
            }
          },
          proxy: (proxy) => {
            proxy.requireTls = true;
            if (proxySecurityGroup) {
              proxy.vpcSecurityGroupIds = [proxySecurityGroup.id];
            }
          },
        },
      });

      new aws.cloudwatch.LogGroup("PostgresLogGroup", {
        name: $interpolate`/aws/rds/instance/${database.nodes.instance.identifier}/postgresql`,
        retentionInDays: config.postgresLogRetentionDays,
      });
    }

    if (aurora && config.offsiteBackups) {
      const replicaProvider = new aws.Provider("BackupReplicaProvider", {
        region: BACKUP_REPLICA_REGION,
      });

      const replicaVault = new aws.backup.Vault(
        "DatabaseBackupReplicaVault",
        { name: `${APP_PREFIX}-${stage}-replica` },
        { provider: replicaProvider },
      );

      const backupVault = new aws.backup.Vault("DatabaseBackupVault", {
        name: `${APP_PREFIX}-${stage}`,
        kmsKeyArn: rdsKmsKey?.arn,
      });

      new aws.backup.VaultLockConfiguration("DatabaseBackupVaultLock", {
        backupVaultName: backupVault.name,
        minRetentionDays: 7,
        maxRetentionDays: 400,
      });

      const backupRole = new aws.iam.Role("DatabaseBackupRole", {
        assumeRolePolicy: JSON.stringify({
          Version: "2012-10-17",
          Statement: [
            {
              Effect: "Allow",
              Principal: { Service: "backup.amazonaws.com" },
              Action: "sts:AssumeRole",
            },
          ],
        }),
      });

      new aws.iam.RolePolicyAttachment("DatabaseBackupRolePolicy", {
        role: backupRole.name,
        policyArn:
          "arn:aws:iam::aws:policy/service-role/AWSBackupServiceRolePolicyForBackup",
      });

      const backupPlan = new aws.backup.Plan("DatabaseBackupPlan", {
        name: `${APP_PREFIX}-${stage}-database`,
        rules: [
          {
            ruleName: "daily",
            targetVaultName: backupVault.name,
            schedule: "cron(0 4 * * ? *)",
            startWindow: 60,
            completionWindow: 300,
            lifecycle: { deleteAfter: 35 },
            copyActions: [
              {
                destinationVaultArn: replicaVault.arn,
                lifecycle: { deleteAfter: 90 },
              },
            ],
          },
        ],
      });

      new aws.backup.Selection("DatabaseBackupSelection", {
        name: `${APP_PREFIX}-${stage}-database`,
        iamRoleArn: backupRole.arn,
        planId: backupPlan.id,
        resources: [aurora.clusterArn],
      });
    }

    if (config.manageCaaRecords) {
      const hostedZone = aws.route53.getZone({
        name: ROOT_DOMAIN,
      });
      new aws.route53.Record("caa-amazon", {
        zoneId: hostedZone.then((z) => z.zoneId),
        name: ROOT_DOMAIN,
        type: "CAA",
        ttl: 300,
        allowOverwrite: true,
        records: [
          '0 issue "amazon.com"',
          '0 issue "amazontrust.com"',
          '0 issue "awstrust.com"',
          '0 issue "amazonaws.com"',
          '0 issuewild "amazon.com"',
          '0 issuewild "amazontrust.com"',
          '0 issuewild "awstrust.com"',
          '0 issuewild "amazonaws.com"',
        ],
      });
    }

    const s3KmsKey =
      BUCKET.encryption === "cmk"
        ? new aws.kms.Key("S3EncryptionKmsKey", {
            description: "KMS key for S3 bucket server-side encryption",
            deletionWindowInDays: config.kmsDeletionWindowDays,
            enableKeyRotation: true,
          })
        : undefined;

    if (s3KmsKey) {
      new aws.kms.Alias("S3EncryptionKmsAlias", {
        name: `alias/${APP_PREFIX}/${stage}/s3`,
        targetKeyId: s3KmsKey.keyId,
      });
    }

    const filesBucket = new sst.aws.Bucket("FilesBucket", {
      versioning: BUCKET.versioning,
      transform: {
        bucket: (bucket) => {
          bucket.bucket = `${BUCKET.prefix}-${stage}`;
        },
      },
    });

    new aws.s3.BucketServerSideEncryptionConfiguration(
      "FilesBucketEncryption",
      {
        bucket: filesBucket.name,
        rules: [
          {
            applyServerSideEncryptionByDefault: s3KmsKey
              ? {
                  sseAlgorithm: "aws:kms",
                  kmsMasterKeyId: s3KmsKey.arn,
                }
              : {
                  sseAlgorithm: "AES256",
                },
            bucketKeyEnabled: Boolean(s3KmsKey),
          },
        ],
      },
      { dependsOn: [filesBucket] },
    );

    const lifecycleRules: aws.types.input.s3.BucketLifecycleConfigurationRule[] = [
      {
        id: "abort-incomplete-multipart-uploads",
        status: "Enabled",
        filter: {},
        abortIncompleteMultipartUpload: {
          daysAfterInitiation: BUCKET.abortIncompleteMultipartDays,
        },
      },
    ];

    if (BUCKET.versioning && BUCKET.noncurrentVersionExpirationDays) {
      lifecycleRules.push({
        id: "expire-noncurrent-versions",
        status: "Enabled",
        filter: {},
        noncurrentVersionExpiration: {
          noncurrentDays: BUCKET.noncurrentVersionExpirationDays,
        },
      });
    }

    if (BUCKET.intelligentTiering) {
      lifecycleRules.push({
        id: "intelligent-tiering",
        status: "Enabled",
        filter: {},
        transitions: [
          {
            days: 0,
            storageClass: "INTELLIGENT_TIERING",
          },
        ],
      });
    }

    new aws.s3.BucketLifecycleConfiguration(
      "FilesBucketLifecycle",
      {
        bucket: filesBucket.name,
        rules: lifecycleRules,
      },
      { dependsOn: [filesBucket] },
    );

    const paramOutput = {
      vpc: vpc && appSecurityGroup && migrationSecurityGroup && databaseSecurityGroup
        ? {
            id: vpc.id,
            securityGroups: {
              app: appSecurityGroup.id,
              migration: migrationSecurityGroup.id,
              database: databaseSecurityGroup.id,
            },
          }
        : null,
      database: database
        ? {
            kind: DATABASE.kind,
            id: database.id,
            secretArn: database.secretArn,
            kmsKeyArn: rdsKmsKey?.arn ?? "",
            proxy: config.proxy,
          }
        : {
            kind: DATABASE.kind,
            id: "",
            secretArn: "",
            kmsKeyArn: "",
            proxy: false,
          },
      buckets: {
        filesName: filesBucket.name,
        filesPrefix: BUCKET.prefix,
        kmsKeyArn: s3KmsKey?.arn ?? "",
      },
    };

    new aws.ssm.Parameter("RootOutputs", {
      name: rootParameterName(stage),
      type: aws.ssm.ParameterType.String,
      value: $jsonStringify(paramOutput),
    });
  },
});
