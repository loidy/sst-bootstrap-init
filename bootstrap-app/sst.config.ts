/// <reference path="./.sst/platform/config.d.ts" />

const RDS_CA_BUNDLE_RELATIVE_PATH = "certificates/global-bundle.pem";
const RDS_CA_BUNDLE_LAMBDA_PATH = "/var/task/certificates/global-bundle.pem";

type RootOutputs = {
  vpc: {
    id: string;
    securityGroups: {
      app: string;
      migration: string;
      database: string;
    };
  } | null;
  database: {
    kind: "aurora-serverless-v2" | "rds-postgres" | "none";
    id: string;
    secretArn: string;
    kmsKeyArn: string;
    proxy: boolean;
  };
  buckets: {
    filesName: string;
    filesPrefix: string;
    kmsKeyArn: string;
  };
};

// #region bootstrap-init:generated — re-run bootstrap-init to regenerate, or edit by hand
const APP_PREFIX = "bootstrap";
const AWS_REGION = process.env.AWS_REGION ?? "eu-central-1";
const DATABASE = {
  kind: "aurora-serverless-v2",
  version: "17.4",
  name: "bootstrap",
} as const;
const STAGE_CONFIG = {
  production: { productionLevel: true },
  staging: { productionLevel: false },
  dev: { productionLevel: false },
} satisfies Record<string, { productionLevel: boolean }>;
// #endregion bootstrap-init:generated

function isNamedStage(stage: string): stage is keyof typeof STAGE_CONFIG {
  return Object.prototype.hasOwnProperty.call(STAGE_CONFIG, stage);
}

function fallbackStageName(): keyof typeof STAGE_CONFIG {
  const names = Object.keys(STAGE_CONFIG) as (keyof typeof STAGE_CONFIG)[];
  return names.find((name) => !STAGE_CONFIG[name].productionLevel) ?? names[0];
}

function resolveStageConfig(stage: string): { productionLevel: boolean } {
  if (isNamedStage(stage)) {
    return STAGE_CONFIG[stage];
  }
  return { productionLevel: false };
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
    return (await aws.ssm.getParameter({ name: primaryName, withDecryption: true })).value;
  } catch (error) {
    if (!fallbackName || fallbackName === primaryName) {
      const reason = error instanceof Error ? error.message : String(error);
      throw new Error(`${label} parameter unreadable at ${primaryName}: ${reason}`);
    }

    return (await aws.ssm.getParameter({ name: fallbackName, withDecryption: true })).value;
  }
}

async function loadStageParameter(
  stage: string,
  parameterName: (stage: string) => string,
  label: string,
): Promise<string> {
  const rootStage = process.env.ROOT_STAGE ?? stage;
  const fallbackName =
    process.env.ROOT_STAGE || isNamedStage(rootStage)
      ? undefined
      : parameterName(String(fallbackStageName()));

  return loadSsmParameter(parameterName(rootStage), fallbackName, label);
}

async function loadRootOutputs(stage: string): Promise<RootOutputs> {
  const outputs = JSON.parse(
    await loadStageParameter(stage, rootParameterName, "Root outputs"),
  ) as RootOutputs;

  return outputs;
}

export default $config({
  app(input) {
    const stage = input?.stage ?? "";
    const config = resolveStageConfig(stage);

    return {
      name: "bootstrap-app",
      removal: config.productionLevel ? "retain" : "remove",
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
    const ROOT_DOMAIN =
      process.env.ROOT_DOMAIN ||
      (await loadStageParameter($app.stage, rootDomainParameterName, "ROOT_DOMAIN"));
    if (!ROOT_DOMAIN) {
      throw new Error(`ROOT_DOMAIN resolved to an empty value for stage "${$app.stage}"`);
    }

    const isReviewStage = !isNamedStage($app.stage);
    const domainName = isReviewStage ? `${$app.stage}.${ROOT_DOMAIN}` : ROOT_DOMAIN;
    const cdnAliases = isReviewStage ? undefined : [`www.${domainName}`];

    const zone = aws.route53.getZone({ name: ROOT_DOMAIN });
    const rootResourceOutputs = await loadRootOutputs($app.stage);

    const vpc = rootResourceOutputs.vpc
      ? sst.aws.Vpc.get("MainVPC", rootResourceOutputs.vpc.id)
      : undefined;

    const appVpc =
      vpc && rootResourceOutputs.vpc
        ? {
            privateSubnets: vpc.privateSubnets,
            securityGroups: [rootResourceOutputs.vpc.securityGroups.app],
          }
        : undefined;

    const useLocalDB = $dev && process.env["USE_REMOTE_DB"] !== "true";
    const hasCloudDatabase =
      DATABASE.kind !== "none" && Boolean(rootResourceOutputs.database.id);

    let database: sst.aws.Aurora | sst.aws.Postgres | undefined;
    if (useLocalDB && DATABASE.kind !== "none") {
      if (!vpc) {
        throw new Error(
          "Root outputs have no VPC — deploy the root project first, or set DATABASE.kind to none.",
        );
      }
      database = new sst.aws.Aurora("MainDatabase", {
        vpc,
        engine: "postgres",
        dev: {
          host: "localhost",
          database: DATABASE.name,
          password: "postgres",
          port: 5432,
          username: "postgres",
        },
      });
    } else if (hasCloudDatabase && rootResourceOutputs.database.kind === "rds-postgres") {
      database = sst.aws.Postgres.get("MainDatabase", rootResourceOutputs.database.id);
    } else if (hasCloudDatabase) {
      database = sst.aws.Aurora.get("MainDatabase", rootResourceOutputs.database.id);
    }

    const DATABASE_URL =
      DATABASE.kind === "none" && !database
        ? process.env.DATABASE_URL ||
          `postgresql://postgres:postgres@localhost:5432/${DATABASE.name}`
        : useLocalDB
          ? $interpolate`postgresql://${database!.username}:${database!.password}@${database!.host}:${database!.port}/${database!.database}`
          : $interpolate`postgresql://${database!.username}:${database!.password}@${database!.host}:${database!.port}/${database!.database}?sslmode=verify-full`;

    const path = await import("node:path");
    const extraEnvironmentVariables: Record<string, string> = {};
    if (!useLocalDB && DATABASE.kind !== "none") {
      extraEnvironmentVariables.NODE_EXTRA_CA_CERTS = $dev
        ? path.join(process.cwd(), RDS_CA_BUNDLE_RELATIVE_PATH)
        : RDS_CA_BUNDLE_LAMBDA_PATH;
    }

    if (appVpc) {
      $transform(sst.aws.Function, (fn) => {
        fn.runtime ??= "nodejs22.x";
        fn.architecture ??= "x86_64";
        fn.versioning ??= false;
        fn.vpc ??= appVpc;
        if (!useLocalDB && DATABASE.kind !== "none") {
          fn.copyFiles = [{ from: RDS_CA_BUNDLE_RELATIVE_PATH, to: RDS_CA_BUNDLE_RELATIVE_PATH }];
        }
      });
    }

    const databaseEnvironment = { DATABASE_URL, ...extraEnvironmentVariables };

    if (database) {
      new sst.x.DevCommand("Prisma", {
        environment: databaseEnvironment,
        dev: {
          autostart: false,
          command: "npx prisma studio",
        },
      });
    }

    if (useLocalDB && DATABASE.kind !== "none") {
      new sst.x.DevCommand("LocalDB", {
        dev: {
          command: "bash scripts/start-local-database.sh",
        },
        environment: databaseEnvironment,
      });
    }

    const filesBucketArn = `arn:aws:s3:::${rootResourceOutputs.buckets.filesName}`;
    const filesBucket = sst.aws.Bucket.get(
      "FilesBucket",
      rootResourceOutputs.buckets.filesName,
    );

    const publicAppUrl =
      process.env.NEXT_PUBLIC_APP_URL ??
      ($dev ? "http://localhost:3000" : $interpolate`https://${domainName}`);

    const kmsPermissions =
      rootResourceOutputs.buckets.kmsKeyArn.length > 0
        ? [
            {
              actions: ["kms:Decrypt", "kms:GenerateDataKey", "kms:DescribeKey"],
              resources: [rootResourceOutputs.buckets.kmsKeyArn],
            },
          ]
        : [];

    const nextjs = new sst.aws.Nextjs("WebApp", {
      vpc: appVpc,
      openNextVersion: "4.0.3",
      domain: $dev
        ? undefined
        : {
            name: domainName,
            ...(cdnAliases ? { aliases: cdnAliases } : {}),
            dns: sst.aws.dns({
              zone: zone.then((z) => z.zoneId),
            }),
          },
      link: database ? [database, filesBucket] : [filesBucket],
      environment: {
        DATABASE_URL,
        ...extraEnvironmentVariables,
        FILES_BUCKET_NAME: rootResourceOutputs.buckets.filesName,
        NEXT_PUBLIC_APP_URL: publicAppUrl,
      },
      transform: {
        server: (server) => {
          server.timeout = "5 minutes";
        },
      },
      permissions: [
        {
          actions: ["s3:GetObject", "s3:PutObject", "s3:DeleteObject", "s3:GetObjectVersion"],
          resources: [`${filesBucketArn}/*`],
        },
        {
          actions: ["s3:ListBucket", "s3:ListBucketVersions"],
          resources: [filesBucketArn],
        },
        ...kmsPermissions,
      ],
      dev: {
        command: "npm run dev",
      },
    });

    return {
      url: $dev ? publicAppUrl : nextjs.url,
    };
  },
});
