/**
 * Diffs two debug runs so watch mode can show only what changed between edits:
 * status transitions, newly-appeared and resolved issues, and token/cost
 * movement. Pure (types only) so it's unit-tested directly.
 */
import type { DebugReport } from "./types.js";

export interface DebugDiff {
  /** Verdict ok transition, when it changed. */
  okChanged: { from: boolean; to: boolean } | null;
  /** Server status transition, when it changed. */
  serverStatusChanged: { from: string | null; to: string | null } | null;
  /** Issues present now but not before. */
  newIssues: string[];
  /** Issues present before but not now. */
  resolvedIssues: string[];
  /** Token/cost deltas from the server trace, when available on both runs. */
  tokenDelta: number | null;
  costDelta: number | null;
}

function serverStatus(report: DebugReport): string | null {
  return report.server ? report.server.status : null;
}

function traceTotals(
  report: DebugReport
): { tokens: number; cost: number } | null {
  const trace = report.server?.trace;
  if (!trace) return null;
  return { tokens: trace.tokens.total, cost: trace.costUsd };
}

export function diffReports(
  prev: DebugReport,
  next: DebugReport
): DebugDiff {
  const prevIssues = new Set(prev.verdict.issues);
  const nextIssues = new Set(next.verdict.issues);

  const newIssues = next.verdict.issues.filter((i) => !prevIssues.has(i));
  const resolvedIssues = prev.verdict.issues.filter((i) => !nextIssues.has(i));

  const prevStatus = serverStatus(prev);
  const nextStatus = serverStatus(next);

  const prevTotals = traceTotals(prev);
  const nextTotals = traceTotals(next);

  return {
    okChanged:
      prev.verdict.ok !== next.verdict.ok
        ? { from: prev.verdict.ok, to: next.verdict.ok }
        : null,
    serverStatusChanged:
      prevStatus !== nextStatus
        ? { from: prevStatus, to: nextStatus }
        : null,
    newIssues,
    resolvedIssues,
    tokenDelta:
      prevTotals && nextTotals ? nextTotals.tokens - prevTotals.tokens : null,
    costDelta:
      prevTotals && nextTotals ? nextTotals.cost - prevTotals.cost : null
  };
}

/** True when nothing an agent would act on changed between two runs. */
export function diffIsEmpty(diff: DebugDiff): boolean {
  return (
    diff.okChanged === null &&
    diff.serverStatusChanged === null &&
    diff.newIssues.length === 0 &&
    diff.resolvedIssues.length === 0
  );
}

export function formatDiff(diff: DebugDiff): string {
  if (diffIsEmpty(diff)) return "No change since last run.";
  const lines: string[] = [];
  if (diff.okChanged) {
    lines.push(
      diff.okChanged.to
        ? "✅ Now passing (was failing)"
        : "❌ Now failing (was passing)"
    );
  }
  if (diff.serverStatusChanged) {
    lines.push(
      `server: ${diff.serverStatusChanged.from ?? "—"} → ${diff.serverStatusChanged.to ?? "—"}`
    );
  }
  for (const issue of diff.resolvedIssues) lines.push(`  - resolved: ${issue}`);
  for (const issue of diff.newIssues) lines.push(`  + new: ${issue}`);
  if (diff.tokenDelta != null && diff.tokenDelta !== 0) {
    const sign = diff.tokenDelta > 0 ? "+" : "";
    lines.push(`tokens: ${sign}${diff.tokenDelta}`);
  }
  if (diff.costDelta != null && Math.abs(diff.costDelta) > 1e-9) {
    const sign = diff.costDelta > 0 ? "+" : "";
    lines.push(`cost: ${sign}$${diff.costDelta.toFixed(4)}`);
  }
  return lines.join("\n");
}
