import { create } from 'zustand';
import { produce } from 'immer';

export interface NodePerformanceMetrics {
  nodeId: string;
  nodeType: string;
  estimatedRuntime: number;
  memoryUsage: number;
  complexity: number;
  dependencies: number;
  dependents: number;
  parallelizable: boolean;
  suggestions: string[];
}

export interface WorkflowProfile {
  workflowId: string;
  timestamp: number;
  totalNodes: number;
  totalEstimatedRuntime: number;
  totalMemoryUsage: number;
  criticalPathLength: number;
  parallelOpportunities: number;
  bottlenecks: NodePerformanceMetrics[];
  nodeMetrics: NodePerformanceMetrics[];
  optimizationScore: number;
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
}

export interface PerformanceProfileState {
  currentProfile: WorkflowProfile | null;
  isAnalyzing: boolean;
  lastError: string | null;
  analysisHistory: WorkflowProfile[];
  actions: {
    analyzeWorkflow: (
      workflowId: string,
      nodes: Array<{ id: string; type: string; data: Record<string, unknown> }>,
      edges: Array<{ source: string; target: string }>
    ) => WorkflowProfile;
    clearProfile: () => void;
    addToHistory: (profile: WorkflowProfile) => void;
    clearHistory: () => void;
    setError: (error: string) => void;
    clearError: () => void;
  };
}

const calculateNodeComplexity = (
  nodeType: string,
  data: Record<string, unknown>
): number => {
  const baseComplexity: Record<string, number> = {
    'nodetool.llm.LLM': 5,
    'nodetool.embeddings.Embeddings': 3,
    'nodetool.image.ImageGen': 8,
    'nodetool.audio.AudioGen': 7,
    'nodetool.video.VideoGen': 10,
    'nodetool.text.TextGen': 4,
    'nodetool.io.HTTPRequest': 2,
    'nodetool.io.FileRead': 1,
    'nodetool.io.FileWrite': 1,
    'nodetool.control.ForEach': 6,
    'nodetool.control.If': 3,
    'nodetool.process.Processor': 4,
    'nodetool.vector.VectorStore': 5,
  };

  let complexity = baseComplexity[nodeType] || 2;

  if (data) {
    if (data.model && typeof data.model === 'string') {
      const largeModels = ['70b', '13b', '34b', 'embedding-large'];
      if (largeModels.some(m => data.model?.toString().includes(m))) {
        complexity *= 1.5;
      }
    }
    if (data.iterations && typeof data.iterations === 'number') {
      complexity *= Math.min(1 + (data.iterations / 100), 2);
    }
    if (data.batch_size && typeof data.batch_size === 'number') {
      complexity *= Math.min(1 + (data.batch_size / 50), 3);
    }
  }

  return Math.min(complexity, 20);
};

const estimateRuntime = (
  nodeType: string,
  complexity: number,
  data: Record<string, unknown>
): number => {
  const baseRuntimes: Record<string, number> = {
    'nodetool.llm.LLM': 2000,
    'nodetool.embeddings.Embeddings': 500,
    'nodetool.image.ImageGen': 5000,
    'nodetool.audio.AudioGen': 3000,
    'nodetool.video.VideoGen': 15000,
    'nodetool.text.TextGen': 1000,
    'nodetool.io.HTTPRequest': 200,
    'nodetool.io.FileRead': 50,
    'nodetool.io.FileWrite': 50,
    'nodetool.control.ForEach': 100,
    'nodetool.control.If': 10,
    'nodetool.process.Processor': 200,
    'nodetool.vector.VectorStore': 300,
  };

  let runtime = baseRuntimes[nodeType] || 100;

  if (data) {
    if (data.max_tokens && typeof data.max_tokens === 'number') {
      runtime *= 1 + (data.max_tokens / 1000);
    }
    if (data.guidance_scale && typeof data.guidance_scale === 'number') {
      runtime *= 1 + (data.guidance_scale / 10);
    }
  }

  return Math.round(runtime * (complexity / 2));
};

const estimateMemoryUsage = (
  nodeType: string,
  data: Record<string, unknown>
): number => {
  const baseMemory: Record<string, number> = {
    'nodetool.llm.LLM': 4000,
    'nodetool.embeddings.Embeddings': 2000,
    'nodetool.image.ImageGen': 3000,
    'nodetool.audio.AudioGen': 1500,
    'nodetool.video.VideoGen': 8000,
    'nodetool.text.TextGen': 500,
    'nodetool.io.HTTPRequest': 100,
    'nodetool.io.FileRead': 200,
    'nodetool.io.FileWrite': 200,
    'nodetool.control.ForEach': 100,
    'nodetool.control.If': 50,
    'nodetool.process.Processor': 500,
    'nodetool.vector.VectorStore': 3000,
  };

  let memory = baseMemory[nodeType] || 200;

  if (data && data.model && typeof data.model === 'string') {
    if (data.model.includes('70b') || data.model.includes('34b')) {
      memory *= 2;
    }
  }

  return memory;
};

const generateSuggestions = (
  metrics: NodePerformanceMetrics
): string[] => {
  const suggestions: string[] = [];

  if (metrics.dependencies > 3) {
    suggestions.push('High fan-in: Consider splitting input processing');
  }
  if (metrics.dependents > 3) {
    suggestions.push('High fan-out: Consider caching results or adding a buffer');
  }
  if (!metrics.parallelizable && metrics.dependencies < 2) {
    suggestions.push('Could potentially run in parallel with sibling nodes');
  }
  if (metrics.complexity > 10) {
    suggestions.push('High complexity node: Consider breaking into smaller steps');
  }
  if (metrics.estimatedRuntime > 10000) {
    suggestions.push('Long-running node: Consider adding progress updates');
  }
  if (metrics.memoryUsage > 5000) {
    suggestions.push('High memory usage: Consider streaming or chunked processing');
  }

  return suggestions;
};

const calculateGrade = (score: number): 'A' | 'B' | 'C' | 'D' | 'F' => {
  if (score >= 90) {return 'A';}
  if (score >= 75) {return 'B';}
  if (score >= 60) {return 'C';}
  if (score >= 40) {return 'D';}
  return 'F';
};

export const usePerformanceProfileStore = create<PerformanceProfileState>((set, get) => ({
  currentProfile: null,
  isAnalyzing: false,
  lastError: null,
  analysisHistory: [],

  actions: {
    analyzeWorkflow: (
      workflowId: string,
      nodes: Array<{ id: string; type: string; data: Record<string, unknown> }>,
      edges: Array<{ source: string; target: string }>
    ) => {
      try {
        set(produce((state: PerformanceProfileState) => {
          state.isAnalyzing = true;
          state.lastError = null;
        }));

        const nodeMap = new Map<string, { type: string; data: Record<string, unknown> }>();
        nodes.forEach(node => nodeMap.set(node.id, { type: node.type, data: node.data || {} }));

        const incomingEdges = new Map<string, string[]>();
        const outgoingEdges = new Map<string, string[]>();

        edges.forEach(edge => {
          const sources = incomingEdges.get(edge.target) || [];
          const targets = outgoingEdges.get(edge.source) || [];
          incomingEdges.set(edge.target, [...sources, edge.source]);
          outgoingEdges.set(edge.source, [...targets, edge.target]);
        });

        const nodeMetrics: NodePerformanceMetrics[] = nodes.map(node => {
          const dependencies = incomingEdges.get(node.id)?.length || 0;
          const dependents = outgoingEdges.get(node.id)?.length || 0;
          const complexity = calculateNodeComplexity(node.type, node.data);
          const estimatedRuntime = estimateRuntime(node.type, complexity, node.data);
          const memoryUsage = estimateMemoryUsage(node.type, node.data);

          const parallelizable = dependencies < 2 && node.type.includes('control') === false;

          return {
            nodeId: node.id,
            nodeType: node.type.split('.').pop() || node.type,
            estimatedRuntime,
            memoryUsage,
            complexity,
            dependencies,
            dependents,
            parallelizable,
            suggestions: generateSuggestions({
              nodeId: node.id,
              nodeType: node.type,
              estimatedRuntime,
              memoryUsage,
              complexity,
              dependencies,
              dependents,
              parallelizable,
              suggestions: [],
            }),
          };
        });

        const totalNodes = nodes.length;
        const totalEstimatedRuntime = nodeMetrics.reduce((sum, m) => sum + m.estimatedRuntime, 0);
        const totalMemoryUsage = nodeMetrics.reduce((sum, m) => sum + m.memoryUsage, 0);

        const sortedByRuntime = [...nodeMetrics].sort((a, b) => b.estimatedRuntime - a.estimatedRuntime);
        const criticalPathLength = sortedByRuntime.slice(0, Math.ceil(totalNodes * 0.2))
          .reduce((sum, m) => sum + m.estimatedRuntime, 0);

        const parallelOpportunities = nodeMetrics.filter(m => m.parallelizable && m.dependencies < 2).length;

        const bottlenecks = sortedByRuntime.slice(0, 5);

        const baseScore = 100;
        const runtimePenalty = Math.min(totalEstimatedRuntime / 1000, 30);
        const memoryPenalty = Math.min(totalMemoryUsage / 1000, 25);
        const bottleneckPenalty = bottlenecks.length > 0 ? bottlenecks.length * 5 : 0;
        const parallelBonus = Math.min(parallelOpportunities * 2, 15);

        const optimizationScore = Math.max(0, Math.min(100,
          baseScore - runtimePenalty - memoryPenalty - bottleneckPenalty + parallelBonus
        ));

        const profile: WorkflowProfile = {
          workflowId,
          timestamp: Date.now(),
          totalNodes,
          totalEstimatedRuntime,
          totalMemoryUsage,
          criticalPathLength,
          parallelOpportunities,
          bottlenecks,
          nodeMetrics,
          optimizationScore,
          grade: calculateGrade(optimizationScore),
        };

        set(produce((state: PerformanceProfileState) => {
          state.currentProfile = profile;
          state.isAnalyzing = false;
          state.analysisHistory.push(profile);
          if (state.analysisHistory.length > 10) {
            state.analysisHistory = state.analysisHistory.slice(-10);
          }
        }));

        return profile;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error during analysis';
        set(produce((state: PerformanceProfileState) => {
          state.lastError = errorMessage;
          state.isAnalyzing = false;
        }));
        throw error;
      }
    },

    clearProfile: () => {
      set(produce((state: PerformanceProfileState) => {
        state.currentProfile = null;
      }));
    },

    addToHistory: (profile: WorkflowProfile) => {
      set(produce((state: PerformanceProfileState) => {
        state.analysisHistory.push(profile);
        if (state.analysisHistory.length > 10) {
          state.analysisHistory = state.analysisHistory.slice(-10);
        }
      }));
    },

    clearHistory: () => {
      set(produce((state: PerformanceProfileState) => {
        state.analysisHistory = [];
      }));
    },

    setError: (error: string) => {
      set(produce((state: PerformanceProfileState) => {
        state.lastError = error;
      }));
    },

    clearError: () => {
      set(produce((state: PerformanceProfileState) => {
        state.lastError = null;
      }));
    },
  },
}));
