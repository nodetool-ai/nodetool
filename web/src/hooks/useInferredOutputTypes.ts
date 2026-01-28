import { useMemo } from "react";
import { Graph } from "../stores/ApiTypes";
import { 
  inferWorkflowOutputSchema, 
  InferredOutputSchema,
  InferredOutputType 
} from "../utils/workflowOutputTypeInference";

/**
 * Hook that provides inferred type information for workflow outputs.
 * 
 * This hook implements Option B from the SDK types issue - client-side inference
 * of workflow output types using the graph structure and node metadata.
 * 
 * @param graph - The workflow graph to analyze
 * @returns The inferred output schema, or undefined if no typed outputs found
 * 
 * @example
 * const outputSchema = useInferredOutputSchema(workflow.graph);
 * if (outputSchema) {
 *   console.log("Output types:", outputSchema.properties);
 * }
 */
export const useInferredOutputSchema = (
  graph: Graph | null | undefined
): InferredOutputSchema | undefined => {
  return useMemo(() => {
    if (!graph || !graph.nodes || graph.nodes.length === 0) {
      return undefined;
    }
    return inferWorkflowOutputSchema(graph);
  }, [graph]);
};

/**
 * Hook that provides the inferred type for a specific output by name.
 * 
 * @param graph - The workflow graph to analyze
 * @param outputName - The name of the output to get type information for
 * @returns The inferred output type, or undefined if not found
 * 
 * @example
 * const outputType = useInferredOutputType(workflow.graph, "result");
 * if (outputType?.type === "datetime") {
 *   // Handle datetime output
 * }
 */
export const useInferredOutputType = (
  graph: Graph | null | undefined,
  outputName: string
): InferredOutputType | undefined => {
  const schema = useInferredOutputSchema(graph);
  return useMemo(() => {
    if (!schema) {
      return undefined;
    }
    return schema.properties[outputName];
  }, [schema, outputName]);
};

/**
 * Hook that provides all inferred output types as an array.
 * 
 * @param graph - The workflow graph to analyze
 * @returns Array of inferred output types
 * 
 * @example
 * const outputTypes = useInferredOutputTypes(workflow.graph);
 * outputTypes.forEach(output => {
 *   console.log(`${output.name}: ${output.type}`);
 * });
 */
export const useInferredOutputTypes = (
  graph: Graph | null | undefined
): InferredOutputType[] => {
  const schema = useInferredOutputSchema(graph);
  return useMemo(() => {
    if (!schema) {
      return [];
    }
    return Object.values(schema.properties);
  }, [schema]);
};

/**
 * Hook that checks if a workflow has any typed outputs.
 * 
 * @param graph - The workflow graph to check
 * @returns True if the workflow has typed outputs, false otherwise
 * 
 * @example
 * const hasTypedOutputs = useHasTypedOutputs(workflow.graph);
 * if (hasTypedOutputs) {
 *   // Enable SDK features that require type information
 * }
 */
export const useHasTypedOutputs = (
  graph: Graph | null | undefined
): boolean => {
  const schema = useInferredOutputSchema(graph);
  return useMemo(() => {
    return schema !== undefined && Object.keys(schema.properties).length > 0;
  }, [schema]);
};

/**
 * Hook that provides a type-safe output schema for SDK consumption.
 * This is the main entry point for SDK-like features that need typed workflow outputs.
 * 
 * @param graph - The workflow graph to analyze
 * @returns Object containing the inferred schema and utility functions
 * 
 * @example
 * const { schema, hasTypedOutputs, getOutputType } = useTypedWorkflowOutputs(workflow.graph);
 * 
 * if (schema) {
 *   // Access the full schema
 *   Object.entries(schema.properties).forEach(([name, type]) => {
 *     console.log(`${name}: ${type.type}`);
 *   });
 * }
 * 
 * const datetimeOutput = getOutputType("datetime_result");
 * if (datetimeOutput?.type === "datetime") {
 *   // Handle datetime output with full type info
 * }
 */
export const useTypedWorkflowOutputs = (
  graph: Graph | null | undefined
): {
  schema: InferredOutputSchema | undefined;
  hasTypedOutputs: boolean;
  outputTypes: InferredOutputType[];
  getOutputType: (name: string) => InferredOutputType | undefined;
  isRequired: (name: string) => boolean;
} => {
  const schema = useInferredOutputSchema(graph);
  const hasTypedOutputs = useHasTypedOutputs(graph);
  const outputTypes = useInferredOutputTypes(graph);

  const getOutputType = (name: string): InferredOutputType | undefined => {
    if (!schema) {
      return undefined;
    }
    return schema.properties[name];
  };

  const isRequired = (name: string): boolean => {
    if (!schema) {
      return false;
    }
    return schema.required.includes(name);
  };

  return {
    schema,
    hasTypedOutputs,
    outputTypes,
    getOutputType,
    isRequired
  };
};
