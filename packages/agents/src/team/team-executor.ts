/**
 * TeamExecutor — Orchestrates a team of agents collaborating via
 * a shared TaskBoard and MessageBus.
 *
 * Strategies:
 * - coordinator: First agent decomposes the objective, others execute tasks.
 * - autonomous: All agents see the objective and self-organize.
 * - hybrid: Coordinator creates initial plan, agents can create subtasks.
 */

import { createLogger } from "@nodetool/config";
import type {
  BaseProvider,
  ProcessingContext,
  Message,
  ProviderTool
} from "@nodetool/runtime";
import { getProvider } from "@nodetool/runtime";
import { Tool } from "../tools/base-tool.js";
import { MessageBus } from "./message-bus.js";
import { TaskBoard } from "./task-board.js";
import { createTeamTools } from "./team-tools.js";
import type {
  AgentIdentity,
  IMessageBus,
  ITaskBoard,
  TeamConfig,
  TeamEvent,
  TeamStrategy
} from "./types.js";

const log = createLogger("nodetool.agents.team-executor");

const DEFAULT_MAX_ITERATIONS = 50;
const DEFAULT_MAX_CONCURRENCY = 5;
const IDLE_CHECK_INTERVAL_MS = 500;

export interface TeamExecutorOptions {
  config: TeamConfig;
  context: ProcessingContext;
  /** Extra tools available to all agents (search, code, etc.). */
  sharedTools?: Tool[];
  /** Pre-populated task board (optional). Defaults to in-memory TaskBoard. */
  taskBoard?: ITaskBoard;
  /** Pre-populated message bus (optional). Defaults to in-memory MessageBus. */
  messageBus?: IMessageBus;
}

interface AgentState {
  identity: AgentIdentity;
  provider: BaseProvider;
  history: Message[];
  iterations: number;
  idle: boolean;
  finished: boolean;
  currentTaskId?: string;
}

export class TeamExecutor {
  private config: TeamConfig;
  private context: ProcessingContext;
  private board: ITaskBoard;
  private bus: IMessageBus;
  private sharedTools: Tool[];
  private agents = new Map<string, AgentState>();
  private events: TeamEvent[] = [];
  private maxIterations: number;
  private maxConcurrency: number;
  private totalIterations = 0;
  private _result: unknown = null;

  constructor(opts: TeamExecutorOptions) {
    this.config = opts.config;
    this.context = opts.context;
    this.board = opts.taskBoard ?? new TaskBoard();
    this.bus = opts.messageBus ?? new MessageBus();
    this.sharedTools = opts.sharedTools ?? [];
    this.maxIterations = opts.config.maxIterations ?? DEFAULT_MAX_ITERATIONS;
    this.maxConcurrency = opts.config.maxConcurrency ?? DEFAULT_MAX_CONCURRENCY;
  }

  get taskBoard(): ITaskBoard {
    return this.board;
  }

  get messageBus(): IMessageBus {
    return this.bus;
  }

  getResult(): unknown {
    return this._result;
  }

  getEvents(): TeamEvent[] {
    return [...this.events];
  }

  /**
   * Main execution loop. Yields TeamEvents as the team works.
   */
  async *execute(): AsyncGenerator<TeamEvent> {
    // Initialize agents
    for (const identity of this.config.agents) {
      const provider = await getProvider(identity.provider);
      this.bus.register(identity.id);

      const state: AgentState = {
        identity,
        provider,
        history: [],
        iterations: 0,
        idle: false,
        finished: false
      };

      // Build system prompt with team context
      state.history.push({
        role: "system",
        content: this.buildSystemPrompt(identity)
      });

      this.agents.set(identity.id, state);

      const event: TeamEvent = {
        type: "agent_started",
        agentId: identity.id,
        timestamp: Date.now()
      };
      this.events.push(event);
      yield event;
    }

    // Strategy-specific initialization
    if (
      this.config.strategy === "coordinator" ||
      this.config.strategy === "hybrid"
    ) {
      yield* this.runCoordinatorPhase();
    } else {
      // Autonomous: create a single root task for the objective
      const rootTask = this.board.create({
        title: "Complete objective",
        description: this.config.objective,
        createdBy: "system",
        priority: 0
      });
      const event: TeamEvent = {
        type: "task_created",
        task: rootTask,
        timestamp: Date.now()
      };
      this.events.push(event);
      yield event;
    }

    // Main work loop — run agents concurrently
    yield* this.runWorkLoop();

    // Collect final result
    const completedTasks = this.board
      .getSnapshot()
      .filter((t) => t.status === "done");
    if (completedTasks.length === 1) {
      this._result = completedTasks[0].result;
    } else {
      this._result = completedTasks.map((t) => ({
        title: t.title,
        result: t.result
      }));
    }

    const completeEvent: TeamEvent = {
      type: "team_complete",
      result: this._result,
      timestamp: Date.now()
    };
    this.events.push(completeEvent);
    yield completeEvent;
  }

  // ─── Strategy Phases ───

  /**
   * Coordinator phase: first agent decomposes the objective into tasks.
   */
  private async *runCoordinatorPhase(): AsyncGenerator<TeamEvent> {
    const coordinator = this.agents.get(this.config.agents[0].id);
    if (!coordinator) return;

    const decompositionPrompt = [
      `**Team Objective:** ${this.config.objective}`,
      "",
      "You are the coordinator. Break this objective into concrete tasks for the team.",
      "Use `create_task` for each task. Set `required_skills` to match team members' abilities.",
      "Set priorities (0=highest) and dependencies between tasks where needed.",
      "After creating all tasks, send a brief plan summary via `broadcast`."
    ].join("\n");

    coordinator.history.push({ role: "user", content: decompositionPrompt });

    yield* this.runAgentIteration(coordinator);
  }

  /**
   * Main work loop: agents check for tasks, claim them, execute, complete.
   */
  private async *runWorkLoop(): AsyncGenerator<TeamEvent> {
    let consecutiveIdle = 0;
    const MAX_IDLE = 3;

    while (this.totalIterations < this.maxIterations) {
      // Check if board is complete
      this.board.resolveParents();
      if (this.board.isComplete()) break;

      // Deadlock detection
      const deadlock = this.board.detectDeadlock();
      if (deadlock) {
        const event: TeamEvent = {
          type: "deadlock_detected",
          blockingTasks: deadlock,
          timestamp: Date.now()
        };
        this.events.push(event);
        yield event;
        break;
      }

      // Find agents that should work
      const workableAgents = this.getWorkableAgents();
      if (workableAgents.length === 0) {
        consecutiveIdle++;
        if (consecutiveIdle >= MAX_IDLE) break;
        // Wait for any in-progress tasks
        await new Promise((r) => setTimeout(r, IDLE_CHECK_INTERVAL_MS));
        continue;
      }
      consecutiveIdle = 0;

      // Run agents (up to concurrency limit)
      const batch = workableAgents.slice(0, this.maxConcurrency);

      // Run sequentially for deterministic behavior (parallel option for later)
      for (const agent of batch) {
        yield* this.runAgentWorkCycle(agent);

        if (this.totalIterations >= this.maxIterations) break;
        this.board.resolveParents();
        if (this.board.isComplete()) break;
      }
    }
  }

  /**
   * Single agent work cycle: check messages, check board, work on task.
   */
  private async *runAgentWorkCycle(
    agent: AgentState
  ): AsyncGenerator<TeamEvent> {
    // Build context-aware prompt
    const promptParts: string[] = [];

    // Inject pending messages (receive atomically drains the inbox)
    const messages = this.bus.receive(agent.identity.id);
    if (messages.length > 0) {
      promptParts.push("**New messages from teammates:**");
      for (const m of messages) {
        promptParts.push(`- [${m.from}] (${m.type}) ${m.subject}: ${m.body}`);
      }
      promptParts.push("");
    }

    // Inject board state
    const available = this.board.getAvailable(agent.identity);
    const boardSnapshot = this.board.getSnapshot();
    const myTasks = boardSnapshot.filter(
      (t) =>
        t.claimedBy === agent.identity.id &&
        (t.status === "claimed" || t.status === "working")
    );

    if (myTasks.length > 0) {
      promptParts.push("**Your current tasks:**");
      for (const t of myTasks) {
        promptParts.push(`- [${t.id}] ${t.title}: ${t.description}`);
      }
      promptParts.push("");
      promptParts.push(
        "Continue working on your current task(s). When done, call `complete_task` with the result."
      );
    } else if (available.length > 0) {
      promptParts.push("**Tasks available to claim:**");
      for (const t of available) {
        promptParts.push(
          `- [${t.id}] (priority ${t.priority}) ${t.title}: ${t.description}`
        );
      }
      promptParts.push("");
      promptParts.push(
        "Claim a task that matches your skills using `claim_task`, then complete it."
      );
    } else {
      // Nothing to do
      agent.idle = true;
      const event: TeamEvent = {
        type: "agent_idle",
        agentId: agent.identity.id,
        timestamp: Date.now()
      };
      this.events.push(event);
      yield event;
      return;
    }

    agent.history.push({ role: "user", content: promptParts.join("\n") });
    yield* this.runAgentIteration(agent);
  }

  /**
   * Run a single LLM iteration for an agent (may involve tool calls).
   */
  private async *runAgentIteration(
    agent: AgentState
  ): AsyncGenerator<TeamEvent> {
    agent.idle = false;
    this.totalIterations++;
    agent.iterations++;

    // Build tool list: team tools + shared tools + agent-specific tools
    const teamTools = createTeamTools(
      agent.identity,
      this.config.agents,
      this.bus,
      this.board
    );
    const allTools: Tool[] = [...teamTools, ...this.sharedTools];
    const providerTools: ProviderTool[] = allTools.map((t) =>
      t.toProviderTool()
    );

    // Check if agentic provider (handles tool loop internally)
    const isAgentic =
      (agent.provider as unknown as Record<string, unknown>).provider ===
      "claude_agent";

    if (isAgentic) {
      yield* this.runAgenticIteration(agent, allTools, providerTools);
    } else {
      yield* this.runStandardIteration(agent, allTools, providerTools);
    }
  }

  /**
   * Agentic provider: single call with onToolCall handles the full loop.
   */
  private async *runAgenticIteration(
    agent: AgentState,
    allTools: Tool[],
    providerTools: ProviderTool[]
  ): AsyncGenerator<TeamEvent> {
    const onToolCall = async (
      name: string,
      args: Record<string, unknown>
    ): Promise<string> => {
      const tool = allTools.find((t) => t.name === name);
      if (!tool) return JSON.stringify({ error: `Unknown tool: ${name}` });
      try {
        const result = await tool.process(this.context, args);
        return typeof result === "string"
          ? result
          : JSON.stringify(result ?? null);
      } catch (e) {
        return JSON.stringify({ error: String(e) });
      }
    };

    const response = await agent.provider.generateMessageTraced({
      messages: agent.history,
      model: agent.identity.model,
      tools: providerTools,
      onToolCall
    });

    if (response.content) {
      const event: TeamEvent = {
        type: "chunk",
        agentId: agent.identity.id,
        content: String(response.content),
        timestamp: Date.now()
      };
      this.events.push(event);
      yield event;
    }

    agent.history.push({
      role: "assistant",
      content: response.content,
      toolCalls: response.toolCalls ?? undefined
    });
  }

  /**
   * Standard provider: request-response loop with explicit tool execution.
   */
  private async *runStandardIteration(
    agent: AgentState,
    allTools: Tool[],
    providerTools: ProviderTool[]
  ): AsyncGenerator<TeamEvent> {
    const MAX_TOOL_ROUNDS = 5;

    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const response = await agent.provider.generateMessageTraced({
        messages: agent.history,
        model: agent.identity.model,
        tools: providerTools
      });

      if (response.content) {
        const event: TeamEvent = {
          type: "chunk",
          agentId: agent.identity.id,
          content: String(response.content),
          timestamp: Date.now()
        };
        this.events.push(event);
        yield event;
      }

      agent.history.push({
        role: "assistant",
        content: response.content,
        toolCalls: response.toolCalls ?? undefined
      });

      if (!response.toolCalls || response.toolCalls.length === 0) break;

      // Execute tool calls
      for (const toolCall of response.toolCalls) {
        const tool = allTools.find((t) => t.name === toolCall.name);
        let result: unknown;
        if (!tool) {
          result = { error: `Unknown tool: ${toolCall.name}` };
        } else {
          try {
            result = await tool.process(this.context, toolCall.args);
          } catch (e) {
            result = { error: String(e) };
          }
        }

        const serialized =
          typeof result === "string"
            ? result
            : JSON.stringify(result ?? "Tool returned no output.");

        agent.history.push({
          role: "tool",
          content: serialized,
          toolCallId: toolCall.id
        });
      }
    }
  }

  // ─── Helpers ───

  private getWorkableAgents(): AgentState[] {
    const result: AgentState[] = [];
    for (const agent of this.agents.values()) {
      if (agent.finished) continue;

      // Has current tasks?
      const boardSnapshot = this.board.getSnapshot();
      const hasCurrent = boardSnapshot.some(
        (t) =>
          t.claimedBy === agent.identity.id &&
          (t.status === "claimed" || t.status === "working")
      );
      if (hasCurrent) {
        result.push(agent);
        continue;
      }

      // Has available tasks?
      const available = this.board.getAvailable(agent.identity);
      if (available.length > 0) {
        result.push(agent);
        continue;
      }

      // Has pending messages?
      if (this.bus.pendingCount(agent.identity.id) > 0) {
        result.push(agent);
        continue;
      }
    }
    return result;
  }

  private buildSystemPrompt(agent: AgentIdentity): string {
    const roster = this.config.agents
      .map(
        (a) =>
          `- ${a.id} (${a.name}): ${a.role} | skills: ${a.skills.join(", ")}`
      )
      .join("\n");

    const strategyInstructions = this.getStrategyInstructions(
      agent,
      this.config.strategy
    );

    return [
      `# You are "${agent.name}" — ${agent.role}`,
      "",
      `## Your Identity`,
      `- ID: ${agent.id}`,
      `- Skills: ${agent.skills.join(", ")}`,
      "",
      `## Team Roster`,
      roster,
      "",
      `## Team Objective`,
      this.config.objective,
      "",
      `## How This Works`,
      "You collaborate with your teammates via a shared task board and messages.",
      "- Use `list_tasks` to see the board, `claim_task` to take work, `complete_task` when done.",
      "- Use `send_message` to coordinate with specific teammates, or `broadcast` for the whole team.",
      "- Use `create_task` to add new work items, `decompose_task` to break complex tasks apart.",
      "",
      strategyInstructions,
      "",
      "## Rules",
      "- Only work on tasks you've claimed.",
      "- Complete tasks promptly and mark them done.",
      "- Communicate blockers early — send a message or fail the task.",
      "- Be concise in messages. Focus on actionable information."
    ].join("\n");
  }

  private getStrategyInstructions(
    agent: AgentIdentity,
    strategy: TeamStrategy
  ): string {
    const isCoordinator = agent.id === this.config.agents[0]?.id;

    switch (strategy) {
      case "coordinator":
        return isCoordinator
          ? [
              "## Your Role: Coordinator",
              "You lead this team. Your job is to:",
              "1. Decompose the objective into concrete tasks on the board.",
              "2. Set priorities and dependencies appropriately.",
              "3. Monitor progress and create follow-up tasks as needed.",
              "4. Do NOT do implementation work yourself — delegate to specialists."
            ].join("\n")
          : [
              "## Your Role: Specialist",
              "The coordinator will create tasks on the board.",
              "Claim tasks matching your skills and complete them.",
              "Message the coordinator if you're blocked or need clarification."
            ].join("\n");

      case "autonomous":
        return [
          "## Strategy: Autonomous",
          "There is no assigned coordinator. Self-organize with your teammates.",
          "Check the board for work, create tasks as needed, and communicate via messages.",
          "Claim tasks that match your skills. If the board is empty, create tasks to advance the objective."
        ].join("\n");

      case "hybrid":
        return isCoordinator
          ? [
              "## Your Role: Lead (Hybrid)",
              "Create the initial task plan, but team members can also create subtasks.",
              "Focus on high-level coordination. Review completed work."
            ].join("\n")
          : [
              "## Your Role: Team Member (Hybrid)",
              "The lead creates the initial plan, but you can create subtasks too.",
              "Claim tasks, complete them, and create follow-up tasks as needed."
            ].join("\n");
    }
  }
}
