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
import type { PlanCache } from "./checkpoint-store.js";
import { hashPlanKey } from "./checkpoint-store.js";
import { Tool } from "./tools/base-tool.js";
import { CreateTaskPlanTool } from "./tools/create-task-tool.js";
import {
  PlanBuilder,
  AddTaskTool,
  RemoveTaskTool,
  FinishPlanTool
} from "./tools/plan-builder-tools.js";

const MAX_RETRIES = 3;
const MAX_PER_TASK_RETRIES = 3;

const DEFAULT_PLANNING_SYSTEM_PROMPT = `You are a TaskArchitect. Decompose objectives into parallel executable plans by calling tools.

## Process (call tools in order)
1. Call \`add_task\` one task at a time. Each call adds exactly one task and is validated immediately.
2. If a call returns \`validation_failed\`, read the errors and call \`add_task\` again with corrections.
3. Add dependency tasks BEFORE their dependents (task-level \`depends_on\` must point at a task already added).
4. If you added a task in error, call \`remove_task\` with its id.
5. When all tasks are added, call \`finish_plan\` with the overall plan title.

## User-Facing Status
- Every tool's input schema includes a \`_message\` string field. Set it on EVERY call to a short (5-12 words), present-continuous status describing what you're doing (e.g. "Adding research task", "Removing duplicate summarize task", "Finalizing 5-task plan"). This is shown live in the UI while the planner runs.

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

## Final Synthesis Is NOT Your Job
- Do NOT create an "assemble", "aggregate", "synthesize", "compile",
  "combine", or "final report" task or step. Final synthesis runs as a
  separate Compiler stage AFTER your plan finishes. It has full access to
  every \`task_result\` your plan produced and will assemble them into the
  declared output schema.
- Plan tasks should GATHER and PRODUCE concrete artifacts (search results,
  generated media, computed values, written sections, extracted facts).
  Each task's result is automatically stored in shared memory under
  \`task:<task_id>\` and made available to the Compiler.
- The schema shown below is informational — it tells you what facts the
  Compiler will need so you can plan tasks that produce them. Do NOT attach
  it to any step's \`output_schema\`.

## Step Instructions
- Specific and concise. State exactly what to do, not the whole objective.
- Reference available tools by name.
- Bad: "Research NLP and write a summary including main ideas and relevance."
- Good: "Use google_search to find recent NLP advances. Summarize key findings in 2-3 sentences."

## Step Granularity (hard rule)
- One step = one focused operation that a sub-agent can finish in ~3 LLM turns.
  Typical shapes: a single search + summarize, a single image/video render, a single file write.
- If a step would need more than 2 tool calls of different kinds, split it.
- Prefer many small parallel steps over a few wide ones — steps are iteration-capped, parallelism is cheap.

## Output Schemas
- Include \`output_schema\` (as a JSON schema string) on steps that produce
  structured data the next step needs to consume programmatically.
- Do NOT attach the overall plan output schema to any step — the Compiler
  owns the final schema-conformant result.
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

## User-Facing Status
- Set the \`_message\` field on EVERY tool call to a short (5-12 words), present-continuous status describing what you're doing (e.g. "Creating 3-step research plan"). This is shown live in the UI.

Call the \`create_task\` tool with your task plan.`;

const PLAN_CREATION_PROMPT_TEMPLATE = `Build an executable TaskPlan by calling add_task once per task, then finish_plan.

Objective: {{objective}}

Available tools (reference by name in step instructions):
{{toolsInfo}}

Final result schema (informational — the Compiler stage will produce this from your tasks' results; do NOT attach it to any step):
{{outputSchema}}

Remember:
- Prefix step IDs with their task ID (e.g. "task1_search", "task1_summarize") to avoid collisions.
- Call add_task for each task in dependency order.
- Do NOT add an aggregation/synthesis/assemble task — the Compiler handles final assembly from \`task_result\` memory entries automatically.`;

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
  /**
   * Optional plan cache. When supplied, {@link TaskPlanner.planMultiTask}
   * checks the cache (keyed by objective + sorted tool names + model) before
   * planning and reuses a hit instead of re-running the LLM loop. After a
   * successful plan it stores the result. Omit to keep the original behavior
   * (no caching). A `planMultiTask` argument overrides this.
   */
  planCache?: PlanCache;
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
  private planCache?: PlanCache;

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
    this.planCache = opts.planCache;
  }

  /** Build the stable plan-cache key for the given objective. */
  private buildPlanKey(objective: string): string {
    return hashPlanKey({
      objective,
      tools: this.tools.map((t) => t.name),
      model: this.model
    });
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
    context: ProcessingContext,
    planCache?: PlanCache
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
      () => this._planMultiTaskImpl(objective, context, planCache)
    );
  }

  private async *_planMultiTaskImpl(
    objective: string,
    context: ProcessingContext,
    planCacheArg?: PlanCache
  ): AsyncGenerator<ProcessingMessage, TaskPlan | null> {
    // Plan cache (opt-in): on a hit, skip the LLM planning + validation-retry
    // loop entirely and return the cached plan. No cache ⇒ unchanged behavior.
    const planCache = planCacheArg ?? this.planCache;
    const planKey = planCache ? this.buildPlanKey(objective) : undefined;
    if (planCache && planKey) {
      const cached = planCache.get(planKey);
      if (cached) {
        log.info("Multi-task plan cache hit", { title: cached.title });
        yield {
          type: "planning_update",
          phase: "complete",
          status: "success",
          content: `Plan cache hit: ${cached.title} (${cached.tasks.length} tasks)`
        } satisfies PlanningUpdate;
        return cached;
      }
    }

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

    const builder = new PlanBuilder(this.inputs);
    const addTaskTool = new AddTaskTool(builder);
    const removeTaskTool = new RemoveTaskTool(builder);
    const finishPlanTool = new FinishPlanTool(builder);
    const toolsByName = new Map<string, Tool>([
      [addTaskTool.name, addTaskTool],
      [removeTaskTool.name, removeTaskTool],
      [finishPlanTool.name, finishPlanTool]
    ]);
    const perTaskFailures = new Map<string, number>();
    const MAX_CALLS = 100;

    // Delegate the tool loop to the provider so backends that run their own
    // agent loop (e.g. the Claude Agent SDK) work. Each plan tool carries its
    // own `execute` closure that mutates the shared builder and buffers the UI
    // events its result implies; the stream consumer below drains that buffer
    // in order.
    //
    // `finish_plan` is only *conditionally* terminal: on a valid plan it
    // commits and aborts the loop; on a validation failure it returns the
    // errors as the tool result and does NOT abort, so the model iterates and
    // fixes the plan within the call budget. The static `terminal` flag can't
    // express that, so the AbortController stops the loop on a successful
    // finish. It also short-circuits when a single task fails validation too
    // many times (an early-stop that is not a terminal tool).
    const abort = new AbortController();
    const uiEvents: ProcessingMessage[] = [];
    let finished = false;
    let abortedReason: string | null = null;

    const addTaskExecute = async (
      args: Record<string, unknown>
    ): Promise<string> => {
      const result = (await Tool.executeTool(
        addTaskTool,
        context,
        args
      )) as Record<string, unknown>;
      const status = result["status"];
      const taskId = typeof args["id"] === "string" ? args["id"] : undefined;
      if (status === "task_added") {
        const added = builder.currentTasks[builder.currentTasks.length - 1];
        if (added) uiEvents.push(this.taskPlannedEvent(added));
        uiEvents.push({
          type: "planning_update",
          phase: "generation",
          status: "running",
          content: `Added task ${builder.taskCount}: ${added?.title ?? taskId ?? ""}`
        } satisfies PlanningUpdate);
      } else if (status === "validation_failed") {
        const errors = (result["errors"] as string[]) ?? [];
        const count = (perTaskFailures.get(taskId ?? "_") ?? 0) + 1;
        perTaskFailures.set(taskId ?? "_", count);
        uiEvents.push({
          type: "planning_update",
          phase: "validation",
          status: "failed",
          content: `Task '${taskId ?? "?"}' validation failed (${count}/${MAX_PER_TASK_RETRIES}): ${errors.join("; ")}`
        } satisfies PlanningUpdate);
        if (count >= MAX_PER_TASK_RETRIES) {
          abortedReason = `Task '${taskId ?? "?"}' failed validation ${count} times. Aborting plan.`;
          abort.abort();
        }
      }
      return JSON.stringify(result);
    };

    const removeTaskExecute = async (
      args: Record<string, unknown>
    ): Promise<string> => {
      const result = (await Tool.executeTool(
        removeTaskTool,
        context,
        args
      )) as Record<string, unknown>;
      const status = result["status"];
      const removedId =
        typeof args["id"] === "string" ? (args["id"] as string) : "";
      if (status === "task_removed") {
        uiEvents.push({
          type: "task_update",
          event: TaskUpdateEvent.TaskRemoved,
          task: { id: removedId }
        } satisfies TaskUpdate);
        perTaskFailures.delete(removedId);
        uiEvents.push({
          type: "planning_update",
          phase: "generation",
          status: "running",
          content: `Removed task: ${removedId}`
        } satisfies PlanningUpdate);
      }
      return JSON.stringify(result);
    };

    const finishPlanExecute = async (
      args: Record<string, unknown>
    ): Promise<string> => {
      const result = (await Tool.executeTool(
        finishPlanTool,
        context,
        args
      )) as Record<string, unknown>;
      const status = result["status"];
      if (status === "plan_finished" && builder.plan) {
        const plan = builder.plan;
        const totalSteps = plan.tasks.reduce((s, t) => s + t.steps.length, 0);
        const independent = plan.tasks.filter(
          (t) => !t.dependsOn || t.dependsOn.length === 0
        ).length;
        log.info("Multi-task plan created", {
          title: plan.title,
          tasks: plan.tasks.length
        });
        uiEvents.push({
          type: "planning_update",
          phase: "complete",
          status: "success",
          content: `Plan created: ${plan.title} (${plan.tasks.length} tasks, ${totalSteps} steps, ${independent} parallelizable)`
        } satisfies PlanningUpdate);
        finished = true;
        abort.abort();
      } else if (status === "validation_failed") {
        const errors = (result["errors"] as string[]) ?? [];
        uiEvents.push({
          type: "planning_update",
          phase: "validation",
          status: "failed",
          content: `finish_plan failed: ${errors.join("; ")}`
        } satisfies PlanningUpdate);
      }
      return JSON.stringify(result);
    };

    const providerTools = [
      { ...addTaskTool.toProviderTool(), execute: addTaskExecute },
      { ...removeTaskTool.toProviderTool(), execute: removeTaskExecute },
      {
        ...finishPlanTool.toProviderTool(),
        execute: finishPlanExecute
      }
    ];

    const drainUi = function* (): Generator<ProcessingMessage> {
      while (uiEvents.length > 0) yield uiEvents.shift() as ProcessingMessage;
    };

    const stream = this.provider.generateLoop({
      messages,
      model: this.model,
      tools: providerTools,
      toolChoice: "any",
      threadId: this.threadId,
      maxIterations: MAX_CALLS,
      sequentialTools: true,
      signal: abort.signal
    });

    for await (const item of stream) {
      // A tool call is announced before it runs — surface it for live display.
      if ("id" in item && "name" in item && "args" in item) {
        const tc = item as ToolCall;
        const tool = toolsByName.get(tc.name);
        if (tool) {
          const args = (tc.args ?? {}) as Record<string, unknown>;
          yield {
            type: "tool_call_update",
            node_id: "",
            name: tc.name,
            args,
            message: Tool.resolveMessage(tool, args)
          } satisfies ToolCallUpdate;
        }
        yield* drainUi();
        continue;
      }
      if ("type" in item && (item as { type?: string }).type === "chunk") {
        const chunk = item as { content?: string; done?: boolean };
        if (
          typeof chunk.content === "string" &&
          chunk.content.length > 0 &&
          !chunk.done
        ) {
          yield {
            type: "chunk",
            content: chunk.content,
            done: false
          } satisfies Chunk;
        }
        yield* drainUi();
        continue;
      }
      // Assistant/tool message events: a tool result just landed — flush its UI.
      yield* drainUi();
    }

    yield* drainUi();

    if (finished) {
      // Persist a successful plan so an identical objective + tool set reuses it.
      if (planCache && planKey && builder.plan) {
        planCache.set(planKey, builder.plan);
      }
      return builder.plan;
    }

    if (abortedReason) {
      yield {
        type: "planning_update",
        phase: "complete",
        status: "failed",
        content: abortedReason
      } satisfies PlanningUpdate;
      return null;
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

    const result = await Tool.executeTool(
      planningTool,
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
