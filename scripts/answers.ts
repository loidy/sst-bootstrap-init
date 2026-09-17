import { z } from "zod";

export const DATABASE_KINDS = [
  "aurora-serverless-v2",
  "rds-postgres",
  "none",
] as const;

export type DatabaseKind = (typeof DATABASE_KINDS)[number];

export const NAT_MODES = ["ec2", "managed"] as const;
export type NatMode = (typeof NAT_MODES)[number];

export const DB_ENCRYPTION_MODES = ["cmk", "aws-managed"] as const;
export type DbEncryption = (typeof DB_ENCRYPTION_MODES)[number];

export const S3_ENCRYPTION_MODES = ["cmk", "sse-s3"] as const;
export type S3Encryption = (typeof S3_ENCRYPTION_MODES)[number];

export const AWS_REGIONS = [
  "eu-central-1",
  "eu-west-1",
  "eu-west-2",
  "eu-west-3",
  "eu-north-1",
  "us-east-1",
  "us-east-2",
  "us-west-2",
  "ap-southeast-1",
  "ap-northeast-1",
] as const;

export const RDS_INSTANCE_CLASSES = [
  "t4g.micro",
  "t4g.small",
  "t4g.medium",
  "m6g.large",
  "r6g.large",
] as const;

export type RdsInstanceClass = (typeof RDS_INSTANCE_CLASSES)[number];

/** SST Aurora `pauseAfter` values. */
export const PAUSE_AFTER_PATTERN =
  /^\d+ (minute|minutes|hour|hours)$/;

export const PROJECT_SLUG_PATTERN = /^[a-z][a-z0-9-]{0,28}[a-z0-9]$/;
export const STAGE_NAME_PATTERN = /^[a-z][a-z0-9-]{0,18}[a-z0-9]$/;
export const BUCKET_PREFIX_PATTERN = /^[a-z0-9][a-z0-9-]{1,40}[a-z0-9]$/;
export const DOMAIN_PATTERN =
  /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/;
export const SECRET_KEY_PATTERN = /^[A-Z][A-Z0-9_]{1,63}$/;
export const AWS_REGION_PATTERN = /^[a-z]{2}-[a-z]+-\d+$/;

export const stageAnswersSchema = z.object({
  name: z
    .string()
    .regex(STAGE_NAME_PATTERN, "Stage name must be a lowercase slug")
    .refine((name) => !name.startsWith("rev-"), {
      message: "Stage names starting with rev- are reserved for pull-request previews",
    }),
  productionLevel: z.boolean(),
  az: z.number().int().min(2).max(3),
  nat: z.enum(NAT_MODES),
  bastion: z.boolean(),
  flowLogs: z.boolean(),
  vpcEndpoints: z.boolean(),
  scalingMinAcu: z.number().min(0).max(128),
  scalingMaxAcu: z.number().min(0).max(128),
  pauseAfter: z.string().regex(PAUSE_AFTER_PATTERN).nullable(),
  replicas: z.number().int().min(0).max(5),
  proxy: z.boolean(),
  instanceClass: z.enum(RDS_INSTANCE_CLASSES),
  backupRetentionDays: z.number().int().min(1).max(35),
  deletionProtection: z.boolean(),
  finalSnapshot: z.boolean(),
  performanceInsights: z.boolean(),
  offsiteBackups: z.boolean(),
  kmsDeletionWindowDays: z.number().int().min(7).max(30),
  postgresLogRetentionDays: z.number().int().min(1).max(3653),
});

export type StageAnswers = z.infer<typeof stageAnswersSchema>;

export const secretAnswersSchema = z.object({
  key: z.string().regex(SECRET_KEY_PATTERN, "Secret keys must be UPPER_SNAKE_CASE"),
  required: z.boolean(),
  generate: z.boolean(),
});

export type SecretAnswers = z.infer<typeof secretAnswersSchema>;

export const answersSchema = z
  .object({
    version: z.literal(1),
    projectName: z
      .string()
      .regex(
        PROJECT_SLUG_PATTERN,
        "Project name must be a lowercase slug, 2–30 characters",
      ),
    displayName: z.string().min(1).max(80),
    targetDirectory: z.string().min(1),
    mode: z.enum(["quick", "advanced"]),
    awsRegion: z.string().regex(AWS_REGION_PATTERN, "Not a valid AWS region id"),
    backupReplicaRegion: z.string().regex(AWS_REGION_PATTERN),
    rootDomain: z.string().regex(DOMAIN_PATTERN, "Not a valid DNS name"),
    reviewStages: z.boolean(),
    gitInit: z.boolean(),
    npmInstall: z.boolean(),
    generateWorkflows: z.boolean(),
    database: z.object({
      kind: z.enum(DATABASE_KINDS),
      name: z
        .string()
        .regex(/^[a-z][a-z0-9_]{0,30}$/, "Database name must be a postgres identifier"),
      version: z.string().min(1),
      encryption: z.enum(DB_ENCRYPTION_MODES),
    }),
    stages: z.array(stageAnswersSchema).min(1),
    s3: z.object({
      bucketPrefix: z
        .string()
        .regex(BUCKET_PREFIX_PATTERN, "Bucket prefix must be a valid S3 name fragment"),
      versioning: z.boolean(),
      encryption: z.enum(S3_ENCRYPTION_MODES),
      noncurrentVersionExpirationDays: z.number().int().min(1).max(3650).nullable(),
      intelligentTiering: z.boolean(),
      abortIncompleteMultipartDays: z.number().int().min(1).max(30),
    }),
    secrets: z.array(secretAnswersSchema),
  })
  .superRefine((value, ctx) => {
    const names = value.stages.map((stage) => stage.name);
    if (new Set(names).size !== names.length) {
      ctx.addIssue({
        code: "custom",
        path: ["stages"],
        message: "Stage names must be unique",
      });
    }

    if (!value.stages.some((stage) => stage.productionLevel)) {
      ctx.addIssue({
        code: "custom",
        path: ["stages"],
        message: "At least one stage must be marked production-level",
      });
    }

    if (value.backupReplicaRegion === value.awsRegion) {
      const usesOffsite = value.stages.some((stage) => stage.offsiteBackups);
      if (usesOffsite) {
        ctx.addIssue({
          code: "custom",
          path: ["backupReplicaRegion"],
          message: "Offsite backups need a replica region different from the primary",
        });
      }
    }

    for (const [index, stage] of value.stages.entries()) {
      if (stage.scalingMaxAcu < stage.scalingMinAcu) {
        ctx.addIssue({
          code: "custom",
          path: ["stages", index, "scalingMaxAcu"],
          message: "Max ACU must be at least min ACU",
        });
      }

      if (stage.proxy && stage.scalingMinAcu === 0) {
        ctx.addIssue({
          code: "custom",
          path: ["stages", index, "proxy"],
          message:
            "RDS Proxy holds pooled connections, so min ACU cannot be 0 (Aurora will never pause)",
        });
      }

      if (value.database.kind === "none") {
        if (stage.proxy) {
          ctx.addIssue({
            code: "custom",
            path: ["stages", index, "proxy"],
            message: "RDS Proxy requires a database",
          });
        }
      }
    }

    const secretKeys = value.secrets.map((secret) => secret.key);
    if (new Set(secretKeys).size !== secretKeys.length) {
      ctx.addIssue({
        code: "custom",
        path: ["secrets"],
        message: "Secret keys must be unique",
      });
    }
  });

export type Answers = z.infer<typeof answersSchema>;

export function displayNameFromSlug(slug: string): string {
  return slug
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function defaultDatabaseName(slug: string): string {
  return slug.replace(/-/g, "_").slice(0, 31);
}

export function productionStageDefaults(): StageAnswers {
  return {
    name: "production",
    productionLevel: true,
    az: 3,
    nat: "ec2",
    bastion: true,
    flowLogs: true,
    vpcEndpoints: false,
    scalingMinAcu: 1,
    scalingMaxAcu: 32,
    pauseAfter: null,
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
  };
}

export function nonProductionStageDefaults(name: string): StageAnswers {
  const pauseAfter = name === "staging" ? "4 hours" : "30 minutes";
  const backupRetentionDays = name === "staging" ? 7 : 1;

  return {
    name,
    productionLevel: false,
    az: 2,
    nat: "ec2",
    bastion: true,
    flowLogs: false,
    vpcEndpoints: false,
    scalingMinAcu: 0,
    scalingMaxAcu: 8,
    pauseAfter,
    replicas: 0,
    proxy: false,
    instanceClass: "t4g.micro",
    backupRetentionDays,
    deletionProtection: false,
    finalSnapshot: false,
    performanceInsights: false,
    offsiteBackups: false,
    kmsDeletionWindowDays: 7,
    postgresLogRetentionDays: 7,
  };
}

export function quickPreset(input: {
  projectName: string;
  displayName: string;
  targetDirectory: string;
  rootDomain?: string;
}): Answers {
  const projectName = input.projectName;
  return {
    version: 1,
    projectName,
    displayName: input.displayName,
    targetDirectory: input.targetDirectory,
    mode: "quick",
    awsRegion: "eu-central-1",
    backupReplicaRegion: "eu-west-1",
    rootDomain: input.rootDomain ?? `${projectName}.example`,
    reviewStages: false,
    gitInit: true,
    npmInstall: true,
    generateWorkflows: true,
    database: {
      kind: "aurora-serverless-v2",
      name: defaultDatabaseName(projectName),
      version: "17.4",
      encryption: "cmk",
    },
    stages: [
      nonProductionStageDefaults("dev"),
      nonProductionStageDefaults("staging"),
      productionStageDefaults(),
    ],
    s3: {
      bucketPrefix: `${projectName}-files`,
      versioning: true,
      encryption: "cmk",
      noncurrentVersionExpirationDays: null,
      intelligentTiering: false,
      abortIncompleteMultipartDays: 7,
    },
    secrets: [
      {
        key: "EXAMPLE_API_KEY",
        required: true,
        generate: false,
      },
    ],
  };
}

export function parseAnswers(input: unknown): Answers {
  return answersSchema.parse(input);
}
