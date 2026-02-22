/**
 * useInsertNodeTemplate provides functionality to insert a node template into the workflow.
 * It creates nodes and edges based on the template definition at the specified position.
 */

import { useCallback } from "react";
import { v4 as uuidv4 } from "uuid";
import { useNodes } from "../contexts/NodeContext";
import type { NodeTemplate, TemplateNode, TemplateConnection } from "../stores/NodeTemplatesStore";
import type { Edge, Node } from "@xyflow/react";
import type { NodeData } from "../stores/NodeData";

interface InsertTemplateOptions {
  /** The template to insert */
  template: NodeTemplate;
  /** The position where to insert the template (top-left corner) */
  position: { x: number; y: number };
}

/**
 * Hook for inserting node templates into the workflow
 *
 * @returns Object containing insertTemplate function
 */
export const useInsertNodeTemplate = () => {
  const { addNode, addEdge } = useNodes((state) => ({
    addNode: state.addNode,
    addEdge: state.addEdge
  }));

  /**
   * Inserts a node template at the specified position
   *
   * @param options - The template and position options
   */
  const insertTemplate = useCallback(
    (options: InsertTemplateOptions) => {
      const { template, position } = options;

      // Generate IDs for all nodes first
      const nodeIds = template.nodes.map(() => uuidv4());

      // Create nodes with absolute positions and add them one by one
      const nodesToCreate: Node<NodeData>[] = template.nodes.map((templateNode: TemplateNode, index: number) => {
        const nodeId = nodeIds[index];
        const absolutePosition = {
          x: position.x + templateNode.position.x,
          y: position.y + templateNode.position.y
        };

        const nodeData: NodeData = {
          properties: {
            ...templateNode.properties
          },
          selectable: true,
          dynamic_properties: {},
          workflow_id: ""
        };

        return {
          id: nodeId,
          type: "custom",
          position: absolutePosition,
          data: nodeData
        };
      });

      // Add all nodes
      nodesToCreate.forEach((node) => {
        addNode(node);
      });

      // Create edges using the generated node IDs and add them
      template.connections.forEach((conn: TemplateConnection) => {
        const sourceIndex = parseInt(conn.source, 10);
        const targetIndex = parseInt(conn.target, 10);

        if (sourceIndex >= nodeIds.length || targetIndex >= nodeIds.length) {
          console.warn(`Invalid connection indices: ${conn.source} -> ${conn.target}`);
          return;
        }

        const edge: Edge = {
          id: uuidv4(),
          source: nodeIds[sourceIndex],
          target: nodeIds[targetIndex],
          sourceHandle: conn.sourceHandle,
          targetHandle: conn.targetHandle,
          type: "custom"
        };

        addEdge(edge);
      });
    },
    [addNode, addEdge]
  );

  return { insertTemplate };
};

export default useInsertNodeTemplate;
