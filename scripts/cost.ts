import type { Answers, DatabaseKind, NatMode, StageAnswers } from "./answers.ts";

/** Static list prices, USD / month, eu-central-1-ish. Estimates, not quotes. */
export const PRICES = {
  natEc2PerAz: 3.1,
  natManagedPerAz: 32.9,
  auroraAcuHour: 0.12,
  hoursPerMonth: 730,
  rdsInstance: {
    "t4g.micro": 12.4,
    "t4g.small": 24.8,
    "t4g.medium": 49.6,
    "m6g.large": 89.0,
    "r6g.large": 166.0,
  } as Record<string, number>,
  rdsMultiAzMultiplier: 2,
  rdsProxyPerMonth: 22,
  auroraReplicaFactor: 1,
  kmsKey: 1,
  secretsManager: 0.4,
  vpcEndpoint: 7.3,
  vpcEndpointCount: 3,
  flowLogs: 8,
  performanceInsights: 7,
  backupGbMonth: 0.021,
  assumedDbGb: 20,
  offsiteCopyMultiplier: 2.2,
  s3StorageGb: 0.023,
  assumedS3Gb: 20,
} as const;

export type StageCostLine = {
  label: string;
  monthlyUsd: number;
};

export type StageCost = {
  stage: string;
  productionLevel: boolean;
  lines: StageCostLine[];
  monthlyUsd: number;
};

export type CostEstimate = {
  stages: StageCost[];
  shared: StageCostLine[];
  monthlyUsd: number;
  biggestLevers: string[];
};

function auroraCapacityUsd(stage: StageAnswers): number {
  if (stage.scalingMinAcu === 0 && stage.pauseAfter) {
    // Paused most of the month; keep a small residual for resume spikes.
    return PRICES.auroraAcuHour * PRICES.hoursPerMonth * 0.05;
  }
  return PRICES.auroraAcuHour * PRICES.hoursPerMonth * stage.scalingMinAcu;
}

function databaseLines(answers: Answers, stage: StageAnswers): StageCostLine[] {
  const kind: DatabaseKind = answers.database.kind;
  if (kind === "none") {
    return [];
  }

  const lines: StageCostLine[] = [];

  if (kind === "aurora-serverless-v2") {
    lines.push({
      label: `Aurora capacity (min ${stage.scalingMinAcu} ACU)`,
      monthlyUsd: auroraCapacityUsd(stage),
    });
    if (stage.replicas > 0) {
      lines.push({
        label: `Aurora read replicas ×${stage.replicas}`,
        monthlyUsd: auroraCapacityUsd(stage) * stage.replicas,
      });
    }
  } else {
    const instance = PRICES.rdsInstance[stage.instanceClass] ?? 12.4;
    const multiAz = stage.replicas > 0;
    lines.push({
      label: `RDS ${stage.instanceClass}${multiAz ? " Multi-AZ" : ""}`,
      monthlyUsd: instance * (multiAz ? PRICES.rdsMultiAzMultiplier : 1),
    });
  }

  if (stage.proxy) {
    lines.push({
      label: "RDS Proxy",
      monthlyUsd: PRICES.rdsProxyPerMonth,
    });
  }

  if (stage.performanceInsights) {
    lines.push({
      label: "Performance Insights",
      monthlyUsd: PRICES.performanceInsights,
    });
  }

  const backupUsd =
    PRICES.backupGbMonth * PRICES.assumedDbGb * (stage.backupRetentionDays / 7);
  lines.push({
    label: `Automated backups (${stage.backupRetentionDays}d)`,
    monthlyUsd: backupUsd,
  });

  if (stage.offsiteBackups) {
    lines.push({
      label: "Offsite AWS Backup + cross-region copy",
      monthlyUsd: backupUsd * PRICES.offsiteCopyMultiplier,
    });
  }

  return lines;
}

function networkLines(stage: StageAnswers, hasDatabase: boolean): StageCostLine[] {
  if (!hasDatabase) {
    return [];
  }

  const natPerAz =
    stage.nat === "managed" ? PRICES.natManagedPerAz : PRICES.natEc2PerAz;
  const lines: StageCostLine[] = [
    {
      label: `${stage.nat === "managed" ? "NAT Gateway" : "EC2 NAT"} × ${stage.az} AZ`,
      monthlyUsd: natPerAz * stage.az,
    },
  ];

  if (stage.nat === "managed" && stage.bastion) {
    lines.push({
      label: "Dedicated bastion (t4g.nano)",
      monthlyUsd: PRICES.natEc2PerAz,
    });
  }

  if (stage.vpcEndpoints) {
    lines.push({
      label: `VPC interface endpoints ×${PRICES.vpcEndpointCount}`,
      monthlyUsd: PRICES.vpcEndpoint * PRICES.vpcEndpointCount,
    });
  }

  if (stage.flowLogs) {
    lines.push({
      label: "VPC flow logs",
      monthlyUsd: PRICES.flowLogs,
    });
  }

  return lines;
}

function kmsKeyCount(answers: Answers): number {
  let count = 0;
  if (answers.database.kind !== "none" && answers.database.encryption === "cmk") {
    count += 1;
  }
  if (answers.s3.encryption === "cmk") {
    count += 1;
  }
  count += 1; // vault SSM key (skipped later if aws-managed vault — we always create CMK for SSM in templates when encryption is cmk-like)
  return count;
}

export function estimateCost(answers: Answers): CostEstimate {
  const hasDatabase = answers.database.kind !== "none";
  const stages: StageCost[] = answers.stages.map((stage) => {
    const lines = [
      ...networkLines(stage, hasDatabase),
      ...databaseLines(answers, stage),
    ];
    const monthlyUsd = lines.reduce((sum, line) => sum + line.monthlyUsd, 0);
    return {
      stage: stage.name,
      productionLevel: stage.productionLevel,
      lines,
      monthlyUsd,
    };
  });

  const keys = kmsKeyCount(answers);
  const shared: StageCostLine[] = [
    {
      label: `KMS customer-managed keys ×${keys} (per stage)`,
      monthlyUsd: PRICES.kmsKey * keys * answers.stages.length,
    },
    {
      label: "Secrets Manager (Aurora/RDS master secret)",
      monthlyUsd: hasDatabase ? PRICES.secretsManager * answers.stages.length : 0,
    },
    {
      label: `S3 (~${PRICES.assumedS3Gb} GB${answers.s3.versioning ? ", versioned" : ""})`,
      monthlyUsd:
        PRICES.s3StorageGb *
        PRICES.assumedS3Gb *
        (answers.s3.versioning ? 1.4 : 1) *
        answers.stages.length,
    },
  ].filter((line) => line.monthlyUsd > 0);

  const monthlyUsd =
    stages.reduce((sum, stage) => sum + stage.monthlyUsd, 0) +
    shared.reduce((sum, line) => sum + line.monthlyUsd, 0);

  return {
    stages,
    shared,
    monthlyUsd,
    biggestLevers: biggestLevers(answers),
  };
}

export function formatUsd(value: number): string {
  if (value === 0) {
    return "$0";
  }
  if (value < 1) {
    return `$${value.toFixed(2)}`;
  }
  return `$${value.toFixed(0)}`;
}

export function biggestLevers(answers: Answers): string[] {
  const levers: string[] = [];
  const hasProxy = answers.stages.some((stage) => stage.proxy);
  if (hasProxy) {
    levers.push(
      "RDS Proxy pins Aurora at ≥1 ACU and adds a fixed hourly charge — the largest 'looks cheap' toggle.",
    );
  }
  if (answers.stages.some((stage) => stage.nat === "managed")) {
    levers.push(
      "Managed NAT Gateway is ~10× EC2 NAT per AZ (about $33 vs $3).",
    );
  }
  if (answers.reviewStages) {
    levers.push(
      "Each open PR stands up a VPC, NAT and database — review stages multiply the bill by the number of PRs.",
    );
  }
  if (
    answers.database.kind === "aurora-serverless-v2" &&
    answers.stages.some((stage) => stage.scalingMinAcu >= 1)
  ) {
    levers.push(
      "Aurora min ACU is billed 24/7. 1 ACU is ~$88/month before replicas.",
    );
  }
  if (answers.stages.some((stage) => stage.offsiteBackups)) {
    levers.push(
      "Cross-region AWS Backup duplicates storage and adds transfer.",
    );
  }
  if (levers.length === 0) {
    levers.push(
      "NAT instance count (AZ × stages) and Aurora min ACU dominate a small bill.",
    );
  }
  return levers;
}

export function natDeltaUsd(from: NatMode, to: NatMode, az: number): number {
  const price = (mode: NatMode) =>
    mode === "managed" ? PRICES.natManagedPerAz : PRICES.natEc2PerAz;
  return (price(to) - price(from)) * az;
}

export function proxyDeltaUsd(enabled: boolean, minAcu: number): number {
  if (!enabled) {
    return 0;
  }
  const pinnedAcu = minAcu === 0 ? 1 : minAcu;
  const extraAcu =
    minAcu === 0 ? PRICES.auroraAcuHour * PRICES.hoursPerMonth * pinnedAcu : 0;
  return PRICES.rdsProxyPerMonth + extraAcu;
}

export function formatCostMarkdown(answers: Answers, estimate: CostEstimate): string {
  const lines: string[] = [
    "# Cost estimate",
    "",
    "Static list-price estimate in USD / month, not a quote. Data transfer,",
    "CloudWatch ingestion and S3 request charges are omitted. Prices assume",
    `\`${answers.awsRegion}\` and ~${PRICES.assumedDbGb} GB of database storage.`,
    "",
    `**Estimated total: ${formatUsd(estimate.monthlyUsd)} / month** across ${answers.stages.length} named stage(s).`,
    "",
  ];

  for (const stage of estimate.stages) {
    lines.push(`## \`${stage.stage}\`${stage.productionLevel ? " (production-level)" : ""}`);
    lines.push("");
    lines.push("| Item | USD / month |");
    lines.push("| --- | ---: |");
    for (const line of stage.lines) {
      lines.push(`| ${line.label} | ${formatUsd(line.monthlyUsd)} |`);
    }
    lines.push(`| **Stage subtotal** | **${formatUsd(stage.monthlyUsd)}** |`);
    lines.push("");
  }

  if (estimate.shared.length > 0) {
    lines.push("## Shared / per-stage overhead");
    lines.push("");
    lines.push("| Item | USD / month |");
    lines.push("| --- | ---: |");
    for (const line of estimate.shared) {
      lines.push(`| ${line.label} | ${formatUsd(line.monthlyUsd)} |`);
    }
    lines.push("");
  }

  lines.push("## Biggest levers");
  lines.push("");
  for (const lever of estimate.biggestLevers) {
    lines.push(`- ${lever}`);
  }
  lines.push("");

  if (answers.reviewStages) {
    lines.push(
      "Review / PR stages are **not** included in the total. Each one costs about as much as the fallback (usually `dev`) stage for as long as the PR is open.",
    );
    lines.push("");
  }

  return lines.join("\n");
}

export function formatCostSummary(estimate: CostEstimate): string {
  const rows = estimate.stages.map(
    (stage) => `  ${stage.stage.padEnd(16)} ${formatUsd(stage.monthlyUsd).padStart(8)} / mo`,
  );
  return [
    `Estimated monthly spend: ${formatUsd(estimate.monthlyUsd)}`,
    ...rows,
    "",
    "Biggest levers:",
    ...estimate.biggestLevers.map((lever) => `  - ${lever}`),
  ].join("\n");
}
