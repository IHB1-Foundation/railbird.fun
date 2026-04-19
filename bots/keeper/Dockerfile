# ── Build stage ──────────────────────────────────────────────────────────────
FROM node:20-slim AS builder

WORKDIR /app
ENV HUSKY=0

RUN corepack enable && corepack prepare pnpm@latest --activate

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/shared/package.json ./packages/shared/
COPY bots/keeper/package.json ./bots/keeper/

RUN pnpm install --frozen-lockfile --filter @playerco/shared --filter @playerco/keeper-bot

COPY packages/shared/ ./packages/shared/
COPY bots/keeper/ ./bots/keeper/

RUN pnpm --filter @playerco/shared build
RUN pnpm --filter @playerco/keeper-bot build

# ── Runtime stage ─────────────────────────────────────────────────────────────
FROM node:20-alpine AS runtime

WORKDIR /app
ENV HUSKY=0

RUN corepack enable && corepack prepare pnpm@latest --activate

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/shared/package.json ./packages/shared/
COPY bots/keeper/package.json ./bots/keeper/

RUN pnpm install --frozen-lockfile --prod --filter @playerco/shared --filter @playerco/keeper-bot

COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/bots/keeper/dist ./bots/keeper/dist

WORKDIR /app/bots/keeper

ENV NODE_ENV=production
EXPOSE 9101

CMD ["node", "--experimental-vm-modules", "dist/index.js"]
