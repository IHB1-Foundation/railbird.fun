# ── Build stage ──────────────────────────────────────────────────────────────
FROM node:20-slim AS builder

WORKDIR /app
ENV HUSKY=0

RUN corepack enable && corepack prepare pnpm@latest --activate

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/shared/package.json ./packages/shared/
COPY services/ownerview/package.json ./services/ownerview/

RUN pnpm install --frozen-lockfile --filter @playerco/shared --filter @playerco/ownerview

COPY packages/shared/ ./packages/shared/
COPY services/ownerview/ ./services/ownerview/

RUN pnpm --filter @playerco/shared build
RUN pnpm --filter @playerco/ownerview build

# ── Runtime stage ─────────────────────────────────────────────────────────────
FROM node:20-alpine AS runtime

WORKDIR /app
ENV HUSKY=0

RUN corepack enable && corepack prepare pnpm@latest --activate

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/shared/package.json ./packages/shared/
COPY services/ownerview/package.json ./services/ownerview/

RUN pnpm install --frozen-lockfile --prod --filter @playerco/shared --filter @playerco/ownerview

COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/services/ownerview/dist ./services/ownerview/dist

WORKDIR /app/services/ownerview

ENV NODE_ENV=production
EXPOSE 3001

VOLUME ["/data/holecards"]

HEALTHCHECK --interval=15s --timeout=5s --start-period=10s \
  CMD node -e "require('http').get('http://localhost:3001/health', r => process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

CMD ["node", "--experimental-vm-modules", "dist/index.js"]
