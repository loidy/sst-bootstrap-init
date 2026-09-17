import type { Answers, SecretAnswers, StageAnswers } from "../answers.ts";
import { acuLiteral } from "../plan.ts";

function indent(value: string, spaces: number): string {
  const pad = " ".repeat(spaces);
  return value
    .split("\n")
    .map((line) => (line.length === 0 ? line : pad + line))
    .join("\n");
}

function emitPauseAfter(pauseAfter: string | null): string {
  if (!pauseAfter) {
    return "";
  }
  return `, pauseAfter: "${pauseAfter}"`;
}

function emitStageConfig(stage: StageAnswers): string {
  return `${stage.name}: {
    productionLevel: ${stage.productionLevel},
    az: ${stage.az},
    nat: "${stage.nat}",
    bastion: ${stage.bastion},
    flowLogs: ${stage.flowLogs},
    vpcEndpoints: ${stage.vpcEndpoints},
    scaling: { min: "${acuLiteral(stage.scalingMinAcu)}", max: "${acuLiteral(stage.scalingMaxAcu)}"${emitPauseAfter(stage.pauseAfter)} },
    replicas: ${stage.replicas},
    proxy: ${stage.proxy},
    instanceClass: "${stage.instanceClass}",
    backupRetentionDays: ${stage.backupRetentionDays},
    deletionProtection: ${stage.deletionProtection},
    finalSnapshot: ${stage.finalSnapshot},
    performanceInsights: ${stage.performanceInsights},
    offsiteBackups: ${stage.offsiteBackups},
    kmsDeletionWindowDays: ${stage.kmsDeletionWindowDays},
    postgresLogRetentionDays: ${stage.postgresLogRetentionDays},
    manageCaaRecords: true,
  }`;
}

function emitSecret(secret: SecretAnswers): string {
  const resourceName = secret.key
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
  return `{ key: "${secret.key}", resourceName: "${resourceName}", required: ${secret.required}, generate: ${secret.generate} }`;
}

export function emitRootGenerated(answers: Answers): string {
  const stages = answers.stages.map((stage) => emitStageConfig(stage)).join(",\n");
  return `const APP_PREFIX = "${answers.projectName}";
const AWS_REGION = process.env.AWS_REGION ?? "${answers.awsRegion}";
const BACKUP_REPLICA_REGION = process.env.BACKUP_REPLICA_REGION ?? "${answers.backupReplicaRegion}";
const DATABASE = {
  kind: "${answers.database.kind}",
  version: "${answers.database.version}",
  name: "${answers.database.name}",
  encryption: "${answers.database.encryption}",
} as const;
const BUCKET = {
  prefix: "${answers.s3.bucketPrefix}",
  versioning: ${answers.s3.versioning},
  encryption: "${answers.s3.encryption}",
  noncurrentVersionExpirationDays: ${answers.s3.noncurrentVersionExpirationDays},
  intelligentTiering: ${answers.s3.intelligentTiering},
  abortIncompleteMultipartDays: ${answers.s3.abortIncompleteMultipartDays},
} as const;
const STAGE_CONFIG = {
${indent(stages, 2)},
} satisfies Record<string, StageConfig>;`;
}

export function emitVaultGenerated(answers: Answers): string {
  const stages = answers.stages
    .map(
      (stage) =>
        `${stage.name}: { productionLevel: ${stage.productionLevel}, kmsDeletionWindowDays: ${stage.kmsDeletionWindowDays} }`,
    )
    .join(",\n");
  const secrets = answers.secrets.map((secret) => emitSecret(secret)).join(",\n");
  return `const APP_PREFIX = "${answers.projectName}";
const AWS_REGION = process.env.AWS_REGION ?? "${answers.awsRegion}";
const ENCRYPTION = "${answers.database.encryption}" as const;
const STAGE_CONFIG = {
${indent(stages, 2)},
} satisfies Record<string, StageConfig>;
const SECRETS = [
${indent(secrets.length > 0 ? secrets : "", 2)}${secrets.length > 0 ? "," : ""}
] as const;`;
}

export function emitAppGenerated(answers: Answers): string {
  const stages = answers.stages
    .map((stage) => `${stage.name}: { productionLevel: ${stage.productionLevel} }`)
    .join(",\n");
  return `const APP_PREFIX = "${answers.projectName}";
const AWS_REGION = process.env.AWS_REGION ?? "${answers.awsRegion}";
const DATABASE = {
  kind: "${answers.database.kind}",
  version: "${answers.database.version}",
  name: "${answers.database.name}",
} as const;
const STAGE_CONFIG = {
${indent(stages, 2)},
} satisfies Record<string, { productionLevel: boolean }>;`;
}
