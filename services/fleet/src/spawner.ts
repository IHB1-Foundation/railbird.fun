// Agent Process Spawner — T-1202
// Spawns and monitors agent bot processes.

import { fork } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import { createLogger } from "@playerco/shared";
import type { AgentProcess } from "./types.js";
import type { FleetAgentConfig } from "./types.js";

const logger = createLogger({ service: "fleet:spawner" });

const MAX_RESTARTS = 3;
const HEARTBEAT_INTERVAL_MS = 5_000;
const RESTART_DELAY_MS = 3_000;

/** Path to the compiled agent bot entry point. */
function agentEntryPoint(): string {
  return process.env.AGENT_ENTRY_POINT ?? new URL("../../../../bots/agent/dist/index.js", import.meta.url).pathname;
}

export class ProcessManager {
  private agents = new Map<string, AgentProcess>();
  private heartbeatTimer: NodeJS.Timeout | null = null;

  constructor() {
    this.heartbeatTimer = setInterval(() => this.checkHeartbeats(), HEARTBEAT_INTERVAL_MS);
  }

  spawn(
    agentId: string,
    config: FleetAgentConfig,
    operatorPrivateKey: string,
    operatorAddress: string
  ): AgentProcess {
    const persona = config.personaConfig;
    const personaJson = JSON.stringify({
      name: persona.name,
      emoji: persona.emoji,
      colorAccent: persona.colorAccent,
      aggression: persona.aggression,
      tightness: persona.tightness,
      bluffFrequency: persona.bluffFrequency,
      positionAwareness: persona.positionAwareness,
      systemPromptOverride: config.systemPrompt,
    });

    const env: Record<string, string> = {
      ...Object.fromEntries(
        Object.entries(process.env).filter(([, v]) => v !== undefined) as [string, string][]
      ),
      OPERATOR_PRIVATE_KEY: operatorPrivateKey,
      POKER_TABLE_ADDRESS: config.tableAddress,
      AGENT_PERSONA_JSON: personaJson,
      AGENT_DECISION_ENGINE: process.env.AGENT_DECISION_ENGINE ?? "gemini",
    };

    const entry = agentEntryPoint();
    logger.info({ agentId, entry, table: config.tableAddress, persona: persona.name }, "Spawning agent process");

    const agentProc: AgentProcess = {
      agentId,
      operatorAddress,
      tableAddress: config.tableAddress,
      ownerAddress: config.ownerAddress,
      personaName: persona.name,
      personaEmoji: persona.emoji,
      status: "starting",
      restarts: 0,
      createdAt: Date.now(),
    };

    this.agents.set(agentId, agentProc);
    this._launchProcess(agentId, entry, env);
    return agentProc;
  }

  private _launchProcess(agentId: string, entry: string, env: Record<string, string>): void {
    const agent = this.agents.get(agentId);
    if (!agent) return;

    const child: ChildProcess = fork(entry, [], {
      env,
      stdio: "inherit",
      execArgv: [],
    });

    agent.pid = child.pid;
    agent.process = child;
    agent.status = "live";

    child.on("exit", (code, signal) => {
      const current = this.agents.get(agentId);
      if (!current) return;

      logger.warn({ agentId, code, signal, restarts: current.restarts }, "Agent process exited");

      if (current.status === "stopped") return; // intentional stop

      if (current.restarts < MAX_RESTARTS) {
        current.restarts++;
        current.status = "starting";
        logger.info({ agentId, attempt: current.restarts }, "Restarting agent in 3s");
        setTimeout(() => this._launchProcess(agentId, entry, env), RESTART_DELAY_MS);
      } else {
        current.status = "crashed";
        logger.error({ agentId }, "Agent crashed — max restarts reached");
      }
    });
  }

  stop(agentId: string): boolean {
    const agent = this.agents.get(agentId);
    if (!agent) return false;

    agent.status = "stopped";
    if (agent.process && agent.process.exitCode === null) {
      agent.process.kill("SIGTERM");
    }
    logger.info({ agentId }, "Agent stopped");
    return true;
  }

  get(agentId: string): AgentProcess | undefined {
    return this.agents.get(agentId);
  }

  list(): AgentProcess[] {
    return [...this.agents.values()];
  }

  private checkHeartbeats(): void {
    for (const agent of this.agents.values()) {
      if (agent.status === "live" && agent.process) {
        // Check if process is still running by sending signal 0
        try {
          if (agent.pid) process.kill(agent.pid, 0);
        } catch {
          logger.warn({ agentId: agent.agentId }, "Heartbeat failed — process may be dead");
        }
      }
    }
  }

  shutdown(): void {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    for (const agent of this.agents.values()) {
      this.stop(agent.agentId);
    }
  }
}
