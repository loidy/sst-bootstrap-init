/// <reference path="./.sst/platform/config.d.ts" />

type StageConfig = {
  productionLevel: boolean;
  kmsDeletionWindowDays: number;
};

type SecretSpec = {
  key: string;
  resourceName: string;
  required: boolean;
  generate: boolean;
};

// #region bootstrap-init:generated — re-run bootstrap-init to regenerate, or edit by hand
const APP_PREFIX = "bootstrap";
const AWS_REGION = process.env.AWS_REGION ?? "eu-central-1";
const ENCRYPTION = "cmk" as const;
const STAGE_CONFIG = {
  production: { productionLevel: true, kmsDeletionWindowDays: 30 },
  staging: { productionLevel: false, kmsDeletionWindowDays: 7 },
  dev: { productionLevel: false, kmsDeletionWindowDays: 7 },
} satisfies Record<string, StageConfig>;
const SECRETS = [
  { key: "EXAMPLE_API_KEY", resourceName: "ExampleApiKey", required: true, generate: false },
] as const;
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

  return { ...STAGE_CONFIG[fallbackStageName()], productionLevel: false };
}

function configParameterName(stage: string, key: string): string {
  return `/${APP_PREFIX}/${stage}/config/${key}`;
}

function secretParameterName(stage: string, key: string): string {
  return `/${APP_PREFIX}/${stage}/secret/${key}`;
}

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim() || undefined;
  if (!value) {
    throw new Error(`${name} environment variable is required`);
  }
  return value;
}

function optionalEnv(name: string): string | undefined {
  return process.env[name]?.trim() || undefined;
}

export default $config({
  app(input) {
    const stage = input?.stage ?? "";
    const config = resolveStageConfig(stage);

    return {
      name: "bootstrap-vault",
      removal: config.productionLevel ? "retain-all" : "remove",
      protect: config.productionLevel,
      home: "aws",
      providers: {
        aws: {
          region: AWS_REGION,
        },
        random: "4.19.2",
      },
    };
  },
  async run() {
    const stage = $app.stage;
    const config = resolveStageConfig(stage);

    const ROOT_DOMAIN = requiredEnv("ROOT_DOMAIN");

    const ssmKmsKey =
      ENCRYPTION === "cmk"
        ? new aws.kms.Key("SsmEncryptionKmsKey", {
            description: "KMS key for SSM SecureString parameters",
            deletionWindowInDays: config.kmsDeletionWindowDays,
            enableKeyRotation: true,
          })
        : undefined;

    if (ssmKmsKey) {
      new aws.kms.Alias("SsmEncryptionKmsAlias", {
        name: `alias/${APP_PREFIX}/${stage}/ssm`,
        targetKeyId: ssmKmsKey.keyId,
      });
    }

    new aws.ssm.Parameter("RootDomain", {
      name: configParameterName(stage, "ROOT_DOMAIN"),
      type: aws.ssm.ParameterType.String,
      value: ROOT_DOMAIN,
      overwrite: true,
    });

    function putSecret(
      name: string,
      key: string,
      value: $util.Input<string>,
    ) {
      new aws.ssm.Parameter(name, {
        name: secretParameterName(stage, key),
        type: aws.ssm.ParameterType.SecureString,
        keyId: ssmKmsKey?.arn,
        value,
        overwrite: true,
      });
    }

    for (const secret of SECRETS as readonly SecretSpec[]) {
      let value: $util.Input<string> | undefined;
      if (secret.required) {
        value = requiredEnv(secret.key);
      } else {
        value = optionalEnv(secret.key);
      }

      if (!value && secret.generate) {
        value = new random.RandomBytes(`Generated${secret.resourceName}`, {
          length: 32,
        }).hex;
      }

      if (!value) {
        if (secret.required) {
          throw new Error(`${secret.key} is required`);
        }
        continue;
      }

      putSecret(secret.resourceName, secret.key, value);
    }
  },
});
