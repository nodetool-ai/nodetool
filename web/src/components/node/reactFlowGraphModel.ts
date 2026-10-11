/**
 * Pure graph rules behind the workflow canvas (`ReactFlowWrapper`): layout
 * signatures that decide when React Flow must re-measure handles, run-scoped
 * status selectors, branch highlighting and node-driven edge selection.
 */
import type { Edge, Node } from "@xyflow/react";
import type { NodeData } from "../../stores/NodeData";
import { isNumber, isString } from "../../utils/typePredicates";

/**
 * The dynamic slot tables a layout signature reads a key set from. Only the
 * key names matter; a value change never moves a handle.
 */
type DynamicSlotTable =
  | NodeData["dynamic_properties"]
  | NodeData["dynamic_inputs"]
  | NodeData["dynamic_outputs"];

/** Sorted, comma-joined keys of a slot table, cached by table identity. */
export function sortedKeysOf(
  cache: WeakMap<object, string>,
  table: DynamicSlotTable
): string {
  if (!table) {
    return "";
  }
  const cached = cache.get(table);
  if (cached !== undefined) {
    return cached;
  }
  const result = Object.keys(table).sort().join(",");
  cache.set(table, result);
  return result;
}

/**
 * The fields that move a node's handles: measured and styled height,
 * collapse state, exposed inputs and dynamic slots. Position is left out, so
 * a drag never changes it.
 */
export function nodeLayoutSignature(
  node: Node<NodeData>,
  keysCache: WeakMap<object, string>
): string {
  const styleHeight = node.style?.height;
  const stylePart = isNumber(styleHeight)
    ? String(styleHeight)
    : isString(styleHeight)
      ? styleHeight.trim()
      : "";
  const exposedPart = [
    ...(node.data.exposedInputs ?? []),
    ...(node.data.exposedInputsLabeled ?? []),
    ...(node.data.exposedInputsHidden ?? [])
  ].join(",");
  return [
    node.height ?? "",
    stylePart,
    Boolean(node.data.collapsed),
    exposedPart,
    sortedKeysOf(keysCache, node.data.dynamic_properties),
    sortedKeysOf(keysCache, node.data.dynamic_inputs),
    sortedKeysOf(keysCache, node.data.dynamic_outputs)
  ].join(":");
}

/**
 * Record each node's signature in `known` and return the ids whose signature
 * changed or is new. Ids no longer present are dropped from `known`.
 */
export function changedLayoutIds(
  nodes: Node<NodeData>[],
  known: Map<string, string>,
  keysCache: WeakMap<object, string>
): string[] {
  const present = new Set<string>();
  const changed: string[] = [];
  for (const node of nodes) {
    present.add(node.id);
    const signature = nodeLayoutSignature(node, keysCache);
    if (known.get(node.id) !== signature) {
      changed.push(node.id);
      known.set(node.id, signature);
    }
  }
  for (const id of [...known.keys()]) {
    if (!present.has(id)) {
      known.delete(id);
    }
  }
  return changed;
}

export type FirstWorkflowReadiness = {
  input: boolean;
  output: boolean;
  connection: boolean;
  saved: boolean;
  run: boolean;
};

const STARTER_INPUT = "nodetool.input.StringInput";
const STARTER_OUTPUT = "nodetool.output.Output";

/** Which steps of the first-workflow guide the canvas already satisfies. */
export function firstWorkflowReadiness(
  nodes: Pick<Node, "id" | "type">[],
  edges: Pick<Edge, "source" | "target">[],
  workflowIsDirty: boolean,
  runStates: { state: string }[]
): FirstWorkflowReadiness {
  const inputIds = new Set(
    nodes.filter((n) => n.type === STARTER_INPUT).map((n) => n.id)
  );
  const outputIds = new Set(
    nodes.filter((n) => n.type === STARTER_OUTPUT).map((n) => n.id)
  );
  const input = inputIds.size > 0;
  const output = outputIds.size > 0;
  return {
    input,
    output,
    connection: edges.some(
      (edge) => inputIds.has(edge.source) && outputIds.has(edge.target)
    ),
    saved: input && output && !workflowIsDirty,
    run: runStates.some((run) => run.state === "completed")
  };
}

/**
 * A selector over a store map keyed `workflowId:jobId:id` that keeps only the
 * entries under `runPrefix`. It returns the same object until an entry under
 * the prefix changes, so writes for other runs do not re-render the canvas.
 */
export function createRunScopedSelector<S, V>(
  runPrefix: string | null,
  pick: (state: S) => Record<string, V>
): (state: S) => Record<string, V> {
  let lastSource: Record<string, V> | null = null;
  let lastResult: Record<string, V> = {};
  let lastCount = 0;
  return (state: S) => {
    const source = pick(state);
    if (source === lastSource) {
      return lastResult;
    }
    lastSource = source;
    if (!runPrefix) {
      if (lastCount !== 0) {
        lastResult = {};
        lastCount = 0;
      }
      return lastResult;
    }
    const next: Record<string, V> = {};
    let count = 0;
    let changed = false;
    for (const key in source) {
      if (key.startsWith(runPrefix)) {
        next[key] = source[key];
        count++;
        if (lastResult[key] !== next[key]) {
          changed = true;
        }
      }
    }
    if (!changed && count === lastCount) {
      return lastResult;
    }
    lastResult = next;
    lastCount = count;
    return next;
  };
}

/** The selected nodes plus everything upstream and downstream of them. */
export function branchNodeIds(
  selected: ReadonlySet<string>,
  edges: Pick<Edge, "source" | "target">[]
): Set<string> {
  if (selected.size === 0) {
    return new Set();
  }
  const incoming = new Map<string, string[]>();
  const outgoing = new Map<string, string[]>();
  for (const edge of edges) {
    const sources = incoming.get(edge.target) ?? [];
    sources.push(edge.source);
    incoming.set(edge.target, sources);
    const targets = outgoing.get(edge.source) ?? [];
    targets.push(edge.target);
    outgoing.set(edge.source, targets);
  }
  const result = new Set(selected);
  for (const adjacency of [incoming, outgoing]) {
    const queue = [...selected];
    const visited = new Set(selected);
    for (let index = 0; index < queue.length; index += 1) {
      for (const neighbor of adjacency.get(queue[index]) ?? []) {
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          result.add(neighbor);
          queue.push(neighbor);
        }
      }
    }
  }
  return result;
}

export type ComprehensionContext = {
  /** Whether any node is selected, which dims everything off its branch. */
  selectionActive: boolean;
  branch: ReadonlySet<string>;
  /** Ids on the untaken side of an If or Switch in the focused run. */
  notRun: ReadonlySet<string>;
};

/** Extra class names for a node: on or off the selected branch, and not run. */
export function nodeComprehensionClasses(
  nodeId: string,
  context: ComprehensionContext
): string {
  const extra: string[] = [];
  if (context.selectionActive) {
    extra.push(context.branch.has(nodeId) ? "branch-related" : "branch-dimmed");
  }
  if (context.notRun.has(nodeId)) {
    extra.push("not-run");
  }
  return extra.join(" ");
}

/** Add branch and not-run classes to edges, returning untouched edges as is. */
export function markComprehensionEdges<E extends Edge>(
  edges: E[],
  context: ComprehensionContext
): E[] {
  if (!context.selectionActive && context.notRun.size === 0) {
    return edges;
  }
  return edges.map((edge) => {
    const extra: string[] = [];
    if (context.selectionActive) {
      extra.push(
        context.branch.has(edge.source) && context.branch.has(edge.target)
          ? "branch-related"
          : "branch-dimmed"
      );
    }
    if (context.notRun.has(edge.id)) {
      extra.push("not-run");
    }
    if (extra.length === 0) {
      return edge;
    }
    return {
      ...edge,
      className: [edge.className, ...extra].filter(Boolean).join(" ")
    };
  });
}

/**
 * Select the edges touching selected nodes, and deselect the ones that were
 * selected only for that reason. An edge the user clicked stays selected.
 * `previousNodeDriven` holds the edges this rule selected last time.
 */
export function nodeDrivenEdgeSelection(
  edges: Pick<Edge, "id" | "source" | "target" | "selected">[],
  selected: ReadonlySet<string>,
  previousNodeDriven: ReadonlySet<string>,
  suppress: boolean
): { updates: Record<string, boolean>; nodeDriven: Set<string> } {
  const updates: Record<string, boolean> = {};
  const nodeDriven = new Set<string>();
  for (const edge of edges) {
    const isSelected = Boolean(edge.selected);
    const byNode =
      !suppress && (selected.has(edge.source) || selected.has(edge.target));
    const direct = isSelected && !previousNodeDriven.has(edge.id);
    if (byNode && !direct) {
      nodeDriven.add(edge.id);
    }
    if (isSelected !== (direct || byNode)) {
      updates[edge.id] = direct || byNode;
    }
  }
  return { updates, nodeDriven };
}

/** True when two id sets hold the same ids. */
export function sameIdSet(
  a: ReadonlySet<string>,
  b: ReadonlySet<string>
): boolean {
  if (a.size !== b.size) {
    return false;
  }
  for (const id of a) {
    if (!b.has(id)) {
      return false;
    }
  }
  return true;
}
