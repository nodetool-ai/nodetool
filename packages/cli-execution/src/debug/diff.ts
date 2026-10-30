/**
 * Diffs two harness runs so watch mode can show only what changed between
 * edits: status transitions, newly-appeared and resolved issues, and token/cost
 * movement.
 *
 * The diff works on a {@link RunSnapshot} — ok, issues, one status word, and
 * the run's totals — so every watchable harness shares one differ. `debug`
 * projects a {@link DebugReport} into it; `app build` projects a `BuildReport`.
 * Pure (types only), so it is unit-tested directly.
 */
import type { DebugReport } from "./types.js";

/** What a differ needs from a run, whatever harness produced it. */
export interface RunSnapshot {
  ok: boolean;
  /** Everything wrong right now, not a delta. */
  issues: string[];
  /** One word for the run's main surface, e.g. `completed` or `run/failed`. */
  status: string | null;
  tokens: number | null;
  costUsd: number | null;
}

export interface DebugDiff {
  /** Verdict ok transition, when it changed. */
  okChanged: { from: boolean; to: boolean } | null;
  /** Status transition, when it changed. */
  serverStatusChanged: { from: string | null; to: string | null } | null;
  /** Issues present now but not before. */
  newIssues: string[];
  /** Issues present before but not now. */
  resolvedIssues: string[];
  /** Token/cost deltas, when both runs reported them. */
  tokenDelta: number | null;
  costDelta: number | null;
}

/** Project a workflow debug report into the shape the differ reads. */
export function snapshotDebugReport(report: DebugReport): RunSnapshot {
  const trace = report.server?.trace;
  return {
    ok: report.verdict.ok,
    issues: report.verdict.issues,
    status: report.server ? report.server.status : null,
    tokens: trace ? trace.tokens.total : null,
    costUsd: trace ? trace.costUsd : null
  };
}

export function diffRuns(prev: RunSnapshot, next: RunSnapshot): DebugDiff {
  const prevIssues = new Set(prev.issues);
  const nextIssues = new Set(next.issues);

  // Tokens and cost move independently: a build reports what it spent without
  // counting tokens, so one being absent must not suppress the other.
  const tokenDelta =
    prev.tokens != null && next.tokens != null ? next.tokens - prev.tokens : null;
  const costDelta =
    prev.costUsd != null && next.costUsd != null
      ? next.costUsd - prev.costUsd
      : null;

  return {
    okChanged: prev.ok !== next.ok ? { from: prev.ok, to: next.ok } : null,
    serverStatusChanged:
      prev.status !== next.status
        ? { from: prev.status, to: next.status }
        : null,
    newIssues: next.issues.filter((i) => !prevIssues.has(i)),
    resolvedIssues: prev.issues.filter((i) => !nextIssues.has(i)),
    tokenDelta,
    costDelta
  };
}

export function diffReports(prev: DebugReport, next: DebugReport): DebugDiff {
  return diffRuns(snapshotDebugReport(prev), snapshotDebugReport(next));
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

export function formatDiff(diff: DebugDiff, statusLabel = "server"): string {
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
      `${statusLabel}: ${diff.serverStatusChanged.from ?? "—"} → ${diff.serverStatusChanged.to ?? "—"}`
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
