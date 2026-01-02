import { useCallback } from "react";
import { Node, Edge } from "@xyflow/react";
import { NodeData } from "../../stores/NodeData";
import { useNodes } from "../../contexts/NodeContext";
import { useWorkflowManager } from "../../contexts/WorkflowManagerContext";
import { useNavigate } from "react-router-dom";
import {
  SUBPATCH_NODE_METADATA,
  WORKFLOW_INPUT_NODE_METADATA,
  WORKFLOW_OUTPUT_NODE_METADATA,
  WORKFLOW_INPUT_NODE_TYPE,
  WORKFLOW_OUTPUT_NODE_TYPE,
} from "../../utils/nodeUtils";

/**
 * Determines the data type from a handle based on node metadata
 */
const getTypeFromHandle = (
  node: Node<NodeData>,
  handleId: string,
  handleType: "source" | "target",
  metadata: Record<string, any>
): string => {
  const nodeMeta = metadata[node.type || ""];
  if (!nodeMeta) {
    return "any";
  }

  if (handleType === "source") {
    // Look for output
    const output = nodeMeta.outputs?.find((o: any) => o.name === handleId);
    return output?.type?.type || "any";
  } else {
    // Look for property/input
    const prop = nodeMeta.properties?.find((p: any) => p.name === handleId);
    return prop?.type?.type || "any";
  }
};

/**
 * Hook for creating a subpatch from selected nodes.
 * Creates a new workflow with the selected nodes and replaces them with a subpatch node.
 */
export const useCreateSubpatch = () => {
  const navigate = useNavigate();
  const { createNode, setNodes, setEdges, generateNodeId, edges, nodes } = useNodes(
    (state) => ({
      createNode: state.createNode,
      setNodes: state.setNodes,
      setEdges: state.setEdges,
      generateNodeId: state.generateNodeId,
      edges: state.edges,
      nodes: state.nodes,
    })
  );

  const { createNew, saveWorkflow, getCurrentWorkflow, addWorkflow } = useWorkflowManager(
    (state) => ({
      createNew: state.createNew,
      saveWorkflow: state.saveWorkflow,
      getCurrentWorkflow: state.getCurrentWorkflow,
      addWorkflow: state.addWorkflow,
    })
  );

  const createSubpatch = useCallback(
    async ({
      selectedNodes,
      subpatchName = "New Subpatch",
    }: {
      selectedNodes: Node<NodeData>[];
      subpatchName?: string;
    }) => {
      if (selectedNodes.length === 0) {
        return null;
      }

      const currentWorkflow = getCurrentWorkflow();
      if (!currentWorkflow) {
        console.error("No current workflow");
        return null;
      }

      // Get the IDs of selected nodes
      const selectedNodeIds = new Set(selectedNodes.map((n) => n.id));

      // Find edges that cross the selection boundary (need to create WorkflowInput/Output for these)
      const incomingEdges: Edge[] = []; // Edges from outside to inside selection
      const outgoingEdges: Edge[] = []; // Edges from inside to outside selection
      const internalEdges: Edge[] = []; // Edges entirely within selection

      for (const edge of edges) {
        const sourceInSelection = selectedNodeIds.has(edge.source);
        const targetInSelection = selectedNodeIds.has(edge.target);

        if (sourceInSelection && targetInSelection) {
          internalEdges.push(edge);
        } else if (sourceInSelection && !targetInSelection) {
          outgoingEdges.push(edge);
        } else if (!sourceInSelection && targetInSelection) {
          incomingEdges.push(edge);
        }
      }

      // Calculate the bounding box of selected nodes
      const bounds = selectedNodes.reduce(
        (acc, node) => ({
          minX: Math.min(acc.minX, node.position.x),
          minY: Math.min(acc.minY, node.position.y),
          maxX: Math.max(acc.maxX, node.position.x + (node.measured?.width || 200)),
          maxY: Math.max(acc.maxY, node.position.y + (node.measured?.height || 100)),
        }),
        { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity }
      );

      // Create the new subpatch workflow
      const newSubpatchWorkflow = await createNew();
      if (!newSubpatchWorkflow) {
        console.error("Failed to create subpatch workflow");
        return null;
      }

      // Update the workflow name
      newSubpatchWorkflow.name = subpatchName;
      newSubpatchWorkflow.description = `Subpatch created from ${currentWorkflow.name}`;

      // Create WorkflowInput nodes for each incoming edge
      const workflowInputNodes: Node<NodeData>[] = [];
      const inputNameMap = new Map<string, string>(); // Maps original target handle to input name

      let inputY = 100;
      for (const edge of incomingEdges) {
        const targetNode = nodes.find((n) => n.id === edge.target);
        const inputName = edge.targetHandle || `input_${workflowInputNodes.length + 1}`;
        
        // Avoid duplicate inputs for the same target handle
        const uniqueKey = `${edge.target}:${edge.targetHandle}`;
        if (inputNameMap.has(uniqueKey)) {
          continue;
        }
        inputNameMap.set(uniqueKey, inputName);

        // Determine the type from the target handle
        const inputType = targetNode ? "any" : "any"; // Could be improved with metadata lookup

        const inputNode: Node<NodeData> = {
          id: generateNodeId(),
          type: WORKFLOW_INPUT_NODE_TYPE,
          position: { x: 50, y: inputY },
          data: {
            properties: {
              name: inputName,
              input_type: inputType,
              description: `Input for ${targetNode?.type || "node"}`,
            },
            selectable: true,
            dynamic_properties: {},
            workflow_id: newSubpatchWorkflow.id,
          },
        };
        workflowInputNodes.push(inputNode);
        inputY += 150;
      }

      // Create WorkflowOutput nodes for each outgoing edge
      const workflowOutputNodes: Node<NodeData>[] = [];
      const outputNameMap = new Map<string, string>(); // Maps original source handle to output name

      let outputY = 100;
      for (const edge of outgoingEdges) {
        const sourceNode = nodes.find((n) => n.id === edge.source);
        const outputName = edge.sourceHandle || `output_${workflowOutputNodes.length + 1}`;
        
        // Avoid duplicate outputs for the same source handle
        const uniqueKey = `${edge.source}:${edge.sourceHandle}`;
        if (outputNameMap.has(uniqueKey)) {
          continue;
        }
        outputNameMap.set(uniqueKey, outputName);

        // Determine the type from the source handle
        const outputType = "any"; // Could be improved with metadata lookup

        const outputNode: Node<NodeData> = {
          id: generateNodeId(),
          type: WORKFLOW_OUTPUT_NODE_TYPE,
          position: { x: bounds.maxX - bounds.minX + 300, y: outputY },
          data: {
            properties: {
              name: outputName,
              output_type: outputType,
            },
            selectable: true,
            dynamic_properties: {},
            workflow_id: newSubpatchWorkflow.id,
          },
        };
        workflowOutputNodes.push(outputNode);
        outputY += 150;
      }

      // Offset the selected nodes to start at (200, 100) in the new workflow
      const offsetX = 200 - bounds.minX;
      const offsetY = 100 - bounds.minY;

      const subpatchNodes: Node<NodeData>[] = selectedNodes.map((node) => ({
        ...node,
        id: node.id, // Keep the same ID for edge mapping
        position: {
          x: node.position.x + offsetX,
          y: node.position.y + offsetY,
        },
        parentId: undefined, // Remove parent relationships
        data: {
          ...node.data,
          workflow_id: newSubpatchWorkflow.id,
        },
      }));

      // Create edges connecting WorkflowInput nodes to the original targets
      const inputEdges: Edge[] = [];
      for (const edge of incomingEdges) {
        const uniqueKey = `${edge.target}:${edge.targetHandle}`;
        const inputName = inputNameMap.get(uniqueKey);
        const inputNode = workflowInputNodes.find(
          (n) => n.data.properties?.name === inputName
        );
        
        if (inputNode) {
          inputEdges.push({
            id: `${inputNode.id}-${edge.target}-${edge.targetHandle}`,
            source: inputNode.id,
            sourceHandle: "value",
            target: edge.target,
            targetHandle: edge.targetHandle,
          });
        }
      }

      // Create edges connecting the original sources to WorkflowOutput nodes
      const outputEdges: Edge[] = [];
      for (const edge of outgoingEdges) {
        const uniqueKey = `${edge.source}:${edge.sourceHandle}`;
        const outputName = outputNameMap.get(uniqueKey);
        const outputNode = workflowOutputNodes.find(
          (n) => n.data.properties?.name === outputName
        );
        
        if (outputNode) {
          outputEdges.push({
            id: `${edge.source}-${outputNode.id}-${edge.sourceHandle}`,
            source: edge.source,
            sourceHandle: edge.sourceHandle,
            target: outputNode.id,
            targetHandle: "value",
          });
        }
      }

      // Combine all nodes and edges for the subpatch workflow
      const allSubpatchNodes = [
        ...workflowInputNodes,
        ...subpatchNodes,
        ...workflowOutputNodes,
      ];
      const allSubpatchEdges = [...inputEdges, ...internalEdges, ...outputEdges];

      // Update the subpatch workflow's graph
      newSubpatchWorkflow.graph = {
        nodes: allSubpatchNodes.map((n) => ({
          id: n.id,
          type: n.type || "",
          data: n.data?.properties || {},
          parent_id: n.parentId,
          ui_properties: {
            position: n.position,
            width: n.measured?.width,
            height: n.measured?.height,
          },
          dynamic_properties: n.data?.dynamic_properties || {},
          dynamic_outputs: n.data?.dynamic_outputs || {},
          sync_mode: "on_any" as const,
        })),
        edges: allSubpatchEdges.map((e) => ({
          id: e.id,
          source: e.source,
          target: e.target,
          sourceHandle: e.sourceHandle || "",
          targetHandle: e.targetHandle || "",
          ui_properties: {},
        })),
      };

      // Save the subpatch workflow
      await saveWorkflow(newSubpatchWorkflow);

      // Create a subpatch node to replace the selected nodes in the original workflow
      const subpatchNodePosition = {
        x: bounds.minX,
        y: bounds.minY,
      };

      const subpatchNode = createNode(SUBPATCH_NODE_METADATA, subpatchNodePosition, {
        workflow_ref: newSubpatchWorkflow.id,
      });

      // Create new edges connecting to the subpatch node
      const newEdgesFromIncoming: Edge[] = incomingEdges.map((edge) => {
        const uniqueKey = `${edge.target}:${edge.targetHandle}`;
        const inputName = inputNameMap.get(uniqueKey);
        return {
          id: `${edge.source}-${subpatchNode.id}-${inputName}`,
          source: edge.source,
          sourceHandle: edge.sourceHandle,
          target: subpatchNode.id,
          targetHandle: inputName || edge.targetHandle,
        };
      });

      const newEdgesFromOutgoing: Edge[] = outgoingEdges.map((edge) => {
        const uniqueKey = `${edge.source}:${edge.sourceHandle}`;
        const outputName = outputNameMap.get(uniqueKey);
        return {
          id: `${subpatchNode.id}-${edge.target}-${outputName}`,
          source: subpatchNode.id,
          sourceHandle: outputName || edge.sourceHandle,
          target: edge.target,
          targetHandle: edge.targetHandle,
        };
      });

      // Update the current workflow: remove selected nodes and add subpatch node
      setNodes((prevNodes) => {
        const filteredNodes = prevNodes.filter((n) => !selectedNodeIds.has(n.id));
        return [...filteredNodes, subpatchNode];
      });

      // Update edges: remove edges involving selected nodes and add new edges
      const filteredEdges = edges.filter(
        (e: Edge) => !selectedNodeIds.has(e.source) && !selectedNodeIds.has(e.target)
      );
      setEdges([...filteredEdges, ...newEdgesFromIncoming, ...newEdgesFromOutgoing]);

      return {
        subpatchWorkflow: newSubpatchWorkflow,
        subpatchNode,
      };
    },
    [
      createNode,
      setNodes,
      setEdges,
      generateNodeId,
      edges,
      nodes,
      createNew,
      saveWorkflow,
      getCurrentWorkflow,
    ]
  );

  return { createSubpatch };
};
