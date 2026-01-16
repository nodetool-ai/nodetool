import { useCallback, useMemo } from 'react';
import { useProfilerStore, ProfilerSummary, WorkflowBottleneck } from '../stores/ProfilerStore';
import { useNodes } from '../contexts/NodeContext';

interface UseWorkflowProfilerOptions {
  workflowId: string;
}

interface UseWorkflowProfilerReturn {
  isProfiling: boolean;
  summary: ProfilerSummary | null;
  bottlenecks: WorkflowBottleneck[];
  criticalPath: string[];
  parallelizableNodes: string[];
  nodeProfiles: Record<string, { duration: number; status: string; nodeLabel: string }>;
  
  startProfiling: () => void;
  endProfiling: () => void;
  cancelProfiling: () => void;
  
  getNodeProfile: (nodeId: string) => { duration: number; status: string; nodeLabel: string } | undefined;
  getNodeTiming: (nodeId: string) => { startTime: number; endTime: number; duration: number } | undefined;
  isOnCriticalPath: (nodeId: string) => boolean;
  isParallelizable: (nodeId: string) => boolean;
  getPerformanceGrade: () => 'A' | 'B' | 'C' | 'D' | 'F';
  getOptimizationSuggestions: () => string[];
}

export const useWorkflowProfiler = (options: UseWorkflowProfilerOptions): UseWorkflowProfilerReturn => {
  const { workflowId } = options;
  
  const nodes = useNodes((state) => state.nodes);
  const nodeMap = useMemo(() => {
    return new Map(nodes.map(node => [node.id, node]));
  }, [nodes]);
  
  const {
    isProfiling,
    startProfiling,
    endProfiling,
    cancelProfiling,
    getProfilerSummary,
    getBottlenecks,
    getCriticalPath,
    getCurrentSession,
  } = useProfilerStore();
  
  const summary = getProfilerSummary(workflowId);
  const bottlenecks = getBottlenecks(workflowId);
  const criticalPath = getCriticalPath(workflowId);
  const session = getCurrentSession(workflowId);
  
  const parallelizableNodes = summary?.parallelizableNodes || [];
  
  const nodeProfiles = useMemo(() => {
    if (!session) return {};
    
    return Object.fromEntries(
      Object.entries(session.nodeProfiles).map(([nodeId, profile]) => [
        nodeId,
        {
          duration: profile.duration ?? 0,
          status: profile.status,
          nodeLabel: profile.nodeLabel,
        },
      ])
    );
  }, [session]);
  
  const getNodeProfile = useCallback((nodeId: string) => {
    return nodeProfiles[nodeId];
  }, [nodeProfiles]);
  
  const getNodeTiming = useCallback((nodeId: string) => {
    const profile = session?.nodeProfiles[nodeId];
    if (profile && profile.startTime && profile.endTime) {
      return {
        startTime: profile.startTime - session.startTime,
        endTime: profile.endTime - session.startTime,
        duration: profile.duration ?? 0,
      };
    }
    return undefined;
  }, [session]);
  
  const isOnCriticalPath = useCallback((nodeId: string) => {
    return criticalPath.includes(nodeId);
  }, [criticalPath]);
  
  const isParallelizable = useCallback((nodeId: string) => {
    return parallelizableNodes.includes(nodeId);
  }, [parallelizableNodes]);
  
  const getPerformanceGrade = useCallback(() => {
    if (!summary) {
      return 'F';
    }
    
    const { bottlenecks, executedNodes, totalDuration } = summary;
    const criticalBottlenecks = bottlenecks.filter((b: { severity: string }) => b.severity === 'critical' || b.severity === 'high');
    
    let score = 100;
    score -= criticalBottlenecks.length * 20;
    score -= Math.max(0, (executedNodes > 0 ? (bottlenecks.length / executedNodes) * 50 : 0));
    score -= Math.min(30, totalDuration / 1000);
    
    if (score >= 90) {
      return 'A';
    }
    if (score >= 75) {
      return 'B';
    }
    if (score >= 60) {
      return 'C';
    }
    if (score >= 40) {
      return 'D';
    }
    return 'F';
  }, [summary]);
  
  const getOptimizationSuggestions = useCallback(() => {
    const suggestions: string[] = [];
    
    if (!summary) return suggestions;
    
    const { bottlenecks, parallelizableNodes } = summary;
    
    for (const bottleneck of bottlenecks.slice(0, 3)) {
      suggestions.push(bottleneck.suggestion);
    }
    
    if (parallelizableNodes.length > 2) {
      suggestions.push(`${parallelizableNodes.length} nodes can potentially run in parallel. Consider restructuring your workflow.`);
    }
    
    if (summary.maxDuration > summary.avgNodeDuration * 10) {
      suggestions.push('Large variance in node execution times. Consider breaking up long-running nodes.');
    }
    
    return suggestions;
  }, [summary]);
  
  return {
    isProfiling,
    summary,
    bottlenecks,
    criticalPath,
    parallelizableNodes,
    nodeProfiles,
    
    startProfiling: () => startProfiling(workflowId),
    endProfiling: () => endProfiling(workflowId),
    cancelProfiling: () => cancelProfiling(workflowId),
    
    getNodeProfile,
    getNodeTiming,
    isOnCriticalPath,
    isParallelizable,
    getPerformanceGrade,
    getOptimizationSuggestions,
  };
};

export default useWorkflowProfiler;
