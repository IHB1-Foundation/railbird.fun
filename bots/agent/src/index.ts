// @playerco/agent-bot - Poker-playing agent bot
// Entry point that reads configuration from environment variables

import { AgentBot } from "./bot.js";
import { GeminiStrategy, SimpleStrategy, type Strategy } from "./strategy/index.js";
import { getPersona, createCustomPersona } from "./strategy/persona.js";
import type { PersonaConfig } from "./strategy/persona.js";
import { VectorStore } from "./rag/vectorStore.js";
import {
  startHealthServer,
  validateChainIdWithRpc,
  validatePrivateKey,
  parsePositiveInt,
  optionalEnv,
  requireEnv,
  createLogger,
  logAbiVersions,
} from "@playerco/shared";

const logger = createLogger({ service: "agent-bot" });

const VERSION = "0.0.1";

function parseBoundedFloat(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number(raw);
  if (Number.isNaN(value)) return fallback;
  return Math.max(0, Math.min(1, value));
}

type DecisionEngine = "simple" | "gemini";

function parseDecisionEngine(): DecisionEngine {
  const raw = (process.env.AGENT_DECISION_ENGINE || "simple").trim().toLowerCase();
  if (raw === "gemini") {
    return "gemini";
  }
  return "simple";
}

function loadPersona(): PersonaConfig | undefined {
  // AGENT_PERSONA_JSON takes priority over AGENT_PERSONA (preset ID)
  const personaJson = process.env.AGENT_PERSONA_JSON?.trim();
  if (personaJson) {
    try {
      const raw = JSON.parse(personaJson) as Partial<PersonaConfig> & { name?: string };
      if (!raw.name) {
        logger.warn({}, 'AGENT_PERSONA_JSON missing required field "name" — ignoring');
      } else {
        const persona = createCustomPersona(raw as Partial<PersonaConfig> & { name: string });
        logger.info(
          { name: persona.name, aggression: persona.aggression, tightness: persona.tightness },
          "[FLEET] Using custom persona",
        );
        return persona;
      }
    } catch (err) {
      logger.warn(
        { err: err instanceof Error ? err.message : String(err) },
        "Failed to parse AGENT_PERSONA_JSON — ignoring",
      );
    }
  }

  const personaId = process.env.AGENT_PERSONA?.trim().toLowerCase();
  if (!personaId) return undefined;
  const persona = getPersona(personaId);
  if (!persona) {
    logger.warn(
      { personaId },
      "Unknown AGENT_PERSONA — ignoring (valid: shark, maniac, rock, adaptive)",
    );
    return undefined;
  }
  return persona;
}

function createStrategy(
  aggressionFactor: number,
  vectorStore?: VectorStore,
): {
  strategy: Strategy;
  engine: DecisionEngine;
  geminiModel: string | null;
  persona: PersonaConfig | undefined;
} {
  const persona = loadPersona();
  const fallback = new SimpleStrategy(aggressionFactor, persona);
  const engine = parseDecisionEngine();

  if (engine !== "gemini") {
    return { strategy: fallback, engine: "simple", geminiModel: null, persona };
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    logger.error(
      {},
      "AGENT_DECISION_ENGINE=gemini requires GEMINI_API_KEY — set the variable or switch to AGENT_DECISION_ENGINE=simple",
    );
    process.exit(1);
  }

  const model = process.env.GEMINI_MODEL || "gemini-2.0-flash";
  const temperature = parseBoundedFloat("GEMINI_TEMPERATURE", 0.2);
  const timeoutMs = parsePositiveInt("GEMINI_TIMEOUT_MS", 8000);

  const strategy = new GeminiStrategy({
    apiKey,
    model,
    temperature,
    timeoutMs,
    fallbackStrategy: fallback,
    persona,
    vectorStore,
  });

  return { strategy, engine: "gemini", geminiModel: model, persona };
}

async function main() {
  logger.info({ version: VERSION }, "Agent bot starting");
  logAbiVersions(logger, ["POKER_TABLE", "PLAYER_REGISTRY"]);
  const rpcUrl = requireEnv("RPC_URL");
  const defaultTurnActionDelayMs = 0;
  // Initia MiniEVM: 100ms blocks — use 250ms default poll to stay near tip.
  const defaultPollIntervalMs = process.env.CHAIN_ENV === "initia-testnet" ? 250 : 1000;
  const aggressionFactor = parseBoundedFloat("AGGRESSION_FACTOR", 0.3);
  const turnActionDelayMs = parsePositiveInt("TURN_ACTION_DELAY_MS", defaultTurnActionDelayMs);

  // Initialize VectorStore for RAG (load existing hands from disk)
  const ragPersistPath = process.env.RAG_PERSIST_PATH || "./data/rag/vectors.json";
  const vectorStore = new VectorStore(ragPersistPath);
  await vectorStore.load();
  logger.info({ ragSize: vectorStore.size, path: ragPersistPath }, "VectorStore ready");

  const { strategy, engine, geminiModel, persona } = createStrategy(aggressionFactor, vectorStore);

  // AGENT_TABLE_ADDRESS is deprecated — use POKER_TABLE_ADDRESS instead
  if (process.env.AGENT_TABLE_ADDRESS) {
    logger.warn({}, "AGENT_TABLE_ADDRESS is deprecated — use POKER_TABLE_ADDRESS instead");
  }
  const tableAddress = process.env.POKER_TABLE_ADDRESS || process.env.AGENT_TABLE_ADDRESS;
  if (!tableAddress) {
    throw new Error("Missing required environment variable: POKER_TABLE_ADDRESS");
  }

  const operatorKey = validatePrivateKey("OPERATOR_PRIVATE_KEY");

  // Load configuration from environment
  // N-4: per-agent evolution config from env vars
  const evolutionConfig: Record<string, number> = {};
  const evalWindow = parsePositiveInt("EVOLUTION_EVAL_WINDOW", 0);
  if (evalWindow > 0) evolutionConfig.evalWindowSize = evalWindow;
  const mutationStdDev = parseBoundedFloat("EVOLUTION_MUTATION_STD_DEV", -1);
  if (mutationStdDev >= 0) evolutionConfig.mutationStdDev = mutationStdDev;
  const minHands = parsePositiveInt("EVOLUTION_MIN_HANDS", 0);
  if (minHands > 0) evolutionConfig.minHandsBeforeEval = minHands;

  const gtoFeedbackWindowSize = parsePositiveInt("GTO_FEEDBACK_WINDOW_SIZE", 20);

  const config = {
    rpcUrl,
    privateKey: operatorKey,
    pokerTableAddress: tableAddress as `0x${string}`,
    ownerviewUrl: optionalEnv("OWNERVIEW_URL", "http://localhost:3001"),
    chainId: parseInt(optionalEnv("CHAIN_ID", "31337")),
    pollIntervalMs: parsePositiveInt("POLL_INTERVAL_MS", defaultPollIntervalMs),
    turnActionDelayMs,
    strategy,
    vectorStore,
    playerRegistryAddress: process.env.PLAYER_REGISTRY_ADDRESS as `0x${string}` | undefined,
    ...(Object.keys(evolutionConfig).length > 0 ? { evolutionConfig } : {}),
    gtoFeedbackWindowSize,
  };

  const maxHands = parseInt(optionalEnv("MAX_HANDS", "0"));

  // Validate that RPC_URL returns the expected chain ID before proceeding.
  await validateChainIdWithRpc(config.rpcUrl, config.chainId).catch((err: unknown) => {
    logger.error(
      { err: err instanceof Error ? err.message : String(err) },
      "Chain ID validation failed",
    );
    process.exit(1);
  });

  if (persona) {
    logger.info(
      { personaId: persona.id, personaName: persona.name, emoji: persona.emoji },
      "Persona loaded",
    );
  }

  logger.info(
    {
      rpcUrl: config.rpcUrl,
      table: config.pokerTableAddress,
      ownerviewUrl: config.ownerviewUrl,
      chainId: config.chainId,
      pollIntervalMs: config.pollIntervalMs,
      turnActionDelayMs,
      aggression: aggressionFactor.toFixed(2),
      decisionEngine: engine,
      ...(geminiModel ? { geminiModel } : {}),
      ...(persona ? { persona: persona.id } : {}),
      maxHands: maxHands || "unlimited",
      ...(Object.keys(evolutionConfig).length > 0 ? { evolutionConfig } : {}),
      gtoFeedbackWindowSize,
    },
    "Configuration",
  );

  // Create and run bot
  const bot = new AgentBot(config);
  const healthPort = parseInt(process.env.HEALTH_PORT || process.env.PORT || "9100", 10);
  const health = startHealthServer({
    service: "agent-bot",
    port: healthPort,
    getExtras: () => {
      const s = bot.getStats();
      return {
        stats: {
          handsPlayed: s.handsPlayed,
          handsWon: s.handsWon,
          actionsSubmitted: s.actionsSubmitted,
          errors: s.errors,
          rpcErrors: s.rpcErrors,
          apiErrors: s.apiErrors,
          txErrors: s.txErrors,
        },
        circuits: {
          rpc: bot.getRpcCircuitState().toLowerCase(),
          ownerview: bot.getOwnerViewCircuitState().toLowerCase(),
        },
        lastActivity: s.lastActionTime > 0 ? new Date(s.lastActionTime).toISOString() : null,
        tables: [tableAddress],
        rag: {
          totalHands: bot.getVectorStoreSize(),
          lastUpdated: s.lastActionTime > 0 ? new Date(s.lastActionTime).toISOString() : null,
        },
        ...(persona
          ? {
              persona: {
                id: persona.id,
                name: persona.name,
                emoji: persona.emoji,
                aggression: persona.aggression,
                tightness: persona.tightness,
              },
            }
          : {}),
      };
    },
  });
  logger.info({ healthEndpoint: `http://0.0.0.0:${healthPort}/health` }, "Health server started");

  // Handle shutdown
  let shutdownRequested = false;
  const shutdown = () => {
    if (shutdownRequested) {
      logger.info({}, "Force shutdown");
      process.exit(1);
    }
    shutdownRequested = true;
    logger.info({}, "Shutdown requested, stopping bot");
    bot.stop();
    void health.close();
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  // Run the bot
  await bot.run(maxHands);

  // Print final stats
  const stats = bot.getStats();
  logger.info(
    {
      handsPlayed: stats.handsPlayed,
      handsWon: stats.handsWon,
      winRate:
        stats.handsPlayed > 0
          ? ((stats.handsWon / stats.handsPlayed) * 100).toFixed(1) + "%"
          : "0%",
      totalProfit: stats.totalProfit.toString(),
      actionsSubmitted: stats.actionsSubmitted,
      errors: stats.errors,
    },
    "Final statistics",
  );
}

main().catch((error) => {
  logger.error({ err: error instanceof Error ? error.message : String(error) }, "Fatal error");
  process.exit(1);
});

// Export for programmatic use
export { AgentBot } from "./bot.js";
export * from "./chain/index.js";
export * from "./auth/index.js";
export * from "./strategy/index.js";
