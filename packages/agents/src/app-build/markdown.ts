/**
 * The human half of a build report.
 *
 * `report.json` is what an agent reads; this is what a person opens first, so
 * it leads with the verdict and the issues that produced it and leaves the
 * evidence to the JSON.
 */

import { formatSupervisedSummary } from "@nodetool-ai/execution/debug";
import type { BuildReport } from "./types.js";

const money = (usd: number): string => `$${usd.toFixed(4)}`;

export function renderBuildReportMarkdown(report: BuildReport): string {
  const lines: string[] = [];
  const title = report.spec.title || "app build";
  lines.push(`# ${title}`, "");
  lines.push(
    `**${report.verdict.ok ? "OK" : "FAILED"}** — ${report.verdict.reason}`,
    ""
  );
  lines.push(
    `- target: ${report.target.specPath ?? (report.target.prompt || "(none)")}`,
    `- operations: ${report.spec.operations.length}`,
    `- widgets: ${report.spec.widgets.length}`,
    `- interactions: ${report.interactions.length}`,
    `- repair rounds: ${report.repairs.length}`,
    `- cost: ${money(report.cost.usd)}`,
    ""
  );

  lines.push("## Stages", "");
  lines.push("| stage | round | status | ms | cost | detail |");
  lines.push("| --- | --- | --- | --- | --- | --- |");
  for (const stage of report.stages) {
    lines.push(
      `| ${stage.stage} | ${stage.round} | ${stage.status} | ${stage.durationMs} | ${money(stage.costUsd)} | ${stage.detail ?? ""} |`
    );
  }
  lines.push("");

  if (report.repairs.length > 0) {
    lines.push("## Repairs", "");
    for (const complaint of report.repairs) {
      lines.push(`### Round ${complaint.round}`, "");
      for (const issue of complaint.issues) {
        lines.push(`- \`${issue.stage}/${issue.code}\` ${issue.message}`);
      }
      lines.push("");
    }
  }

  lines.push("## Interactions", "");
  for (const interaction of report.interactions) {
    lines.push(
      `- **${interaction.name}**${interaction.derived ? " (derived)" : ""} — ${interaction.steps.length} step(s), ${interaction.expect.length} expectation(s)`
    );
    for (const added of interaction.addedSteps) {
      lines.push(`  - seeded: ${added}`);
    }
  }
  lines.push("");

  if (report.judge) {
    lines.push("## Judge", "", `Model: ${report.judge.model}`, "");
    for (const verdict of report.judge.interactions) {
      lines.push(
        `- ${verdict.interaction}: ${verdict.achieved ? "achieved" : "not achieved"} — ${verdict.reasons.join("; ")}`
      );
    }
    lines.push("");
  }

  if (report.supervision) {
    lines.push(
      "## Supervision",
      "",
      formatSupervisedSummary(report.supervision.summary),
      ""
    );
    for (const entry of report.supervision.byInteraction) {
      for (const item of entry.interventions) {
        lines.push(
          `- **${entry.interaction}** — ${item.verdict.action} on \`${item.escalation.nodeId}\` (${item.decidedBy}): ${item.escalation.detail}`
        );
      }
    }
    lines.push("");
  }

  if (report.verdict.notSimulated.length > 0) {
    lines.push("## Not simulated", "");
    for (const entry of report.verdict.notSimulated) lines.push(`- ${entry}`);
    lines.push("");
  }

  return lines.join("\n");
}
