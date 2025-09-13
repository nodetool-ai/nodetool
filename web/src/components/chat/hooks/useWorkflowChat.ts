import { useCallback, useEffect, useMemo } from "react";
import { useNodes } from "../../../contexts/NodeContext";
import useWorkflowChatStore from "../../../stores/WorkflowChatStore";
import { Message } from "../../../stores/ApiTypes";
import { reactFlowNodeToGraphNode } from "../../../stores/reactFlowNodeToGraphNode";
import { reactFlowEdgeToGraphEdge } from "../../../stores/reactFlowEdgeToGraphEdge";

export const useWorkflowChat = (workflow_id: string, isMinimized: boolean) => {
  const { nodes, edges, workflow } = useNodes((state) => ({
    nodes: state.nodes,
    edges: state.edges,
    workflow: state.workflow
  }));

  const { connect, sendMessage, resetMessages, disconnect, createNewThread, currentThreadId } = useWorkflowChatStore();

  useEffect(() => {
    if (!isMinimized) {
      // Create a thread if none exists
      if (!currentThreadId) {
        createNewThread();
      }
      connect(workflow);
    }
    
    return () => {
      // Optionally disconnect when minimized
      if (!isMinimized) {
        // We don't disconnect to keep the connection alive
      }
    };
  }, [connect, workflow, isMinimized, createNewThread, currentThreadId]);

  const graph = useMemo(() => ({
    nodes: nodes.map(reactFlowNodeToGraphNode),
    edges: edges.map(reactFlowEdgeToGraphEdge)
  }), [nodes, edges]);
  
  const handleSendMessage = useCallback(
    async (message: Message) => {
      if (workflow_id) {
        message.workflow_id = workflow_id;
        message.graph = graph;
        await sendMessage(message);
      } else {
        console.error("Workflow ID is not set");
      }
    },
    [workflow_id, sendMessage, graph]
  );

  const handleReset = useCallback(() => {
    resetMessages();
    connect(workflow);
  }, [resetMessages, connect, workflow]);

  return {
    handleSendMessage,
    handleReset,
    isChat: workflow.run_mode === "chat",
    graph
  };
};
