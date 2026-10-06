/**
 * useBrowserPreviewsOnLoad
 *
 * When a workflow opens, render previews for every browser-capable node that
 * an input with a value reaches (see `buildLoadPreviewGraph`). The run happens
 * once per opened editor, in the browser, as a silent job: previews update, but
 * no status badges or job-list entries appear. A workflow without such a chain
 * runs nothing.
 */
import { useEffect, useRef } from "react";
import type { NodeStore } from "../../stores/NodeStore";
import { markJobSilent, unmarkJobSilent } from "../../stores/previewJobs";
import { reactFlowNodeToGraphNode } from "../../stores/reactFlowNodeToGraphNode";
import { reactFlowEdgeToGraphEdge } from "../../stores/reactFlowEdgeToGraphEdge";
import {
  browserSupportsSync,
  reportBrowserEligibility,
  runBrowserGraphJob
} from "../../lib/workflow/browserWorkflowRunner";
import { buildLoadPreviewGraph } from "./buildLoadPreviewGraph";

export const useBrowserPreviewsOnLoad = (
  nodeStore: NodeStore | undefined,
  enabled: boolean
): void => {
  const startedForRef = useRef<NodeStore | null>(null);

  useEffect(() => {
    if (!nodeStore || !enabled || startedForRef.current === nodeStore) {
      return;
    }
    startedForRef.current = nodeStore;
    const abortController = new AbortController();
    let finished = false;

    void (async () => {
      const { nodes, edges } = nodeStore.getState();
      // Loads the browser runner, which `browserSupportsSync` needs.
      const report = await reportBrowserEligibility({
        nodes: nodes.map(reactFlowNodeToGraphNode),
        edges: edges.map(reactFlowEdgeToGraphEdge)
      });
      if (!report.runnerAvailable || abortController.signal.aborted) {
        return;
      }
      const { nodes: current, edges: currentEdges, workflow } =
        nodeStore.getState();
      const selected = buildLoadPreviewGraph(
        current,
        currentEdges,
        (type) => browserSupportsSync(type ?? "") === true
      );
      if (!selected) {
        return;
      }
      const jobId = crypto.randomUUID();
      markJobSilent(jobId);
      try {
        await runBrowserGraphJob({
          graph: {
            nodes: selected.nodes.map(reactFlowNodeToGraphNode),
            edges: selected.edges.map(reactFlowEdgeToGraphEdge)
          },
          workflowId: workflow.id,
          jobId,
          signal: abortController.signal
        });
      } catch (error) {
        console.warn("[load-preview] browser preview failed", error);
      } finally {
        unmarkJobSilent(jobId);
      }
    })().finally(() => {
      finished = true;
    });

    return () => {
      // A run cut short (unmount, tab switch, StrictMode's effect replay) may
      // start again later. A finished one stays done for this editor.
      if (!finished) {
        abortController.abort();
        startedForRef.current = null;
      }
    };
  }, [nodeStore, enabled]);
};
