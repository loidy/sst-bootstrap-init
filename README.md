# bootstrap-init

Generates a three-repo SST project from the templates in this directory:

| Folder | Responsibility |
| --- | --- |
| `bootstrap-app` | Next.js application |
| `bootstrap-root-project` | VPC, database, S3, KMS |
| `bootstrap-vault` | Stage-scoped SSM config and secrets |

The wizard copies those templates, rewrites identity tokens (`bootstrap` → your
project slug), and writes a generated config region into each `sst.config.ts`
from the answers you give.

## Usage

```bash
npm install
npm run init
```

Non-interactive:

```bash
npm run init -- --config examples/quick.answers.json --yes
npm run init -- --config answers.json --dry-run
```

Every successful run writes `<target>/bootstrap-init.answers.json` so you can
regenerate or diff later.

## Quick vs advanced

Quick mode uses a cost-conscious preset: `eu-central-1`, stages `dev` /
`staging` / `production`, Aurora Serverless v2 that scales to zero on non-prod,
no RDS Proxy, EC2 NAT (the NAT instance doubles as the bastion), customer-managed
KMS keys, one versioned SSE-KMS bucket.

Advanced mode asks about every lever that changes the monthly bill — NAT mode,
AZ count, Aurora capacity and pause, RDS Proxy, read replicas, encryption,
S3 versioning and lifecycle, backups, VPC endpoints, flow logs, and review
stages.

## Templates

The three `bootstrap-*` folders are the source of truth and stay valid,
lintable TypeScript. Do not turn them into EJS. Identity is the literal
`bootstrap` naming convention; everything else lives in the
`// #region bootstrap-init:generated` block at the top of each `sst.config.ts`.

## Development

```bash
npm run lint
npm run typecheck
npm test
```

`npx sst diff` against a real AWS account is a manual last-mile check and needs
credentials.
