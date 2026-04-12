FROM node:22-slim

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    git \
    ca-certificates \
    bash \
    jq \
    python3 \
    unzip \
    && rm -rf /var/lib/apt/lists/*

# Install pnpm
RUN npm install -g pnpm@9

# Install Foundry (forge, cast, anvil, chisel)
RUN curl -L https://foundry.paradigm.xyz | bash
ENV PATH="/root/.foundry/bin:${PATH}"
RUN /root/.foundry/bin/foundryup

# Pre-install workspace dependencies (layer-cached for speed)
WORKDIR /workspace
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/web/package.json ./apps/web/
COPY services/indexer/package.json ./services/indexer/
COPY services/ownerview/package.json ./services/ownerview/
COPY bots/agent/package.json ./bots/agent/
COPY bots/keeper/package.json ./bots/keeper/
RUN pnpm install --frozen-lockfile

CMD ["bash"]
