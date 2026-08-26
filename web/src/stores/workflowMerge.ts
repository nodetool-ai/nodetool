/**
 * Workflow graph merge adapter
 *
 * Teaches the generic per-unit merge engine about a workflow graph:
 * `nodes[]` by id and `edges[]` by id are the merge units. A node's `data`,
 * `position` and title are separate fields of the unit, so an external move
 * of a node with dirty data is not a conflict. An edge whose source or
 * target no longer exists in the merged nodes is dangling: dropped and
 * listed rather than saved unconnectable.
 *
 * The draft side is live ReactFlow state, which carries fields the canvas
 * writes and the graph never stores (`measured`, `selected`, `dragging`, …).
 * Those are stripped before the three-way compare — otherwise selecting an
 * edge reads as editing it — and put back on the merged unit afterwards, so
 * the merge does not clear the user's selection or measurements.
 */
import type { DocumentOp } from "@nodetool-ai/protocol";
import type {
  DocumentMergeAdapter,
  MergeConflict,
  MergeResult
} from "../stores/documentMerge";
import { mergeByUnits } from "../stores/documentMerge";
import type { Edge, Node } from "@xyflow/react";

/** The slice of a workflow the engine merges. */
export interface WorkflowMergeDoc {
  nodes: unknown[];
  edges: unknown[];
}

const nodeIdOf = (unit: unknown): string =>
  String((unit as { id?: unknown }).id ?? "");

const nodeLabel = (unit: unknown): string => {
  const node = unit as Node;
  const title = (node.data as { title?: unknown } | undefined)?.title;
  if (typeof title === "string" && title.length > 0) return title;
  const label = (node.data as { label?: unknown } | undefined)?.label;
  return typeof label === "string" && label.length > 0 ? label : node.id;
};

const edgeLabel = (unit: unknown): string => {
  const edge = unit as Edge;
  return `${edge.source} → ${edge.target}`;
};

/**
 * Fields ReactFlow stamps onto a live node. `graphNodeToReactFlowNode` emits
 * none of them, so a difference here is canvas state, never a graph edit.
 */
const NODE_RUNTIME_FIELDS = [
  "measured",
  "selected",
  "dragging",
  "resizing",
  "initialized",
  "positionAbsolute",
  "handleBounds",
  "internals"
] as const;

/** The same for a live edge; `graphEdgeToReactFlowEdge` emits none of them. */
const EDGE_RUNTIME_FIELDS = [
  "measured",
  "selected",
  "animated",
  "interactionWidth"
] as const;

const runtimeFieldsFor = (kind: string): readonly string[] =>
  kind === "node" ? NODE_RUNTIME_FIELDS : EDGE_RUNTIME_FIELDS;

/** The unit without its runtime fields; the same object when it has none. */
const stripRuntime = (unit: unknown, fields: readonly string[]): unknown => {
  const record = unit as Record<string, unknown>;
  if (!fields.some((field) => field in record)) return unit;
  const stripped: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    if (!fields.includes(key)) stripped[key] = value;
  }
  return stripped;
};

/** Only the runtime fields of a unit, to put back after the merge. */
const runtimeSlice = (
  unit: unknown,
  fields: readonly string[]
): Record<string, unknown> => {
  const record = unit as Record<string, unknown>;
  const slice: Record<string, unknown> = {};
  for (const field of fields) {
    if (field in record) slice[field] = record[field];
  }
  return slice;
};

const normalizeDoc = (doc: WorkflowMergeDoc): WorkflowMergeDoc => ({
  nodes: doc.nodes.map((node) => stripRuntime(node, NODE_RUNTIME_FIELDS)),
  edges: doc.edges.map((edge) => stripRuntime(edge, EDGE_RUNTIME_FIELDS))
});

/** Put the draft's canvas state back onto the units the merge produced. */
const restoreRuntime = (
  merged: unknown[],
  draft: unknown[],
  kind: string
): unknown[] => {
  const fields = runtimeFieldsFor(kind);
  const byId = new Map(draft.map((unit) => [nodeIdOf(unit), unit]));
  return merged.map((unit) => {
    const original = byId.get(nodeIdOf(unit));
    if (original === undefined) return unit;
    const slice = runtimeSlice(original, fields);
    return Object.keys(slice).length === 0
      ? unit
      : { ...(unit as Record<string, unknown>), ...slice };
  });
};

export const workflowMergeAdapter: DocumentMergeAdapter<WorkflowMergeDoc> = {
  collections: [
    {
      kind: "edge",
      read: (doc) => doc.edges,
      write: (doc, edges) => ({ ...doc, edges }),
      unitId: nodeIdOf,
      unitLabel: edgeLabel
    },
    {
      kind: "node",
      read: (doc) => doc.nodes,
      write: (doc, nodes) => ({ ...doc, nodes }),
      unitId: nodeIdOf,
      unitLabel: nodeLabel,
      // position / data / title are separate fields of one node unit.
      unitFields: [
        { field: "position" },
        { field: "data" },
        { field: "title" }
      ]
    }
  ],
  unitsTouchedByOp: (op: DocumentOp): { kind: string; unitId?: string }[] => {
    const input = (op.input ?? {}) as Record<string, unknown>;
    const candidates: unknown[] = [
      input["id"],
      input["node_id"],
      input["source_node_id"]
    ];
    const id = candidates.find(
      (v): v is string => typeof v === "string" && v.length > 0
    );

    switch (op.tool) {
      case "ui_add_node":
        return id ? [{ kind: "node", unitId: id }] : [];
      case "ui_delete_node":
        return id ? [{ kind: "node", unitId: id }] : [];
      case "ui_update_node_data":
      case "ui_set_node_title":
        return id ? [{ kind: "node", unitId: id }] : [];
      case "ui_move_node":
        return id ? [{ kind: "node", unitId: id }] : [];
      case "ui_connect_nodes": {
        const edgeId =
          typeof input["edge_id"] === "string" && input["edge_id"].length > 0
            ? (input["edge_id"] as string)
            : typeof input["id"] === "string" && input["id"].length > 0
              ? (input["id"] as string)
              : undefined;
        if (edgeId) return [{ kind: "edge", unitId: edgeId }];
        // Creation: no stable edge id yet — attribute to a synthetic id so
        // we don't fall back to diff mode and mark unrelated edges as touched.
        return [{ kind: "edge", unitId: "__new_edge__" }];
      }
      case "ui_delete_edge": {
        const edgeId =
          typeof input["edge_id"] === "string" && input["edge_id"].length > 0
            ? (input["edge_id"] as string)
            : typeof input["id"] === "string" && input["id"].length > 0
              ? (input["id"] as string)
              : id;
        return edgeId ? [{ kind: "edge", unitId: edgeId }] : [];
      }
      default:
        // update_graph / restore_version name no units — diff-based touching.
        return [];
    }
  }
};

/**
 * Merge one external graph write into the dirty draft, then drop edges whose
 * endpoints no longer exist in the merged result.
 */
export function mergeWorkflowDocuments(
  base: WorkflowMergeDoc,
  draft: WorkflowMergeDoc,
  server: WorkflowMergeDoc,
  ops?: DocumentOp[]
): MergeResult<WorkflowMergeDoc> & { danglingEdges: unknown[] } {
  const merged = mergeByUnits(
    normalizeDoc(base),
    normalizeDoc(draft),
    normalizeDoc(server),
    workflowMergeAdapter,
    { ops }
  );
  const result: MergeResult<WorkflowMergeDoc> = {
    conflicts: merged.conflicts,
    doc: {
      nodes: restoreRuntime(merged.doc.nodes, draft.nodes, "node"),
      edges: restoreRuntime(merged.doc.edges, draft.edges, "edge")
    }
  };

  const nodeIds = new Set(result.doc.nodes.map(nodeIdOf));
  const connected = (edge: unknown): boolean => {
    const e = edge as Pick<Edge, "source" | "target">;
    return nodeIds.has(e.source) && nodeIds.has(e.target);
  };
  const danglingEdges = result.doc.edges.filter((e) => !connected(e));
  if (danglingEdges.length === 0) return { ...result, danglingEdges };

  const dropped = new Set(danglingEdges.map(nodeIdOf));
  const conflicts: MergeConflict[] = [
    ...result.conflicts,
    ...danglingEdges.map((edge): MergeConflict => ({
      unit: { kind: "edge", id: nodeIdOf(edge), label: edgeLabel(edge) },
      external: null,
      reason: "dangling"
    }))
  ];
  return {
    doc: {
      ...result.doc,
      edges: result.doc.edges.filter((e) => !dropped.has(nodeIdOf(e)))
    },
    conflicts,
    danglingEdges
  };
}
