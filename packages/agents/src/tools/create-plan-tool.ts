/**
 * Tool for creating and validating a multi-task execution plan.
 *
 * Used by TaskPlanner to let the LLM produce a validated TaskPlan
 * through the standard agent tool-calling loop.
 */

import type { ProcessingContext } from "@nodetool/runtime";
import { Tool } from "./base-tool.js";
import type { Step, Task, TaskPlan } from "../types.js";
import { randomUUID } from "node:crypto";

/**
 * JSON Schema for the create_plan tool input.
 */
const CREATE_PLAN_INPUT_SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string", description: "Overall plan title" },
    tasks: {
      type: "array",
      description:
        "Independent tasks to execute in parallel. Each task runs as its own sub-agent.",
      items: {
        type: "object",
        properties: {
          id: { type: "string", description: "Unique task identifier" },
          title: { type: "string", description: "Task title" },
          depends_on: {
            type: "array",
            items: { type: "string" },
            description: "Task IDs this task depends on ([] for independent)"
          },
          steps: {
            type: "array",
            items: {
              type: "object",
              properties: {
                id: { type: "string" },
                instructions: { type: "string" },
                depends_on: {
                  type: "array",
                  items: { type: "string" },
                  description: "Step IDs within this task"
                },
                output_schema: { type: "string" },
                tools: { type: "array", items: { type: "string" } }
              },
              required: ["id", "instructions", "depends_on"]
            }
          }
        },
        required: ["id", "title", "depends_on", "steps"]
      }
    }
  },
  required: ["title", "tasks"]
};

export class CreatePlanTool extends Tool {
  readonly name = "create_plan";
  readonly description =
    "Create a parallel execution plan with multiple independent tasks. " +
    "Each task runs as its own sub-agent. Tasks form a DAG via depends_on.";
  readonly inputSchema: Record<string, unknown> = CREATE_PLAN_INPUT_SCHEMA;

  /** Captured validated plan, or null if not yet created. */
  private _plan: TaskPlan | null = null;

  /** Input keys for dependency validation. */
  private readonly inputKeys: Set<string>;

  constructor(inputs?: Record<string, unknown>) {
    super();
    this.inputKeys = new Set(Object.keys(inputs ?? {}));
  }

  get plan(): TaskPlan | null {
    return this._plan;
  }

  async process(
    _context: ProcessingContext,
    params: Record<string, unknown>
  ): Promise<unknown> {
    const taskPlan = this.buildTaskPlan(params);
    const errors = this.validateTaskPlan(taskPlan);

    if (errors.length > 0) {
      return {
        status: "validation_failed",
        errors
      };
    }

    // Apply schema normalization to all task steps
    for (const task of taskPlan.tasks) {
      this.applySchemaOverrides(task.steps);
    }

    this._plan = taskPlan;
    return {
      status: "plan_created",
      title: taskPlan.title,
      tasks: taskPlan.tasks.length,
      totalSteps: taskPlan.tasks.reduce((sum, t) => sum + t.steps.length, 0)
    };
  }

  userMessage(params: Record<string, unknown>): string {
    const title =
      typeof params["title"] === "string" ? params["title"] : "plan";
    return `Creating plan: ${title}`;
  }

  // ---------------------------------------------------------------------------
  // Build
  // ---------------------------------------------------------------------------

  private buildTaskPlan(data: Record<string, unknown>): TaskPlan {
    const title =
      typeof data["title"] === "string" ? data["title"] : "Untitled Plan";
    const rawTasks = Array.isArray(data["tasks"]) ? data["tasks"] : [];

    const tasks: Task[] = rawTasks.map((t: unknown) => {
      const rawTask = t as Record<string, unknown>;
      const taskId =
        typeof rawTask["id"] === "string" ? rawTask["id"] : randomUUID();
      const taskTitle =
        typeof rawTask["title"] === "string"
          ? rawTask["title"]
          : "Untitled Task";
      const taskDependsOn = Array.isArray(rawTask["depends_on"])
        ? (rawTask["depends_on"] as string[])
        : Array.isArray(rawTask["dependsOn"])
          ? (rawTask["dependsOn"] as string[])
          : [];

      const rawSteps = Array.isArray(rawTask["steps"])
        ? rawTask["steps"]
        : [];
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
    });

    return { title, tasks };
  }

  // ---------------------------------------------------------------------------
  // Validation
  // ---------------------------------------------------------------------------

  private validateTaskPlan(taskPlan: TaskPlan): string[] {
    const errors: string[] = [];
    const taskIds = new Set(taskPlan.tasks.map((t) => t.id));

    // Check for duplicate task IDs
    const seenTaskIds = new Set<string>();
    for (const task of taskPlan.tasks) {
      if (seenTaskIds.has(task.id)) {
        errors.push(`Duplicate task ID: '${task.id}'.`);
      }
      seenTaskIds.add(task.id);
    }

    // Check task-level dependencies
    for (const task of taskPlan.tasks) {
      for (const dep of task.dependsOn ?? []) {
        if (!taskIds.has(dep)) {
          errors.push(
            `Task '${task.id}' depends on '${dep}' which does not exist as a task ID.`
          );
        }
      }
    }

    // Check for cycles at the task level
    if (!this.checkForTaskCycles(taskPlan)) {
      errors.push("Circular dependency detected among tasks.");
    }

    // Collect all step IDs across all tasks for uniqueness check
    const allStepIds = new Set<string>();
    for (const task of taskPlan.tasks) {
      for (const step of task.steps) {
        if (allStepIds.has(step.id)) {
          errors.push(
            `Duplicate step ID '${step.id}' found across tasks.`
          );
        }
        allStepIds.add(step.id);
      }
    }

    // Validate each task's internal steps
    for (const task of taskPlan.tasks) {
      const stepIds = new Set(task.steps.map((s) => s.id));

      for (const step of task.steps) {
        for (const dep of step.dependsOn) {
          if (!stepIds.has(dep) && !this.inputKeys.has(dep)) {
            errors.push(
              `Step '${step.id}' in task '${task.id}' depends on '${dep}' which does not exist within that task or as an input key.`
            );
          }
        }
      }

      // Check for step-level cycles within this task
      if (!this.checkForStepCycles(task)) {
        errors.push(
          `Circular dependency detected in steps of task '${task.id}'.`
        );
      }

      // Validate semantics within each task
      const semanticErrors = this.validatePlanSemantics(task.steps);
      for (const err of semanticErrors) {
        errors.push(`Task '${task.id}': ${err}`);
      }
    }

    // Must have at least one task
    if (taskPlan.tasks.length === 0) {
      errors.push("Plan must contain at least one task.");
    }

    return errors;
  }

  private checkForTaskCycles(taskPlan: TaskPlan): boolean {
    const taskIds = new Set(taskPlan.tasks.map((t) => t.id));
    const visited = new Set<string>();
    const inStack = new Set<string>();
    const taskMap = new Map(taskPlan.tasks.map((t) => [t.id, t]));

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

    for (const task of taskPlan.tasks) {
      if (hasCycle(task.id)) return false;
    }
    return true;
  }

  private checkForStepCycles(task: Task): boolean {
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

  private validatePlanSemantics(steps: Step[]): string[] {
    const errors: string[] = [];

    const loopingPhrases = [
      "for each",
      "for every",
      "iterate over",
      "loop over",
      "for all"
    ];

    const aggregatorPatterns = [
      "aggregate",
      "compile",
      "combine",
      "merge",
      "final",
      "report"
    ];
    const aggregatorIds = new Set<string>();

    for (const step of steps) {
      const sid = step.id.toLowerCase();
      if (aggregatorPatterns.some((p) => sid.includes(p))) {
        aggregatorIds.add(step.id);
      }
    }

    // Check non-aggregator steps for looping language
    for (const step of steps) {
      if (aggregatorIds.has(step.id)) continue;
      const content = step.instructions.toLowerCase();
      for (const phrase of loopingPhrases) {
        if (content.includes(phrase)) {
          errors.push(
            `Step '${step.id}' contains looping phrase '${phrase}'. Emit one step per item (fan-out) instead.`
          );
          break;
        }
      }
    }

    // Check aggregator wiring
    const extractorPatterns = [
      "extract",
      "fetch",
      "scrape",
      "crawl",
      "parse",
      "process"
    ];
    const extractorIds: string[] = [];
    for (const step of steps) {
      const sid = step.id.toLowerCase();
      if (extractorPatterns.some((p) => sid.includes(p))) {
        extractorIds.push(step.id);
      }
    }

    if (aggregatorIds.size > 0 && extractorIds.length > 0) {
      for (const aggId of aggregatorIds) {
        const agg = steps.find((s) => s.id === aggId);
        if (!agg) continue;
        const declaredDeps = new Set(agg.dependsOn);
        const missing = extractorIds.filter((eid) => !declaredDeps.has(eid));
        if (missing.length > 0) {
          errors.push(
            `Aggregator '${aggId}' must depend on all extractor steps. Missing: ${missing.join(", ")}`
          );
        }
      }
    }

    return errors;
  }

  // ---------------------------------------------------------------------------
  // Schema normalization
  // ---------------------------------------------------------------------------

  private applySchemaOverrides(steps: Step[]): void {
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
}
