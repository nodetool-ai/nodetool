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
import { printCommandError } from "../command-errors.js";

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
          console.log(renderValidation(report).join("\n"));
        }

        const failed =
          !report.ok ||
          (opts.warningsAsErrors === true && report.counts.warnings > 0);
        process.exit(failed ? 1 : 0);
      } catch (e) {
        printCommandError(e, opts.json);
        process.exit(1);
      }
    });
}

/**
 * One line per issue code, printed as a legend under the issues so the report
 * explains itself without a trip to the docs.
 */
const CODE_LEGEND: Readonly<Record<string, string>> = {
  invalid_graph: "the graph's nodes or edges is not an array",
  unknown_node: "node type is not in the registry",
  duplicate_id: "two nodes share an id",
  property: "property is missing, empty, or the wrong shape",
  dangling_edge: "edge references a node the graph does not contain",
  unknown_handle: "edge references a handle the node does not have",
  type_mismatch: "the two ends of an edge carry different types",
  fan_in: "several edges target one input that takes a single value",
  untyped_dynamic_slot:
    "edge targets a dynamic input with no declared type, so the connection is not type-checked — expected on workflows saved before typed slots, one per dynamic edge; informational, never a failure",
  dynamic_type_mismatch:
    "inline value of a dynamic input does not match the type the slot declares",
  unknown_provider: "a model property names a provider the runtime cannot build",
  slot_type_alias:
    "a dynamic slot is typed with a JSON-Schema/TypeScript name instead of NodeTool's, so the handle will not connect",
  code_syntax: "a Code node's body is not valid JavaScript",
  code_module:
    "a Code node's body uses import/export, which the sandbox has no loader for",
  code_undefined_name:
    "a Code node reads a name that is neither a sandbox API nor one of its inputs",
  code_no_return: "a Code node can finish without returning its outputs",
  code_return_shape: "a Code node returns something other than an output object",
  code_missing_output: "a return path leaves a declared output unset",
  code_undeclared_output:
    "a Code node returns a key it does not declare as an output handle",
  code_unused_input: "a Code node input the body never reads"
};

/**
 * Human-readable report: headline, one line per issue, then a legend for the
 * codes that occurred. Pure so it can be asserted on directly.
 */
export function renderValidation(report: GraphValidationReport): string[] {
  const mark = report.ok ? (report.counts.warnings ? "⚠️" : "✅") : "❌";
  const lines = ["", `${mark} ${validationHeadline(report)}`];
  if (report.issues.length === 0) return lines;

  lines.push("");
  for (const issue of report.issues) {
    lines.push(`  ${formatIssue(issue)}`);
  }

  const codes = [...new Set(report.issues.map((i) => i.code))]
    .filter((code) => code in CODE_LEGEND)
    .sort();
  if (codes.length > 0) {
    lines.push("", "  Codes:");
    for (const code of codes) {
      lines.push(`    ${code} — ${CODE_LEGEND[code]}`);
    }
  }

  return lines;
}

function formatIssue(issue: GraphValidationIssue): string {
  const tag =
    issue.severity === "error"
      ? "error"
      : issue.severity === "info"
        ? "info "
        : "warn ";
  const where =
    issue.nodeId != null
      ? ` [${issue.nodeType ?? "node"} ${issue.nodeId}]`
      : issue.edgeId != null
        ? ` [edge ${issue.edgeId}]`
        : "";
  return `${tag} ${issue.message}${where} (${issue.code})`;
}
