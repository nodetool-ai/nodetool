/**
 * Agent -- orchestrates AI-driven task execution using LLMs and Tools.
 *
 * Port of src/nodetool/agents/agent.py (simplified for TypeScript).
 *
 * The Agent class takes a complex objective, decomposes it into a step-by-step
 * plan using TaskPlanner, then executes that plan via TaskExecutor.
 * Supports loading skills from the filesystem.
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
  StepResult,
  LogUpdate,
  PlanningUpdate,
  TaskUpdate,
  Chunk
} from "@nodetool-ai/protocol";
import { TaskUpdateEvent } from "@nodetool-ai/protocol";
import { TaskPlanner } from "./task-planner.js";
import { TaskExecutor } from "./task-executor.js";
import { ParallelTaskExecutor } from "./parallel-task-executor.js";
import { CompilerAgent } from "./compiler-agent.js";
import { GraphPlanner } from "./graph-planner.js";
import { AgentWorkflowRunner } from "./agent-workflow-runner.js";
import type { Tool } from "./tools/base-tool.js";
import { gateTools } from "./tools/tool-permissions.js";
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
import type { NodeRegistry } from "@nodetool-ai/node-sdk";
import {
  type AgentOutputFormat,
  outputFormatDirective
} from "./output-format.js";
import {
  formatMemoryForPrompt,
  type LongTermMemory
} from "./long-term-memory.js";

// ---------------------------------------------------------------------------
// Skill types and helpers
// ---------------------------------------------------------------------------

export interface AgentSkill {
  name: string;
  description: string;
  instructions: string;
  path: string;
}

const INVALID_SKILL_NAME_RE = /[^a-z0-9-]/;
const XML_TAG_RE = /<[^>]+>/;
const SKILL_RESERVED_TERMS = ["anthropic", "claude"];
const SKILL_WORD_RE = /[a-z0-9]+/g;

/**
 * Parse minimal YAML frontmatter (key: value pairs).
 */
export function parseFrontmatter(frontmatter: string): Record<string, string> {
  const parsed: Record<string, string> = {};
  for (const rawLine of frontmatter.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const colonIdx = line.indexOf(":");
    if (colonIdx === -1) continue;
    const key = line.slice(0, colonIdx).trim();
    let value = line.slice(colonIdx + 1).trim();
    // Strip surrounding quotes
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    parsed[key] = value;
  }
  return parsed;
}

function isValidSkillName(name: string): boolean {
  if (!name || name.length > 64) return false;
  if (INVALID_SKILL_NAME_RE.test(name)) return false;
  const lowered = name.toLowerCase();
  return !SKILL_RESERVED_TERMS.some((term) => lowered.includes(term));
}

function isValidSkillDescription(description: string): boolean {
  if (!description || description.length > 1024) return false;
  return !XML_TAG_RE.test(description);
}

/**
 * Load a single skill from a SKILL.md file.
 * Returns null if the file is invalid or cannot be read.
 */
async function loadSkillFromFile(
  skillFile: string
): Promise<AgentSkill | null> {
  let content: string;
  try {
    content = await fs.readFile(skillFile, "utf-8");
  } catch {
    return null;
  }

  if (!content.startsWith("---")) return null;

  const parts = content.split("---", 3);
  if (parts.length < 3) return null;

  const metadata = parseFrontmatter(parts[1]);
  const name = (metadata["name"] ?? "").trim();
  const description = (metadata["description"] ?? "").trim();
  const instructions = parts[2].trim();

  if (!isValidSkillName(name)) return null;
  if (!isValidSkillDescription(description)) return null;
  if (!instructions) return null;

  return { name, description, instructions, path: skillFile };
}

/**
 * Recursively find all SKILL.md files under a directory.
 */
async function findSkillFiles(dir: string): Promise<string[]> {
  const results: string[] = [];
  let entries: import("node:fs").Dirent[];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return results;
  }
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...(await findSkillFiles(fullPath)));
    } else if (entry.name === "SKILL.md") {
      results.push(fullPath);
    }
  }
  return results;
}

/**
 * Load all valid skills from a directory (recursively searches for SKILL.md files).
 */
export async function loadSkillsFromDirectory(
  dir: string
): Promise<AgentSkill[]> {
  const skillFiles = await findSkillFiles(dir);
  const skills: AgentSkill[] = [];
  for (const file of skillFiles) {
    const skill = await loadSkillFromFile(file);
    if (skill) skills.push(skill);
  }
  return skills;
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
   * Optional long-term memory. When provided, items relevant to the agent's
   * objective are recalled before planning and folded into the system prompt
   * so the planner and every step inherit the same context.
   *
   * **Writes are opt-in.** Agent runs do NOT auto-mine the objective +
   * final result for memories by default — agent results are generated
   * output, not user-confirmed facts, and persisting them across sessions
   * pollutes the store with hallucinations or run-specific artefacts.
   * Agents can still publish memories explicitly via the `ltm_remember`
   * tool. To re-enable automatic mining for a specific agent, set
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
   * graph executed by {@link AgentWorkflowRunner}.
   */
  useGraphPlanner?: boolean;
  /** Node registry required when {@link useGraphPlanner} is true. */
  registry?: NodeRegistry;
  /**
   * Configured BaseProvider instances by id. When supplied, the GraphPlanner
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

  private readonly description: string;
  private readonly planningModel: string;
  private readonly reasoningModel: string;
  private readonly maxSteps: number;
  private readonly maxStepIterations: number;
  private readonly outputSchema?: Record<string, unknown>;
  private readonly outputFormat: AgentOutputFormat;
  private readonly workspace?: string;
  private readonly requestedSkills?: string[];
  private readonly skillDirs: string[];
  private readonly initialTask?: Task;
  private readonly longTermMemory: LongTermMemory | null;
  private readonly autoPersistMemory: boolean;
  private readonly synthesizeRecall: boolean;
  private readonly useGraphPlanner: boolean;
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
    this.maxSteps = opts.maxSteps ?? 10;
    this.maxStepIterations = opts.maxStepIterations ?? 15;
    this.outputFormat = opts.outputFormat ?? "structured";
    // Non-structured formats imply a string result; outputSchema is ignored.
    this.outputSchema =
      this.outputFormat === "structured" ? opts.outputSchema : undefined;
    this.workspace = opts.workspace;
    this.requestedSkills = opts.skills;
    this.skillDirs = opts.skillDirs ?? [];
    this.initialTask = opts.task;
    this.longTermMemory = opts.longTermMemory ?? null;
    this.autoPersistMemory = opts.autoPersistMemory === true;
    this.synthesizeRecall = opts.synthesizeRecall ?? true;
    this.useGraphPlanner = opts.useGraphPlanner === true;
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
   * Resolve skill directories from constructor args + environment + defaults.
   */
  private resolveSkillDirs(): string[] {
    const resolved: string[] = [];

    // Explicit dirs from constructor
    for (const d of this.skillDirs) {
      resolved.push(d.startsWith("~") ? d.replace("~", os.homedir()) : d);
    }

    // Environment variable
    const envDirs = process.env["NODETOOL_AGENT_SKILL_DIRS"];
    if (envDirs) {
      for (const d of envDirs.split(path.delimiter)) {
        const trimmed = d.trim();
        if (trimmed) {
          resolved.push(
            trimmed.startsWith("~")
              ? trimmed.replace("~", os.homedir())
              : trimmed
          );
        }
      }
    }

    // Default locations
    resolved.push(
      path.join(process.cwd(), ".claude", "skills"),
      path.join(os.homedir(), ".claude", "skills"),
      path.join(os.homedir(), ".codex", "skills")
    );

    return dedupePreserveOrder(resolved);
  }

  /**
   * Discover all valid skills from resolved directories.
   */
  private async discoverSkills(): Promise<Map<string, AgentSkill>> {
    const discovered = new Map<string, AgentSkill>();
    const dirs = this.resolveSkillDirs();

    for (const dir of dirs) {
      try {
        await fs.access(dir);
      } catch {
        continue; // directory doesn't exist
      }
      const skills = await loadSkillsFromDirectory(dir);
      for (const skill of skills) {
        if (!discovered.has(skill.name)) {
          discovered.set(skill.name, skill);
        }
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
    // Merge explicit names from constructor + environment
    const envRequested = process.env["NODETOOL_AGENT_SKILLS"] ?? "";
    const envNames = envRequested
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const explicitNames = dedupePreserveOrder([
      ...(requested ?? []),
      ...envNames
    ]);

    if (explicitNames.length > 0) {
      const active: AgentSkill[] = [];
      for (const name of explicitNames) {
        const skill = available.get(name);
        if (skill) active.push(skill);
      }
      return active;
    }

    // Auto-select: check if disabled
    const autoEnabled = !["0", "false", "no", "off"].includes(
      (process.env["NODETOOL_AGENT_AUTO_SKILLS"] ?? "1").toLowerCase()
    );
    if (!autoEnabled) return [];

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
    context: ProcessingContext
  ): AsyncGenerator<ProcessingMessage> {
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

    // Discover and resolve skills
    const availableSkills = await this.discoverSkills();
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
          const { items, facts } =
            await this.longTermMemory.recallSynthesized(this.objective);
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

    // Ensure workspace directory exists
    const workspacePath =
      this.workspace ??
      path.join(os.homedir(), "nodetool_workspace", Date.now().toString());
    await fs.mkdir(workspacePath, { recursive: true });

    // If a pre-defined task is given, fall back to single-task execution
    if (this.initialTask) {
      yield* this.executeSingleTask(
        context,
        this.initialTask,
        mergedSystemPrompt
      );
      return;
    }

    // Graph-native planner: build DAG of nodes directly.
    if (this.useGraphPlanner && this.registry) {
      yield* this.executeGraphPlan(context, mergedSystemPrompt);
      return;
    }

    // Plan: use TaskPlanner to decompose the objective into parallel tasks
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
      planCache: this.planCache
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
    const requestApproval =
      this.requestPlanApproval ??
      context.get<RequestPlanApproval>(PLAN_APPROVAL_CONTEXT_KEY);
    if (typeof requestApproval === "function") {
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

    // Execute: run ParallelTaskExecutor over the planned tasks
    const executor = new ParallelTaskExecutor({
      provider: this.provider,
      model: this.model,
      context,
      tools: this.buildExecutorTools(),
      taskPlan,
      systemPrompt: mergedSystemPrompt,
      inputs: this.inputs,
      maxStepIterations: this.maxStepIterations,
      checkpointStore: this.checkpointStore,
      runId: this.runId,
      planTools: this.tools.map((t) => t.name)
    });

    for await (const item of executor.execute()) {
      yield item;
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
      systemPrompt: mergedSystemPrompt
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
      this.results =
        this.outputFormat === "structured" &&
        this.outputSchema &&
        typeof compiled === "string"
          ? { markdown: compiled }
          : compiled;
    } else {
      // Compiler timed out — fall back to the executor's last task result so
      // the caller still gets something rather than null.
      this.results = executor.getFinalResult();
    }

    log.info("Agent completed", { name: this.name });
    this.persistAgentRunMemory();
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
   * Graph-native plan: build a DAG of nodes via GraphPlanner, then execute it
   * with AgentWorkflowRunner.
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

    const planner = new GraphPlanner({
      provider: this.provider,
      model: this.planningModel,
      registry: this.registry!,
      tools: this.tools,
      systemPrompt,
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
      tools: this.buildExecutorTools(),
      context,
      systemPrompt,
      maxStepIterations: this.maxStepIterations,
      inputs: this.inputs
    });

    for await (const item of runner.execute(graphData)) {
      if (item.type === "step_result") {
        const sr = item as StepResult;
        if (sr.is_task_result) {
          this.results = sr.result;
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
      maxSteps: this.maxSteps,
      maxStepIterations: this.maxStepIterations,
      parallelExecution: true
    });

    for await (const item of executor.executeTasks()) {
      if (item.type === "step_result") {
        const stepResult = item as StepResult;
        if (stepResult.is_task_result) {
          log.info("Setting final results", {
            objective: this.objective.slice(0, 50)
          });
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
        : typeof this.results === "string"
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
