// Fleet REST API — T-1202
// POST /fleet/agents — create agent
// GET  /fleet/agents — list agents
// GET  /fleet/agents/:id — agent status
// DELETE /fleet/agents/:id — stop agent
// GET  /fleet/wallets/available — available wallet count

import { Router, type Request, type Response } from "express";
import { randomUUID } from "node:crypto";
import { createLogger } from "@playerco/shared";
import type { WalletPool } from "./pool.js";
import type { ProcessManager } from "./spawner.js";
import type { FleetAgentConfig, FleetAgentStatus } from "./types.js";

const logger = createLogger({ service: "fleet:api" });

export function createFleetRouter(pool: WalletPool, manager: ProcessManager): Router {
  const router = Router();

  function agentToStatus(agent: ReturnType<ProcessManager["get"]>): FleetAgentStatus | null {
    if (!agent) return null;
    return {
      agentId: agent.agentId,
      operatorAddress: agent.operatorAddress,
      tableAddress: agent.tableAddress,
      ownerAddress: agent.ownerAddress,
      personaName: agent.personaName,
      personaEmoji: agent.personaEmoji,
      status: agent.status,
      pid: agent.pid,
      restarts: agent.restarts,
      createdAt: agent.createdAt,
    };
  }

  /** POST /fleet/agents — create and spawn a new agent */
  router.post("/agents", (req: Request, res: Response) => {
    const body = req.body as Partial<FleetAgentConfig>;
    if (!body.ownerAddress || !body.tableAddress || !body.personaConfig?.name) {
      res.status(400).json({ error: "Missing required fields: ownerAddress, tableAddress, personaConfig.name" });
      return;
    }

    const agentId = randomUUID();
    const wallet = pool.acquire(agentId);
    if (!wallet) {
      res.status(503).json({ error: "No operator wallets available — all are in use" });
      return;
    }

    try {
      const agent = manager.spawn(agentId, body as FleetAgentConfig, wallet.privateKey, wallet.address);
      logger.info({ agentId, owner: body.ownerAddress, table: body.tableAddress }, "Agent created");
      res.status(201).json({
        agentId,
        operatorAddress: wallet.address,
        status: agent.status,
      });
    } catch (err) {
      pool.release(agentId);
      logger.error({ err: err instanceof Error ? err.message : String(err) }, "Failed to spawn agent");
      res.status(500).json({ error: "Failed to spawn agent process" });
    }
  });

  /** GET /fleet/agents — list all agents */
  router.get("/agents", (_req: Request, res: Response) => {
    const agents = manager.list().map(agentToStatus).filter(Boolean);
    res.json({ agents });
  });

  /** GET /fleet/agents/:id — get specific agent status */
  router.get("/agents/:id", (req: Request, res: Response) => {
    const agent = manager.get(req.params.id);
    if (!agent) {
      res.status(404).json({ error: "Agent not found" });
      return;
    }
    res.json(agentToStatus(agent));
  });

  /** DELETE /fleet/agents/:id — stop an agent */
  router.delete("/agents/:id", (req: Request, res: Response) => {
    const agentId = req.params.id;
    const stopped = manager.stop(agentId);
    if (!stopped) {
      res.status(404).json({ error: "Agent not found" });
      return;
    }
    pool.release(agentId);
    res.json({ ok: true, agentId });
  });

  /** GET /fleet/wallets/available — available wallet slots */
  router.get("/wallets/available", (_req: Request, res: Response) => {
    res.json({
      available: pool.availableCount(),
      total: pool.totalCount(),
    });
  });

  return router;
}
