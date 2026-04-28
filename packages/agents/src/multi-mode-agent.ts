/**
 * MultiModeAgent -- A unified agent that supports three execution modes:
 *
 * 1. "loop"        - Simple iterative LLM + tool calling (like SimpleAgent)
 * 2. "plan"        - LLM creates a task plan, then executes steps (like Agent)
 * 3. "multi-agent" - Sub-agents running in parallel (like TeamExecutor)
 *
 * This provides a single entry point for all agent execution strategies,
 * selectable via the `mode` option.
 */

import { createLogger } from "@nodetool-ai/config";
import type { BaseProvider } from "@nodetool-ai/runtime";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import type {
  ProcessingMessage,
  StepResult,
  LogUpdate,
  TaskUpdate,
  Chunk
} from "@nodetool-ai/protocol";
import { TaskUpdateEvent } from "@nodetool-ai/protocol";
import { BaseAgent } from "./base-agent.js";
import { StepExecutor } from "./step-executor.js";
import { TaskPlanner } from "./task-planner.js";
import { TaskExecutor } from "./task-executor.js";
import { ParallelTaskExecutor } from "./parallel-task-executor.js";
import { TeamExecutor } from "./team/team-executor.js";
import { SubAgentPlanner } from "./sub-agent-planner.js";
import type { Tool } from "./tools/base-tool.js";
import type { AgentMode, Step, SubAgentConfig, Task, TaskPlan } from "./types.js";
import type { NodeRegistry } from "@nodetool-ai/node-sdk";
import { GraphPlanner } from "./graph-planner.js";
import { AgentWorkflowRunner } from "./agent-workflow-runner.js";
import { randomUUID } from "node:crypto";

const log = createLogger("nodetool.agents.multi-mode-agent");

export interface MultiModeAgentOptions {
  name: string;
  objective: string;
  provider: BaseProvider;
  model: string;
  mode?: AgentMode;
  tools?: Tool[];
  inputs?: Record<string, unknown>;
  systemPrompt?: string;
  maxTokenLimit?: number;
  /** Output schema for structured results. */
  outputSchema?: Record<string, unknown>;

  // --- Plan mode options ---
  /** Model used for planning phase. Defaults to `model`. */
  planningModel?: string;
  /** Maximum number of steps the planner can create. */
  maxSteps?: number;
  /** Maximum iterations per step. */
  maxStepIterations?: number;
  /** Pre-defined task, skipping planning. */
  task?: Task;
  /** Use graph-native planner (builds DAG directly instead of TaskPlan). */
  useGraphPlanner?: boolean;
  /** Node registry for graph planner (required when useGraphPlanner is true). */
  registry?: NodeRegistry;
  /**
   * Configured BaseProvider instances by id. When supplied, the GraphPlanner
   * exposes a `find_model` tool so the agent can pick a real model+provider
   * for generic AI nodes (TextToImage, TextToVideo, etc.).
   */
  providers?: Record<string, BaseProvider>;

  // --- Loop mode options ---
  /** Maximum iterations for loop mode. */
  maxIterations?: number;

  // --- Multi-agent mode options ---
  /** Explicit sub-agent definitions. If not provided, agents are auto-specialized. */
  subAgents?: SubAgentConfig[];
  /** Number of sub-agents to auto-specialize (default: 3). Only used when subAgents is not provided. */
  numSubAgents?: number;
  /** Team execution strategy for multi-agent mode. */
  teamStrategy?: "coordinator" | "autonomous" | "hybrid";
  /** Maximum concurrent sub-agents. */
  maxConcurrency?: number;
}

export class MultiModeAgent extends BaseAgent {
  private readonly mode: AgentMode;
  private readonly outputSchema?: Record<string, unknown>;
  private readonly planningModel: string;
  private readonly maxSteps: number;
  private readonly maxStepIterations: number;
  private readonly maxIterations: number;
  private readonly initialTask?: Task;
  private readonly subAgents?: SubAgentConfig[];
  private readonly numSubAgents: number;
  private readonly teamStrategy: "coordinator" | "autonomous" | "hybrid";
  private readonly maxConcurrency: number;
  private readonly useGraphPlanner: boolean;
  private readonly registry?: NodeRegistry;
  private readonly providers?: Record<string, BaseProvider>;

  constructor(opts: MultiModeAgentOptions) {
    super({
      name: opts.name,
      objective: opts.objective,
      provider: opts.provider,
      model: opts.model,
      tools: opts.tools,
      inputs: opts.inputs,
      systemPrompt: opts.systemPrompt,
      maxTokenLimit: opts.maxTokenLimit
    });
    this.mode = opts.mode ?? "loop";
    this.outputSchema = opts.outputSchema;
    this.planningModel = opts.planningModel ?? opts.model;
    this.maxSteps = opts.maxSteps ?? 10;
    this.maxStepIterations = opts.maxStepIterations ?? 5;
    this.maxIterations = opts.maxIterations ?? 20;
    this.initialTask = opts.task;
    this.subAgents = opts.subAgents;
    this.numSubAgents = opts.numSubAgents ?? 3;
    this.teamStrategy = opts.teamStrategy ?? "coordinator";
    this.maxConcurrency = opts.maxConcurrency ?? 5;
    this.useGraphPlanner = opts.useGraphPlanner ?? false;
    this.registry = opts.registry;
    this.providers = opts.providers;

    if (opts.task) {
      this.task = opts.task;
    }
  }

  async *execute(
    context: ProcessingContext
  ): AsyncGenerator<ProcessingMessage> {
    log.info("MultiModeAgent started", {
      name: this.name,
      mode: this.mode,
      objective: this.objective.slice(0, 80)
    });

    yield {
      type: "log_update",
      node_id: "multi_mode_agent",
      node_name: this.name,
      content: `Starting agent in "${this.mode}" mode: ${this.objective.slice(0, 100)}...`,
      severity: "info"
    } satisfies LogUpdate;

    switch (this.mode) {
      case "loop":
        yield* this.executeLoopMode(context);
        break;
      case "plan":
        yield* this.executePlanMode(context);
        break;
      case "multi-agent":
        yield* this.executeMultiAgentMode(context);
        break;
      default:
        throw new Error(`Unknown agent mode: ${this.mode}`);
    }

    log.info("MultiModeAgent completed", { name: this.name, mode: this.mode });
  }

  // ---------------------------------------------------------------------------
  // Loop mode: Simple iterative LLM + tool calling
  // ---------------------------------------------------------------------------

  private async *executeLoopMode(
    context: ProcessingContext
  ): AsyncGenerator<ProcessingMessage> {
    const step: Step = {
      id: randomUUID(),
      instructions: this.objective,
      completed: false,
      dependsOn: [],
      outputSchema: this.outputSchema
        ? JSON.stringify(this.outputSchema)
        : undefined,
      logs: []
    };

    const task: Task = {
      id: randomUUID(),
      title: this.objective,
      steps: [step]
    };
    this.task = task;

    const executor = new StepExecutor({
      task,
      step,
      context,
      provider: this.provider,
      model: this.model,
      tools: this.tools,
      systemPrompt: this.systemPrompt || undefined,
      maxTokenLimit: this.maxTokenLimit,
      maxIterations: this.maxIterations
    });

    for await (const item of executor.execute()) {
      if (item.type === "step_result") {
        this.results = (item as StepResult).result;
      }
      yield item;
    }
  }

  // ---------------------------------------------------------------------------
  // Plan mode: TaskPlanner -> TaskExecutor
  // ---------------------------------------------------------------------------

  private async *executePlanMode(
    context: ProcessingContext
  ): AsyncGenerator<ProcessingMessage> {
    // If pre-defined task, fall back to single-task execution
    if (this.initialTask) {
      yield* this.executeSingleTask(context, this.initialTask);
      return;
    }

    // Graph-native planner: build DAG directly
    if (this.useGraphPlanner && this.registry) {
      yield* this.executeGraphPlanMode(context);
      return;
    }

    log.info("Planning phase started", { name: this.name });
    yield {
      type: "log_update",
      node_id: "agent_planner",
      node_name: this.name,
      content: `Planning parallel tasks for objective: ${this.objective.slice(0, 100)}...`,
      severity: "info"
    } satisfies LogUpdate;

    const planner = new TaskPlanner({
      provider: this.provider,
      model: this.planningModel,
      reasoningModel: this.planningModel,
      tools: this.tools,
      systemPrompt: this.systemPrompt || undefined,
      outputSchema: this.outputSchema,
      inputs: this.inputs
    });

    const planGen = planner.planMultiTask(this.objective, context);
    let planResult = await planGen.next();
    while (!planResult.done) {
      yield planResult.value;
      planResult = await planGen.next();
    }
    const taskPlan = planResult.value;

    if (!taskPlan) {
      throw new Error("TaskPlanner failed to create a task plan.");
    }

    log.info("Planning complete", {
      name: this.name,
      tasks: taskPlan.tasks.length,
      totalSteps: taskPlan.tasks.reduce((sum, t) => sum + t.steps.length, 0)
    });

    // Set task for backward compatibility
    if (taskPlan.tasks.length > 0) {
      this.task = taskPlan.tasks[0];
    }

    // Apply output schema to last step of last task
    if (this.outputSchema && taskPlan.tasks.length > 0) {
      const lastTask = taskPlan.tasks[taskPlan.tasks.length - 1];
      if (lastTask.steps.length > 0) {
        lastTask.steps[lastTask.steps.length - 1].outputSchema =
          JSON.stringify(this.outputSchema);
      }
    }

    const totalSteps = taskPlan.tasks.reduce(
      (sum, t) => sum + t.steps.length,
      0
    );
    const independentTasks = taskPlan.tasks.filter(
      (t) => !t.dependsOn || t.dependsOn.length === 0
    ).length;

    yield {
      type: "log_update",
      node_id: "agent_executor",
      node_name: this.name,
      content: `Starting parallel execution: ${taskPlan.tasks.length} tasks (${independentTasks} parallelizable), ${totalSteps} total steps...`,
      severity: "info"
    } satisfies LogUpdate;

    const executor = new ParallelTaskExecutor({
      provider: this.provider,
      model: this.model,
      context,
      tools: [...this.tools],
      taskPlan,
      systemPrompt: this.systemPrompt || undefined,
      inputs: this.inputs,
      maxStepIterations: this.maxStepIterations,
      maxTokenLimit: this.maxTokenLimit
    });

    for await (const item of executor.execute()) {
      if (item.type === "step_result") {
        const stepResult = item as StepResult;
        if (stepResult.is_task_result) {
          this.results = stepResult.result;
        }
      }
      yield item;
    }

    // If no task_result was captured, use the final task's result
    if (this.results === null) {
      this.results = executor.getFinalResult();
    }
  }

  // ---------------------------------------------------------------------------
  // Graph plan mode: GraphPlanner -> WorkflowRunner
  // ---------------------------------------------------------------------------

  private async *executeGraphPlanMode(
    context: ProcessingContext
  ): AsyncGenerator<ProcessingMessage> {
    log.info("Graph planning phase started", { name: this.name });

    yield {
      type: "log_update",
      node_id: "graph_planner",
      node_name: this.name,
      content: `Building workflow graph for: ${this.objective.slice(0, 100)}...`,
      severity: "info"
    } satisfies LogUpdate;

    const planner = new GraphPlanner({
      provider: this.provider,
      model: this.planningModel,
      registry: this.registry!,
      tools: this.tools,
      systemPrompt: this.systemPrompt || undefined,
      outputSchema: this.outputSchema,
      inputs: this.inputs,
      providers: this.providers
    });

    const planGen = planner.plan(this.objective, context);
    let planResult = await planGen.next();
    while (!planResult.done) {
      yield planResult.value;
      planResult = await planGen.next();
    }
    const graphData = planResult.value;

    if (!graphData) {
      throw new Error("GraphPlanner failed to build a workflow graph.");
    }

    log.info("Graph planning complete", {
      name: this.name,
      nodes: graphData.nodes.length,
      edges: graphData.edges.length
    });

    yield {
      type: "log_update",
      node_id: "graph_executor",
      node_name: this.name,
      content: `Executing workflow: ${graphData.nodes.length} nodes, ${graphData.edges.length} edges...`,
      severity: "info"
    } satisfies LogUpdate;

    const runner = new AgentWorkflowRunner({
      provider: this.provider,
      model: this.model,
      registry: this.registry!,
      tools: [...this.tools],
      context,
      systemPrompt: this.systemPrompt || undefined,
      maxTokenLimit: this.maxTokenLimit,
      maxStepIterations: this.maxStepIterations,
      inputs: this.inputs
    });

    for await (const item of runner.execute(graphData)) {
      if (item.type === "step_result") {
        const stepResult = item as StepResult;
        if (stepResult.is_task_result) {
          this.results = stepResult.result;
        }
      }
      yield item;
    }
  }

  /**
   * Execute a single pre-defined task (legacy path for backward compatibility).
   */
  private async *executeSingleTask(
    context: ProcessingContext,
    task: Task
  ): AsyncGenerator<ProcessingMessage> {
    this.task = task;

    if (this.outputSchema && task.steps.length > 0) {
      task.steps[task.steps.length - 1].outputSchema = JSON.stringify(
        this.outputSchema
      );
    }

    yield {
      type: "log_update",
      node_id: "agent_executor",
      node_name: this.name,
      content: `Starting execution of ${task.steps.length} steps...`,
      severity: "info"
    } satisfies LogUpdate;

    const executor = new TaskExecutor({
      provider: this.provider,
      model: this.model,
      context,
      tools: [...this.tools],
      task,
      systemPrompt: this.systemPrompt || undefined,
      inputs: this.inputs,
      maxSteps: this.maxSteps,
      maxStepIterations: this.maxStepIterations,
      maxTokenLimit: this.maxTokenLimit,
      parallelExecution: true
    });

    for await (const item of executor.executeTasks()) {
      if (item.type === "step_result") {
        const stepResult = item as StepResult;
        if (stepResult.is_task_result) {
          this.results = stepResult.result;
          yield {
            type: "task_update",
            event: TaskUpdateEvent.TaskCompleted,
            task: task as unknown as TaskUpdate["task"]
          } satisfies TaskUpdate;
        }
      }
      yield item;
    }
  }

  // ---------------------------------------------------------------------------
  // Multi-agent mode: auto-specialize sub-agents and run TeamExecutor
  // ---------------------------------------------------------------------------

  private async *executeMultiAgentMode(
    context: ProcessingContext
  ): AsyncGenerator<ProcessingMessage> {
    // Resolve sub-agent configs: use explicit or auto-specialize
    let agentConfigs: SubAgentConfig[];

    if (this.subAgents && this.subAgents.length > 0) {
      agentConfigs = this.subAgents;
      log.info("Using explicit sub-agent configs", {
        count: agentConfigs.length
      });
    } else {
      log.info("Auto-specializing sub-agents", { count: this.numSubAgents });

      yield {
        type: "log_update",
        node_id: "sub_agent_planner",
        node_name: this.name,
        content: `Auto-specializing ${this.numSubAgents} sub-agents for objective...`,
        severity: "info"
      } satisfies LogUpdate;

      const planner = new SubAgentPlanner({
        provider: this.provider,
        model: this.planningModel,
        tools: this.tools
      });

      const planGen = planner.plan(this.objective, this.numSubAgents);
      let planResult = await planGen.next();
      while (!planResult.done) {
        yield planResult.value;
        planResult = await planGen.next();
      }
      agentConfigs = planResult.value;
    }

    if (agentConfigs.length === 0) {
      throw new Error("No sub-agents configured for multi-agent mode.");
    }

    yield {
      type: "log_update",
      node_id: "team_executor",
      node_name: this.name,
      content: `Starting team of ${agentConfigs.length} agents with "${this.teamStrategy}" strategy...`,
      severity: "info"
    } satisfies LogUpdate;

    // Convert SubAgentConfig[] to AgentIdentity[] for TeamExecutor
    const providerKey =
      ((this.provider as unknown as Record<string, unknown>)
        .provider as string) ?? "openai";
    const agents = agentConfigs.map((config, index) => ({
      id: `agent_${index}_${config.name.toLowerCase().replace(/\s+/g, "_")}`,
      name: config.name,
      role: config.role,
      skills: config.skills,
      provider: config.provider ?? providerKey,
      model: config.model ?? this.model,
      tools: config.tools ?? this.tools.map((t) => t.name)
    }));

    const teamExecutor = new TeamExecutor({
      config: {
        objective: this.objective,
        agents,
        strategy: this.teamStrategy,
        maxConcurrency: this.maxConcurrency
      },
      context,
      sharedTools: [...this.tools]
    });

    for await (const event of teamExecutor.execute()) {
      // Convert TeamEvents to ProcessingMessages
      switch (event.type) {
        case "chunk":
          yield {
            type: "chunk",
            content: `[${event.agentId}] ${event.content}`,
            done: false
          } satisfies Chunk;
          break;

        case "task_created":
          yield {
            type: "log_update",
            node_id: "team_executor",
            node_name: this.name,
            content: `Task created: ${event.task.title}`,
            severity: "info"
          } satisfies LogUpdate;
          break;

        case "task_completed":
          yield {
            type: "log_update",
            node_id: "team_executor",
            node_name: this.name,
            content: `Task ${event.taskId} completed`,
            severity: "info"
          } satisfies LogUpdate;
          break;

        case "task_failed":
          yield {
            type: "log_update",
            node_id: "team_executor",
            node_name: this.name,
            content: `Task ${event.taskId} failed: ${event.reason}`,
            severity: "warning"
          } satisfies LogUpdate;
          break;

        case "agent_started":
          yield {
            type: "log_update",
            node_id: "team_executor",
            node_name: this.name,
            content: `Agent ${event.agentId} started`,
            severity: "info"
          } satisfies LogUpdate;
          break;

        case "deadlock_detected":
          yield {
            type: "log_update",
            node_id: "team_executor",
            node_name: this.name,
            content: `Deadlock detected in tasks: ${event.blockingTasks.join(", ")}`,
            severity: "error"
          } satisfies LogUpdate;
          break;

        case "team_complete":
          this.results = event.result;
          yield {
            type: "log_update",
            node_id: "team_executor",
            node_name: this.name,
            content: "Team execution complete",
            severity: "info"
          } satisfies LogUpdate;
          break;
      }
    }

    // If no result was set from team_complete, get it from the executor
    if (this.results === null) {
      this.results = teamExecutor.getResult();
    }
  }

  getResults(): unknown {
    return this.results;
  }
}
