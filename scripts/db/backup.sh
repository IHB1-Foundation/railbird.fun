#!/usr/bin/env bash
# DB Backup Script — T-1507
# Dumps the Railbird Postgres database and uploads to S3/R2 or saves locally.
#
# Required env vars:
#   DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD
#
# Optional env vars:
#   BACKUP_S3_BUCKET   — s3:// or r2:// destination (omit to save locally)
#   BACKUP_GPG_KEY     — GPG recipient key ID for encryption (omit to skip encryption)
#   BACKUP_DIR         — local directory for backup files (default: /tmp/railbird-backups)
#   BACKUP_RETENTION_DAYS — days to keep local backups (default: 7)

set -euo pipefail

: "${DB_HOST:?DB_HOST is required}"
: "${DB_NAME:?DB_NAME is required}"
: "${DB_USER:?DB_USER is required}"
: "${DB_PASSWORD:?DB_PASSWORD is required}"
DB_PORT="${DB_PORT:-5432}"

BACKUP_DIR="${BACKUP_DIR:-/tmp/railbird-backups}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-7}"
TIMESTAMP=$(date -u +"%Y%m%dT%H%M%SZ")
FILENAME="${DB_NAME}_${TIMESTAMP}.dump"
LOCAL_PATH="${BACKUP_DIR}/${FILENAME}"

mkdir -p "${BACKUP_DIR}"

echo "[backup] Starting pg_dump: host=${DB_HOST} db=${DB_NAME} → ${LOCAL_PATH}"

PGPASSWORD="${DB_PASSWORD}" pg_dump \
  --host="${DB_HOST}" \
  --port="${DB_PORT}" \
  --username="${DB_USER}" \
  --format=custom \
  --compress=9 \
  --file="${LOCAL_PATH}" \
  "${DB_NAME}"

echo "[backup] pg_dump complete: $(du -sh "${LOCAL_PATH}" | cut -f1)"

# Optional: GPG encryption
if [[ -n "${BACKUP_GPG_KEY:-}" ]]; then
  echo "[backup] Encrypting with GPG key: ${BACKUP_GPG_KEY}"
  gpg --recipient "${BACKUP_GPG_KEY}" --encrypt "${LOCAL_PATH}"
  rm "${LOCAL_PATH}"
  LOCAL_PATH="${LOCAL_PATH}.gpg"
  echo "[backup] Encrypted: ${LOCAL_PATH}"
fi

# Optional: S3/R2 upload
if [[ -n "${BACKUP_S3_BUCKET:-}" ]]; then
  echo "[backup] Uploading to ${BACKUP_S3_BUCKET}/${FILENAME}"
  aws s3 cp "${LOCAL_PATH}" "${BACKUP_S3_BUCKET}/${FILENAME}" --no-progress
  echo "[backup] Upload complete"
fi

# Prune old local backups
echo "[backup] Pruning backups older than ${RETENTION_DAYS} days"
find "${BACKUP_DIR}" -name "${DB_NAME}_*.dump*" -mtime "+${RETENTION_DAYS}" -delete

echo "[backup] Done: ${LOCAL_PATH}"
