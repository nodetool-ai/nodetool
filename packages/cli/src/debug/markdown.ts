/**
 * Renders a `DebugReport` as a human-readable Markdown document (report.md in
 * the bundle). Pure — no IO — so it's trivially testable.
 */
import type {
  BrowserRunReport,
  DebugReport,
  ExecutionSummary,
  ServerRunReport,
  TraceSummary
} from "./types.js";

function fmtMs(ms: number | null | undefined): string {
  if (ms === null || ms === undefined) return "—";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

function summarySection(summary: ExecutionSummary): string[] {
  const lines: string[] = [];
  const c = summary.counts;
  lines.push(
    `- Status: **${summary.status}**` + (summary.error ? ` — ${summary.error}` : "")
  );
  lines.push(
    `- Nodes: ${c.nodes} (completed ${c.completed}, errored ${c.errored}) · ` +
      `outputs ${c.outputs} · logs ${c.logs} · llm calls ${c.llmCalls}`
  );

  if (summary.errors.length > 0) {
    lines.push("", "**Errors**");
    for (const e of summary.errors) {
      lines.push(`- \`${e.nodeType ?? e.nodeId ?? "workflow"}\`: ${e.message}`);
    }
  }

  const failing = summary.nodes.filter((n) => n.error);
  if (failing.length > 0) {
    lines.push("", "**Failing nodes**");
    for (const n of failing) {
      lines.push(`- \`${n.nodeType ?? n.nodeId}\` (${n.nodeId}) — ${n.error}`);
    }
  }

  if (summary.outputs.length > 0) {
    lines.push("", "**Outputs**");
    for (const o of summary.outputs.slice(0, 20)) {
      lines.push(`- \`${o.outputName}\` (${o.outputType}): ${JSON.stringify(o.value)}`);
    }
  }

  if (summary.llmCalls.length > 0) {
    lines.push("", "**LLM calls**");
    for (const call of summary.llmCalls.slice(0, 20)) {
      const tok = `${call.tokensInput ?? "?"}→${call.tokensOutput ?? "?"} tok`;
      const cost = call.cost != null ? ` · $${call.cost.toFixed(4)}` : "";
      lines.push(
        `- ${call.provider}/${call.model} · ${tok}${cost} · ${fmtMs(call.durationMs)}` +
          (call.error ? ` · ERROR ${call.error}` : "")
      );
    }
  }

  if (summary.logs.length > 0) {
    lines.push("", "**Logs**");
    for (const log of summary.logs.slice(0, 50)) {
      const where = log.nodeId ? ` [${log.nodeId}]` : "";
      lines.push(`- \`${log.severity}\`${where} ${log.content}`);
    }
    if (summary.logs.length > 50) lines.push(`- …and ${summary.logs.length - 50} more`);
  }

  return lines;
}

function traceSection(trace: TraceSummary): string[] {
  const lines = ["", "**Trace**"];
  lines.push(
    `- ${trace.spanCount} spans · ${fmtMs(trace.totalDurationMs)} wall · ` +
      `${trace.tokens.total} tokens · $${trace.costUsd.toFixed(4)}`
  );
  const names = Object.entries(trace.byName).sort((a, b) => b[1].totalDurationMs - a[1].totalDurationMs);
  for (const [name, agg] of names.slice(0, 10)) {
    lines.push(`- \`${name}\` ×${agg.count} · ${fmtMs(agg.totalDurationMs)}`);
  }
  return lines;
}

function serverSection(server: ServerRunReport): string[] {
  const lines = ["## Server surface", ""];
  lines.push(`Outcome: ${server.ok ? "✅ completed" : `❌ ${server.status}`} · ${fmtMs(server.durationMs)}`);
  lines.push(...summarySection(server.summary));
  if (server.trace) lines.push(...traceSection(server.trace));
  return lines;
}

function browserSection(browser: BrowserRunReport): string[] {
  const lines = ["## Browser surface", ""];
  if (browser.unavailableReason) {
    lines.push(`⚠️ Not run: ${browser.unavailableReason}`);
    return lines;
  }
  lines.push(
    `Outcome: ${browser.ok ? "✅ completed" : `❌ ${browser.status}`} · ${fmtMs(browser.durationMs)}`
  );
  lines.push(...summarySection(browser.summary));
  if (browser.consoleErrors.length > 0) {
    lines.push("", "**Console errors**");
    for (const err of browser.consoleErrors.slice(0, 20)) lines.push(`- ${err}`);
  }
  if (browser.screenshotFile) lines.push("", `Screenshot: \`${browser.screenshotFile}\``);
  return lines;
}

export function renderReportMarkdown(report: DebugReport): string {
  const lines: string[] = [];
  lines.push(`# Workflow debug report`, "");
  lines.push(`${report.verdict.ok ? "✅" : "❌"} **${report.verdict.headline}**`, "");
  lines.push(
    `- Target: \`${report.target.ref}\` (${report.target.source}` +
      (report.target.workflowId ? `, id ${report.target.workflowId}` : "") +
      `)`
  );
  lines.push(`- Graph: ${report.target.nodeCount} nodes, ${report.target.edgeCount} edges`);
  lines.push(`- Generated: ${report.generatedAt}`);

  if (report.verdict.issues.length > 0) {
    lines.push("", "## Issues", "");
    for (const issue of report.verdict.issues) lines.push(`- ${issue}`);
  }

  if (report.server) lines.push("", ...serverSection(report.server));
  if (report.browser) lines.push("", ...browserSection(report.browser));

  lines.push("");
  return lines.join("\n");
}
