/**
 * CompilerAgent — final synthesis pass for plan-mode execution.
 *
 * Runs after `ParallelTaskExecutor` finishes. Reads the entire `context.memory`
 * snapshot (task results, step results, shared facts, inputs) and produces a
 * single schema-conformant final result via `finish_step`.
 *
 * The planner does NOT produce a synthesis/aggregation step anymore — that
 * concern is owned by this agent. This decouples planning quality from
 * synthesis quality, gives synthesis full memory access, and lets us use a
 * stronger (e.g. reasoning) model for compilation specifically.
 *
 * Toolset: `memory_list`, `memory_read`, `finish_step`. No domain tools, no
 * `memory_write` — the compiler is read-only over memory and produces exactly
 * one result.
 */

import { createLogger } from "@nodetool-ai/config";
import type {
  BaseProvider,
  Message,
  ProcessingContext,
  ToolCall,
  ProviderStreamItem
} from "@nodetool-ai/runtime";
import { withAgentSpanGen } from "@nodetool-ai/runtime";
import type {
  Chunk,
  LogUpdate,
  PlanningUpdate,
  ProcessingMessage,
  StepResult,
  ToolCallUpdate
} from "@nodetool-ai/protocol";

import { FinishStepTool } from "./tools/finish-step-tool.js";
import {
  MemoryListTool,
  MemoryReadTool
} from "./tools/memory-tools.js";
import { Tool } from "./tools/base-tool.js";
import type { TaskPlan } from "./types.js";

const log = createLogger("nodetool.agents.compiler-agent");

const MAX_COMPILE_ROUNDS = 6;
const MAX_TOOL_RESULT_CHARS = 20_000;

const COMPILER_SYSTEM_PROMPT_STRUCTURED = `# Role
You are the Compiler. The plan has finished gathering information; your only
job is to synthesize the gathered results into the final deliverable.

# How To Work
1. Call \`memory_list\` first to see every entry that the plan produced.
   Entries with kind \`task_result\` are task outputs, \`step_result\` are step
   outputs, \`input\` are caller-supplied inputs, and \`shared\` are facts the
   agents published explicitly.
2. Call \`memory_read\` for the keys whose full values you need. Read multiple
   keys in a single call when you need several.
3. Synthesize a single result that satisfies the declared output schema.
4. Call \`finish_step\` exactly once with \`{"result": <result>}\`. Stop
   immediately after — do not emit additional text or tool calls.

# Discipline
- Do NOT do additional research or invoke domain tools — there are none.
- Preserve every concrete artifact from upstream results (URLs, asset IDs,
  file paths, tables, key facts). Never paraphrase them away.
- If the gathered information is insufficient, still produce the best
  schema-conformant result you can from what is available. Do not invent
  facts that are not in memory.
- Do not reveal chain-of-thought or internal reasoning.

# User-Facing Status
- Every tool's input schema includes a \`_message\` string field. Set it on EVERY call to a short (5-12 words), present-continuous status describing what you're doing (e.g. "Listing available task results", "Reading research summaries", "Compiling final answer"). This is shown live in the UI.`;

const COMPILER_SYSTEM_PROMPT_PROSE = `# Role
You are the Compiler. The plan has finished gathering information; your only
job is to combine the gathered results into one coherent response for the
user.

# How To Work
1. Call \`memory_list\` to see every entry the plan produced (task outputs,
   step outputs, inputs, shared facts).
2. Call \`memory_read\` for the keys whose full values you need.
3. Produce the final response as your assistant message. Do NOT call any
   tool in this final turn — the absence of a tool call signals completion.

# Discipline
- Do NOT do additional research or invoke domain tools — there are none.
- Preserve every concrete artifact (URLs, asset IDs, file paths, tables,
  key facts). Never paraphrase them away.
- Do not mention task IDs or internal plan structure to the user.
- Do not reveal chain-of-thought or internal reasoning.

# User-Facing Status
- Every tool's input schema includes a \`_message\` string field. Set it on EVERY call to a short (5-12 words), present-continuous status describing what you're doing (e.g. "Listing available task results", "Reading research summaries"). This is shown live in the UI.`;

export interface CompilerAgentOptions {
  objective: string;
  /**
   * Schema the final result must match. When omitted the compiler runs in
   * prose mode: it produces the final response as a plain assistant message
   * and returns the text. When supplied it adds `finish_step` to the toolset
   * and produces a schema-conformant value.
   */
  outputSchema?: Record<string, unknown>;
  /**
   * Optional directive appended to the prose-mode user prompt to control
   * presentation (e.g. "Final result: markdown prose."). Ignored when
   * `outputSchema` is supplied.
   */
  formatDirective?: string;
  provider: BaseProvider;
  model: string;
  context: ProcessingContext;
  /**
   * The plan that produced the memory entries this compiler will synthesize.
   * Surfaced in the prompt so the model knows which `task:<id>` keys to expect
   * and what each task was supposed to accomplish — much more useful than
   * memory metadata alone, which only shows titles.
   */
  taskPlan?: TaskPlan;
  /** Optional preamble layered above the default compiler system prompt. */
  systemPrompt?: string;
  maxRounds?: number;
  threadId?: string;
}

export class CompilerAgent {
  private readonly objective: string;
  private readonly outputSchema?: Record<string, unknown>;
  private readonly formatDirective?: string;
  private readonly provider: BaseProvider;
  private readonly model: string;
  private readonly context: ProcessingContext;
  private readonly taskPlan?: TaskPlan;
  private readonly systemPrompt: string;
  private readonly maxRounds: number;
  private readonly threadId?: string;

  constructor(opts: CompilerAgentOptions) {
    this.objective = opts.objective;
    this.outputSchema = opts.outputSchema;
    this.formatDirective = opts.formatDirective;
    this.provider = opts.provider;
    this.model = opts.model;
    this.context = opts.context;
    this.taskPlan = opts.taskPlan;
    this.maxRounds = opts.maxRounds ?? MAX_COMPILE_ROUNDS;
    this.threadId = opts.threadId;

    const base = this.outputSchema
      ? COMPILER_SYSTEM_PROMPT_STRUCTURED
      : COMPILER_SYSTEM_PROMPT_PROSE;
    const preamble = opts.systemPrompt?.trim();
    this.systemPrompt = preamble ? `${preamble}\n\n---\n\n${base}` : base;
  }

  /**
   * Run the compilation pass. Yields ProcessingMessage updates and returns
   * the final synthesized result (or null if the model failed to call
   * `finish_step` before the round budget was exhausted).
   */
  async *compile(): AsyncGenerator<ProcessingMessage, unknown> {
    return yield* withAgentSpanGen(
      "compile",
      {
        objective: this.objective,
        provider: this.provider.provider,
        model: this.model,
        toolsCount: 3,
        extra: { "agent.kind": "compile" }
      },
      () => this._compileImpl()
    );
  }

  private async *_compileImpl(): AsyncGenerator<ProcessingMessage, unknown> {
    const memoryList = new MemoryListTool();
    const memoryRead = new MemoryReadTool();
    const finishStepTool = this.outputSchema
      ? new FinishStepTool(this.outputSchema)
      : null;
    const tools: Tool[] = finishStepTool
      ? [memoryList, memoryRead, finishStepTool]
      : [memoryList, memoryRead];
    const toolsByName = new Map(tools.map((t) => [t.name, t]));

    const snapshot = this.context.memory.list();
    const inventory = snapshot.length
      ? snapshot
          .map((e) => {
            const title = e.title ? ` — ${e.title}` : "";
            return `- ${e.key} (${e.kind})${title}`;
          })
          .join("\n")
      : "(no memory entries — produce the best result you can from the objective alone)";

    const planSection = this.formatTaskPlan();
    const closing = finishStepTool
      ? "Produce the final result and call `finish_step` exactly once."
      : `Produce the final response now.${
          this.formatDirective ? ` ${this.formatDirective}` : ""
        }`;

    const userPrompt = [
      `Objective:\n${this.objective}`,
      ...(planSection ? ["", planSection] : []),
      "",
      "Memory inventory (call `memory_read` for the keys whose values you need):",
      inventory,
      "",
      closing
    ].join("\n");

    const messages: Message[] = [
      { role: "system", content: this.systemPrompt },
      { role: "user", content: userPrompt }
    ];

    const startSummary =
      snapshot.length > 0
        ? `Composing the final answer from ${snapshot.length} memory ${snapshot.length === 1 ? "entry" : "entries"}…`
        : "Composing the final answer…";

    // Strongly-typed status signal for chat / execution-tree UIs.
    yield {
      type: "planning_update",
      node_id: "compiler",
      phase: "compile",
      status: "started",
      content: startSummary
    } satisfies PlanningUpdate;

    yield {
      type: "log_update",
      node_id: "compiler",
      node_name: "Compiler",
      content: startSummary,
      severity: "info"
    } satisfies LogUpdate;

    // Delegate the tool loop to the provider so backends that run their own
    // agent loop (e.g. the Claude Agent SDK) work. Each tool carries its own
    // `execute` closure: the read-only memory tools return their serialized
    // result, and `finish_step` (marked `terminal`) captures the final result
    // and ends the loop. The stream consumer surfaces chunks + tool updates.
    const uiEvents: ProcessingMessage[] = [];
    let finished = false;
    let finalResult: unknown = undefined;
    let lastAssistantText = "";
    // True only when the loop's last assistant turn had NO tool calls — a clean
    // completion. On maxRounds exhaustion the last assistant message still
    // carries tool calls, so this stays false and prose mode won't mislabel a
    // partial/empty run as a completed final answer.
    let endedWithCleanMessage = false;

    const finishStepExecute = async (
      args: Record<string, unknown>
    ): Promise<string> => {
      const rawResult = args?.["result"] as unknown;
      // Fall back to the whole args object when `result` is absent, but strip
      // the injected `_message` protocol field so it can't leak into the result.
      let resultPayload: unknown =
        rawResult !== undefined && rawResult !== null
          ? rawResult
          : Tool.stripMessage(args ?? {});
      // Array-output schemas are wrapped as `{ result: { items: <array> } }`
      // for the tool parameter schema; unwrap `{ items: [...] }` back to the
      // array. Gate on the declared schema type so a legitimate object result
      // with an `items` key is not misinterpreted.
      if (
        this.outputSchema?.["type"] === "array" &&
        resultPayload !== null &&
        typeof resultPayload === "object" &&
        !Array.isArray(resultPayload) &&
        Array.isArray((resultPayload as Record<string, unknown>)["items"])
      ) {
        resultPayload = (resultPayload as Record<string, unknown>)["items"];
      }
      if (resultPayload === undefined || resultPayload === null) {
        return '{"error": "Missing result in finish_step call"}';
      }
      finalResult = resultPayload;
      finished = true;
      log.info("Compiler finished", { entries: snapshot.length });
      uiEvents.push({
        type: "planning_update",
        node_id: "compiler",
        phase: "compile",
        status: "completed",
        content: "Final result produced."
      } satisfies PlanningUpdate);
      uiEvents.push({
        type: "step_result",
        step: { id: "compiler", instructions: this.objective },
        result: resultPayload,
        is_task_result: true
      } satisfies StepResult);
      return '{"status": "completed"}';
    };

    const runMemoryTool = async (
      tool: Tool,
      args: Record<string, unknown>
    ): Promise<string> => {
      try {
        const result = await Tool.executeTool(tool, this.context, args);
        let serialized =
          typeof result === "string" ? result : JSON.stringify(result);
        if (serialized.length > MAX_TOOL_RESULT_CHARS) {
          serialized =
            serialized.slice(0, MAX_TOOL_RESULT_CHARS) + "... [truncated]";
        }
        return serialized;
      } catch (e) {
        return JSON.stringify({ error: String(e) });
      }
    };

    const providerTools = tools.map((tool) => {
      if (finishStepTool && tool === finishStepTool) {
        return {
          ...tool.toProviderTool(),
          execute: finishStepExecute,
          terminal: true
        };
      }
      return {
        ...tool.toProviderTool(),
        execute: (args: Record<string, unknown>) => runMemoryTool(tool, args)
      };
    });

    const drainUi = function* (): Generator<ProcessingMessage> {
      while (uiEvents.length > 0) yield uiEvents.shift() as ProcessingMessage;
    };

    const stream = this.provider.generateLoop({
      messages,
      model: this.model,
      tools: providerTools,
      threadId: this.threadId,
      maxIterations: this.maxRounds,
      sequentialTools: true
    });

    for await (const item of stream as AsyncGenerator<ProviderStreamItem>) {
      if (isToolCall(item)) {
        const tool = toolsByName.get(item.name);
        const message =
          item.name === "finish_step"
            ? (Tool.extractMessage(item.args) ?? "Finalizing result")
            : tool
              ? Tool.resolveMessage(tool, item.args)
              : "";
        yield {
          type: "tool_call_update",
          node_id: "compiler",
          name: item.name,
          args: item.args,
          message
        } satisfies ToolCallUpdate;
        yield* drainUi();
        continue;
      }
      if (isChunk(item)) {
        yield {
          type: "chunk",
          node_id: "compiler",
          content: item.content ?? "",
          done: false
        } satisfies Chunk;
        yield* drainUi();
        continue;
      }
      // Track each assistant turn's text so prose mode can return the last one.
      if ("type" in item && (item as { type?: string }).type === "message") {
        const m = (
          item as {
            message?: {
              role?: string;
              content?: unknown;
              toolCalls?: unknown[];
            };
          }
        ).message;
        if (m?.role === "assistant") {
          endedWithCleanMessage = !(
            Array.isArray(m.toolCalls) && m.toolCalls.length > 0
          );
          if (typeof m.content === "string") {
            lastAssistantText = m.content;
          }
        }
      }
      yield* drainUi();
    }

    yield* drainUi();

    if (finished) return finalResult;

    // Prose mode: only treat it as success when the loop ended with a clean
    // no-tool-call assistant turn. If it ended by exhausting the round budget
    // (last turn still had tool calls), fall through to the failure path so
    // Agent's fallback engages instead of returning stale/empty text.
    if (!finishStepTool && endedWithCleanMessage) {
      const text = lastAssistantText.trim();
      log.info("Compiler finished (prose)", {
        entries: snapshot.length,
        chars: text.length
      });
      yield {
        type: "planning_update",
        node_id: "compiler",
        phase: "compile",
        status: "completed",
        content: "Final answer composed."
      } satisfies PlanningUpdate;
      yield {
        type: "step_result",
        step: { id: "compiler", instructions: this.objective },
        result: text,
        is_task_result: true
      } satisfies StepResult;
      return text;
    }

    log.warn("Compiler exhausted round budget without finishing", {
      rounds: this.maxRounds,
      mode: this.outputSchema ? "structured" : "prose"
    });
    yield {
      type: "planning_update",
      node_id: "compiler",
      phase: "compile",
      status: "failed",
      content: `Compiler exhausted round budget (${this.maxRounds}).`
    } satisfies PlanningUpdate;
    return null;
  }

  /**
   * Render the executed task plan so the compiler knows which `task:<id>`
   * keys to expect and what each task was meant to produce. Returns an
   * empty string when no plan is supplied.
   */
  private formatTaskPlan(): string {
    if (!this.taskPlan || this.taskPlan.tasks.length === 0) return "";

    const lines: string[] = [
      `Plan executed (title: ${this.taskPlan.title}). Each completed task wrote its result to \`task:<id>\`:`
    ];
    for (const task of this.taskPlan.tasks) {
      const deps =
        task.dependsOn && task.dependsOn.length > 0
          ? ` [depends_on: ${task.dependsOn.join(", ")}]`
          : "";
      lines.push(`- task:${task.id}${deps} — ${task.title}`);
      for (const step of task.steps) {
        const instr = step.instructions.replace(/\s+/g, " ").trim();
        const summary = instr.length > 140 ? instr.slice(0, 140) + "…" : instr;
        lines.push(`    • ${step.id}: ${summary}`);
      }
    }
    return lines.join("\n");
  }
}

function isChunk(item: ProviderStreamItem): item is Chunk {
  return (
    "type" in item &&
    (item as unknown as Record<string, unknown>)["type"] === "chunk" &&
    typeof (item as unknown as Record<string, unknown>)["content"] === "string"
  );
}

function isToolCall(item: ProviderStreamItem): item is ToolCall {
  return (
    "name" in item &&
    typeof (item as unknown as Record<string, unknown>)["name"] === "string" &&
    "id" in item
  );
}
