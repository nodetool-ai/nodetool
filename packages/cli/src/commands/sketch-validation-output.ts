/**
 * Human-readable rendering of a `SketchValidation`, kept beside the sketch
 * commands the way `timeline-validation-output.ts` sits beside the timeline
 * ones. Split out so more than one command can print a check the same way.
 */
import type {
  SketchDebugIssue,
  SketchValidation
} from "@nodetool-ai/execution/sketch-debug";

/** Headline, then one line per issue — errors before warnings. */
export function renderSketchValidation(validation: SketchValidation): string[] {
  const errors = validation.errors.length;
  const warnings = validation.warnings.length;
  const mark = validation.ok ? (warnings ? "⚠️" : "✅") : "❌";
  const lines = ["", `${mark} ${errors} error(s), ${warnings} warning(s)`];
  if (errors + warnings === 0) return lines;

  lines.push("");
  for (const issue of [...validation.errors, ...validation.warnings]) {
    lines.push(`  ${formatSketchIssue(issue)}`);
  }
  return lines;
}

function formatSketchIssue(issue: SketchDebugIssue): string {
  const tag = issue.severity === "error" ? "error" : "warn ";
  const where =
    issue.layerId != null
      ? ` [layer ${issue.layerId}]`
      : issue.path != null
        ? ` [${issue.path}]`
        : "";
  return `${tag} ${issue.message}${where} (${issue.code})`;
}
