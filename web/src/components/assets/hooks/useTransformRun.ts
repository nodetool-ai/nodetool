import { useCallback, useEffect, useRef, useState } from "react";

import type { Workflow } from "../../../stores/ApiTypes";
import { queryClient } from "../../../queryClient";
import { runInlineGraphJob } from "../../../lib/workflow/runInlineGraphJob";
import { isRecord } from "../../../utils/typePredicates";
import { extractWorkflowIO } from "../../appbuilder/workflowIO";
import {
  foldTransformMessage,
  initialTransformRunState,
  transformParams,
  type TransformInput,
  type TransformRunState,
  type TransformSource
} from "../transformWorkflow";

/** Editor-only nodes never report, so they do not count toward progress. */
const UI_ONLY_NODE_TYPES = new Set([
  "nodetool.workflows.base_node.Comment",
  "nodetool.workflows.base_node.Group",
  "nodetool.workflows.base_node.Reroute"
]);

export interface TransformRun {
  state: TransformRunState;
  start: (workflow: Workflow, source: TransformSource, target: TransformInput) => void;
  cancel: () => void;
  reset: () => void;
}

/**
 * Runs a saved workflow on one asset and folds the run's streamed messages
 * into `state` for the transform dialog. Unmounting cancels a live run.
 */
export const useTransformRun = (): TransformRun => {
  const [state, setState] = useState<TransformRunState>(initialTransformRunState);
  const abortRef = useRef<AbortController | null>(null);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
  }, []);

  useEffect(() => cancel, [cancel]);

  const reset = useCallback(() => {
    cancel();
    setState(initialTransformRunState);
  }, [cancel]);

  const start = useCallback(
    (workflow: Workflow, source: TransformSource, target: TransformInput) => {
      const graph = workflow.graph;
      if (!graph) {
        return;
      }
      cancel();
      const controller = new AbortController();
      abortRef.current = controller;
      const jobId = crypto.randomUUID();
      const totalNodes = graph.nodes.filter(
        (node) => !UI_ONLY_NODE_TYPES.has(node.type)
      ).length;
      setState({ ...initialTransformRunState, status: "running", jobId, totalNodes });

      const isCurrent = (): boolean => abortRef.current === controller;

      void runInlineGraphJob({
        graph,
        params: transformParams(source, target),
        signal: controller.signal,
        workflowId: workflow.id,
        jobId,
        jobName: workflow.name,
        onMessage: (message) => {
          if (isCurrent()) {
            setState((prev) => foldTransformMessage(prev, message));
          }
        }
      }).then((result) => {
        if (controller.signal.aborted) {
          setState((prev) =>
            prev.jobId === jobId ? { ...prev, status: "cancelled" } : prev
          );
          return;
        }
        if (!isCurrent()) {
          return;
        }
        abortRef.current = null;
        setState((prev) => {
          // A run whose outputs never streamed (a browser run, a sink that
          // stays quiet) still shows its final outputs.
          let next = prev;
          if (prev.outputs.length === 0) {
            for (const output of extractWorkflowIO(workflow).outputs) {
              const byNode = result.outputs[output.nodeId];
              next = foldTransformMessage(next, {
                type: "output_update",
                node_id: output.nodeId,
                node_name: output.name,
                value:
                  result.outputs[output.name] ??
                  (isRecord(byNode) ? byNode.output : byNode)
              });
            }
          }
          return result.success
            ? { ...next, status: "completed", nodeProgress: null }
            : {
                ...next,
                status: "failed",
                nodeProgress: null,
                error: result.error ?? null
              };
        });
        // Generator nodes save their results as assets; show them in the grid.
        void queryClient.invalidateQueries({ queryKey: ["assets"] });
      });
    },
    [cancel]
  );

  return { state, start, cancel, reset };
};
