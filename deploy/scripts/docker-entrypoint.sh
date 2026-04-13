#!/bin/sh
set -e

# Migrations are handled separately (locally or via one-off container).
# Set RUN_MIGRATE=1 to run migrations on startup (requires full prisma deps).
if [ "${RUN_MIGRATE}" = "1" ]; then
  echo "Running database migrations..."
  node ./node_modules/prisma/build/index.js migrate deploy
  echo "Migrations complete."
fi

# Database seeding: creates admin user + registers built-in skills.
# Set RUN_SEED=1 on first deployment, then remove it.
if [ "${RUN_SEED}" = "1" ]; then
  echo "Running database seed..."
  node seed.js
  echo "Seed complete."
fi

exec "$@"
