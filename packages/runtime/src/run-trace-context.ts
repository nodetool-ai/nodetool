import { context, ROOT_CONTEXT, trace, type Span, type SpanContext } from "@opentelemetry/api";
import { isTraceContentKey } from "@nodetool-ai/protocol";
import { AsyncLocalStorage } from "./async-local-storage.js";
import { sanitizeTraceContentText, stringifyTraceContent } from "./run-trace-serialization.js";

export interface RunTraceScope {
  readonly userId: string;
  readonly runId: string;
  readonly traceId: string;
  readonly origin: "ui" | "agent" | "cli" | "debug" | "public";
  readonly secretValues: ReadonlySet<string>;
  readonly policy: { contentSuppressed: boolean };
  readonly parentSpanContext?: SpanContext;
}

const runScope = new AsyncLocalStorage<RunTraceScope>();
const suppressed = new AsyncLocalStorage<boolean>();
const spanScopes = new WeakMap<Span, RunTraceScope>();

export function bindSpanRunTraceScope(span: Span, scope: RunTraceScope): void { spanScopes.set(span, scope); }
export function getSpanRunTraceScope(span: Span): RunTraceScope | undefined { return spanScopes.get(span); }

/** Execute child work under a trusted durable run without inheriting another request's trace. */
export function withRunTrace<T>(scope: RunTraceScope, fn: () => T): T {
  if (!/^[0-9a-f]{32}$/.test(scope.traceId)) { throw new Error("Invalid run trace id"); }
  const active = context.active();
  const activeSpan = trace.getSpanContext(active);
  const parent = activeSpan?.traceId === scope.traceId
    ? active
    : scope.parentSpanContext?.traceId === scope.traceId
      ? trace.setSpanContext(ROOT_CONTEXT, scope.parentSpanContext)
      : ROOT_CONTEXT;
  return runScope.run(scope, () => context.with(parent, fn));
}

/** The owner and policy shared by every span beneath the current run. */
export function getRunTraceScope(): RunTraceScope | undefined {
  return suppressed.getStore() ? undefined : runScope.getStore();
}

/** Add credentials resolved outside ProcessingContext to the shared run redaction set. */
export function recordRunTraceSecret(value: string | null | undefined): void {
  const secrets = getRunTraceScope()?.secretValues;
  if (value && secrets instanceof Set) { secrets.add(value); }
}

/** Producers report content caps before the original value leaves their scope. */
export function markTraceContentTruncated(): void {
  if (getRunTraceScope()) { trace.getActiveSpan()?.setAttribute("nodetool.trace.truncated", true); }
}

/** Exclude third-party content from this run and all subsequent inseparable work. */
export function suppressRunTraceContent(): void {
  const scope = getRunTraceScope();
  if (scope) { scope.policy.contentSuppressed = true; }
}

/** Add a run event to an explicit span or the active span. */
export function recordTraceEvent(name: string, attributes: Record<string, unknown>, span?: Span): void {
  if (isRunTraceSuppressed()) { return; }
  const target = span ?? trace.getSpan(context.active());
  const scope = getRunTraceScope() ?? (target ? spanScopes.get(target) : undefined);
  if (!target || !scope) { return; }
  const safe: Record<string, string | number | boolean | string[]> = {};
  for (const [key, value] of Object.entries(attributes)) {
    if ((scope.origin === "public" || scope.policy.contentSuppressed) && isTraceContentKey(key)) { continue; }
    if (typeof value === "string" && isTraceContentKey(key)) {
      safe[key] = sanitizeTraceContentText(value, scope.secretValues);
    } else if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      safe[key] = value;
    } else if (value !== undefined) {
      safe[key] = stringifyTraceContent(value, scope.secretValues);
    }
  }
  target.addEvent(name, safe);
}

/** Run-store IO and diagnostics must not recursively record themselves. */
export function withoutRunTrace<T>(fn: () => T): T {
  return suppressed.run(true, () => context.with(ROOT_CONTEXT, fn));
}

export function isRunTraceSuppressed(): boolean { return suppressed.getStore() === true; }
