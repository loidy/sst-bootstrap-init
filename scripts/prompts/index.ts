import * as p from "@clack/prompts";
import {
  AWS_REGIONS,
  BUCKET_PREFIX_PATTERN,
  DOMAIN_PATTERN,
  PROJECT_SLUG_PATTERN,
  RDS_INSTANCE_CLASSES,
  SECRET_KEY_PATTERN,
  STAGE_NAME_PATTERN,
  defaultDatabaseName,
  displayNameFromSlug,
  nonProductionStageDefaults,
  productionStageDefaults,
  type Answers,
  type DatabaseKind,
  type NatMode,
  type SecretAnswers,
  type StageAnswers,
} from "../answers.ts";
import { formatUsd, natDeltaUsd, proxyDeltaUsd } from "../cost.ts";
import { UserCancelledError } from "../util/log.ts";

async function asked<T>(value: T | symbol): Promise<T> {
  if (p.isCancel(value)) {
    throw new UserCancelledError();
  }
  return value;
}

function parsePositiveInt(raw: string, min: number, max: number): number | string {
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) {
    return `Enter an integer between ${min} and ${max}`;
  }
  return value;
}

export async function promptProject(): Promise<{
  projectName: string;
  displayName: string;
  targetDirectory: string;
  mode: "quick" | "advanced";
}> {
  const projectName = await asked(
    await p.text({
      message: "Project name (slug)",
      placeholder: "acme",
      validate: (value) => {
        if (!PROJECT_SLUG_PATTERN.test(value.trim())) {
          return "Lowercase slug, 2–30 characters, starting with a letter";
        }
      },
    }),
  );

  const slug = projectName.trim();
  const displayName = await asked(
    await p.text({
      message: "Display name",
      initialValue: displayNameFromSlug(slug),
      validate: (value) => (value.trim() ? undefined : "Required"),
    }),
  );

  const targetDirectory = await asked(
    await p.text({
      message: "Target directory (project folders are created inside it)",
      initialValue: `../${slug}`,
      validate: (value) => (value.trim() ? undefined : "Required"),
    }),
  );

  const mode = await asked(
    await p.select({
      message: "Setup mode",
      options: [
        {
          value: "quick" as const,
          label: "Quick",
          hint: "eu-central-1, dev/staging/production, Aurora scale-to-zero, EC2 NAT, no proxy",
        },
        {
          value: "advanced" as const,
          label: "Advanced",
          hint: "Every cost lever: NAT, ACU, proxy, encryption, S3, backups, review stages",
        },
      ],
    }),
  );

  return {
    projectName: slug,
    displayName: displayName.trim(),
    targetDirectory: targetDirectory.trim(),
    mode,
  };
}

async function promptRegion(initial: string): Promise<string> {
  const preset = await asked(
    await p.select({
      message: "Default AWS region",
      options: [
        ...AWS_REGIONS.map((region) => ({
          value: region,
          label: region,
        })),
        { value: "other", label: "Other region…" },
      ],
      initialValue: AWS_REGIONS.includes(initial as (typeof AWS_REGIONS)[number])
        ? initial
        : "eu-central-1",
    }),
  );

  if (preset !== "other") {
    return preset;
  }

  return (
    await asked(
      await p.text({
        message: "AWS region id",
        placeholder: "ap-south-1",
        validate: (value) =>
          /^[a-z]{2}-[a-z]+-\d+$/.test(value.trim()) ? undefined : "e.g. eu-central-1",
      }),
    )
  ).trim();
}

async function promptStages(): Promise<StageAnswers[]> {
  const countRaw = await asked(
    await p.text({
      message: "How many named environments?",
      initialValue: "3",
      validate: (value) => {
        const parsed = parsePositiveInt(value, 1, 8);
        return typeof parsed === "string" ? parsed : undefined;
      },
    }),
  );
  const count = Number(countRaw);
  const defaultNames = ["dev", "staging", "production"];
  const stages: StageAnswers[] = [];

  for (let index = 0; index < count; index += 1) {
    const suggested = defaultNames[index] ?? `stage${index + 1}`;
    const name = (
      await asked(
        await p.text({
          message: `Environment ${index + 1} name`,
          initialValue: suggested,
          validate: (value) => {
            if (!STAGE_NAME_PATTERN.test(value.trim()) || value.trim().startsWith("rev-")) {
              return "Lowercase slug; names starting with rev- are reserved";
            }
            if (stages.some((stage) => stage.name === value.trim())) {
              return "Already used";
            }
          },
        }),
      )
    ).trim();

    const productionLevel = await asked(
      await p.confirm({
        message: `Is "${name}" production-level (protect + retain-all, no accidental teardown)?`,
        initialValue: name === "production" || index === count - 1,
      }),
    );

    const base = productionLevel
      ? { ...productionStageDefaults(), name, productionLevel: true }
      : { ...nonProductionStageDefaults(name), name, productionLevel: false };

    const customize = await asked(
      await p.confirm({
        message: `Customize cost settings for "${name}"?`,
        initialValue: false,
      }),
    );

    stages.push(customize ? await promptStageDetails(base) : base);
  }

  if (!stages.some((stage) => stage.productionLevel)) {
    p.log.warn("Marking the last environment as production-level (at least one is required).");
    const last = stages[stages.length - 1]!;
    Object.assign(last, {
      productionLevel: true,
      deletionProtection: true,
      finalSnapshot: true,
      kmsDeletionWindowDays: 30,
    });
  }

  return stages;
}

async function promptStageDetails(base: StageAnswers): Promise<StageAnswers> {
  const azRaw = await asked(
    await p.select({
      message: `${base.name}: availability zones (multiplies NAT cost)`,
      options: [
        { value: "2", label: "2 AZs", hint: `EC2 NAT ~${formatUsd(3.1 * 2)} / NAT GW ~${formatUsd(32.9 * 2)}` },
        { value: "3", label: "3 AZs", hint: `EC2 NAT ~${formatUsd(3.1 * 3)} / NAT GW ~${formatUsd(32.9 * 3)}` },
      ],
      initialValue: String(base.az),
    }),
  );
  const az = Number(azRaw) as 2 | 3;

  const nat = await asked(
    await p.select({
      message: `${base.name}: NAT mode (~10× difference)`,
      options: [
        {
          value: "ec2" as NatMode,
          label: "EC2 NAT (fck-nat t4g.nano)",
          hint: `~${formatUsd(3.1 * az)}/mo for ${az} AZ`,
        },
        {
          value: "managed" as NatMode,
          label: "Managed NAT Gateway",
          hint: `~${formatUsd(32.9 * az)}/mo (+${formatUsd(natDeltaUsd("ec2", "managed", az))} vs EC2)`,
        },
      ],
      initialValue: base.nat,
    }),
  );

  const bastion = await asked(
    await p.confirm({
      message: `${base.name}: enable bastion for \`sst tunnel\` (SSH, not SSM)?${nat === "ec2" ? " (EC2 NAT already doubles as bastion — no extra instance)" : " (~$3/mo extra instance)"}`,
      initialValue: base.bastion,
    }),
  );

  const flowLogs = await asked(
    await p.confirm({
      message: `${base.name}: VPC flow logs (~$8/mo CloudWatch ingestion)?`,
      initialValue: base.flowLogs,
    }),
  );

  const vpcEndpoints = await asked(
    await p.confirm({
      message: `${base.name}: interface VPC endpoints for KMS/SSM/Secrets Manager (~$22/mo vs NAT data processing)?`,
      initialValue: base.vpcEndpoints,
    }),
  );

  const scalingMinAcu = Number(
    await asked(
      await p.text({
        message: `${base.name}: Aurora min ACU (0 enables scale-to-zero; 1 ACU ≈ $88/mo always-on)`,
        initialValue: String(base.scalingMinAcu),
        validate: (value) => {
          const n = Number(value);
          if (!Number.isFinite(n) || n < 0 || n > 128) {
            return "0–128";
          }
        },
      }),
    ),
  );

  const scalingMaxAcu = Number(
    await asked(
      await p.text({
        message: `${base.name}: Aurora max ACU`,
        initialValue: String(Math.max(base.scalingMaxAcu, scalingMinAcu)),
        validate: (value) => {
          const n = Number(value);
          if (!Number.isFinite(n) || n < scalingMinAcu || n > 128) {
            return `Between ${scalingMinAcu} and 128`;
          }
        },
      }),
    ),
  );

  let pauseAfter: string | null = base.pauseAfter;
  if (scalingMinAcu === 0) {
    const pause = await asked(
      await p.select({
        message: `${base.name}: auto-pause after idle`,
        options: [
          { value: "30 minutes", label: "30 minutes" },
          { value: "1 hour", label: "1 hour" },
          { value: "4 hours", label: "4 hours" },
          { value: "none", label: "Never (still scales to 0 ACU but stays resumed)" },
        ],
        initialValue: base.pauseAfter ?? "30 minutes",
      }),
    );
    pauseAfter = pause === "none" ? null : pause;
  } else {
    pauseAfter = null;
  }

  const replicas = Number(
    await asked(
      await p.text({
        message: `${base.name}: read replicas (Aurora) / Multi-AZ flag if >0 (RDS). Each replica ≈ the writer cost.`,
        initialValue: String(base.replicas),
        validate: (value) => {
          const parsed = parsePositiveInt(value, 0, 5);
          return typeof parsed === "string" ? parsed : undefined;
        },
      }),
    ),
  );

  const proxyDelta = proxyDeltaUsd(true, scalingMinAcu);
  const proxy = await asked(
    await p.confirm({
      message: `${base.name}: RDS Proxy? Warning: holds pooled connections, so Aurora will not pause. ≈ ${formatUsd(proxyDelta)}/mo extra${scalingMinAcu === 0 ? " (includes pinning 1 ACU)" : ""}.`,
      initialValue: false,
    }),
  );

  const instanceClass = await asked(
    await p.select({
      message: `${base.name}: RDS instance class (ignored for Aurora)`,
      options: RDS_INSTANCE_CLASSES.map((value) => ({ value, label: value })),
      initialValue: base.instanceClass,
    }),
  );

  const backupRetentionDays = Number(
    await asked(
      await p.text({
        message: `${base.name}: automated backup retention (days)`,
        initialValue: String(base.backupRetentionDays),
        validate: (value) => {
          const parsed = parsePositiveInt(value, 1, 35);
          return typeof parsed === "string" ? parsed : undefined;
        },
      }),
    ),
  );

  const deletionProtection = await asked(
    await p.confirm({
      message: `${base.name}: deletion protection?`,
      initialValue: base.deletionProtection,
    }),
  );

  const finalSnapshot = await asked(
    await p.confirm({
      message: `${base.name}: final snapshot on delete?`,
      initialValue: base.finalSnapshot,
    }),
  );

  const performanceInsights = await asked(
    await p.confirm({
      message: `${base.name}: Performance Insights (~$7/mo beyond the 7-day free tier)?`,
      initialValue: base.performanceInsights,
    }),
  );

  const offsiteBackups = await asked(
    await p.confirm({
      message: `${base.name}: offsite AWS Backup + cross-region copy (duplicates storage)?`,
      initialValue: base.offsiteBackups,
    }),
  );

  const kmsDeletionWindowDays = Number(
    await asked(
      await p.text({
        message: `${base.name}: KMS key deletion window (days)`,
        initialValue: String(base.kmsDeletionWindowDays),
        validate: (value) => {
          const parsed = parsePositiveInt(value, 7, 30);
          return typeof parsed === "string" ? parsed : undefined;
        },
      }),
    ),
  );

  const postgresLogRetentionDays = Number(
    await asked(
      await p.text({
        message: `${base.name}: Postgres CloudWatch log retention (days). Unset in many stacks → unbounded cost.`,
        initialValue: String(base.postgresLogRetentionDays),
        validate: (value) => {
          const parsed = parsePositiveInt(value, 1, 3653);
          return typeof parsed === "string" ? parsed : undefined;
        },
      }),
    ),
  );

  return {
    ...base,
    az,
    nat,
    bastion,
    flowLogs,
    vpcEndpoints,
    scalingMinAcu: proxy ? Math.max(scalingMinAcu, 1) : scalingMinAcu,
    scalingMaxAcu,
    pauseAfter: proxy ? null : pauseAfter,
    replicas,
    proxy,
    instanceClass,
    backupRetentionDays,
    deletionProtection,
    finalSnapshot,
    performanceInsights,
    offsiteBackups,
    kmsDeletionWindowDays,
    postgresLogRetentionDays,
  };
}

async function promptDatabase(slug: string): Promise<Answers["database"]> {
  const kind = await asked(
    await p.select({
      message: "Database",
      options: [
        {
          value: "aurora-serverless-v2" as DatabaseKind,
          label: "Aurora Serverless v2 (Postgres)",
          hint: "Scales to zero on non-prod; production min 1 ACU ≈ $88/mo",
        },
        {
          value: "rds-postgres" as DatabaseKind,
          label: "RDS Postgres (single instance)",
          hint: "t4g.micro ≈ $12/mo; Multi-AZ doubles it",
        },
        {
          value: "none" as DatabaseKind,
          label: "No AWS database",
          hint: "Local Docker / bring-your-own; no VPC NAT cost",
        },
      ],
    }),
  );

  const name = (
    await asked(
      await p.text({
        message: "Database name",
        initialValue: defaultDatabaseName(slug),
        validate: (value) =>
          /^[a-z][a-z0-9_]{0,30}$/.test(value.trim())
            ? undefined
            : "Postgres identifier: lowercase, digits, underscore",
      }),
    )
  ).trim();

  let encryption: Answers["database"]["encryption"] = "cmk";
  if (kind !== "none") {
    encryption = await asked(
      await p.select({
        message: "Database encryption (~$1/mo per customer-managed key, per stage)",
        options: [
          {
            value: "cmk" as const,
            label: "Customer-managed KMS key",
            hint: "Key policy control, rotation, ~$1/key/month",
          },
          {
            value: "aws-managed" as const,
            label: "AWS-managed key",
            hint: "Free, no custom key policy",
          },
        ],
      }),
    );
  }

  return { kind, name, version: "17.4", encryption };
}

async function promptS3(slug: string): Promise<Answers["s3"]> {
  const bucketPrefix = (
    await asked(
      await p.text({
        message: "S3 bucket prefix (stage is appended: prefix-dev)",
        initialValue: `${slug}-files`,
        validate: (value) =>
          BUCKET_PREFIX_PATTERN.test(value.trim()) ? undefined : "Valid S3 name fragment",
      }),
    )
  ).trim();

  const versioning = await asked(
    await p.confirm({
      message: "Enable S3 versioning? (storage grows with every overwrite unless you expire noncurrent versions)",
      initialValue: true,
    }),
  );

  const encryption = await asked(
    await p.select({
      message: "S3 encryption",
      options: [
        { value: "cmk" as const, label: "SSE-KMS customer-managed key", hint: "~$1/key/month + API" },
        { value: "sse-s3" as const, label: "SSE-S3 (AES-256)", hint: "Free" },
      ],
    }),
  );

  let noncurrentVersionExpirationDays: number | null = null;
  if (versioning) {
    const expire = await asked(
      await p.confirm({
        message: "Expire noncurrent versions? (recommended — otherwise versioning is unbounded)",
        initialValue: false,
      }),
    );
    if (expire) {
      noncurrentVersionExpirationDays = Number(
        await asked(
          await p.text({
            message: "Expire noncurrent versions after (days)",
            initialValue: "90",
            validate: (value) => {
              const parsed = parsePositiveInt(value, 1, 3650);
              return typeof parsed === "string" ? parsed : undefined;
            },
          }),
        ),
      );
    }
  }

  const intelligentTiering = await asked(
    await p.confirm({
      message: "S3 Intelligent-Tiering (monitor charge, cheaper for cold objects)?",
      initialValue: false,
    }),
  );

  const abortIncompleteMultipartDays = Number(
    await asked(
      await p.text({
        message: "Abort incomplete multipart uploads after (days)",
        initialValue: "7",
        validate: (value) => {
          const parsed = parsePositiveInt(value, 1, 30);
          return typeof parsed === "string" ? parsed : undefined;
        },
      }),
    ),
  );

  return {
    bucketPrefix,
    versioning,
    encryption,
    noncurrentVersionExpirationDays,
    intelligentTiering,
    abortIncompleteMultipartDays,
  };
}

async function promptSecrets(): Promise<SecretAnswers[]> {
  const secrets: SecretAnswers[] = [
    { key: "EXAMPLE_API_KEY", required: true, generate: false },
  ];

  p.log.info("The vault always writes ROOT_DOMAIN. One example secret is included.");

  while (
    await asked(
      await p.confirm({
        message: "Add another vault secret?",
        initialValue: false,
      }),
    )
  ) {
    const key = (
      await asked(
        await p.text({
          message: "Secret key (UPPER_SNAKE_CASE)",
          placeholder: "STRIPE_API_KEY",
          validate: (value) => {
            if (!SECRET_KEY_PATTERN.test(value.trim())) {
              return "UPPER_SNAKE_CASE";
            }
            if (secrets.some((secret) => secret.key === value.trim())) {
              return "Already added";
            }
          },
        }),
      )
    ).trim();
    const required = await asked(
      await p.confirm({
        message: `${key}: required at deploy time?`,
        initialValue: true,
      }),
    );
    const generate = await asked(
      await p.confirm({
        message: `${key}: auto-generate a random value if unset (persisted in SST state)?`,
        initialValue: false,
      }),
    );
    secrets.push({ key, required, generate });
  }

  return secrets;
}

export async function promptAdvanced(base: {
  projectName: string;
  displayName: string;
  targetDirectory: string;
}): Promise<Answers> {
  const awsRegion = await promptRegion("eu-central-1");
  const rootDomain = (
    await asked(
      await p.text({
        message: "Root domain (Route 53 hosted zone must already exist)",
        initialValue: `${base.projectName}.example`,
        validate: (value) =>
          DOMAIN_PATTERN.test(value.trim()) ? undefined : "e.g. app.example.com",
      }),
    )
  ).trim();

  const stages = await promptStages();

  let backupReplicaRegion = awsRegion === "eu-central-1" ? "eu-west-1" : "eu-central-1";
  if (stages.some((stage) => stage.offsiteBackups)) {
    backupReplicaRegion = await promptRegion(backupReplicaRegion);
    if (backupReplicaRegion === awsRegion) {
      p.log.warn("Replica region matches primary — offsite copies would stay in-region.");
    }
  }

  const database = await promptDatabase(base.projectName);
  if (database.kind === "none") {
    for (const stage of stages) {
      stage.proxy = false;
      stage.replicas = 0;
      stage.offsiteBackups = false;
      stage.flowLogs = false;
      stage.vpcEndpoints = false;
    }
  } else {
    for (const stage of stages) {
      if (stage.proxy && stage.scalingMinAcu === 0) {
        stage.scalingMinAcu = 1;
        stage.pauseAfter = null;
      }
    }
  }

  const s3 = await promptS3(base.projectName);
  const reviewStages = await asked(
    await p.confirm({
      message:
        "Enable ephemeral review / PR stages? Each open PR stands up a VPC, NAT and database.",
      initialValue: false,
    }),
  );

  const secrets = await promptSecrets();

  const generateWorkflows = await asked(
    await p.confirm({
      message: "Generate GitHub Actions deploy workflows (OIDC)?",
      initialValue: true,
    }),
  );
  const gitInit = await asked(
    await p.confirm({
      message: "Run git init in each generated repo?",
      initialValue: true,
    }),
  );
  const npmInstall = await asked(
    await p.confirm({
      message: "Run npm install in each generated repo?",
      initialValue: true,
    }),
  );

  return {
    version: 1,
    projectName: base.projectName,
    displayName: base.displayName,
    targetDirectory: base.targetDirectory,
    mode: "advanced",
    awsRegion,
    backupReplicaRegion,
    rootDomain,
    reviewStages,
    gitInit,
    npmInstall,
    generateWorkflows,
    database,
    stages,
    s3,
    secrets,
  };
}

export async function promptConfirm(summary: string): Promise<boolean> {
  p.note(summary, "Summary");
  return asked(
    await p.confirm({
      message: "Generate the project?",
      initialValue: true,
    }),
  );
}
