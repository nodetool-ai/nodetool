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

const DEFAULT_PLANNING_SYSTEM_PROMPT = `You are a TaskArchitect. You decompose objectives into parallel executable plans.

STRUCTURE:
- TaskPlan: { title, tasks[] }
- Task: { id, title, depends_on[], steps[] }  — each task runs as an independent sub-agent
- Step: { id, instructions, depends_on[], output_schema?, tools? }

ID RULES (violations cause retries):
- Task IDs: use descriptive snake_case, e.g. "research_nlp", "write_summary"
- Step IDs: prefix with task ID to guarantee uniqueness across ALL tasks, e.g. "research_nlp_s1", "write_summary_s1"
- NEVER use bare "s1", "s2" etc. — these collide across tasks and fail validation

PARALLELISM:
- Independent work MUST be separate tasks (they run concurrently)
- Only add depends_on when a task genuinely needs another task's output
- Add a final aggregation task (depends on all others) when results need combining

STEP INSTRUCTIONS:
- Be specific and concise — state exactly what to do, not the whole objective
- Reference available tools by name when the step should use them
- Bad: "Research the topic of NLP and write a summary including main ideas and relevance"
- Good: "Use google_search to find recent NLP advances. Summarize key findings in 2-3 sentences."

OUTPUT SCHEMAS:
- Include output_schema (as a JSON schema string) for steps that produce structured data
- The aggregation step MUST have an output_schema matching the plan's overall output schema
- Use type "object" at the top level (not bare arrays)

Call the create_plan tool with your plan.`;

const DEFAULT_SINGLE_TASK_SYSTEM_PROMPT = `You are a TaskArchitect. You decompose objectives into executable step plans.

STRUCTURE:
- Task: { title, steps[] }
- Step: { id, instructions, depends_on[], output_schema?, tools? }

RULES:
- Step IDs: descriptive snake_case, e.g. "search_sources", "write_report"
- Steps should be atomic and focused — one clear action each
- Maximize parallelism: steps without data dependencies should have depends_on: []
- Reference available tools by name in step instructions
- Include output_schema (JSON schema string) for steps producing structured data
- Dependencies must form a valid DAG (no cycles)

Call the create_task tool with your task plan.`;

const PLAN_CREATION_PROMPT_TEMPLATE = `Create an executable TaskPlan using the create_plan tool.

Objective: {{objective}}

Available tools (reference by name in step instructions):
{{toolsInfo}}

Output schema for the final aggregation step:
{{outputSchema}}

Remember: prefix step IDs with their task ID (e.g. "task1_search", "task1_summarize") to avoid collisions.`;

const TASK_CREATION_PROMPT_TEMPLATE = `Create an executable task plan using the create_task tool.

Objective: {{objective}}

Available tools (reference by name in step instructions):
{{toolsInfo}}

Output schema for the final step:
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
