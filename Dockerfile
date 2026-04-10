# syntax=docker/dockerfile:1
# ─── Stage 1: Dependencies ───────────────────────────────────────────────────
FROM node:22-alpine AS deps
WORKDIR /app

RUN apk add --no-cache libc6-compat

COPY package.json package-lock.json ./
COPY prisma ./prisma

RUN npm install --omit=dev && \
    npm install prisma && \
    npx prisma generate

# ─── Stage 2: Prisma CLI (parallel with builder, cached independently) ───────
FROM node:22-alpine AS prisma-cli
WORKDIR /app
RUN npm init -y > /dev/null 2>&1 && \
    npm install prisma@6 @prisma/client@6 --save-prod && \
    npm cache clean --force

# ─── Stage 3: Builder ────────────────────────────────────────────────────────
FROM node:22-alpine AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

RUN npx prisma generate

ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

RUN npm run build

# ─── Stage 4: Runner ─────────────────────────────────────────────────────────
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# 1) Prisma CLI deps first (cached layer, only rebuilds when prisma version changes)
COPY --from=prisma-cli /app/node_modules ./node_modules

# 2) Standalone output on top (merges into node_modules, keeps prisma CLI intact)
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# 3) Prisma schema + generated client
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma

# 4) Entrypoint
COPY scripts/docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh

USER nextjs

EXPOSE 3000

ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["node", "server.js"]
