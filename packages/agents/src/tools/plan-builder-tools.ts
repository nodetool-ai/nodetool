/**
 * Incremental plan construction tools shared via a PlanBuilder state object.
 *
 * The LLM calls add_task repeatedly, optionally remove_task to correct a
 * mistake, and finally finish_plan to commit. Each add_task validates the
 * task in isolation and against previously added tasks so failures are
 * caught at the moment they're introduced, pointing to one task rather
 * than the whole plan.
 */

import type { ProcessingContext } from "@nodetool-ai/runtime";
import { Tool } from "./base-tool.js";
import type { Step, Task, TaskPlan } from "../types.js";
import { randomUUID } from "node:crypto";

// ---------------------------------------------------------------------------
// Shared state
// ---------------------------------------------------------------------------

export class PlanBuilder {
  private readonly tasks: Task[] = [];
  private readonly inputKeys: Set<string>;
  private committedPlan: TaskPlan | null = null;

  constructor(inputs?: Record<string, unknown>) {
    this.inputKeys = new Set(Object.keys(inputs ?? {}));
  }

  get currentTasks(): readonly Task[] {
    return this.tasks;
  }

  get taskCount(): number {
    return this.tasks.length;
  }

  get plan(): TaskPlan | null {
    return this.committedPlan;
  }

  hasTask(id: string): boolean {
    return this.tasks.some((t) => t.id === id);
  }

  private allStepIds(): Set<string> {
    const ids = new Set<string>();
    for (const t of this.tasks) {
      for (const s of t.steps) ids.add(s.id);
    }
    return ids;
  }

  addTask(
    params: Record<string, unknown>
  ): { ok: true; task: Task } | { ok: false; errors: string[] } {
    const task = this.buildTask(params);
    const errors = this.validateNewTask(task);
    if (errors.length > 0) return { ok: false, errors };

    applySchemaOverrides(task.steps);
    this.tasks.push(task);
    return { ok: true, task };
  }

  removeTask(id: string): { ok: boolean; error?: string } {
    const idx = this.tasks.findIndex((t) => t.id === id);
    if (idx === -1) {
      return { ok: false, error: `Task '${id}' is not in the plan.` };
    }
    this.tasks.splice(idx, 1);
    return { ok: true };
  }

  finish(
    title: string
  ): { ok: true; plan: TaskPlan } | { ok: false; errors: string[] } {
    const errors = this.validateFullPlan();
    if (errors.length > 0) return { ok: false, errors };

    this.committedPlan = { title, tasks: [...this.tasks] };
    return { ok: true, plan: this.committedPlan };
  }

  private buildTask(data: Record<string, unknown>): Task {
    const taskId =
      typeof data["id"] === "string" && data["id"].length > 0
        ? (data["id"] as string)
        : randomUUID();
    const taskTitle =
      typeof data["title"] === "string" ? (data["title"] as string) : "Untitled Task";
    const taskDependsOn = Array.isArray(data["depends_on"])
      ? (data["depends_on"] as string[])
      : Array.isArray(data["dependsOn"])
        ? (data["dependsOn"] as string[])
        : [];

    const rawSteps = Array.isArray(data["steps"]) ? data["steps"] : [];
    const steps: Step[] = rawSteps.map((s: unknown) => {
      const raw = s as Record<string, unknown>;
      return {
        id: typeof raw["id"] === "string" ? raw["id"] : randomUUID(),
        instructions:
          typeof raw["instructions"] === "string" ? raw["instructions"] : "",
        completed: false,
        dependsOn: Array.isArray(raw["depends_on"])
          ? (raw["depends_on"] as string[])
          : Array.isArray(raw["dependsOn"])
            ? (raw["dependsOn"] as string[])
            : [],
        outputSchema:
          typeof raw["output_schema"] === "string"
            ? raw["output_schema"]
            : typeof raw["outputSchema"] === "string"
              ? raw["outputSchema"]
              : undefined,
        tools: Array.isArray(raw["tools"])
          ? (raw["tools"] as string[])
          : undefined,
        logs: []
      };
    });

    return {
      id: taskId,
      title: taskTitle,
      dependsOn: taskDependsOn,
      completed: false,
      steps
    };
  }

  private validateNewTask(task: Task): string[] {
    const errors: string[] = [];

    if (this.hasTask(task.id)) {
      errors.push(
        `Task ID '${task.id}' was already added. Use a different ID or call remove_task first.`
      );
    }

    if (task.steps.length === 0) {
      errors.push(`Task '${task.id}' must contain at least one step.`);
    }

    const stepIds = new Set(task.steps.map((s) => s.id));
    const seenStepIds = new Set<string>();
    for (const step of task.steps) {
      if (seenStepIds.has(step.id)) {
        errors.push(
          `Task '${task.id}': duplicate step ID '${step.id}' within this task.`
        );
      }
      seenStepIds.add(step.id);
    }

    const globalStepIds = this.allStepIds();
    for (const step of task.steps) {
      if (globalStepIds.has(step.id)) {
        errors.push(
          `Task '${task.id}': step ID '${step.id}' collides with a step ID in a previously added task. Step IDs must be globally unique — prefix with the task ID (e.g. '${task.id}_${step.id}').`
        );
      }
    }

    for (const step of task.steps) {
      for (const dep of step.dependsOn) {
        if (!stepIds.has(dep) && !this.inputKeys.has(dep)) {
          errors.push(
            `Task '${task.id}': step '${step.id}' depends on '${dep}' which does not exist in this task or as an input key.`
          );
        }
      }
    }

    if (!checkStepCycles(task)) {
      errors.push(
        `Task '${task.id}': circular dependency detected among its steps.`
      );
    }

    const existingTaskIds = new Set(this.tasks.map((t) => t.id));
    for (const dep of task.dependsOn ?? []) {
      if (!existingTaskIds.has(dep)) {
        errors.push(
          `Task '${task.id}' depends on task '${dep}' which has not been added yet. Add dependency tasks before their dependents, or call remove_task to correct order.`
        );
      }
    }

    errors.push(...validateTaskSemantics(task));

    return errors;
  }

  private validateFullPlan(): string[] {
    const errors: string[] = [];
    if (this.tasks.length === 0) {
      errors.push("Plan must contain at least one task.");
      return errors;
    }
    if (!checkTaskCycles(this.tasks)) {
      errors.push("Circular dependency detected among tasks.");
    }
    return errors;
  }
}

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

function checkStepCycles(task: Task): boolean {
  const stepIds = new Set(task.steps.map((s) => s.id));
  const visited = new Set<string>();
  const inStack = new Set<string>();
  const stepMap = new Map(task.steps.map((s) => [s.id, s]));

  const hasCycle = (id: string): boolean => {
    if (inStack.has(id)) return true;
    if (visited.has(id)) return false;
    visited.add(id);
    inStack.add(id);
    const step = stepMap.get(id);
    if (step) {
      for (const dep of step.dependsOn) {
        if (stepIds.has(dep) && hasCycle(dep)) return true;
      }
    }
    inStack.delete(id);
    return false;
  };

  for (const step of task.steps) {
    if (hasCycle(step.id)) return false;
  }
  return true;
}

function checkTaskCycles(tasks: readonly Task[]): boolean {
  const taskIds = new Set(tasks.map((t) => t.id));
  const visited = new Set<string>();
  const inStack = new Set<string>();
  const taskMap = new Map(tasks.map((t) => [t.id, t]));

  const hasCycle = (id: string): boolean => {
    if (inStack.has(id)) return true;
    if (visited.has(id)) return false;
    visited.add(id);
    inStack.add(id);
    const task = taskMap.get(id);
    if (task) {
      for (const dep of task.dependsOn ?? []) {
        if (taskIds.has(dep) && hasCycle(dep)) return true;
      }
    }
    inStack.delete(id);
    return false;
  };

  for (const task of tasks) {
    if (hasCycle(task.id)) return false;
  }
  return true;
}

const LOOPING_PHRASES = [
  "for each",
  "for every",
  "iterate over",
  "loop over",
  "for all"
];

const AGGREGATOR_PATTERNS = [
  "aggregate",
  "compile",
  "combine",
  "merge",
  "final",
  "report"
];

const EXTRACTOR_PATTERNS = [
  "extract",
  "fetch",
  "scrape",
  "crawl",
  "parse",
  "process"
];

function validateTaskSemantics(task: Task): string[] {
  const errors: string[] = [];
  const aggregatorIds = new Set<string>();

  for (const step of task.steps) {
    const sid = step.id.toLowerCase();
    if (AGGREGATOR_PATTERNS.some((p) => sid.includes(p))) {
      aggregatorIds.add(step.id);
    }
  }

  for (const step of task.steps) {
    if (aggregatorIds.has(step.id)) continue;
    const content = step.instructions.toLowerCase();
    for (const phrase of LOOPING_PHRASES) {
      if (content.includes(phrase)) {
        errors.push(
          `Task '${task.id}': step '${step.id}' contains looping phrase '${phrase}'. Emit one step per item (fan-out) instead.`
        );
        break;
      }
    }
  }

  const extractorIds: string[] = [];
  for (const step of task.steps) {
    const sid = step.id.toLowerCase();
    if (EXTRACTOR_PATTERNS.some((p) => sid.includes(p))) {
      extractorIds.push(step.id);
    }
  }

  if (aggregatorIds.size > 0 && extractorIds.length > 0) {
    for (const aggId of aggregatorIds) {
      const agg = task.steps.find((s) => s.id === aggId);
      if (!agg) continue;
      const declared = new Set(agg.dependsOn);
      const missing = extractorIds.filter((eid) => !declared.has(eid));
      if (missing.length > 0) {
        errors.push(
          `Task '${task.id}': aggregator '${aggId}' must depend on all extractor steps. Missing: ${missing.join(", ")}`
        );
      }
    }
  }

  return errors;
}

function applySchemaOverrides(steps: Step[]): void {
  for (const step of steps) {
    if (!step.outputSchema) continue;
    try {
      const parsed =
        typeof step.outputSchema === "string"
          ? JSON.parse(step.outputSchema)
          : step.outputSchema;
      if (typeof parsed === "object" && parsed !== null) {
        if (!("type" in parsed)) {
          (parsed as Record<string, unknown>)["type"] = "object";
          step.outputSchema = JSON.stringify(parsed);
        }
      }
    } catch {
      step.outputSchema = undefined;
    }
  }
}

// ---------------------------------------------------------------------------
// Tools
// ---------------------------------------------------------------------------

const ADD_TASK_INPUT_SCHEMA = {
  type: "object",
  properties: {
    id: {
      type: "string",
      description:
        "Unique task identifier (snake_case). Globally unique across the plan."
    },
    title: { type: "string", description: "Task title" },
    depends_on: {
      type: "array",
      items: { type: "string" },
      description:
        "Task IDs this task depends on ([] for independent). Dependencies must be added before their dependents."
    },
    steps: {
      type: "array",
      description: "Steps within this task, forming an internal DAG.",
      items: {
        type: "object",
        properties: {
          id: {
            type: "string",
            description:
              "Step ID, globally unique across the plan. Prefix with task id (e.g. 'research_nlp_s1')."
          },
          instructions: { type: "string" },
          depends_on: {
            type: "array",
            items: { type: "string" }
          },
          output_schema: { type: "string" },
          tools: { type: "array", items: { type: "string" } }
        },
        required: ["id", "instructions", "depends_on"]
      }
    }
  },
  required: ["id", "title", "depends_on", "steps"]
};

export class AddTaskTool extends Tool {
  readonly name = "add_task";
  readonly description =
    "Add one task to the plan being built. Validated immediately. " +
    "On validation failure the task is NOT added and errors are returned; " +
    "call add_task again with a corrected task.";
  readonly inputSchema: Record<string, unknown> = ADD_TASK_INPUT_SCHEMA;

  constructor(private readonly builder: PlanBuilder) {
    super();
  }

  async process(
    _context: ProcessingContext,
    params: Record<string, unknown>
  ): Promise<unknown> {
    const result = this.builder.addTask(params);
    if (!result.ok) {
      return { status: "validation_failed", errors: result.errors };
    }
    return {
      status: "task_added",
      id: result.task.id,
      title: result.task.title,
      steps: result.task.steps.length,
      tasksSoFar: this.builder.taskCount
    };
  }

  userMessage(params: Record<string, unknown>): string {
    const title = typeof params["title"] === "string" ? params["title"] : "task";
    return `Adding task: ${title}`;
  }
}

const REMOVE_TASK_INPUT_SCHEMA = {
  type: "object",
  properties: {
    id: { type: "string", description: "Task ID to remove." }
  },
  required: ["id"]
};

export class RemoveTaskTool extends Tool {
  readonly name = "remove_task";
  readonly description =
    "Remove a previously added task. Use to correct mistakes " +
    "(e.g. when finish_plan reports a cross-task cycle).";
  readonly inputSchema: Record<string, unknown> = REMOVE_TASK_INPUT_SCHEMA;

  constructor(private readonly builder: PlanBuilder) {
    super();
  }

  async process(
    _context: ProcessingContext,
    params: Record<string, unknown>
  ): Promise<unknown> {
    const id = typeof params["id"] === "string" ? params["id"] : "";
    const result = this.builder.removeTask(id);
    if (!result.ok) {
      return { status: "error", error: result.error };
    }
    return { status: "task_removed", id, tasksSoFar: this.builder.taskCount };
  }

  userMessage(params: Record<string, unknown>): string {
    const id = typeof params["id"] === "string" ? params["id"] : "";
    return `Removing task: ${id}`;
  }
}

const FINISH_PLAN_INPUT_SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string", description: "Overall plan title." }
  },
  required: ["title"]
};

export class FinishPlanTool extends Tool {
  readonly name = "finish_plan";
  readonly description =
    "Commit the plan after all tasks have been added. Runs full-plan " +
    "validation. On validation failure, call add_task or remove_task and then " +
    "call finish_plan again.";
  readonly inputSchema: Record<string, unknown> = FINISH_PLAN_INPUT_SCHEMA;

  constructor(private readonly builder: PlanBuilder) {
    super();
  }

  async process(
    _context: ProcessingContext,
    params: Record<string, unknown>
  ): Promise<unknown> {
    const title =
      typeof params["title"] === "string" ? params["title"] : "Untitled Plan";
    const result = this.builder.finish(title);
    if (!result.ok) {
      return { status: "validation_failed", errors: result.errors };
    }
    return {
      status: "plan_finished",
      title: result.plan.title,
      tasks: result.plan.tasks.length,
      totalSteps: result.plan.tasks.reduce((sum, t) => sum + t.steps.length, 0)
    };
  }

  userMessage(params: Record<string, unknown>): string {
    const title = typeof params["title"] === "string" ? params["title"] : "plan";
    return `Finalizing plan: ${title}`;
  }
}
