/**
 * Multi-Agent Team Nodes — TeamLead orchestrates Agent nodes via control edges.
 *
 * Architecture:
 * - TeamLeadNode: orchestrates agents, manages tasks (persisted in DB),
 *   sends control events to connected Agent nodes (like tool calls).
 * - AgentNode: individual agent, connected below TeamLead via control edges.
 *   Receives work assignments as control events, executes, returns results.
 *
 * Tasks are always stored in the database (team_tasks table) and provided
 * via processing context. Tasks have dependencies and belong to a team.
 */

import { BaseNode, prop } from "@nodetool-ai/node-sdk";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import {
  TeamExecutor,
  DbTaskBoard,
  EdgeMessageBus,
  type AgentIdentity,
  type TeamConfig,
  type TeamEvent,
  type TeamStrategy,
  type ITaskBoard
} from "@nodetool-ai/agents";

// ─── AgentNode ───

/**
 * Individual agent node — a controlled node that receives work from TeamLead.
 *
 * Connect below a TeamLeadNode via a control edge. The TeamLead sends
 * control events (like tool calls) to assign work. The agent processes
 * the assignment and returns results.
 */
export class TeamAgentNode extends BaseNode {
  static readonly nodeType = "nodetool.team.Agent";
  static readonly title = "Agent";
  static readonly description =
    "An individual AI agent that receives work from a TeamLead via control edges.\n    agent, team, controlled, worker";
  static readonly isControlled = true;
  static readonly metadataOutputTypes = {
    result: "str"
  };
  static readonly basicFields = ["name", "role", "provider", "model"];

  @prop({
    type: "str",
    default: "",
    title: "Name",
    description: "Agent name, e.g. 'researcher', 'writer'"
  })
  declare name: any;

  @prop({
    type: "str",
    default: "General purpose assistant",
    title: "Role",
    description:
      "Freeform role description injected into the agent's system prompt"
  })
  declare role: any;

  @prop({
    type: "list",
    default: [],
    title: "Skills",
    description:
      "Skill tags for task matching, e.g. ['web_search', 'code_generation']"
  })
  declare skills: any;

  @prop({
    type: "str",
    default: "anthropic",
    title: "Provider",
    description: "LLM provider key"
  })
  declare provider: any;

  @prop({
    type: "str",
    default: "claude-sonnet-4-20250514",
    title: "Model",
    description: "Model identifier"
  })
  declare model: any;

  @prop({
    type: "list",
    default: [],
    title: "Tools",
    description: "Additional tool names this agent can use (beyond team tools)"
  })
  declare tools: any;

  /**
   * Called by the kernel for each control event from TeamLead.
   * The control event properties are merged onto `this` via assign().
   */
  async process(
    _context?: ProcessingContext
  ): Promise<Record<string, unknown>> {
    // The actual LLM work is done by TeamExecutor — this node acts as
    // a proxy identity. When TeamLead sends a control event, the agent's
    // process() receives the event properties (task assignment, messages, etc.)
    // and returns the result.
    //
    // The control event contains:
    //   __agent_work__: true — work assignment from TeamLead
    //   task: { id, title, description, ... } — the task to work on
    //   response: string — the agent's computed response (set by TeamExecutor)
    //
    // For message routing:
    //   __agent_message__: true — inter-agent message
    //   message: AgentMessage

    const result =
      (this as any).__agent_response__ ?? (this as any).response ?? "";
    return { result: String(result) };
  }

  /**
   * Convert this node's properties to an AgentIdentity for the TeamExecutor.
   */
  toIdentity(): AgentIdentity {
    return {
      id: this.__node_id || String(this.name || "agent"),
      name: String(this.name || "Agent"),
      role: String(this.role || "General purpose assistant"),
      skills: Array.isArray(this.skills) ? this.skills.map(String) : [],
      provider: String(this.provider || "anthropic"),
      model: String(this.model || "claude-sonnet-4-20250514"),
      tools: Array.isArray(this.tools) ? this.tools.map(String) : []
    };
  }
}

// ─── TeamLeadNode ───

/**
 * Orchestrates a team of agents working together on an objective.
 *
 * Agents are connected below via control edges — no AgentPool needed.
 * TeamLead discovers agents from its outgoing control edges at runtime.
 * Tasks are stored in the database, provided via processing context.
 */
export class TeamLeadNode extends BaseNode {
  static readonly nodeType = "nodetool.team.TeamLead";
  static readonly title = "Team Lead";
  static readonly description =
    "Orchestrate a team of AI agents connected via control edges. Tasks are persisted in the database.\n    multi-agent, team, collaboration, orchestration, lead";
  static readonly metadataOutputTypes = {
    result: "json",
    board: "json",
    messages: "list",
    events: "list"
  };
  static readonly basicFields = ["objective", "strategy"];

  @prop({
    type: "str",
    default: "",
    title: "Objective",
    description: "The team's objective — what they should accomplish together"
  })
  declare objective: any;

  @prop({
    type: "str",
    default: "coordinator",
    title: "Strategy",
    description:
      "Team strategy: coordinator (lead decomposes work), autonomous (self-organizing), hybrid (lead + autonomous subtasks)"
  })
  declare strategy: any;

  @prop({
    type: "int",
    default: 50,
    title: "Max Iterations",
    description: "Maximum total LLM calls across all agents",
    min: 1,
    max: 200
  })
  declare max_iterations: any;

  @prop({
    type: "int",
    default: 3,
    title: "Max Concurrency",
    description: "Maximum number of agents running simultaneously",
    min: 1,
    max: 10
  })
  declare max_concurrency: any;

  async *genProcess(
    context?: ProcessingContext
  ): AsyncGenerator<Record<string, unknown>> {
    const objective = String(this.objective ?? "");
    if (!objective) throw new Error("Objective is required");
    if (!context) throw new Error("Processing context is required");

    // Discover agents from _control_context (injected by kernel).
    // The kernel resolves outgoing control edges and provides metadata
    // about each controlled node — including their properties.
    // Fallback: agents can be provided directly for programmatic use.
    const agents: AgentIdentity[] = [];
    const controlContext =
      this.getDynamic<Record<string, Record<string, unknown>>>(
        "_control_context"
      );

    if (controlContext) {
      // Extract agent identities from controlled Agent nodes
      for (const [nodeId, meta] of Object.entries(controlContext)) {
        if (typeof meta !== "object" || !meta) continue;
        const nodeType = String(meta.node_type ?? "");
        // Only pick up Agent nodes (not arbitrary controlled nodes)
        if (nodeType !== "nodetool.team.Agent") continue;
        const props = meta.properties as
          | Record<string, { value?: unknown }>
          | undefined;
        const getProp = (name: string) => props?.[name]?.value;
        agents.push({
          id: nodeId,
          name: String(getProp("name") ?? meta.node_title ?? nodeId),
          role: String(getProp("role") ?? "General purpose assistant"),
          skills: Array.isArray(getProp("skills"))
            ? (getProp("skills") as unknown[]).map(String)
            : [],
          provider: String(getProp("provider") ?? "anthropic"),
          model: String(getProp("model") ?? "claude-sonnet-4-20250514"),
          tools: Array.isArray(getProp("tools"))
            ? (getProp("tools") as unknown[]).map(String)
            : []
        });
      }
    }

    // Fallback: agents provided inline (programmatic use without kernel)
    if (agents.length === 0) {
      const rawAgents =
        this.getDynamic<Array<Record<string, unknown>>>("agents") ?? [];
      for (const a of rawAgents) {
        agents.push({
          id: String(a.id ?? a.name ?? `agent_${agents.length}`),
          name: String(a.name ?? `Agent ${agents.length}`),
          role: String(a.role ?? "General purpose assistant"),
          skills: Array.isArray(a.skills) ? a.skills.map(String) : [],
          provider: String(a.provider ?? "anthropic"),
          model: String(a.model ?? "claude-sonnet-4-20250514"),
          tools: Array.isArray(a.tools) ? a.tools.map(String) : []
        });
      }
    }

    if (agents.length === 0) {
      throw new Error(
        "No agents found. Connect Agent nodes below this TeamLead via control edges."
      );
    }

    const strategy = String(this.strategy ?? "coordinator") as TeamStrategy;
    const maxIterations = Number(this.max_iterations ?? 50);
    const maxConcurrency = Number(this.max_concurrency ?? 3);

    // Task board: always DB-backed, keyed by this node's ID as team_id.
    const teamId = this.__node_id || "default_team";
    const taskBoard: ITaskBoard = new DbTaskBoard(teamId);

    // Message bus: edge-native when in workflow, in-memory otherwise
    const messageBus = context.hasControlEventSupport
      ? new EdgeMessageBus(context)
      : undefined;

    const config: TeamConfig = {
      objective,
      agents,
      strategy,
      maxIterations,
      maxConcurrency
    };

    const executor = new TeamExecutor({
      config,
      context,
      taskBoard,
      messageBus
    });

    const allEvents: TeamEvent[] = [];

    // Stream events as the team works
    for await (const event of executor.execute()) {
      allEvents.push(event);

      if (event.type === "chunk") {
        yield {
          text: event.content,
          chunk: { type: "chunk", content: event.content, done: false }
        };
      } else if (event.type === "task_completed") {
        yield {
          text: `Task completed: ${event.taskId}`,
          chunk: {
            type: "chunk",
            content: `\n[Task ${event.taskId} completed]\n`,
            done: false
          }
        };
      } else if (event.type === "message_sent") {
        yield {
          text: `${event.message.from} → ${event.message.to}: ${event.message.subject}`,
          chunk: {
            type: "chunk",
            content: `\n[${event.message.from} → ${event.message.to}: ${event.message.subject}]\n`,
            done: false
          }
        };
      }
    }

    // Final output
    yield {
      result: executor.getResult(),
      board: executor.taskBoard.getSnapshot(),
      messages: executor.messageBus.getHistory(),
      events: allEvents
    };
  }

  async process(context?: ProcessingContext): Promise<Record<string, unknown>> {
    let lastOutput: Record<string, unknown> = {};
    for await (const item of this.genProcess(context)) {
      lastOutput = item;
    }
    return lastOutput;
  }
}

export const TEAM_NODES = [TeamAgentNode, TeamLeadNode] as const;
