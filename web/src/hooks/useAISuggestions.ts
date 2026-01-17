/**
 * AI Node Suggestions Hook
 *
 * Provides AI-powered node suggestions based on the current workflow context.
 * This is an experimental feature that analyzes:
 * - Currently selected nodes
 * - Available node types and their input/output types
 * - Common workflow patterns
 *
 * The hook provides smart recommendations that help users discover relevant
 * nodes they might not have considered.
 */

import { useCallback, useMemo, useRef } from "react";
import { useNodes } from "../contexts/NodeContext";
import useMetadataStore from "../stores/MetadataStore";
import { useAISuggestionsStore } from "../stores/AISuggestionsStore";

interface UseAISuggestionsOptions {
  enabled?: boolean;
  maxSuggestions?: number;
}

interface UseAISuggestionsReturn {
  suggestions: NodeSuggestion[];
  isLoading: boolean;
  error: string | null;
  refreshSuggestions: () => void;
  clearSuggestions: () => void;
}

/**
 * Analyzes node compatibility based on type matching
 */
const findCompatibleNodes = (
  outputType: string,
  allMetadata: Record<string, import("../stores/ApiTypes").NodeMetadata>
): import("../stores/ApiTypes").NodeMetadata[] => {
  const compatible: import("../stores/ApiTypes").NodeMetadata[] = [];

  // Exact type match
  const exactMatch = allMetadata[outputType];
  if (exactMatch) {
    compatible.push(exactMatch);
  }

  // Find nodes that can accept this type as input
  for (const metadata of Object.values(allMetadata)) {
    // @ts-expect-error - inputs property exists on NodeMetadata at runtime
    if (!metadata.inputs) {
      continue;
    }

    for (const input of metadata.inputs) {
      // Check if this input accepts the output type
      if (input.accepts && input.accepts.includes(outputType)) {
        if (!compatible.find((m) => m.type === metadata.type)) {
          compatible.push(metadata);
        }
      }
      // Also check for "any" type inputs
      // @ts-expect-error - accepts property exists on input at runtime
      if (input.accepts && input.accepts.includes("any")) {
        if (!compatible.find((m) => m.type === metadata.type)) {
          compatible.push(metadata);
        }
      }
    }
  }

  return compatible;
};

/**
 * Analyzes workflow patterns to suggest improvements
 */
const findPatternSuggestions = (
  nodes: import("../stores/ApiTypes").Node[],
  allMetadata: Record<string, import("../stores/ApiTypes").NodeMetadata>
): NodeSuggestion[] => {
  const suggestions: NodeSuggestion[] = [];

  // Pattern 1: Suggest "Preview" nodes for output nodes that don't have one
  const outputNodes = nodes.filter((n) => {
    const metadata = allMetadata[n.type];
    return metadata && metadata.category === "output";
  });

  for (const outputNode of outputNodes) {
    // @ts-expect-error - inputs property exists on NodeMetadata at runtime
    const metadata = allMetadata[outputNode.type];
    // @ts-expect-error - inputs property exists on NodeMetadata at runtime
    if (!metadata || !metadata.inputs) {
      continue;
    }

    // @ts-expect-error - inputs property exists on NodeMetadata at runtime
    for (const input of metadata.inputs) {
      if (input.accepts && (input.accepts.includes("image") || input.accepts.includes("audio"))) {
        // Check if there's already a Preview node connected
        const hasPreview = nodes.some(
          (n) =>
            n.type === "nodetool.base.Preview" &&
            n.id !== outputNode.id
        );

        if (!hasPreview) {
          const previewMetadata = allMetadata["nodetool.base.Preview"];
          if (previewMetadata) {
            suggestions.push({
              nodeType: "nodetool.base.Preview",
              // @ts-expect-error - display_name property exists on NodeMetadata at runtime
              reason: `Add a Preview node to visualize the output from ${metadata.display_name || outputNode.type}`,
              confidence: 0.7,
              metadata: previewMetadata
            });
          }
        }
      }
    }
  }

  // Pattern 2: Suggest "Constant" nodes for unconnected required inputs
  const constantTypes = ["text", "integer", "float", "boolean"];
  for (const node of nodes) {
    // @ts-expect-error - inputs property exists on NodeMetadata at runtime
    const metadata = allMetadata[node.type];
    // @ts-expect-error - inputs property exists on NodeMetadata at runtime
    if (!metadata || !metadata.inputs) {
      continue;
    }

    // @ts-expect-error - inputs property exists on NodeMetadata at runtime
    for (const input of metadata.inputs) {
      if (input.required && !input.optional) {
        // Check if this input has any connections (simplified check)
        // In a real implementation, we'd check the edges
        // For now, we'll suggest constant nodes based on type
        if (input.accepts) {
          for (const type of input.accepts) {
            if (constantTypes.includes(type)) {
              // @ts-expect-error - type property access
              const constantMetadata = allMetadata[`nodetool.input.Constant${type.charAt(0).toUpperCase() + type.slice(1)}`];
              if (constantMetadata) {
                suggestions.push({
                  nodeType: constantMetadata.type,
                  // @ts-expect-error - display_name property exists on NodeMetadata at runtime
                  reason: `Add a ${constantMetadata.display_name} to provide the required "${input.name}" input for ${metadata.display_name || node.type}`,
                  confidence: 0.5,
                  metadata: constantMetadata
                });
              }
            }
          }
        }
      }
    }
  }

  // Pattern 3: Suggest text processing nodes after text output
  const textNodes = nodes.filter((n) => {
    // @ts-expect-error - category property exists on NodeMetadata at runtime
    const metadata = allMetadata[n.type];
    // @ts-expect-error - inputs property exists on NodeMetadata at runtime
    return metadata && metadata.inputs?.some((i) => i.accepts?.includes("text"));
  });

  for (const textNode of textNodes) {
    // @ts-expect-error - category property exists on NodeMetadata at runtime
    const metadata = allMetadata[textNode.type];
    if (!metadata) {
      continue;
    }

    // Check if it's a text OUTPUT node (like LLM or text generation)
    // @ts-expect-error - category property exists on NodeMetadata at runtime
    if (metadata.category === "model" || metadata.category === "text") {
      const textProcessingNodes = [
        "nodetool.text.TextLength",
        "nodetool.text.TextToUppercase",
        "nodetool.text.TextToLowercase"
      ];

      for (const nodeType of textProcessingNodes) {
        const processingMetadata = allMetadata[nodeType];
        if (processingMetadata) {
          suggestions.push({
            nodeType,
            // @ts-expect-error - display_name property exists on NodeMetadata at runtime
            reason: `Process the text output from ${metadata.display_name || textNode.type} with ${processingMetadata.display_name}`,
            confidence: 0.4,
            metadata: processingMetadata
          });
        }
      }
    }
  }

  return suggestions;
};

/**
 * Hook providing AI-powered node suggestions for the workflow editor
 */
export const useAISuggestions = (
  options: UseAISuggestionsOptions = {}
): UseAISuggestionsReturn => {
  const { enabled = true, maxSuggestions = 5 } = options;

  const nodes = useNodes((state) => state.nodes);
  const selectedNodes = useNodes((state) => state.selectedNodes);

  const metadata = useMetadataStore((state) => state.metadata);

  const { suggestions, isLoading, error, setSuggestions, _clearSuggestions, setLoading } =
    useAISuggestionsStore();

  const debounceTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const _refreshSuggestions = useCallback(() => {
    if (!enabled || !metadata) {
      clearSuggestions();
      return;
    }

    setLoading(true);

    // Clear any pending timeout
    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current);
    }

    // Debounce the suggestion generation
    debounceTimeoutRef.current = setTimeout(() => {
      const newSuggestions: NodeSuggestion[] = [];
      const allMetadata = metadata;
      const metadataValues = Object.values(allMetadata);

      // 1. Suggest nodes based on selected nodes
      for (const selectedNode of selectedNodes) {
        const nodeMetadata = allMetadata[selectedNode.type];
        // @ts-expect-error - outputs property exists on NodeMetadata at runtime
        if (!nodeMetadata || !nodeMetadata.outputs) {
          continue;
        }

        // @ts-expect-error - outputs property exists on NodeMetadata at runtime
        for (const output of nodeMetadata.outputs) {
          if (!output.type) {
            continue;
          }

          const compatible = findCompatibleNodes(output.type, allMetadata);
          for (const compatibleNode of compatible) {
            // Avoid suggesting the same node type
            if (compatibleNode.type === selectedNode.type) {
              continue;
            }

            // Check if we already have this suggestion
            if (!newSuggestions.find((s) => s.nodeType === compatibleNode.type)) {
              newSuggestions.push({
                nodeType: compatibleNode.type,
                // @ts-expect-error - display_name property exists on NodeMetadata at runtime
                reason: `Connect to process ${output.type} output from ${nodeMetadata.display_name || selectedNode.type}`,
                confidence: 0.8,
                metadata: compatibleNode
              });
            }
          }
        }
      }

      // 2. Add pattern-based suggestions
      const patternSuggestions = findPatternSuggestions(nodes, allMetadata);
      for (const pattern of patternSuggestions) {
        if (!newSuggestions.find((s) => s.nodeType === pattern.nodeType)) {
          newSuggestions.push(pattern);
        }
      }

      // 3. Add general workflow enhancement suggestions
      // Check if the workflow has no inputs
      const hasInputNode = nodes.some(
        // @ts-expect-error - category property exists on NodeMetadata at runtime
        (n) => allMetadata[n.type]?.category === "input"
      );
      if (!hasInputNode) {
        const textInput = metadataValues.find(
          (m) => m.type === "nodetool.input.TextInput"
        );
        if (textInput) {
          newSuggestions.push({
            nodeType: textInput.type,
            reason: "Add an input node to start your workflow with text input",
            confidence: 0.6,
            metadata: textInput
          });
        }
      }

      // Limit and sort suggestions by confidence
      const limitedSuggestions = newSuggestions
        .sort((a, b) => b.confidence - a.confidence)
        .slice(0, maxSuggestions);

      setSuggestions(limitedSuggestions);
      debounceTimeoutRef.current = null;
    }, 150); // Debounce delay to batch rapid changes
  }, [enabled, metadata, nodes, selectedNodes, maxSuggestions, setSuggestions, setLoading]);

  // Auto-refresh when nodes or selection changes
  const memoizedSuggestions = useMemo(() => suggestions, [suggestions]);

  return {
    suggestions: memoizedSuggestions,
    isLoading,
    error,
    refreshSuggestions: _refreshSuggestions,
    clearSuggestions: _clearSuggestions
  };
};

export default useAISuggestions;
