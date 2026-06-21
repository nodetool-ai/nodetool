/**
 * Resolves a workflow debug target (DB id, JSON file, or TypeScript DSL file)
 * into a normalized runner-shape graph plus metadata.
 *
 * Mirrors the resolution + normalization the `workflows run` command does so the
 * debug harness executes the exact same graph the runner would.
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { DebugGraph, DebugTargetInfo } from "./types.js";

export interface ResolvedTarget {
  info: DebugTargetInfo;
  graph: DebugGraph;
  /** Params discovered in a file's `params` field, merged under caller params. */
  fileParams: Record<string, unknown>;
}

function looksLikeFile(ref: string): boolean {
  return (
    ref.endsWith(".json") ||
    ref.endsWith(".ts") ||
    ref.endsWith(".tsx") ||
    ref.includes("/") ||
    ref.includes("\\")
  );
}

/** Convert ReactFlow `node.data` to kernel `node.properties` in place. */
function normalizeGraph(graph: DebugGraph): DebugGraph {
  return {
    nodes: (graph.nodes ?? []).map((n) => {
      if (n.properties === undefined && n.data !== undefined) {
        const { data, ...rest } = n;
        return { ...rest, properties: data };
      }
      return n;
    }),
    edges: graph.edges ?? []
  };
}

/**
 * Load a workflow from a file (JSON or DSL) or the local DB.
 *
 * `loadFromDb` is injected so this module stays free of a hard `@nodetool-ai/models`
 * import at module load (keeps it light for the command-registration test path).
 */
export async function resolveTarget(
  ref: string,
  loadFromDb: (id: string) => Promise<{ graph: DebugGraph } | null>
): Promise<ResolvedTarget> {
  let raw: { graph?: DebugGraph; nodes?: unknown[]; edges?: unknown[]; id?: string; workflow_id?: string; params?: Record<string, unknown> };
  let source: DebugTargetInfo["source"];
  let workflowId: string | null;
  const fileParams: Record<string, unknown> = {};

  if (looksLikeFile(ref)) {
    if (ref.endsWith(".ts") || ref.endsWith(".tsx")) {
      // DSL file: execute via tsx and capture the emitted JSON workflow.
      const { execSync } = await import("node:child_process");
      const output = execSync(`npx tsx "${resolve(ref)}"`, {
        encoding: "utf8",
        cwd: dirname(resolve(ref)),
        timeout: 30000
      });
      raw = JSON.parse(output.trim());
      source = "dsl";
    } else {
      raw = JSON.parse(readFileSync(ref, "utf8"));
      source = "json";
    }
    workflowId = raw.workflow_id ?? raw.id ?? null;
    if (raw.params) Object.assign(fileParams, raw.params);
  } else {
    const wf = await loadFromDb(ref);
    if (!wf) throw new Error(`Workflow not found: ${ref}`);
    raw = wf;
    workflowId = ref;
    source = "id";
  }

  const rawGraph: DebugGraph = (raw.graph ?? (raw as DebugGraph)) as DebugGraph;
  if (!rawGraph?.nodes || !rawGraph?.edges) {
    throw new Error("Invalid workflow: missing nodes or edges");
  }
  const graph = normalizeGraph(rawGraph);

  return {
    info: {
      ref,
      source,
      workflowId,
      nodeCount: graph.nodes.length,
      edgeCount: graph.edges.length
    },
    graph,
    fileParams
  };
}
