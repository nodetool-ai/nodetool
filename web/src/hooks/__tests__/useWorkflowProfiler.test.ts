import { renderHook, act } from '@testing-library/react';
import { useProfilerStore } from '../ProfilerStore';
import { useWorkflowProfiler } from '../useWorkflowProfiler';
import { Node } from '@xyflow/react';
import { NodeData } from '../NodeData';
import React from 'react';

const createMockNode = (id: string, type: string, label: string): Node<NodeData> => ({
  id,
  type,
  position: { x: 0, y: 0 },
  data: { label },
  selected: false,
  dragging: false,
});

const TestWrapper = ({ children }: { children: React.ReactNode }) => children;

describe('useWorkflowProfiler', () => {
  beforeEach(() => {
    act(() => {
      useProfilerStore.getState().clearAllSessions();
    });
  });

  describe('initial state', () => {
    it('should return isProfiling as false initially', () => {
      const { result } = renderHook(
        () => useWorkflowProfiler({ workflowId: 'workflow-1' }),
        { wrapper: TestWrapper }
      );
      
      expect(result.current.isProfiling).toBe(false);
      expect(result.current.summary).toBeNull();
    });

    it('should return empty collections when no session exists', () => {
      const { result } = renderHook(
        () => useWorkflowProfiler({ workflowId: 'workflow-1' }),
        { wrapper: TestWrapper }
      );
      
      expect(result.current.bottlenecks).toEqual([]);
      expect(result.current.criticalPath).toEqual([]);
      expect(result.current.parallelizableNodes).toEqual([]);
      expect(result.current.nodeProfiles).toEqual({});
    });
  });

  describe('profiling lifecycle', () => {
    it('should start profiling and update state', () => {
      const { result } = renderHook(
        () => useWorkflowProfiler({ workflowId: 'workflow-1' }),
        { wrapper: TestWrapper }
      );
      
      act(() => {
        result.current.startProfiling();
      });
      
      expect(result.current.isProfiling).toBe(true);
    });

    it('should end profiling and return summary', () => {
      const { result } = renderHook(
        () => useWorkflowProfiler({ workflowId: 'workflow-1' }),
        { wrapper: TestWrapper }
      );
      
      act(() => {
        result.current.startProfiling();
        result.current.endProfiling();
      });
      
      expect(result.current.isProfiling).toBe(false);
      expect(result.current.summary).not.toBeNull();
    });

    it('should cancel profiling', () => {
      const { result } = renderHook(
        () => useWorkflowProfiler({ workflowId: 'workflow-1' }),
        { wrapper: TestWrapper }
      );
      
      act(() => {
        result.current.startProfiling();
        result.current.cancelProfiling();
      });
      
      expect(result.current.isProfiling).toBe(false);
    });
  });

  describe('getNodeProfile', () => {
    it('should return undefined for non-existent node', () => {
      const { result } = renderHook(
        () => useWorkflowProfiler({ workflowId: 'workflow-1' }),
        { wrapper: TestWrapper }
      );
      
      const profile = result.current.getNodeProfile('non-existent');
      expect(profile).toBeUndefined();
    });
  });

  describe('getNodeTiming', () => {
    it('should return undefined when no session exists', () => {
      const { result } = renderHook(
        () => useWorkflowProfiler({ workflowId: 'workflow-1' }),
        { wrapper: TestWrapper }
      );
      
      const timing = result.current.getNodeTiming('node-1');
      expect(timing).toBeUndefined();
    });
  });

  describe('isOnCriticalPath', () => {
    it('should return false when no critical path exists', () => {
      const { result } = renderHook(
        () => useWorkflowProfiler({ workflowId: 'workflow-1' }),
        { wrapper: TestWrapper }
      );
      
      expect(result.current.isOnCriticalPath('node-1')).toBe(false);
    });
  });

  describe('isParallelizable', () => {
    it('should return false when no parallelizable nodes exist', () => {
      const { result } = renderHook(
        () => useWorkflowProfiler({ workflowId: 'workflow-1' }),
        { wrapper: TestWrapper }
      );
      
      expect(result.current.isParallelizable('node-1')).toBe(false);
    });
  });

  describe('getPerformanceGrade', () => {
    it('should return F when no summary exists', () => {
      const { result } = renderHook(
        () => useWorkflowProfiler({ workflowId: 'workflow-1' }),
        { wrapper: TestWrapper }
      );
      
      expect(result.current.getPerformanceGrade()).toBe('F');
    });
  });

  describe('getOptimizationSuggestions', () => {
    it('should return empty array when no summary exists', () => {
      const { result } = renderHook(
        () => useWorkflowProfiler({ workflowId: 'workflow-1' }),
        { wrapper: TestWrapper }
      );
      
      expect(result.current.getOptimizationSuggestions()).toEqual([]);
    });
  });
});

describe('useWorkflowProfiler with nodes', () => {
  beforeEach(() => {
    act(() => {
      useProfilerStore.getState().clearAllSessions();
    });
  });

  it('should profile workflow with node execution data', () => {
    const { result } = renderHook(
      () => useWorkflowProfiler({ workflowId: 'workflow-1' }),
      { wrapper: TestWrapper }
    );
    
    act(() => {
      result.current.startProfiling();
      result.current.endProfiling();
    });
    
    const summary = result.current.summary;
    expect(summary).not.toBeNull();
    expect(summary?.totalNodes).toBe(0);
    expect(summary?.executedNodes).toBe(0);
  });
});
