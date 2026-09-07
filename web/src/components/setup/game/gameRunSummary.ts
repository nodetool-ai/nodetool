/**
 * What the Game flow's landing checklist reads off the run (game-prd § 4.4).
 *
 * The build placed one checker node per filled slot, each carrying its slot id
 * in `setupStepId`, and one export node. The checklist's rows are that mapping
 * plus whatever the run has produced so far — so `Assets checked · k of m`
 * counts checkers that completed, and the export row reads the export node's
 * own named outputs rather than inferring anything from the run's state.
 *
 * Those outputs come off the node's live generation, never off
 * `ResultsStore.outputResults`. The runner emits one `output_update` per
 * *unconnected* handle and the reducer appends them under the node id with the
 * handle name dropped: the export node's `output` goes to the `project` Output
 * node so it is suppressed altogether, and `directory`/`verified`/`archive`/…
 * pile up into an array nobody can read a field out of. Every checker's asset
 * handle feeds the export node's `fills`, so those are suppressed too and the
 * checked count would never move. A generation carries the whole result record
 * keyed by handle — `generation_complete` when the node emits one, the
 * completed `node_update.result` when it does not — and is never
 * edge-suppressed, so it is the one source that answers all four rows.
 *
 * `verified` is the criterion this file exists to hold (criterion 7): it is
 * true only when the export node said `verified: true`. A run that has not
 * answered, a server with no Godot, a `verification` block with a reason — all
 * of them read as not verified, and the reason is shown instead.
 */

import { useMemo } from "react";
import type { Node } from "@xyflow/react";
import { GAME_EXPORT_NODE_TYPE } from "@nodetool-ai/protocol";

import { useWorkflowManager } from "../../../contexts/WorkflowManagerContext";
import useResultsStore from "../../../stores/ResultsStore";
import useErrorStore, {
  nodeErrorToDisplayString,
  type NodeError
} from "../../../stores/ErrorStore";
import useWorkflowRunsStore from "../../../stores/WorkflowRunsStore";
import type { NodeData } from "../../../stores/NodeData";
import type { Generation } from "../../../utils/nodeGenerations";
import { isRecord } from "../../../utils/typePredicates";

/** One node of the built graph, as the summary needs it. */
export interface GameRunNode {
  id: string;
  type: string;
  /** The slot this node fills, from the placement's `setupStepId`. */
  slotId: string | null;
}

/** One failed node, named by the slot it was filling when it could. */
export interface GameRunFailure {
  nodeId: string;
  slotId: string | null;
  error: string;
}

export interface GameRunSummary {
  /** Checker nodes that have produced a result, and how many there are. */
  checked: number;
  total: number;
  /** The export node's `directory` output, or null before it answers. */
  directory: string | null;
  /** Its `archive` output — the zip `Download project` hands over. */
  archive: string | null;
  /** True only when the export node reported `verified: true` (criterion 7). */
  verified: boolean;
  /** Why verification did not happen or did not pass, when it says. */
  verificationReason: string | null;
  failures: GameRunFailure[];
}

/** The export node's `output` value, as far as the checklist reads it. */
const readExportOutput = (
  value: unknown
): {
  directory: string | null;
  archive: string | null;
  verified: boolean;
  reason: string | null;
} => {
  if (!isRecord(value)) {
    return { directory: null, archive: null, verified: false, reason: null };
  }
  const verification = isRecord(value["verification"])
    ? value["verification"]
    : null;
  const reason =
    verification !== null && typeof verification["reason"] === "string"
      ? verification["reason"]
      : null;
  return {
    directory:
      typeof value["directory"] === "string" ? value["directory"] : null,
    archive: typeof value["archive"] === "string" ? value["archive"] : null,
    // Strict equality, not truthiness: a run that answered with a string, a
    // number or nothing at all has not verified anything.
    verified: value["verified"] === true,
    reason
  };
};

export interface SummarizeGameRunInput {
  nodes: readonly GameRunNode[];
  /**
   * One node's outputs keyed by handle, or undefined before it completed one.
   */
  outputsFor: (nodeId: string) => Record<string, unknown> | undefined;
  /** The run's error for one node, if it failed. */
  errorFor: (nodeId: string) => NodeError | undefined;
}

/**
 * Fold the built graph and the run's state into the checklist's rows.
 *
 * Pure, so criterion 7 is asserted against a table of outputs rather than
 * against a rendered run.
 */
export const summarizeGameRun = ({
  nodes,
  outputsFor,
  errorFor
}: SummarizeGameRunInput): GameRunSummary => {
  const slotNodes = nodes.filter(
    (node) => node.slotId !== null && node.type !== GAME_EXPORT_NODE_TYPE
  );
  // One row per slot, not per node: a slot's chain is several nodes, and the
  // checker is the one whose result means the asset passed its check.
  const bySlot = new Map<string, GameRunNode[]>();
  for (const node of slotNodes) {
    const slotId = node.slotId as string;
    bySlot.set(slotId, [...(bySlot.get(slotId) ?? []), node]);
  }
  let checked = 0;
  for (const [, chain] of bySlot) {
    if (chain.some((node) => outputsFor(node.id) !== undefined)) {
      checked += 1;
    }
  }

  const exportNode =
    nodes.find((node) => node.type === GAME_EXPORT_NODE_TYPE) ?? null;
  const exported = readExportOutput(
    exportNode === null ? undefined : outputsFor(exportNode.id)
  );

  const failures: GameRunFailure[] = [];
  for (const node of nodes) {
    const error = nodeErrorToDisplayString(errorFor(node.id));
    if (error.length > 0) {
      failures.push({ nodeId: node.id, slotId: node.slotId, error });
    }
  }

  return {
    checked,
    total: bySlot.size,
    directory: exported.directory,
    archive: exported.archive,
    verified: exported.verified,
    verificationReason: exported.reason,
    failures
  };
};

/** The graph the build placed, as the summary reads it. */
export const toRunNodes = (
  nodes: readonly Node<NodeData>[]
): GameRunNode[] =>
  nodes.map((node) => ({
    id: node.id,
    type: node.type ?? "",
    slotId: node.data?.setupStepId ?? null
  }));

/**
 * The named outputs one node committed on a given job, or undefined while it
 * has not committed any. The newest completed generation wins, so a re-run of
 * the same job reports what it produced last.
 */
export const completedOutputs = (
  generations: readonly Generation[] | undefined,
  jobId: string
): Record<string, unknown> | undefined => {
  let latest: Generation | undefined;
  for (const generation of generations ?? []) {
    if (generation.jobId === jobId && generation.status === "completed") {
      latest = generation;
    }
  }
  return latest && isRecord(latest.outputs) ? latest.outputs : undefined;
};

/**
 * The live summary for one workflow's focused run.
 *
 * The nodes are read once per render off the workflow's node store — the build
 * placed them and nothing moves them afterwards — while the generations and
 * errors are subscribed to, because they are what arrives while the checklist
 * is on screen.
 */
export const useGameRunSummary = (workflowId: string): GameRunSummary => {
  const nodeStore = useWorkflowManager((state) =>
    state.getNodeStore(workflowId)
  );
  const jobId = useWorkflowRunsStore((state) => state.focusedJob[workflowId]);
  const liveGenerations = useResultsStore((state) => state.liveGenerations);
  const errors = useErrorStore((state) => state.errors);

  return useMemo(() => {
    const nodes = toRunNodes(nodeStore?.getState().nodes ?? []);
    if (jobId === undefined) {
      return summarizeGameRun({
        nodes,
        outputsFor: () => undefined,
        errorFor: () => undefined
      });
    }
    return summarizeGameRun({
      nodes,
      outputsFor: (nodeId) =>
        completedOutputs(liveGenerations[`${workflowId}:${nodeId}`], jobId),
      errorFor: (nodeId) =>
        errors[`${workflowId}:${jobId}:${nodeId}` as keyof typeof errors]
    });
  }, [errors, jobId, liveGenerations, nodeStore, workflowId]);
};
