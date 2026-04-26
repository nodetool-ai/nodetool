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

import { AsyncLocalStorage } from "node:async_hooks";
import {
  SpanStatusCode,
  context as otelContext,
  trace as otelTrace,
  type Span
} from "@opentelemetry/api";
import { getTracer } from "./telemetry.js";

export type AgentSpanKind = "execute" | "plan" | "step";

/** Token counts and computed cost for one LLM call. */
export interface LlmUsage {
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens?: number;
  /** In NodeTool credits (1 credit ≈ $0.01). */
  cost?: number;
}

/**
 * Per-call usage slot. Providers' `trackUsage` writes into the active slot
 * via {@link setLastUsage}, and the traced wrapper reads it via
 * {@link consumeLastUsage} so it can attach the numbers to its span and
 * `llm_call` event.
 *
 * We use AsyncLocalStorage rather than an instance field so concurrent calls
 * on the same provider instance don't clobber each other.
 */
const usageStore = new AsyncLocalStorage<{ usage: LlmUsage | null }>();

/**
 * Run `fn` inside a fresh usage slot. `consumeLastUsage()` afterwards returns
 * whatever the deepest `setLastUsage()` call wrote.
 */
export function withUsageCapture<T>(fn: () => Promise<T>): Promise<T> {
  return usageStore.run({ usage: null }, fn);
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
} {
  const slot: { usage: LlmUsage | null } = { usage: null };
  return {
    runInSlot: <T>(fn: () => Promise<T>) => usageStore.run(slot, fn),
    getUsage: () => slot.usage
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
