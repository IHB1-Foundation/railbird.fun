# ── Build stage ──────────────────────────────────────────────────────────────
FROM node:20-slim AS builder

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@latest --activate

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/shared/package.json ./packages/shared/
COPY bots/vrf-operator/package.json ./bots/vrf-operator/

RUN pnpm install --frozen-lockfile --filter @playerco/shared --filter @playerco/vrf-operator

COPY packages/shared/ ./packages/shared/
COPY bots/vrf-operator/ ./bots/vrf-operator/

RUN pnpm --filter @playerco/shared build
RUN pnpm --filter @playerco/vrf-operator build

# ── Runtime stage ─────────────────────────────────────────────────────────────
FROM node:20-alpine AS runtime

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@latest --activate

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/shared/package.json ./packages/shared/
COPY bots/vrf-operator/package.json ./bots/vrf-operator/

RUN pnpm install --frozen-lockfile --prod --filter @playerco/shared --filter @playerco/vrf-operator

COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/bots/vrf-operator/dist ./bots/vrf-operator/dist

WORKDIR /app/bots/vrf-operator

ENV NODE_ENV=production
EXPOSE 9102

CMD ["node", "--experimental-vm-modules", "dist/index.js"]
