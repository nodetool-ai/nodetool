/**
 * Research Feature Hooks
 * 
 * Custom hooks for research and experimental features.
 */

import { useState, useCallback } from 'react';
import { PerformanceMetrics, analyzeWorkflow } from '../../components/research/WorkflowProfiler';
import { WorkflowNode, WorkflowEdge } from '../../components/research/WorkflowProfiler';

export interface UseProfilerOptions {
  workflowId: string;
  nodes?: WorkflowNode[];
  edges?: WorkflowEdge[];
  autoRefresh?: boolean;
  refreshInterval?: number;
}

export interface UseProfilerResult {
  metrics: PerformanceMetrics | null;
  isAnalyzing: boolean;
  lastAnalyzed: Date | null;
  analyze: () => Promise<void>;
  clearMetrics: () => void;
}

export const useProfiler = (options: UseProfilerOptions): UseProfilerResult => {
  const { nodes = [], edges = [] } = options;
  
  const [metrics, setMetrics] = useState<PerformanceMetrics | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [lastAnalyzed, setLastAnalyzed] = useState<Date | null>(null);
  
  const analyze = useCallback(async () => {
    setIsAnalyzing(true);
    
    await new Promise(resolve => setTimeout(resolve, 500));
    
    const result = analyzeWorkflow(nodes, edges);
    setMetrics(result);
    setLastAnalyzed(new Date());
    setIsAnalyzing(false);
  }, [nodes, edges]);
  
  const clearMetrics = useCallback(() => {
    setMetrics(null);
    setLastAnalyzed(null);
  }, []);
  
  return {
    metrics,
    isAnalyzing,
    lastAnalyzed,
    analyze,
    clearMetrics
  };
};

export default useProfiler;
