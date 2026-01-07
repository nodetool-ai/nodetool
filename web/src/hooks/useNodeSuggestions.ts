/**
 * Hook that provides smart node suggestions based on the currently selected nodes.
 * Suggests the next logical nodes that can connect to the selected nodes' output types.
 */

import { useMemo, useCallback } from "react";
import { Node } from "@xyflow/react";
import useMetadataStore from "../stores/MetadataStore";
import { useNodes } from "../contexts/NodeContext";
import { NodeData } from "../stores/NodeData";
import { NodeMetadata, TypeMetadata } from "../stores/ApiTypes";
import { isConnectableCached } from "../components/node_menu/typeFilterUtils";

export interface NodeSuggestion {
  nodeType: string;
  title: string;
  description: string;
  outputType: string;
  category: string;
  reason: string;
  priority: number;
}

export interface UseNodeSuggestionsResult {
  suggestions: NodeSuggestion[];
  isAvailable: boolean;
  clearSuggestions: () => void;
  refreshSuggestions: () => void;
}

const SUGGESTION_CATEGORIES = {
  input: "Input",
  processing: "Processing",
  output: "Output",
  control: "Control",
  transform: "Transform",
};

const COMMON_WORKFLOW_PATTERNS: Record<string, string[]> = {
  "nodetool.input.TextInput": ["nodetool.process.llm", "nodetool.process.text", "nodetool.output.TextOutput"],
  "nodetool.input.ImageInput": ["nodetool.process.image", "nodetool.output.ImageOutput", "nodetool.transform.Resize"],
  "nodetool.input.AudioInput": ["nodetool.process.audio", "nodetool.output.AudioOutput"],
  "nodetool.process.LLM": ["nodetool.output.TextOutput", "nodetool.transform.TextParser"],
  "nodetool.process.ImageGenerator": ["nodetool.output.ImageOutput", "nodetool.transform.ImageEditor"],
};

const getOutputTypeFromNode = (
  node: Node<NodeData>,
  metadata: Record<string, NodeMetadata>
): TypeMetadata | null => {
  const nodeType = node.type;
  if (!nodeType) {return null;}
  
  const nodeMetadata = metadata[nodeType];
  if (!nodeMetadata) {return null;}

  if (nodeMetadata.outputs && nodeMetadata.outputs.length > 0) {
    return nodeMetadata.outputs[0].type;
  }

  return null;
};

const getInputTypesForNode = (
  nodeType: string,
  metadata: Record<string, NodeMetadata>
): TypeMetadata[] => {
  const nodeMetadata = metadata[nodeType];
  if (!nodeMetadata || !nodeMetadata.properties) {return [];}

  return nodeMetadata.properties.map((prop) => prop.type);
};

const isTypeCompatible = (
  sourceType: TypeMetadata,
  targetType: TypeMetadata
): boolean => {
  return isConnectableCached(sourceType, targetType);
};

const calculateSuggestionPriority = (
  nodeType: string,
  selectedNodeType: string,
  _outputType: TypeMetadata,
  _compatibleInputs: TypeMetadata[]
): number => {
  let priority = 0;

  if (COMMON_WORKFLOW_PATTERNS[selectedNodeType]?.includes(nodeType)) {
    priority += 10;
  }

  if (nodeType.includes("output")) {
    priority += 3;
  }

  if (nodeType.includes("input")) {
    priority -= 5;
  }

  return priority;
};

export const useNodeSuggestions = (): UseNodeSuggestionsResult => {
  const metadata = useMetadataStore((state) => state.metadata);
  const nodeTypes = useMetadataStore((state) => state.nodeTypes);

  const nodes = useNodes((state) => state.nodes);

  const suggestions = useMemo((): NodeSuggestion[] => {
    const selectedNodes = nodes.filter((n) => n.selected);

    if (selectedNodes.length === 0) {return [];}

    if (selectedNodes.length > 1) {
      const multiNodeSuggestion: NodeSuggestion = {
        nodeType: "nodetool.control.Group",
        title: "Group Nodes",
        description: "Group selected nodes into a container",
        outputType: "group",
        category: "control",
        reason: "Multiple nodes selected - consider grouping them",
        priority: 100,
      };
      return [multiNodeSuggestion];
    }

    const selectedNode = selectedNodes[0];
    const selectedNodeType = selectedNode.type;
    if (!selectedNodeType) {return [];}
    
    const outputType = getOutputTypeFromNode(selectedNode, metadata);

    if (!outputType) {return [];}

    const candidateSuggestions: NodeSuggestion[] = [];

    for (const [nodeType, _nodeTypeComponent] of Object.entries(nodeTypes)) {
      if (nodeType === selectedNodeType) {continue;}
      if (nodeType === "placeholder") {continue;}

      const nodeMetadata = metadata[nodeType];
      if (!nodeMetadata) {continue;}

      const compatibleInputs = getInputTypesForNode(nodeType, metadata);

      const hasCompatibleInput = compatibleInputs.some((inputType) =>
        isTypeCompatible(outputType, inputType)
      );

      if (!hasCompatibleInput) {continue;}

      const priority = calculateSuggestionPriority(
        nodeType,
        selectedNodeType,
        outputType,
        compatibleInputs
      );

      const title = nodeMetadata.title || nodeType.split(".").pop() || nodeType;
      const description = nodeMetadata.description || `Node of type ${nodeType}`;

      let category = "processing";
      if (nodeType.includes("input")) {category = "input";}
      else if (nodeType.includes("output")) {category = "output";}
      else if (nodeType.includes("control")) {category = "control";}
      else if (nodeType.includes("transform")) {category = "transform";}

      let reason = `Can receive ${outputType.type} input`;
      if (nodeMetadata.properties && nodeMetadata.properties.length > 0) {
        const compatibleInput = nodeMetadata.properties.find((inputProp) =>
          isTypeCompatible(outputType, inputProp.type)
        );
        if (compatibleInput) {
          reason = `Compatible input: ${compatibleInput.name || "value"} (${compatibleInput.type.type})`;
        }
      }

      candidateSuggestions.push({
        nodeType,
        title,
        description,
        outputType: outputType.type,
        category,
        reason,
        priority,
      });
    }

    candidateSuggestions.sort((a, b) => b.priority - a.priority);

    return candidateSuggestions.slice(0, 10);
  }, [nodes, metadata, nodeTypes]);

  const isAvailable = useMemo(() => {
    return nodes.filter((n) => n.selected).length === 1 && suggestions.length > 0;
  }, [nodes, suggestions.length]);

  const clearSuggestions = useCallback(() => {
  }, []);

  const refreshSuggestions = useCallback(() => {
  }, []);

  return {
    suggestions,
    isAvailable,
    clearSuggestions,
    refreshSuggestions,
  };
};

export default useNodeSuggestions;
