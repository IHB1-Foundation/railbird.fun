# ── Build stage ──────────────────────────────────────────────────────────────
FROM node:20-slim AS builder

WORKDIR /app
ENV HUSKY=0

RUN corepack enable && corepack prepare pnpm@latest --activate

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/shared/package.json ./packages/shared/
COPY services/fleet/package.json ./services/fleet/

RUN pnpm install --frozen-lockfile --filter @playerco/shared --filter @playerco/fleet

COPY packages/shared/ ./packages/shared/
COPY services/fleet/ ./services/fleet/

RUN pnpm --filter @playerco/shared build
RUN pnpm --filter @playerco/fleet build

# ── Runtime stage ─────────────────────────────────────────────────────────────
FROM node:20-alpine AS runtime

WORKDIR /app
ENV HUSKY=0

RUN corepack enable && corepack prepare pnpm@latest --activate

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/shared/package.json ./packages/shared/
COPY services/fleet/package.json ./services/fleet/

RUN pnpm install --frozen-lockfile --prod --filter @playerco/shared --filter @playerco/fleet

COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/services/fleet/dist ./services/fleet/dist

WORKDIR /app/services/fleet

ENV NODE_ENV=production
EXPOSE 4002

HEALTHCHECK --interval=15s --timeout=5s --start-period=10s \
  CMD node -e "require('http').get('http://localhost:4002/health', r => process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

CMD ["node", "--experimental-vm-modules", "dist/index.js"]
