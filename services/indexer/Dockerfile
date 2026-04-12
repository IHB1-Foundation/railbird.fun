# ── Build stage ──────────────────────────────────────────────────────────────
FROM node:20-slim AS builder

WORKDIR /app

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy workspace manifests first for layer caching
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/shared/package.json ./packages/shared/
COPY services/indexer/package.json ./services/indexer/

RUN pnpm install --frozen-lockfile --filter @playerco/shared --filter @playerco/indexer

# Copy source
COPY packages/shared/ ./packages/shared/
COPY services/indexer/ ./services/indexer/

# Build shared package first, then indexer
RUN pnpm --filter @playerco/shared build
RUN pnpm --filter @playerco/indexer build

# ── Runtime stage ─────────────────────────────────────────────────────────────
FROM node:20-alpine AS runtime

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@latest --activate

# Install only production deps
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/shared/package.json ./packages/shared/
COPY services/indexer/package.json ./services/indexer/

RUN pnpm install --frozen-lockfile --prod --filter @playerco/shared --filter @playerco/indexer

# Copy built artifacts
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/services/indexer/dist ./services/indexer/dist
COPY services/indexer/migrations ./services/indexer/migrations

WORKDIR /app/services/indexer

ENV NODE_ENV=production
EXPOSE 3002

HEALTHCHECK --interval=15s --timeout=5s --start-period=10s \
  CMD node -e "require('http').get('http://localhost:3002/health', r => process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

CMD ["node", "--experimental-vm-modules", "dist/index.js"]
