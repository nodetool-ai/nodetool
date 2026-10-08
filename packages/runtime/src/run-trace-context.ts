import { context, trace, type Span } from "@opentelemetry/api";
import { isTraceContentKey } from "@nodetool-ai/protocol";
import { getRunTraceScope, getSpanRunTraceScope, isRunTraceSuppressed } from "./run-trace-scope.js";
import { sanitizeTraceContentText, stringifyTraceContent } from "./run-trace-serialization.js";
export * from "./run-trace-scope.js";

/** Add a run event to an explicit span or the active span. */
export function recordTraceEvent(name: string, attributes: Record<string, unknown>, span?: Span): void {
  if (isRunTraceSuppressed()) { return; }
  const target = span ?? trace.getSpan(context.active());
  const scope = getRunTraceScope() ?? (target ? getSpanRunTraceScope(target) : undefined);
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
