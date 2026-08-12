/**
 * Human-readable rendering of a `JsScriptValidation`, kept beside the JS-script
 * commands the way `sketch-validation-output.ts` sits beside the sketch ones.
 * Split out so more than one command can print a check the same way.
 */
import type {
  JsScriptDebugIssue,
  JsScriptValidation
} from "@nodetool-ai/execution/js-script-debug";

/** Headline, then one line per issue — errors before warnings. */
export function renderJsScriptValidation(
  validation: JsScriptValidation
): string[] {
  const errors = validation.errors.length;
  const warnings = validation.warnings.length;
  const mark = validation.ok ? (warnings ? "⚠️" : "✅") : "❌";
  const lines = ["", `${mark} ${errors} error(s), ${warnings} warning(s)`];
  if (errors + warnings === 0) return lines;

  lines.push("");
  for (const issue of [...validation.errors, ...validation.warnings]) {
    lines.push(`  ${formatJsScriptIssue(issue)}`);
  }
  return lines;
}

function formatJsScriptIssue(issue: JsScriptDebugIssue): string {
  const tag = issue.severity === "error" ? "error" : "warn ";
  const where = issue.path != null ? ` [${issue.path}]` : "";
  return `${tag} ${issue.message}${where} (${issue.code})`;
}
