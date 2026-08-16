/**
 * Renders a `JsScriptDebugReport` as human-readable Markdown for the bundle.
 */
import type { JsScriptDebugIssue, JsScriptDebugReport } from "./types.js";
import { isString } from "../predicates.js";

const short = (value: unknown, max = 120): string => {
  if (value === undefined) return "—";
  let s: string;
  try {
    s = isString(value) ? value : JSON.stringify(value);
  } catch {
    s = String(value);
  }
  s = (s ?? "null").replace(/\s+/g, " ");
  return s.length > max ? `${s.slice(0, max)}…` : s;
};

function issueTable(
  title: string,
  issues: ReadonlyArray<JsScriptDebugIssue>,
  lines: string[]
): void {
  if (issues.length === 0) return;
  lines.push("", `## ${title}`, "");
  lines.push("| Severity | Code | Where | Message |");
  lines.push("| --- | --- | --- | --- |");
  for (const issue of issues) {
    lines.push(
      `| ${issue.severity} | \`${issue.code}\` | ${issue.path ? `\`${issue.path}\`` : "—"} | ${short(issue.message, 300)} |`
    );
  }
}

export function renderJsScriptReportMarkdown(
  report: JsScriptDebugReport
): string {
  const lines: string[] = [];
  const title = report.target.name ?? report.target.ref;
  lines.push(`# JS script debug: ${title}`);
  lines.push("");
  lines.push(`${report.verdict.ok ? "✅" : "❌"} ${report.verdict.headline}`);
  lines.push("");
  lines.push(`Target: \`${report.target.ref}\` (${report.target.kind})`);
  lines.push(
    `Document: ${report.meta.inputCount} input(s), ${report.meta.outputCount} output(s), ` +
      `${report.meta.packageCount} package(s), ${report.meta.secretCount} secret(s), ` +
      `${report.meta.testCount} test(s) · timeout ${report.meta.timeoutSeconds}s · ` +
      `${report.meta.codeLength} chars of code`
  );

  if (report.verdict.issues.length > 0) {
    lines.push("", "## Issues", "");
    for (const issue of report.verdict.issues) lines.push(`- ${issue}`);
  }

  issueTable(
    "Validation",
    [...report.validation.errors, ...report.validation.warnings],
    lines
  );

  if (report.interactions.length > 0) {
    lines.push("", "## Interactions", "");
    lines.push("| Tool | OK | Input | Error |");
    lines.push("| --- | --- | --- | --- |");
    for (const step of report.interactions) {
      lines.push(
        `| \`${step.tool}\` | ${step.ok ? "✅" : "❌"} | ${short(step.input)} | ${
          step.error ? short(step.error, 200) : "—"
        } |`
      );
    }
  }

  if (report.finalValidation) {
    issueTable(
      "Validation after edits",
      [...report.finalValidation.errors, ...report.finalValidation.warnings],
      lines
    );
  }

  if (report.notSimulated.length > 0) {
    lines.push("", "## Not simulated", "");
    for (const entry of report.notSimulated) lines.push(`- ${entry}`);
  }

  lines.push("");
  return lines.join("\n");
}
