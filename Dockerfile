# syntax=docker/dockerfile:1
# ─── Stage 1: Dependencies ──────────────────────────────────────────────────
FROM node:22-alpine AS deps
WORKDIR /app

RUN apk add --no-cache libc6-compat

COPY package.json package-lock.json ./
COPY prisma ./prisma

RUN --mount=type=cache,target=/root/.npm \
    npm ci && npx prisma generate

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

# Prisma schema + generated client + CLI (for migrate deploy in entrypoint)
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/prisma ./node_modules/prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma

# External packages not traced by Next.js standalone (serverExternalPackages)
# minio + its transitive dependencies
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

# Worker bundle (for star-catcher-worker service)
COPY --from=builder --chown=nextjs:nodejs /app/dist/worker.js ./worker.js

# Entrypoint
COPY scripts/docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh

USER nextjs

EXPOSE 3000

ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["node", "server.js"]
