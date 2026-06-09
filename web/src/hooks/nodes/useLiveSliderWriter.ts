/**
 * useLiveSliderWriter
 *
 * Drop-in replacement for `useBespokePropertyWriter` for slider-driven bespoke
 * bodies (the image adjustment nodes). Same `{ setProperty, setProperties,
 * setPropertyComplete }` shape, but adds a live in-browser preview:
 *
 * While dragging a slider, the node's downstream subgraph (the node plus every
 * dependent image) is re-run *in the browser* with the kernel runner — no
 * server round-trip — so all depending previews update in real time. Runs are
 * coalesced (one in flight at a time, latest value wins) and stream through the
 * normal `deliverLocal` pipeline, so the canvas updates exactly as a server run
 * would. A single, reused job id keeps the scrub to one live generation instead
 * of flooding the timeline.
 *
 * The browser preview runs unconditionally on every move — live feedback is the
 * point of these sliders, and a client-side GPU run is cheap. When the
 * downstream subgraph isn't fully browser-capable (a server/Python node
 * downstream) or the browser runner hasn't warmed yet, it transparently falls
 * back to the existing auto-run, which still respects the `instantUpdate`
 * setting (it no-ops when off) to avoid hammering the server.
 */
import { useCallback, useEffect, useRef } from "react";
import { useNodes, useNodeStoreRef } from "../../contexts/NodeContext";
import { uuidv4 } from "../../stores/uuidv4";
import { reactFlowNodeToGraphNode } from "../../stores/reactFlowNodeToGraphNode";
import { reactFlowEdgeToGraphEdge } from "../../stores/reactFlowEdgeToGraphEdge";
import {
  browserSupportsSync,
  preloadBrowserRunner,
  runBrowserGraphJob
} from "../../lib/workflow/browserWorkflowRunner";
import type { WorkflowGraph } from "../../stores/ApiTypes";
import { useLiveRunStore } from "../../stores/LiveRunStore";
import { markJobSilent, unmarkJobSilent } from "../../stores/previewJobs";
import {
  browserRunnablePrefix,
  buildDownstreamRunGraph
} from "./buildDownstreamRunGraph";
import { useNodeAutoRun } from "./useInputNodeAutoRun";

interface UseLiveSliderWriterOptions {
  nodeId: string;
  nodeType: string;
}

interface UseLiveSliderWriterReturn {
  setProperty: (name: string, value: unknown) => void;
  setProperties: (updates: Record<string, unknown>) => void;
  setPropertyComplete: () => void;
}

export const useLiveSliderWriter = ({
  nodeId,
  nodeType
}: UseLiveSliderWriterOptions): UseLiveSliderWriterReturn => {
  const updateNodeProperties = useNodes((state) => state.updateNodeProperties);
  const nodeStore = useNodeStoreRef();
  const notifyScrubActivity = useLiveRunStore(
    (state) => state.notifyScrubActivity
  );

  // Server fallback for downstream graphs that can't run in the browser. This
  // path still respects the `instantUpdate` setting (it no-ops when off); the
  // browser preview below runs unconditionally — live preview is the whole
  // point of these sliders, and a browser run is local and cheap.
  const { onPropertyChange, onPropertyChangeComplete } = useNodeAutoRun({
    nodeId,
    nodeType,
    propertyName: "bespoke"
  });

  // Warm the browser runner up front so the first scrub is already eligible
  // (the sync check otherwise returns false until the registry loads).
  useEffect(() => {
    preloadBrowserRunner();
  }, []);

  // One job id for the whole node so every scrub upserts the same live
  // generation rather than appending a new one per frame.
  const previewJobIdRef = useRef<string>("");
  if (previewJobIdRef.current === "") {
    previewJobIdRef.current = uuidv4();
  }
  const inFlightRef = useRef(false);
  const pendingRef = useRef(false);
  const mountedRef = useRef(true);
  // Self-reference so the coalescer's tail can re-run with fresh store values.
  const runPreviewRef = useRef<() => boolean>(() => false);

  // Mark this preview job silent so `workflowUpdates` refreshes the image but
  // never drives the per-node status / timing badge / ambient ring (those would
  // flash on every scrub frame).
  useEffect(() => {
    const jobId = previewJobIdRef.current;
    markJobSilent(jobId);
    return () => {
      mountedRef.current = false;
      unmarkJobSilent(jobId);
    };
  }, []);

  /**
   * Run the downstream subgraph in the browser if eligible. Returns true when
   * the browser path handled it (so the caller skips the server fallback),
   * false to fall back (instant-update off, no runnable graph, or a downstream
   * node that can't run in the browser).
   */
  const runBrowserPreview = useCallback((): boolean => {
    // A run is only ever in flight after eligibility was confirmed, so an
    // active scrub can coalesce without rebuilding the graph every frame.
    if (inFlightRef.current) {
      pendingRef.current = true;
      return true;
    }
    const { nodes, edges, workflow, findNode } = nodeStore.getState();
    const built = buildDownstreamRunGraph({
      nodeId,
      nodes,
      edges,
      workflowId: workflow.id,
      findNode
    });
    if (!built) {
      return false;
    }
    // Run only the browser-capable prefix of the downstream chain, so a server
    // node further down doesn't block the live preview of the browser nodes
    // before it. Empty prefix (root isn't browser-capable / runner not warmed
    // yet) → fall back to the server path.
    const prefix = browserRunnablePrefix(
      { nodes: built.nodes, edges: built.edges },
      (type) => browserSupportsSync(type ?? "") === true
    );
    if (prefix.nodes.length === 0) {
      return false;
    }
    const graph: WorkflowGraph = {
      nodes: prefix.nodes.map(reactFlowNodeToGraphNode),
      edges: prefix.edges.map(reactFlowEdgeToGraphEdge)
    };

    inFlightRef.current = true;
    void runBrowserGraphJob({
      graph,
      workflowId: workflow.id,
      jobId: previewJobIdRef.current
    })
      .catch((error) => {
        console.warn("[live-slider] browser preview failed", error);
      })
      .finally(() => {
        inFlightRef.current = false;
        // Re-arm the scrub flag on completion: the "completed" badge and
        // ambient ring fire now (post-input-idle), so extend the suppression
        // window past this run's final render.
        if (mountedRef.current) {
          notifyScrubActivity();
        }
        if (pendingRef.current && mountedRef.current) {
          pendingRef.current = false;
          // Rebuild from the latest store state — the slider has moved on.
          runPreviewRef.current();
        }
      });
    return true;
  }, [nodeId, nodeStore, notifyScrubActivity]);

  useEffect(() => {
    runPreviewRef.current = runBrowserPreview;
  }, [runBrowserPreview]);

  const setProperty = useCallback(
    (name: string, value: unknown) => {
      updateNodeProperties(nodeId, { [name]: value });
      // Freeze per-run edge/node animations while scrubbing — pure noise. Flag
      // it regardless of which path runs, so the suppression applies to the
      // server fallback too (it would otherwise flash the running ring).
      notifyScrubActivity();
      if (!runBrowserPreview()) {
        onPropertyChange();
      }
    },
    [
      nodeId,
      updateNodeProperties,
      runBrowserPreview,
      notifyScrubActivity,
      onPropertyChange
    ]
  );

  const setProperties = useCallback(
    (updates: Record<string, unknown>) => {
      updateNodeProperties(nodeId, updates);
      notifyScrubActivity();
      if (!runBrowserPreview()) {
        onPropertyChange();
      }
    },
    [
      nodeId,
      updateNodeProperties,
      runBrowserPreview,
      notifyScrubActivity,
      onPropertyChange
    ]
  );

  const setPropertyComplete = useCallback(() => {
    // The final value is already in the store (onChange fired before commit);
    // render it once more in the browser, or hand off to the server run.
    notifyScrubActivity();
    if (!runBrowserPreview()) {
      onPropertyChangeComplete();
    }
  }, [runBrowserPreview, notifyScrubActivity, onPropertyChangeComplete]);

  return { setProperty, setProperties, setPropertyComplete };
};

export default useLiveSliderWriter;
