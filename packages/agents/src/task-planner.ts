/**
 * TaskPlanner -- decomposes an objective into a Task or TaskPlan via tool calls.
 *
 * planMultiTask() builds the plan incrementally: the LLM calls add_task one
 * task at a time, with per-task validation. Progress is yielded as task_update
 * events (TaskPlanned) so clients can watch the plan take shape in real time.
 *
 * plan() (single-task) keeps the original one-shot create_task tool.
 */

import type {
  BaseProvider,
  ProcessingContext,
  Message,
  ToolCall
} from "@nodetool-ai/runtime";
import { withAgentSpanGen } from "@nodetool-ai/runtime";
import { createLogger } from "@nodetool-ai/config";
import {
  TaskUpdateEvent,
  type ProcessingMessage,
  type Chunk,
  type PlanningUpdate,
  type TaskUpdate,
  type ToolCallUpdate
} from "@nodetool-ai/protocol";

const log = createLogger("nodetool.agents.planner");
import type { Task, TaskPlan, Step } from "./types.js";
import type { Tool } from "./tools/base-tool.js";
import { CreateTaskPlanTool } from "./tools/create-task-tool.js";
import {
  PlanBuilder,
  AddTaskTool,
  RemoveTaskTool,
  FinishPlanTool
} from "./tools/plan-builder-tools.js";
import { rejectAgenticProvider } from "./reject-agentic-provider.js";

const MAX_RETRIES = 3;
const MAX_PER_TASK_RETRIES = 3;

const DEFAULT_PLANNING_SYSTEM_PROMPT = `You are a TaskArchitect. Decompose objectives into parallel executable plans by calling tools.

## Process (call tools in order)
1. Call \`add_task\` one task at a time. Each call adds exactly one task and is validated immediately.
2. If a call returns \`validation_failed\`, read the errors and call \`add_task\` again with corrections.
3. Add dependency tasks BEFORE their dependents (task-level \`depends_on\` must point at a task already added).
4. If you added a task in error, call \`remove_task\` with its id.
5. When all tasks are added, call \`finish_plan\` with the overall plan title.

## Structure
- Task: { id, title, depends_on[], steps[] } — each task runs as an independent sub-agent.
- Step: { id, instructions, depends_on[], output_schema?, tools? }

## ID Rules (violations cause retries)
- Task IDs: descriptive snake_case, e.g. "research_nlp", "write_summary".
- Step IDs: globally unique across the plan. Prefix with the task id, e.g. "research_nlp_s1".
- NEVER use bare "s1", "s2" — they collide across tasks.

## Parallelism
- Independent work goes in separate tasks (they run concurrently).
- Only add \`depends_on\` when one task genuinely needs another's output.
- Add a final aggregation task (depending on all others) when results need combining.

## Step Instructions
- Specific and concise. State exactly what to do, not the whole objective.
- Reference available tools by name.
- Bad: "Research NLP and write a summary including main ideas and relevance."
- Good: "Use google_search to find recent NLP advances. Summarize key findings in 2-3 sentences."

## Step Granularity (hard rule)
- One step = one focused operation that a sub-agent can finish in ~3 LLM turns.
  Typical shapes: a single search + summarize, a single image/video render, a single file write.
- NEVER combine N independent items into one step (e.g. "research 3 games and render an image for each"
  is 6 steps minimum, not 1). Fan out into N parallel steps/tasks, then an aggregation step.
- If a step would need more than 2 tool calls of different kinds, split it.
- Prefer many small parallel steps over a few wide ones — steps are iteration-capped, parallelism is cheap.

## Output Schemas
- Include \`output_schema\` (as a JSON schema string) for steps that produce structured data.
- The aggregation step MUST have an \`output_schema\` matching the plan's overall output schema.
- Use type "object" at the top level.

## Models & Media (use the right tools)
- Before generating media, call \`find_model\` once for the relevant capability
  (text_to_image, text_to_video, text_to_speech, automatic_speech_recognition,
  generate_embedding) and pass the resulting \`provider\` + \`model\` to the
  generation tool.
- Generation tools: \`generate_image\`, \`edit_image\`, \`generate_video\`,
  \`animate_image\`, \`generate_speech\`, \`transcribe_audio\`, \`embed_text\`.
- These tools save outputs as ASSETS automatically — the result includes
  \`asset_id\` and \`asset_uri\` ("asset://<id>.<ext>"). Reference those in
  later steps and in the final response so the chat UI can show them.
- For non-media artifacts the user should keep (reports, JSON, manifests),
  call \`save_asset\` with \`name\` + \`content\` (text) or \`content_base64\`
  (binary). Use \`read_asset\` / \`list_assets\` / \`get_asset\` to retrieve.`;

const DEFAULT_SINGLE_TASK_SYSTEM_PROMPT = `You are a TaskArchitect. Decompose objectives into executable step plans.

## Structure
- Task: { title, steps[] }
- Step: { id, instructions, depends_on[], output_schema?, tools? }

## Rules
- Step IDs: descriptive snake_case, e.g. "search_sources", "write_report".
- Steps must be atomic and focused — one clear action each.
- Maximize parallelism: steps without data dependencies should have \`depends_on: []\`.
- Reference available tools by name in step instructions.
- Include \`output_schema\` (JSON schema string) for steps producing structured data.
- Dependencies must form a valid DAG (no cycles).

Call the \`create_task\` tool with your task plan.`;

const PLAN_CREATION_PROMPT_TEMPLATE = `Build an executable TaskPlan by calling add_task once per task, then finish_plan.

Objective: {{objective}}

Available tools (reference by name in step instructions):
{{toolsInfo}}

Output schema for the final aggregation step:
{{outputSchema}}

Remember: prefix step IDs with their task ID (e.g. "task1_search", "task1_summarize") to avoid collisions. Call add_task for each task in dependency order.`;

const TASK_CREATION_PROMPT_TEMPLATE = `Create an executable task plan using the create_task tool.

Objective: {{objective}}

Available tools (reference by name in step instructions):
{{toolsInfo}}

Output schema for the final step:
{{outputSchema}}`;

export interface TaskPlannerOptions {
  provider: BaseProvider;
  model: string;
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

  // ---------------------------------------------------------------------------
  // Single-task planning (legacy one-shot)
  // ---------------------------------------------------------------------------

  async *plan(
    objective: string,
    context: ProcessingContext
  ): AsyncGenerator<ProcessingMessage, Task | null> {
    return yield* withAgentSpanGen(
      "plan",
      {
        objective,
        provider: this.provider.provider,
        model: this.model,
        toolsCount: this.tools.length,
        extra: { "agent.plan.kind": "single" }
      },
      () => this._planImpl(objective, context)
    );
  }

  private async *_planImpl(
    objective: string,
    _context: ProcessingContext
  ): AsyncGenerator<ProcessingMessage, Task | null> {
    rejectAgenticProvider(this.provider, "TaskPlanner.plan");
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

    const systemPrompt =
      this.systemPrompt !== DEFAULT_PLANNING_SYSTEM_PROMPT
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
      yield {
        type: "planning_update",
        phase: "generation",
        status: "running",
        content:
          attempt > 0
            ? `Retry attempt ${attempt + 1}/${this.maxRetries}...`
            : "Generating plan..."
      } satisfies PlanningUpdate;

      const toolCallResult = yield* this.callSingleTaskTool(
        messages,
        createTaskTool
      );

      if (createTaskTool.task) {
        yield {
          type: "planning_update",
          phase: "complete",
          status: "success",
          content: `Plan created: ${createTaskTool.task.title} (${createTaskTool.task.steps.length} steps)`
        } satisfies PlanningUpdate;
        return createTaskTool.task;
      }

      const errorMsg =
        toolCallResult.error ??
        `Planning tool was not called successfully on attempt ${attempt + 1}/${this.maxRetries}`;

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
        content: `Error: ${errorMsg}. Please call the create_task tool with a corrected plan.`
      });
    }

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

  // ---------------------------------------------------------------------------
  // Multi-task planning (incremental)
  // ---------------------------------------------------------------------------

  async *planMultiTask(
    objective: string,
    context: ProcessingContext
  ): AsyncGenerator<ProcessingMessage, TaskPlan | null> {
    return yield* withAgentSpanGen(
      "plan",
      {
        objective,
        provider: this.provider.provider,
        model: this.model,
        toolsCount: this.tools.length,
        extra: { "agent.plan.kind": "multi" }
      },
      () => this._planMultiTaskImpl(objective, context)
    );
  }

  private async *_planMultiTaskImpl(
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

    rejectAgenticProvider(this.provider, "TaskPlanner.planMultiTask");

    const builder = new PlanBuilder(this.inputs);
    const addTaskTool = new AddTaskTool(builder);
    const removeTaskTool = new RemoveTaskTool(builder);
    const finishPlanTool = new FinishPlanTool(builder);
    const toolsByName = new Map<string, Tool>([
      [addTaskTool.name, addTaskTool],
      [removeTaskTool.name, removeTaskTool],
      [finishPlanTool.name, finishPlanTool]
    ]);
    const providerTools = [
      addTaskTool.toProviderTool(),
      removeTaskTool.toProviderTool(),
      finishPlanTool.toProviderTool()
    ];

    const perTaskFailures = new Map<string, number>();
    const MAX_CALLS = 100;

    for (let call = 0; call < MAX_CALLS; call++) {
      const pendingToolCalls: ToolCall[] = [];
      let assistantText = "";

      const stream = this.provider.generateMessagesTraced({
        messages: [...messages],
        model: this.model,
        tools: providerTools,
        toolChoice: "any",
        threadId: this.threadId
      });

      for await (const item of stream) {
        if ("type" in item && (item as { type: string }).type === "chunk") {
          const chunk = item as { content?: string };
          if (typeof chunk.content === "string" && chunk.content.length > 0) {
            assistantText += chunk.content;
            yield {
              type: "chunk",
              content: chunk.content,
              done: false
            } satisfies Chunk;
          }
        }
        if ("id" in item && "name" in item && "args" in item) {
          pendingToolCalls.push(item as ToolCall);
        }
      }

      // Record assistant turn with any tool calls.
      messages.push({
        role: "assistant",
        content: assistantText,
        toolCalls: pendingToolCalls.length > 0 ? pendingToolCalls : undefined
      });

      if (pendingToolCalls.length === 0) {
        messages.push({
          role: "user",
          content:
            "No tool call in your response. Call add_task, remove_task, or finish_plan to continue."
        });
        continue;
      }

      let aborted: string | null = null;
      let finished = false;

      for (const tc of pendingToolCalls) {
        const tool = toolsByName.get(tc.name);
        if (!tool) {
          messages.push({
            role: "tool",
            toolCallId: tc.id,
            content: JSON.stringify({
              status: "error",
              error: `Unknown tool: ${tc.name}. Use add_task, remove_task, or finish_plan.`
            })
          });
          continue;
        }

        const args = (tc.args ?? {}) as Record<string, unknown>;
        yield {
          type: "tool_call_update",
          node_id: "",
          name: tc.name,
          args,
          message: tool.userMessage(args)
        } satisfies ToolCallUpdate;

        const result = (await tool.process(
          {} as ProcessingContext,
          args
        )) as Record<string, unknown>;
        messages.push({
          role: "tool",
          toolCallId: tc.id,
          content: JSON.stringify(result)
        });

        const status = result["status"];

        if (tc.name === addTaskTool.name) {
          const taskId = typeof args["id"] === "string" ? args["id"] : undefined;
          if (status === "task_added") {
            const added = builder.currentTasks[builder.currentTasks.length - 1];
            if (added) yield this.taskPlannedEvent(added);
            yield {
              type: "planning_update",
              phase: "generation",
              status: "running",
              content: `Added task ${builder.taskCount}: ${added?.title ?? taskId ?? ""}`
            } satisfies PlanningUpdate;
          } else if (status === "validation_failed") {
            const errors = (result["errors"] as string[]) ?? [];
            const count = (perTaskFailures.get(taskId ?? "_") ?? 0) + 1;
            perTaskFailures.set(taskId ?? "_", count);
            yield {
              type: "planning_update",
              phase: "validation",
              status: "failed",
              content: `Task '${taskId ?? "?"}' validation failed (${count}/${MAX_PER_TASK_RETRIES}): ${errors.join("; ")}`
            } satisfies PlanningUpdate;
            if (count >= MAX_PER_TASK_RETRIES) {
              aborted = `Task '${taskId ?? "?"}' failed validation ${count} times. Aborting plan.`;
              break;
            }
          }
        } else if (tc.name === removeTaskTool.name) {
          const removedId =
            typeof args["id"] === "string" ? (args["id"] as string) : "";
          if (status === "task_removed") {
            yield {
              type: "task_update",
              event: TaskUpdateEvent.TaskRemoved,
              task: { id: removedId }
            } satisfies TaskUpdate;
            perTaskFailures.delete(removedId);
            yield {
              type: "planning_update",
              phase: "generation",
              status: "running",
              content: `Removed task: ${removedId}`
            } satisfies PlanningUpdate;
          }
        } else if (tc.name === finishPlanTool.name) {
          if (status === "plan_finished" && builder.plan) {
            const plan = builder.plan;
            const totalSteps = plan.tasks.reduce(
              (s, t) => s + t.steps.length,
              0
            );
            const independent = plan.tasks.filter(
              (t) => !t.dependsOn || t.dependsOn.length === 0
            ).length;
            log.info("Multi-task plan created", {
              title: plan.title,
              tasks: plan.tasks.length
            });
            yield {
              type: "planning_update",
              phase: "complete",
              status: "success",
              content: `Plan created: ${plan.title} (${plan.tasks.length} tasks, ${totalSteps} steps, ${independent} parallelizable)`
            } satisfies PlanningUpdate;
            finished = true;
            break;
          }
          if (status === "validation_failed") {
            const errors = (result["errors"] as string[]) ?? [];
            yield {
              type: "planning_update",
              phase: "validation",
              status: "failed",
              content: `finish_plan failed: ${errors.join("; ")}`
            } satisfies PlanningUpdate;
          }
        }
      }

      if (finished) return builder.plan;
      if (aborted) {
        yield {
          type: "planning_update",
          phase: "complete",
          status: "failed",
          content: aborted
        } satisfies PlanningUpdate;
        return null;
      }
    }

    log.error("Multi-task plan exhausted call budget", {
      tasksSoFar: builder.taskCount
    });
    yield {
      type: "planning_update",
      phase: "complete",
      status: "failed",
      content: `Plan generation exhausted ${MAX_CALLS} calls without calling finish_plan`
    } satisfies PlanningUpdate;
    return null;
  }

  // ---------------------------------------------------------------------------
  // Single-task one-shot call
  // ---------------------------------------------------------------------------

  private async *callSingleTaskTool(
    messages: Message[],
    planningTool: CreateTaskPlanTool
  ): AsyncGenerator<
    ProcessingMessage,
    { error?: string; assistantContent?: string }
  > {
    let content = "";
    let toolCallArgs: Record<string, unknown> | null = null;

    const providerTool = planningTool.toProviderTool();

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

    const result = await planningTool.process(
      {} as ProcessingContext,
      toolCallArgs
    );

    if (
      typeof result === "object" &&
      result !== null &&
      (result as Record<string, unknown>)["status"] === "validation_failed"
    ) {
      const errors = (result as Record<string, unknown>)["errors"] as string[];
      return {
        error: `Plan validation failed:\n${errors.map((e) => `- ${e}`).join("\n")}`,
        assistantContent: content || undefined
      };
    }

    return { assistantContent: content || undefined };
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private taskPlannedEvent(task: Task): TaskUpdate {
    const steps = task.steps.map((s: Step) => ({
      id: s.id,
      instructions: s.instructions,
      completed: false
    }));
    return {
      type: "task_update",
      event: TaskUpdateEvent.TaskPlanned,
      task: {
        id: task.id,
        title: task.title,
        steps,
        dependsOn: task.dependsOn
      }
    } satisfies TaskUpdate;
  }

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
