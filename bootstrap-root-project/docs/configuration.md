# Configuration reference

Everything here describes `sst.config.ts`. For deploy instructions see the
[README](../README.md).

## Design principles

**One table controls stage differences.** `STAGE_CONFIG` in the generated
region holds every per-stage value. Resource definitions read from it.

**Unknown stages are safe by construction.** A stage name that is not in
`STAGE_CONFIG` inherits the fallback (first non-production-level) shape with
`manageCaaRecords: false` and `productionLevel: false`.

**Production-level stages are not removable.** `removal: "retain-all"` plus
`protect: true`. `retain-all` is required because SST's `retain` would keep
the encrypted cluster while scheduling deletion of the KMS key.

## Networking

A single VPC, `10.0.0.0/16` (hardcoded by `sst.aws.Vpc`). NAT is either EC2
(`t4g.nano` fck-nat, ~$3/AZ/month) or a managed NAT Gateway (~$33/AZ/month).
With EC2 NAT the instance doubles as the bastion; `sst tunnel` is SSH to its
public IP, not Session Manager.

Bastion is optional. When disabled, there is no SSH ingress and no tunnel.

Interface VPC endpoints (KMS, SSM, Secrets Manager) are optional at ~$7 each
per month.

## Database

Three shapes, selected by `DATABASE.kind`:

- `aurora-serverless-v2` — Aurora PostgreSQL, ACU scaling, optional pause
- `rds-postgres` — a single RDS instance (`instanceClass`); `replicas > 0`
  turns on Multi-AZ
- `none` — no VPC and no database; this repo still creates the bucket

RDS Proxy is per-stage. A proxy holds pooled connections, so Aurora will not
auto-pause; the generated config refuses `proxy: true` with `min: "0 ACU"`.

Storage encryption is either a customer-managed KMS key (~$1/month) or the
AWS-managed `aws/rds` key.

Postgres CloudWatch logs get an explicit retention period. Leaving that unset
is how log groups grow without bound.

## Object storage

One versioned (optional) bucket named `<prefix>-<stage>`. Encryption is
SSE-KMS with a CMK or SSE-S3. Lifecycle rules abort incomplete multipart
uploads and optionally expire noncurrent versions and transition to
Intelligent-Tiering.

## SSM contract

Published at `/bootstrap/<stage>/root` as JSON:

```
{
  vpc: { id, securityGroups: { app, migration, database } } | null,
  database: { kind, id, secretArn, kmsKeyArn, proxy },
  buckets: { filesName, filesPrefix, kmsKeyArn }
}
```

`vpc` is `null` when `DATABASE.kind` is `none`. `kmsKeyArn` is `""` when the
matching resource uses an AWS-managed key.

The contract is additive: new fields may appear, but existing ones keep their
shape.
