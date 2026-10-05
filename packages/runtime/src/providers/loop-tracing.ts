/** Provider loop tracing shares the execution context across every iterator operation. */
import { AsyncLocalStorage } from "../async-local-storage.js";
import { context, trace, SpanStatusCode, type Span } from "@opentelemetry/api";
import { getTracer } from "../telemetry.js";
import { withSpan, withSpanGen } from "../tracing-helpers.js";
import { getRunTraceScope, markTraceContentTruncated, type RunTraceScope } from "../run-trace-context.js";
import { stringifyTraceContent } from "../run-trace-serialization.js";
import { TRACE_STRING_LIMIT } from "@nodetool-ai/protocol";
import { isProviderToolErrorResult, isChunk, type Message, type ProviderStreamItem, type ProviderToolResult, type ToolCall } from "./types.js";

export function traceContentAllowed(): boolean {
  const scope = getRunTraceScope();
  return scope !== null && scope !== undefined && scope.origin !== "public" && !scope.policy.contentSuppressed;
}

export function traceTextContent(value: string): string {
  if (value.length > TRACE_STRING_LIMIT) { markTraceContentTruncated(); }
  return value.slice(0, TRACE_STRING_LIMIT);
}

export function messageTraceContent(messages: readonly Message[]): string {
  // Media is represented by identifiers at the stored-record boundary.
  return traceTextContent(stringifyTraceContent(messages.map((message) => ({
    role: message.role,
    content: typeof message.content === "string" ? message.content : Array.isArray(message.content)
      ? message.content.filter((part) => part.type === "text") : null
  }))));
}

export async function tracedToolCall<T extends ProviderToolResult>(call: ToolCall, fn: () => Promise<T>): Promise<T> {
  return context.with(providerRoundContext(), () => withSpan("tool.call", { "tool.name": call.name, "tool.argument_names": Object.keys(call.args ?? {}) }, async (span) => {
    if (traceContentAllowed()) {
      span?.setAttribute("tool.arguments", stringifyTraceContent(call.args ?? {}));
    }
    const result = await fn();
    if (isProviderToolErrorResult(result) || (typeof result === "string" && result.startsWith("Error executing tool"))) {
      span?.setStatus({ code: SpanStatusCode.ERROR });
    }
    if (traceContentAllowed()) {
      span?.setAttribute("tool.result", stringifyTraceContent(result));
    }
    return result;
  }));
}

const streamTrace = new WeakMap<object, { span: Span; scope: RunTraceScope }>();
export function getProviderStreamTrace(item: ProviderStreamItem): { span: Span; scope: RunTraceScope } | undefined { return streamTrace.get(item); }

interface LoopTrace { parent: ReturnType<typeof context.active>; round: Span | null; index: number; failed: boolean; }
const loopTrace = new AsyncLocalStorage<LoopTrace>();

export function beginProviderRound(provider: string, model: string): void {
  const loop = loopTrace.getStore();
  const tracer = getTracer();
  if (!loop || !tracer) { return; }
  if (loop.round && !loop.failed) { loop.round.setStatus({ code: SpanStatusCode.OK }); }
  loop.round?.end();
  loop.failed = false;
  loop.round = tracer.startSpan("agent.round", { attributes: { "agent.round": ++loop.index, "llm.provider": provider, "llm.model": model } }, loop.parent);
}

export function providerRoundContext(): ReturnType<typeof context.active> {
  const loop = loopTrace.getStore();
  return loop?.round ? trace.setSpan(loop.parent, loop.round) : context.active();
}

/** Provider overrides and the base loop share the same iterator lifecycle. */
export function tracedProviderLoop(provider: string, model: string, factory: () => AsyncGenerator<ProviderStreamItem>): AsyncGenerator<ProviderStreamItem> {
  return withSpanGen("agent.loop", { "llm.provider": provider, "llm.model": model }, () => rounds(factory));
}

async function* rounds(factory: () => AsyncGenerator<ProviderStreamItem>): AsyncGenerator<ProviderStreamItem> {
  const state: LoopTrace = { parent: context.active(), round: null, index: 0, failed: false };
  const source = factory();
  let finished = false;
  try {
    while (true) {
      const next = await loopTrace.run(state, () => context.with(providerRoundContext(), () => source.next()));
      if (next.done) { finished = true; return; }
      if ("type" in next.value && next.value.type === "stop") {
        state.failed = true;
        state.round?.setStatus({ code: SpanStatusCode.ERROR });
        trace.getSpan(state.parent)?.setStatus({ code: SpanStatusCode.ERROR });
      }
      const scope = getRunTraceScope();
      if (state.round && scope) { streamTrace.set(next.value, { span: state.round, scope }); }
      yield next.value;
    }
  } catch (error) {
    state.failed = true;
    state.round?.setStatus({ code: SpanStatusCode.ERROR });
    throw error;
  } finally {
    try {
      if (!finished) {
        state.failed = true;
        state.round?.setStatus({ code: SpanStatusCode.ERROR });
        trace.getSpan(state.parent)?.setStatus({ code: SpanStatusCode.ERROR });
        await loopTrace.run(state, () => context.with(providerRoundContext(), () => source.return(undefined)));
      }
    } finally {
      if (finished && !state.failed) { state.round?.setStatus({ code: SpanStatusCode.OK }); }
      state.round?.end();
    }
  }
}

export function tracedProviderLlm(provider: string, model: string, messages: readonly Message[], factory: () => AsyncGenerator<ProviderStreamItem>): AsyncGenerator<ProviderStreamItem> {
  const attributes: Record<string, unknown> = {
    "llm.provider": provider, "llm.model": model,
    "llm.request.message_count": messages.length
  };
  if (traceContentAllowed()) { attributes["llm.request.messages"] = messageTraceContent(messages); }
  return withSpanGen(`llm.stream ${provider}/${model}`, attributes, async function* () {
    const span = trace.getActiveSpan();
    let response = "";
    for await (const item of factory()) {
      if (traceContentAllowed() && isChunk(item) && !item.thinking) {
        response = traceTextContent(response + item.content);
        span?.setAttribute("llm.response.content", response);
      }
      yield item;
    }
  });
}
