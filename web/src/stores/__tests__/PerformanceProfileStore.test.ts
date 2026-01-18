import { renderHook, act } from '@testing-library/react';
import { usePerformanceProfileStore } from '../PerformanceProfileStore';

describe('PerformanceProfileStore', () => {
  const mockNodes = [
    { id: 'node1', type: 'nodetool.llm.LLM', data: { model: 'gpt-4', max_tokens: 1000 } },
    { id: 'node2', type: 'nodetool.embeddings.Embeddings', data: { model: 'text-embedding-3-small' } },
    { id: 'node3', type: 'nodetool.io.HTTPRequest', data: {} },
    { id: 'node4', type: 'nodetool.control.ForEach', data: { iterations: 50 } },
  ];

  const mockEdges = [
    { source: 'node1', target: 'node2' },
    { source: 'node2', target: 'node3' },
    { source: 'node3', target: 'node4' },
  ];

  beforeEach(() => {
    usePerformanceProfileStore.setState({
      currentProfile: null,
      isAnalyzing: false,
      lastError: null,
      analysisHistory: [],
    });
  });

  describe('analyzeWorkflow', () => {
    it('should analyze a workflow and return a profile', () => {
      const { result } = renderHook(() => usePerformanceProfileStore());

      let profile: ReturnType<typeof result.current.actions.analyzeWorkflow> | undefined;
      act(() => {
        profile = result.current.actions.analyzeWorkflow('workflow-1', mockNodes, mockEdges);
      });

      expect(profile).toBeDefined();
      expect(profile!.workflowId).toBe('workflow-1');
      expect(profile!.totalNodes).toBe(4);
      expect(profile!.nodeMetrics).toHaveLength(4);
      expect(profile!.optimizationScore).toBeGreaterThanOrEqual(0);
      expect(profile!.optimizationScore).toBeLessThanOrEqual(100);
      expect(['A', 'B', 'C', 'D', 'F']).toContain(profile!.grade);
    });

    it('should calculate estimated runtime for all nodes', () => {
      const { result } = renderHook(() => usePerformanceProfileStore());

      let profile: ReturnType<typeof result.current.actions.analyzeWorkflow> | undefined;
      act(() => {
        profile = result.current.actions.analyzeWorkflow('workflow-2', mockNodes, mockEdges);
      });

      expect(profile!.totalEstimatedRuntime).toBeGreaterThan(0);
      profile!.nodeMetrics.forEach(metric => {
        expect(metric.estimatedRuntime).toBeGreaterThan(0);
      });
    });

    it('should identify bottlenecks correctly', () => {
      const { result } = renderHook(() => usePerformanceProfileStore());

      let profile: ReturnType<typeof result.current.actions.analyzeWorkflow> | undefined;
      act(() => {
        profile = result.current.actions.analyzeWorkflow('workflow-3', mockNodes, mockEdges);
      });

      expect(profile!.bottlenecks).toBeDefined();
      expect(profile!.bottlenecks.length).toBeLessThanOrEqual(5);
      if (profile!.bottlenecks.length > 0) {
        const sortedRuntimes = profile!.nodeMetrics
          .map(m => m.estimatedRuntime)
          .sort((a, b) => b - a);
        const bottleneckRuntimes = profile!.bottlenecks.map(b => b.estimatedRuntime);
        expect(bottleneckRuntimes).toEqual(sortedRuntimes.slice(0, profile!.bottlenecks.length));
      }
    });

    it('should calculate memory usage for all nodes', () => {
      const { result } = renderHook(() => usePerformanceProfileStore());

      let profile: ReturnType<typeof result.current.actions.analyzeWorkflow> | undefined;
      act(() => {
        profile = result.current.actions.analyzeWorkflow('workflow-4', mockNodes, mockEdges);
      });

      expect(profile!.totalMemoryUsage).toBeGreaterThan(0);
      profile!.nodeMetrics.forEach(metric => {
        expect(metric.memoryUsage).toBeGreaterThan(0);
      });
    });

    it('should generate suggestions for nodes with issues', () => {
      const { result } = renderHook(() => usePerformanceProfileStore());

      let profile: ReturnType<typeof result.current.actions.analyzeWorkflow> | undefined;
      act(() => {
        profile = result.current.actions.analyzeWorkflow('workflow-5', mockNodes, mockEdges);
      });

      profile!.nodeMetrics.forEach(metric => {
        if (metric.dependencies > 3 || metric.dependents > 3 || metric.complexity > 10) {
          expect(metric.suggestions.length).toBeGreaterThan(0);
        }
      });
    });

    it('should add profile to history', () => {
      const { result } = renderHook(() => usePerformanceProfileStore());

      act(() => {
        result.current.actions.analyzeWorkflow('workflow-6', mockNodes, mockEdges);
      });

      expect(result.current.analysisHistory).toHaveLength(1);
      expect(result.current.analysisHistory[0].workflowId).toBe('workflow-6');
    });

    it('should limit history to 10 entries', () => {
      const { result } = renderHook(() => usePerformanceProfileStore());

      for (let i = 0; i < 15; i++) {
        act(() => {
          result.current.actions.analyzeWorkflow(`workflow-${i}`, mockNodes, mockEdges);
        });
      }

      expect(result.current.analysisHistory).toHaveLength(10);
    });
  });

  describe('clearProfile', () => {
    it('should clear the current profile', () => {
      const { result } = renderHook(() => usePerformanceProfileStore());

      act(() => {
        result.current.actions.analyzeWorkflow('workflow-7', mockNodes, mockEdges);
      });

      expect(result.current.currentProfile).not.toBeNull();

      act(() => {
        result.current.actions.clearProfile();
      });

      expect(result.current.currentProfile).toBeNull();
    });
  });

  describe('clearError', () => {
    it('should clear any errors', () => {
      const { result } = renderHook(() => usePerformanceProfileStore());

      act(() => {
        result.current.actions.setError('Test error');
      });

      expect(result.current.lastError).toBe('Test error');

      act(() => {
        result.current.actions.clearError();
      });

      expect(result.current.lastError).toBeNull();
    });
  });

  describe('clearHistory', () => {
    it('should clear the analysis history', () => {
      const { result } = renderHook(() => usePerformanceProfileStore());

      act(() => {
        result.current.actions.analyzeWorkflow('workflow-8', mockNodes, mockEdges);
        result.current.actions.analyzeWorkflow('workflow-9', mockNodes, mockEdges);
      });

      expect(result.current.analysisHistory.length).toBeGreaterThan(0);

      act(() => {
        result.current.actions.clearHistory();
      });

      expect(result.current.analysisHistory).toHaveLength(0);
    });
  });

  describe('node metrics', () => {
    it('should calculate parallelization opportunities', () => {
      const { result } = renderHook(() => usePerformanceProfileStore());

      let profile: ReturnType<typeof result.current.actions.analyzeWorkflow> | undefined;
      act(() => {
        profile = result.current.actions.analyzeWorkflow('workflow-10', mockNodes, mockEdges);
      });

      expect(profile!.parallelOpportunities).toBeGreaterThanOrEqual(0);
      profile!.nodeMetrics.forEach(metric => {
        expect(typeof metric.parallelizable).toBe('boolean');
      });
    });

    it('should calculate complexity for different node types', () => {
      const { result } = renderHook(() => usePerformanceProfileStore());

      let profile: ReturnType<typeof result.current.actions.analyzeWorkflow> | undefined;
      act(() => {
        profile = result.current.actions.analyzeWorkflow('workflow-11', mockNodes, mockEdges);
      });

      const llmMetric = profile!.nodeMetrics.find(m => m.nodeType === 'LLM');
      const httpRequestMetric = profile!.nodeMetrics.find(m => m.nodeType === 'HTTPRequest');

      if (llmMetric && httpRequestMetric) {
        expect(llmMetric.complexity).not.toBe(httpRequestMetric.complexity);
      }
    });

    it('should identify dependencies and dependents correctly', () => {
      const { result } = renderHook(() => usePerformanceProfileStore());

      let profile: ReturnType<typeof result.current.actions.analyzeWorkflow> | undefined;
      act(() => {
        profile = result.current.actions.analyzeWorkflow('workflow-12', mockNodes, mockEdges);
      });

      const node1Metric = profile!.nodeMetrics.find(m => m.nodeId === 'node1');
      const node4Metric = profile!.nodeMetrics.find(m => m.nodeId === 'node4');

      if (node1Metric && node4Metric) {
        expect(node1Metric.dependents).toBe(1);
        expect(node4Metric.dependencies).toBe(1);
      }
    });
  });
});
