import { useCallback } from 'react';
import { Node, Edge } from '@xyflow/react';
import {
  useWorkflowProfilerStore,
  selectProfilerState,
  selectProfilerActions,
  NodePerformanceMetrics,
  WorkflowPerformanceMetrics,
  PerformanceIssue,
  OptimizationSuggestion,
} from '../stores/WorkflowProfilerStore';

export interface UseWorkflowProfilerReturn {
  isAnalyzing: boolean;
  lastAnalyzedAt: number | null;
  workflowId: string | null;
  nodeMetrics: Record<string, NodePerformanceMetrics>;
  workflowMetrics: WorkflowPerformanceMetrics | null;
  issues: PerformanceIssue[];
  suggestions: OptimizationSuggestion[];
  selectedNodeId: string | null;
  expandedSections: Record<string, boolean>;

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

  getNodeMetrics: (nodeId: string) => NodePerformanceMetrics | undefined;
  getSortedNodesByComplexity: () => NodePerformanceMetrics[];
  getNodesByCategory: (category: PerformanceIssue['category']) => PerformanceIssue[];
  getSuggestionsByImpact: (impact: 'high' | 'medium' | 'low') => OptimizationSuggestion[];
}

export const useWorkflowProfiler = (): UseWorkflowProfilerReturn => {
  const state = useWorkflowProfilerStore(selectProfilerState);
  const actions = useWorkflowProfilerStore(selectProfilerActions);

  const startAnalysis = useCallback(
    (workflowId: string, nodes: Node[], edges: Edge[]) => {
      actions.startAnalysis(workflowId, nodes, edges);
    },
    [actions]
  );

  const getNodeMetrics = useCallback(
    (nodeId: string) => {
      return state.nodeMetrics[nodeId];
    },
    [state.nodeMetrics]
  );

  const getSortedNodesByComplexity = useCallback(() => {
    return Object.values(state.nodeMetrics).sort(
      (a, b) => b.complexity - a.complexity
    );
  }, [state.nodeMetrics]);

  const getNodesByCategory = useCallback(
    (category: PerformanceIssue['category']) => {
      return state.issues.filter(issue => issue.category === category);
    },
    [state.issues]
  );

  const getSuggestionsByImpact = useCallback(
    (impact: 'high' | 'medium' | 'low') => {
      return state.suggestions.filter(suggestion => suggestion.impact === impact);
    },
    [state.suggestions]
  );

  return {
    isAnalyzing: state.isAnalyzing,
    lastAnalyzedAt: state.lastAnalyzedAt,
    workflowId: state.workflowId,
    nodeMetrics: state.nodeMetrics,
    workflowMetrics: state.workflowMetrics,
    issues: state.issues,
    suggestions: state.suggestions,
    selectedNodeId: state.selectedNodeId,
    expandedSections: state.expandedSections,

    startAnalysis,
    setAnalyzing: actions.setAnalyzing,
    setAnalysisResult: actions.setAnalysisResult,
    selectNode: actions.selectNode,
    toggleSection: actions.toggleSection,
    clearAnalysis: actions.clearAnalysis,

    getNodeMetrics,
    getSortedNodesByComplexity,
    getNodesByCategory,
    getSuggestionsByImpact,
  };
};
