# bootstrap-root-project

Shared AWS infrastructure: the VPC, the PostgreSQL database, the files
bucket, and the KMS keys that protect them. Nothing application-specific lives
here.

Each stage publishes what it created to a single SSM parameter,
`/bootstrap/<stage>/root`, and `bootstrap-app` reads that parameter instead of
creating its own VPC or database.

Stage differences live in the `STAGE_CONFIG` table at the top of
`sst.config.ts` (inside the `bootstrap-init:generated` region). Change
behaviour there, not inline in the resource definitions.

See [`docs/configuration.md`](docs/configuration.md) for every setting and
[`docs/costs.md`](docs/costs.md) for the generation-time cost estimate.

## Related repositories

| Repository | Responsibility |
| --- | --- |
| `bootstrap-root-project` | VPC, database, buckets, KMS, backups (this repo) |
| `bootstrap-vault` | Writes `/bootstrap/<stage>/config/*` and `/bootstrap/<stage>/secret/*` |
| `bootstrap-app` | The Next.js application, reads `/bootstrap/<stage>/root` |

Deploy order for a new stage: vault first (so `ROOT_DOMAIN` exists), then this
repo, then the app.

## Prerequisites

- Node.js 24
- AWS credentials for the target account
- `/bootstrap/<stage>/config/ROOT_DOMAIN` present in SSM — create it through
  `bootstrap-vault`
- A Route 53 hosted zone for that domain (CAA records are written here)

## Deploying

```bash
npx sst diff --stage staging
npx sst deploy --stage staging
```

Unknown stage names inherit the fallback (usually `dev`) shape with DNS
management disabled, so a typo like `--stage prodution` cannot clobber
production.

## Connecting to the database

The cluster has no public endpoint. Human access goes through the bastion over
**SSH via `sst tunnel`** — not SSM Session Manager. With EC2 NAT the NAT
instance doubles as the bastion; port 22 is open to the internet and gated by
the SST SSH key.

```bash
sudo npx sst tunnel install
npx sst tunnel --stage staging
```

Credentials live in the Secrets Manager secret whose ARN is published at
`/bootstrap/<stage>/root`.

## Teardown

```bash
npx sst remove --stage staging
```

Production-level stages are deployed with `protect: true` and
`removal: "retain-all"`. Non-production buckets use SST's `forceDestroy`, so
removing a stage deletes every object version.

## After a fresh Aurora deploy

1. Reboot the cluster so `shared_preload_libraries` picks up `pgaudit`.
2. Run `CREATE EXTENSION pgaudit;` in the application database.
