/**
 * Renders an `AppDebugReport` as human-readable Markdown for the bundle.
 */
import type { AppDebugReport } from "./types.js";

const short = (value: unknown, max = 120): string => {
  if (value === undefined) return "—";
  let s: string;
  try {
    s = typeof value === "string" ? value : JSON.stringify(value);
  } catch {
    s = String(value);
  }
  s = (s ?? "null").replace(/\s+/g, " ");
  return s.length > max ? `${s.slice(0, max)}…` : s;
};

export function renderAppReportMarkdown(report: AppDebugReport): string {
  const lines: string[] = [];
  const title = report.app?.title ?? report.target.workflowId ?? report.target.ref;
  lines.push(`# App debug: ${title}`);
  lines.push("");
  lines.push(`${report.verdict.ok ? "✅" : "❌"} ${report.verdict.headline}`);
  lines.push("");
  lines.push(
    `Target: \`${report.target.ref}\` (${report.target.source}) — ` +
      `${report.target.nodeCount} nodes, ${report.target.edgeCount} edges, ` +
      `${report.app?.widgetCount ?? 0} widgets`
  );
  lines.push(
    `Bindable surface: inputs [${report.io.inputs.join(", ")}] · ` +
      `outputs [${report.io.outputs.join(", ")}] · ` +
      `variables [${report.io.variables.join(", ")}]`
  );

  if (report.verdict.issues.length > 0) {
    lines.push("", "## Issues");
    for (const issue of report.verdict.issues) lines.push(`- ${issue}`);
  }
  if (report.validation.warnings.length > 0) {
    lines.push("", "## Warnings");
    for (const warning of report.validation.warnings) lines.push(`- ${warning}`);
  }

  if (report.interactions.length > 0) {
    lines.push("", "## Interactions");
    for (const i of report.interactions) {
      const actions = i.actions.length > 0 ? i.actions.join(", ") : "no actions";
      const run = i.runIndex != null ? ` → run ${i.runIndex + 1}` : "";
      const err = i.error ? ` — ⚠ ${i.error}` : "";
      lines.push(`- ${i.step}: ${actions}${run}${err}`);
    }
  }

  if (report.runs.length > 0) {
    lines.push("", "## Runs");
    report.runs.forEach((run, index) => {
      lines.push(
        `- run ${index + 1}: ${run.status} in ${run.durationMs}ms — ` +
          `${run.summary.counts.completed}/${run.summary.counts.nodes} nodes completed, ` +
          `${run.summary.counts.errored} error(s)` +
          (run.error ? ` — ${short(run.error, 200)}` : "")
      );
    });
  }

  if (report.widgets.length > 0) {
    lines.push("", "## Widget state", "");
    lines.push("| Widget | Mode | Binding | Value |");
    lines.push("| --- | --- | --- | --- |");
    for (const w of report.widgets) {
      lines.push(
        `| ${w.type} \`${w.id}\` | ${w.bindingMode} | ${w.binding ?? "—"} | ${short(w.value)} |`
      );
    }
  }

  const values = Object.entries(report.values);
  if (values.length > 0) {
    lines.push("", "## Final values", "");
    for (const [key, value] of values) {
      lines.push(`- \`${key}\`: ${short(value, 300)}`);
    }
  }

  lines.push("");
  return lines.join("\n");
}
