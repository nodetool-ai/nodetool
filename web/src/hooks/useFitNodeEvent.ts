import { useEffect } from "react";
import type { Node } from "@xyflow/react";
import { useNodes } from "../contexts/NodeContext";
import { useFitView } from "./useFitView";
import type { NodeData } from "../stores/NodeData";

interface FitNodeRequest {
  nodeId: string;
  workflowId?: string;
  node?: Node;
}

let pendingRequest: FitNodeRequest | null = null;
let retryHandle: ReturnType<typeof setTimeout> | null = null;
let retryCount = 0;
const MAX_REVEAL_RETRIES = 50;

const dispatchPendingRequest = (): void => {
  if (!pendingRequest) {
    retryHandle = null;
    retryCount = 0;
    return;
  }
  window.dispatchEvent(
    new CustomEvent("nodetool:fit-node", { detail: pendingRequest })
  );
  if (pendingRequest && retryCount < MAX_REVEAL_RETRIES) {
    retryCount += 1;
    retryHandle = setTimeout(dispatchPendingRequest, 100);
  }
};

/**
 * Request a node reveal that survives workflow-tab loading. The matching
 * editor acknowledges the request when its node store is ready.
 */
export const requestFitNode = (request: FitNodeRequest): void => {
  pendingRequest = request;
  retryCount = 0;
  if (retryHandle) {
    clearTimeout(retryHandle);
  }
  dispatchPendingRequest();
};

/**
 * Hook to listen for custom "nodetool:fit-node" events and fit the view to the specified node.
 * This allows components outside the ReactFlowProvider to trigger node focusing.
 */
export const useFitNodeEvent = (): void => {
  const findNode = useNodes((state) => state.findNode);
  const workflowId = useNodes((state) => state.workflow.id);
  const fitView = useFitView();

  useEffect(() => {
    const handleFitNode = (event: CustomEvent<FitNodeRequest>) => {
      const {
        nodeId,
        workflowId: eventWorkflowId,
        node: eventNode
      } = event.detail;
      if (eventWorkflowId && eventWorkflowId !== workflowId) {
        return;
      }

      const node = (eventNode || findNode(nodeId)) as
        | Node<NodeData>
        | undefined;
      if (!node) {
        if (pendingRequest !== event.detail) {
          console.error("[useFitNodeEvent] node not found", { nodeId });
        }
        return;
      }

      if (pendingRequest === event.detail) {
        pendingRequest = null;
        if (retryHandle) {
          clearTimeout(retryHandle);
          retryHandle = null;
        }
        retryCount = 0;
      }

      // Use fitView with nodeIds to avoid selecting the node
      requestAnimationFrame(() => {
        fitView({ padding: 0.4, nodeIds: [nodeId] });
      });
    };

    window.addEventListener(
      "nodetool:fit-node",
      handleFitNode as EventListener
    );
    return () => {
      window.removeEventListener(
        "nodetool:fit-node",
        handleFitNode as EventListener
      );
    };
  }, [findNode, fitView, workflowId]);
};
