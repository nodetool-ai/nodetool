import { create } from "zustand";
import { Node, Edge } from "@xyflow/react";
import { NodeData } from "./NodeData";
import { NodeMetadata } from "./ApiTypes";

export type ValidationSeverity = "error" | "warning" | "info";

export interface ValidationIssue {
  id: string;
  type: "disconnected_node" | "unused_input" | "cycle" | "missing_model" | "configuration" | "performance";
  severity: ValidationSeverity;
  message: string;
  nodeId?: string;
  edgeId?: string;
  helpUrl?: string;
}

export interface ValidationResult {
  issues: ValidationIssue[];
  isValid: boolean;
  score: number;
}

interface WorkflowValidationState {
  issues: ValidationIssue[];
  lastValidatedAt: number | null;
  isValid: boolean;
  score: number;

  validateWorkflow: (
    nodes: Node<NodeData>[],
    edges: Edge[],
    metadata: Record<string, NodeMetadata>
  ) => ValidationResult;

  clearValidation: () => void;

  getIssueCount: () => { errors: number; warnings: number; info: number };
}

const generateId = () => Math.random().toString(36).substring(2, 9);

const checkDisconnectedNodes = (
  nodes: Node<NodeData>[],
  edges: Edge[]
): ValidationIssue[] => {
  const issues: ValidationIssue[] = [];
  const connectedNodeIds = new Set<string>();

  edges.forEach((edge) => {
    if (edge.source) connectedNodeIds.add(edge.source);
    if (edge.target) connectedNodeIds.add(edge.target);
  });

  nodes.forEach((node) => {
    if (!connectedNodeIds.has(node.id) && node.type !== "inputNode" && node.type !== "groupNode") {
      const data = node.data as NodeData & { label?: string };
      issues.push({
        id: generateId(),
        type: "disconnected_node",
        severity: "warning",
        message: `Node "${data.label || node.id}" is not connected to any other nodes`,
        nodeId: node.id,
        helpUrl: "/docs/workflows#connections",
      });
    }
  });

  return issues;
};

const checkUnusedInputs = (
  nodes: Node<NodeData>[],
  edges: Edge[],
  metadata: Record<string, NodeMetadata>
): ValidationIssue[] => {
  const issues: ValidationIssue[] = [];
  const inputNodeIds = new Set<string>();

  edges.forEach((edge) => {
    if (edge.target) inputNodeIds.add(edge.target);
  });

  nodes.forEach((node) => {
    if (!node.type) return;
    const nodeMetadata = metadata[node.type];
    if (!nodeMetadata) return;

    const isInputNode = node.type.startsWith("inputNode");
    if (isInputNode && !inputNodeIds.has(node.id)) {
      const data = node.data as NodeData & { label?: string };
      issues.push({
        id: generateId(),
        type: "unused_input",
        severity: "info",
        message: `Input node "${data.label || node.id}" output is not connected`,
        nodeId: node.id,
      });
    }
  });

  return issues;
};

const checkCycles = (
  nodes: Node<NodeData>[],
  edges: Edge[]
): ValidationIssue[] => {
  const issues: ValidationIssue[] = [];
  const adj = new Map<string, string[]>();

  nodes.forEach((node) => adj.set(node.id, []));
  edges.forEach((edge) => {
    const sources = adj.get(edge.source) || [];
    sources.push(edge.target);
    adj.set(edge.source, sources);
  });

  const visited = new Set<string>();
  const recursionStack = new Set<string>();
  const path: string[] = [];

  const dfs = (nodeId: string): boolean => {
    if (recursionStack.has(nodeId)) {
      const cycleStart = path.indexOf(nodeId);
      const cycleNodes = path.slice(cycleStart);
      issues.push({
        id: generateId(),
        type: "cycle",
        severity: "error",
        message: `Circular dependency detected: ${cycleNodes.join(" → ")} → ${nodeId}`,
        nodeId: nodeId,
      });
      return true;
    }

    if (visited.has(nodeId)) return false;

    visited.add(nodeId);
    recursionStack.add(nodeId);
    path.push(nodeId);

    const neighbors = adj.get(nodeId) || [];
    for (const neighbor of neighbors) {
      if (dfs(neighbor)) return true;
    }

    path.pop();
    recursionStack.delete(nodeId);
    return false;
  };

  nodes.forEach((node) => {
    if (!visited.has(node.id)) {
      dfs(node.id);
    }
  });

  return issues;
};

const checkConfiguration = (
  nodes: Node<NodeData>[],
  metadata: Record<string, NodeMetadata>
): ValidationIssue[] => {
  const issues: ValidationIssue[] = [];

  nodes.forEach((node) => {
    if (!node.type) return;
    const nodeMetadata = metadata[node.type];
    if (!nodeMetadata) return;

    nodeMetadata.properties?.forEach((prop) => {
      const value = node.data.properties?.[prop.name];
      if (prop.required && (value === undefined || value === null || value === "")) {
        const data = node.data as NodeData & { label?: string };
        issues.push({
          id: generateId(),
          type: "configuration",
          severity: "error",
          message: `Required property "${prop.name}" is missing in node "${data.label || node.id}"`,
          nodeId: node.id,
        });
      }
    });
  });

  return issues;
};

const checkMissingModels = (
  nodes: Node<NodeData>[],
  metadata: Record<string, NodeMetadata>
): ValidationIssue[] => {
  const issues: ValidationIssue[] = [];

  nodes.forEach((node) => {
    if (!node.type) return;
    const nodeMetadata = metadata[node.type];
    if (!nodeMetadata) return;

    if ((nodeMetadata as any).tags?.includes("model")) {
      const modelPath = node.data.properties?.model || node.data.properties?.model_path;
      if (!modelPath) {
        const data = node.data as NodeData & { label?: string };
        issues.push({
          id: generateId(),
          type: "missing_model",
          severity: "error",
          message: `Model node "${data.label || node.id}" does not have a model selected`,
          nodeId: node.id,
        });
      }
    }
  });

  return issues;
};

const checkPerformance = (
  nodes: Node<NodeData>[],
  edges: Edge[]
): ValidationIssue[] => {
  const issues: ValidationIssue[] = [];

  const nodesByType: Record<string, number> = {};
  nodes.forEach((node) => {
    if (!node.type) return;
    nodesByType[node.type] = (nodesByType[node.type] || 0) + 1;
  });

  Object.entries(nodesByType).forEach(([type, count]) => {
    if (count > 10) {
      const node = nodes.find((n) => n.type === type);
      issues.push({
        id: generateId(),
        type: "performance",
        severity: "warning",
        message: `Large number (${count}) of "${type}" nodes detected. Consider refactoring into sub-workflows.`,
        nodeId: node?.id,
      });
    }
  });

  const inputNodes = nodes.filter((n) => n.type?.startsWith("inputNode"));
  const outputNodes = nodes.filter((n) => n.type?.startsWith("outputNode"));
  if (nodes.length > 5 && (inputNodes.length === 0 || outputNodes.length === 0)) {
    issues.push({
      id: generateId(),
      type: "performance",
      severity: "info",
      message: "Workflow has no input or output nodes. It may not produce visible results.",
    });
  }

  return issues;
};

export const validateWorkflow = (
  nodes: Node<NodeData>[],
  edges: Edge[],
  metadata: Record<string, NodeMetadata>
): ValidationResult => {
  const allIssues: ValidationIssue[] = [];

  allIssues.push(...checkDisconnectedNodes(nodes, edges));
  allIssues.push(...checkUnusedInputs(nodes, edges, metadata));
  allIssues.push(...checkCycles(nodes, edges));
  allIssues.push(...checkConfiguration(nodes, metadata));
  allIssues.push(...checkMissingModels(nodes, metadata));
  allIssues.push(...checkPerformance(nodes, edges));

  const errors = allIssues.filter((i) => i.severity === "error").length;
  const warnings = allIssues.filter((i) => i.severity === "warning").length;

  const score = Math.max(0, 100 - errors * 20 - warnings * 5);

  return {
    issues: allIssues,
    isValid: errors === 0,
    score,
  };
};

const useWorkflowValidationStore = create<WorkflowValidationState>((set, get) => ({
  issues: [],
  lastValidatedAt: null,
  isValid: true,
  score: 100,

  validateWorkflow: (nodes, edges, metadata) => {
    const result = validateWorkflow(nodes, edges, metadata);
    set({
      issues: result.issues,
      lastValidatedAt: Date.now(),
      isValid: result.isValid,
      score: result.score,
    });
    return result;
  },

  clearValidation: () => {
    set({
      issues: [],
      lastValidatedAt: null,
      isValid: true,
      score: 100,
    });
  },

  getIssueCount: () => {
    const issues = get().issues;
    return {
      errors: issues.filter((i) => i.severity === "error").length,
      warnings: issues.filter((i) => i.severity === "warning").length,
      info: issues.filter((i) => i.severity === "info").length,
    };
  },
}));

export default useWorkflowValidationStore;
