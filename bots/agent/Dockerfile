# ── Build stage ──────────────────────────────────────────────────────────────
FROM node:20-slim AS builder

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@latest --activate

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/shared/package.json ./packages/shared/
COPY bots/agent/package.json ./bots/agent/

RUN pnpm install --frozen-lockfile --filter @playerco/shared --filter @playerco/agent-bot

COPY packages/shared/ ./packages/shared/
COPY bots/agent/ ./bots/agent/

RUN pnpm --filter @playerco/shared build
RUN pnpm --filter @playerco/agent-bot build

# ── Runtime stage ─────────────────────────────────────────────────────────────
FROM node:20-slim AS runtime

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@latest --activate

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/shared/package.json ./packages/shared/
COPY bots/agent/package.json ./bots/agent/

RUN pnpm install --frozen-lockfile --prod --filter @playerco/shared --filter @playerco/agent-bot

COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/bots/agent/dist ./bots/agent/dist

WORKDIR /app/bots/agent

ENV NODE_ENV=production
# Health check server port (configurable via HEALTH_PORT)
EXPOSE 9100

CMD ["node", "--experimental-vm-modules", "dist/index.js"]
