#!/bin/bash
# ===================================================================
# Star Catcher — PostgreSQL backup script
# Deploy on NAS and schedule via cron:
#   crontab -e
#   0 3 * * * /volume1/docker/star-catcher/scripts/backup-db.sh
# ===================================================================
set -euo pipefail

BACKUP_DIR="/volume1/docker/star-catcher/backups"
CONTAINER="star-catcher-db"
DB_USER="star_catcher"
DB_NAME="star_catcher"
KEEP_DAYS=7
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

mkdir -p "$BACKUP_DIR"

echo "[$(date)] Starting database backup ..."

docker exec "$CONTAINER" pg_dump -U "$DB_USER" -d "$DB_NAME" --format=custom \
  > "$BACKUP_DIR/${DB_NAME}-${TIMESTAMP}.dump"

echo "[$(date)] Backup saved: ${DB_NAME}-${TIMESTAMP}.dump"

# Cleanup old backups
DELETED=$(find "$BACKUP_DIR" -name "${DB_NAME}-*.dump" -mtime +"$KEEP_DAYS" -print -delete | wc -l)
if [ "$DELETED" -gt 0 ]; then
  echo "[$(date)] Deleted $DELETED backup(s) older than $KEEP_DAYS days"
fi

echo "[$(date)] Backup complete."
