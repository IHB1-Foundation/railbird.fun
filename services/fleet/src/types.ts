// Fleet service types — T-1202

import type { ChildProcess } from "node:child_process";
import type { FleetAgentConfig, FleetAgentStatus } from "@playerco/shared";

export type { FleetAgentConfig, FleetAgentStatus };

export interface WalletEntry {
  privateKey: string;
  address: string;
  inUse: boolean;
  assignedAgentId?: string;
}

export interface AgentProcess {
  agentId: string;
  operatorAddress: string;
  tableAddress: string;
  ownerAddress: string;
  personaName: string;
  personaEmoji: string;
  pid?: number;
  status: FleetAgentStatus["status"];
  restarts: number;
  createdAt: number;
  process?: ChildProcess;
}
