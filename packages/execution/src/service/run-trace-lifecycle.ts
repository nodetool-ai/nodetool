/** Durable owner registration precedes execution, while OTel owns span ancestry. */
import { trace, SpanStatusCode, type SpanContext } from "@opentelemetry/api";
import {
  registerRunTrace,
  registerRunTraceParents,
  getRunTrace,
  Workflow,
  registerRunTraceParent,
  setRunTraceRoot,
  settleRunTrace
} from "@nodetool-ai/models";
import type { AppRunRecord } from "@nodetool-ai/protocol/api-schemas/app-runs.js";
import type { RunTraceParent } from "@nodetool-ai/protocol";
import { ProcessingContext, withRunTrace, withSpan, getRunTraceScope, type RunTraceScope } from "@nodetool-ai/runtime";
import { ensureRunTraceTelemetry } from "../run-trace-store.js";
import { rememberBrowserTracePolicy } from "../browser-trace-policy.js";

export interface RegisterTraceInput {
  readonly kind: "app" | "workflow" | "chat";
  readonly sourceId: string;
  readonly id?: string;
  readonly traceId?: string;
  readonly origin?: "ui" | "agent" | "cli" | "debug" | "public";
  readonly parents: readonly RunTraceParent[];
  readonly parentSpanContext?: SpanContext;
  readonly inlineWorkflow?: boolean;
}

export async function registerContextRunTrace(context: ProcessingContext, input: RegisterTraceInput): Promise<RunTraceScope> {
  await ensureRunTraceTelemetry();
  const inherited = context.runTraceContext ?? getRunTraceScope();
  const sameTrace = inherited && (!input.traceId || input.traceId === inherited.traceId);
  const registration = await registerRunTrace(context.userId, {
    id: input.id,
    kind: input.kind,
    sourceId: input.sourceId,
    traceId: input.traceId ?? inherited?.traceId,
    parentRunId: sameTrace && inherited.runId !== input.id ? inherited.runId : undefined,
    origin: input.origin ?? inherited?.origin ?? "agent",
    parents: [...input.parents],
    inlineWorkflow: input.inlineWorkflow
  });
  const scope: RunTraceScope = {
    userId: context.userId,
    runId: registration.id,
    traceId: registration.trace_id,
    origin: registration.origin,
    secretValues: context.getResolvedSecretValues(),
    policy: inherited?.policy ?? { contentSuppressed: false },
    ...(input.parentSpanContext ? { parentSpanContext: input.parentSpanContext } : sameTrace && inherited.parentSpanContext ? { parentSpanContext: inherited.parentSpanContext } : {})
  };
  if (inherited && !sameTrace) {
    // Copied chat/tool content remains attributable when an app opens a fresh trace.
    const parent = await getRunTrace(inherited.userId, inherited.runId);
    if (parent) { await registerRunTraceParents(scope.userId, scope.runId, parent.parents); }
  }
  context.runTraceContext = scope;
  rememberBrowserTracePolicy(scope);
  return scope;
}

export async function registerAppRunTrace(context: ProcessingContext, run: AppRunRecord, parentSpanContext?: SpanContext): Promise<RunTraceScope> {
  return registerContextRunTrace(context, {
    kind: "app", id: run.id, sourceId: run.id, traceId: run.trace_id, origin: run.origin,
    parents: [
      { kind: "app_run", id: run.id },
      { kind: "instance", id: run.instance_id },
      ...(run.application_id ? [{ kind: "app" as const, id: run.application_id }] : [])
    ], parentSpanContext
  });
}

export async function registerWorkflowRunTrace(context: ProcessingContext, input: { readonly jobId: string; readonly workflowId: string | null; readonly inlineGraph?: boolean; readonly origin?: RegisterTraceInput["origin"]; readonly parentSpanContext?: SpanContext }): Promise<RunTraceScope> {
  const persistedWorkflow = input.workflowId && input.inlineGraph
    ? await Workflow.get<Workflow>(input.workflowId)
    : null;
  const workflowParent = input.workflowId && (!input.inlineGraph || persistedWorkflow)
    ? [{ kind: "workflow" as const, id: input.workflowId }]
    : [];
  return registerContextRunTrace(context, {
    kind: "workflow", sourceId: input.jobId, origin: input.origin, parentSpanContext: input.parentSpanContext,
    parents: [{ kind: "job", id: input.jobId }, ...workflowParent], inlineWorkflow: input.inlineGraph
  });
}

export async function registerChatRunTrace(context: ProcessingContext, input: { readonly messageId: string; readonly threadId: string }): Promise<RunTraceScope> {
  return registerContextRunTrace(context, { kind: "chat", sourceId: input.messageId, origin: "ui", parents: [{ kind: "message", id: input.messageId }, { kind: "thread", id: input.threadId }] });
}

export async function withRegisteredRunTrace<T>(context: ProcessingContext, kind: "app.run" | "chat.turn" | "workflow.run", fn: () => Promise<T>): Promise<T> {
  const scope = context.runTraceContext;
  if (!scope) { return fn(); }
  return withRunTrace(scope, async () => {
    // The kernel already opens workflow.run inside this execution context.
    if (kind === "workflow.run") { return fn(); }
    return withSpan(kind, { "run.id": scope.runId }, async (span) => {
      if (span) { await setRunTraceRoot(scope.userId, scope.runId, span.spanContext().spanId); }
      return fn();
    });
  });
}

export async function settleRegisteredRunTrace(context: ProcessingContext, status: "completed" | "failed" | "cancelled", error?: string | null, costUsd?: number | null): Promise<void> {
  const scope = context.runTraceContext;
  if (scope) {
    rememberBrowserTracePolicy(scope, true);
    if (status !== "completed") { trace.getActiveSpan()?.setStatus({ code: SpanStatusCode.ERROR }); }
    const outcome: Parameters<typeof settleRunTrace>[2] = { status, secretValues: context.getResolvedSecretValues(), contentSuppressed: scope.policy.contentSuppressed };
    if (costUsd !== undefined) { outcome.costUsd = costUsd; }
    if (error) { outcome.error = scope.policy.contentSuppressed ? "Execution failed" : error; }
    await settleRunTrace(scope.userId, scope.runId, outcome);
  }
}

export async function associateTraceMessage(context: ProcessingContext, messageId: string): Promise<void> {
  const scope = context.runTraceContext;
  if (scope) { await registerRunTraceParent(scope.userId, scope.runId, { kind: "message", id: messageId }); }
}

/** WebSocket jobs keep an app root open while their separately registered job runs. */
export async function openAppRunTrace(context: ProcessingContext, run: AppRunRecord, parentSpanContext?: SpanContext): Promise<(status: "completed" | "failed" | "cancelled", error?: string | null, costUsd?: number | null) => Promise<void>> {
  const scope = await registerAppRunTrace(context, run, parentSpanContext);
  const { getTracer } = await import("@nodetool-ai/runtime");
  const span = withRunTrace(scope, () => getTracer()?.startSpan("app.run", { attributes: { "run.id": scope.runId } }));
  if (span) {
    await setRunTraceRoot(scope.userId, scope.runId, span.spanContext().spanId);
    context.runTraceContext = { ...scope, parentSpanContext: span.spanContext() };
  }
  let closed = false;
  return async (status, error, costUsd) => {
    if (closed) { return; }
    closed = true;
    span?.setStatus({ code: status === "completed" ? SpanStatusCode.OK : SpanStatusCode.ERROR });
    span?.end();
    rememberBrowserTracePolicy(scope, true);
    const outcome: Parameters<typeof settleRunTrace>[2] = { status, secretValues: context.getResolvedSecretValues(), contentSuppressed: scope.policy.contentSuppressed };
    if (costUsd !== undefined) { outcome.costUsd = costUsd; }
    if (error) { outcome.error = scope.policy.contentSuppressed ? "Execution failed" : error; }
    await settleRunTrace(scope.userId, scope.runId, outcome);
  };
}
