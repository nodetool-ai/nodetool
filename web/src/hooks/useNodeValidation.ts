import { useCallback, useMemo } from "react";
import { Node, Edge } from "@xyflow/react";
import { NodeData } from "../stores/NodeData";
import useValidationStore, { NodeWarning } from "../stores/ValidationStore";
import useMetadataStore from "../stores/MetadataStore";

interface UseNodeValidationOptions {
  workflowId: string;
  nodes: Node<NodeData>[];
  edges: Edge[];
}

export interface NodeValidationResult {
  nodeId: string;
  warnings: NodeWarning[];
}

export function useNodeValidation({ workflowId, nodes, edges }: UseNodeValidationOptions) {
  const metadata = useMetadataStore((state) => state.metadata);
  const setWarnings = useValidationStore((state) => state.setWarnings);
  const clearWarnings = useValidationStore((state) => state.clearWarnings);

  const validateNode = useCallback(
    (node: Node<NodeData>): NodeWarning[] => {
      const warnings: NodeWarning[] = [];

      if (!node.type) {
        return warnings;
      }

      const nodeMetadata = metadata[node.type];

      if (!nodeMetadata) {
        return warnings;
      }

      if (nodeMetadata.properties) {
        for (const property of nodeMetadata.properties) {
          const isInputConnected = edges.some(
            (edge) => edge.target === node.id && edge.targetHandle === property.name
          );

          const isOptional = property.type.optional === true;
          if (!isInputConnected && !isOptional) {
            warnings.push({
              nodeId: node.id,
              type: "missing_input",
              message: `Required input "${property.name}" is not connected`,
              handle: property.name
            });
          }

          const isConstantNode = property.type.type.startsWith("nodetool.constant");
          if (!isConstantNode && !isInputConnected) {
            const nodeData = node.data;
            const value =
              nodeData.dynamic_properties?.[property.name] ?? nodeData.properties?.[property.name];
            const hasValue = value !== undefined && value !== null && value !== "";

            if (!hasValue) {
              warnings.push({
                nodeId: node.id,
                type: "missing_property",
                message: `Required property "${property.name}" is not set`,
                property: property.name
              });
            }
          }
        }
      }

      return warnings;
    },
    [metadata, edges]
  );

  const validationResults = useMemo(() => {
    const results: NodeValidationResult[] = [];

    for (const node of nodes) {
      const warnings = validateNode(node);
      results.push({ nodeId: node.id, warnings });
    }

    return results;
  }, [nodes, validateNode]);

  const updateWarnings = useCallback(() => {
    for (const result of validationResults) {
      if (result.warnings.length > 0) {
        setWarnings(workflowId, result.nodeId, result.warnings);
      } else {
        setWarnings(workflowId, result.nodeId, []);
      }
    }
  }, [workflowId, validationResults, setWarnings]);

  const clearAllWarnings = useCallback(() => {
    clearWarnings(workflowId);
  }, [workflowId, clearWarnings]);

  const hasAnyWarnings = useMemo(() => {
    return validationResults.some((r) => r.warnings.length > 0);
  }, [validationResults]);

  const totalWarningCount = useMemo(() => {
    return validationResults.reduce((sum, r) => sum + r.warnings.length, 0);
  }, [validationResults]);

  return {
    validationResults,
    updateWarnings,
    clearAllWarnings,
    hasAnyWarnings,
    totalWarningCount
  };
}
