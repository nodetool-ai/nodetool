import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { Node, Edge } from '@xyflow/react';

export interface NodePerformanceMetrics {
  nodeId: string;
  nodeType: string;
  estimatedRuntime: number;
  memoryUsage: number;
  complexity: number;
  dependencies: number;
  dependents: number;
}

export interface WorkflowPerformanceMetrics {
  totalNodes: number;
  totalEdges: number;
  estimatedTotalRuntime: number;
  criticalPathLength: number;
  maxParallelism: number;
  bottlenecks: string[];
  complexityScore: number;
  memoryFootprint: number;
}

export interface PerformanceIssue {
  id: string;
  severity: 'info' | 'warning' | 'error';
  category: 'structure' | 'performance' | 'memory' | 'parallelism';
  message: string;
  suggestion: string;
  affectedNodes: string[];
}

export interface OptimizationSuggestion {
  id: string;
  type: 'parallelize' | 'simplify' | 'cache' | 'refactor' | 'resource';
  title: string;
  description: string;
  impact: 'high' | 'medium' | 'low';
  nodes: string[];
  estimatedImprovement: number;
}

interface WorkflowProfilerState {
  isAnalyzing: boolean;
  lastAnalyzedAt: number | null;
  workflowId: string | null;

  nodeMetrics: Record<string, NodePerformanceMetrics>;
  workflowMetrics: WorkflowPerformanceMetrics | null;
  issues: PerformanceIssue[];
  suggestions: OptimizationSuggestion[];

  selectedNodeId: string | null;
  expandedSections: Record<string, boolean>;

  actions: {
    startAnalysis: (workflowId: string, nodes: Node[], edges: Edge[]) => void;
    setAnalyzing: (isAnalyzing: boolean) => void;
    setAnalysisResult: (
      nodeMetrics: Record<string, NodePerformanceMetrics>,
      workflowMetrics: WorkflowPerformanceMetrics,
      issues: PerformanceIssue[],
      suggestions: OptimizationSuggestion[]
    ) => void;
    selectNode: (nodeId: string | null) => void;
    toggleSection: (section: string) => void;
    clearAnalysis: () => void;
  };
}

const calculateNodeComplexity = (node: Node): number => {
  let complexity = 1;
  const nodeType = node.type?.toLowerCase() || '';

  if (nodeType.includes('loop') || nodeType.includes('foreach')) {
    complexity *= 3;
  }
  if (nodeType.includes('condition') || nodeType.includes('if')) {
    complexity *= 2;
  }
  if (nodeType.includes('model') || nodeType.includes('llm')) {
    complexity *= 2;
  }
  if (nodeType.includes('image') || nodeType.includes('video')) {
    complexity *= 2;
  }
  if (nodeType.includes('audio')) {
    complexity *= 1.5;
  }

  const dataKeys = Object.keys(node.data || {}).length;
  complexity += dataKeys * 0.1;

  return Math.min(complexity, 10);
};

const estimateNodeRuntime = (node: Node): number => {
  const nodeType = node.type?.toLowerCase() || '';
  let baseRuntime = 100;

  if (nodeType.includes('llm') || nodeType.includes('model')) {
    baseRuntime = 2000;
  } else if (nodeType.includes('image')) {
    baseRuntime = 500;
  } else if (nodeType.includes('audio')) {
    baseRuntime = 300;
  } else if (nodeType.includes('text')) {
    baseRuntime = 150;
  } else if (nodeType.includes('condition') || nodeType.includes('if')) {
    baseRuntime = 50;
  } else if (nodeType.includes('loop') || nodeType.includes('foreach')) {
    baseRuntime = 1000;
  }

  return baseRuntime;
};

const analyzeWorkflow = (
  nodes: Node[],
  edges: Edge[]
): {
  nodeMetrics: Record<string, NodePerformanceMetrics>;
  workflowMetrics: WorkflowPerformanceMetrics;
  issues: PerformanceIssue[];
  suggestions: OptimizationSuggestion[];
} => {
  const nodeMetrics: Record<string, NodePerformanceMetrics> = {};
  const dependencyCount: Record<string, number> = {};
  const dependentCount: Record<string, number> = {};

  nodes.forEach(node => {
    dependencyCount[node.id] = 0;
    dependentCount[node.id] = 0;
  });

  edges.forEach(edge => {
    if (dependencyCount[edge.target] !== undefined) {
      dependencyCount[edge.target]++;
    }
    if (dependentCount[edge.source] !== undefined) {
      dependentCount[edge.source]++;
    }
  });

  nodes.forEach(node => {
    const complexity = calculateNodeComplexity(node);
    const estimatedRuntime = estimateNodeRuntime(node);

    nodeMetrics[node.id] = {
      nodeId: node.id,
      nodeType: node.type || 'unknown',
      estimatedRuntime,
      memoryUsage: complexity * 50,
      complexity,
      dependencies: dependencyCount[node.id] || 0,
      dependents: dependentCount[node.id] || 0,
    };
  });

  const totalRuntime = Object.values(nodeMetrics).reduce(
    (sum, m) => sum + m.estimatedRuntime,
    0
  );
  const criticalPathLength = 0;
  const bottlenecks: string[] = [];
  const issues: PerformanceIssue[] = [];
  const suggestions: OptimizationSuggestion[] = [];

  Object.values(nodeMetrics).forEach(metric => {
    if (metric.estimatedRuntime > 1000 && metric.dependents > 1) {
      bottlenecks.push(metric.nodeId);
      issues.push({
        id: `bottleneck-${metric.nodeId}`,
        severity: 'warning',
        category: 'performance',
        message: `Node "${metric.nodeType}" has high estimated runtime (${metric.estimatedRuntime}ms) with multiple dependents`,
        suggestion: 'Consider caching results or running in parallel with other nodes',
        affectedNodes: [metric.nodeId],
      });
    }

    if (metric.dependencies > 5) {
      issues.push({
        id: `fanin-${metric.nodeId}`,
        severity: 'info',
        category: 'structure',
        message: `Node "${metric.nodeType}" has many inputs (${metric.dependencies})`,
        suggestion: 'Consider grouping related inputs',
        affectedNodes: [metric.nodeId],
      });
    }

    if (metric.dependents > 5) {
      issues.push({
        id: `fanout-${metric.nodeId}`,
        severity: 'info',
        category: 'structure',
        message: `Node "${metric.nodeType}" fans out to ${metric.dependents} downstream nodes`,
        suggestion: 'Consider if outputs can be shared or cached',
        affectedNodes: [metric.nodeId],
      });
    }
  });

  if (nodes.length > 50) {
    issues.push({
      id: 'large-workflow',
      severity: 'info',
      category: 'structure',
      message: `Workflow has ${nodes.length} nodes, which may impact performance`,
      suggestion: 'Consider breaking into sub-workflows',
      affectedNodes: [],
    });
  }

  const nodeTypes = new Set(nodes.map(n => n.type));
  if (nodeTypes.size > 15) {
    issues.push({
      id: 'diverse-workflow',
      severity: 'info',
      category: 'structure',
      message: `Workflow uses ${nodeTypes.size} different node types`,
      suggestion: 'Consider creating reusable sub-workflows for common patterns',
      affectedNodes: [],
    });
  }

  const parallelGroups: string[][] = [];
  const remainingNodes = [...nodes.map(n => n.id)];

  const findIndependentNodes = (nodeIds: string[]): string[] => {
    const independent: string[] = [];
    const nodeSet = new Set(nodeIds);

    nodeIds.forEach(nodeId => {
      const hasDependencyFromRemaining = edges.some(
        edge => edge.target === nodeId && nodeSet.has(edge.source)
      );
      if (!hasDependencyFromRemaining) {
        independent.push(nodeId);
      }
    });

    return independent;
  };

  while (remainingNodes.length > 0) {
    const levelNodes = findIndependentNodes(remainingNodes);
    if (levelNodes.length === 0) {
      break;
    }

    parallelGroups.push(levelNodes);
    levelNodes.forEach(id => {
      const idx = remainingNodes.indexOf(id);
      if (idx > -1) {
        remainingNodes.splice(idx, 1);
      }
    });
  }

  const maxParallelism = parallelGroups.length > 0
    ? Math.max(...parallelGroups.map(g => g.length))
    : 1;

  const complexityScore = nodes.length * 0.5 +
    edges.length * 0.3 +
    bottlenecks.length * 2;

  const memoryFootprint = Object.values(nodeMetrics)
    .reduce((sum, m) => sum + m.memoryUsage, 0);

  const workflowMetrics: WorkflowPerformanceMetrics = {
    totalNodes: nodes.length,
    totalEdges: edges.length,
    estimatedTotalRuntime: totalRuntime,
    criticalPathLength,
    maxParallelism,
    bottlenecks,
    complexityScore,
    memoryFootprint,
  };

  if (maxParallelism > 3 && totalRuntime > 5000) {
    suggestions.push({
      id: 'parallel-execution',
      type: 'parallelize',
      title: 'Parallel Execution Opportunities',
      description: 'Some nodes can potentially run in parallel',
      impact: 'high',
      nodes: parallelGroups.slice(0, 2).flat(),
      estimatedImprovement: 30,
    });
  }

  if (bottlenecks.length > 0) {
    const bottleneckIds = bottlenecks.slice(0, 3);
    suggestions.push({
      id: 'bottleneck-optimization',
      type: 'resource',
      title: 'Optimize Performance Bottlenecks',
      description: 'Several nodes are identified as potential bottlenecks',
      impact: 'high',
      nodes: bottleneckIds,
      estimatedImprovement: 40,
    });
  }

  const multiDependentNodes = Object.values(nodeMetrics)
    .filter(m => m.dependents > 2);

  if (multiDependentNodes.length > 0) {
    suggestions.push({
      id: 'caching-strategy',
      type: 'cache',
      title: 'Consider Caching for Shared Outputs',
      description: 'Nodes with multiple dependents may benefit from caching',
      impact: 'medium',
      nodes: multiDependentNodes.slice(0, 5).map(m => m.nodeId),
      estimatedImprovement: 20,
    });
  }

  return {
    nodeMetrics,
    workflowMetrics,
    issues,
    suggestions,
  };
};

const createInitialState = () => ({
  isAnalyzing: false,
  lastAnalyzedAt: null,
  workflowId: null,
  nodeMetrics: {} as Record<string, NodePerformanceMetrics>,
  workflowMetrics: null as WorkflowPerformanceMetrics | null,
  issues: [] as PerformanceIssue[],
  suggestions: [] as OptimizationSuggestion[],
  selectedNodeId: null as string | null,
  expandedSections: {
    overview: true,
    bottlenecks: true,
    suggestions: true,
    issues: false,
  } as Record<string, boolean>,
});

export const useWorkflowProfilerStore = create<WorkflowProfilerState>()(
  subscribeWithSelector((set) => ({
    ...createInitialState(),

    actions: {
      startAnalysis: (workflowId: string, nodes: Node[], edges: Edge[]) => {
        set({
          isAnalyzing: true,
          workflowId,
        });

        setTimeout(() => {
          const result = analyzeWorkflow(nodes, edges);
          set({
            isAnalyzing: false,
            lastAnalyzedAt: Date.now(),
            nodeMetrics: result.nodeMetrics,
            workflowMetrics: result.workflowMetrics,
            issues: result.issues,
            suggestions: result.suggestions,
          });
        }, 100);
      },

      setAnalyzing: (isAnalyzing: boolean) => {
        set({ isAnalyzing });
      },

      setAnalysisResult: (
        nodeMetrics: Record<string, NodePerformanceMetrics>,
        workflowMetrics: WorkflowPerformanceMetrics,
        issues: PerformanceIssue[],
        suggestions: OptimizationSuggestion[]
      ) => {
        set({
          nodeMetrics,
          workflowMetrics,
          issues,
          suggestions,
          lastAnalyzedAt: Date.now(),
          isAnalyzing: false,
        });
      },

      selectNode: (nodeId: string | null) => {
        set({ selectedNodeId: nodeId });
      },

      toggleSection: (section: string) => {
        set((state) => ({
          expandedSections: {
            ...state.expandedSections,
            [section]: !state.expandedSections[section],
          },
        }));
      },

      clearAnalysis: () => {
        set({
          nodeMetrics: {},
          workflowMetrics: null,
          issues: [],
          suggestions: [],
          lastAnalyzedAt: null,
          workflowId: null,
        });
      },
    },
  }))
);

export const selectProfilerState = (state: WorkflowProfilerState) => ({
  isAnalyzing: state.isAnalyzing,
  lastAnalyzedAt: state.lastAnalyzedAt,
  workflowId: state.workflowId,
  nodeMetrics: state.nodeMetrics,
  workflowMetrics: state.workflowMetrics,
  issues: state.issues,
  suggestions: state.suggestions,
  selectedNodeId: state.selectedNodeId,
  expandedSections: state.expandedSections,
});

export const selectProfilerActions = (state: WorkflowProfilerState) => state.actions;
