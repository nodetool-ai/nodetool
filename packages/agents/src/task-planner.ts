/**
 * TaskPlanner -- uses an LLM to decompose an objective into a Task with Steps.
 *
 * Port of src/nodetool/agents/task_planner.py (simplified)
 */

import type { BaseProvider, ProcessingContext, Message } from "@nodetool/runtime";
import { createLogger } from "@nodetool/config";
import type { ProcessingMessage, Chunk, PlanningUpdate } from "@nodetool/protocol";

const log = createLogger("nodetool.agents.planner");
import type { Step, Task } from "./types.js";
import type { Tool } from "./tools/base-tool.js";
import { extractJSON } from "./utils/json-parser.js";
import { randomUUID } from "node:crypto";

const MAX_RETRIES = 3;

const DEFAULT_PLANNING_SYSTEM_PROMPT = `You are a TaskArchitect that transforms user objectives into executable Task plans.

A Task has a title and a list of Steps. Each Step has:
- id: unique snake_case identifier
- instructions: clear, actionable instructions
- dependsOn: list of step IDs this depends on ([] for none)
- outputSchema (optional): JSON schema string for the step output
- tools (optional): list of tool names this step can use

Requirements:
- All step IDs must be unique
- Dependencies must form a valid DAG (no cycles)
- All referenced dependency IDs must exist as step IDs
- Steps should be atomic (smallest executable units)

Call the create_task tool with your plan.`;

const PLAN_CREATION_PROMPT_TEMPLATE = `Create an executable Task for this objective using the create_task tool.

Objective: {{objective}}

Available tools:
{{toolsInfo}}

Output schema:
{{outputSchema}}`;

/**
 * Schema for the create_task tool used by the planner.
 */
const CREATE_TASK_SCHEMA = {
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
          tools: { type: "array", items: { type: "string" } },
        },
        required: ["id", "instructions", "depends_on"],
      },
    },
  },
  required: ["title", "steps"],
};

export interface TaskPlannerOptions {
  provider: BaseProvider;
  model: string;
  /** Optional alternative model for reasoning/refinement passes. Defaults to `model`. */
  reasoningModel?: string;
  tools?: Tool[];
  systemPrompt?: string;
  outputSchema?: Record<string, unknown>;
  inputs?: Record<string, unknown>;
  maxRetries?: number;
}

export class TaskPlanner {
  private provider: BaseProvider;
  private model: string;
  readonly reasoningModel: string;
  private tools: Tool[];
  private systemPrompt: string;
  private outputSchema: Record<string, unknown> | undefined;
  private inputs: Record<string, unknown>;
  private maxRetries: number;

  constructor(opts: TaskPlannerOptions) {
    this.provider = opts.provider;
    this.model = opts.model;
    this.reasoningModel = opts.reasoningModel ?? opts.model;
    this.tools = opts.tools ?? [];
    this.systemPrompt = opts.systemPrompt ?? DEFAULT_PLANNING_SYSTEM_PROMPT;
    this.outputSchema = opts.outputSchema;
    this.inputs = opts.inputs ?? {};
    this.maxRetries = opts.maxRetries ?? MAX_RETRIES;
  }

  /**
   * Generate a Task plan from an objective.
   * Retries up to maxRetries on parse/validation failure with error feedback.
   * Returns null on repeated failure (graceful degradation).
   */
  async *plan(
    objective: string,
    _context: ProcessingContext,
  ): AsyncGenerator<ProcessingMessage, Task | null> {
    const toolsInfo = this.formatToolsInfo();

    const userPrompt = PLAN_CREATION_PROMPT_TEMPLATE
      .replace("{{objective}}", objective)
      .replace("{{toolsInfo}}", toolsInfo)
      .replace(
        "{{outputSchema}}",
        this.outputSchema ? JSON.stringify(this.outputSchema, null, 2) : "None specified",
      );

    const messages: Message[] = [
      { role: "system", content: this.systemPrompt },
      { role: "user", content: userPrompt },
    ];

    yield {
      type: "planning_update",
      phase: "initialization",
      status: "started",
      content: "Starting task planning...",
    } satisfies PlanningUpdate;

    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      log.debug("Generating plan", { objective: objective.slice(0, 60), attempt: attempt + 1 });

      // Call LLM with the create_task tool
      let content = "";
      let taskData: Record<string, unknown> | null = null;

      yield {
        type: "planning_update",
        phase: "generation",
        status: "running",
        content: attempt > 0 ? `Retry attempt ${attempt + 1}/${this.maxRetries}...` : "Generating plan...",
      } satisfies PlanningUpdate;

      const stream = this.provider.generateMessagesTraced({
        messages: [...messages],
        model: this.model,
        tools: [
          {
            name: "create_task",
            description: "Create an executable task with steps.",
            inputSchema: CREATE_TASK_SCHEMA,
          },
        ],
        toolChoice: "create_task",
      });

      for await (const item of stream) {
        if ("type" in item && (item as unknown as Record<string, unknown>)["type"] === "chunk") {
          const chunk = item as { content?: string };
          content += chunk.content ?? "";
          yield {
            type: "chunk",
            content: chunk.content,
            done: false,
          } satisfies Chunk;
        }
        if ("name" in item && item.name === "create_task") {
          taskData = item.args as Record<string, unknown>;
        }
      }

      // If no tool call, try extracting from text
      if (!taskData && content) {
        const parsed = extractJSON(content);
        if (parsed && typeof parsed === "object") {
          taskData = parsed as Record<string, unknown>;
        }
      }

      if (!taskData) {
        const errorMsg = `LLM did not call create_task tool on attempt ${attempt + 1}/${this.maxRetries}`;
        log.warn("Plan generation retry", { attempt: attempt + 1, reason: errorMsg });
        if (attempt < this.maxRetries - 1) {
          messages.push({ role: "assistant", content });
          messages.push({ role: "user", content: `Error: ${errorMsg}. Please call the create_task tool with your task plan.` });
          continue;
        }
        log.error("Plan generation failed", { attempts: this.maxRetries });
        yield {
          type: "chunk",
          content: `\nFailed to generate a task plan after ${this.maxRetries} attempts.\n`,
          done: true,
        } satisfies Chunk;
        yield {
          type: "planning_update",
          phase: "complete",
          status: "failed",
          content: errorMsg,
        } satisfies PlanningUpdate;
        return null;
      }

      // Build Task from the LLM response
      const task = this.buildTask(taskData);

      // Validate
      yield {
        type: "planning_update",
        phase: "validation",
        status: "running",
        content: "Validating plan...",
      } satisfies PlanningUpdate;

      const errors = this.validatePlan(task);

      if (errors.length > 0) {
        const errorMsg = `Plan validation failed on attempt ${attempt + 1}/${this.maxRetries}:\n${errors.map((e) => `- ${e}`).join("\n")}`;

        yield {
          type: "planning_update",
          phase: "validation",
          status: "failed",
          content: errorMsg,
        } satisfies PlanningUpdate;

        if (attempt < this.maxRetries - 1) {
          // Feed errors back to LLM for retry
          messages.push({ role: "assistant", content });
          messages.push({
            role: "user",
            content: `Error: The task plan has validation errors:\n${errors.map((e) => `- ${e}`).join("\n")}\n\nPlease fix these issues and call create_task again with the corrected plan.`,
          });
          continue;
        }

        yield {
          type: "chunk",
          content: `\nFailed to generate a valid task plan after ${this.maxRetries} attempts.\n`,
          done: true,
        } satisfies Chunk;
        yield {
          type: "planning_update",
          phase: "complete",
          status: "failed",
          content: errorMsg,
        } satisfies PlanningUpdate;
        return null;
      }

      // Apply schema normalization
      this.applySchemaOverrides(task.steps);

      log.info("Plan created", { title: task.title, steps: task.steps.length });

      yield {
        type: "planning_update",
        phase: "complete",
        status: "success",
        content: `Plan created: ${task.title} (${task.steps.length} steps)`,
      } satisfies PlanningUpdate;

      return task;
    }

    // Should not reach here, but just in case
    return null;
  }

  /**
   * Run all validation checks on a task plan. Returns list of error messages.
   */
  validatePlan(task: Task): string[] {
    const errors: string[] = [];
    errors.push(...this.validateDependencies(task.steps));
    errors.push(...this.validateInputs(task.steps));
    errors.push(...this.validatePlanSemantics(task.steps));
    if (!this.checkForCycles(task)) {
      errors.push("Circular dependency detected in task plan.");
    }
    return errors;
  }

  /**
   * Validate that all dependsOn IDs refer to real step IDs or input keys.
   */
  validateDependencies(steps: Step[]): string[] {
    const errors: string[] = [];
    const stepIds = new Set(steps.map((s) => s.id));
    const inputKeys = new Set(Object.keys(this.inputs));

    for (const step of steps) {
      for (const dep of step.dependsOn) {
        if (!stepIds.has(dep) && !inputKeys.has(dep)) {
          errors.push(
            `Step '${step.id}' depends on '${dep}' which does not exist as a step ID or input key.`,
          );
        }
      }
    }

    // Check for duplicate step IDs
    const seen = new Set<string>();
    for (const step of steps) {
      if (seen.has(step.id)) {
        errors.push(`Duplicate step ID: '${step.id}'.`);
      }
      seen.add(step.id);
    }

    return errors;
  }

  /**
   * Check that all required inputs are available.
   * Steps that depend on input keys should have those keys present.
   */
  validateInputs(steps: Step[]): string[] {
    const errors: string[] = [];
    const stepIds = new Set(steps.map((s) => s.id));

    for (const step of steps) {
      for (const dep of step.dependsOn) {
        // If dependency is not a step ID, it must be an input key
        if (!stepIds.has(dep) && !(dep in this.inputs) && !Object.keys(this.inputs).includes(dep)) {
          // Already caught by validateDependencies, skip duplicate
        }
      }
    }

    return errors;
  }

  /**
   * Detect looping/iteration phrases and aggregator wiring issues.
   */
  validatePlanSemantics(steps: Step[]): string[] {
    const errors: string[] = [];

    const loopingPhrases = [
      "for each",
      "for every",
      "iterate over",
      "loop over",
      "for all",
    ];

    // Identify aggregator steps
    const aggregatorPatterns = ["aggregate", "compile", "combine", "merge", "final", "report"];
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
            `Step '${step.id}' contains looping phrase '${phrase}'. Emit one step per item (fan-out) instead.`,
          );
          break;
        }
      }
    }

    // Check aggregator wiring: aggregators should depend on all extractor-like steps
    const extractorPatterns = ["extract", "fetch", "scrape", "crawl", "parse", "process"];
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
            `Aggregator '${aggId}' must depend on all extractor steps. Missing: ${missing.join(", ")}`,
          );
        }
      }
    }

    return errors;
  }

  /**
   * Validate that the task steps form a valid DAG (no cycles).
   */
  checkForCycles(task: Task): boolean {
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
          if (stepIds.has(dep) && hasCycle(dep)) {
            return true;
          }
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

  /**
   * Format tool info with full schemas for the planning prompt.
   */
  private formatToolsInfo(): string {
    if (this.tools.length === 0) return "No execution tools available.";

    const lines: string[] = ["Available execution tools for steps:"];
    for (const tool of this.tools) {
      let schemaInfo = "";
      const schema = tool.inputSchema;
      if (schema && typeof schema === "object" && "properties" in schema) {
        const props = Object.keys(schema.properties as Record<string, unknown>);
        const required = Array.isArray(schema.required) ? (schema.required as string[]) : [];
        const propDetails = props.map((p) => {
          const isReq = required.includes(p) ? " (required)" : "";
          return `${p}${isReq}`;
        });
        if (propDetails.length > 0) {
          schemaInfo = ` | Args: ${propDetails.join(", ")}`;
        }
      }
      lines.push(`- ${tool.name}: ${tool.description}${schemaInfo}`);
    }
    return lines.join("\n");
  }

  /**
   * Normalize output schemas for steps.
   * Only modifies the schema if it needs a "type" field added.
   */
  private applySchemaOverrides(steps: Step[]): void {
    for (const step of steps) {
      if (!step.outputSchema) continue;
      try {
        const parsed = typeof step.outputSchema === "string"
          ? JSON.parse(step.outputSchema)
          : step.outputSchema;
        if (typeof parsed === "object" && parsed !== null) {
          if (!("type" in parsed)) {
            (parsed as Record<string, unknown>)["type"] = "object";
            step.outputSchema = JSON.stringify(parsed);
          }
          // If "type" already exists, leave the original string as-is
        }
      } catch {
        // Invalid JSON schema - clear it so StepExecutor uses fallback
        step.outputSchema = undefined;
      }
    }
  }

  /**
   * Build a Task object from raw LLM output data.
   */
  private buildTask(data: Record<string, unknown>): Task {
    const title = typeof data["title"] === "string" ? data["title"] : "Untitled Task";
    const rawSteps = Array.isArray(data["steps"]) ? data["steps"] : [];

    const steps: Step[] = rawSteps.map((s: unknown) => {
      const raw = s as Record<string, unknown>;
      return {
        id: typeof raw["id"] === "string" ? raw["id"] : randomUUID(),
        instructions: typeof raw["instructions"] === "string" ? raw["instructions"] : "",
        completed: false,
        dependsOn: Array.isArray(raw["depends_on"])
          ? (raw["depends_on"] as string[])
          : Array.isArray(raw["dependsOn"])
            ? (raw["dependsOn"] as string[])
            : [],
        outputSchema: typeof raw["output_schema"] === "string"
          ? raw["output_schema"]
          : typeof raw["outputSchema"] === "string"
            ? raw["outputSchema"]
            : undefined,
        tools: Array.isArray(raw["tools"]) ? (raw["tools"] as string[]) : undefined,
        logs: [],
      };
    });

    return {
      id: randomUUID(),
      title,
      steps,
    };
  }

  /**
   * @deprecated Use checkForCycles instead. Kept for backward compatibility.
   */
  private validateDAG(task: Task): boolean {
    return this.checkForCycles(task);
  }
}
