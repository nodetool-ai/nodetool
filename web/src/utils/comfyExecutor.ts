/**
 * ComfyUI Execution Bridge
 * 
 * Handles execution of workflows containing ComfyUI nodes by routing to ComfyUI backend.
 */

import { Graph } from "../stores/ApiTypes";
import { getComfyUIService } from "../services/ComfyUIService";
import { nodeToolGraphToComfyPrompt, graphHasComfyUINodes } from "./comfyWorkflowConverter";
import log from "loglevel";
import { Workflow, WorkflowAttributes } from "../stores/ApiTypes";
import { getWorkflowRunnerStore } from "../stores/WorkflowRunner";
import { handleUpdate, MsgpackData } from "../stores/workflowUpdates";
import { useComfyUIStore } from "../stores/ComfyUIStore";

type ComfyWsMessage = {
  type?: string;
  data?: Record<string, unknown>;
};

type NodeMetadata = {
  id: string;
  name: string;
  type: string;
};

const asRecord = (value: unknown): Record<string, unknown> | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
};

const toStringId = (value: unknown): string | null => {
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  return null;
};

const buildNodeLookup = (graph: Graph): Map<string, NodeMetadata> => {
  const nodeLookup = new Map<string, NodeMetadata>();
  for (const node of graph.nodes) {
    const nodeData = asRecord(node.data);
    const title = typeof nodeData?.title === "string" ? nodeData.title : null;
    nodeLookup.set(node.id, {
      id: node.id,
      name: title || node.type || node.id,
      type: node.type || "comfy.unknown"
    });
  }
  return nodeLookup;
};

const getNodeMetadata = (
  nodeLookup: Map<string, NodeMetadata>,
  nodeId: string
): NodeMetadata => {
  return (
    nodeLookup.get(nodeId) || {
      id: nodeId,
      name: `Node ${nodeId}`,
      type: "comfy.unknown"
    }
  );
};

const emitWorkflowUpdate = (
  workflow: Workflow,
  update: MsgpackData
): void => {
  log.info("[ComfyBridge] dispatching translated update", {
    workflowId: workflow.id,
    type: update.type
  });
  const runnerStore = getWorkflowRunnerStore(workflow.id);
  handleUpdate(workflow as unknown as WorkflowAttributes, update, runnerStore);
};

const maybeEmitOutputUpdates = (
  workflow: Workflow,
  nodeLookup: Map<string, NodeMetadata>,
  nodeId: string,
  outputValue: unknown
): void => {
  const node = getNodeMetadata(nodeLookup, nodeId);
  const output = asRecord(outputValue);

  if (!output) {
    emitWorkflowUpdate(workflow, {
      type: "output_update",
      node_id: nodeId,
      node_name: node.name,
      output_name: "output",
      value: outputValue,
      output_type: typeof outputValue
    } as MsgpackData);
    return;
  }

  for (const [key, value] of Object.entries(output)) {
    emitWorkflowUpdate(workflow, {
      type: "output_update",
      node_id: nodeId,
      node_name: node.name,
      output_name: key,
      value,
      output_type: typeof value
    } as MsgpackData);
  }
};

const finalizeActiveNodes = (
  workflow: Workflow,
  nodeLookup: Map<string, NodeMetadata>,
  activeNodeIds: Set<string>
): void => {
  if (activeNodeIds.size === 0) {
    return;
  }

  const nodeIds = Array.from(activeNodeIds);
  log.info("[ComfyBridge] finalizing lingering running nodes", {
    workflowId: workflow.id,
    nodeIds
  });
  for (const nodeId of nodeIds) {
    const node = getNodeMetadata(nodeLookup, nodeId);
    emitWorkflowUpdate(workflow, {
      type: "node_update",
      node_id: nodeId,
      node_name: node.name,
      node_type: node.type,
      status: "completed",
      workflow_id: workflow.id
    } as MsgpackData);
    activeNodeIds.delete(nodeId);
  }
};

const translateComfyMessage = (
  workflow: Workflow,
  nodeLookup: Map<string, NodeMetadata>,
  promptId: string,
  message: ComfyWsMessage,
  currentNodeIdRef: { current: string | null },
  activeNodeIdsRef: { current: Set<string> }
): void => {
  const type = message.type || "unknown";
  const data = asRecord(message.data) || {};
  const messagePromptId = toStringId(data.prompt_id);

  if (messagePromptId && messagePromptId !== promptId) {
    log.info("[ComfyBridge] skipping message for other prompt", {
      messageType: type,
      promptId: messagePromptId
    });
    return;
  }

  log.info("[ComfyBridge] translating Comfy message", {
    messageType: type,
    promptId: messagePromptId || promptId
  });

  switch (type) {
    case "execution_start": {
      emitWorkflowUpdate(workflow, {
        type: "job_update",
        status: "running",
        job_id: promptId,
        workflow_id: workflow.id,
        message: "Comfy execution started"
      } as MsgpackData);
      return;
    }
    case "execution_cached": {
      const cachedNodes = Array.isArray(data.nodes) ? data.nodes : [];
      for (const rawNodeId of cachedNodes) {
        const nodeId = toStringId(rawNodeId);
        if (!nodeId) {
          continue;
        }
        activeNodeIdsRef.current.delete(nodeId);
        const node = getNodeMetadata(nodeLookup, nodeId);
        emitWorkflowUpdate(workflow, {
          type: "node_update",
          node_id: nodeId,
          node_name: node.name,
          node_type: node.type,
          status: "completed",
          result: { cached: true },
          workflow_id: workflow.id
        } as MsgpackData);
      }
      return;
    }
    case "executing": {
      const nodeId = toStringId(data.node);
      if (!nodeId) {
        currentNodeIdRef.current = null;
        finalizeActiveNodes(workflow, nodeLookup, activeNodeIdsRef.current);
        emitWorkflowUpdate(workflow, {
          type: "job_update",
          status: "completed",
          job_id: promptId,
          workflow_id: workflow.id
        } as MsgpackData);
        return;
      }
      currentNodeIdRef.current = nodeId;
      activeNodeIdsRef.current.add(nodeId);
      const node = getNodeMetadata(nodeLookup, nodeId);
      emitWorkflowUpdate(workflow, {
        type: "node_update",
        node_id: nodeId,
        node_name: node.name,
        node_type: node.type,
        status: "running",
        workflow_id: workflow.id
      } as MsgpackData);
      return;
    }
    case "progress": {
      const nodeId = toStringId(data.node) || currentNodeIdRef.current;
      if (!nodeId) {
        log.warn("[ComfyBridge] progress message without node id");
        return;
      }
      const value = typeof data.value === "number" ? data.value : 0;
      const max = typeof data.max === "number" ? data.max : 1;
      emitWorkflowUpdate(workflow, {
        type: "node_progress",
        node_id: nodeId,
        progress: value,
        total: max,
        chunk: "",
        workflow_id: workflow.id
      } as MsgpackData);
      return;
    }
    case "executed": {
      const nodeId = toStringId(data.node);
      if (!nodeId) {
        log.warn("[ComfyBridge] executed message without node id");
        return;
      }
      activeNodeIdsRef.current.delete(nodeId);
      const node = getNodeMetadata(nodeLookup, nodeId);
      const output = data.output ?? {};
      maybeEmitOutputUpdates(workflow, nodeLookup, nodeId, output);
      emitWorkflowUpdate(workflow, {
        type: "node_update",
        node_id: nodeId,
        node_name: node.name,
        node_type: node.type,
        status: "completed",
        result: asRecord(output) || { value: output },
        workflow_id: workflow.id
      } as MsgpackData);
      return;
    }
    case "execution_success": {
      finalizeActiveNodes(workflow, nodeLookup, activeNodeIdsRef.current);
      emitWorkflowUpdate(workflow, {
        type: "job_update",
        status: "completed",
        job_id: promptId,
        workflow_id: workflow.id
      } as MsgpackData);
      return;
    }
    case "execution_interrupted": {
      activeNodeIdsRef.current.clear();
      emitWorkflowUpdate(workflow, {
        type: "job_update",
        status: "cancelled",
        job_id: promptId,
        workflow_id: workflow.id,
        message: "Comfy execution interrupted"
      } as MsgpackData);
      return;
    }
    case "execution_error": {
      const nodeId = toStringId(data.node) || currentNodeIdRef.current;
      const messageText =
        typeof data.exception_message === "string"
          ? data.exception_message
          : "Comfy execution error";
      if (nodeId) {
        activeNodeIdsRef.current.delete(nodeId);
        const node = getNodeMetadata(nodeLookup, nodeId);
        emitWorkflowUpdate(workflow, {
          type: "node_update",
          node_id: nodeId,
          node_name: node.name,
          node_type: node.type,
          status: "error",
          error: messageText,
          workflow_id: workflow.id
        } as MsgpackData);
      }
      emitWorkflowUpdate(workflow, {
        type: "job_update",
        status: "failed",
        job_id: promptId,
        workflow_id: workflow.id,
        error: messageText,
        traceback:
          typeof data.traceback === "string" ? data.traceback : undefined
      } as MsgpackData);
      return;
    }
    default: {
      log.info("[ComfyBridge] unhandled Comfy message type", {
        messageType: type
      });
      return;
    }
  }
};

/**
 * Check if a graph should be executed via ComfyUI
 */
export function shouldUseComfyUIExecution(graph: Graph): boolean {
  return graphHasComfyUINodes(graph);
}

/**
 * Execute a graph via ComfyUI backend
 */
export async function executeViaComfyUI(
  graph: Graph,
  onProgress?: (progress: {
    type: string;
    data: any;
  }) => void,
  workflowForUpdates?: Workflow
): Promise<{
  success: boolean;
  promptId?: string;
  error?: string;
}> {
  const service = getComfyUIService();

  try {
    // Convert graph to ComfyUI prompt format
    const prompt = nodeToolGraphToComfyPrompt(graph);

    log.info("Executing via ComfyUI:", prompt);

    // Submit prompt to ComfyUI
    const response = await service.submitPrompt(prompt);
    const promptId = response.prompt_id;

    log.info("ComfyUI execution started:", response);
    useComfyUIStore.getState().setCurrentPromptId(promptId);
    useComfyUIStore.getState().setExecuting(true);

    if (workflowForUpdates) {
      emitWorkflowUpdate(workflowForUpdates, {
        type: "job_update",
        status: "running",
        job_id: promptId,
        workflow_id: workflowForUpdates.id,
        message: "Comfy job submitted"
      } as MsgpackData);
    }

    // Always connect to WebSocket so execution updates are observable in logs
    // even when no UI progress callback is attached.
    service.disconnectWebSocket();
    const currentNodeIdRef: { current: string | null } = { current: null };
    const activeNodeIdsRef: { current: Set<string> } = { current: new Set() };
    const nodeLookup = buildNodeLookup(graph);
    service.connectWebSocket(
      (data) => {
        const msg = data as { type?: string; data?: unknown };
        log.info("[ComfyWS] update received", {
          type: msg?.type ?? "unknown",
          hasData: msg?.data !== undefined,
          keys:
            msg?.data && typeof msg.data === "object"
              ? Object.keys(msg.data as Record<string, unknown>)
              : [],
        });

        if (workflowForUpdates) {
          translateComfyMessage(
            workflowForUpdates,
            nodeLookup,
            promptId,
            {
              type: msg?.type,
              data: asRecord(msg?.data) || undefined
            },
            currentNodeIdRef,
            activeNodeIdsRef
          );
        }

        if (onProgress) {
          onProgress({
            type: msg?.type ?? "unknown",
            data: msg?.data
          });
        }
      },
      (error) => {
        log.error("ComfyUI WebSocket error:", error);
        if (workflowForUpdates) {
          emitWorkflowUpdate(workflowForUpdates, {
            type: "job_update",
            status: "failed",
            job_id: promptId,
            workflow_id: workflowForUpdates.id,
            error:
              error instanceof Error
                ? error.message
                : "Comfy WebSocket error"
          } as MsgpackData);
        }
      },
      (event) => {
        log.info("ComfyUI WebSocket closed:", event);
        useComfyUIStore.getState().setExecuting(false);
      }
    );

    return {
      success: true,
      promptId
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    log.error("Failed to execute via ComfyUI:", error);
    useComfyUIStore.getState().setExecuting(false);
    return {
      success: false,
      error: errorMessage
    };
  }
}

/**
 * Cancel ComfyUI execution
 */
export async function cancelComfyUIExecution(promptId: string): Promise<void> {
  const service = getComfyUIService();
  await service.cancelPrompt(promptId);
}
