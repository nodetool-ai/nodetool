/**
 * CodeActExecutor — executes a single step with JavaScript code as the action
 * space instead of JSON tool calls (Wang et al., ICML 2024, arXiv:2402.01030).
 *
 * The provider sees exactly one tool, `execute_code`. Each call runs the
 * model's program in the QuickJS sandbox where the step's toolbelt is exposed
 * as `tools.<name>()` functions, a `state` object persists across actions,
 * and `finish(result)` completes the step (host-validated against the step's
 * output schema). The program's outcome — return value, logs, error — is the
 * observation for the next turn.
 *
 * The message contract (`task_update`, `step_result`, `tool_call_update`,
 * `chunk`), memory writes, and failure semantics are byte-compatible with
 * {@link StepExecutor}, so every consumer works unchanged.
 */

import type {
  BaseProvider,
  ProcessingContext,
  Message,
  MessageContent,
  ProviderStreamItem,
  ToolCall
} from "@nodetool-ai/runtime";
import {
  ACTIVE_MODEL_CONTEXT_KEY,
  memoryKeys,
  withAgentSpanGen,
  type ActiveModelSelection
} from "@nodetool-ai/runtime";
import { createLogger } from "@nodetool-ai/config";
import {
  TaskUpdateEvent,
  type Chunk,
  type ProcessingMessage,
  type StepResult,
  type TaskUpdate,
  type ToolCallUpdate
} from "@nodetool-ai/protocol";
import type { Step, Task } from "../types.js";
import { Tool } from "../tools/base-tool.js";
import { getMemoryTools } from "../tools/memory-tools.js";
import { runInSandbox } from "../js-sandbox.js";
import { truncateToolResult } from "../constants.js";
import {
  formatViolations,
  validateAgainstSchema
} from "../utils/json-schema-validate.js";
import { linkAbort } from "../utils/link-abort.js";
import {
  buildToolBridge,
  toolSignature,
  CODEACT_PRELUDE,
  type ToolCallRecord,
  type ToolSearchHit
} from "./tool-api.js";
import { searchTools } from "../tools/tool-search.js";
import { buildCodeActSystemPrompt } from "./prompt.js";

const log = createLogger("nodetool.agents.codeact");

/**
 * Code actions batch several tool calls per turn, so the turn budget is
 * deliberately lower than tool mode's 30.
 */
export const DEFAULT_CODEACT_MAX_ITERATIONS = 20;

export const EXECUTE_CODE_TOOL_NAME = "execute_code";

/**
 * Tools documented in full in the prompt regardless of toolbelt size — the
 * high-traffic set nearly every step reaches for (mirroring the chat
 * runner's resident-toolbelt idea). Everything else is deferred: still
 * callable, but discovered through `searchTools()` first, so a 70-tool belt
 * does not cost 70 signatures of prompt.
 */
export const CODEACT_RESIDENT_TOOL_NAMES: ReadonlySet<string> = new Set([
  // Search family — every discovery entry point stays top level.
  "web_search",
  "search_nodes",
  "run_search",
  "google_news",
  "google_images",
  "asset_search",
  "grep",
  "glob",
  // Web + retrieval.
  "browser",
  "http_request",
  "download_file",
  // Workspace files.
  "read_file",
  "write_file",
  "list_directory",
  // Shared agent memory.
  "memory_list",
  "memory_read",
  "memory_write",
  // Delegation.
  "run_subtask"
]);

/**
 * Toolbelts at or below this size skip the split entirely — deferring three
 * tools saves nothing and costs a discovery round.
 */
export const CODEACT_DEFER_THRESHOLD = 16;

export interface CodeActExecutorOptions {
  task: Task;
  step: Step;
  context: ProcessingContext;
  provider: BaseProvider;
  model: string;
  tools?: Tool[];
  /** Preamble layered before the CodeAct contract; cannot override it. */
  systemPrompt?: string;
  maxIterations?: number;
  maxTokens?: number;
  useFinishTask?: boolean;
  threadId?: string;
  upstreamMemoryKeys?: string[];
  signal?: AbortSignal;
  /** Wall-clock limit per code action. Defaults to the sandbox's 30 s. */
  actionTimeoutMs?: number;
  /** Tool calls one action may consume. Default 50. */
  maxToolCallsPerAction?: number;
  /**
   * Tools documented in full in the prompt. Defaults to
   * {@link CODEACT_RESIDENT_TOOL_NAMES}; the rest of the toolbelt is
   * deferred behind `searchTools()` once the belt exceeds
   * {@link CODEACT_DEFER_THRESHOLD}.
   */
  residentToolNames?: Iterable<string>;
}

/** Observation envelope returned to the model after each code action. */
interface ActionObservation {
  ok: boolean;
  result?: unknown;
  error?: string;
  stack?: string;
  logs?: string[];
  finished?: boolean;
  toolCalls: number;
}

export class CodeActExecutor {
  private readonly task: Task;
  private readonly step: Step;
  private readonly context: ProcessingContext;
  private readonly provider: BaseProvider;
  private readonly model: string;
  private readonly tools: Tool[];
  private readonly systemPrompt: string;
  private readonly maxIterations: number;
  private readonly maxTokens?: number;
  private readonly useFinishTask: boolean;
  private readonly threadId?: string;
  private readonly upstreamMemoryKeys: string[];
  private readonly signal?: AbortSignal;
  private readonly actionTimeoutMs?: number;
  private readonly maxToolCallsPerAction?: number;
  private readonly resultSchema: Record<string, unknown> | null;
  private readonly residentTools: Tool[];
  private readonly deferredTools: Tool[];
  /** Persists across actions within the step (CaveAgent-style runtime state). */
  private readonly state: Record<string, unknown> = {};
  private result: unknown = null;
  private actionCount = 0;

  constructor(opts: CodeActExecutorOptions) {
    this.task = opts.task;
    this.step = opts.step;
    this.context = opts.context;
    this.provider = opts.provider;
    this.model = opts.model;
    this.tools = opts.tools ? [...opts.tools] : [];
    this.maxIterations = opts.maxIterations ?? DEFAULT_CODEACT_MAX_ITERATIONS;
    this.maxTokens = opts.maxTokens;
    this.useFinishTask = opts.useFinishTask ?? false;
    this.threadId = opts.threadId;
    this.upstreamMemoryKeys = opts.upstreamMemoryKeys ?? [];
    this.signal = opts.signal;
    this.actionTimeoutMs = opts.actionTimeoutMs;
    this.maxToolCallsPerAction = opts.maxToolCallsPerAction;

    // Memory tools ride in the toolbelt as functions like everything else.
    const existing = new Set(this.tools.map((t) => t.name));
    for (const memoryTool of getMemoryTools()) {
      if (!existing.has(memoryTool.name)) this.tools.push(memoryTool);
    }

    // Progressive disclosure: resident tools are documented in full; the
    // long tail is name-only in the prompt and discovered via searchTools().
    // Every tool stays callable either way — the split spends prompt tokens,
    // not capability.
    const residentNames = new Set(
      opts.residentToolNames ?? CODEACT_RESIDENT_TOOL_NAMES
    );
    if (this.tools.length <= CODEACT_DEFER_THRESHOLD) {
      this.residentTools = [...this.tools];
      this.deferredTools = [];
    } else {
      this.residentTools = this.tools.filter((t) => residentNames.has(t.name));
      this.deferredTools = this.tools.filter((t) => !residentNames.has(t.name));
    }

    this.resultSchema = this.loadResultSchema();
    this.systemPrompt = buildCodeActSystemPrompt({
      tools: this.residentTools,
      deferredTools: this.deferredTools,
      resultSchema: this.resultSchema,
      preamble: opts.systemPrompt
    });
  }

  getResult(): unknown {
    return this.result;
  }

  async *execute(): AsyncGenerator<ProcessingMessage> {
    yield* withAgentSpanGen(
      "step",
      {
        provider: this.provider.provider,
        model: this.model,
        task: this.step.instructions,
        toolsCount: this.tools.length,
        extra: {
          "agent.step.id": this.step.id,
          "agent.task.id": this.task.id,
          "agent.step.mode": "codeact"
        }
      },
      () => this._executeImpl()
    );
  }

  private async *_executeImpl(): AsyncGenerator<ProcessingMessage> {
    log.debug("CodeAct step started", {
      stepId: this.step.id,
      instructions: this.step.instructions.slice(0, 60)
    });

    this.context.set(ACTIVE_MODEL_CONTEXT_KEY, {
      provider: this.provider.provider,
      model: this.model
    } satisfies ActiveModelSelection);

    const history: Message[] = [
      { role: "system", content: this.systemPrompt },
      { role: "user", content: this.buildUserMessage() }
    ];

    this.step.startTime = Date.now();
    yield this.taskUpdate(TaskUpdateEvent.StepStarted);

    const abort = new AbortController();
    const unlinkAbort = linkAbort(abort, this.signal);
    const uiEvents: ProcessingMessage[] = [];
    let lastAssistant: Message | null = null;
    let generationError: Error | null = null;
    let finishedResult: { value: unknown } | null = null;
    let bridgedCallSeq = 0;

    const toolsByName = new Map(this.tools.map((t) => [t.name, t]));
    const onToolCall = (record: ToolCallRecord): void => {
      bridgedCallSeq++;
      const tool = toolsByName.get(record.name);
      uiEvents.push({
        type: "tool_call_update",
        node_id: this.step.id,
        tool_call_id: `codeact_${bridgedCallSeq}`,
        name: record.name,
        args: record.args,
        message: tool
          ? Tool.resolveMessage(tool, record.args)
          : `Running ${record.name}`
      } satisfies ToolCallUpdate);
    };

    const bridge = buildToolBridge({
      tools: this.tools,
      context: this.context,
      onToolCall,
      maxToolCallsPerAction: this.maxToolCallsPerAction
    });

    const finishBridge = async (
      resultJson: unknown
    ): Promise<{ ok: true } | { ok: false; error: string }> => {
      let payload: unknown = null;
      if (typeof resultJson === "string") {
        try {
          payload = JSON.parse(resultJson);
        } catch {
          return { ok: false, error: "finish: result must be JSON-serializable" };
        }
      }
      if (payload === null || payload === undefined) {
        return { ok: false, error: "finish: missing result" };
      }
      if (this.resultSchema) {
        const violations = validateAgainstSchema(payload, this.resultSchema);
        if (violations.length > 0) {
          return {
            ok: false,
            error: `Result validation failed: ${formatViolations(violations)}`
          };
        }
      }
      finishedResult = { value: payload };
      return { ok: true };
    };

    // Discovery over the FULL toolbelt (resident hits included, so a
    // redundant query still answers instead of coming back empty).
    const searchCatalog = this.tools.map((t) => ({
      name: t.name,
      description: t.description
    }));
    const searchToolsBridge = async (
      query: unknown,
      maxResults: unknown
    ): Promise<
      { ok: true; result: ToolSearchHit[] } | { ok: false; error: string }
    > => {
      try {
        const limit =
          typeof maxResults === "number" && Number.isFinite(maxResults)
            ? Math.max(1, Math.min(25, Math.floor(maxResults)))
            : 5;
        const byName = new Map(this.tools.map((t) => [t.name, t]));
        const hits = searchTools(searchCatalog, String(query ?? ""), limit).map(
          (entry): ToolSearchHit => {
            const tool = byName.get(entry.name) as Tool;
            return {
              name: entry.name,
              signature: toolSignature(tool),
              description: tool.description
            };
          }
        );
        return { ok: true, result: hits };
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : String(e) };
      }
    };

    const executeAction = async (
      args: Record<string, unknown>
    ): Promise<string | MessageContent[]> => {
      const code = typeof args?.["code"] === "string" ? args["code"] : "";
      if (!code.trim()) {
        return JSON.stringify({
          ok: false,
          error: "execute_code: `code` must be a non-empty string",
          toolCalls: 0
        } satisfies ActionObservation);
      }
      this.actionCount++;
      bridge.resetActionBudget();

      const outcome = await runInSandbox({
        code: `${CODEACT_PRELUDE}\n${code}`,
        context: this.context,
        timeoutMs: this.actionTimeoutMs,
        signal: this.signal,
        globals: {
          ...bridge.globals,
          __finish: finishBridge,
          __searchTools: searchToolsBridge,
          state: this.state
        }
      });

      const observation: ActionObservation = {
        ok: outcome.success,
        toolCalls: bridge.callCount()
      };
      if (outcome.success) {
        if (outcome.result !== undefined) observation.result = outcome.result;
      } else {
        observation.error = outcome.error;
        if (outcome.stack) observation.stack = outcome.stack;
      }
      if (outcome.logs && outcome.logs.length > 0) {
        observation.logs = outcome.logs;
      }

      // A validated finish() completes the step even when the action crashed
      // after recording it — the model cannot retract a validated result.
      if (finishedResult) {
        observation.finished = true;
        this.storeCompletionResult(finishedResult.value);
        uiEvents.push(this.taskUpdate(TaskUpdateEvent.StepCompleted));
        uiEvents.push(this.stepResult(finishedResult.value));
        abort.abort();
      }

      return truncateToolResult(JSON.stringify(observation));
    };

    const providerTools = [
      {
        name: EXECUTE_CODE_TOOL_NAME,
        description:
          "Execute a JavaScript action in the sandbox. The observation " +
          "(return value, logs, error) is the tool result.",
        inputSchema: {
          type: "object",
          properties: {
            code: {
              type: "string",
              description: "The JavaScript program to run."
            }
          },
          required: ["code"],
          additionalProperties: false
        },
        execute: (args: Record<string, unknown>) => executeAction(args)
      }
    ];

    const drainUi = function* (): Generator<ProcessingMessage> {
      while (uiEvents.length > 0) yield uiEvents.shift() as ProcessingMessage;
    };

    try {
      const stream = this.provider.generateLoop({
        messages: history,
        model: this.model,
        tools: providerTools,
        threadId: this.threadId,
        maxIterations: this.maxIterations,
        maxTokens: this.maxTokens,
        sequentialTools: true,
        signal: abort.signal
      });

      for await (const item of stream) {
        if (isToolCall(item)) {
          yield {
            type: "tool_call_update",
            node_id: this.step.id,
            tool_call_id: item.id,
            name: item.name,
            args: item.args,
            message: "Executing code action"
          } satisfies ToolCallUpdate;
          yield* drainUi();
          continue;
        }
        if (isChunk(item)) {
          if (typeof item.content === "string" && item.content.length > 0) {
            yield {
              type: "chunk",
              node_id: this.step.id,
              content: item.content,
              done: false
            } satisfies Chunk;
          }
          yield* drainUi();
          continue;
        }
        if ("type" in item && (item as { type?: string }).type === "message") {
          const m = (item as { message?: Message }).message;
          if (m && m.role === "assistant") lastAssistant = m;
        }
        yield* drainUi();
      }
    } catch (e) {
      generationError = e instanceof Error ? e : new Error(String(e));
      log.error("CodeAct step generation failed", {
        stepId: this.step.id,
        error: generationError.message
      });
    } finally {
      unlinkAbort();
    }

    yield* drainUi();

    // Unschema'd steps also finalize from a no-tool-call assistant message —
    // the same prose-mode rule StepExecutor has.
    if (
      !this.step.completed &&
      this.resultSchema === null &&
      lastAssistant &&
      (!lastAssistant.toolCalls || lastAssistant.toolCalls.length === 0) &&
      lastAssistant.content !== null &&
      lastAssistant.content !== undefined
    ) {
      this.storeCompletionResult(lastAssistant.content);
      yield this.taskUpdate(TaskUpdateEvent.StepCompleted);
      yield this.stepResult(lastAssistant.content);
    }

    if (!this.step.completed) {
      this.step.endTime = Date.now();
      const message = generationError
        ? `Step failed: ${generationError.message}`
        : `Step failed: exceeded ${this.maxIterations} iterations without completion`;
      this.step.failed = true;
      this.step.error = message;
      const errorResult = { error: message };
      this.result = errorResult;
      this.context.memory.set({
        key: memoryKeys.step(this.step.id),
        kind: "step_result",
        value: errorResult,
        source: this.step.id,
        title: `Failed: ${this.step.instructions.slice(0, 60)}`
      });
      yield this.taskUpdate(TaskUpdateEvent.StepFailed);
      yield {
        type: "step_result",
        step: { id: this.step.id, instructions: this.step.instructions },
        result: errorResult,
        error: message,
        is_task_result: this.useFinishTask
      } satisfies StepResult;
    }
  }

  private loadResultSchema(): Record<string, unknown> | null {
    if (!this.step.outputSchema) return null;
    try {
      const parsed = JSON.parse(this.step.outputSchema) as unknown;
      if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
      return null;
    } catch {
      log.warn("Ignoring unparseable outputSchema", { stepId: this.step.id });
      return null;
    }
  }

  private buildUserMessage(): string {
    const parts: string[] = [this.step.instructions];
    const keys = [
      ...this.step.dependsOn.map((id) => memoryKeys.step(id)),
      ...this.upstreamMemoryKeys
    ];
    if (keys.length > 0) {
      parts.push(
        `Required upstream context — read these before acting (via ` +
          `\`await tools.memory_read({keys: [...]})\`):\n` +
          keys.map((k) => `- ${k}`).join("\n")
      );
    }
    return parts.join("\n\n");
  }

  private storeCompletionResult(value: unknown): void {
    this.step.completed = true;
    this.step.endTime = Date.now();
    this.context.memory.set({
      key: memoryKeys.step(this.step.id),
      kind: "step_result",
      value,
      source: this.step.id,
      title: this.step.instructions.slice(0, 80)
    });
    if (this.useFinishTask) {
      this.context.memory.set({
        key: memoryKeys.task(this.task.id),
        kind: "task_result",
        value,
        source: this.task.id,
        title: this.task.title
      });
    }
    this.result = value;
  }

  private taskUpdate(event: TaskUpdateEvent): TaskUpdate {
    return {
      type: "task_update",
      node_id: this.step.id,
      task: { id: this.task.id, title: this.task.title },
      step: { id: this.step.id, instructions: this.step.instructions },
      event
    };
  }

  private stepResult(result: unknown): StepResult {
    return {
      type: "step_result",
      step: { id: this.step.id, instructions: this.step.instructions },
      result,
      is_task_result: this.useFinishTask
    };
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
