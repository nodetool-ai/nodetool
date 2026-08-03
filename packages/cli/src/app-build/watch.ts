/**
 * What `nodetool app build --watch` diffs between two builds of the same spec.
 *
 * The differ is the one `nodetool debug --watch` uses, so a build only has to
 * say what its ok, its issues, its state, and its spend are. Issues come from
 * the last repair round, which carries everything still wrong rather than a
 * delta — the same set the command prints as "Outstanding issues" — so the
 * diff's resolved/new lines line up with what a human just read.
 */
import type { BuildReport } from "@nodetool-ai/agents";
import type { RunSnapshot } from "../debug/diff.js";

/** One issue line, stable across rounds so the diff can match it. */
const issueLine = (issue: {
  stage: string;
  code: string;
  message: string;
}): string => `[${issue.stage}/${issue.code}] ${issue.message}`;

/** Everything still wrong at the end of the build. Empty on a green one. */
function outstandingIssues(report: BuildReport): string[] {
  if (report.verdict.ok) return [];
  const last = report.repairs[report.repairs.length - 1];
  // A build that failed before the first repair round (spec, or a budget that
  // ran out) has no complaint; its stage records are the only evidence.
  const issues = last
    ? last.issues
    : report.stages.flatMap((stage) => stage.issues);
  return issues.map(issueLine);
}

export function snapshotBuildReport(report: BuildReport): RunSnapshot {
  const last = report.stages[report.stages.length - 1];
  return {
    ok: report.verdict.ok,
    issues: outstandingIssues(report),
    status: last ? `${last.stage}/${last.status}` : null,
    tokens: null,
    costUsd: report.cost.usd
  };
}
