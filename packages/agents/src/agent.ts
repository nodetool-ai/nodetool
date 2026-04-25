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
import { createLogger } from "@nodetool/config";
import type { BaseProvider } from "@nodetool/runtime";

const log = createLogger("nodetool.agents.agent");
import type { Message, ProcessingContext } from "@nodetool/runtime";
import type {
  ProcessingMessage,
  StepResult,
  LogUpdate,
  TaskUpdate,
  Chunk
} from "@nodetool/protocol";
import { TaskUpdateEvent } from "@nodetool/protocol";
import { BaseAgent } from "./base-agent.js";
import { TaskPlanner } from "./task-planner.js";
import { TaskExecutor } from "./task-executor.js";
import { ParallelTaskExecutor } from "./parallel-task-executor.js";
import type { Tool } from "./tools/base-tool.js";
import type { Task, TaskPlan } from "./types.js";
import { rejectAgenticProvider } from "./reject-agentic-provider.js";
import {
  type AgentOutputFormat,
  outputFormatDirective
} from "./output-format.js";

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
  maxTokenLimit?: number;
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
}

export class Agent extends BaseAgent {
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
  /** The multi-task plan, set after planning. */
  taskPlan: TaskPlan | null = null;

  constructor(opts: AgentOptions) {
    rejectAgenticProvider(opts.provider, "Agent");
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
    if (opts.task) {
      this.task = opts.task;
    }
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
   * Merge user system prompt with skill system prompt.
   */
  private mergeSystemPrompt(skillPrompt: string | null): string | undefined {
    const parts: string[] = [];
    if (this.systemPrompt) parts.push(this.systemPrompt);
    if (skillPrompt) parts.push(skillPrompt);
    const formatDirective = outputFormatDirective(this.outputFormat);
    if (formatDirective) parts.push(formatDirective);
    if (parts.length === 0) return undefined;
    return parts.join("\n\n");
  }

  async *execute(
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
    const mergedSystemPrompt = this.mergeSystemPrompt(skillSystemPrompt);

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
      inputs: this.inputs
    });

    const planGen = planner.planMultiTask(effectiveObjective, context);
    let planResult = await planGen.next();
    while (!planResult.done) {
      yield planResult.value;
      planResult = await planGen.next();
    }
    const taskPlan = planResult.value;

    if (!taskPlan) {
      log.error("Agent failed", {
        name: this.name,
        error: "TaskPlanner failed to create a multi-task plan."
      });
      throw new Error("TaskPlanner failed to create a task plan.");
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

    // Apply output schema to the last step of the last task if specified
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

    // Execute: run ParallelTaskExecutor over the planned tasks
    const executor = new ParallelTaskExecutor({
      provider: this.provider,
      model: this.model,
      context,
      tools: [...this.tools],
      taskPlan,
      systemPrompt: mergedSystemPrompt,
      inputs: this.inputs,
      maxStepIterations: this.maxStepIterations,
      maxTokenLimit: this.maxTokenLimit
    });

    for await (const item of executor.execute()) {
      if (item.type === "step_result") {
        const stepResult = item as StepResult;
        if (stepResult.is_task_result) {
          log.info("Captured task result", {
            objective: this.objective.slice(0, 50)
          });
          // Note: do NOT overwrite this.results here for multi-task plans —
          // only the last is_task_result would survive, losing all others.
        }
      }
      yield item;
    }

    // After execution, synthesize a final response so the user gets one
    // coherent, readable answer regardless of what the planner/executor
    // produced. Skip when there is a single task — its result (string or
    // structured) already represents the final answer for that objective.
    const allResults = executor.getAllResults();
    const taskCount = Object.keys(allResults).length;

    if (taskCount === 0) {
      this.results = executor.getFinalResult();
    } else if (taskCount === 1) {
      const singleResult = Object.values(allResults)[0];
      const isEmptyString =
        typeof singleResult === "string" && singleResult.trim().length === 0;
      if (singleResult == null || isEmptyString) {
        yield* this.synthesizeFinalResponse(context, allResults, taskPlan);
      } else if (
        this.outputFormat === "structured" &&
        this.outputSchema &&
        typeof singleResult === "string"
      ) {
        this.results = { markdown: singleResult };
      } else {
        this.results = singleResult;
      }
    } else {
      yield* this.synthesizeFinalResponse(context, allResults, taskPlan);
    }

    log.info("Agent completed", { name: this.name });
  }

  /**
   * Run a final LLM call that synthesizes all task results into one coherent
   * response for the user. Streams chunks as ProcessingMessage so the UI sees
   * the answer being composed in real time. Sets `this.results` to the
   * synthesized string (or wraps in the outputSchema shape).
   */
  private async *synthesizeFinalResponse(
    _context: ProcessingContext,
    allResults: Record<string, unknown>,
    taskPlan: TaskPlan
  ): AsyncGenerator<ProcessingMessage> {
    const titleById = new Map(taskPlan.tasks.map((t) => [t.id, t.title]));

    const sections: string[] = [];
    for (const [taskId, result] of Object.entries(allResults)) {
      const title = titleById.get(taskId) ?? taskId;
      const body =
        typeof result === "string"
          ? result
          : (() => {
              try {
                return JSON.stringify(result, null, 2);
              } catch {
                return String(result);
              }
            })();
      sections.push(`## ${title} (${taskId})\n${body}`);
    }

    const formatHint =
      this.outputFormat === "structured"
        ? "Respond in well-formatted markdown."
        : outputFormatDirective(this.outputFormat) ??
          "Respond in well-formatted markdown.";

    const systemPrompt =
      (this.systemPrompt ? this.systemPrompt + "\n\n" : "") +
      "You are finishing a multi-task job. Combine the results from every task below into a single coherent response for the user.\n\n" +
      "## Rules\n" +
      "- Preserve every concrete artifact (image URLs, file paths, tables, key facts) — never drop or paraphrase them away.\n" +
      "- Do not mention the task IDs or internal task structure to the user.\n" +
      "- Do not reveal chain-of-thought or internal deliberation.\n" +
      formatHint;

    const userPrompt = `Original request:\n${this.objective}\n\nTask results:\n${sections.join("\n\n")}\n\nProduce the final answer now.`;

    const messages: Message[] = [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt }
    ];

    log.info("Synthesizing final response", {
      taskCount: Object.keys(allResults).length
    });

    let content = "";
    try {
      for await (const item of this.provider.generateMessagesTraced({
        messages,
        model: this.model
      })) {
        if ("type" in item && item.type === "chunk") {
          const chunk = item as { content?: string };
          const text = chunk.content ?? "";
          if (!text) continue;
          content += text;
          yield {
            type: "chunk",
            node_id: "agent_synthesizer",
            content: text,
            done: false
          } satisfies Chunk;
        }
      }
    } catch (err) {
      log.warn("Synthesis LLM call failed, falling back to joined results", {
        error: err instanceof Error ? err.message : String(err)
      });
      content = sections.join("\n\n");
    }

    if (!content) {
      content = sections.join("\n\n");
    }

    this.results =
      this.outputFormat === "structured" && this.outputSchema
        ? { markdown: content }
        : content;
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
      tools: [...this.tools],
      task,
      systemPrompt,
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
  }

  getResults(): unknown {
    return this.results;
  }
}
