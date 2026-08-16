/**
 * An application document as the simulator's input.
 *
 * Two ways in, one shape out:
 *
 * - {@link applicationTarget} — an application row read from the applications
 *   table, its `document` column still unparsed;
 * - {@link inlineDocumentTarget} — a document carried verbatim in a request,
 *   which is what an editor assistant grades: the draft it is editing has no
 *   row yet, and the row it does have is stale the moment the draft changes.
 *
 * Neither reads a database: the graphs an operation runs come from an injected
 * loader, the same dependency-injection the simulator itself uses. The CLI
 * re-exports both, so the `nodetool app debug` and server surfaces resolve an
 * application the same way.
 */
import {
  parseApplicationDocument,
  type ApplicationDocument
} from "@nodetool-ai/app-runtime";

import type { DebugGraph, DebugTargetInfo } from "../debug/types.js";
import { normalizeDebugGraph } from "./graph-shape.js";
import type { ResolvedAppTarget } from "./types.js";
import { isString } from "../predicates.js";

const EMPTY_GRAPH: DebugGraph = { nodes: [], edges: [] };

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

/** Load a workflow by DB id, including its legacy `app_doc`. */
export type AppWorkflowLoader = (
  id: string
) => Promise<AppWorkflowRecord | null>;

function targetInfo(
  ref: string,
  source: DebugTargetInfo["source"],
  workflowId: string | null,
  graph: DebugGraph
): DebugTargetInfo {
  return {
    ref,
    source,
    workflowId,
    nodeCount: graph.nodes.length,
    edgeCount: graph.edges.length
  };
}

/**
 * The stored document, parsed out of its JSON string when it is one.
 *
 * HOLDOUT (anti-slop/no-unknown-returns): the row's `document` column is
 * free-form JSON that {@link parseAppSpec} validates downstream; naming a type
 * here would claim a shape this function never checks.
 */
function rawDocumentOf(stored: unknown) {
  if (!isString(stored)) return stored;
  try {
    return JSON.parse(stored);
  } catch {
    return null;
  }
}

/**
 * The graph the document's first operation runs, plus the id it referenced.
 * Carried graphs win over the database, so a bundle resolves without one.
 */
export async function hostGraphFor(
  document: ApplicationDocument,
  graphs: Map<string, DebugGraph>,
  loadFromDb: AppWorkflowLoader
): Promise<{ graph: DebugGraph; workflowId: string | null }> {
  for (const operation of document.operations) {
    const id = operation.workflowId;
    if (!id) continue;
    const carried = graphs.get(id);
    if (carried) return { graph: carried, workflowId: null };
    try {
      const workflow = await loadFromDb(id);
      const graph = workflow?.graph ? normalizeDebugGraph(workflow.graph) : null;
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

/**
 * Resolve a raw application document — however the host got hold of it — into
 * a simulator target.
 *
 * @param ref      what to call the target in the report.
 * @param stored   the document as stored or posted: an object, or its JSON.
 * @param appName  the application's name, when the host knows it.
 * @param issueFor how to word "this document does not parse", so a row and an
 *                 inline draft each say what the caller can act on.
 */
async function documentTarget(
  ref: string,
  stored: unknown,
  loadFromDb: AppWorkflowLoader,
  appName: string | null,
  issueFor: () => string
): Promise<ResolvedAppTarget> {
  const raw = rawDocumentOf(stored);
  const document = parseApplicationDocument(raw);
  if (!document) {
    return {
      info: targetInfo(ref, "application", null, EMPTY_GRAPH),
      graph: EMPTY_GRAPH,
      fileParams: {},
      appDoc: raw,
      document: null,
      issue: issueFor(),
      graphs: new Map(),
      operationsReferenceKeys: false,
      appName
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
    appName
  };
}

/** Resolve an application row read from the database. */
export function applicationTarget(
  ref: string,
  record: AppApplicationRecord,
  loadFromDb: AppWorkflowLoader
): Promise<ResolvedAppTarget> {
  return documentTarget(
    ref,
    record.document,
    loadFromDb,
    record.name,
    () => `Application "${record.id}" has no valid document.`
  );
}

/**
 * Resolve a document carried inline — an unsaved draft the caller posted. The
 * same resolution an application row gets, minus the row.
 */
export function inlineDocumentTarget(
  document: unknown,
  loadFromDb: AppWorkflowLoader,
  options: { ref?: string; appName?: string | null } = {}
): Promise<ResolvedAppTarget> {
  return documentTarget(
    options.ref ?? "inline-document",
    document,
    loadFromDb,
    options.appName ?? null,
    () =>
      "The document posted is not a valid application document " +
      "(no `ui`/`operations`)."
  );
}
