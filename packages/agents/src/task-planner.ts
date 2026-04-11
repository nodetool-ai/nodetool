/**
 * TaskPlanner -- uses an LLM agent with tools to decompose an objective into
 * a Task or TaskPlan.
 *
 * The planner calls the LLM with a planning tool (CreatePlanTool or
 * CreateTaskPlanTool). The tools handle validation and building the plan;
 * the planner drives the retry loop and message history.
 */

import type {
  BaseProvider,
  ProcessingContext,
  Message,
} from "@nodetool/runtime";
import { createLogger } from "@nodetool/config";
import type {
  ProcessingMessage,
  Chunk,
  PlanningUpdate
} from "@nodetool/protocol";

const log = createLogger("nodetool.agents.planner");
import type { Task, TaskPlan } from "./types.js";
import type { Tool } from "./tools/base-tool.js";
import { CreatePlanTool } from "./tools/create-plan-tool.js";
import { CreateTaskPlanTool } from "./tools/create-task-tool.js";

const MAX_RETRIES = 3;

const DEFAULT_PLANNING_SYSTEM_PROMPT = `You are a TaskArchitect that transforms user objectives into executable plans with MAXIMUM parallelism.

You create a TaskPlan with multiple Tasks. Each Task runs as an independent sub-agent.

A TaskPlan has:
- title: overall plan title
- tasks: array of Tasks

Each Task has:
- id: unique snake_case identifier
- title: human-readable title
- depends_on: list of task IDs this depends on ([] for none)
- steps: array of Steps for this task

Each Step has:
- id: unique snake_case identifier (unique across ALL tasks)
- instructions: clear, actionable instructions
- depends_on: list of step IDs within this task ([] for none)
- output_schema (optional): JSON schema string for the step output
- tools (optional): list of tool names this step can use

CRITICAL RULES FOR PARALLELISM:
- MAXIMIZE parallelism: decompose the objective into as many independent Tasks as possible
- Tasks that don't depend on each other MUST be separate Tasks (they run in parallel)
- Only add task dependencies when a task genuinely needs output from another task
- Each task is a self-contained unit of work executed by its own sub-agent
- A single task should have a focused, coherent objective
- Include a final aggregation task that depends on all other tasks if results need combining
- All IDs must be unique across the entire plan
- Dependencies must form a valid DAG (no cycles)

Call the create_plan tool with your plan.`;

const DEFAULT_SINGLE_TASK_SYSTEM_PROMPT = `You are a TaskArchitect that transforms user objectives into executable task plans.

You create a Task with Steps. Each Step is an atomic unit of work.

A Task has:
- title: human-readable title
- steps: array of Steps

Each Step has:
- id: unique snake_case identifier
- instructions: clear, actionable instructions
- depends_on: list of step IDs this step depends on ([] for none)
- output_schema (optional): JSON schema string for the step output
- tools (optional): list of tool names this step can use

RULES:
- Steps should be atomic and focused
- Maximize parallelism: steps that don't depend on each other should have no dependency relationship
- All IDs must be unique
- Dependencies must form a valid DAG (no cycles)

Call the create_task tool with your task plan.`;

const PLAN_CREATION_PROMPT_TEMPLATE = `Create an executable TaskPlan with MAXIMUM parallelism using the create_plan tool.
Decompose the objective into independent tasks that can run in parallel as sub-agents.

Objective: {{objective}}

Available tools:
{{toolsInfo}}

Output schema (for the final result):
{{outputSchema}}`;

const TASK_CREATION_PROMPT_TEMPLATE = `Create an executable task plan using the create_task tool.

Objective: {{objective}}

Available tools:
{{toolsInfo}}

Output schema (for the final result):
{{outputSchema}}`;

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
  threadId?: string;
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
  private threadId?: string;

  constructor(opts: TaskPlannerOptions) {
    this.provider = opts.provider;
    this.model = opts.model;
    this.reasoningModel = opts.reasoningModel ?? opts.model;
    this.tools = opts.tools ?? [];
    this.systemPrompt = opts.systemPrompt ?? DEFAULT_PLANNING_SYSTEM_PROMPT;
    this.outputSchema = opts.outputSchema;
    this.inputs = opts.inputs ?? {};
    this.maxRetries = opts.maxRetries ?? MAX_RETRIES;
    this.threadId = opts.threadId;
  }

  /**
   * Generate a single-Task plan from an objective using a tool-calling agent.
   * Returns null on repeated failure (graceful degradation).
   */
  async *plan(
    objective: string,
    _context: ProcessingContext
  ): AsyncGenerator<ProcessingMessage, Task | null> {
    const toolsInfo = this.formatToolsInfo();

    const userPrompt = TASK_CREATION_PROMPT_TEMPLATE
      .replace("{{objective}}", objective)
      .replace("{{toolsInfo}}", toolsInfo)
      .replace(
        "{{outputSchema}}",
        this.outputSchema
          ? JSON.stringify(this.outputSchema, null, 2)
          : "None specified"
      );

    const systemPrompt = this.systemPrompt !== DEFAULT_PLANNING_SYSTEM_PROMPT
      ? this.systemPrompt
      : DEFAULT_SINGLE_TASK_SYSTEM_PROMPT;

    const messages: Message[] = [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt }
    ];

    yield {
      type: "planning_update",
      phase: "initialization",
      status: "started",
      content: "Starting task planning..."
    } satisfies PlanningUpdate;

    const createTaskTool = new CreateTaskPlanTool(this.inputs);

    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      log.debug("Generating plan", {
        objective: objective.slice(0, 60),
        attempt: attempt + 1
      });

      yield {
        type: "planning_update",
        phase: "generation",
        status: "running",
        content:
          attempt > 0
            ? `Retry attempt ${attempt + 1}/${this.maxRetries}...`
            : "Generating plan..."
      } satisfies PlanningUpdate;

      const toolCallResult = yield* this.callProviderWithTool(
        messages,
        createTaskTool
      );

      if (createTaskTool.task) {
        log.info("Plan created", {
          title: createTaskTool.task.title,
          steps: createTaskTool.task.steps.length
        });

        yield {
          type: "planning_update",
          phase: "complete",
          status: "success",
          content: `Plan created: ${createTaskTool.task.title} (${createTaskTool.task.steps.length} steps)`
        } satisfies PlanningUpdate;

        return createTaskTool.task;
      }

      // Tool was called but validation failed, or tool was not called
      const errorMsg = toolCallResult.error ??
        `Planning tool was not called successfully on attempt ${attempt + 1}/${this.maxRetries}`;

      log.warn("Plan generation retry", {
        attempt: attempt + 1,
        reason: errorMsg
      });

      yield {
        type: "planning_update",
        phase: "validation",
        status: "failed",
        content: errorMsg
      } satisfies PlanningUpdate;

      // Feed error back to LLM for retry
      if (toolCallResult.assistantContent) {
        messages.push({
          role: "assistant",
          content: toolCallResult.assistantContent
        });
      }
      messages.push({
        role: "user",
        content: `Error: ${errorMsg}. Please call the create_task tool with a corrected plan.`
      });
    }

    log.error("Plan generation failed", { attempts: this.maxRetries });

    yield {
      type: "chunk",
      content: `\nFailed to generate a task plan after ${this.maxRetries} attempts.\n`,
      done: true
    } satisfies Chunk;

    yield {
      type: "planning_update",
      phase: "complete",
      status: "failed",
      content: `Plan generation failed after ${this.maxRetries} attempts`
    } satisfies PlanningUpdate;

    return null;
  }

  /**
   * Generate a multi-task plan from an objective using a tool-calling agent.
   * Each task runs as an independent sub-agent. Tasks form a DAG via dependsOn.
   * Returns null on repeated failure (graceful degradation).
   */
  async *planMultiTask(
    objective: string,
    _context: ProcessingContext
  ): AsyncGenerator<ProcessingMessage, TaskPlan | null> {
    const toolsInfo = this.formatToolsInfo();

    const userPrompt = PLAN_CREATION_PROMPT_TEMPLATE
      .replace("{{objective}}", objective)
      .replace("{{toolsInfo}}", toolsInfo)
      .replace(
        "{{outputSchema}}",
        this.outputSchema
          ? JSON.stringify(this.outputSchema, null, 2)
          : "None specified"
      );

    const messages: Message[] = [
      { role: "system", content: this.systemPrompt },
      { role: "user", content: userPrompt }
    ];

    yield {
      type: "planning_update",
      phase: "initialization",
      status: "started",
      content: "Starting parallel task planning..."
    } satisfies PlanningUpdate;

    const createPlanTool = new CreatePlanTool(this.inputs);

    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      log.debug("Generating multi-task plan", {
        objective: objective.slice(0, 60),
        attempt: attempt + 1
      });

      yield {
        type: "planning_update",
        phase: "generation",
        status: "running",
        content:
          attempt > 0
            ? `Retry attempt ${attempt + 1}/${this.maxRetries}...`
            : "Generating parallel plan..."
      } satisfies PlanningUpdate;

      const toolCallResult = yield* this.callProviderWithTool(
        messages,
        createPlanTool
      );

      if (createPlanTool.plan) {
        const plan = createPlanTool.plan;
        const totalSteps = plan.tasks.reduce(
          (sum, t) => sum + t.steps.length,
          0
        );
        const independentTasks = plan.tasks.filter(
          (t) => !t.dependsOn || t.dependsOn.length === 0
        ).length;

        log.info("Multi-task plan created", {
          title: plan.title,
          tasks: plan.tasks.length,
          totalSteps,
          independentTasks
        });

        yield {
          type: "planning_update",
          phase: "complete",
          status: "success",
          content: `Plan created: ${plan.title} (${plan.tasks.length} tasks, ${totalSteps} steps, ${independentTasks} parallelizable)`
        } satisfies PlanningUpdate;

        return plan;
      }

      const errorMsg = toolCallResult.error ??
        `Planning tool was not called successfully on attempt ${attempt + 1}/${this.maxRetries}`;

      log.warn("Multi-task plan generation retry", {
        attempt: attempt + 1,
        reason: errorMsg
      });

      yield {
        type: "planning_update",
        phase: "validation",
        status: "failed",
        content: errorMsg
      } satisfies PlanningUpdate;

      if (toolCallResult.assistantContent) {
        messages.push({
          role: "assistant",
          content: toolCallResult.assistantContent
        });
      }
      messages.push({
        role: "user",
        content: `Error: ${errorMsg}. Please call the create_plan tool with a corrected plan.`
      });
    }

    log.error("Multi-task plan generation failed", {
      attempts: this.maxRetries
    });

    yield {
      type: "chunk",
      content: `\nFailed to generate a multi-task plan after ${this.maxRetries} attempts.\n`,
      done: true
    } satisfies Chunk;

    yield {
      type: "planning_update",
      phase: "complete",
      status: "failed",
      content: `Multi-task plan generation failed after ${this.maxRetries} attempts`
    } satisfies PlanningUpdate;

    return null;
  }

  /**
   * Call the provider with a planning tool, process the stream, and execute
   * any tool calls. Returns metadata about the call outcome.
   */
  private async *callProviderWithTool(
    messages: Message[],
    planningTool: CreatePlanTool | CreateTaskPlanTool
  ): AsyncGenerator<
    ProcessingMessage,
    { error?: string; assistantContent?: string }
  > {
    let content = "";
    let toolCallArgs: Record<string, unknown> | null = null;

    const providerTool = planningTool.toProviderTool();

    // Provide onToolCall so providers with native tool support can
    // register the planning tool. The handler captures the args.
    const onToolCall = async (
      name: string,
      args: Record<string, unknown>
    ): Promise<string> => {
      if (name === planningTool.name) {
        toolCallArgs = args;
        return JSON.stringify({ status: "tool_called" });
      }
      return JSON.stringify({ error: `Unknown tool: ${name}` });
    };

    const stream = this.provider.generateMessagesTraced({
      messages: [...messages],
      model: this.model,
      tools: [providerTool],
      toolChoice: planningTool.name,
      threadId: this.threadId,
      onToolCall
    });

    for await (const item of stream) {
      if (
        "type" in item &&
        (item as unknown as Record<string, unknown>)["type"] === "chunk"
      ) {
        const chunk = item as { content?: string };
        if (typeof chunk.content === "string") {
          content += chunk.content;
          yield {
            type: "chunk",
            content: chunk.content,
            done: false
          } satisfies Chunk;
        }
      }
      if ("name" in item && item.name === planningTool.name) {
        toolCallArgs = item.args as Record<string, unknown>;
      }
    }

    if (!toolCallArgs) {
      return {
        error: `LLM did not call ${planningTool.name} tool`,
        assistantContent: content || undefined
      };
    }

    // Execute the tool to validate and build the plan
    const result = await planningTool.process(
      {} as ProcessingContext,
      toolCallArgs
    );

    // Check if validation failed
    if (
      typeof result === "object" &&
      result !== null &&
      (result as Record<string, unknown>)["status"] === "validation_failed"
    ) {
      const errors = (result as Record<string, unknown>)[
        "errors"
      ] as string[];
      return {
        error: `Plan validation failed:\n${errors.map((e) => `- ${e}`).join("\n")}`,
        assistantContent: content || undefined
      };
    }

    // Tool succeeded — the plan/task is now stored on the tool instance
    return { assistantContent: content || undefined };
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
        const props = Object.keys(
          schema.properties as Record<string, unknown>
        );
        const required = Array.isArray(schema.required)
          ? (schema.required as string[])
          : [];
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
}
