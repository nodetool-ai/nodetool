/**
 * `nodetool workflows migrate-code-inputs` — rewrite stored Code node bodies
 * for the `inputs` object.
 *
 * A Code node's declared inputs used to arrive as globals of their own name.
 * They now arrive on one `inputs` object, so a body written the old way throws
 * a ReferenceError on its first input read. This walks the saved workflows and
 * rewrites `name` to `inputs.name` for every declared input, using the AST so a
 * name inside a string, a comment, an object key, or a local binding is left
 * alone.
 *
 * Safe to re-run: a body already reading `inputs.*` has nothing to rewrite.
 */
import { Workflow } from "@nodetool-ai/models";
import {
  migrateCodeBodyToInputs,
  isJsCodeNodeType
} from "@nodetool-ai/node-sdk";
import {
  isNonBlankString,
  isObjectLike,
  isString
} from "../predicates.js";

/** The CLI's local-mode user, matching `nodetool.ts`. */
const LOCAL_USER_ID = "1";

export interface MigrateCodeInputsOptions {
  dryRun?: boolean;
  /** Migrate this user's workflows instead of the local user's. */
  userId?: string;
  json?: boolean;
}

export interface MigrateCodeInputsReport {
  workflowsScanned: number;
  codeNodesScanned: number;
  nodesRewritten: number;
  workflowsUpdated: number;
  failed: number;
  entries: Array<{
    workflowId: string;
    workflowName: string;
    nodeId: string;
    rewritten: string[];
    error?: string;
  }>;
}

interface GraphNode {
  id?: unknown;
  type?: unknown;
  data?: Record<string, unknown>;
  dynamic_properties?: Record<string, unknown>;
  dynamic_inputs?: Record<string, unknown>;
}

interface GraphEdge {
  target?: unknown;
  targetHandle?: unknown;
}

function asRecord(value: unknown): Record<string, unknown> {
  return isObjectLike(value) ? (value as Record<string, unknown>) : {};
}

/**
 * Every name the node can read: its declared slots, its inline dynamic
 * properties, and any handle an edge feeds. The same three sources the graph
 * validator uses — a body reading a handle it is wired to is as much an input
 * as one reading a declared slot.
 */
function inputNamesFor(node: GraphNode, edges: readonly GraphEdge[]): string[] {
  const names = new Set<string>([
    ...Object.keys(asRecord(node.dynamic_properties)),
    ...Object.keys(asRecord(node.dynamic_inputs))
  ]);
  for (const edge of edges) {
    if (edge.target === node.id && isString(edge.targetHandle)) {
      names.add(edge.targetHandle);
    }
  }
  return [...names].filter((name) => name.length > 0);
}

export async function migrateCodeInputs(
  options: MigrateCodeInputsOptions = {}
): Promise<MigrateCodeInputsReport> {
  const report: MigrateCodeInputsReport = {
    workflowsScanned: 0,
    codeNodesScanned: 0,
    nodesRewritten: 0,
    workflowsUpdated: 0,
    failed: 0,
    entries: []
  };

  const [items] = await Workflow.paginate(options.userId ?? LOCAL_USER_ID, {
    limit: 10_000
  });

  for (const workflow of items) {
    report.workflowsScanned++;
    const graph = workflow.graph;
    // SAFETY: a stored graph's nodes and edges are the editor's own node and
    // edge records; the Array guard rejects a row whose graph was never one.
    const nodes = Array.isArray(graph?.nodes) ? (graph.nodes as GraphNode[]) : [];
    const edges = Array.isArray(graph?.edges) ? (graph.edges as GraphEdge[]) : [];
    let touched = false;

    for (const node of nodes) {
      if (!isString(node.type) || !isJsCodeNodeType(node.type)) {
        continue;
      }
      report.codeNodesScanned++;
      const data = asRecord(node.data);
      const code = data.code;
      if (!isNonBlankString(code)) continue;

      try {
        const result = migrateCodeBodyToInputs(code, inputNamesFor(node, edges));
        if (!result.changed) continue;
        data.code = result.code;
        node.data = data;
        touched = true;
        report.nodesRewritten++;
        report.entries.push({
          workflowId: String(workflow.id),
          workflowName: String(workflow.name ?? ""),
          nodeId: String(node.id ?? ""),
          rewritten: result.rewritten
        });
      } catch (error) {
        report.failed++;
        report.entries.push({
          workflowId: String(workflow.id),
          workflowName: String(workflow.name ?? ""),
          nodeId: String(node.id ?? ""),
          rewritten: [],
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }

    if (touched) {
      report.workflowsUpdated++;
      if (!options.dryRun) {
        workflow.graph = graph;
        await workflow.save();
      }
    }
  }

  return report;
}

export function formatMigrateCodeInputsReport(
  report: MigrateCodeInputsReport,
  dryRun: boolean
): string {
  const lines: string[] = [];
  for (const entry of report.entries) {
    const where = `${entry.workflowName || entry.workflowId} › ${entry.nodeId}`;
    lines.push(
      entry.error
        ? `  fail  ${where}: ${entry.error}`
        : `  ${dryRun ? "would" : "moved"}  ${where}: ${entry.rewritten.join(", ")}`
    );
  }
  lines.push(
    `\n${report.nodesRewritten} Code node(s) in ${report.workflowsUpdated} workflow(s) ` +
      `${dryRun ? "would be" : "were"} rewritten ` +
      `(${report.codeNodesScanned} scanned across ${report.workflowsScanned} workflows).`
  );
  if (report.failed > 0) lines.push(`${report.failed} failed.`);
  return lines.join("\n");
}
