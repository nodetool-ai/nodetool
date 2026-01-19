/**
 * Workflow Profiler Store
 * 
 * Manages workflow profiling state including analysis results, bottlenecks,
 * and performance metrics for workflow optimization.
 */

import { create } from "zustand";
import { Node, Edge } from "@xyflow/react";

export interface WorkflowProfile {
  id: string;
  timestamp: number;
  nodeCount: number;
  edgeCount: number;
  complexityScore: number;
  maxDepth: number;
  estimatedRuntime: number;
  bottlenecks: Bottleneck[];
  suggestions: string[];
  metrics: WorkflowMetrics;
}

export interface WorkflowMetrics {
  totalNodes: number;
  inputNodes: number;
  outputNodes: number;
  processingNodes: number;
  branchingFactor: number;
  parallelPaths: number;
  criticalPathLength: number;
  nodeDensity: number;
}

export interface Bottleneck {
  nodeId: string;
  nodeType: string;
  severity: "high" | "medium" | "low";
  reason: string;
  suggestion: string;
}

export interface ProfileState {
  currentProfile: WorkflowProfile | null;
  isAnalyzing: boolean;
  lastAnalyzedWorkflowId: string | null;
  analyzeWorkflow: (nodes: Node[], edges: Edge[], workflowId: string) => WorkflowProfile;
  clearProfile: () => void;
  setAnalyzing: (analyzing: boolean) => void;
}

const calculateComplexityScore = (nodes: Node[], edges: Edge[]): number => {
  const nodeWeight = 1;
  const edgeWeight = 2;
  const depthWeight = 3;
  const branchingWeight = 1.5;
  
  const depth = calculateMaxDepth(nodes, edges);
  const avgBranching = calculateAverageBranching(nodes, edges);
  
  return (
    nodes.length * nodeWeight +
    edges.length * edgeWeight +
    depth * depthWeight +
    avgBranching * branchingWeight
  );
};

const calculateMaxDepth = (nodes: Node[], edges: Edge[]): number => {
  const nodeIds = new Set(nodes.map(n => n.id));
  const inDegree = new Map<string, number>();
  const outEdges = new Map<string, string[]>();
  
  nodes.forEach(n => inDegree.set(n.id, 0));
  edges.forEach(e => {
    if (nodeIds.has(e.source) && nodeIds.has(e.target)) {
      outEdges.set(e.source, [...(outEdges.get(e.source) || []), e.target]);
      inDegree.set(e.target, (inDegree.get(e.target) || 0) + 1);
    }
  });
  
  const startNodes = nodes.filter(n => (inDegree.get(n.id) || 0) === 0);
  if (startNodes.length === 0) { return 0; }
  
  let maxDepth = 0;
  const visited = new Set<string>();
  
  const dfs = (nodeId: string, depth: number) => {
    maxDepth = Math.max(maxDepth, depth);
    visited.add(nodeId);
    const children = outEdges.get(nodeId) || [];
    children.forEach(childId => {
      if (!visited.has(childId)) {
        dfs(childId, depth + 1);
      }
    });
  };
  
  startNodes.forEach(n => {
    visited.clear();
    dfs(n.id, 0);
  });
  
  return maxDepth;
};

const calculateAverageBranching = (nodes: Node[], edges: Edge[]): number => {
  if (nodes.length === 0) { return 0; }
  const outDegree = new Map<string, number>();
  nodes.forEach(n => outDegree.set(n.id, 0));
  edges.forEach(e => {
    outDegree.set(e.source, (outDegree.get(e.source) || 0) + 1);
  });
  
  const totalOutDegree = Array.from(outDegree.values()).reduce((a, b) => a + b, 0);
  return totalOutDegree / nodes.length;
};

const detectBottlenecks = (nodes: Node[], edges: Edge[]): Bottleneck[] => {
  const bottlenecks: Bottleneck[] = [];
  const outDegree = new Map<string, number>();
  const inDegree = new Map<string, number>();
  
  nodes.forEach(n => {
    outDegree.set(n.id, 0);
    inDegree.set(n.id, 0);
  });
  
  edges.forEach(e => {
    outDegree.set(e.source, (outDegree.get(e.source) || 0) + 1);
    inDegree.set(e.target, (inDegree.get(e.target) || 0) + 1);
  });
  
  nodes.forEach(node => {
    const out = outDegree.get(node.id) || 0;
    const nodeType = node.type || "unknown";
    
    if (out > 5) {
      bottlenecks.push({
        nodeId: node.id,
        nodeType,
        severity: "high",
        reason: `High fan-out: ${out} outgoing connections`,
        suggestion: "Consider splitting this node's output into multiple nodes or restructuring the flow"
      });
    } else if (out > 3) {
      bottlenecks.push({
        nodeId: node.id,
        nodeType,
        severity: "medium",
        reason: `Moderate fan-out: ${out} outgoing connections`,
        suggestion: "Monitor performance; consider simplifying the flow if execution is slow"
      });
    }
    
    if (inDegree.get(node.id) || 0 > 8) {
      const existing = bottlenecks.find(b => b.nodeId === node.id);
      if (existing) {
        existing.reason += `; High fan-in: ${inDegree.get(node.id)} incoming connections`;
        existing.severity = "high";
      } else {
        bottlenecks.push({
          nodeId: node.id,
          nodeType,
          severity: "high",
          reason: `High fan-in: ${inDegree.get(node.id)} incoming connections`,
          suggestion: "This node may be overwhelmed; consider adding intermediate processing nodes"
        });
      }
    }
    
    if (nodeType.includes("LLM") || nodeType.includes("Model") || nodeType.includes("ImageGeneration")) {
      const hasExistingBottleneck = bottlenecks.some(b => b.nodeId === node.id);
      if (!hasExistingBottleneck) {
        bottlenecks.push({
          nodeId: node.id,
          nodeType,
          severity: "low",
          reason: "AI/ML model node detected",
          suggestion: "These nodes typically have longer execution times; consider caching if inputs don't change"
        });
      }
    }
  });
  
  return bottlenecks;
};

const generateSuggestions = (profile: WorkflowProfile): string[] => {
  const suggestions: string[] = [];
  
  if (profile.complexityScore > 100) {
    suggestions.push("Consider breaking this workflow into smaller sub-workflows");
  }
  
  if (profile.maxDepth > 15) {
    suggestions.push("Deep workflow detected; consider parallelizing independent branches");
  }
  
  const highSeverityBottlenecks = profile.bottlenecks.filter(b => b.severity === "high");
  if (highSeverityBottlenecks.length > 0) {
    suggestions.push(`Address ${highSeverityBottlenecks.length} high-severity bottlenecks`);
  }
  
  if (profile.metrics.branchingFactor > 2.5) {
    suggestions.push("High branching factor; consider simplifying node outputs");
  }
  
  if (profile.nodeCount > 50) {
    suggestions.push("Large workflow; consider using workflow groups to organize nodes");
  }
  
  if (suggestions.length === 0) {
    suggestions.push("Workflow appears well-structured!");
  }
  
  return suggestions;
};

export const useProfileStore = create<ProfileState>((set, get) => ({
  currentProfile: null,
  isAnalyzing: false,
  lastAnalyzedWorkflowId: null,
  
  analyzeWorkflow: (nodes: Node[], edges: Edge[], workflowId: string) => {
    const metrics: WorkflowMetrics = {
      totalNodes: nodes.length,
      inputNodes: nodes.filter(n => n.type?.includes("input")).length,
      outputNodes: nodes.filter(n => n.type?.includes("output")).length,
      processingNodes: nodes.filter(n => 
        !n.type?.includes("input") && !n.type?.includes("output")
      ).length,
      branchingFactor: calculateAverageBranching(nodes, edges),
      parallelPaths: 0,
      criticalPathLength: calculateMaxDepth(nodes, edges),
      nodeDensity: edges.length / Math.max(nodes.length, 1)
    };
    
    const complexityScore = calculateComplexityScore(nodes, edges);
    const estimatedRuntime = Math.round(complexityScore * 10 + nodes.length * 5);
    const bottlenecks = detectBottlenecks(nodes, edges);
    
    const profile: WorkflowProfile = {
      id: `profile-${Date.now()}`,
      timestamp: Date.now(),
      nodeCount: nodes.length,
      edgeCount: edges.length,
      complexityScore,
      maxDepth: metrics.criticalPathLength,
      estimatedRuntime,
      bottlenecks,
      suggestions: [],
      metrics
    };
    
    profile.suggestions = generateSuggestions(profile);
    
    set({
      currentProfile: profile,
      lastAnalyzedWorkflowId: workflowId,
      isAnalyzing: false
    });
    
    return profile;
  },
  
  clearProfile: () => {
    set({ currentProfile: null, lastAnalyzedWorkflowId: null });
  },
  
  setAnalyzing: (analyzing: boolean) => {
    set({ isAnalyzing: analyzing });
  }
}));
