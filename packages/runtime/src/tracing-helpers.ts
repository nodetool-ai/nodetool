/**
 * Helpers for wrapping agent / workflow / node code in OpenTelemetry spans.
 *
 * All helpers degrade gracefully when telemetry is disabled (no tracer
 * configured) — the wrapped function runs as if no span existed, with
 * essentially zero overhead.
 *
 * # Span hierarchy
 *
 *   workflow.run                     ← `withWorkflowSpan`
 *     node.process (per node)        ← `withNodeSpan`
 *       llm.chat / llm.stream        ← BaseProvider (existing)
 *
 *   agent.execute                    ← `withAgentSpan({ kind: "execute" })`
 *     agent.plan                     ← `withAgentSpan({ kind: "plan" })`
 *     agent.step                     ← `withAgentSpan({ kind: "step" })`
 *       llm.chat / llm.stream        ← BaseProvider (existing)
 *
 * Child spans nest automatically because OTel's `startActiveSpan` makes the
 * span active in AsyncLocalStorage for the duration of the callback.
 */

import { importNodeBuiltin } from "@nodetool-ai/config";

// `node:async_hooks` is Node-only. In browser/Edge we fall back to a
// simple mutable holder — the usage-tracking API loses concurrency
// safety there, but is otherwise functional.
const _asyncHooks = await importNodeBuiltin<typeof import("node:async_hooks")>(
  "node:async_hooks"
);
class FallbackStore<T> {
  private _value: T | undefined;
  getStore(): T | undefined {
    return this._value;
  }
  run<R>(value: T, callback: () => R): R {
    const prev = this._value;
    this._value = value;
    try {
      return callback();
    } finally {
      this._value = prev;
    }
  }
}
const AsyncLocalStorage =
  _asyncHooks?.AsyncLocalStorage ??
  (FallbackStore as unknown as typeof import("node:async_hooks").AsyncLocalStorage);
import {
  SpanStatusCode,
  context as otelContext,
  trace as otelTrace,
  type Span
} from "@opentelemetry/api";
import { getTracer } from "./telemetry.js";

export type AgentSpanKind = "execute" | "plan" | "step" | "compile";

/** Token counts and computed cost for one LLM call. */
export interface LlmUsage {
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens?: number;
  /** Cost of the call in US dollars. */
  cost?: number;
}

/**
 * Per-call slot carrying the in-flight LLM call's side state: token usage and
 * the exact request payload sent to the provider.
 *
 * Providers' `trackUsage` writes usage via {@link setLastUsage}; providers'
 * `recordRequestPayload` writes the wire payload via {@link setLastRequest}.
 * The traced wrapper reads both back ({@link consumeLastUsage},
 * {@link peekLastRequest}) so it can attach usage to its span and, on failure,
 * log precisely what was sent.
 *
 * We use AsyncLocalStorage rather than an instance field so concurrent calls
 * on the same provider instance don't clobber each other.
 */
interface CallSlot {
  usage: LlmUsage | null;
  request: unknown;
  /**
   * Set while a non-chat modality call (image/video/audio/3D/embedding) is
   * being failure-logged. Lets nested calls — e.g. a batch helper delegating
   * to its singular method — reuse the parent slot so a failure is logged once,
   * at the outermost call. See {@link withModalityCapture}.
   */
  modality?: boolean;
}
const usageStore = new AsyncLocalStorage<CallSlot>();

/**
 * Run `fn` inside a fresh per-call slot. `consumeLastUsage()` /
 * `peekLastRequest()` afterwards return whatever the deepest provider hook
 * wrote.
 */
export function withUsageCapture<T>(fn: () => Promise<T>): Promise<T> {
  return usageStore.run({ usage: null, request: null }, fn);
}

/** Provider hook: record token usage for the in-flight LLM call. */
export function setLastUsage(usage: LlmUsage): void {
  const slot = usageStore.getStore();
  if (slot) slot.usage = usage;
}

/** Read and clear the most recent usage recorded in this async context. */
export function consumeLastUsage(): LlmUsage | null {
  const slot = usageStore.getStore();
  if (!slot) return null;
  const u = slot.usage;
  slot.usage = null;
  return u;
}

/** Read (without clearing) the most recent usage in this async context. */
export function peekLastUsage(): LlmUsage | null {
  return usageStore.getStore()?.usage ?? null;
}

/**
 * Provider hook: record the exact payload sent to the provider for the
 * in-flight LLM call. The traced wrapper reads this back via
 * {@link peekLastRequest} to log precisely what was sent on failure.
 */
export function setLastRequest(request: unknown): void {
  const slot = usageStore.getStore();
  if (slot) slot.request = request;
}

/** Read (without clearing) the request payload recorded in this async context. */
export function peekLastRequest(): unknown {
  return usageStore.getStore()?.request ?? null;
}

/**
 * Run a non-chat modality call (image/video/audio/3D/embedding) inside a fresh
 * per-call slot so `recordRequestPayload` and `peekLastRequest` work the same
 * way they do for chat. `fn` receives whether a modality capture was already
 * active in this async context: nested calls (a batch helper delegating to its
 * singular method) reuse the parent slot and pass `true`, so the caller can log
 * a failure exactly once — at the outermost call.
 */
export function withModalityCapture<T>(
  fn: (alreadyActive: boolean) => Promise<T>
): Promise<T> {
  const existing = usageStore.getStore();
  if (existing?.modality) return fn(true);
  return usageStore.run({ usage: null, request: null, modality: true }, () =>
    fn(false)
  );
}

/**
 * Create a per-call usage slot that survives across async-generator yields.
 *
 * `AsyncLocalStorage.run()` only persists across awaits within its callback,
 * so for streaming we explicitly wrap each `gen.next()` call in `runInSlot`.
 * After the generator finishes, `getUsage()` returns whatever the deepest
 * `setLastUsage()` call wrote.
 */
export function createUsageSlot(): {
  runInSlot: <T>(fn: () => Promise<T>) => Promise<T>;
  getUsage: () => LlmUsage | null;
  getRequest: () => unknown;
} {
  const slot: CallSlot = { usage: null, request: null };
  return {
    runInSlot: <T>(fn: () => Promise<T>) => usageStore.run(slot, fn),
    getUsage: () => slot.usage,
    getRequest: () => slot.request
  };
}

/** Wrap a function in an OTel span; pass-through if telemetry is disabled. */
async function withSpan<T>(
  name: string,
  attributes: Record<string, unknown>,
  fn: (span: Span | null) => Promise<T>
): Promise<T> {
  const tracer = getTracer();
  if (!tracer) return fn(null);
  return tracer.startActiveSpan(name, async (span) => {
    setAttributes(span, attributes);
    try {
      const result = await fn(span);
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (err) {
      span.setStatus({ code: SpanStatusCode.ERROR, message: String(err) });
      span.recordException(err as Error);
      throw err;
    } finally {
      span.end();
    }
  });
}

/**
 * Wrap an async generator in an OTel span. Each `next()` call runs in the
 * span's context, so any spans created inside `genFactory` nest under it.
 *
 * Preserves the generator's `TReturn` so callers reading `.next().value`
 * after `done` still get the underlying return value. If the consumer
 * cancels (breaks out of `for await`, calls `return()`, or throws), the
 * inner generator's `return()` is invoked so its `finally` blocks run.
 */
export async function* withSpanGen<T, TReturn = void>(
  name: string,
  attributes: Record<string, unknown>,
  genFactory: () => AsyncGenerator<T, TReturn>
): AsyncGenerator<T, TReturn> {
  const tracer = getTracer();
  if (!tracer) {
    return yield* genFactory();
  }
  const span = tracer.startSpan(name);
  setAttributes(span, attributes);
  const ctx = otelTrace.setSpan(otelContext.active(), span);
  const inner = otelContext.with(ctx, () => genFactory());
  let exhausted = false;
  try {
    while (true) {
      const result = await otelContext.with(ctx, () => inner.next());
      if (result.done) {
        exhausted = true;
        span.setStatus({ code: SpanStatusCode.OK });
        return result.value;
      }
      yield result.value;
    }
  } catch (err) {
    span.setStatus({ code: SpanStatusCode.ERROR, message: String(err) });
    span.recordException(err as Error);
    throw err;
  } finally {
    if (!exhausted) {
      // Consumer cancelled early — give the inner generator a chance to
      // run its own finally blocks (close streams, end child spans, etc).
      await otelContext
        .with(ctx, () => inner.return?.(undefined as never))
        ?.catch(() => {});
    }
    span.end();
  }
}

function setAttributes(span: Span, attributes: Record<string, unknown>): void {
  for (const [k, v] of Object.entries(attributes)) {
    if (v !== undefined && v !== null) {
      span.setAttribute(k, v as never);
    }
  }
}

/**
 * Wrap an agent operation (execute / plan / step) in a span.
 *
 * @param kind        — which agent stage this is (becomes part of span name)
 * @param attributes  — agent.* attributes (objective, model, provider, ...)
 * @param fn          — the body of the agent stage
 */
export function withAgentSpan<T>(
  kind: AgentSpanKind,
  attributes: {
    objective?: string;
    provider?: string;
    model?: string;
    /** For `step`: which task / sub-objective is being executed. */
    task?: string;
    /** For `plan`: number of skills / tools available. */
    toolsCount?: number;
    /** Any additional attributes to attach. */
    extra?: Record<string, unknown>;
  },
  fn: (span: Span | null) => Promise<T>
): Promise<T> {
  return withSpan(`agent.${kind}`, agentAttrs(kind, attributes), fn);
}

/** Wrap a workflow run (kernel WorkflowRunner) in a span. */
export function withWorkflowSpan<T>(
  attributes: {
    workflowId?: string;
    workflowName?: string;
    nodeCount?: number;
    extra?: Record<string, unknown>;
  },
  fn: (span: Span | null) => Promise<T>
): Promise<T> {
  const attrs: Record<string, unknown> = {};
  if (attributes.workflowId !== undefined) {
    attrs["workflow.id"] = attributes.workflowId;
  }
  if (attributes.workflowName !== undefined) {
    attrs["workflow.name"] = attributes.workflowName;
  }
  if (attributes.nodeCount !== undefined) {
    attrs["workflow.node_count"] = attributes.nodeCount;
  }
  if (attributes.extra) Object.assign(attrs, attributes.extra);
  return withSpan("workflow.run", attrs, fn);
}

/** Async-generator variant of {@link withAgentSpan}. */
export function withAgentSpanGen<T, TReturn = void>(
  kind: AgentSpanKind,
  attributes: Parameters<typeof withAgentSpan>[1],
  genFactory: () => AsyncGenerator<T, TReturn>
): AsyncGenerator<T, TReturn> {
  return withSpanGen(`agent.${kind}`, agentAttrs(kind, attributes), genFactory);
}

function agentAttrs(
  kind: AgentSpanKind,
  attributes: Parameters<typeof withAgentSpan>[1]
): Record<string, unknown> {
  const attrs: Record<string, unknown> = { "agent.kind": kind };
  if (attributes.objective !== undefined) {
    attrs["agent.objective"] = truncate(attributes.objective, 1000);
  }
  if (attributes.provider !== undefined) {
    attrs["agent.provider"] = attributes.provider;
  }
  if (attributes.model !== undefined) attrs["agent.model"] = attributes.model;
  if (attributes.task !== undefined) {
    attrs["agent.task"] = truncate(attributes.task, 1000);
  }
  if (attributes.toolsCount !== undefined) {
    attrs["agent.tools_count"] = attributes.toolsCount;
  }
  if (attributes.extra) Object.assign(attrs, attributes.extra);
  return attrs;
}

/** Wrap a single node execution (kernel Actor) in a span. */
export function withNodeSpan<T>(
  attributes: {
    nodeId: string;
    nodeType: string;
    workflowId?: string;
    extra?: Record<string, unknown>;
  },
  fn: (span: Span | null) => Promise<T>
): Promise<T> {
  const attrs: Record<string, unknown> = {
    "node.id": attributes.nodeId,
    "node.type": attributes.nodeType
  };
  if (attributes.workflowId !== undefined) {
    attrs["workflow.id"] = attributes.workflowId;
  }
  if (attributes.extra) Object.assign(attrs, attributes.extra);
  return withSpan("node.process", attrs, fn);
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}
