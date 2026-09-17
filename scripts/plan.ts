import type { Answers, DatabaseKind, NatMode, StageAnswers } from "./answers.ts";

export type ResolvedNames = {
  slug: string;
  displayName: string;
  appDir: string;
  rootDir: string;
  vaultDir: string;
  appPackage: string;
  rootPackage: string;
  vaultPackage: string;
  databasePackageScope: string;
};

export type PlannedStage = StageAnswers & {
  githubEnvironment: string;
  deployTrigger: DeployTrigger;
};

export type DeployTrigger =
  | { kind: "push-main" }
  | { kind: "push-branches"; patterns: string[] }
  | { kind: "push-tags"; patterns: string[] };

export type ProjectPlan = {
  names: ResolvedNames;
  targetDirectory: string;
  awsRegion: string;
  backupReplicaRegion: string;
  rootDomain: string;
  reviewStages: boolean;
  gitInit: boolean;
  npmInstall: boolean;
  generateWorkflows: boolean;
  database: Answers["database"];
  s3: Answers["s3"];
  secrets: Answers["secrets"];
  stages: PlannedStage[];
  fallbackStageName: string;
};

export function githubEnvironmentFor(stage: StageAnswers): string {
  if (stage.name === "dev") {
    return "development";
  }
  return stage.name;
}

export function deployTriggerFor(
  stage: StageAnswers,
  stages: StageAnswers[],
): DeployTrigger {
  if (stage.productionLevel) {
    return stage.name === "production"
      ? { kind: "push-tags", patterns: ["v*"] }
      : { kind: "push-tags", patterns: [`${stage.name}-*`] };
  }

  const nonProd = stages.filter((candidate) => !candidate.productionLevel);
  const isPrimaryDev = nonProd[0]?.name === stage.name;

  if (isPrimaryDev) {
    return { kind: "push-main" };
  }

  if (stage.name === "staging") {
    return { kind: "push-branches", patterns: ["staging"] };
  }

  return { kind: "push-branches", patterns: [`${stage.name}/*`] };
}

export function fallbackStageName(stages: StageAnswers[]): string {
  return stages.find((stage) => !stage.productionLevel)?.name ?? stages[0]!.name;
}

export function buildPlan(answers: Answers): ProjectPlan {
  const slug = answers.projectName;
  return {
    names: {
      slug,
      displayName: answers.displayName,
      appDir: `${slug}-app`,
      rootDir: `${slug}-root-project`,
      vaultDir: `${slug}-vault`,
      appPackage: `${slug}-app`,
      rootPackage: `${slug}-root-project`,
      vaultPackage: `${slug}-vault`,
      databasePackageScope: `@${slug}/database`,
    },
    targetDirectory: answers.targetDirectory,
    awsRegion: answers.awsRegion,
    backupReplicaRegion: answers.backupReplicaRegion,
    rootDomain: answers.rootDomain,
    reviewStages: answers.reviewStages,
    gitInit: answers.gitInit,
    npmInstall: answers.npmInstall,
    generateWorkflows: answers.generateWorkflows,
    database: answers.database,
    s3: answers.s3,
    secrets: answers.secrets,
    stages: answers.stages.map((stage) => ({
      ...stage,
      githubEnvironment: githubEnvironmentFor(stage),
      deployTrigger: deployTriggerFor(stage, answers.stages),
    })),
    fallbackStageName: fallbackStageName(answers.stages),
  };
}

export function acuLiteral(value: number): `${number} ACU` {
  return `${value} ACU`;
}

export function databaseKindLabel(kind: DatabaseKind): string {
  switch (kind) {
    case "aurora-serverless-v2":
      return "Aurora Serverless v2 (Postgres)";
    case "rds-postgres":
      return "RDS Postgres (single instance)";
    case "none":
      return "No AWS database (local / bring-your-own)";
  }
}

export function natLabel(nat: NatMode): string {
  return nat === "ec2" ? "EC2 NAT (fck-nat t4g.nano)" : "Managed NAT Gateway";
}
