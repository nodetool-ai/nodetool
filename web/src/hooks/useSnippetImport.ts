import { useCallback } from "react";
import { Node, Edge, XYPosition, useEdges } from "@xyflow/react";
import { useNodes } from "../contexts/NodeContext";
import { NodeData } from "../stores/NodeData";
import { Snippet, SnippetNode, SnippetEdge } from "../stores/SnippetStore";
import useSnippetStore from "../stores/SnippetStore";

const generateUUID = (): string => {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (char) {
    const randomValue = (Math.random() * 16) | 0;
    const hexValue = char === "x" ? randomValue : (randomValue & 0x3) | 0x8;
    return hexValue.toString(16);
  });
};

interface NodeIdMapping {
  [oldId: string]: string;
}

const isSnippetNode = (node: unknown): node is SnippetNode => {
  return (
    typeof node === "object" &&
    node !== null &&
    "id" in node &&
    "type" in node &&
    "position" in node &&
    "data" in node
  );
};

const isSnippetEdge = (edge: unknown): edge is SnippetEdge => {
  return (
    typeof edge === "object" &&
    edge !== null &&
    "id" in edge &&
    "source" in edge &&
    "target" in edge
  );
};

export const useSnippetImport = () => {
  useNodes((state) => state.nodes);
  const addNode = useNodes((state) => state.addNode);
  const edges = useEdges();
  const incrementUsage = useSnippetStore((state) => state.incrementUsage);

  const importSnippet = useCallback(
    (snippet: Snippet, targetPosition?: XYPosition): { nodes: Node<NodeData>[]; edges: Edge[] } => {
      if (!Array.isArray(snippet.nodes) || !Array.isArray(snippet.edges)) {
        throw new Error("Invalid snippet: nodes and edges must be arrays");
      }

      const nodeIdMapping: NodeIdMapping = {};
      const newNodes: Node<NodeData>[] = [];
      const newEdges: Edge[] = [];

      let minX = Infinity;
      let minY = Infinity;

      snippet.nodes.forEach((node) => {
        if (!isSnippetNode(node)) {
          console.warn("Invalid node in snippet:", node);
          return;
        }

        const newId = generateUUID();
        nodeIdMapping[node.id] = newId;

        if (node.position.x < minX) { minX = node.position.x; }
        if (node.position.y < minY) { minY = node.position.y; }

        const newNode: Node<NodeData> = {
          id: newId,
          type: node.type,
          position: node.position,
          data: node.data as NodeData,
          width: node.width,
          height: node.height,
          selected: false,
          draggable: true
        };

        newNodes.push(newNode);
      });

      if (newNodes.length === 0) {
        throw new Error("No valid nodes in snippet");
      }

      const offsetX = targetPosition ? targetPosition.x - minX : 50 - minX;
      const offsetY = targetPosition ? targetPosition.y - minY : 50 - minY;

      newNodes.forEach((node) => {
        node.position = {
          x: node.position.x + offsetX,
          y: node.position.y + offsetY
        };
      });

      snippet.edges.forEach((edge) => {
        if (!isSnippetEdge(edge)) {
          console.warn("Invalid edge in snippet:", edge);
          return;
        }

        const newSourceId = nodeIdMapping[edge.source];
        const newTargetId = nodeIdMapping[edge.target];

        if (!newSourceId || !newTargetId) {
          console.warn("Edge references missing node:", edge);
          return;
        }

        const newEdge: Edge = {
          id: generateUUID(),
          source: newSourceId,
          target: newTargetId,
          sourceHandle: edge.sourceHandle,
          targetHandle: edge.targetHandle,
          type: edge.type || "default"
        };

        newEdges.push(newEdge);
      });

      return { nodes: newNodes, edges: newEdges };
    },
    []
  );

  const addSnippetToCanvas = useCallback(
    (snippet: Snippet, targetPosition?: XYPosition) => {
      const { nodes: newNodes, edges: newEdges } = importSnippet(snippet, targetPosition);

      newNodes.forEach((node) => {
        addNode(node);
      });

      newEdges.forEach((edge) => {
        edges.push(edge);
      });

      incrementUsage(snippet.id);

      return { nodes: newNodes, edges: newEdges };
    },
    [addNode, edges, importSnippet, incrementUsage]
  );

  return {
    importSnippet,
    addSnippetToCanvas
  };
};

export default useSnippetImport;
