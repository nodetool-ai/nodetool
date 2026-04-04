// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode } from "../core.js";

// Agent — nodetool.team.Agent
export interface AgentInputs {
  name?: Connectable<string>;
  role?: Connectable<string>;
  skills?: Connectable<unknown[]>;
  provider?: Connectable<string>;
  model?: Connectable<string>;
  tools?: Connectable<unknown[]>;
}

export interface AgentOutputs {
  result: string;
}

export function agent(inputs: AgentInputs): DslNode<AgentOutputs, "result"> {
  return createNode("nodetool.team.Agent", inputs as Record<string, unknown>, {
    outputNames: ["result"],
    defaultOutput: "result"
  });
}

// Team Lead — nodetool.team.TeamLead
export interface TeamLeadInputs {
  objective?: Connectable<string>;
  strategy?: Connectable<string>;
  max_iterations?: Connectable<number>;
  max_concurrency?: Connectable<number>;
}

export interface TeamLeadOutputs {
  result: unknown;
  board: unknown;
  messages: unknown[];
  events: unknown[];
}

export function teamLead(inputs: TeamLeadInputs): DslNode<TeamLeadOutputs> {
  return createNode(
    "nodetool.team.TeamLead",
    inputs as Record<string, unknown>,
    { outputNames: ["result", "board", "messages", "events"] }
  );
}
