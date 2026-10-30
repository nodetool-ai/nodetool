/**
 * One rendering of a document validation, shared by the timeline, sketch and
 * JS-script commands. A restored document is checked and reported exactly the
 * way a validated one is, and all three read the same on screen.
 */

export interface ValidationIssueLike {
  severity: string;
  message: string;
  code: string;
  path?: string | null;
}

export interface ValidationLike<I extends ValidationIssueLike> {
  ok: boolean;
  errors: I[];
  warnings: I[];
}

/** `[path]` when the issue carries one, nothing otherwise. */
export function issueLocation(issue: ValidationIssueLike): string {
  return issue.path != null ? ` [${issue.path}]` : "";
}

/**
 * Headline, then one line per issue — errors before warnings. `where` names the
 * part of the document an issue points at; per-document renderers pass the
 * locator their issue type carries and fall back to `issueLocation`.
 */
export function renderValidation<I extends ValidationIssueLike>(
  validation: ValidationLike<I>,
  where: (issue: I) => string = issueLocation
): string[] {
  const errors = validation.errors.length;
  const warnings = validation.warnings.length;
  const mark = validation.ok ? (warnings ? "⚠️" : "✅") : "❌";
  const lines = ["", `${mark} ${errors} error(s), ${warnings} warning(s)`];
  if (errors + warnings === 0) return lines;

  lines.push("");
  for (const issue of [...validation.errors, ...validation.warnings]) {
    const tag = issue.severity === "error" ? "error" : "warn ";
    lines.push(`  ${tag} ${issue.message}${where(issue)} (${issue.code})`);
  }
  return lines;
}
