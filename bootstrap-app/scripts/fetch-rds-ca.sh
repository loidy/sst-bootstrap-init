#!/usr/bin/env bash
set -euo pipefail
# Amazon RDS / Aurora CA bundle. Required for sslmode=verify-full against
# remote databases. Not vendored — fetch before the first remote deploy.
mkdir -p certificates
curl -fsSL -o certificates/global-bundle.pem \
  https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem
echo "Wrote certificates/global-bundle.pem"
