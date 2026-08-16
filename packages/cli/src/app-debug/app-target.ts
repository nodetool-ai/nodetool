/**
 * Resolves an app debug target into an application document plus the graphs it
 * runs.
 *
 * An app can be named three ways, and all three end up in the same shape:
 *
 * - an **application id** — the canonical form, read from the applications
 *   table through an injected loader (no server involved) and resolved by
 *   `applicationTarget`, which the server surface calls too;
 * - an **ApplicationBundle JSON file** — an app together with the full graphs
 *   of every workflow it binds, where operations reference bundle-local keys;
 * - a **workflow id or workflow JSON/DSL file** — the legacy form, where the
 *   document sits on `workflow.app_doc` and is lifted by `liftLegacyAppDoc`.
 *
 * The harness downstream sees one shape regardless: a raw document (for the
 * bundle's `app.json` and persist-downgrade warnings), the parsed document, a
 * host graph, and the graphs the target itself carries keyed by whatever id
 * the operations reference.
 */
import {
  liftLegacyAppDoc,
  parseApplicationBundle
} from "@nodetool-ai/app-runtime";

import { looksLikeFile, normalizeGraph, readFileTarget } from "../debug/target.js";
import type { DebugGraph, DebugTargetInfo } from "../debug/types.js";
// The resolved shape is the simulator's input, and so is the resolution of an
// application row — both live with the simulator so the CLI and the server
// surfaces cannot drift.
import {
  applicationTarget,
  bundleTarget,
  type AppApplicationRecord,
  type AppWorkflowRecord,
  type ResolvedAppTarget
} from "@nodetool-ai/execution/app-debug";
import {
  isRecord,
  isString
} from "../predicates.js";

export type { ResolvedAppTarget, AppApplicationRecord, AppWorkflowRecord };

export interface AppTargetDeps {
  /** Load a workflow by DB id, including its legacy `app_doc`. */
  loadFromDb: (id: string) => Promise<AppWorkflowRecord | null>;
  /** Load an application by DB id. Omitted when the caller has no DB. */
  loadApplication?: (id: string) => Promise<AppApplicationRecord | null>;
}

const EMPTY_GRAPH: DebugGraph = { nodes: [], edges: [] };

const targetInfo = (
  ref: string,
  source: DebugTargetInfo["source"],
  workflowId: string | null,
  graph: DebugGraph
): DebugTargetInfo => ({
  ref,
  source,
  workflowId,
  nodeCount: graph.nodes.length,
  edgeCount: graph.edges.length
});

/** A bundle file carries `app` and `workflows`; a workflow file carries neither. */
const looksLikeBundle = (raw: unknown): boolean =>
  isRecord(raw) && isRecord(raw.app) && Array.isArray(raw.workflows);

const graphOf = (value: unknown): DebugGraph | null => {
  if (!isRecord(value)) return null;
  const { nodes, edges } = value;
  if (!Array.isArray(nodes) || !Array.isArray(edges)) return null;
  return normalizeGraph({ nodes, edges });
};

/** Resolve an ApplicationBundle JSON file. */
function resolveBundle(ref: string, raw: unknown): ResolvedAppTarget {
  const bundle = parseApplicationBundle(raw);
  const rawApp = isRecord(raw) ? raw.app : null;
  if (!bundle) {
    return {
      info: targetInfo(ref, "bundle", null, EMPTY_GRAPH),
      graph: EMPTY_GRAPH,
      fileParams: {},
      appDoc: rawApp,
      document: null,
      issue: `${ref} is not a valid application bundle (no parsable \`app\` document).`,
      graphs: new Map(),
      operationsReferenceKeys: true,
      appName: null
    };
  }
  // The bundle → target mapping lives with the simulator, so the file path
  // here and the build harness's in-memory path cannot drift.
  return bundleTarget(bundle, ref, rawApp);
}

/** Resolve a workflow target — id, JSON file, or DSL file — via its `app_doc`. */
function resolveWorkflow(
  ref: string,
  raw: unknown,
  source: DebugTargetInfo["source"]
): ResolvedAppTarget {
  const record = isRecord(raw) ? raw : {};
  const workflowId =
    (isString(record.workflow_id) ? record.workflow_id : null) ??
    (isString(record.id) ? record.id : null);
  const rawGraph = graphOf(record.graph) ?? graphOf(record);
  if (!rawGraph) throw new Error("Invalid workflow: missing nodes or edges");

  const appDoc = record.app_doc ?? null;
  const document = liftLegacyAppDoc({ id: workflowId ?? "", app_doc: appDoc });
  const graphs = new Map<string, DebugGraph>();
  if (workflowId) graphs.set(workflowId, rawGraph);

  const issue = document
    ? null
    : appDoc == null
      ? "Workflow has no app_doc — build the app in the App Builder first."
      : "app_doc is not a valid application document (no `ui`/`data`).";

  return {
    info: targetInfo(ref, source, workflowId, rawGraph),
    graph: rawGraph,
    fileParams: isRecord(record.params) ? { ...record.params } : {},
    appDoc,
    document,
    issue,
    graphs,
    operationsReferenceKeys: false,
    appName: null
  };
}

/**
 * Resolve an app debug target: an application id, an ApplicationBundle JSON
 * file, or a workflow id / workflow file carrying a legacy `app_doc`.
 */
export async function resolveAppTarget(
  ref: string,
  deps: AppTargetDeps
): Promise<ResolvedAppTarget> {
  if (looksLikeFile(ref)) {
    const { raw, source } = await readFileTarget(ref);
    return looksLikeBundle(raw)
      ? resolveBundle(ref, raw)
      : resolveWorkflow(ref, raw, source);
  }

  if (deps.loadApplication) {
    const application = await deps.loadApplication(ref);
    if (application) return applicationTarget(ref, application, deps.loadFromDb);
  }

  const workflow = await deps.loadFromDb(ref);
  if (!workflow) {
    throw new Error(
      deps.loadApplication
        ? `No application or workflow found: ${ref}`
        : `Workflow not found: ${ref}`
    );
  }
  return resolveWorkflow(ref, { ...workflow, id: ref }, "id");
}
