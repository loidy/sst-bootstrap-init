import type { PlannedStage, ProjectPlan } from "../plan.ts";

function awsRegionFallback(plan: ProjectPlan): string {
  return plan.awsRegion;
}

function onBlock(stage: PlannedStage): string {
  switch (stage.deployTrigger.kind) {
    case "push-main":
      return `on:
  push:
    branches: [main]`;
    case "push-branches":
      return `on:
  push:
    branches: [${stage.deployTrigger.patterns.map((pattern) => `"${pattern}"`).join(", ")}]`;
    case "push-tags":
      return `on:
  push:
    tags: [${stage.deployTrigger.patterns.map((pattern) => `"${pattern}"`).join(", ")}]`;
  }
}

function vaultSecretEnv(plan: ProjectPlan): string {
  return plan.secrets
    .map((secret) => `          ${secret.key}: \${{ secrets.${secret.key} }}`)
    .join("\n");
}

function titleCase(name: string): string {
  return name
    .split(/[-_]/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function vaultCiWorkflow(): string {
  return `name: CI

on:
  workflow_call:

permissions:
  contents: read

jobs:
  ci:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6

      - uses: actions/setup-node@v6
        with:
          node-version: "24"
          cache: npm

      - run: npm ci --prefer-offline

      - run: npm run lint

      - run: npm run build
`;
}

export function appCiWorkflow(): string {
  return `name: CI

on:
  workflow_call:
  push:
    branches: [main]
  pull_request:

permissions:
  contents: read

jobs:
  ci:
    runs-on: ubuntu-latest
    env:
      DATABASE_URL: postgresql://ci:ci@localhost:5432/ci
      NEXT_PUBLIC_APP_URL: http://localhost:3000
    steps:
      - uses: actions/checkout@v6

      - uses: actions/setup-node@v6
        with:
          node-version: "24"
          cache: npm

      - run: npm ci --prefer-offline

      - run: npx prisma generate
      - run: npm run lint
      - run: npm run typecheck
      - run: npm test
      - run: npm run build
`;
}

export function emitRootDeployWorkflow(plan: ProjectPlan, stage: PlannedStage): string {
  const label = titleCase(stage.githubEnvironment);
  return `name: Deploy ${stage.name}

${onBlock(stage)}

permissions:
  contents: read
  id-token: write

concurrency:
  group: deploy-${stage.name}
  cancel-in-progress: false

jobs:
  deploy:
    runs-on: ubuntu-latest
    environment:
      name: ${stage.githubEnvironment}
    steps:
      - uses: actions/checkout@v6
        with:
          fetch-depth: 0

      - uses: actions/setup-node@v6
        with:
          node-version: "24"
          cache: npm

      - name: Configure AWS credentials (OIDC)
        uses: aws-actions/configure-aws-credentials@v6
        with:
          role-to-assume: \${{ secrets.AWS_ROLE_ARN }}
          aws-region: \${{ vars.AWS_REGION || '${awsRegionFallback(plan)}' }}

      - run: npm ci --prefer-offline

      - name: Deploy to ${stage.name}
        env:
          AWS_REGION: \${{ vars.AWS_REGION || '${awsRegionFallback(plan)}' }}
          ROOT_DOMAIN: \${{ vars.ROOT_DOMAIN }}
        run: npx sst deploy --stage ${stage.name} --verbose --print-logs

      - name: Deployment summary
        run: |
          {
            echo "## ${label} deployment"
            echo ""
            echo "- Stage: ${stage.name}"
          } >> "\${GITHUB_STEP_SUMMARY}"
`;
}

export function emitVaultDeployWorkflow(plan: ProjectPlan, stage: PlannedStage): string {
  const secretEnv = vaultSecretEnv(plan);
  return `name: Deploy ${stage.name}

${onBlock(stage)}

permissions:
  contents: read
  id-token: write

concurrency:
  group: deploy-${stage.name}
  cancel-in-progress: false

jobs:
  test:
    uses: ./.github/workflows/ci.yml

  deploy:
    needs: test
    runs-on: ubuntu-latest
    environment: ${stage.githubEnvironment}
    steps:
      - uses: actions/checkout@v6

      - uses: actions/setup-node@v6
        with:
          node-version: "24"
          cache: npm

      - name: Configure AWS credentials (OIDC)
        uses: aws-actions/configure-aws-credentials@v6
        with:
          role-to-assume: \${{ secrets.AWS_ROLE_ARN }}
          aws-region: \${{ vars.AWS_REGION || '${awsRegionFallback(plan)}' }}

      - run: npm ci --prefer-offline

      - name: Deploy to ${stage.name}
        env:
          ROOT_DOMAIN: \${{ vars.ROOT_DOMAIN }}
${secretEnv}
          AWS_REGION: \${{ vars.AWS_REGION || '${awsRegionFallback(plan)}' }}
        run: npx sst deploy --stage ${stage.name} --verbose --print-logs
`;
}

export function emitAppDeployWorkflow(plan: ProjectPlan, stage: PlannedStage): string {
  return `name: Deploy ${stage.name}

${onBlock(stage)}

permissions:
  contents: read
  id-token: write

concurrency:
  group: deploy-${stage.name}
  cancel-in-progress: false

jobs:
  test:
    uses: ./.github/workflows/ci.yml

  deploy:
    needs: test
    runs-on: ubuntu-latest
    environment:
      name: ${stage.githubEnvironment}
      url: \${{ steps.deploy.outputs.url }}
    steps:
      - uses: actions/checkout@v6

      - uses: actions/setup-node@v6
        with:
          node-version: "24"
          cache: npm

      - name: Configure AWS credentials (OIDC)
        uses: aws-actions/configure-aws-credentials@v6
        with:
          role-to-assume: \${{ secrets.AWS_ROLE_ARN }}
          aws-region: \${{ vars.AWS_REGION || '${awsRegionFallback(plan)}' }}

      - run: npm ci --prefer-offline

      - name: Fetch RDS CA bundle
        run: bash scripts/fetch-rds-ca.sh

      - name: Deploy to ${stage.name}
        id: deploy
        env:
          AWS_REGION: \${{ vars.AWS_REGION || '${awsRegionFallback(plan)}' }}
        run: |
          set -euo pipefail
          npx sst deploy --stage ${stage.name} --verbose --print-logs
          if [[ ! -f .sst/outputs.json ]]; then
            echo "SST outputs file not found at .sst/outputs.json" >&2
            exit 1
          fi
          url="$(jq -r '.url // empty' .sst/outputs.json)"
          if [[ -z "\${url}" ]]; then
            echo "Failed to read deployment URL from .sst/outputs.json." >&2
            exit 1
          fi
          echo "url=\${url}" >> "\${GITHUB_OUTPUT}"
          {
            echo "## ${titleCase(stage.githubEnvironment)} deployment"
            echo ""
            echo "- Stage: ${stage.name}"
            echo "- URL: \${url}"
          } >> "\${GITHUB_STEP_SUMMARY}"
`;
}

function reviewSlugSteps(): string {
  return `        run: |
          set -euo pipefail
          slug=$(echo "$HEAD_REF" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9]/-/g' | sed 's/-\\+/-/g' | sed 's/^-//;s/-$//' | cut -c1-40 | sed 's/-$//')
          echo "branch_slug=$slug" >> "$GITHUB_OUTPUT"
          echo "sst_stage=rev-$slug" >> "$GITHUB_OUTPUT"`;
}

export function emitVaultReviewWorkflow(plan: ProjectPlan): string {
  const secretEnv = vaultSecretEnv(plan);
  return `name: Deploy review

on:
  pull_request:
    types: [opened, synchronize, reopened]

permissions:
  contents: read
  id-token: write

concurrency:
  group: deploy-review-\${{ github.event.pull_request.number }}
  cancel-in-progress: false

jobs:
  test:
    uses: ./.github/workflows/ci.yml

  prepare_stage:
    runs-on: ubuntu-latest
    outputs:
      branch_slug: \${{ steps.slug.outputs.branch_slug }}
      sst_stage: \${{ steps.slug.outputs.sst_stage }}
    steps:
      - name: Prepare stage name
        id: slug
        env:
          HEAD_REF: \${{ github.head_ref }}
${reviewSlugSteps()}

  deploy:
    needs: [test, prepare_stage]
    runs-on: ubuntu-latest
    environment: review/\${{ needs.prepare_stage.outputs.branch_slug }}
    steps:
      - uses: actions/checkout@v6

      - uses: actions/setup-node@v6
        with:
          node-version: "24"
          cache: npm

      - name: Configure AWS credentials (OIDC)
        uses: aws-actions/configure-aws-credentials@v6
        with:
          role-to-assume: \${{ secrets.AWS_ROLE_ARN }}
          aws-region: \${{ vars.AWS_REGION || '${awsRegionFallback(plan)}' }}

      - run: npm ci --prefer-offline

      - name: Deploy review stage
        env:
          ROOT_DOMAIN: \${{ vars.ROOT_DOMAIN }}
${secretEnv}
          AWS_REGION: \${{ vars.AWS_REGION || '${awsRegionFallback(plan)}' }}
        run: npx sst deploy --stage \${{ needs.prepare_stage.outputs.sst_stage }} --verbose --print-logs
`;
}

export function emitAppReviewWorkflow(plan: ProjectPlan): string {
  return `name: Deploy review

on:
  pull_request:
    types: [opened, synchronize, reopened]

permissions:
  contents: read
  id-token: write

concurrency:
  group: deploy-review-\${{ github.event.pull_request.number }}
  cancel-in-progress: false

jobs:
  test:
    uses: ./.github/workflows/ci.yml

  prepare_stage:
    runs-on: ubuntu-latest
    outputs:
      branch_slug: \${{ steps.slug.outputs.branch_slug }}
      sst_stage: \${{ steps.slug.outputs.sst_stage }}
    steps:
      - name: Prepare stage name
        id: slug
        env:
          HEAD_REF: \${{ github.head_ref }}
${reviewSlugSteps()}

  deploy:
    needs: [test, prepare_stage]
    runs-on: ubuntu-latest
    environment:
      name: review/\${{ needs.prepare_stage.outputs.branch_slug }}
      url: \${{ steps.deploy.outputs.url }}
    steps:
      - uses: actions/checkout@v6

      - uses: actions/setup-node@v6
        with:
          node-version: "24"
          cache: npm

      - name: Configure AWS credentials (OIDC)
        uses: aws-actions/configure-aws-credentials@v6
        with:
          role-to-assume: \${{ secrets.AWS_ROLE_ARN }}
          aws-region: \${{ vars.AWS_REGION || '${awsRegionFallback(plan)}' }}

      - run: npm ci --prefer-offline

      - name: Fetch RDS CA bundle
        run: bash scripts/fetch-rds-ca.sh

      - name: Deploy review stage
        id: deploy
        env:
          AWS_REGION: \${{ vars.AWS_REGION || '${awsRegionFallback(plan)}' }}
          ROOT_STAGE: ${plan.fallbackStageName}
        run: |
          set -euo pipefail
          npx sst deploy --stage "\${{ needs.prepare_stage.outputs.sst_stage }}" --verbose --print-logs
          url="$(jq -r '.url // empty' .sst/outputs.json)"
          echo "url=\${url}" >> "\${GITHUB_OUTPUT}"
`;
}

export function emitRemoveReviewWorkflow(plan: ProjectPlan, extraEnv: string): string {
  return `name: Remove review

on:
  pull_request:
    types: [closed]
    branches: [main]

permissions:
  contents: read
  id-token: write
  deployments: write
  actions: write

concurrency:
  group: deploy-review-\${{ github.event.pull_request.number }}
  cancel-in-progress: false

jobs:
  prepare_stage:
    runs-on: ubuntu-latest
    outputs:
      branch_slug: \${{ steps.slug.outputs.branch_slug }}
      sst_stage: \${{ steps.slug.outputs.sst_stage }}
    steps:
      - name: Prepare stage name
        id: slug
        env:
          HEAD_REF: \${{ github.head_ref }}
${reviewSlugSteps()}

  remove:
    needs: prepare_stage
    runs-on: ubuntu-latest
    environment: review/\${{ needs.prepare_stage.outputs.branch_slug }}
    steps:
      - uses: actions/checkout@v6

      - uses: actions/setup-node@v6
        with:
          node-version: "24"
          cache: npm

      - name: Configure AWS credentials (OIDC)
        uses: aws-actions/configure-aws-credentials@v6
        with:
          role-to-assume: \${{ secrets.AWS_ROLE_ARN }}
          aws-region: \${{ vars.AWS_REGION || '${awsRegionFallback(plan)}' }}

      - run: npm ci --prefer-offline

      - name: Remove review stage
        env:
${extraEnv}
          AWS_REGION: \${{ vars.AWS_REGION || '${awsRegionFallback(plan)}' }}
        run: npx sst remove --stage \${{ needs.prepare_stage.outputs.sst_stage }} --verbose --print-logs

  delete_github_environment:
    needs: [prepare_stage, remove]
    if: always() && needs.prepare_stage.result == 'success'
    runs-on: ubuntu-latest
    steps:
      - name: Remove review deployments and environment
        uses: actions/github-script@v8
        env:
          ENVIRONMENT_NAME: review/\${{ needs.prepare_stage.outputs.branch_slug }}
        with:
          github-token: \${{ secrets.GH_CLEANUP_TOKEN || github.token }}
          script: |
            const { owner, repo } = context.repo;
            const name = process.env.ENVIRONMENT_NAME;
            const deployments = await github.paginate(
              github.rest.repos.listDeployments,
              { owner, repo, environment: name, per_page: 100 },
            );
            for (const deployment of deployments) {
              try {
                await github.rest.repos.createDeploymentStatus({
                  owner, repo, deployment_id: deployment.id, state: "inactive",
                });
              } catch (error) {
                core.warning(error.message);
              }
              try {
                await github.rest.repos.deleteDeployment({
                  owner, repo, deployment_id: deployment.id,
                });
              } catch (error) {
                core.warning(error.message);
              }
            }
            try {
              await github.rest.repos.deleteAnEnvironment({
                owner, repo, environment_name: name,
              });
            } catch (error) {
              if (error.status !== 404) throw error;
            }
`;
}

export function emitRootReviewWorkflow(plan: ProjectPlan): string {
  return `name: Deploy review

on:
  pull_request:
    types: [opened, synchronize, reopened]

permissions:
  contents: read
  id-token: write

concurrency:
  group: deploy-review-\${{ github.event.pull_request.number }}
  cancel-in-progress: false

jobs:
  prepare_stage:
    runs-on: ubuntu-latest
    outputs:
      branch_slug: \${{ steps.slug.outputs.branch_slug }}
      sst_stage: \${{ steps.slug.outputs.sst_stage }}
    steps:
      - name: Prepare stage name
        id: slug
        env:
          HEAD_REF: \${{ github.head_ref }}
${reviewSlugSteps()}

  deploy:
    needs: prepare_stage
    runs-on: ubuntu-latest
    environment: review/\${{ needs.prepare_stage.outputs.branch_slug }}
    steps:
      - uses: actions/checkout@v6

      - uses: actions/setup-node@v6
        with:
          node-version: "24"
          cache: npm

      - name: Configure AWS credentials (OIDC)
        uses: aws-actions/configure-aws-credentials@v6
        with:
          role-to-assume: \${{ secrets.AWS_ROLE_ARN }}
          aws-region: \${{ vars.AWS_REGION || '${awsRegionFallback(plan)}' }}

      - run: npm ci --prefer-offline

      - name: Deploy review stage
        env:
          AWS_REGION: \${{ vars.AWS_REGION || '${awsRegionFallback(plan)}' }}
          ROOT_DOMAIN: \${{ vars.ROOT_DOMAIN }}
          ROOT_STAGE: ${plan.fallbackStageName}
        run: npx sst deploy --stage \${{ needs.prepare_stage.outputs.sst_stage }} --verbose --print-logs
`;
}

export function workflowFilename(stage: PlannedStage): string {
  return `deploy-${stage.name}.yml`;
}
