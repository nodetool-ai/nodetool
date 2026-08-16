/**
 * Renders a `SketchDebugReport` as human-readable Markdown for the bundle.
 */
import type { SketchDebugIssue, SketchDebugReport } from "./types.js";
import {
  isObjectLike,
  isString
} from "../predicates.js";

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

const where = (issue: SketchDebugIssue): string => {
  const parts = [
    issue.layerId ? `layer \`${issue.layerId}\`` : null,
    issue.path ? `\`${issue.path}\`` : null
  ].filter((part): part is string => part !== null);
  return parts.length > 0 ? parts.join(" · ") : "—";
};

function issueTable(
  title: string,
  issues: ReadonlyArray<SketchDebugIssue>,
  lines: string[]
): void {
  if (issues.length === 0) return;
  lines.push("", `## ${title}`, "");
  lines.push("| Severity | Code | Where | Message |");
  lines.push("| --- | --- | --- | --- |");
  for (const issue of issues) {
    lines.push(
      `| ${issue.severity} | \`${issue.code}\` | ${where(issue)} | ${short(issue.message, 300)} |`
    );
  }
}

interface SnapshotLayer {
  id?: string;
  name?: string;
  type?: string;
  visible?: boolean;
  opacity?: number;
  blendMode?: string;
  hasBinding?: boolean;
}

const asRecord = (value: unknown): Record<string, unknown> | null =>
  isObjectLike(value) ? value : null;

/**
 * The snapshot carries the whole layer stack; the markdown wants one line per
 * layer, top of the stack first, rather than a JSON dump.
 */
function finalStateLines(state: unknown): string[] {
  const record = asRecord(state);
  const layers = Array.isArray(record?.layers)
    ? (record.layers as SnapshotLayer[])
    : null;
  if (!layers) return [`- ${short(state, 600)}`];

  const lines: string[] = [];
  const canvas = `${String(record?.width ?? "?")}×${String(record?.height ?? "?")}`;
  lines.push(`- canvas ${canvas}, active layer \`${String(record?.activeLayerId ?? "none")}\``);
  for (const layer of [...layers].reverse()) {
    lines.push(
      `- \`${layer.id ?? "?"}\`${layer.name ? ` "${layer.name}"` : ""} ` +
        `${layer.type ?? "?"} · opacity ${layer.opacity ?? 1} · ${layer.blendMode ?? "normal"}` +
        `${layer.visible === false ? " · hidden" : ""}${layer.hasBinding ? " · bound" : ""}`
    );
  }
  return lines;
}

export function renderSketchReportMarkdown(report: SketchDebugReport): string {
  const lines: string[] = [];
  const title = report.target.name ?? report.target.ref;
  lines.push(`# Sketch debug: ${title}`);
  lines.push("");
  lines.push(`${report.verdict.ok ? "✅" : "❌"} ${report.verdict.headline}`);
  lines.push("");
  lines.push(`Target: \`${report.target.ref}\` (${report.target.kind})`);
  lines.push(
    `Document: ${report.meta.width}×${report.meta.height} on ${report.meta.backgroundColor} · ` +
      `${report.meta.layerCount} layer(s), ${report.meta.bindingCount} binding(s)`
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

  if (report.finalState !== undefined) {
    lines.push("", "## Final state", "");
    lines.push(...finalStateLines(report.finalState));
  }

  if (report.notSimulated.length > 0) {
    lines.push("", "## Not simulated", "");
    for (const entry of report.notSimulated) lines.push(`- ${entry}`);
  }

  lines.push("");
  return lines.join("\n");
}
