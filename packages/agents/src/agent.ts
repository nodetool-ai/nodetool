/**
 * Agent -- orchestrates AI-driven task execution using LLMs and Tools.
 *
 * Port of src/nodetool/agents/agent.py (simplified for TypeScript).
 *
 * The Agent class takes a complex objective, decomposes it into a step-by-step
 * plan using TaskPlanner, then executes that plan via TaskExecutor.
 * Skills are loaded from the user-scoped database.
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { createLogger } from "@nodetool-ai/config";
import type { BaseProvider, Message } from "@nodetool-ai/runtime";
import { withAgentSpanGen } from "@nodetool-ai/runtime";

const log = createLogger("nodetool.agents.agent");
import type { ProcessingContext } from "@nodetool-ai/runtime";
import type {
  ProcessingMessage,
  LogUpdate,
  PlanningUpdate,
  TaskUpdate,
  Chunk
} from "@nodetool-ai/protocol";
import { TaskUpdateEvent } from "@nodetool-ai/protocol";
import { BoundedHandle, type SupervisorBounds } from "@nodetool-ai/kernel";
import { TaskPlanner } from "./task-planner.js";
import { sessionAllowedPackages } from "./codeact/sandbox-packages.js";
import { sandboxPackageSkills } from "./codeact/sandbox-package-docs.js";
import {
  resolveAgentGraph,
  runWorkflowAsAgent,
  type AgentGraphSource,
  type WorkflowAgentRunOptions
} from "./workflow-agent.js";
import {
  SupervisorAgent,
  type SupervisorAgentOptions
} from "./supervisor/supervisor-agent.js";
import { TaskExecutor } from "./task-executor.js";
import { ParallelTaskExecutor } from "./parallel-task-executor.js";
import { CompilerAgent } from "./compiler-agent.js";
import { authorGraph } from "./author-graph.js";
import {
  executeAgentGraph,
  applyRunPolicy,
  type RunPolicy
} from "./execute-agent-graph.js";
import type { Tool } from "./tools/base-tool.js";
import { gateTools } from "./capabilities/gate-tools.js";
import {
  SecurityMonitor,
  createSecurityMonitorConsult
} from "./security-monitor.js";
import type {
  PlanApprovalDecision,
  RequestPlanApproval,
  Task,
  TaskPlan
} from "./types.js";
import { PLAN_APPROVAL_CONTEXT_KEY } from "./types.js";
import type { PlanCache, CheckpointStore } from "./checkpoint-store.js";
import { resolveAgentPolicy, type AgentPolicy } from "./agent-policy.js";
import type { NodeRegistry } from "@nodetool-ai/node-sdk";
import {
  type AgentOutputFormat,
  outputFormatDirective
} from "./output-format.js";
import {
  formatMemoryForPrompt,
  type LongTermMemory
} from "./long-term-memory.js";
import { isFunction, isString } from "./utils/type-guards.js";

// ---------------------------------------------------------------------------
// Skill types and helpers
// ---------------------------------------------------------------------------

export interface AgentSkill {
  name: string;
  description: string;
  instructions: string;
  path: string;
}

const SKILL_WORD_RE = /[a-z0-9]+/g;

/**
 * Parse minimal YAML frontmatter (key: value pairs).
 *
 * Re-exported from protocol, where the SKILL.md parser lives so sandbox pack
 * discovery reads the same format the skill system does.
 */
export { parseFrontmatter } from "@nodetool-ai/protocol";

/** @deprecated Filesystem skill loading is removed. */
async function loadSkillFromFile(
  _skillFile: string
): Promise<AgentSkill | null> {
  return null;
}

/** @deprecated Filesystem skill discovery is removed. */
async function findSkillFiles(_dir: string): Promise<string[]> {
  return [];
}

/**
 * @deprecated Filesystem skill loading is removed. Skills are loaded from the
 * database via `discoverSkills(context)`.
 */
export async function loadSkillsFromDirectory(
  _dir: string
): Promise<AgentSkill[]> {
  return [];
}

/**
 * Load skills for a user from the database. This is the new source of truth;
 * filesystem directories are no longer consulted. The table stores `name` and
 * `description` as columns and `content` as markdown (no frontmatter).
 */
async function loadSkillsFromDatabase(
  userId: string
): Promise<AgentSkill[]> {
  const { Skill } = await import("@nodetool-ai/models");
  const rows = await Skill.listByUser(userId);
  return rows.map((row) => ({
    name: row.name,
    description: row.description,
    instructions: row.content,
    path: `skill:${row.id}`
  }));
}

// ---------------------------------------------------------------------------
// Dedupe helper
// ---------------------------------------------------------------------------

function dedupePreserveOrder(items: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of items) {
    if (!seen.has(item)) {
      seen.add(item);
      result.push(item);
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Agent
// ---------------------------------------------------------------------------

export interface AgentOptions {
  name: string;
  objective: string;
  provider: BaseProvider;
  model: string;
  /** Model used for planning phase. Defaults to `model`. */
  planningModel?: string;
  /** Model used for reasoning/refinement within the planner. Defaults to `model`. */
  reasoningModel?: string;
  description?: string;
  tools?: Tool[];
  inputs?: Record<string, unknown>;
  systemPrompt?: string;
  workspace?: string;
  maxSteps?: number;
  maxStepIterations?: number;
  /**
   * Cap on output tokens per provider turn, threaded to every step executor
   * and the final compiler pass. Undefined lets each provider use its own
   * default. `maxSteps` (plan size) and `maxStepIterations` (tool-call rounds)
   * are unrelated knobs and stay separate.
   */
  maxTokens?: number;
  outputSchema?: Record<string, unknown>;
  /**
   * Format for the agent's final result.
   * - "structured" (default): honors `outputSchema`; finish_step returns JSON.
   * - "markdown" / "text" / "html": final result is a string in that format.
   *   `outputSchema` is ignored.
   */
  outputFormat?: AgentOutputFormat;
  /** Pre-defined task to execute, skipping the planning phase. */
  task?: Task;
  skills?: string[];
  skillDirs?: string[];
  /**
   * Sandbox package specifiers this session consents to. A step's CodeAct
   * action may import exactly these, and a trusted pack among them registers
   * its SKILL.md as an ordinary skill. Nothing is allowed by default:
   * installing a pack is not choosing it.
   */
  sandboxPackages?: readonly string[];
  /**
   * Optional long-term memory. When provided, items relevant to the agent's
   * objective are recalled before planning and folded into the system prompt
   * so the planner and every step inherit the same context.
   *
   * **Writes are opt-in.** Agent runs do NOT auto-mine the objective +
   * final result for memories by default — agent results are generated
   * output, not user-confirmed facts, and persisting them across sessions
   * pollutes the store with hallucinations or run-specific artefacts.
   * To re-enable automatic mining for a specific agent, set
   * {@link AgentOptions.autoPersistMemory} to `true`.
   */
  longTermMemory?: LongTermMemory | null;
  /**
   * If `true`, mine the objective + final result for memories on a
   * best-effort basis when the run finishes. Defaults to `false`.
   */
  autoPersistMemory?: boolean;
  /**
   * Run an LLM synthesis pass over recalled memory before folding it into the
   * prompt. Returns <=7 cited, query-relevant facts instead of raw items.
   * Default ON: pass `false` to use the raw recall path. The synthesis
   * provider/model live on the {@link LongTermMemory} instance (typically the
   * chat/extraction provider); when the LTM has none, this silently degrades to
   * raw recall regardless of the flag. Note that long-term memory itself is
   * opt-in, so this only has any effect once memory is enabled.
   */
  synthesizeRecall?: boolean;
  /**
   * Use the graph-native planner: build a DAG of nodes directly instead of a
   * TaskPlan. Requires {@link registry}. When set, planning emits a workflow
   * graph executed by {@link executeAgentGraph}.
   */
  useGraphPlanner?: boolean;
  /**
   * Run an existing workflow as this agent: an inline graph, or
   * `{ workflowId }` to hydrate one from the workflow table. There is no
   * planning phase — the graph is the plan — and the agent supervises the run
   * instead of authoring it, so `getResults()` returns the run's outputs.
   * Requires {@link registry}. Takes precedence over every planning mode.
   *
   * Supervision is opt-in: without {@link supervise} the run is an ordinary
   * kernel run that never constructs an escalation.
   */
  graph?: AgentGraphSource;
  /**
   * Supervise the {@link graph} run: a failing node invocation escalates to
   * this agent, which answers with a verdict (retry / substitute / skip /
   * end_stream / fail). Default `false` — the flip to default-on is gated on
   * the eval suite, not on this option.
   */
  supervise?: boolean;
  /** Decision, retry, and timeout ceilings for {@link supervise}. */
  supervisorBounds?: SupervisorBounds;
  /** Dollar ceiling on supervision for the whole run. */
  maxSupervisorCostUsd?: number;
  /**
   * Concurrent sub-agent dispatch beyond this queues. Bounds task fan-out in
   * {@link ParallelTaskExecutor} and step fan-out in {@link TaskExecutor}.
   * Default 8.
   */
  maxConcurrentAgents?: number;
  /** Node registry required when {@link useGraphPlanner} is true. */
  registry?: NodeRegistry;
  /**
   * Configured BaseProvider instances by id. When supplied, the graph author
   * exposes a `find_model` tool so the agent can pick a real model+provider
   * for generic AI nodes (TextToImage, TextToVideo, etc.).
   */
  providers?: Record<string, BaseProvider>;
  /**
   * Opt-in autonomous security monitor. **Default DISABLED.**
   *
   * When `{ enabled: true }`, the agent builds an LLM judge (from its own
   * provider + reasoning model) and consults it before every write / execute /
   * external tool call. A `block` verdict stops the call with a structured
   * error the agent loop already understands. Read-class tools are NEVER
   * consulted. When omitted or `{ enabled: false }`, no monitor is constructed
   * and the agent's tool array is passed through unchanged — existing runs are
   * byte-for-byte identical.
   *
   * Note: this adds one extra non-streaming LLM round-trip per actionable tool
   * call when enabled. The disabled path is unaffected.
   */
  securityMonitor?: { enabled: boolean };
  /**
   * Opt-in plan cache. When supplied, the multi-task planner reuses a cached
   * {@link TaskPlan} for an identical objective + tool set + model instead of
   * re-running the LLM planning loop. Omit to keep the original behavior.
   */
  planCache?: PlanCache;
  /**
   * Opt-in checkpoint store. When supplied together with {@link runId}, the
   * {@link ParallelTaskExecutor} resumes a re-run from the last completed task
   * and persists progress as tasks finish. Omit to keep the original behavior.
   */
  checkpointStore?: CheckpointStore;
  /** Run identifier the checkpoint is keyed by. Required for checkpointing. */
  runId?: string;
  /**
   * Opt-in plan approval gate. When supplied (or found on the
   * ProcessingContext under {@link PLAN_APPROVAL_CONTEXT_KEY}), the agent
   * pauses after planning and presents the plan for approval. A rejection
   * with feedback triggers a bounded replan; a plain rejection aborts the
   * run with a rejection notice as the result. Omit to keep the original
   * plan-then-execute behavior.
   */
  requestPlanApproval?: RequestPlanApproval;
}

/** Maximum replan rounds a rejection-with-feedback can trigger. */
const MAX_PLAN_REVISIONS = 3;

export class Agent {
  readonly name: string;
  readonly objective: string;
  readonly provider: BaseProvider;
  readonly model: string;
  readonly tools: Tool[];
  readonly inputs: Record<string, unknown>;
  readonly systemPrompt: string;
  results: unknown = null;
  task: Task | null = null;
  /**
   * External cancellation for this run, set by {@link execute}. Threaded into
   * every planner and executor so a Stop reaches the provider call underneath
   * instead of only being noticed at the next yield.
   */
  private signal?: AbortSignal;

  private readonly description: string;
  private readonly planningModel: string;
  private readonly reasoningModel: string;
  /** The one execution policy every mode obeys (bounds, budgets, fan-out). */
  private readonly policy: AgentPolicy;
  private readonly outputSchema?: Record<string, unknown>;
  private readonly outputFormat: AgentOutputFormat;
  private readonly workspace?: string;
  private readonly requestedSkills?: string[];
  private readonly skillDirs: string[];
  private readonly sandboxPackages: string[];
  private readonly initialTask?: Task;
  private readonly longTermMemory: LongTermMemory | null;
  private readonly autoPersistMemory: boolean;
  private readonly synthesizeRecall: boolean;
  private readonly useGraphPlanner: boolean;
  private readonly graphSource?: AgentGraphSource;
  private readonly supervise: boolean;
  private readonly supervisorBounds?: SupervisorBounds;
  private readonly maxSupervisorCostUsd?: number;
  private readonly registry?: NodeRegistry;
  private readonly providers?: Record<string, BaseProvider>;
  private readonly securityMonitorEnabled: boolean;
  private readonly planCache?: PlanCache;
  private readonly checkpointStore?: CheckpointStore;
  private readonly runId?: string;
  private readonly requestPlanApproval?: RequestPlanApproval;
  /** The multi-task plan, set after planning. */
  taskPlan: TaskPlan | null = null;

  constructor(opts: AgentOptions) {
    this.name = opts.name;
    this.objective = opts.objective;
    this.provider = opts.provider;
    this.model = opts.model;
    this.tools = opts.tools ?? [];
    this.inputs = opts.inputs ?? {};
    this.systemPrompt = opts.systemPrompt ?? "";
    this.description = opts.description ?? "";
    this.planningModel = opts.planningModel ?? opts.model;
    this.reasoningModel = opts.reasoningModel ?? opts.model;
    this.policy = resolveAgentPolicy({
      maxSteps: opts.maxSteps,
      maxStepIterations: opts.maxStepIterations,
      maxTokens: opts.maxTokens
    });
    this.outputFormat = opts.outputFormat ?? "structured";
    // Non-structured formats imply a string result; outputSchema is ignored.
    this.outputSchema =
      this.outputFormat === "structured" ? opts.outputSchema : undefined;
    this.workspace = opts.workspace;
    this.requestedSkills = opts.skills;
    this.skillDirs = opts.skillDirs ?? [];
    this.sandboxPackages = sessionAllowedPackages(opts.sandboxPackages);
    this.initialTask = opts.task;
    this.longTermMemory = opts.longTermMemory ?? null;
    this.autoPersistMemory = opts.autoPersistMemory === true;
    this.synthesizeRecall = opts.synthesizeRecall ?? true;
    this.useGraphPlanner = opts.useGraphPlanner === true;
    this.graphSource = opts.graph;
    this.supervise = opts.supervise === true;
    this.supervisorBounds = opts.supervisorBounds;
    this.maxSupervisorCostUsd = opts.maxSupervisorCostUsd;
    this.registry = opts.registry;
    this.providers = opts.providers;
    this.securityMonitorEnabled = opts.securityMonitor?.enabled === true;
    this.planCache = opts.planCache;
    this.checkpointStore = opts.checkpointStore;
    this.runId = opts.runId;
    this.requestPlanApproval = opts.requestPlanApproval;
    if (opts.task) {
      this.task = opts.task;
    }
  }

  /**
   * Build the tool array handed to the executors. When the security monitor is
   * enabled, the tools are wrapped in a permission gate configured as a pure
   * monitor pass (mode "auto" + always-allow approval), so the only added
   * behavior is the LLM-judge consult before each actionable call. When
   * disabled, the raw tool array is returned unchanged — existing runs are
   * byte-for-byte identical.
   */
  private buildExecutorTools(): Tool[] {
    if (!this.securityMonitorEnabled) return [...this.tools];
    const monitor = new SecurityMonitor({
      provider: this.provider,
      model: this.reasoningModel ?? this.model
    });
    return gateTools(this.tools, {
      mode: "auto",
      sessionAllow: new Set<string>(),
      requestApproval: async () => "allow",
      securityMonitor: createSecurityMonitorConsult(monitor),
      // The judge clears SOFT blocks only when it can see what the user
      // actually asked for. At the Agent level the objective (plus any caller
      // system prompt) is that intent signal — without it every SOFT block is
      // permanently unclearable and the injection/scope-creep reasoning is blind.
      recentTranscript: () => {
        const parts: string[] = [];
        if (this.systemPrompt) parts.push(this.systemPrompt);
        parts.push(`User: ${this.objective}`);
        return parts.join("\n\n");
      }
    });
  }

  /**
   * @deprecated Filesystem skill dirs are no longer used. DB is the source of
   * truth. Kept to avoid breaking callers that pass `skillDirs`.
   */
  private resolveSkillDirs(): string[] {
    return [];
  }

  /**
   * Discover all valid skills for the current user from the database.
   * Database failures propagate so agent startup does not silently omit skills.
   */
  private async discoverSkills(
    context: ProcessingContext
  ): Promise<Map<string, AgentSkill>> {
    const discovered = new Map<string, AgentSkill>();
    const skills = await loadSkillsFromDatabase(context.userId);
    for (const skill of skills) {
      if (!discovered.has(skill.name)) {
        discovered.set(skill.name, skill);
      }
    }
    return discovered;
  }

  /**
   * Resolve active skills: explicit names first, then auto-match by objective words.
   */
  private resolveActiveSkills(
    available: Map<string, AgentSkill>,
    requested: string[] | undefined
  ): AgentSkill[] {
    // Explicit names are supplied by the agent options. Environment variables
    // are intentionally not consulted by the database-backed skill system.
    const explicitNames = dedupePreserveOrder([...(requested ?? [])]);

    if (explicitNames.length > 0) {
      const active: AgentSkill[] = [];
      for (const name of explicitNames) {
        const skill = available.get(name);
        if (skill) active.push(skill);
      }
      return active;
    }

    // Match objective words against skill description words
    const objectiveWords = new Set(
      (this.objective.toLowerCase().match(SKILL_WORD_RE) ?? []).filter(
        (w) => w.length >= 4
      )
    );

    const active: AgentSkill[] = [];
    for (const skill of available.values()) {
      const descWords = new Set(
        (skill.description.toLowerCase().match(SKILL_WORD_RE) ?? []).filter(
          (w) => w.length >= 4
        )
      );
      for (const w of descWords) {
        if (objectiveWords.has(w)) {
          active.push(skill);
          break;
        }
      }
    }
    return active;
  }

  /**
   * Build system prompt segment from active skills.
   */
  private buildSkillSystemPrompt(skills: AgentSkill[]): string | null {
    if (skills.length === 0) return null;
    const sections = [
      "# Agent Skills",
      "Use these Skill instructions when relevant to the objective:"
    ];
    for (const skill of skills) {
      sections.push(`\n## ${skill.name}\n${skill.instructions}`);
    }
    return sections.join("\n");
  }

  /**
   * Build effective objective enriched with skill summaries.
   */
  private buildEffectiveObjective(skills: AgentSkill[]): string {
    if (skills.length === 0) return this.objective;
    const summaries = skills
      .map((s) => `- ${s.name}: ${s.description}`)
      .join("\n");
    return `${this.objective}\n\nRelevant Skills:\n${summaries}`;
  }

  /**
   * Merge user system prompt, skills and recalled long-term memory.
   */
  private mergeSystemPrompt(
    skillPrompt: string | null,
    memoryPrompt: string | null = null
  ): string | undefined {
    const parts: string[] = [];
    if (this.systemPrompt) parts.push(this.systemPrompt);
    if (skillPrompt) parts.push(skillPrompt);
    if (memoryPrompt) parts.push(memoryPrompt);
    const formatDirective = outputFormatDirective(this.outputFormat);
    if (formatDirective) parts.push(formatDirective);
    if (parts.length === 0) return undefined;
    return parts.join("\n\n");
  }

  async *execute(
    context: ProcessingContext,
    opts?: { signal?: AbortSignal }
  ): AsyncGenerator<ProcessingMessage> {
    this.signal = opts?.signal ?? this.signal;
    yield* withAgentSpanGen(
      "execute",
      {
        objective: this.objective,
        provider: this.provider.provider,
        model: this.model,
        toolsCount: this.tools.length,
        extra: { "agent.name": this.name }
      },
      () => this._executeImpl(context)
    );
  }

  private async *_executeImpl(
    context: ProcessingContext
  ): AsyncGenerator<ProcessingMessage> {
    log.info("Agent started", {
      name: this.name,
      objective: this.objective.slice(0, 80)
    });

    const availableSkills = await this.discoverSkills(context);
    // A trusted pack the session allows contributes its SKILL.md like any other
    // skill. An untrusted pack contributes nothing here — its body reaches the
    // model only through `get_sandbox_package_docs`, wrapped as untrusted.
    for (const skill of sandboxPackageSkills(
      this.sandboxPackages,
      context.sandboxModuleCatalog
    )) {
      if (!availableSkills.has(skill.name))
        availableSkills.set(skill.name, skill);
    }
    const activeSkills = this.resolveActiveSkills(
      availableSkills,
      this.requestedSkills
    );
    const skillSystemPrompt = this.buildSkillSystemPrompt(activeSkills);
    const effectiveObjective = this.buildEffectiveObjective(activeSkills);

    // Recall long-term memory and fold it into the system prompt so the
    // planner and every step share the same background context. Best-effort:
    // if the LTM backend is misconfigured we just continue without it.
    let memoryPrompt: string | null = null;
    if (this.longTermMemory && this.longTermMemory.isReady()) {
      try {
        let block: string;
        if (this.synthesizeRecall && this.longTermMemory.synthesisEnabled) {
          const { items, facts } = await this.longTermMemory.recallSynthesized(
            this.objective
          );
          block = formatMemoryForPrompt(items, facts);
        } else {
          const recalled = await this.longTermMemory.recall(this.objective);
          block = formatMemoryForPrompt(recalled);
        }
        if (block) memoryPrompt = block;
      } catch (err) {
        log.warn("Long-term memory recall failed", {
          name: this.name,
          error: err instanceof Error ? err.message : String(err)
        });
      }
    }
    const mergedSystemPrompt = this.mergeSystemPrompt(
      skillSystemPrompt,
      memoryPrompt
    );

    const workspacePath =
      this.workspace ??
      path.join(os.homedir(), "nodetool_workspace", Date.now().toString());
    await fs.mkdir(workspacePath, { recursive: true });

    // A supplied graph is already the plan: no planner runs, and the agent's
    // job is to supervise the run rather than author it.
    if (this.graphSource) {
      yield* this.executeSuppliedGraph(context, mergedSystemPrompt);
      return;
    }

    if (this.initialTask) {
      yield* this.executeSingleTask(
        context,
        this.initialTask,
        mergedSystemPrompt
      );
      return;
    }

    if (this.useGraphPlanner && this.registry) {
      yield* this.executeGraphPlan(context, mergedSystemPrompt);
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
      reasoningModel: this.reasoningModel,
      tools: this.tools,
      systemPrompt: mergedSystemPrompt,
      outputSchema: this.outputSchema,
      inputs: this.inputs,
      planCache: this.planCache,
      signal: this.signal
    });

    const planGen = planner.planMultiTask(effectiveObjective, context);
    let planResult = await planGen.next();
    while (!planResult.done) {
      yield planResult.value;
      planResult = await planGen.next();
    }
    let taskPlan = planResult.value;

    if (!taskPlan) {
      log.error("Agent failed", {
        name: this.name,
        error: "TaskPlanner failed to create a multi-task plan."
      });
      throw new Error("TaskPlanner failed to create a task plan.");
    }

    // Plan approval gate: when a host wired in a callback (option or context
    // variable), pause here and present the plan. Rejection with feedback
    // replans; plain rejection ends the run with a rejection notice.
    const requestApproval = this.resolveApprovalCallback(context);
    if (isFunction(requestApproval)) {
      const approved = yield* this.awaitPlanApproval(
        requestApproval,
        taskPlan,
        planner,
        context,
        effectiveObjective
      );
      if (!approved) {
        log.info("Plan rejected by user — execution aborted", {
          name: this.name
        });
        return;
      }
      taskPlan = approved;
    }

    this.taskPlan = taskPlan;

    // Set the first task as `this.task` for backward compatibility
    if (taskPlan.tasks.length > 0) {
      this.task = taskPlan.tasks[0];
    }

    log.info("Planning complete", {
      name: this.name,
      tasks: taskPlan.tasks.length,
      totalSteps: taskPlan.tasks.reduce((sum, t) => sum + t.steps.length, 0)
    });

    // The CompilerAgent below owns the agent's output schema. The planner is
    // told NOT to create an aggregation step, so we no longer graft the
    // schema onto a plan-step's finish_step.

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
      tools: this.buildExecutorTools(),
      taskPlan,
      systemPrompt: mergedSystemPrompt,
      inputs: this.inputs,
      maxSteps: this.policy.maxSteps,
      maxStepIterations: this.policy.maxStepIterations,
      maxConcurrentAgents: this.policy.maxConcurrentAgents,
      maxTokens: this.policy.maxTokens,
      checkpointStore: this.checkpointStore,
      runId: this.runId,
      planTools: this.tools.map((t) => t.name),
      signal: this.signal,
      sandboxPackages: this.sandboxPackages
    });

    for await (const item of executor.execute()) {
      yield item;
    }

    // A plan whose tasks all failed has nothing to synthesize. Running the
    // compiler over an empty (or error-only) memory produces a fluent
    // deliverable assembled from nothing — a failed run that reads as a
    // successful one. Fail loudly instead.
    const failedTaskIds = executor.getFailedTaskIds();
    const succeeded = taskPlan.tasks.filter((t) => t.completed).length;
    if (failedTaskIds.length > 0 && succeeded === 0) {
      throw new Error(
        `All ${taskPlan.tasks.length} task(s) failed: ${failedTaskIds.join(", ")}`
      );
    }
    if (failedTaskIds.length > 0) {
      // Partial results are still worth compiling, but the deliverable must not
      // pretend the plan ran whole — say what is missing, in the stream and in
      // the compiler's own prompt.
      yield {
        type: "log_update",
        node_id: "agent_executor",
        node_name: this.name,
        content: `${failedTaskIds.length} of ${taskPlan.tasks.length} task(s) failed: ${failedTaskIds.join(", ")}. Compiling from partial results.`,
        severity: "error"
      } satisfies LogUpdate;
    }

    // Final synthesis: a dedicated CompilerAgent reads the gathered memory
    // and produces the deliverable. With outputSchema → schema-conformant
    // structured result. Without → prose response shaped by `outputFormat`.
    const compiler = new CompilerAgent({
      objective: this.objective,
      outputSchema: this.outputSchema,
      formatDirective: outputFormatDirective(this.outputFormat) ?? undefined,
      provider: this.provider,
      model: this.reasoningModel ?? this.model,
      context,
      taskPlan,
      failedTaskIds,
      systemPrompt: mergedSystemPrompt,
      maxTokens: this.policy.maxTokens,
      signal: this.signal
    });

    let compiled: unknown = null;
    const compileGen = compiler.compile();
    let next = await compileGen.next();
    while (!next.done) {
      yield next.value;
      next = await compileGen.next();
    }
    compiled = next.value;

    if (compiled !== null && compiled !== undefined) {
      // Only shoe-horn a plain-string compiler result into { markdown } when the
      // schema is object-typed (prose that must be wrapped to satisfy an object
      // shape). A string-typed outputSchema legitimately yields a string via
      // finish_step; wrapping it would violate the caller's declared schema.
      const wrapAsMarkdown =
        this.outputFormat === "structured" &&
        this.outputSchema?.type === "object" &&
        isString(compiled);
      this.results = wrapAsMarkdown ? { markdown: compiled } : compiled;
    } else {
      // Compiler timed out — fall back to the executor's last task result so
      // the caller still gets something rather than null.
      this.results = executor.getFinalResult();
    }

    log.info("Agent completed", { name: this.name });
    this.persistAgentRunMemory();
  }

  /**
   * The approval callback for this run, from the constructor option or the
   * ProcessingContext variable. Every planning mode reads it through here —
   * approval is a property of the run, not of the mode that happened to plan
   * it, and the graph branch used to skip the gate entirely.
   */
  private resolveApprovalCallback(
    context: ProcessingContext
  ): RequestPlanApproval | undefined {
    const callback =
      this.requestPlanApproval ??
      context.get<RequestPlanApproval>(PLAN_APPROVAL_CONTEXT_KEY);
    return isFunction(callback) ? callback : undefined;
  }

  /**
   * Present a non-TaskPlan artifact (a planned graph) for approval using the
   * same gate the multi-task path uses. The artifact is rendered as a one-task
   * plan so the existing approval surfaces — websocket message, chat card —
   * can show it without a second protocol.
   *
   * Unlike the TaskPlan gate this does not replan on feedback: the graph
   * planner has its own revision loop and no feedback entry point here. Any
   * rejection ends the run.
   */
  private async *awaitArtifactApproval(
    requestApproval: RequestPlanApproval,
    plan: TaskPlan
  ): AsyncGenerator<ProcessingMessage, boolean> {
    yield {
      type: "planning_update",
      node_id: "agent_planner",
      phase: "awaiting_approval",
      status: "Running",
      content: `Waiting for approval: ${plan.title}`
    } satisfies PlanningUpdate;

    let decision: PlanApprovalDecision;
    try {
      decision = await requestApproval(structuredClone(plan));
    } catch (err) {
      log.warn("Plan approval request failed — treating as rejection", {
        name: this.name,
        error: err instanceof Error ? err.message : String(err)
      });
      decision = { decision: "reject" };
    }

    if (decision.decision === "approve") {
      yield {
        type: "planning_update",
        node_id: "agent_planner",
        phase: "awaiting_approval",
        status: "Success",
        content: `Plan approved: ${plan.title}`
      } satisfies PlanningUpdate;
      return true;
    }

    const feedback = decision.feedback?.trim() ?? "";
    yield {
      type: "planning_update",
      node_id: "agent_planner",
      phase: "awaiting_approval",
      status: "Failed",
      content: "Plan rejected by user."
    } satisfies PlanningUpdate;
    this.results = feedback
      ? `Plan rejected by user. Feedback: ${feedback}`
      : "Plan rejected by user.";
    return false;
  }

  /**
   * Present a plan for user approval, replanning on rejection-with-feedback
   * (bounded by {@link MAX_PLAN_REVISIONS}). Returns the approved plan, or
   * null when the user rejected it — in that case `this.results` carries a
   * rejection notice and the caller must end the run.
   */
  private async *awaitPlanApproval(
    requestApproval: RequestPlanApproval,
    initialPlan: TaskPlan,
    planner: TaskPlanner,
    context: ProcessingContext,
    objective: string
  ): AsyncGenerator<ProcessingMessage, TaskPlan | null> {
    let plan = initialPlan;
    for (let revision = 0; ; revision++) {
      yield {
        type: "planning_update",
        node_id: "agent_planner",
        phase: "awaiting_approval",
        status: "Running",
        content: `Waiting for approval: ${plan.title} (${plan.tasks.length} tasks)`
      } satisfies PlanningUpdate;

      let decision: PlanApprovalDecision;
      try {
        decision = await requestApproval(structuredClone(plan));
      } catch (err) {
        log.warn("Plan approval request failed — treating as rejection", {
          name: this.name,
          error: err instanceof Error ? err.message : String(err)
        });
        decision = { decision: "reject" };
      }

      if (decision.decision === "approve") {
        yield {
          type: "planning_update",
          node_id: "agent_planner",
          phase: "awaiting_approval",
          status: "Success",
          content: `Plan approved: ${plan.title}`
        } satisfies PlanningUpdate;
        return plan;
      }

      const feedback = decision.feedback?.trim() ?? "";
      if (!feedback || revision >= MAX_PLAN_REVISIONS) {
        yield {
          type: "planning_update",
          node_id: "agent_planner",
          phase: "awaiting_approval",
          status: "Failed",
          content: feedback
            ? `Plan rejected after ${revision} revision(s).`
            : "Plan rejected by user."
        } satisfies PlanningUpdate;
        this.results = feedback
          ? `Plan rejected by user. Feedback: ${feedback}`
          : "Plan rejected by user.";
        return null;
      }

      yield {
        type: "planning_update",
        node_id: "agent_planner",
        phase: "revision",
        status: "Running",
        content: `Revising plan with feedback: ${feedback.slice(0, 200)}`
      } satisfies PlanningUpdate;

      const revisedObjective = [
        objective,
        "",
        `A previous plan titled "${plan.title}" was rejected by the user.`,
        `User feedback: ${feedback}`,
        "Create a revised plan that addresses this feedback."
      ].join("\n");

      const planGen = planner.planMultiTask(revisedObjective, context);
      let next = await planGen.next();
      while (!next.done) {
        yield next.value;
        next = await planGen.next();
      }
      if (!next.value) {
        yield {
          type: "planning_update",
          node_id: "agent_planner",
          phase: "awaiting_approval",
          status: "Failed",
          content: "Replanning after feedback failed."
        } satisfies PlanningUpdate;
        throw new Error("TaskPlanner failed to create a revised plan.");
      }
      plan = next.value;
    }
  }

  /**
   * Graph-native plan: author a DAG of nodes with {@link authorGraph}, then
   * execute it with executeAgentGraph.
   */
  private async *executeGraphPlan(
    context: ProcessingContext,
    systemPrompt: string | undefined
  ): AsyncGenerator<ProcessingMessage> {
    log.info("Graph planning phase started", { name: this.name });

    yield {
      type: "log_update",
      node_id: "graph_planner",
      node_name: this.name,
      content: `Building workflow graph for: ${this.objective.slice(0, 100)}...`,
      severity: "info"
    } satisfies LogUpdate;

    const graphData = yield* authorGraph(this.objective, {
      context,
      provider: this.provider,
      model: this.planningModel,
      registry: this.registry!,
      tools: this.tools,
      systemPrompt,
      outputSchema: this.outputSchema,
      inputs: this.inputs,
      providers: this.providers,
      signal: this.signal
    });

    if (!graphData) {
      throw new Error("Failed to author a workflow graph.");
    }

    log.info("Graph planning complete", {
      name: this.name,
      nodes: graphData.nodes.length,
      edges: graphData.edges.length
    });

    const requestApproval = this.resolveApprovalCallback(context);
    if (requestApproval) {
      const approved = yield* this.awaitArtifactApproval(requestApproval, {
        title: `Workflow graph for: ${this.objective.slice(0, 80)}`,
        tasks: [
          {
            id: "graph",
            title: `Run workflow (${graphData.nodes.length} nodes, ${graphData.edges.length} edges)`,
            steps: graphData.nodes.map((node) => ({
              id: node.id,
              instructions: node.type,
              completed: false,
              dependsOn: [],
              logs: []
            }))
          }
        ]
      });
      if (!approved) {
        log.info("Graph rejected by user — execution aborted", {
          name: this.name
        });
        return;
      }
    }

    yield {
      type: "log_update",
      node_id: "graph_executor",
      node_name: this.name,
      content: `Executing workflow: ${graphData.nodes.length} nodes, ${graphData.edges.length} edges...`,
      severity: "info"
    } satisfies LogUpdate;

    const run = executeAgentGraph(graphData, {
      provider: this.provider,
      model: this.model,
      registry: this.registry!,
      tools: this.buildExecutorTools(),
      context,
      systemPrompt,
      maxStepIterations: this.policy.maxStepIterations,
      maxTokens: this.policy.maxTokens,
      inputs: this.inputs,
      signal: this.signal
    });

    for await (const item of run) {
      if (item.type === "step_result") {
        const sr = item;
        if (sr.is_task_result) {
          this.results = sr.result;
        }
      }
      yield item;
    }
  }

  /**
   * Workflows as agents: run a supplied graph on the kernel with this agent as
   * the run's supervisor. No planning phase — the graph is the plan — so the
   * only judgment the model supplies is a verdict on a broken invocation.
   *
   * The run obeys the same {@link AgentPolicy} as every other mode: the policy's
   * turn and token bounds are stamped onto model-less Agent nodes exactly as
   * the graph-planner branch stamps them, and nothing here invents a second set
   * of numbers. Supervision's own ceilings (decisions, retries, dollars) are the
   * supervisor's, shared with every other surface that configures one.
   */
  private async *executeSuppliedGraph(
    context: ProcessingContext,
    systemPrompt: string | undefined
  ): AsyncGenerator<ProcessingMessage> {
    if (!this.registry) {
      throw new Error(
        "Agent({ graph }) requires a NodeRegistry to resolve node executors."
      );
    }

    const runPolicy: RunPolicy = {
      providerId: this.provider.provider,
      modelId: this.model,
      maxStepIterations: this.policy.maxStepIterations
    };
    if (systemPrompt) runPolicy.systemPrompt = systemPrompt;
    if (this.policy.maxTokens !== undefined) {
      runPolicy.maxTokens = this.policy.maxTokens;
    }
    const graph = applyRunPolicy(
      await resolveAgentGraph(this.graphSource!, context),
      runPolicy
    );

    yield {
      type: "log_update",
      node_id: "workflow_executor",
      node_name: this.name,
      content: `Running workflow: ${graph.nodes.length} nodes, ${graph.edges.length} edges${
        this.supervise ? " (supervised)" : ""
      }...`,
      severity: "info"
    } satisfies LogUpdate;

    const buildSupervisor = (): SupervisorAgent => {
      // The supervisor reads and writes the run's memory (`supervisor:` keys)
      // but must not push its own provider chatter into the run's message
      // stream, so it gets a listener-free copy.
      const options: SupervisorAgentOptions = {
        provider: this.provider,
        model: this.reasoningModel,
        context: context.copy({
          shareMemory: true,
          inheritMessageListeners: false
        })
      };
      if (this.maxSupervisorCostUsd !== undefined) {
        options.maxCostUsd = this.maxSupervisorCostUsd;
      }
      return new SupervisorAgent(options);
    };
    const supervisor = this.supervise
      ? new BoundedHandle(buildSupervisor(), this.supervisorBounds ?? {})
      : undefined;

    const runOptions: WorkflowAgentRunOptions = {
      graph,
      registry: this.registry,
      context,
      params: this.inputs
    };
    if (supervisor) runOptions.supervisor = supervisor;
    if (this.signal) runOptions.signal = this.signal;
    const run = runWorkflowAsAgent(runOptions);

    let next = await run.next();
    while (!next.done) {
      yield next.value;
      next = await run.next();
    }
    const result = next.value;

    if (result.status === "failed") {
      throw new Error(result.error ?? "Workflow run failed");
    }

    this.results = result.outputs ?? {};

    log.info("Agent completed", {
      name: this.name,
      status: result.status,
      interventions: result.interventions?.length ?? 0
    });
    this.persistAgentRunMemory();
  }

  /**
   * Execute a single pre-defined task (legacy path for backward compatibility).
   */
  private async *executeSingleTask(
    context: ProcessingContext,
    task: Task,
    systemPrompt: string | undefined
  ): AsyncGenerator<ProcessingMessage> {
    this.task = task;

    // Apply output schema to the last step if specified
    if (this.outputSchema && task.steps.length > 0) {
      task.steps[task.steps.length - 1].outputSchema = JSON.stringify(
        this.outputSchema
      );
    }

    log.info("Executing single task", { name: this.name, title: task.title });

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
      tools: this.buildExecutorTools(),
      task,
      systemPrompt,
      inputs: this.inputs,
      maxSteps: this.policy.maxSteps,
      maxStepIterations: this.policy.maxStepIterations,
      maxTokens: this.policy.maxTokens,
      maxConcurrentAgents: this.policy.maxConcurrentAgents,
      parallelExecution: true,
      signal: this.signal,
      sandboxPackages: this.sandboxPackages
    });

    for await (const item of executor.executeTasks()) {
      if (item.type === "step_result") {
        const stepResult = item;
        if (stepResult.is_task_result) {
          log.info("Setting final results", {
            objective: this.objective.slice(0, 50)
          });
          this.results = stepResult.result;
          yield {
            type: "task_update",
            event: TaskUpdateEvent.TaskCompleted,
            // `TaskRef`/`StepRef` are the open wire shapes of `Task`/`Step`;
            // a shallow copy of each is one, without asserting it is.
            task: { ...task, steps: task.steps.map((step) => ({ ...step })) }
          } satisfies TaskUpdate;
        }
      }
      yield item;
    }

    log.info("Agent completed", { name: this.name });
    this.persistAgentRunMemory();
  }

  /**
   * Mine the completed run for new long-term memories. Fire-and-forget so a
   * slow extraction call never blocks the caller, and any backend error is
   * swallowed (already logged inside the LTM module).
   */
  private persistAgentRunMemory(): void {
    if (!this.autoPersistMemory) return;
    if (!this.longTermMemory || !this.longTermMemory.isReady()) return;
    const resultText =
      this.results === null || this.results === undefined
        ? ""
        : isString(this.results)
          ? this.results
          : (() => {
              try {
                return JSON.stringify(this.results);
              } catch {
                return String(this.results);
              }
            })();
    if (!resultText.trim()) return;
    const synthetic: Message[] = [
      { role: "user", content: this.objective },
      { role: "assistant", content: resultText }
    ];
    void this.longTermMemory
      .rememberConversation(synthetic, { source: `agent:${this.name}` })
      .catch(() => {
        // already logged inside rememberConversation
      });
  }

  getResults(): unknown {
    return this.results;
  }
}
