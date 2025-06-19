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

  const { connect, sendMessage, resetMessages } = useWorkflowChatStore();

  useEffect(() => {
    if (!isMinimized) {
      connect(workflow);
    }
  }, [connect, workflow, isMinimized]);

  const handleSendMessage = useCallback(
    async (message: Message) => {
      if (workflow_id) {
        message.workflow_id = workflow_id;
        message.graph = {
          nodes: nodes.map(reactFlowNodeToGraphNode),
          edges: edges.map(reactFlowEdgeToGraphEdge)
        };
        await sendMessage(message);
      } else {
        console.error("Workflow ID is not set");
      }
    },
    [workflow_id, sendMessage, nodes, edges]
  );

  const handleReset = useCallback(() => {
    resetMessages();
    connect(workflow);
  }, [resetMessages, connect, workflow]);

  return {
    handleSendMessage,
    handleReset,
    isChat: workflow.run_mode === "chat"
  };
};
