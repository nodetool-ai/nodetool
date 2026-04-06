/**
 * Agent -- orchestrates AI-driven task execution using LLMs and Tools.
 *
 * Port of src/nodetool/agents/agent.py (simplified for TypeScript).
 *
 * The Agent class takes a complex objective, decomposes it into a step-by-step
 * plan using TaskPlanner, then executes that plan via TaskExecutor.
 * Supports loading skills from the filesystem via the provider skill system.
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { createLogger } from "@nodetool/config";
import type { BaseProvider } from "@nodetool/runtime";
import {
  discoverSkills,
  resolveActiveSkills
} from "@nodetool/runtime";
import type { ProviderSkill } from "@nodetool/runtime";

const log = createLogger("nodetool.agents.agent");
import type { ProcessingContext } from "@nodetool/runtime";
import type {
  ProcessingMessage,
  StepResult,
  LogUpdate,
  TaskUpdate
} from "@nodetool/protocol";
import { TaskUpdateEvent } from "@nodetool/protocol";
import { BaseAgent } from "./base-agent.js";
import { TaskPlanner } from "./task-planner.js";
import { TaskExecutor } from "./task-executor.js";
import type { Tool } from "./tools/base-tool.js";
import type { Task } from "./types.js";

/**
 * @deprecated Use `ProviderSkill` from `@nodetool/runtime` instead.
 * Kept for backwards compatibility.
 */
export interface AgentSkill extends ProviderSkill {
  path: string;
}

/**
 * @deprecated Use `parseFrontmatter` from `@nodetool/runtime` instead.
 */
export { parseFrontmatter } from "@nodetool/runtime";

/**
 * @deprecated Use `loadSkillsFromDirectory` from `@nodetool/runtime` instead.
 */
export { loadSkillsFromDirectory } from "@nodetool/runtime";

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
  private readonly workspace?: string;
  private readonly requestedSkills?: string[];
  private readonly skillDirs: string[];
  private readonly initialTask?: Task;

  constructor(opts: AgentOptions) {
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
    this.maxStepIterations = opts.maxStepIterations ?? 5;
    this.outputSchema = opts.outputSchema;
    this.workspace = opts.workspace;
    this.requestedSkills = opts.skills;
    this.skillDirs = opts.skillDirs ?? [];
    this.initialTask = opts.task;
    if (opts.task) {
      this.task = opts.task;
    }
  }

  /**
   * Build effective objective enriched with skill summaries.
   */
  private buildEffectiveObjective(skills: ProviderSkill[]): string {
    if (skills.length === 0) return this.objective;
    const summaries = skills
      .map((s) => `- ${s.name}: ${s.description}`)
      .join("\n");
    return `${this.objective}\n\nRelevant Skills:\n${summaries}`;
  }

  async *execute(
    context: ProcessingContext
  ): AsyncGenerator<ProcessingMessage> {
    log.info("Agent started", {
      name: this.name,
      objective: this.objective.slice(0, 80)
    });

    // Discover and resolve skills, then set them on the provider.
    // The provider automatically injects skills into the system prompt
    // for every LLM call (via generateMessageTraced / generateMessagesTraced).
    const availableSkills = await discoverSkills(this.skillDirs);
    const activeSkills = resolveActiveSkills(
      availableSkills,
      this.objective,
      this.requestedSkills
    );
    this.provider.setSkills(activeSkills);

    const effectiveObjective = this.buildEffectiveObjective(activeSkills);

    // Ensure workspace directory exists
    const workspacePath =
      this.workspace ??
      path.join(os.homedir(), "nodetool_workspace", Date.now().toString());
    await fs.mkdir(workspacePath, { recursive: true });

    // Plan: use TaskPlanner to decompose the objective, or use pre-defined task
    let task: Task | null = this.initialTask ?? null;

    if (!task) {
      log.info("Planning phase started", { name: this.name });
      yield {
        type: "log_update",
        node_id: "agent_planner",
        node_name: this.name,
        content: `Planning steps for objective: ${this.objective.slice(0, 100)}...`,
        severity: "info"
      } satisfies LogUpdate;

      const planner = new TaskPlanner({
        provider: this.provider,
        model: this.planningModel,
        reasoningModel: this.reasoningModel,
        tools: this.tools,
        systemPrompt: this.systemPrompt,
        outputSchema: this.outputSchema,
        inputs: this.inputs
      });

      const planGen = planner.plan(effectiveObjective, context);
      let planResult = await planGen.next();
      while (!planResult.done) {
        yield planResult.value;
        planResult = await planGen.next();
      }
      task = planResult.value;
    }

    if (!task) {
      log.error("Agent failed", {
        name: this.name,
        error: "TaskPlanner failed to create a task plan."
      });
      throw new Error("TaskPlanner failed to create a task plan.");
    }

    log.info("Planning complete", {
      name: this.name,
      steps: task.steps.length
    });
    this.task = task;

    if (!this.initialTask) {
      yield {
        type: "task_update",
        event: TaskUpdateEvent.TaskCreated,
        task: task as unknown as TaskUpdate["task"]
      } satisfies TaskUpdate;
    }

    // Apply output schema to the last step if specified
    if (this.outputSchema && task.steps.length > 0) {
      task.steps[task.steps.length - 1].outputSchema = JSON.stringify(
        this.outputSchema
      );
    }

    log.info("Executing task", { name: this.name, title: task.title });

    yield {
      type: "log_update",
      node_id: "agent_executor",
      node_name: this.name,
      content: `Starting execution of ${task.steps.length} steps...`,
      severity: "info"
    } satisfies LogUpdate;

    // Execute: run TaskExecutor over the planned steps
    const executor = new TaskExecutor({
      provider: this.provider,
      model: this.model,
      context,
      tools: [...this.tools],
      task,
      systemPrompt: this.systemPrompt,
      inputs: this.inputs,
      maxSteps: this.maxSteps,
      maxStepIterations: this.maxStepIterations,
      maxTokenLimit: this.maxTokenLimit
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
