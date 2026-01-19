/**
 * WorkflowProfilerStore - Manages workflow performance analysis state.
 *
 * Provides:
 * - Execution time estimation based on node types
 * - Parallelization opportunity detection
 * - Bottleneck identification
 * - Resource usage visualization
 */

import { create } from "zustand";
import { Node, Edge } from "@xyflow/react";
import { NodeData } from "./NodeData";

export interface NodeProfile {
  nodeId: string;
  nodeType: string;
  estimatedTimeMs: number;
  isComputational: boolean;
  isParallelizable: boolean;
  dependencies: string[];
  dependents: string[];
  level: number;
}

export interface WorkflowProfile {
  totalNodes: number;
  estimatedTotalTimeMs: number;
  parallelizableNodes: number;
  sequentialNodes: number;
  maxDepth: number;
  bottleneckNodeIds: string[];
  parallelLayers: number;
  theoreticalSpeedup: number;
  nodes: NodeProfile[];
}

export interface ProfilerState {
  profile: WorkflowProfile | null;
  isAnalyzing: boolean;
  lastAnalyzedWorkflowId: string | null;
  error: string | null;

  analyzeWorkflow: (
    nodes: Node<NodeData>[],
    edges: Edge[],
    workflowId: string
  ) => void;

  clearProfile: () => void;
}

const NODE_TIME_ESTIMATES: Record<string, number> = {
  "nodetool.input.StringInput": 1,
  "nodetool.input.IntegerInput": 1,
  "nodetool.input.FloatInput": 1,
  "nodetool.input.BooleanInput": 1,
  "nodetool.input.ImageInput": 5,
  "nodetool.input.AudioInput": 5,
  "nodetool.input.FileInput": 10,
  "nodetool.input.FolderInput": 10,
  "nodetool.output.Output": 1,
  "nodetool.output.ImageOutput": 2,
  "nodetool.output.AudioOutput": 2,
  "nodetool.output.TextOutput": 2,
  "nodetool.processing.Combine": 20,
  "nodetool.processing.Split": 20,
  "nodetool.processing.Resize": 50,
  "nodetool.processing.Crop": 50,
  "nodetool.processing.Filter": 100,
  "nodetool.processing.Transform": 100,
  "nodetool.llm.LLM": 2000,
  "nodetool.llm.Chat": 2000,
  "nodetool.embedding.Embedding": 500,
  "nodetool.vision.OCR": 300,
  "nodetool.vision.ObjectDetection": 400,
  "nodetool.vision.ImageClassification": 300,
  "nodetool.vision.FaceDetection": 400,
  "nodetool.audio.SpeechToText": 1000,
  "nodetool.audio.TextToSpeech": 800,
  "nodetool.audio.NoiseReduction": 200,
  "nodetool.text.TextProcessing": 100,
  "nodetool.text.SentimentAnalysis": 150,
  "nodetool.text.Summarization": 300,
  "nodetool.text.Translation": 400,
  "nodetool.control.Loop": 500,
  "nodetool.control.Condition": 10,
  "nodetool.control.Branch": 10,
  "nodetool.control.Parallel": 5,
  "nodetool.control.Sequence": 5,
};

const COMPUTATIONAL_NODE_TYPES = new Set([
  "nodetool.processing",
  "nodetool.llm",
  "nodetool.embedding",
  "nodetool.vision",
  "nodetool.audio",
  "nodetool.text",
]);

const PARALLELIZABLE_NODE_TYPES = new Set([
  "nodetool.processing.Combine",
  "nodetool.processing.Split",
  "nodetool.processing.Resize",
  "nodetool.processing.Crop",
  "nodetool.processing.Filter",
  "nodetool.processing.Transform",
  "nodetool.vision.OCR",
  "nodetool.vision.ObjectDetection",
  "nodetool.vision.ImageClassification",
  "nodetool.vision.FaceDetection",
  "nodetool.audio.NoiseReduction",
  "nodetool.text.TextProcessing",
  "nodetool.text.SentimentAnalysis",
  "nodetool.text.Summarization",
  "nodetool.text.Translation",
]);

function getNodeTimeEstimate(nodeType: string): number {
  if (NODE_TIME_ESTIMATES[nodeType]) {
    return NODE_TIME_ESTIMATES[nodeType];
  }
  if (COMPUTATIONAL_NODE_TYPES.has(nodeType.split(".")[1])) {
    return 200;
  }
  return 10;
}

function isComputationalNode(nodeType: string): boolean {
  if (NODE_TIME_ESTIMATES[nodeType] && NODE_TIME_ESTIMATES[nodeType] > 50) {
    return true;
  }
  const category = nodeType.split(".")[1];
  return COMPUTATIONAL_NODE_TYPES.has(category);
}

function isParallelizable(nodeType: string): boolean {
  return PARALLELIZABLE_NODE_TYPES.has(nodeType);
}

function calculateNodeLevels(
  nodes: Node<NodeData>[],
  edges: Edge[]
): Map<string, number> {
  const levels = new Map<string, number>();
  const adjList = new Map<string, string[]>();
  const reverseAdj = new Map<string, string[]>();

  nodes.forEach((node) => {
    adjList.set(node.id, []);
    reverseAdj.set(node.id, []);
  });

  edges.forEach((edge) => {
    if (adjList.has(edge.source) && adjList.has(edge.target)) {
      adjList.get(edge.source)!.push(edge.target);
      reverseAdj.get(edge.target)!.push(edge.source);
    }
  });

  const queue: { id: string; level: number }[] = [];

  reverseAdj.forEach((parents, nodeId) => {
    if (parents.length === 0) {
      levels.set(nodeId, 0);
      queue.push({ id: nodeId, level: 0 });
    }
  });

  while (queue.length > 0) {
    const { id, level } = queue.shift()!;

    adjList.get(id)?.forEach((childId) => {
      const newLevel = level + 1;
      const existingLevel = levels.get(childId) ?? -1;
      if (newLevel > existingLevel) {
        levels.set(childId, newLevel);
        queue.push({ id: childId, level: newLevel });
      }
    });
  }

  levels.forEach((level, nodeId) => {
    if (level === -1) {
      levels.set(nodeId, 0);
    }
  });

  return levels;
}

function buildDependencyGraph(
  nodes: Node<NodeData>[],
  edges: Edge[]
): Map<string, { dependencies: string[]; dependents: string[] }> {
  const deps = new Map<
    string,
    { dependencies: string[]; dependents: string[] }
  >();

  nodes.forEach((node) => {
    deps.set(node.id, { dependencies: [], dependents: [] });
  });

  edges.forEach((edge) => {
    if (deps.has(edge.target) && deps.has(edge.source)) {
      const target = deps.get(edge.target)!;
      const source = deps.get(edge.source)!;
      target.dependencies.push(edge.source);
      source.dependents.push(edge.target);
    }
  });

  return deps;
}

export const useProfilerStore = create<ProfilerState>((set, get) => ({
  profile: null,
  isAnalyzing: false,
  lastAnalyzedWorkflowId: null,
  error: null,

  analyzeWorkflow: (
    nodes: Node<NodeData>[],
    edges: Edge[],
    workflowId: string
  ) => {
    set({ isAnalyzing: true, error: null });

    try {
      if (nodes.length === 0) {
        set({
          profile: null,
          isAnalyzing: false,
          lastAnalyzedWorkflowId: workflowId,
        });
        return;
      }

      const nodeLevels = calculateNodeLevels(nodes, edges);
      const dependencyGraph = buildDependencyGraph(nodes, edges);
      const maxDepth = Math.max(...nodeLevels.values(), 0);

      const nodeProfiles: NodeProfile[] = nodes.map((node) => {
        const nodeType = node.type ?? "unknown";
        const timeEstimate = getNodeTimeEstimate(nodeType);
        const isComputational = isComputationalNode(nodeType);
        const isParallel = isParallelizable(nodeType);
        const level = nodeLevels.get(node.id) ?? 0;
        const nodeDeps = dependencyGraph.get(node.id);

        return {
          nodeId: node.id,
          nodeType,
          estimatedTimeMs: timeEstimate,
          isComputational,
          isParallelizable: isParallel && level > 0,
          dependencies: nodeDeps?.dependencies ?? [],
          dependents: nodeDeps?.dependents ?? [],
          level,
        };
      });

      const parallelLayers = maxDepth + 1;
      const sequentialTime = nodeProfiles.reduce((sum, p) => sum + p.estimatedTimeMs, 0);

      const parallelTimeByLevel: number[] = new Array(parallelLayers).fill(0);
      nodeProfiles.forEach((profile) => {
        const level = profile.level;
        parallelTimeByLevel[level] = Math.max(
          parallelTimeByLevel[level],
          profile.estimatedTimeMs
        );
      });
      const parallelTime = parallelTimeByLevel.reduce((sum, t) => sum + t, 0);
      const theoreticalSpeedup = parallelTime > 0 ? sequentialTime / parallelTime : 1;

      const bottleneckThreshold = sequentialTime * 0.2;
      const bottleneckNodeIds = nodeProfiles
        .filter((p) => p.estimatedTimeMs >= bottleneckThreshold)
        .map((p) => p.nodeId);

      const profile: WorkflowProfile = {
        totalNodes: nodes.length,
        estimatedTotalTimeMs: parallelTime,
        parallelizableNodes: nodeProfiles.filter((p) => p.isParallelizable).length,
        sequentialNodes: nodeProfiles.filter((p) => !p.isParallelizable).length,
        maxDepth,
        bottleneckNodeIds,
        parallelLayers,
        theoreticalSpeedup: Math.round(theoreticalSpeedup * 100) / 100,
        nodes: nodeProfiles,
      };

      set({
        profile,
        isAnalyzing: false,
        lastAnalyzedWorkflowId: workflowId,
      });
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : "Unknown error",
        isAnalyzing: false,
      });
    }
  },

  clearProfile: () => {
    set({ profile: null, lastAnalyzedWorkflowId: null, error: null });
  },
}));
