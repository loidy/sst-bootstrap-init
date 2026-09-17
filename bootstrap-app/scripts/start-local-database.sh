#!/usr/bin/env bash
# Start a docker/podman container for local development Postgres.
# `sst dev` starts this via the LocalDB command unless USE_REMOTE_DB=true.

set -euo pipefail

if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

DATABASE_URL="${DATABASE_URL:-postgresql://postgres:postgres@localhost:5432/bootstrap}"
DB_PASSWORD=$(echo "$DATABASE_URL" | awk -F':' '{print $3}' | awk -F'@' '{print $1}')
DB_PORT=$(echo "$DATABASE_URL" | awk -F':' '{print $4}' | awk -F'\/' '{print $1}')
DB_NAME=$(echo "$DATABASE_URL" | awk -F'/' '{print $4}')
DB_CONTAINER_NAME="bootstrap-local-pg"

if ! [ -x "$(command -v docker)" ] && ! [ -x "$(command -v podman)" ]; then
  echo "Docker or Podman is not installed."
  exit 1
fi

if [ -x "$(command -v docker)" ]; then
  DOCKER_CMD="docker"
else
  DOCKER_CMD="podman"
fi

if ! $DOCKER_CMD info > /dev/null 2>&1; then
  echo "$DOCKER_CMD daemon is not running."
  exit 1
fi

if [ "$($DOCKER_CMD ps -q -f name=$DB_CONTAINER_NAME)" ]; then
  echo "Database container '$DB_CONTAINER_NAME' already running"
  exit 0
fi

if [ "$($DOCKER_CMD ps -q -a -f name=$DB_CONTAINER_NAME)" ]; then
  $DOCKER_CMD start "$DB_CONTAINER_NAME"
  echo "Existing database container '$DB_CONTAINER_NAME' started"
  exit 0
fi

$DOCKER_CMD run -d \
  --name "$DB_CONTAINER_NAME" \
  -e POSTGRES_USER="postgres" \
  -e POSTGRES_PASSWORD="$DB_PASSWORD" \
  -e POSTGRES_DB="$DB_NAME" \
  -p "$DB_PORT":5432 \
  docker.io/postgres:17.4 && echo "Database container '$DB_CONTAINER_NAME' was successfully created"
