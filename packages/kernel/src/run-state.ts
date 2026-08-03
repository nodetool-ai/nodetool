/**
 * What a supervisor may read about a run in flight.
 *
 * The design's two supervisor tools (`get_run_state`, `read_node_output`) are
 * pull-based on purpose: the runner already holds this state, so there is no
 * observation pipeline to feed and a clean run costs nothing. This module is
 * the read side of that — the runner implements it, the agent package consumes
 * it, and the dependency arrow stays `kernel ← agents`.
 *
 * See docs/workflow-supervisor-design.md §6.
 */

/** Per-node summary in the run digest. */
export interface NodeRunState {
  nodeId: string;
  nodeType: string;
  /**
   * `pending` — spawned, nothing emitted yet; `running` — emitted at least
   * once and still live; `completed` / `failed` — the actor is gone.
   */
  status: "pending" | "running" | "completed" | "failed";
  /** Invocations that produced output. */
  emissions: number;
  /** Escalations raised by this node so far, including the current one. */
  escalations: number;
  /** The node's terminal error, once it has one. Redacted at construction. */
  error?: string;
}

export interface RunStateDigest {
  jobId: string;
  nodes: NodeRunState[];
  /** Provider spend recorded for the whole run so far, in USD. */
  costUsd: number;
}

/** One node's recorded output for a single invocation. */
export interface NodeOutputRead {
  nodeId: string;
  /** The lineage the recorded invocation ran under, as `root=index` pairs. */
  lineage: string[];
  outputs: Record<string, unknown>;
}

/**
 * Read-only view of a run, handed to a `SupervisorHandle` when the run starts.
 */
export interface RunStateReader {
  digest(): RunStateDigest;
  /**
   * The most recent output of `nodeId` on an invocation causally related to
   * `lineage` — same fan-out roots, same indices. A sibling item's output is
   * not related to the failing one, so it is refused (`null`) rather than
   * handed over as repair material. Design §6.
   */
  readOutput(nodeId: string, lineage: readonly string[]): NodeOutputRead | null;
}

/**
 * Whether `recorded` belongs to the same causal branch as `lineage`.
 *
 * A producer upstream of the failing invocation ran under a lineage that is a
 * subset of it: every fan-out root it carries also appears downstream, with the
 * same index. Two conditions therefore refuse a read — an index that disagrees
 * (a sibling item) and a root the failing invocation never entered (an
 * unrelated fan-out). An empty recorded lineage is a single-fire node, which is
 * upstream of everything.
 */
export function lineageRelated(
  recorded: readonly string[],
  lineage: readonly string[]
): boolean {
  if (recorded.length === 0) return true;
  const scope = new Map<string, string>();
  for (const pair of lineage) {
    const eq = pair.indexOf("=");
    if (eq === -1) continue;
    scope.set(pair.slice(0, eq), pair.slice(eq + 1));
  }
  for (const pair of recorded) {
    const eq = pair.indexOf("=");
    if (eq === -1) return false;
    const root = pair.slice(0, eq);
    if (scope.get(root) !== pair.slice(eq + 1)) return false;
  }
  return true;
}
