/**
 * Turns one run's execution summary into a pass/fail verdict plus the ordered
 * issues behind it. Shared so the CLI harness and the HTTP debug endpoint
 * (which the agent-facing `debug_workflow` tool calls) triage a run the same
 * way instead of each host inventing its own idea of "clean".
 */
import type {
  DebugError,
  DebugVerdict,
  ExecutionSummary,
  RunVerdict
} from "./types.js";

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
      issues.push(
        `${prefix} LLM ${call.provider}/${call.model}: ${call.error}`
      );
    }
  }
  return issues;
}

/**
 * What supervision decided, as things worth reading but not failures — a
 * skipped invocation leaves the run `completed` with less output than the
 * graph promised, which no status field says out loud.
 */
export function collectInterventionWarnings(
  prefix: string,
  summary: ExecutionSummary,
  limit = 5
): string[] {
  if (summary.interventions.length === 0) return [];
  const warnings = summary.interventions
    .slice(0, limit)
    .map(
      (i) =>
        `${prefix} supervisor ${i.verdict.action} on ${i.escalation.nodeId}` +
        `${i.escalation.invocationKey ? ` [${i.escalation.invocationKey}]` : ""}` +
        `: ${i.escalation.detail.replace(/\s+/g, " ").slice(0, 200)}`
    );
  const rest = summary.interventions.length - warnings.length;
  if (rest > 0) warnings.push(`${prefix} …${rest} more supervisor decision(s)`);
  return warnings;
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

/**
 * Verdict for a document debug report (JS script, sketch, timeline): static
 * validation, the scripted interactions, and validation of the document the
 * interactions left behind. `subject` names the document in the headline
 * ("Script has 2 problem(s)") and `soundLabel` is the clean-run phrase
 * ("Script is sound").
 */
export function buildDocumentVerdict<TIssue>(options: {
  subject: string;
  soundLabel: string;
  describe: (issue: TIssue) => string;
  validation: {
    errors: ReadonlyArray<TIssue>;
    warnings: ReadonlyArray<TIssue>;
  };
  finalValidation:
    | { errors: ReadonlyArray<TIssue>; warnings: ReadonlyArray<TIssue> }
    | undefined;
  interactions: ReadonlyArray<{ tool: string; ok: boolean; error?: string }>;
}): DebugVerdict {
  const {
    subject,
    soundLabel,
    describe,
    validation,
    finalValidation,
    interactions
  } = options;
  const failedSteps = interactions.filter((step) => !step.ok);
  const afterEdits = (issue: TIssue): string =>
    `After edits — ${describe(issue)}`;
  const issues: string[] = [
    ...validation.errors.map(describe),
    ...failedSteps.map(
      (step) =>
        `Interaction \`${step.tool}\` failed${step.error ? `: ${step.error}` : ""}`
    ),
    ...(finalValidation?.errors ?? []).map(afterEdits)
  ];
  const warnings: string[] = [
    ...validation.warnings.map(describe),
    ...(finalValidation?.warnings ?? []).map(afterEdits)
  ];

  const ok = issues.length === 0;
  const warningCount = warnings.length;
  const headline = ok
    ? `${soundLabel} — ${interactions.length} interaction(s) ran clean` +
      (warningCount > 0 ? `, ${warningCount} warning(s)` : "") +
      "."
    : `${subject} has ${issues.length} problem(s)` +
      (failedSteps.length > 0
        ? `, ${failedSteps.length} failed interaction(s)`
        : "") +
      (warningCount > 0 ? `, ${warningCount} warning(s)` : "") +
      ` — ${issues[0]}`;

  return warningCount > 0
    ? { ok, headline, issues, warnings }
    : { ok, headline, issues };
}
