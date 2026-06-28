/**
 * `nodetool validate` — static workflow validator.
 *
 * Loads a workflow (DB id, JSON file, or DSL .ts file) and checks it against
 * the node registry without running it: unknown node types, missing required
 * properties, unselected models, dangling/mis-typed edges. Returns in well
 * under a second, so it's the fast pre-flight before an expensive `debug` run.
 * Heavy deps are imported lazily so command registration stays light.
 */
import type { Command } from "commander";
import {
  validationHeadline,
  type GraphValidationIssue,
  type GraphValidationReport
} from "@nodetool-ai/node-sdk";

interface ValidateCliOptions {
  json?: boolean;
  warningsAsErrors?: boolean;
}

export function registerValidateCommand(program: Command): void {
  program
    .command("validate <workflow_id_or_file>")
    .description(
      "Validate a workflow against the node registry without running it (unknown nodes, missing props, bad edges)"
    )
    .option("--json", "Print the full validation report as JSON")
    .option(
      "--warnings-as-errors",
      "Exit non-zero when there are warnings (not just errors)"
    )
    .action(async (ref: string, opts: ValidateCliOptions) => {
      try {
        const { runValidate } = await import("../validate/index.js");

        // Only a DB-id target needs the database; file/DSL targets validate
        // with no DB at all, so initialize it lazily on first lookup.
        let dbReady = false;
        const { target, report } = await runValidate(ref, {
          loadFromDb: async (id) => {
            if (!dbReady) {
              const { initDb } = await import("@nodetool-ai/models");
              const { getDefaultDbPath } = await import("@nodetool-ai/config");
              initDb(getDefaultDbPath());
              dbReady = true;
            }
            const { Workflow } = await import("@nodetool-ai/models");
            return Workflow.get(id) as Promise<{
              graph: { nodes: never[]; edges: never[] };
            } | null>;
          }
        });

        if (opts.json) {
          console.log(JSON.stringify({ target, report }, null, 2));
        } else {
          printValidation(report);
        }

        const failed =
          !report.ok ||
          (opts.warningsAsErrors === true && report.counts.warnings > 0);
        process.exit(failed ? 1 : 0);
      } catch (e) {
        console.error(String(e));
        process.exit(1);
      }
    });
}

function printValidation(report: GraphValidationReport): void {
  const mark = report.ok ? (report.counts.warnings ? "⚠️" : "✅") : "❌";
  console.log(`\n${mark} ${validationHeadline(report)}`);
  if (report.issues.length > 0) {
    console.log();
    for (const issue of report.issues) {
      console.log(`  ${formatIssue(issue)}`);
    }
  }
}

function formatIssue(issue: GraphValidationIssue): string {
  const tag = issue.severity === "error" ? "error" : "warn ";
  const where =
    issue.nodeId != null
      ? ` [${issue.nodeType ?? "node"} ${issue.nodeId}]`
      : issue.edgeId != null
        ? ` [edge ${issue.edgeId}]`
        : "";
  return `${tag} ${issue.message}${where}`;
}
