/**
 * Turns one run's execution summary into a pass/fail verdict plus the ordered
 * issues behind it. Shared so the CLI harness and the HTTP debug endpoint
 * (which the agent-facing `debug_workflow` tool calls) triage a run the same
 * way instead of each host inventing its own idea of "clean".
 */
import type { DebugError, ExecutionSummary, RunVerdict } from "./types.js";

export function describeErrors(
  prefix: string,
  errors: ReadonlyArray<DebugError>,
  limit = 5
): string[] {
  return errors.slice(0, limit).map((e) => {
    const where = e.nodeType ?? e.nodeId ?? "workflow";
    return `${prefix} ${where}: ${e.message.replace(/\s+/g, " ").slice(0, 200)}`;
  });
}

/** Issues found in a single surface's run, in triage order. */
export function collectRunIssues(
  prefix: string,
  summary: ExecutionSummary,
  outcome: { ok: boolean; status: string; error?: string | null }
): string[] {
  const issues: string[] = [];
  if (!outcome.ok) {
    issues.push(
      `${prefix} run ended ${outcome.status}${outcome.error ? `: ${outcome.error}` : ""}`
    );
  }
  issues.push(...describeErrors(`${prefix} node`, summary.errors));
  for (const call of summary.llmCalls) {
    if (call.error) {
      issues.push(`${prefix} LLM ${call.provider}/${call.model}: ${call.error}`);
    }
  }
  return issues;
}

/** Verdict for a single-surface run. */
export function buildRunVerdict(
  summary: ExecutionSummary,
  outcome: { ok: boolean; status: string; error?: string | null },
  surface = "Workflow"
): RunVerdict {
  const issues = collectRunIssues(surface, summary, outcome);
  const ok = outcome.ok && issues.length === 0;
  return {
    ok,
    headline: ok
      ? `Workflow ran clean (${outcome.status}).`
      : `Workflow has issues — ${issues[0] ?? "unknown failure"}`,
    issues
  };
}
