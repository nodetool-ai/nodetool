/**
 * Sub-agent core — the one place that knows how to spawn, stream, and settle
 * a child agent.
 *
 * Before this module, every spawn site hand-rolled the same machinery:
 * `run_subtask` and `run_search` each carried a depth guard, a context copy,
 * a single-step Task, a `CodeActExecutor`, event tagging, forwarding, and
 * result/error extraction. Copies of one concept meant every fix (the
 * nested-`{error}` detection, the broken-forwarder guard) had to land in each
 * of them — or didn't.
 *
 * The concept, stated once: a sub-agent is an async generator of
 * `ProcessingMessage` events with a settled outcome as its return value.
 * CodeAct is the default producer ({@link runSubAgent}), but any generator
 * with that shape — an `authorGraph()` run, a future reviewer or researcher —
 * streams through the same pipe ({@link forwardSubAgentStream}) and nests in
 * the UI the same way (`parent_tool_call_id` + `subtask_depth`).
 *
 * Building blocks layered on the core:
 *
 * - {@link runSubAgent} — run one CodeAct child loop; yields its events,
 *   returns a {@link SubAgentOutcome}. Structured results via `outputSchema`
 *   (the child finalizes through `finish()`), prose otherwise (the final
 *   assistant message is the result).
 * - {@link forwardSubAgentStream} — drive any sub-agent generator: tag each
 *   event for UI nesting, forward it without letting a broken forwarder kill
 *   the child, honor an abort signal between events, hand back the outcome.
 * - {@link enterSubAgentDepth} — the shared recursion gate over
 *   {@link SUBTASK_DEPTH_KEY}.
 * - {@link SubAgentTool} — base class for tools that expose a sub-agent to a
 *   parent model. A concrete tool declares its schema, how params become
 *   child instructions, and which parent tools the child inherits; the base
 *   class owns everything else. `run_subtask` and `run_search` are ~40-line
 *   subclasses; a new delegation tool should be too.
 */

import { randomUUID } from "node:crypto";
import type {
  BaseProvider,
  ProcessingContext,
  TurnBudget
} from "@nodetool-ai/runtime";
import type { ProcessingMessage, StepResult } from "@nodetool-ai/protocol";
import { CodeActExecutor } from "./codeact/codeact-executor.js";
import { Tool } from "./tools/base-tool.js";
import {
  SUBTASK_DEPTH_KEY,
  TOOL_CALL_ID_FIELD
} from "./tools/subtask-fields.js";
import type { Step, Task } from "./types.js";
import { isString } from "./utils/type-guards.js";

/** Forwards child agent events upward (typically to the websocket sender). */
export type ForwardMessage = (msg: ProcessingMessage) => Promise<void> | void;

/** How a sub-agent run settled. */
export type SubAgentOutcome =
  | { ok: true; result: unknown }
  | { ok: false; error: string };

export interface SubAgentRunOptions {
  /**
   * Context the child runs in. Callers that need recursion accounting copy
   * the parent context and bump the depth first — see
   * {@link enterSubAgentDepth}; callers that run at the parent's own level
   * pass the context as-is.
   */
  context: ProcessingContext;
  provider: BaseProvider;
  model: string;
  tools: Tool[];
  /** Self-contained instructions — the child does not see the parent's history. */
  instructions: string;
  /** Title for the wrapping single-step task (UI cards, logs). */
  title?: string;
  /** Stable id for the step and task; defaults to a random UUID. */
  id?: string;
  /** JSON schema → structured result via `finish()`; omit for prose mode. */
  outputSchema?: Record<string, unknown>;
  /** Preamble layered before the CodeAct contract; cannot override it. */
  systemPrompt?: string;
  maxIterations?: number;
  maxTokens?: number;
  /** Spend admission, consulted before every provider turn of the child. */
  turnBudget?: TurnBudget;
  threadId?: string;
  /**
   * Sandbox package specifiers the child's actions may import. Defaults to
   * none — a caller that authors with a pack (the graph DSL) names it here.
   */
  sandboxPackages?: readonly string[];
  signal?: AbortSignal;
}

/**
 * Settle a `step_result` into an outcome.
 *
 * The executor reports failures through the protocol-level `error` field.
 * In schema-free mode, a result object with a string `error` property is also
 * treated as a legacy failure shape (prose mode normally returns text). With
 * a schema, the object shape was explicitly requested and passes through.
 */
export function settleStepResult(
  sr: StepResult,
  opts: { hasOutputSchema?: boolean } = {}
): SubAgentOutcome | null {
  if (sr.error) return { ok: false, error: sr.error };
  const result = sr.result;
  if (result === null || result === undefined) return null;
  if (typeof result === "object" && !Array.isArray(result)) {
    const record = result as Record<string, unknown>;
    if (isString(record.error) && !opts.hasOutputSchema) {
      return { ok: false, error: record.error };
    }
  }
  return { ok: true, result };
}

/**
 * Run one CodeAct sub-agent: a fresh child loop over `tools`, driven by
 * `instructions`, yielding every child event and returning how it settled.
 *
 * The generator never throws for run failures — provider errors, iteration
 * caps, and failed steps all come back as `{ok: false, error}` so callers
 * have one settlement path.
 */
export async function* runSubAgent(
  opts: SubAgentRunOptions
): AsyncGenerator<ProcessingMessage, SubAgentOutcome> {
  const id = opts.id ?? randomUUID();
  const step: Step = {
    id: `${id}`,
    instructions: opts.instructions,
    completed: false,
    dependsOn: [],
    logs: [],
    outputSchema: opts.outputSchema
      ? JSON.stringify(opts.outputSchema)
      : undefined
  };
  const task: Task = {
    id: `task_${id}`,
    title: opts.title ?? "subtask",
    steps: [step]
  };

  const executor = new CodeActExecutor({
    task,
    step,
    context: opts.context,
    provider: opts.provider,
    model: opts.model,
    tools: opts.tools,
    systemPrompt: opts.systemPrompt,
    maxIterations: opts.maxIterations,
    maxTokens: opts.maxTokens,
    turnBudget: opts.turnBudget,
    threadId: opts.threadId,
    sandboxPackages: opts.sandboxPackages,
    // Without the run's signal a cancelled parent leaves its children driving
    // provider calls to completion in the background.
    signal: opts.signal
  });

  let outcome: SubAgentOutcome | null = null;
  try {
    for await (const msg of executor.execute()) {
      yield msg;
      if (msg.type === "step_result") {
        const settled = settleStepResult(msg as StepResult, {
          hasOutputSchema: Boolean(opts.outputSchema)
        });
        if (settled) outcome = settled;
      }
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }

  // A child that settled without a value is not a failure — callers decide
  // whether a null result is an error (`run_subtask` reports it as
  // `subtask_no_result`).
  return outcome ?? { ok: true, result: null };
}

export interface SubAgentStreamTag {
  /** LLM tool_call_id of the spawning call — lets the UI nest child cards. */
  parentToolCallId?: string | null;
  /** Child recursion depth; omitted from events when not provided. */
  depth?: number;
}

/** The nesting fields, under the wire names a tagged child event carries. */
interface SubAgentMessageTags {
  parent_tool_call_id?: string | null;
  subtask_depth?: number;
}

/**
 * Shallow-clone a child event with the nesting tags the renderer reads.
 * Returns the message unchanged when no tag applies — the original object is
 * shared with whoever emitted it inside the child, so it is never mutated.
 */
export function tagSubAgentMessage(
  msg: ProcessingMessage,
  tag: SubAgentStreamTag
): ProcessingMessage {
  if (tag.parentToolCallId === undefined && tag.depth === undefined) {
    return msg;
  }
  // The two tag keys ride on the copy as extra fields; every message type in
  // the union transports them, and the copy keeps the emitter's object clean.
  const tags: SubAgentMessageTags = {};
  if (tag.parentToolCallId !== undefined) {
    tags.parent_tool_call_id = tag.parentToolCallId;
  }
  if (tag.depth !== undefined) {
    tags.subtask_depth = tag.depth;
  }
  return { ...msg, ...tags };
}

export interface ForwardSubAgentStreamOptions extends SubAgentStreamTag {
  /** Receives each tagged event. Failures are logged, never fatal. */
  forward?: ForwardMessage;
  /**
   * Interrupts pending event reads: once aborted, the generator is closed and
   * the stream reports `aborted` instead of a value. Sub-agents whose executor
   * already holds the signal don't need this — pass it when the producer's own
   * abort only stops its LLM loop and an in-flight round would otherwise keep
   * the turn alive (the graph planner's case).
   */
  signal?: AbortSignal;
  /** Name used in the broken-forwarder warning. Defaults to "subagent". */
  label?: string;
}

type SubAgentNext<R> =
  | { aborted: false; next: IteratorResult<ProcessingMessage, R> }
  | { aborted: true };

async function nextSubAgentEvent<R>(
  gen: AsyncGenerator<ProcessingMessage, R>,
  signal?: AbortSignal
): Promise<SubAgentNext<R>> {
  if (!signal) {
    return { aborted: false, next: await gen.next() };
  }
  if (signal.aborted) {
    return { aborted: true };
  }

  let onAbort: (() => void) | undefined;
  const aborted = new Promise<{ aborted: true }>((resolve) => {
    onAbort = () => resolve({ aborted: true });
    signal.addEventListener("abort", onAbort, { once: true });
  });

  try {
    return await Promise.race([
      gen.next().then((next) => ({ aborted: false as const, next })),
      aborted
    ]);
  } finally {
    if (onAbort) {
      signal.removeEventListener("abort", onAbort);
    }
  }
}

function closeSubAgentGenerator<R>(
  gen: AsyncGenerator<ProcessingMessage, R>
): void {
  void gen.return(null as never).catch(() => {
    // The caller has settled after cancellation; producer cleanup is best-effort.
  });
}

/**
 * Drive any sub-agent generator to completion: tag each event, forward it,
 * and hand back the generator's return value.
 *
 * A broken forwarder must not kill the child — the parent model still gets
 * the result via the tool return — so forward errors are logged and the
 * stream continues.
 */
export async function forwardSubAgentStream<R>(
  gen: AsyncGenerator<ProcessingMessage, R>,
  opts: ForwardSubAgentStreamOptions
): Promise<{ aborted: boolean; value: R | null }> {
  let read = await nextSubAgentEvent(gen, opts.signal);
  if (read.aborted) {
    closeSubAgentGenerator(gen);
    return { aborted: true, value: null };
  }

  let next = read.next;
  while (!next.done) {
    if (opts.signal?.aborted) {
      closeSubAgentGenerator(gen);
      return { aborted: true, value: null };
    }
    const tagged = tagSubAgentMessage(next.value, opts);
    if (opts.forward) {
      try {
        await opts.forward(tagged);
      } catch (forwardErr) {
        // eslint-disable-next-line no-console
        console.warn(
          `${opts.label ?? "subagent"}: failed to forward child event`,
          forwardErr
        );
      }
    }
    read = await nextSubAgentEvent(gen, opts.signal);
    if (read.aborted) {
      closeSubAgentGenerator(gen);
      return { aborted: true, value: null };
    }
    next = read.next;
  }
  if (opts.signal?.aborted) {
    return { aborted: true, value: null };
  }
  return { aborted: false, value: next.value };
}

export const DEFAULT_SUBAGENT_MAX_DEPTH = 3;

export type SubAgentDepthGate =
  | { ok: true; childCtx: ProcessingContext; depth: number }
  | { ok: false; refusal: Record<string, unknown> };

/**
 * The shared recursion gate. Reads the current depth off the context, refuses
 * past `maxDepth` with the standard error object, and otherwise returns a
 * copied context with the depth bumped — the copy preserves `_onMessage`
 * (telemetry listener) and clones variables so depth mutations stay local.
 */
export function enterSubAgentDepth(
  context: ProcessingContext,
  maxDepth: number,
  noun = "subtask"
): SubAgentDepthGate {
  const currentDepth = context.get<number>(SUBTASK_DEPTH_KEY) ?? 0;
  if (currentDepth >= maxDepth) {
    return {
      ok: false,
      refusal: {
        error: "max_recursion_depth_reached",
        depth: currentDepth,
        max_depth: maxDepth,
        message:
          `Cannot spawn another ${noun} — recursion depth limit reached. ` +
          "Answer directly using the tools already available at this level."
      }
    };
  }
  const childCtx = context.copy();
  const depth = currentDepth + 1;
  childCtx.set(SUBTASK_DEPTH_KEY, depth);
  return { ok: true, childCtx, depth };
}

export interface SubAgentToolRuntime {
  provider: BaseProvider;
  model: string;
  /**
   * Snapshot of the parent's toolset. Called lazily on each invocation so a
   * dynamically-mutated toolbelt is observed.
   */
  parentTools: () => Tool[];
  /** Forwards tagged child events upward to the websocket sender. */
  forwardMessage: ForwardMessage;
  /** Maximum recursion depth. Defaults to {@link DEFAULT_SUBAGENT_MAX_DEPTH}. */
  maxDepth?: number;
  /** Max LLM iterations per child loop. */
  maxIterations?: number;
}

/** What one invocation of a {@link SubAgentTool} should run. */
export interface SubAgentToolRun {
  /** Self-contained instructions for the child loop. */
  instructions: string;
  /** Task title (UI cards, logs). */
  title: string;
  /** JSON schema → structured child result; omit for prose. */
  outputSchema?: Record<string, unknown>;
  systemPrompt?: string;
  /** Per-run iteration budget; defaults to the runtime's. */
  maxIterations?: number;
  /** Error code returned when the child fails, e.g. "subtask_failed". */
  errorCode: string;
  /** Error code returned when the child settles without a result. */
  noResultCode: string;
  /** Message accompanying {@link noResultCode}. */
  noResultMessage: string;
  /** Extra fields merged into both error payloads (description, query, …). */
  errorExtras?: Record<string, unknown>;
}

/**
 * Base class for tools that expose a sub-agent as a building block the parent
 * model can invoke. Subclasses declare the tool surface (name, description,
 * schema), translate params into a {@link SubAgentToolRun}, and pick the
 * child's toolset from the parent snapshot; the base class owns the depth
 * gate, the child context, streaming, tagging, and settlement.
 */
export abstract class SubAgentTool extends Tool {
  readonly needsToolCallId = true;

  /** Noun used in the depth-refusal message ("subtask", "search", …). */
  protected readonly depthNoun: string = "subtask";

  protected readonly provider: BaseProvider;
  protected readonly model: string;
  protected readonly parentToolsFn: () => Tool[];
  protected readonly forward: ForwardMessage;
  protected readonly maxDepth: number;
  protected readonly maxIterations?: number;

  protected constructor(runtime: SubAgentToolRuntime) {
    super();
    this.provider = runtime.provider;
    this.model = runtime.model;
    this.parentToolsFn = runtime.parentTools;
    this.forward = runtime.forwardMessage;
    this.maxDepth = runtime.maxDepth ?? DEFAULT_SUBAGENT_MAX_DEPTH;
    this.maxIterations = runtime.maxIterations;
  }

  /**
   * Translate validated params into the run, or refuse with an error object
   * (returned to the model verbatim).
   */
  protected abstract buildRun(
    params: Record<string, unknown>
  ): SubAgentToolRun | { error: string; message: string };

  /** Pick the child's toolset from the parent snapshot. */
  protected abstract buildChildToolset(parentTools: Tool[]): Tool[];

  async process(
    context: ProcessingContext,
    params: Record<string, unknown>
  ): Promise<unknown> {
    const gate = enterSubAgentDepth(context, this.maxDepth, this.depthNoun);
    if (!gate.ok) return gate.refusal;

    const run = this.buildRun(params);
    if ("error" in run) return run;

    const parentToolCallId =
      isString(params[TOOL_CALL_ID_FIELD])
        ? (params[TOOL_CALL_ID_FIELD] as string)
        : null;

    const gen = runSubAgent({
      context: gate.childCtx,
      provider: this.provider,
      model: this.model,
      tools: this.buildChildToolset(this.parentToolsFn()),
      instructions: run.instructions,
      title: run.title,
      outputSchema: run.outputSchema,
      systemPrompt: run.systemPrompt,
      maxIterations: run.maxIterations ?? this.maxIterations,
      signal: context.signal
    });

    const { value: outcome } = await forwardSubAgentStream(gen, {
      forward: this.forward,
      parentToolCallId,
      depth: gate.depth,
      label: this.name
    });

    if (!outcome || !outcome.ok) {
      return {
        error: run.errorCode,
        ...run.errorExtras,
        message: outcome ? outcome.error : "Sub-agent stream ended early."
      };
    }
    if (outcome.result === null || outcome.result === undefined) {
      return {
        error: run.noResultCode,
        ...run.errorExtras,
        message: run.noResultMessage
      };
    }
    return outcome.result;
  }
}
