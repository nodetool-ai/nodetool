/**
 * The generic provider-driving tool loop.
 *
 * A model is handed a set of {@link HeadlessTool}s and an objective, each tool
 * it calls runs against whatever in-memory surface the tools close over, and
 * the result is fed back — until the model stops calling tools or the turn cap
 * trips. Every call is recorded, so the caller can score the transcript
 * (`runToolLoopEval`) or read the surface's final state (the app-build Author
 * stage).
 *
 * The loop knows nothing about scoring, expectations, or app documents: it
 * dispatches tools, counts calls, and reports what happened.
 */

import type { BaseProvider, Message, TurnBudget } from "@nodetool-ai/runtime";
import { zodToJsonSchema } from "@nodetool-ai/runtime";
import type { HeadlessTool } from "../evals/tool-loop-bridge.js";
import { isString } from "../utils/type-guards.js";

/** Turn cap when the caller names none. */
export const DEFAULT_MAX_ITERATIONS = 12;

/** One tool call the model made, with its result and whether it errored. */
export interface ToolLoopCallRecord {
  name: string;
  args: Record<string, unknown>;
  result: unknown;
  isError: boolean;
}

export interface RunToolLoopOptions {
  provider: BaseProvider;
  model: string;
  tools: HeadlessTool[];
  systemPrompt: string;
  userPrompt: string;
  /** Turn cap — max tool-calling rounds. Defaults to {@link DEFAULT_MAX_ITERATIONS}. */
  maxIterations?: number;
  signal?: AbortSignal;
  /**
   * Spend admission, consulted before every model turn. A refusal ends the
   * loop without making the call, so the caller sees a short transcript rather
   * than an overrun.
   */
  turnBudget?: TurnBudget;
  /** Called after each tool call resolves, for progress display. */
  onToolCall?: (record: ToolLoopCallRecord) => void;
  /**
   * Stop the loop as soon as this returns true for a completed call — how a
   * termination tool (`ui_app_finish`) ends the run without waiting for the
   * model to fall silent.
   */
  stopOn?: (record: ToolLoopCallRecord) => boolean;
}

export interface ToolLoopRun {
  /** Every tool call in order. */
  calls: ToolLoopCallRecord[];
  /** Call counts by tool name. */
  countsByName: Record<string, number>;
  totalCalls: number;
  durationMs: number;
  costUsd: number;
  /** The loop ran to a natural stop / cap without a fatal provider error. */
  completed: boolean;
  /** Message of the provider error that ended the loop, when one did. */
  error?: string;
}

/**
 * Drive `provider.generateLoop` over `tools` until the model stops or the turn
 * cap trips. A provider failure is captured, not thrown: the caller still gets
 * the calls made up to that point.
 */
export async function runToolLoop(
  opts: RunToolLoopOptions
): Promise<ToolLoopRun> {
  const countsByName: Record<string, number> = {};
  const calls: ToolLoopCallRecord[] = [];
  const costBefore = opts.provider.getTotalCost();
  const startedAt = Date.now();
  const stop = new AbortController();
  const signals = [opts.signal, stop.signal].filter(
    (s): s is AbortSignal => s !== undefined
  );
  const signal =
    signals.length > 1 ? AbortSignal.any(signals) : (signals[0] ?? undefined);

  // Provider tools carry a self-contained `execute`, so `generateLoop`
  // dispatches directly to the surface and feeds the stringified result back to
  // the model — exactly how the graph planner drives its tools.
  const providerTools = opts.tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    inputSchema: zodToJsonSchema(tool.parameters),
    execute: async (args: Record<string, unknown>): Promise<string> => {
      countsByName[tool.name] = (countsByName[tool.name] ?? 0) + 1;
      let result: unknown;
      let isError = false;
      try {
        result = await tool.execute(args ?? {});
      } catch (e) {
        isError = true;
        result = { error: e instanceof Error ? e.message : String(e) };
      }
      const record: ToolLoopCallRecord = {
        name: tool.name,
        args: args ?? {},
        result,
        isError
      };
      calls.push(record);
      opts.onToolCall?.(record);
      if (opts.stopOn?.(record)) stop.abort();
      return isString(result) ? result : JSON.stringify(result);
    }
  }));

  const messages: Message[] = [
    { role: "system", content: opts.systemPrompt },
    { role: "user", content: opts.userPrompt }
  ];

  let error: string | undefined;
  try {
    const loopArgs: Parameters<BaseProvider["generateLoop"]>[0] = {
      messages,
      model: opts.model,
      tools: providerTools,
      // Tools mutate shared state and read it back, so calls must be serialized.
      sequentialTools: true,
      maxIterations: opts.maxIterations ?? DEFAULT_MAX_ITERATIONS,
      signal
    };
    if (opts.turnBudget) loopArgs.turnBudget = opts.turnBudget;
    const stream = opts.provider.generateLoop(loopArgs);
    // Drain the stream; side effects (tool execution, result feedback) happen
    // inside `generateLoop`.
    for await (const _item of stream) {
      if (signal?.aborted) break;
    }
  } catch (e) {
    // A loop the caller stopped on purpose is a normal end, not a failure.
    if (!stop.signal.aborted) {
      error = e instanceof Error ? e.message : String(e);
    }
  }

  return {
    calls,
    countsByName,
    totalCalls: calls.length,
    durationMs: Date.now() - startedAt,
    costUsd: opts.provider.getTotalCost() - costBefore,
    completed: error === undefined,
    error
  };
}
