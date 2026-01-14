import { useCallback } from "react";
import { useNodes } from "../contexts/NodeContext";
import { useReactFlow } from "@xyflow/react";
import { Snippet } from "../stores/SnippetTypes";
import { getMousePosition } from "../utils/MousePosition";
import { useNotificationStore } from "../stores/NotificationStore";
import { Node, Edge } from "@xyflow/react";
import { NodeData } from "../stores/NodeData";
import useSnippetStore, {
  createSnippetFromSelection,
  applySnippetToGraph
} from "../stores/SnippetStore";

export const useSnippetActions = () => {
  const reactFlow = useReactFlow();
  const generateNodeIds = useNodes((state) => state.generateNodeIds);
  const { nodes, edges, setNodes, setEdges, workflowId } = useNodes(
    (state) => ({
      nodes: state.nodes,
      edges: state.edges,
      setNodes: state.setNodes,
      setEdges: state.setEdges,
      workflowId: state.workflow.id
    })
  );
  const { addSnippet, incrementUsage, snippets } = useSnippetStore(
    (state) => ({
      addSnippet: state.addSnippet,
      incrementUsage: state.incrementUsage,
      snippets: state.snippets
    })
  );
  const addNotification = useNotificationStore(
    (state) => state.addNotification
  );

  const saveSelectedAsSnippet = useCallback(
    (name: string, description: string = ""): boolean => {
      const selectedNodes = nodes.filter((node) => node.selected);

      if (selectedNodes.length === 0) {
        addNotification({
          content: "No nodes selected to save as snippet",
          type: "warning"
        });
        return false;
      }

      const selectedNodeIds = new Set(selectedNodes.map((n) => n.id));
      const connectedEdges = edges.filter(
        (edge) =>
          selectedNodeIds.has(edge.source) && selectedNodeIds.has(edge.target)
      );

      const snippet = createSnippetFromSelection(
        name,
        description,
        selectedNodes,
        connectedEdges
      );

      addSnippet(snippet);

      addNotification({
        content: `Snippet "${name}" saved with ${selectedNodes.length} nodes`,
        type: "success"
      });

      return true;
    },
    [nodes, edges, addSnippet, addNotification]
  );

  const pasteSnippet = useCallback(
    (selectedSnippet: Snippet): boolean => {
      const mousePosition = getMousePosition();

      if (!mousePosition) {
        addNotification({
          content: "Cannot paste: mouse position not available",
          type: "error"
        });
        return false;
      }

      const flowPosition = reactFlow.screenToFlowPosition({
        x: mousePosition.x,
        y: mousePosition.y
      });

      if (!flowPosition) {
        addNotification({
          content: "Cannot paste: failed to calculate position",
          type: "error"
        });
        return false;
      }

      const { newNodes, newEdges } = applySnippetToGraph(
        selectedSnippet,
        nodes,
        edges,
        () => generateNodeIds(1)[0],
        flowPosition
      );

      newNodes.forEach((node) => {
        node.data.workflow_id = workflowId;
      });

      setNodes([...nodes, ...newNodes]);
      setEdges([...edges, ...newEdges]);

      incrementUsage(selectedSnippet.id);

      addNotification({
        content: `Inserted snippet "${selectedSnippet.name || "Untitled"}" with ${newNodes.length} nodes`,
        type: "success"
      });

      return true;
    },
    [
      reactFlow,
      nodes,
      edges,
      generateNodeIds,
      setNodes,
      setEdges,
      workflowId,
      incrementUsage,
      addNotification
    ]
  );

  const getSnippetById = useCallback(
    (id: string): Snippet | undefined => {
      return snippets.find((s) => s.id === id);
    },
    [snippets]
  );

  return {
    saveSelectedAsSnippet,
    pasteSnippet,
    getSnippetById
  };
};
