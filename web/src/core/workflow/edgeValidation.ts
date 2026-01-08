import { Edge, Node } from "@xyflow/react";
import { NodeMetadata } from "../../stores/ApiTypes";
import { NodeData } from "../../stores/NodeData";
import { hasInputHandle, hasOutputHandle } from "../../utils/handleUtils";
import { wouldCreateCycle } from "../../utils/graphCycle";
import { EdgeValidationIssue, ValidationSeverity } from "../../stores/EdgeValidationStore";

interface ValidateEdgesOptions {
  nodes: Node<NodeData>[];
  edges: Edge[];
  metadata: Record<string, NodeMetadata>;
  workflowId: string;
}

export interface ValidateEdgesResult {
  issues: EdgeValidationIssue[];
  isValid: boolean;
  edgeCount: number;
  issueCount: number;
}

function createIssue(
  edge: Edge,
  code: EdgeValidationIssue["code"],
  severity: ValidationSeverity,
  message: string
): EdgeValidationIssue {
  return {
    edgeId: edge.id,
    sourceId: edge.source,
    targetId: edge.target,
    sourceHandle: edge.sourceHandle ?? null,
    targetHandle: edge.targetHandle ?? null,
    severity,
    message,
    code
  };
}

export function validateEdges(options: ValidateEdgesOptions): ValidateEdgesResult {
  const { nodes, edges, metadata, workflowId } = options;
  const issues: EdgeValidationIssue[] = [];
  const nodeMap = new Map(nodes.map((node) => [node.id, node]));

  for (const edge of edges) {
    const sourceNode = nodeMap.get(edge.source);
    const targetNode = nodeMap.get(edge.target);

    if (!sourceNode) {
      issues.push(
        createIssue(
          edge,
          "missing_source_node",
          "error",
          `Edge references non-existent source node "${edge.source}"`
        )
      );
      continue;
    }

    if (!targetNode) {
      issues.push(
        createIssue(
          edge,
          "missing_target_node",
          "error",
          `Edge references non-existent target node "${edge.target}"`
        )
      );
      continue;
    }

    if (!edge.sourceHandle) {
      issues.push(
        createIssue(
          edge,
          "invalid_source_handle",
          "warning",
          `Edge has missing source handle`
        )
      );
      continue;
    }

    if (!edge.targetHandle) {
      issues.push(
        createIssue(
          edge,
          "invalid_target_handle",
          "warning",
          `Edge has missing target handle`
        )
      );
      continue;
    }

    const sourceMetadata = sourceNode.type ? metadata[sourceNode.type] : undefined;
    const targetMetadata = targetNode.type ? metadata[targetNode.type] : undefined;

    if (!sourceMetadata || !targetMetadata) {
      continue;
    }

    if (!hasOutputHandle(sourceNode, edge.sourceHandle, sourceMetadata)) {
      const availableOutputs = [
        ...sourceMetadata.outputs.map((o: { name: string }) => o.name),
        ...Object.keys(sourceNode.data.dynamic_outputs || {})
      ];
      issues.push(
        createIssue(
          edge,
          "invalid_source_handle",
          "error",
          `Source node "${sourceNode.type}" does not have output handle "${edge.sourceHandle}". Available: ${availableOutputs.join(", ") || "none"}`
        )
      );
    }

    if (
      !targetMetadata.is_dynamic &&
      !hasInputHandle(targetNode, edge.targetHandle, targetMetadata)
    ) {
      const availableInputs = [
        ...targetMetadata.properties.map((p: { name: string }) => p.name),
        ...Object.keys(targetNode.data.dynamic_properties || {})
      ];
      issues.push(
        createIssue(
          edge,
          "invalid_target_handle",
          "error",
          `Target node "${targetNode.type}" does not have input handle "${edge.targetHandle}". Available: ${availableInputs.join(", ") || "none"}`
        )
      );
    }

    if (wouldCreateCycle(edges, edge.source, edge.target)) {
      issues.push(
        createIssue(
          edge,
          "potential_cycle",
          "error",
          `Edge would create a cycle in the workflow graph`
        )
      );
    }
  }

  const orphanedEdges = edges.filter((edge) => {
    const sourceNode = nodeMap.get(edge.source);
    const targetNode = nodeMap.get(edge.target);
    return !sourceNode || !targetNode;
  });

  for (const edge of orphanedEdges) {
    const sourceExists = nodeMap.has(edge.source);
    const targetExists = nodeMap.has(edge.target);

    if (!sourceExists && !targetExists) {
      issues.push(
        createIssue(
          edge,
          "orphaned_edge",
          "error",
          `Edge connects two non-existent nodes`
        )
      );
    } else if (!sourceExists) {
      issues.push(
        createIssue(
          edge,
          "missing_source_node",
          "error",
          `Edge source node "${edge.source}" does not exist`
        )
      );
    } else if (!targetExists) {
      issues.push(
        createIssue(
          edge,
          "missing_target_node",
          "error",
          `Edge target node "${edge.target}" does not exist`
        )
      );
    }
  }

  const errorCount = issues.filter((i) => i.severity === "error").length;
  const warningCount = issues.filter((i) => i.severity === "warning").length;

  return {
    issues,
    isValid: errorCount === 0,
    edgeCount: edges.length,
    issueCount: issues.length
  };
}

export function getValidationSummary(result: ValidateEdgesResult): string {
  if (result.edgeCount === 0) {
    return "No edges to validate";
  }

  if (result.isValid) {
    return `All ${result.edgeCount} edge(s) are valid`;
  }

  const errorCount = result.issues.filter((i) => i.severity === "error").length;
  const warningCount = result.issues.filter((i) => i.severity === "warning").length;

  const parts: string[] = [];
  if (errorCount > 0) {
    parts.push(`${errorCount} error(s)`);
  }
  if (warningCount > 0) {
    parts.push(`${warningCount} warning(s)`);
  }

  return `Found ${parts.join(", ")} in ${result.edgeCount} edge(s)`;
}
