/**
 * Tool for creating and validating a single-task execution plan.
 *
 * Used by TaskPlanner (legacy single-task path) to let the LLM produce
 * a validated Task through the standard agent tool-calling loop.
 */

import type { ProcessingContext } from "@nodetool/runtime";
import { Tool } from "./base-tool.js";
import type { Step, Task } from "../types.js";
import { randomUUID } from "node:crypto";

/**
 * JSON Schema for the create_task tool input.
 */
const CREATE_TASK_INPUT_SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string", description: "Task title" },
    steps: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          instructions: { type: "string" },
          depends_on: { type: "array", items: { type: "string" } },
          output_schema: { type: "string" },
          tools: { type: "array", items: { type: "string" } }
        },
        required: ["id", "instructions", "depends_on"]
      }
    }
  },
  required: ["title", "steps"]
};

export class CreateTaskPlanTool extends Tool {
  readonly name = "create_task";
  readonly description =
    "Create an executable task with steps. " +
    "Steps form a DAG via depends_on for parallel execution within the task.";
  readonly inputSchema: Record<string, unknown> = CREATE_TASK_INPUT_SCHEMA;

  /** Captured validated task, or null if not yet created. */
  private _task: Task | null = null;

  /** Input keys for dependency validation. */
  private readonly inputKeys: Set<string>;

  constructor(inputs?: Record<string, unknown>) {
    super();
    this.inputKeys = new Set(Object.keys(inputs ?? {}));
  }

  get task(): Task | null {
    return this._task;
  }

  async process(
    _context: ProcessingContext,
    params: Record<string, unknown>
  ): Promise<unknown> {
    const task = this.buildTask(params);
    const errors = this.validateTask(task);

    if (errors.length > 0) {
      return {
        status: "validation_failed",
        errors
      };
    }

    this.applySchemaOverrides(task.steps);
    this._task = task;

    return {
      status: "task_created",
      title: task.title,
      steps: task.steps.length
    };
  }

  userMessage(params: Record<string, unknown>): string {
    const title =
      typeof params["title"] === "string" ? params["title"] : "task";
    return `Creating task: ${title}`;
  }

  // ---------------------------------------------------------------------------
  // Build
  // ---------------------------------------------------------------------------

  private buildTask(data: Record<string, unknown>): Task {
    const title =
      typeof data["title"] === "string" ? data["title"] : "Untitled Task";
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
      id: randomUUID(),
      title,
      steps
    };
  }

  // ---------------------------------------------------------------------------
  // Validation
  // ---------------------------------------------------------------------------

  private validateTask(task: Task): string[] {
    const errors: string[] = [];
    const stepIds = new Set(task.steps.map((s) => s.id));

    // Check dependencies
    for (const step of task.steps) {
      for (const dep of step.dependsOn) {
        if (!stepIds.has(dep) && !this.inputKeys.has(dep)) {
          errors.push(
            `Step '${step.id}' depends on '${dep}' which does not exist as a step ID or input key.`
          );
        }
      }
    }

    // Check for duplicate step IDs
    const seen = new Set<string>();
    for (const step of task.steps) {
      if (seen.has(step.id)) {
        errors.push(`Duplicate step ID: '${step.id}'.`);
      }
      seen.add(step.id);
    }

    // Check for cycles
    if (!this.checkForCycles(task)) {
      errors.push("Circular dependency detected in task plan.");
    }

    // Semantic checks
    errors.push(...this.validatePlanSemantics(task.steps));

    // Must have at least one step
    if (task.steps.length === 0) {
      errors.push("Task must contain at least one step.");
    }

    return errors;
  }

  private checkForCycles(task: Task): boolean {
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
