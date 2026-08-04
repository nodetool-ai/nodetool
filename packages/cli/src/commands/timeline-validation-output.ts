/**
 * Human-readable rendering of a `TimelineValidation`, shared by
 * `timeline validate` and `timeline versions restore` — a restored document is
 * checked and reported exactly the way a validated one is.
 */
import type {
  TimelineDebugIssue,
  TimelineValidation
} from "@nodetool-ai/execution/timeline-debug";

/** Headline, then one line per issue — errors before warnings. */
export function renderTimelineValidation(
  validation: TimelineValidation
): string[] {
  const errors = validation.errors.length;
  const warnings = validation.warnings.length;
  const mark = validation.ok ? (warnings ? "⚠️" : "✅") : "❌";
  const lines = ["", `${mark} ${errors} error(s), ${warnings} warning(s)`];
  if (errors + warnings === 0) return lines;

  lines.push("");
  for (const issue of [...validation.errors, ...validation.warnings]) {
    lines.push(`  ${formatTimelineIssue(issue)}`);
  }
  return lines;
}

function formatTimelineIssue(issue: TimelineDebugIssue): string {
  const tag = issue.severity === "error" ? "error" : "warn ";
  const where =
    issue.clipId != null
      ? ` [clip ${issue.clipId}]`
      : issue.trackId != null
        ? ` [track ${issue.trackId}]`
        : issue.path != null
          ? ` [${issue.path}]`
          : "";
  return `${tag} ${issue.message}${where} (${issue.code})`;
}
