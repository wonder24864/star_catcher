# syntax=docker/dockerfile:1
# ─── Stage 1: Dependencies (full, incl. dev) ───────────────────────────────
FROM node:22-alpine AS deps
WORKDIR /app

RUN apk add --no-cache libc6-compat

COPY package.json package-lock.json ./
COPY prisma ./prisma

RUN --mount=type=cache,target=/root/.npm \
    npm ci && npx prisma generate

# ─── Stage 1b: Prisma Runtime (CLI + client only, minimal install) ─────────
# Installs just prisma + @prisma/client with their transitive deps in isolation.
# Runner copies this focused tree, avoiding bloat from duplicating everything
# Next.js standalone already bundles (saves ~3GB vs installing all prod deps).
# Whole-tree install also covers new transitive deps across prisma version bumps
# (e.g. 6.19 added effect/c12/empathic under @prisma/config).
FROM node:22-alpine AS prisma-runtime
WORKDIR /prisma-src
RUN apk add --no-cache libc6-compat
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN PRISMA_V=$(node -p "require('./package.json').devDependencies.prisma || require('./package.json').dependencies.prisma") && \
    CLIENT_V=$(node -p "require('./package.json').dependencies['@prisma/client']") && \
    rm -f package.json package-lock.json && \
    npm init -y > /dev/null && \
    npm install prisma@${PRISMA_V} @prisma/client@${CLIENT_V} --omit=optional

# ─── Stage 2: Builder ───────────────────────────────────────────────────────
FROM node:22-alpine AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

RUN --mount=type=cache,target=/app/.next/cache \
    npm run build

# Build worker (standalone Node.js bundle for BullMQ)
RUN npx esbuild src/worker/index.ts --bundle --platform=node \
    --outfile=dist/worker.js --tsconfig=tsconfig.json \
    --external:@prisma/client --external:.prisma/client \
    --external:pino --external:pino-pretty

# Build seed script (for production database seeding)
RUN npx esbuild prisma/seed.ts --bundle --platform=node \
    --outfile=dist/seed.js --tsconfig=tsconfig.json \
    --external:@prisma/client --external:.prisma/client

# ─── Stage 3: Runner ────────────────────────────────────────────────────────
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Standalone output
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Prisma CLI + client + their transitive deps (isolated install from prisma-runtime
# stage). Keeps tree bounded — avoids duplicating what Next.js standalone bundled.
COPY --from=prisma-runtime /prisma-src/node_modules ./node_modules
# Prisma schema (for migrate deploy)
COPY --from=builder /app/prisma ./prisma
# Generated Prisma client needs to land alongside standalone's node_modules too
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma

# External packages Next.js standalone doesn't trace (serverExternalPackages
# in next.config.ts: minio, pino, pino-pretty). Hand-copy their trees since
# they're not pulled by @prisma/client install above.
COPY --from=builder /app/node_modules/minio ./node_modules/minio
COPY --from=builder /app/node_modules/async ./node_modules/async
COPY --from=builder /app/node_modules/block-stream2 ./node_modules/block-stream2
COPY --from=builder /app/node_modules/browser-or-node ./node_modules/browser-or-node
COPY --from=builder /app/node_modules/buffer-crc32 ./node_modules/buffer-crc32
COPY --from=builder /app/node_modules/eventemitter3 ./node_modules/eventemitter3
COPY --from=builder /app/node_modules/fast-xml-parser ./node_modules/fast-xml-parser
COPY --from=builder /app/node_modules/ipaddr.js ./node_modules/ipaddr.js
COPY --from=builder /app/node_modules/lodash ./node_modules/lodash
COPY --from=builder /app/node_modules/mime-types ./node_modules/mime-types
COPY --from=builder /app/node_modules/mime-db ./node_modules/mime-db
COPY --from=builder /app/node_modules/query-string ./node_modules/query-string
COPY --from=builder /app/node_modules/stream-json ./node_modules/stream-json
COPY --from=builder /app/node_modules/through2 ./node_modules/through2
COPY --from=builder /app/node_modules/xml2js ./node_modules/xml2js
COPY --from=builder /app/node_modules/xmlbuilder ./node_modules/xmlbuilder
COPY --from=builder /app/node_modules/sax ./node_modules/sax
COPY --from=builder /app/node_modules/strnum ./node_modules/strnum
COPY --from=builder /app/node_modules/decode-uri-component ./node_modules/decode-uri-component
COPY --from=builder /app/node_modules/filter-obj ./node_modules/filter-obj
COPY --from=builder /app/node_modules/split-on-first ./node_modules/split-on-first
COPY --from=builder /app/node_modules/pino ./node_modules/pino
COPY --from=builder /app/node_modules/pino-pretty ./node_modules/pino-pretty
COPY --from=builder /app/node_modules/pino-abstract-transport ./node_modules/pino-abstract-transport
COPY --from=builder /app/node_modules/pino-std-serializers ./node_modules/pino-std-serializers
COPY --from=builder /app/node_modules/@pinojs ./node_modules/@pinojs
COPY --from=builder /app/node_modules/atomic-sleep ./node_modules/atomic-sleep
COPY --from=builder /app/node_modules/on-exit-leak-free ./node_modules/on-exit-leak-free
COPY --from=builder /app/node_modules/process-warning ./node_modules/process-warning
COPY --from=builder /app/node_modules/quick-format-unescaped ./node_modules/quick-format-unescaped
COPY --from=builder /app/node_modules/real-require ./node_modules/real-require
COPY --from=builder /app/node_modules/safe-stable-stringify ./node_modules/safe-stable-stringify
COPY --from=builder /app/node_modules/sonic-boom ./node_modules/sonic-boom
COPY --from=builder /app/node_modules/thread-stream ./node_modules/thread-stream
COPY --from=builder /app/node_modules/secure-json-parse ./node_modules/secure-json-parse
COPY --from=builder /app/node_modules/colorette ./node_modules/colorette
COPY --from=builder /app/node_modules/dateformat ./node_modules/dateformat
COPY --from=builder /app/node_modules/fast-copy ./node_modules/fast-copy
COPY --from=builder /app/node_modules/fast-safe-stringify ./node_modules/fast-safe-stringify
COPY --from=builder /app/node_modules/help-me ./node_modules/help-me
COPY --from=builder /app/node_modules/joycon ./node_modules/joycon
COPY --from=builder /app/node_modules/minimist ./node_modules/minimist
COPY --from=builder /app/node_modules/strip-json-comments ./node_modules/strip-json-comments
COPY --from=builder /app/node_modules/pump ./node_modules/pump
COPY --from=builder /app/node_modules/end-of-stream ./node_modules/end-of-stream
COPY --from=builder /app/node_modules/once ./node_modules/once
COPY --from=builder /app/node_modules/wrappy ./node_modules/wrappy
COPY --from=builder /app/node_modules/split2 ./node_modules/split2

# Worker bundle (for star-catcher-worker service)
COPY --from=builder --chown=nextjs:nodejs /app/dist/worker.js ./worker.js

# Seed script + skills directory (for initial database seeding via RUN_SEED=1)
COPY --from=builder --chown=nextjs:nodejs /app/dist/seed.js ./seed.js
COPY --from=builder /app/skills ./skills

# EvalFramework datasets + OCR fixture images (Sprint 16)
# EvalRunner loads these via readFile() at runtime, not bundled by esbuild.
COPY --from=builder /app/tests/eval ./tests/eval

# Entrypoint
COPY deploy/scripts/docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh

USER nextjs

EXPOSE 3000

ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["node", "server.js"]
