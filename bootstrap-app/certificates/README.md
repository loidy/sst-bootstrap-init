This directory holds the Amazon RDS CA bundle used for `sslmode=verify-full`.

```bash
bash scripts/fetch-rds-ca.sh
```

The file is gitignored (`*.pem`). CI fetches it before `sst deploy`.
