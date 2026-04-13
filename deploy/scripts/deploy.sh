#!/bin/bash
# ===================================================================
# Star Catcher — One-click deploy to NAS
# Run this script on your development machine.
# ===================================================================
set -euo pipefail

# ── Configuration ─────────────────────────────────────────────────
# Override these via environment variables or edit here
NAS_USER="${NAS_USER:-root}"
NAS_HOST="${NAS_HOST:-}"                        # e.g., nas.tail1234.ts.net
NAS_DIR="${NAS_DIR:-/volume1/docker/star-catcher}"
COMPOSE_FILE="docker-compose.prod.yml"

# ── Validation ────────────────────────────────────────────────────
if [ -z "$NAS_HOST" ]; then
  echo "ERROR: NAS_HOST is not set."
  echo "Usage: NAS_HOST=nas.tail1234.ts.net ./deploy.sh"
  exit 1
fi

# Ensure we're in the project root (parent of deploy/)
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
cd "$PROJECT_ROOT"

TAG=$(git rev-parse --short HEAD)
IMAGE_NAME="star-catcher:$TAG"
TAR_FILE="/tmp/star-catcher-${TAG}.tar.gz"

echo "================================================"
echo "  Star Catcher Deploy"
echo "  Commit:  $TAG"
echo "  Target:  ${NAS_USER}@${NAS_HOST}:${NAS_DIR}"
echo "================================================"

# ── Step 1: Build Docker image ────────────────────────────────────
echo ""
echo "[1/5] Building $IMAGE_NAME ..."
docker build -t "$IMAGE_NAME" .

# ── Step 2: Save and compress ─────────────────────────────────────
echo ""
echo "[2/5] Saving image to $TAR_FILE ..."
docker save "$IMAGE_NAME" | gzip > "$TAR_FILE"
SIZE=$(du -h "$TAR_FILE" | cut -f1)
echo "       Image size: $SIZE"

# ── Step 3: Transfer to NAS ───────────────────────────────────────
echo ""
echo "[3/5] Transferring to NAS via SCP ..."
scp "$TAR_FILE" "${NAS_USER}@${NAS_HOST}:${NAS_DIR}/images/"

# ── Step 4: Deploy on NAS ─────────────────────────────────────────
echo ""
echo "[4/5] Deploying on NAS ..."
ssh "${NAS_USER}@${NAS_HOST}" bash -s "$TAG" "$NAS_DIR" "$COMPOSE_FILE" << 'REMOTE_SCRIPT'
  set -euo pipefail
  TAG="$1"
  NAS_DIR="$2"
  COMPOSE_FILE="$3"

  echo "  Loading image star-catcher:$TAG ..."
  docker load < "$NAS_DIR/images/star-catcher-${TAG}.tar.gz"

  echo "  Backing up database ..."
  BACKUP_FILE="$NAS_DIR/backups/pre-deploy-$(date +%Y%m%d_%H%M%S).dump"
  docker exec star-catcher-db pg_dump -U star_catcher -d star_catcher --format=custom \
    > "$BACKUP_FILE" 2>/dev/null || echo "  (skip backup — DB not running yet)"

  echo "  Updating IMAGE_TAG to $TAG ..."
  cd "$NAS_DIR"
  sed -i "s/^IMAGE_TAG=.*/IMAGE_TAG=$TAG/" .env

  echo "  Restarting app + worker ..."
  docker compose -p star-catcher -f "$COMPOSE_FILE" up -d star-catcher-app star-catcher-worker

  echo "  Waiting for containers to start ..."
  sleep 5
  docker compose -p star-catcher -f "$COMPOSE_FILE" ps
REMOTE_SCRIPT

# ── Step 5: Cleanup ───────────────────────────────────────────────
echo ""
echo "[5/5] Cleaning up local temp file ..."
rm -f "$TAR_FILE"

echo ""
echo "================================================"
echo "  Deployed star-catcher:$TAG"
echo "  Access: http://${NAS_HOST}:3000"
echo "================================================"
