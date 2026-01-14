import { useCallback } from "react";
import { Node } from "@xyflow/react";
import { useReactFlow } from "@xyflow/react";
import { useNodes } from "../contexts/NodeContext";
import { NodeData } from "../stores/NodeData";
import { AnnotationColor } from "../components/node_types/AnnotationNode";

const ANNOTATION_NODE_TYPE = "nodetool.annotation.Annotation";

export const useCreateAnnotationNode = () => {
  const reactFlowInstance = useReactFlow();
  const { addNode } = useNodes((state) => ({
    addNode: state.addNode
  }));

  const handleCreateAnnotationNode = useCallback(
    (
      position: { x: number; y: number },
      options?: {
        text?: string;
        color?: AnnotationColor;
      }
    ) => {
      if (!reactFlowInstance) { return; }

      const flowPosition = reactFlowInstance.screenToFlowPosition(position);
      const nodeId = crypto.randomUUID();

      const node: Node<NodeData> = {
        id: nodeId,
        type: ANNOTATION_NODE_TYPE,
        position: flowPosition,
        style: {
          width: 250,
          height: 150
        },
        data: {
          properties: {
            annotation_text: options?.text || "",
            annotation_color: options?.color || "yellow",
            is_editing: false
          },
          selectable: true,
          dynamic_properties: {},
          workflow_id: ""
        },
        selected: false
      };

      addNode(node);
      return nodeId;
    },
    [reactFlowInstance, addNode]
  );

  return handleCreateAnnotationNode;
};
