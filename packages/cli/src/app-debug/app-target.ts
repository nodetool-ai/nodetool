/**
 * Resolves an app debug target into an application document plus the graphs it
 * runs.
 *
 * An app can be named three ways, and all three end up in the same shape:
 *
 * - an **application id** — the canonical form, read from the applications
 *   table through an injected loader (no server involved);
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
  parseApplicationBundle,
  parseApplicationDocument,
  type ApplicationDocument
} from "@nodetool-ai/app-runtime";

import {
  looksLikeFile,
  normalizeGraph,
  readFileTarget
} from "../debug/target.js";
import type { DebugGraph, DebugTargetInfo } from "../debug/types.js";

/** A workflow row as the harness needs it. */
export interface AppWorkflowRecord {
  graph: DebugGraph;
  app_doc?: unknown;
}

/** An application row, with its document still unparsed. */
export interface AppApplicationRecord {
  id: string;
  name: string;
  description?: string;
  /** The stored document — a JSON string or an already-parsed object. */
  document: unknown;
}

export interface AppTargetDeps {
  /** Load a workflow by DB id, including its legacy `app_doc`. */
  loadFromDb: (id: string) => Promise<AppWorkflowRecord | null>;
  /** Load an application by DB id. Omitted when the caller has no DB. */
  loadApplication?: (id: string) => Promise<AppApplicationRecord | null>;
}

export interface ResolvedAppTarget {
  info: DebugTargetInfo;
  /**
   * The graph the report's IO summary and branch analysis are computed
   * against: the default operation's workflow, or the workflow itself on the
   * legacy path. Empty when nothing resolved.
   */
  graph: DebugGraph;
  /** Params discovered in a file's `params` field, merged under caller params. */
  fileParams: Record<string, unknown>;
  /** The document exactly as stored, for `app.json` and persist warnings. */
  appDoc: unknown;
  /** The parsed document, or null with {@link issue} explaining why. */
  document: ApplicationDocument | null;
  /** Why no document could be parsed. */
  issue: string | null;
  /** Graphs the target carries, keyed by the id its operations reference. */
  graphs: Map<string, DebugGraph>;
  /**
   * True when those keys are bundle-local, so no operation names a real
   * workflow id and nothing can be handed to the runner as one.
   */
  operationsReferenceKeys: boolean;
  /** The application's name, when the target is an app rather than a workflow. */
  appName: string | null;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

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
  const graph = value as unknown as DebugGraph;
  if (!Array.isArray(graph.nodes) || !Array.isArray(graph.edges)) return null;
  return normalizeGraph(graph);
};

/**
 * The graph the document's first operation runs, plus the id it referenced.
 * Carried graphs win over the database, so a bundle resolves without one.
 */
async function hostGraphFor(
  document: ApplicationDocument,
  graphs: Map<string, DebugGraph>,
  loadFromDb: AppTargetDeps["loadFromDb"]
): Promise<{ graph: DebugGraph; workflowId: string | null }> {
  for (const operation of document.operations) {
    const id = operation.workflowId;
    if (!id) continue;
    const carried = graphs.get(id);
    if (carried) return { graph: carried, workflowId: null };
    try {
      const workflow = await loadFromDb(id);
      const graph = workflow?.graph ? normalizeGraph(workflow.graph) : null;
      if (graph) {
        graphs.set(id, graph);
        return { graph, workflowId: id };
      }
    } catch {
      // A workflow that will not load is reported per-operation by the
      // harness; the host graph just stays empty.
    }
  }
  return { graph: EMPTY_GRAPH, workflowId: null };
}

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
  const graphs = new Map<string, DebugGraph>();
  for (const workflow of bundle.workflows) {
    const graph = graphOf(workflow.graph);
    if (graph) graphs.set(workflow.key, graph);
  }
  const host =
    bundle.app.operations
      .map((operation) => graphs.get(operation.workflowId))
      .find((graph): graph is DebugGraph => graph !== undefined) ?? EMPTY_GRAPH;
  return {
    // A bundle's operations reference bundle-local keys, not workflow ids, so
    // there is no workflow id to report or hand to the runner.
    info: targetInfo(ref, "bundle", null, host),
    graph: host,
    fileParams: {},
    appDoc: rawApp,
    document: bundle.app,
    issue: null,
    graphs,
    operationsReferenceKeys: true,
    appName: bundle.name
  };
}

/** Resolve a workflow target — id, JSON file, or DSL file — via its `app_doc`. */
function resolveWorkflow(
  ref: string,
  raw: unknown,
  source: DebugTargetInfo["source"]
): ResolvedAppTarget {
  const record = isRecord(raw) ? raw : {};
  const workflowId =
    (typeof record.workflow_id === "string" ? record.workflow_id : null) ??
    (typeof record.id === "string" ? record.id : null);
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

/** Resolve an application row read from the database. */
async function resolveApplication(
  ref: string,
  record: AppApplicationRecord,
  loadFromDb: AppTargetDeps["loadFromDb"]
): Promise<ResolvedAppTarget> {
  let raw: unknown = record.document;
  if (typeof raw === "string") {
    try {
      raw = JSON.parse(raw);
    } catch {
      raw = null;
    }
  }
  const document = parseApplicationDocument(raw);
  if (!document) {
    return {
      info: targetInfo(ref, "application", null, EMPTY_GRAPH),
      graph: EMPTY_GRAPH,
      fileParams: {},
      appDoc: raw,
      document: null,
      issue: `Application "${record.id}" has no valid document.`,
      graphs: new Map(),
      operationsReferenceKeys: false,
      appName: record.name
    };
  }
  const graphs = new Map<string, DebugGraph>();
  const host = await hostGraphFor(document, graphs, loadFromDb);
  return {
    info: targetInfo(ref, "application", host.workflowId, host.graph),
    graph: host.graph,
    fileParams: {},
    appDoc: raw,
    document,
    issue: null,
    graphs,
    operationsReferenceKeys: false,
    appName: record.name
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
    if (application) return resolveApplication(ref, application, deps.loadFromDb);
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
