/**
 * Renders an `AppDebugReport` as human-readable Markdown for the bundle.
 */
import type { AppDebugReport } from "./types.js";
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
  const warnings = [
    ...report.validation.warnings,
    ...(report.verdict.warnings ?? [])
  ];
  if (warnings.length > 0) {
    lines.push("", "## Warnings");
    for (const warning of warnings) lines.push(`- ${warning}`);
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

  const operations = report.spec?.operations ?? [];
  if (operations.length > 0) {
    lines.push("", "## Operations", "");
    for (const op of operations) {
      const timeout = op.timeoutMs != null ? `, timeout ${op.timeoutMs}ms` : "";
      const state = op.unavailable ? ` — ⚠ ${op.unavailable}` : "";
      lines.push(
        `- \`${op.id}\` → workflow \`${op.workflowId || "(host)"}\` (policy ${op.policy}${timeout})${state}`
      );
    }
  }

  if (report.invocations.length > 0) {
    lines.push("", "## Invocations", "");
    lines.push("| Invocation | Operation | Decision | Status | Run |");
    lines.push("| --- | --- | --- | --- | --- |");
    for (const inv of report.invocations) {
      const decision =
        inv.decisionTargets.length > 0
          ? `${inv.decision} (${inv.decisionTargets.join(", ")})`
          : inv.decision;
      const status = inv.timedOutMs != null
        ? `timed out after ${inv.timedOutMs}ms`
        : inv.status;
      lines.push(
        `| ${inv.id} | ${inv.operationId} | ${decision} | ${status} | ${
          inv.runIndex != null ? inv.runIndex + 1 : "—"
        } |`
      );
    }
  }

  if (report.activity.length > 0) {
    lines.push("", "## Activity", "");
    for (const entry of report.activity) {
      lines.push(`- ${entry.operationId} (${entry.invocationId}): ${short(entry.label)}`);
    }
  }

  if (report.widgets.length > 0) {
    lines.push("", "## Widget state", "");
    lines.push("| Widget | Mode | Binding | Value | State |");
    lines.push("| --- | --- | --- | --- | --- |");
    for (const w of report.widgets) {
      // A widget with a `format` template shows the rendered text, not the raw
      // bound value — the preview says what a user would read.
      const shown = w.display != null ? short(w.display) : short(w.value);
      const state = !w.visible ? "hidden" : w.disabled ? "disabled" : "visible";
      lines.push(
        `| ${w.type} \`${w.id}\` | ${w.bindingMode} | ${w.binding ?? "—"} | ${shown} | ${state} |`
      );
    }
  }

  if (report.resources?.length > 0) {
    lines.push("", "## Resources", "");
    for (const resource of report.resources) {
      const items = resource.seeded
        ? `${resource.items.length} item(s)${
            resource.selected ? `, selected \`${resource.selected}\`` : ""
          }`
        : "not seeded";
      const commands =
        resource.commands.length > 0 ? ` — ${resource.commands.join(", ")}` : "";
      lines.push(`- \`${resource.id}\` (${resource.kind}): ${items}${commands}`);
    }
  }

  const values = Object.entries(report.values);
  if (values.length > 0) {
    lines.push("", "## Final values", "");
    for (const [key, value] of values) {
      lines.push(`- \`${key}\`: ${short(value, 300)}`);
    }
  }

  const variables = Object.entries(report.variables);
  if (variables.length > 0) {
    lines.push("", "## Variables", "");
    for (const [key, value] of variables) {
      lines.push(`- \`${key}\`: ${short(value, 300)}`);
    }
  }

  if (report.notSimulated?.length > 0) {
    lines.push("", "## Not simulated", "");
    for (const entry of report.notSimulated) lines.push(`- ${entry}`);
  }

  lines.push("");
  return lines.join("\n");
}
