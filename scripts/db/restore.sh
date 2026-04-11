#!/usr/bin/env bash
# DB Restore Script — T-1507
# Restores a pg_dump custom-format backup.
#
# Usage:
#   bash scripts/db/restore.sh <backup-file>
#   bash scripts/db/restore.sh s3://my-bucket/playerco_20260101T000000Z.dump
#
# Required env vars:
#   DB_HOST, DB_NAME, DB_USER, DB_PASSWORD
#
# Optional env vars:
#   BACKUP_GPG_KEY — GPG key to decrypt .gpg files

set -euo pipefail

BACKUP_FILE="${1:?Usage: restore.sh <backup-file>}"

: "${DB_HOST:?DB_HOST is required}"
: "${DB_NAME:?DB_NAME is required}"
: "${DB_USER:?DB_USER is required}"
: "${DB_PASSWORD:?DB_PASSWORD is required}"
DB_PORT="${DB_PORT:-5432}"

LOCAL_FILE="${BACKUP_FILE}"

# Download from S3 if needed
if [[ "${BACKUP_FILE}" == s3://* ]] || [[ "${BACKUP_FILE}" == r2://* ]]; then
  LOCAL_FILE="/tmp/restore_$(basename "${BACKUP_FILE}")"
  echo "[restore] Downloading ${BACKUP_FILE} → ${LOCAL_FILE}"
  aws s3 cp "${BACKUP_FILE}" "${LOCAL_FILE}" --no-progress
fi

# Decrypt if GPG-encrypted
if [[ "${LOCAL_FILE}" == *.gpg ]]; then
  DECRYPTED="${LOCAL_FILE%.gpg}"
  echo "[restore] Decrypting ${LOCAL_FILE}"
  gpg --decrypt --output "${DECRYPTED}" "${LOCAL_FILE}"
  LOCAL_FILE="${DECRYPTED}"
fi

echo "[restore] Restoring ${LOCAL_FILE} → ${DB_NAME}@${DB_HOST}"
echo "[restore] WARNING: This will overwrite existing data. Press Ctrl+C to abort (5s)..."
sleep 5

PGPASSWORD="${DB_PASSWORD}" pg_restore \
  --host="${DB_HOST}" \
  --port="${DB_PORT}" \
  --username="${DB_USER}" \
  --dbname="${DB_NAME}" \
  --clean \
  --if-exists \
  --no-owner \
  --no-privileges \
  --verbose \
  "${LOCAL_FILE}"

echo "[restore] Done. Running migration verification..."

# Verify migrations are up to date (indexer migrate check)
if command -v node &>/dev/null && [[ -f "services/indexer/dist/db/migrate.js" ]]; then
  node services/indexer/dist/db/migrate.js verify || echo "[restore] WARNING: Migration check failed"
fi

echo "[restore] Restore complete"
